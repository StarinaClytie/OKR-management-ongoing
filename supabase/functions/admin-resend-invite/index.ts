// Admin-only edge function: resend an invitation / password-setup email to an
// organization member who has not yet completed onboarding.
//
// An invited user is provisioned into `profiles` + `user_roles` the moment the
// administrator sends the invitation, so they already appear under Organization
// Users before they accept it. If the invite/setup link is lost or expires, this
// function issues a fresh email to the *same* auth account — it never creates a
// duplicate auth user, profile, or role.
//
// Onboarding completion is the application-owned `profiles.onboarding_completed`
// flag, NOT `auth.users.email_confirmed_at` (Supabase confirms the email as soon
// as the invite link is clicked, before password setup finishes). Dispatch:
//
//   Case A — email_confirmed_at IS NULL and onboarding_completed IS FALSE:
//            a never-confirmed invitee. Reissue `auth.admin.inviteUserByEmail`
//            (it reissues the confirmation token and re-sends the invite).
//   Case B — email_confirmed_at IS SET  and onboarding_completed IS FALSE:
//            a confirmed-but-incomplete user (clicked the link, never set a
//            password). `inviteUserByEmail` rejects an already-confirmed user,
//            so send a password-setup/recovery email via `resetPasswordForEmail`.
//            The resulting link lands on the same `/auth/invite` setup flow and,
//            after `auth.updateUser({ password })`, completes onboarding.
//   Case C — onboarding_completed IS TRUE: return `already_completed`; never
//            send another onboarding email.
//
// Security mirrors `admin-invite-user`:
//   1. verifies the caller's JWT (anon key + Authorization),
//   2. confirms the caller is an *active* administrator through RLS,
//   3. confirms the target profile belongs to the caller's organization through
//      RLS (the organization identity is never taken from the request body),
//   4. reads the target's onboarding state from the application-owned
//      `profiles.onboarding_completed`, not from `email_confirmed_at`,
//   5. uses the service-role key (server-side only) to send the email.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { classifyInviteError } from '../_shared/classifyInviteError.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCTION_ORIGIN = 'https://okr.groupmeeting.xyz';
const ALLOWED_ORIGINS = new Set([
  PRODUCTION_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

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
    return json({ ok: false, code: 'unauthorized' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ ok: false, code: 'network' }, 500);
  }

  // 1. Verify the caller's JWT using their own identity (anon key + Authorization).
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user: caller }, error: userError } = await callerClient.auth.getUser();
  if (userError || !caller) {
    return json({ ok: false, code: 'unauthorized' });
  }

  // 2. Confirm the caller is an active administrator through RLS.
  const { data: roles, error: rolesError } = await callerClient
    .from('user_roles')
    .select('role')
    .eq('profile_id', caller.id)
    .eq('is_active', true);
  if (rolesError || !Array.isArray(roles) || !roles.some((row) => row.role === 'administrator')) {
    return json({ ok: false, code: 'forbidden' });
  }

  // 3. Parse the target id. Organization identity never comes from the body.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'forbidden' });
  }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    return json({ ok: false, code: 'forbidden' });
  }

  // 4. Confirm the target belongs to the caller's organization and read its
  //    application-owned onboarding state. `profiles` RLS lets an active
  //    administrator read any member of their own organization, so a missing row
  //    means the target is not in this organization.
  const { data: targetProfile, error: targetProfileError } = await callerClient
    .from('profiles')
    .select('id,onboarding_completed')
    .eq('id', userId)
    .maybeSingle();
  if (targetProfileError || !targetProfile) {
    return json({ ok: false, code: 'forbidden' });
  }

  // Case C — onboarding already complete; no email is sent.
  if (targetProfile.onboarding_completed === true) {
    return json({ ok: true, outcome: 'already_completed', userId, email: '', invitationSent: false });
  }

  // 5. Read the target's authoritative auth state with the service role to learn
  //    whether their email has already been confirmed.
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userList, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return json({ ok: false, code: 'network' });
  }
  const authUser = (userList?.users ?? []).find((candidate) => candidate.id === userId);
  if (!authUser) {
    return json({ ok: false, code: 'forbidden' });
  }

  const email = authUser.email ?? '';
  if (!email) {
    return json({ ok: false, code: 'forbidden' });
  }

  // 6. Derive the setup redirect from an allowlist; never trust the body.
  const origin = req.headers.get('Origin') ?? '';
  const redirectTo = `${ALLOWED_ORIGINS.has(origin) ? origin : PRODUCTION_ORIGIN}/auth/invite`;

  // 7. Dispatch on the email-confirmation state.
  if (!authUser.email_confirmed_at) {
    // Case A — never confirmed. Supabase's admin invite endpoint resends the
    // invite for an unconfirmed user (reissuing the confirmation token), so no
    // duplicate auth user / profile / role is created.
    const { error: resendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (resendError) {
      const message = (resendError.message ?? '').toLowerCase();
      // The user was confirmed since we enumerated them, so no invite is needed.
      if (message.includes('already been registered') || message.includes('already been invited')) {
        return json({ ok: true, outcome: 'already_completed', userId, email, invitationSent: false });
      }
      return json({ ok: false, code: classifyInviteError(resendError.message) });
    }
    return json({ ok: true, outcome: 'resent', userId, email, invitationSent: true });
  }

  // Case B — email confirmed but onboarding incomplete. `inviteUserByEmail`
  // rejects an already-confirmed user, so send a supported password-setup /
  // recovery email instead. `resetPasswordForEmail` is the client-side recovery
  // API (no service-role secret is required or exposed); it is invoked here, on
  // the server, so the browser never drives it directly.
  const { error: recoveryError } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (recoveryError) {
    return json({ ok: false, code: classifyInviteError(recoveryError.message) });
  }
  return json({ ok: true, outcome: 'resent', userId, email, invitationSent: true });
});
