// Admin-only edge function: list unassigned `auth.users` plus each member's
// authoritative onboarding-completion state.
//
// The browser holds only the publishable anon key and cannot read `auth.users`.
// This function verifies the caller's JWT, confirms they are an administrator of
// their organization (through RLS using their own identity), then uses the
// service-role key — available only as a server-side secret — to read auth.users
// and return two strictly sanitized collections:
//   - `pendingUsers`: auth users who have no profile yet (unassigned), and
//   - `onboardingStates`: for each member of the caller's organization, whether
//     onboarding is complete (`onboardingCompleted`), taken from the
//     application-owned `profiles.onboarding_completed` flag — NOT from
//     `auth.users.email_confirmed_at`, which is set before password setup
//     finishes and so cannot distinguish "pending onboarding" from "active".
//
// It never returns encrypted_password, recovery tokens, raw metadata, or any
// other auth secret.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ ok: false, code: 'network' }, 500);
  }

  // Verify the caller's JWT using their own identity (anon key + Authorization).
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return json({ ok: false, code: 'unauthorized' });
  }

  // Confirm the caller is an administrator through RLS (no service role here).
  const { data: roles, error: rolesError } = await callerClient
    .from('user_roles')
    .select('role')
    .eq('profile_id', user.id)
    .eq('is_active', true);
  if (rolesError || !Array.isArray(roles) || !roles.some((row) => row.role === 'administrator')) {
    return json({ ok: false, code: 'forbidden' });
  }

  // The caller's organization, derived from their own identity through RLS.
  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  if (callerProfileError || !callerProfile || typeof callerProfile.organization_id !== 'string') {
    return json({ ok: false, code: 'network' });
  }
  const callerOrgId = callerProfile.organization_id as string;

  // From here on use the service role only to enumerate auth.users and profiles.
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: profilesError } = await adminClient.from('profiles').select('id,organization_id,onboarding_completed');
  if (profilesError) {
    return json({ ok: false, code: 'network' });
  }

  const assignedIds = new Set<string>();
  const organizationById = new Map<string, string>();
  const onboardingCompletedById = new Map<string, boolean>();
  for (const profile of profiles ?? []) {
    if (typeof profile.id === 'string') {
      assignedIds.add(profile.id);
      onboardingCompletedById.set(profile.id, profile.onboarding_completed === true);
    }
    if (typeof profile.id === 'string' && typeof profile.organization_id === 'string') {
      organizationById.set(profile.id, profile.organization_id);
    }
  }

  const { data: userList, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return json({ ok: false, code: 'network' });
  }

  const pendingUsers = (userList?.users ?? [])
    .filter((authUser) => !assignedIds.has(authUser.id))
    .map((authUser) => ({
      id: authUser.id,
      email: authUser.email ?? '',
      createdAt: authUser.created_at ?? '',
      lastSignInAt: authUser.last_sign_in_at ?? null,
    }));

  // Onboarding-completion state for members of the caller's organization only,
  // from the application-owned `profiles.onboarding_completed` flag. Never leak
  // profile state for members of other organizations.
  const onboardingStates = (userList?.users ?? [])
    .filter((authUser) => organizationById.get(authUser.id) === callerOrgId)
    .map((authUser) => ({
      id: authUser.id,
      onboardingCompleted: onboardingCompletedById.get(authUser.id) === true,
    }));

  return json({ ok: true, pendingUsers, onboardingStates });
});
