begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- ---------------------------------------------------------------------------
-- Onboarding state model: `profiles.onboarding_completed` is the application-owned
-- truth of whether a member finished account setup. It is NOT derived from
-- `auth.users.email_confirmed_at` (Supabase confirms the email as soon as the
-- invite link is clicked, before a password is chosen).
-- ---------------------------------------------------------------------------

-- Both fixtures arrive with email_confirmed_at already set (they clicked the
-- invite link), yet neither has completed onboarding.
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
  ('13000000-0000-0000-0000-000000000002'::uuid, 'onboarding-employee@lifecycle.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000031', 'Onboarding Organization');

insert into public.profiles (id, organization_id, display_name, is_active) values
  ('13000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000031', 'Onboarding Admin', true),
  ('13000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000031', 'Onboarding Employee', true);

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('20000000-0000-0000-0000-000000000031', '13000000-0000-0000-0000-000000000001', 'administrator', true),
  ('20000000-0000-0000-0000-000000000031', '13000000-0000-0000-0000-000000000002', 'employee', true);

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

-- 2. complete_onboarding() marks only the caller's own profile (scoped to
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

-- 3. The profile/role resolution path does not gate on onboarding_completed:
--    onboarding is surfaced to the UI separately, not by locking the dashboard.
select is(
  (public.get_my_profile_state())->>'state',
  'active',
  'an active profile is still resolved as active regardless of onboarding_completed'
);

select * from finish();
rollback;
