// Admin-only edge function: invite a new employee and provision them.
//
// The browser holds only the publishable anon key and must never touch
// `auth.admin` or the service-role key. This function:
//   1. verifies the caller's JWT (anon key + Authorization),
//   2. confirms the caller is an *active* administrator through RLS,
//   3. validates the invite payload,
//   4. uses the service-role key (server-side only) to check for an existing
//      auth user / profile and to send the invitation via
//      `auth.admin.inviteUserByEmail`,
//   5. provisions the profile + role atomically by reusing the existing
//      SECURITY DEFINER RPC `approve_pending_user` — called through the
//      caller's own identity so the organization is derived from `auth.uid()`,
//      never from the request body.
//
// Because the Auth Admin API and Postgres are not one transaction, this is
// deliberately idempotent and compensating: a user left without a profile
// (invite succeeded but provisioning failed) is recovered on the next invite
// of the same email, and duplicate profiles/roles are impossible because
// `approve_pending_user` raises 23505 on an existing profile.

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

const ROLES = ['administrator', 'management', 'project_leader', 'employee', 'hr'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
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

  // 2. Confirm the caller is an active administrator through RLS (no service role).
  //    Deactivation flips `user_roles.is_active`, so this also rejects inactive admins.
  const { data: roles, error: rolesError } = await callerClient
    .from('user_roles')
    .select('role')
    .eq('profile_id', caller.id)
    .eq('is_active', true);
  if (rolesError || !Array.isArray(roles) || !roles.some((row) => row.role === 'administrator')) {
    return json({ ok: false, code: 'forbidden' });
  }

  // 3. Parse and validate the payload.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'invalid_email' });
  }
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const department = typeof body.department === 'string' ? body.department.trim() : '';
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  if (displayName === '' || !EMAIL_RE.test(email) || !(ROLES as readonly string[]).includes(role)) {
    return json({ ok: false, code: 'invalid_email' });
  }

  // 4. Derive the invitation redirect from an allowlist; never trust the body.
  const origin = req.headers.get('Origin') ?? '';
  const redirectTo = `${ALLOWED_ORIGINS.has(origin) ? origin : PRODUCTION_ORIGIN}/auth/invite`;

  // 5. Service role — enumerate auth users and profiles to classify this email.
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profileRows, error: profilesError } = await adminClient.from('profiles').select('id,email');
  if (profilesError) {
    return json({ ok: false, code: 'network' });
  }
  const profiles = (profileRows ?? []) as Array<{ id: string; email: string }>;
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const emailAlreadyOwned = profiles.some((profile) => normalizeEmail(profile.email ?? '') === email);

  const { data: userList, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return json({ ok: false, code: 'network' });
  }
  const existingAuthUser = (userList?.users ?? []).find((authUser) => normalizeEmail(authUser.email ?? '') === email);

  // Provision the profile + role atomically in the caller admin's organization.
  // Returns null on success or the RPC error. Because the Auth Admin API and
  // Postgres are not one transaction, a successful `inviteUserByEmail` can be
  // followed by a provisioning failure — the dangerous partial-success case
  // (email link is usable, but no profile/role). Deterministic compensation:
  // retry once to absorb a transient failure, then surface a specific
  // `provisioning_failed` result the administrator can act on. 23505 ("profile
  // already exists") is passed through so callers can treat it as the idempotent
  // already-provisioned case, never as a new duplicate.
  const provision = async (userId: string): Promise<{ code?: string; message: string } | null> => {
    let lastError: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await callerClient.rpc('approve_pending_user', {
        p_target_user_id: userId,
        p_display_name: displayName,
        p_email: email,
        p_department: department,
        p_job_title: jobTitle,
        p_role: role,
      });
      if (!error) return null;
      lastError = error;
      if (error.code === '23505') return error;
    }
    return lastError;
  };

  // 6. Dispatch on the existing state.
  if (emailAlreadyOwned || (existingAuthUser && profileIds.has(existingAuthUser.id))) {
    return json({ ok: true, outcome: 'already_member', email });
  }

  if (existingAuthUser) {
    // Recovery: the auth user exists but has no profile. Complete it; never create
    // a duplicate. If they already confirmed their email, no invitation is needed.
    const provisionError = await provision(existingAuthUser.id);
    if (provisionError) {
      if (provisionError.code === '23505') return json({ ok: true, outcome: 'already_member', email });
      return json({ ok: false, code: 'provisioning_failed' });
    }

    if (existingAuthUser.email_confirmed_at) {
      return json({ ok: true, outcome: 'recovered', userId: existingAuthUser.id, email, invitationSent: false });
    }

    // Re-invite an existing unconfirmed user. Supabase Auth's admin invite
    // endpoint resends the invite for an unconfirmed user (it reissues the
    // confirmation token and re-sends the email), so this is the supported
    // recovery path. A failure here must never be reported as success.
    const { error: resendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: displayName, department, job_title: jobTitle, role },
    });
    if (resendError) {
      const message = (resendError.message ?? '').toLowerCase();
      // The user was confirmed since we enumerated them, so no invite is needed.
      if (message.includes('already been registered')) {
        return json({ ok: true, outcome: 'recovered', userId: existingAuthUser.id, email, invitationSent: false });
      }
      return json({ ok: false, code: 'recovery_invite_failed' });
    }

    return json({ ok: true, outcome: 'recovered', userId: existingAuthUser.id, email, invitationSent: true });
  }

  // New user: invite first, then provision.
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { display_name: displayName, department, job_title: jobTitle, role },
  });
  if (inviteError || !inviteData?.user) {
    const message = (inviteError?.message ?? '').toLowerCase();
    if (message.includes('already been registered') || message.includes('already been invited')) {
      return json({ ok: true, outcome: 'already_member', email });
    }
    return json({ ok: false, code: classifyInviteError(inviteError?.message) });
  }

  const newUserId = inviteData.user.id;
  const provisionError = await provision(newUserId);
  if (provisionError) {
    if (provisionError.code === '23505') return json({ ok: true, outcome: 'already_member', email });
    return json({ ok: false, code: 'provisioning_failed' });
  }

  return json({ ok: true, outcome: 'invited', userId: newUserId, email, invitationSent: true });
});
