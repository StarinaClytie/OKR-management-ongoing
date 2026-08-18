// Admin-only edge function: offboard (delete) an organization member.
//
// IMPORTANT — why this does NOT call `auth.admin.deleteUser`:
//
// `public.profiles.id` is `references auth.users(id) on delete cascade`, so a
// hard Auth deletion would cascade-delete the profile row. That profile is the
// target of many `on delete restrict` foreign keys that preserve historical
// business records (`projects.leader_id`, `objectives.owner_id`,
// `key_results.owner_id`, `risks.owner_id`, `daily_reports.author_id`,
// `daily_report_revisions.editor_id`, `report_attachments.uploader_id`,
// `collaboration_links.grantor_id`). Hard deletion therefore either fails
// outright with a foreign-key violation, or would force destructive cascades
// that erase historical reporting/project attribution.
//
// Preferred behavior (per requirements): remove authentication access safely
// while preserving history. This function therefore:
//   1. bans the auth user (`auth.admin.updateUserById` with a permanent
//      `ban_duration`) so they can no longer sign in, and
//   2. deactivates the profile + role via the existing org-scoped
//      `set_user_active` RPC (which already enforces administrator-only,
//      same-organization, and no-self-deactivate).
//
// No historical business record is touched. The auth user, profile, and role
// rows all remain, so reporting and project attribution stay intact.
//
// Security mirrors `admin-invite-user`: caller JWT verified, caller must be an
// active administrator, service role used server-side only, and the
// organization identity is derived from the caller's own auth identity (never
// from the request body).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ~100 years — the standard "permanent" Supabase Auth ban.
const PERMANENT_BAN_DURATION = '876000h';

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

  // 3. Parse the target id and reject self-delete. Organization identity never
  //    comes from the request body.
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
  if (userId === caller.id) {
    return json({ ok: false, code: 'self_delete' });
  }

  // 4. Confirm the target belongs to the caller's organization through RLS.
  const { data: targetProfile, error: targetProfileError } = await callerClient
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (targetProfileError || !targetProfile) {
    return json({ ok: false, code: 'forbidden' });
  }

  // 5. Service role — revoke authentication access by banning the auth user.
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN_DURATION,
  });
  if (banError) {
    return json({ ok: false, code: 'network' });
  }

  // 6. Deactivate the profile + role through the caller's own identity so the
  //    organization and administrator checks are enforced by RLS/RPC (and a
  //    self-deactivate remains impossible). This preserves every record.
  const { error: deactivateError } = await callerClient.rpc('set_user_active', {
    p_target_user_id: userId,
    p_is_active: false,
  });
  if (deactivateError) {
    // set_user_active raises 22023 for self-deactivation and 42501 for
    // non-admin / cross-organization.
    if (deactivateError.code === '22023') return json({ ok: false, code: 'self_delete' });
    if (deactivateError.code === '42501') return json({ ok: false, code: 'forbidden' });
    return json({ ok: false, code: 'network' });
  }

  return json({
    ok: true,
    outcome: 'deleted',
    userId,
    authenticationRevoked: true,
    recordsPreserved: true,
  });
});
