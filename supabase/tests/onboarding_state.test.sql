begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Onboarding state model: `profiles.onboarding_completed` is the application-owned
-- truth of whether a member finished account setup. It is NOT derived from
-- `auth.users.email_confirmed_at` (Supabase confirms the email as soon as the
-- invite link is clicked, before a password is chosen).
-- ---------------------------------------------------------------------------

-- Fixtures: an administrator, an employee, and an employee who was deactivated
-- before accepting the invitation. The first two arrive with
-- email_confirmed_at already set (they clicked the invite link), yet none has
-- completed onboarding.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000001',
  id,
  'authenticated',
  'authenticated',
  email,
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (values
  ('13000000-0000-0000-0000-000000000001'::uuid, 'onboarding-admin@lifecycle.test'),
  ('13000000-0000-0000-0000-000000000002'::uuid, 'onboarding-employee@lifecycle.test'),
  ('13000000-0000-0000-0000-000000000003'::uuid, 'onboarding-inactive@lifecycle.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000031', 'Onboarding Organization');

insert into public.profiles (id, organization_id, display_name, is_active) values
  ('13000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000031', 'Onboarding Admin', true),
  ('13000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000031', 'Onboarding Employee', true),
  ('13000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000031', 'Deactivated Before Acceptance', false);

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('20000000-0000-0000-0000-000000000031', '13000000-0000-0000-0000-000000000001', 'administrator', true),
  ('20000000-0000-0000-0000-000000000031', '13000000-0000-0000-0000-000000000002', 'employee', true),
  ('20000000-0000-0000-0000-000000000031', '13000000-0000-0000-0000-000000000003', 'employee', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);

-- 1. Newly provisioned users start onboarding-incomplete, even when their email
--    is already confirmed.
select is(
  (select onboarding_completed from public.profiles where id = '13000000-0000-0000-0000-000000000001'),
  false,
  'newly provisioned profile defaults onboarding_completed to false'
);
select is(
  (select onboarding_completed from public.profiles where id = '13000000-0000-0000-0000-000000000002'),
  false,
  'email_confirmed_at alone does not mark onboarding complete'
);

-- 2. A role is provisioned at invitation time, before the invitee has accepted.
select is(
  (select role::text from public.user_roles where profile_id = '13000000-0000-0000-0000-000000000002'),
  'employee',
  'role already exists before invite acceptance'
);

-- 3. complete_onboarding() marks only the caller's own profile (scoped to
--    auth.uid()); it can never mark another user.
select lives_ok(
  $$select public.complete_onboarding()$$,
  'complete_onboarding() runs for the authenticated caller'
);
select is(
  (select onboarding_completed from public.profiles where id = '13000000-0000-0000-0000-000000000001'),
  true,
  'complete_onboarding() marks the caller onboarding complete'
);
select is(
  (select onboarding_completed from public.profiles where id = '13000000-0000-0000-0000-000000000002'),
  false,
  'complete_onboarding() cannot mark another user onboarding complete'
);

-- 4. The profile/role resolution path does not gate on onboarding_completed:
--    onboarding is surfaced to the UI separately, not by locking the dashboard.
select is(
  (public.get_my_profile_state())->>'state',
  'active',
  'an active profile is still resolved as active regardless of onboarding_completed'
);

-- ---------------------------------------------------------------------------
-- Section 19 / 28: completing auth must never reactivate a deactivated account.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);
select is(
  (public.get_my_profile_state())->>'state',
  'inactive',
  'a deactivated invitee reports an inactive state, not active or unassigned'
);
select lives_ok(
  $$select public.complete_onboarding()$$,
  'complete_onboarding() still runs for a deactivated invitee (it only sets the flag)'
);
-- A deactivated user cannot read their own profile through RLS (the profile
-- read collapses `private.current_organization_id()` to null), so assert the raw
-- profile rows through the active administrator's RLS context instead.
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select is(
  (select onboarding_completed from public.profiles where id = '13000000-0000-0000-0000-000000000003'),
  true,
  'complete_onboarding() sets the flag even for a deactivated account'
);
select is(
  (select is_active from public.profiles where id = '13000000-0000-0000-0000-000000000003'),
  false,
  'complete_onboarding() does NOT set is_active=true'
);
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);
select is(
  (public.get_my_profile_state())->>'state',
  'inactive',
  'a deactivated account remains inactive after completing auth — it cannot become a normal active app user'
);

-- ---------------------------------------------------------------------------
-- Section 18 / 28: an administrator edit of a pending invitee's role is the
-- authoritative role and survives password setup.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_user_profile('13000000-0000-0000-0000-000000000002', 'Onboarding Employee', 'onboarding-employee@lifecycle.test', 'R&D', 'Research Manager', 'management')$$,
  'administrator edits a pending invitee role before acceptance'
);
select is(
  (select role::text from public.user_roles where profile_id = '13000000-0000-0000-0000-000000000002'),
  'management',
  'the edited role is written to user_roles'
);
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.complete_onboarding()$$,
  'the invitee completes onboarding after the role edit'
);
select is(
  (select role::text from public.user_roles where profile_id = '13000000-0000-0000-0000-000000000002'),
  'management',
  'onboarding leaves the administrator-assigned role unchanged'
);

select * from finish();
rollback;
