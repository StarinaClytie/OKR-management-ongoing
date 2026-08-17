begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures: two organizations, one administrator each, plus an unassigned
-- auth user (pending), a profile without a role (roleless), and an inactive
-- profile. All auth.user rows mirror the shape the existing RLS tests use.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000001',
  id,
  'authenticated',
  'authenticated',
  email,
  'not-used',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (values
  ('11000000-0000-0000-0000-000000000001'::uuid, 'admin@admin.test'),
  ('11000000-0000-0000-0000-000000000002'::uuid, 'mgr@admin.test'),
  ('11000000-0000-0000-0000-000000000003'::uuid, 'emp@admin.test'),
  ('11000000-0000-0000-0000-000000000004'::uuid, 'inactive@admin.test'),
  ('11000000-0000-0000-0000-000000000005'::uuid, 'pending@admin.test'),
  ('11000000-0000-0000-0000-000000000006'::uuid, 'roleless@admin.test'),
  ('11000000-0000-0000-0000-000000000007'::uuid, 'other-admin@admin.test'),
  ('11000000-0000-0000-0000-000000000008'::uuid, 'other-user@admin.test'),
  ('11000000-0000-0000-0000-000000000009'::uuid, 'pending2@admin.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000011', 'Admin Organization'),
  ('20000000-0000-0000-0000-000000000012', 'Other Organization');

insert into public.profiles (id, organization_id, display_name, is_active) values
  ('11000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', 'Admin', true),
  ('11000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'Manager', true),
  ('11000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Employee', true),
  ('11000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000011', 'Inactive', false),
  ('11000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000011', 'Roleless', true),
  ('11000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000012', 'Other Admin', true),
  ('11000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000012', 'Other User', true);

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000001', 'administrator', true),
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000002', 'management', true),
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000003', 'employee', true),
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000004', 'employee', false),
  ('20000000-0000-0000-0000-000000000012', '11000000-0000-0000-0000-000000000007', 'administrator', true),
  ('20000000-0000-0000-0000-000000000012', '11000000-0000-0000-0000-000000000008', 'employee', true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- get_my_profile_state discriminates missing / inactive / unassigned / active.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is((select public.get_my_profile_state()->>'state'), 'active', 'administrator sees an active state');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
select is((select public.get_my_profile_state()->>'state'), 'inactive', 'deactivated profile reports an inactive state, not unassigned');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);
select is((select public.get_my_profile_state()->>'state'), 'missing', 'auth user without a profile reports a missing state');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000006', true);
select is((select public.get_my_profile_state()->>'state'), 'unassigned', 'active profile without a role reports an unassigned state');

-- ---------------------------------------------------------------------------
-- approve_pending_user is administrator-only, atomic, and duplicate-safe.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000005', 'New Person', 'pending@admin.test', '产品部', '工程师', 'employee')$$,
  'administrator approves a pending user'
);
select is(
  (select organization_id from public.profiles where id = '11000000-0000-0000-0000-000000000005'),
  '20000000-0000-0000-0000-000000000011'::uuid,
  'approved profile lands in the administrator organization'
);
select is(
  (select display_name from public.profiles where id = '11000000-0000-0000-0000-000000000005'),
  'New Person',
  'approved profile stores the display name'
);
select is(
  (select role::text from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000005'),
  'employee',
  'approved profile receives the selected role'
);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000005', 'Dup', '', '', '', 'employee')$$,
  '23505', 'Profile already exists for this user', 'approving an already-profiled user is rejected as a duplicate'
);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', '   ', '', '', '', 'employee')$$,
  '22023', 'Display name is required', 'blank display name is rejected'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', 'Mgr Person', '', '', '', 'employee')$$,
  '42501', 'Only administrators can approve users', 'management cannot approve users'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', 'Emp Person', '', '', '', 'employee')$$,
  '42501', 'Only administrators can approve users', 'employee cannot approve users'
);

-- ---------------------------------------------------------------------------
-- update_user_profile edits display fields and role without moving organizations.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_user_profile('11000000-0000-0000-0000-000000000003', 'Employee', 'emp@admin.test', '产品部', '高级工程师', 'management')$$,
  'administrator updates a member profile and role'
);
select is(
  (select role::text from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000003'),
  'management',
  'role write updates user_roles'
);
select is(
  (select department from public.profiles where id = '11000000-0000-0000-0000-000000000003'),
  '产品部',
  'display fields persist on the profile'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.update_user_profile('11000000-0000-0000-0000-000000000003', 'X', '', '', '', 'employee')$$,
  '42501', 'Only administrators can update users', 'management cannot update users'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.update_user_profile('11000000-0000-0000-0000-000000000001', 'Admin', '', '', '', 'management')$$,
  '22023', 'Administrator cannot remove their own administrator role', 'administrator cannot demote their own account'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.update_user_profile('11000000-0000-0000-0000-000000000003', 'X', '', '', '', 'employee')$$,
  '42501', 'Profile not found in organization', 'cross-organization update is rejected'
);

-- ---------------------------------------------------------------------------
-- set_user_active deactivates without deleting, and is administrator-only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_user_active('11000000-0000-0000-0000-000000000003', false)$$,
  'administrator deactivates a member'
);
select is(
  (select is_active from public.profiles where id = '11000000-0000-0000-0000-000000000003'),
  false,
  'deactivation flips the profile flag'
);
select is(
  (select is_active from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000003'),
  false,
  'deactivation flips the role flag'
);
select lives_ok(
  $$select public.set_user_active('11000000-0000-0000-0000-000000000003', true)$$,
  'administrator reactivates a member'
);
select is(
  (select is_active from public.profiles where id = '11000000-0000-0000-0000-000000000003'),
  true,
  'reactivation restores the profile flag'
);
select throws_ok(
  $$select public.set_user_active('11000000-0000-0000-0000-000000000001', false)$$,
  '22023', 'Administrator cannot deactivate their own account', 'administrator cannot deactivate their own account'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.set_user_active('11000000-0000-0000-0000-000000000001', false)$$,
  '42501', 'Only administrators can change user status', 'non-administrator cannot change user status'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.set_user_active('11000000-0000-0000-0000-000000000003', false)$$,
  '42501', 'Profile not found in organization', 'cross-organization status change is rejected'
);

-- ---------------------------------------------------------------------------
-- RLS keeps a deactivated user from reading their own profile (which would
-- otherwise surface an 'unassigned' identity in the auth flow).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*) from public.profiles where id = '11000000-0000-0000-0000-000000000004'),
  0::bigint,
  'a deactivated user cannot read their own profile through RLS'
);

select * from finish();
rollback;
