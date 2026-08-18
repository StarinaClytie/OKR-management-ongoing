// Resource problem notification (server-side, idempotent email delivery).
//
// The browser holds only the publishable anon key. It first persists the problem
// (and a pending notification record) through `report_resource_problem`, then
// asks this function to attempt delivery. The recipient is ALWAYS resolved
// server-side from the resource's owner — the caller can only name a
// notificationId, never an email address — and the caller must belong to the
// same organization as the problem.
//
// Delivery is at-most-once and recoverable:
//   * an atomic claim (`claim_resource_problem_notification`) flips the
//     notification to `sending`; a concurrent invocation observes `in_progress`
//     and a previously-sent notification observes `sent` (returned as
//     delivered=true), so no duplicate email is ever produced,
//   * a delivery failure (or a missing email provider) NEVER touches the
//     problem row: it only marks the notification `failed` with a generic
//     error_code, so the problem remains persisted and the notification can be
//     retried later through `retry_resource_problem_notification`.
//
// Email transport is isolated behind `sendTransactionalEmail` (see
// `_shared/email.ts`); this business logic is provider-agnostic.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendTransactionalEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCTION_ORIGIN = 'https://okr.groupmeeting.xyz';

const PROBLEM_TYPE_LABELS: Record<string, string> = {
  location_incorrect: 'Location incorrect',
  missing: 'Missing',
  damaged: 'Damaged',
  malfunction: 'Malfunction',
  quantity_incorrect: 'Incorrect quantity',
  manual_issue: 'Manual/instructions issue',
  other: 'Other',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, delivered: false, code: 'unauthorized' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ ok: false, delivered: false, code: 'network' }, 500);
  }

  // Verify the caller's JWT using their own identity.
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user: caller }, error: userError } = await callerClient.auth.getUser();
  if (userError || !caller) {
    return json({ ok: false, delivered: false, code: 'unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, delivered: false, code: 'network' });
  }
  const notificationId = typeof body.notificationId === 'string' ? body.notificationId : '';
  if (notificationId === '') {
    return json({ ok: false, delivered: false, code: 'network' });
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the notification server-side.
  const { data: notification, error: notificationError } = await adminClient
    .from('resource_problem_notifications')
    .select('id,organization_id,problem_id,recipient_id,status')
    .eq('id', notificationId)
    .maybeSingle();
  if (notificationError || !notification) {
    return json({ ok: false, delivered: false, code: 'not_found' });
  }

  // The caller must belong to the same organization as the problem.
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from('profiles')
    .select('organization_id')
    .eq('id', caller.id)
    .maybeSingle();
  if (callerProfileError || !callerProfile || callerProfile.organization_id !== notification.organization_id) {
    return json({ ok: false, delivered: false, code: 'forbidden' });
  }

  // Atomic claim: pending/failed are claimed; a sent notification short-circuits
  // to delivered; a live concurrent delivery is left untouched.
  const { data: claimResult, error: claimError } = await adminClient
    .rpc('claim_resource_problem_notification', { p_notification_id: notificationId });
  if (claimError) {
    return json({ ok: false, delivered: false, code: 'not_found' });
  }
  const claim = claimResult as string;
  if (claim === 'sent') {
    return json({ ok: true, delivered: true, code: 'already_sent' });
  }
  if (claim === 'in_progress') {
    return json({ ok: false, delivered: false, code: 'in_progress' });
  }

  // Resolve the problem, resource, owner email, and reporter name server-side.
  const { data: problem, error: problemError } = await adminClient
    .from('resource_problems')
    .select('resource_id,problem_type,description,reporter_id')
    .eq('id', notification.problem_id)
    .maybeSingle();
  if (problemError || !problem) {
    return json({ ok: false, delivered: false, code: 'not_found' });
  }

  const { data: resource, error: resourceError } = await adminClient
    .from('resources')
    .select('name,owner_id')
    .eq('id', problem.resource_id)
    .maybeSingle();
  if (resourceError || !resource) {
    return json({ ok: false, delivered: false, code: 'not_found' });
  }

  const { data: owner, error: ownerError } = await adminClient
    .from('profiles')
    .select('email,display_name')
    .eq('id', resource.owner_id)
    .maybeSingle();
  if (ownerError || !owner || !owner.email || owner.email.trim() === '') {
    await adminClient.from('resource_problem_notifications')
      .update({ status: 'failed', error_code: 'owner_email_missing' })
      .eq('id', notificationId);
    return json({ ok: false, delivered: false, code: 'owner_email_missing' });
  }

  const { data: reporter, error: reporterError } = await adminClient
    .from('profiles')
    .select('display_name')
    .eq('id', problem.reporter_id)
    .maybeSingle();
  const reporterName = (reporterError || !reporter) ? '' : (reporter.display_name ?? '');

  const appUrl = Deno.env.get('RESOURCE_APP_URL') ?? PRODUCTION_ORIGIN;
  const deepLink = `${appUrl}/resources/${problem.resource_id}`;
  const subject = `[Northstar OKR] Resource problem reported: ${resource.name}`;
  const text = [
    'A problem has been reported for a resource you are responsible for.',
    '',
    `Resource: ${resource.name}`,
    `Problem: ${PROBLEM_TYPE_LABELS[problem.problem_type] ?? problem.problem_type}`,
    `Reported by: ${reporterName || 'Unknown'}`,
    '',
    `Description: ${problem.description ?? ''}`,
    '',
    `Open resource: ${deepLink}`,
  ].join('\n');

  const sent = await sendTransactionalEmail({ to: owner.email, subject, text });
  if (!sent.ok) {
    await adminClient.from('resource_problem_notifications')
      .update({ status: 'failed', error_code: sent.code })
      .eq('id', notificationId);
    return json({ ok: false, delivered: false, code: sent.code });
  }

  await adminClient.from('resource_problem_notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_code: null })
    .eq('id', notificationId);

  return json({ ok: true, delivered: true, code: 'sent' });
});
