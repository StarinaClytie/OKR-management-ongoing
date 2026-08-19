begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures: two organizations. Org A has an administrator, a manager, an
-- employee, a deactivated member, two pending self-registered users, an
-- approved-but-roleless member, and a self-registered user with no profile.
-- Org B has its own administrator/employee for cross-organization rejection.
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
  metadata,
  now(),
  now()
from (values
  ('11000000-0000-0000-0000-000000000001'::uuid, 'admin@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000002'::uuid, 'mgr@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000003'::uuid, 'emp@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000004'::uuid, 'inactive@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000005'::uuid, 'pending@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000006'::uuid, 'roleless@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000007'::uuid, 'other-admin@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000008'::uuid, 'other-user@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000009'::uuid, 'pending2@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000010'::uuid, 'selfreg@admin.test', '{}'::jsonb),
  ('11000000-0000-0000-0000-000000000011'::uuid, 'meta@admin.test', '{"role":"administrator"}'::jsonb),
  ('11000000-0000-0000-0000-000000000012'::uuid, 'recover@admin.test', '{"display_name":"Recovered Name"}'::jsonb),
  ('11000000-0000-0000-0000-000000000013'::uuid, 'victim@admin.test', '{}'::jsonb)
) as users(id, email, metadata);

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000011', 'Admin Organization'),
  ('20000000-0000-0000-0000-000000000012', 'Other Organization');

insert into public.profiles (id, organization_id, display_name, is_active, approval_status) values
  ('11000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', 'Admin', true, 'approved'),
  ('11000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'Manager', true, 'approved'),
  ('11000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Employee', true, 'approved'),
  ('11000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000011', 'Inactive', false, 'approved'),
  ('11000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000011', 'Pending', true, 'pending'),
  ('11000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000011', 'Roleless', true, 'approved'),
  ('11000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000012', 'Other Admin', true, 'approved'),
  ('11000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000012', 'Other User', true, 'approved'),
  ('11000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000011', 'Pending Two', true, 'pending'),
  ('11000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 'Metadata Claimant', true, 'pending');

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000001', 'administrator', true),
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000002', 'management', true),
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000003', 'employee', true),
  ('20000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000004', 'employee', false),
  ('20000000-0000-0000-0000-000000000012', '11000000-0000-0000-0000-000000000007', 'administrator', true),
  ('20000000-0000-0000-0000-000000000012', '11000000-0000-0000-0000-000000000008', 'employee', true);

-- A project and a resource in Org A, owned by the approved employee, so the
-- pending-user RLS denials below are exercised against real business rows.
insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 'Visible Project', '11000000-0000-0000-0000-000000000003', 'internal', current_date - 1, current_date + 30);

insert into public.resources (id, organization_id, name, owner_id, location, created_by) values
  ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 'Visible Resource', '11000000-0000-0000-0000-000000000003', 'Lab A', '11000000-0000-0000-0000-000000000003');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- get_my_profile_state discriminates all six account states.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is((select public.get_my_profile_state()->>'state'), 'active', 'approved administrator reports active');
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
select is((select public.get_my_profile_state()->>'state'), 'inactive', 'deactivated member reports inactive');
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);
select is((select public.get_my_profile_state()->>'state'), 'pending', 'self-registered pending member reports pending');
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000006', true);
select is((select public.get_my_profile_state()->>'state'), 'error', 'approved member without a role reports error, not pending');
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000010', true);
select is((select public.get_my_profile_state()->>'state'), 'missing', 'authenticated user without a profile reports missing');
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000011', true);
select is((select public.get_my_profile_state()->>'state'), 'pending', 'raw_user_meta_data role grants no privilege');

-- ---------------------------------------------------------------------------
-- approve_pending_user: administrator-only, atomic, role-required, pending-only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000005', 'employee', '产品部', '工程师')$$,
  'administrator approves a pending user'
);
select is(
  (select approval_status::text from public.profiles where id = '11000000-0000-0000-0000-000000000005'),
  'approved',
  'approval sets the approved state'
);
select is(
  (select role::text from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000005'),
  'employee',
  'approval assigns the selected role atomically'
);
select is(
  (select department from public.profiles where id = '11000000-0000-0000-0000-000000000005'),
  '产品部',
  'approval persists optional department'
);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000003', 'employee', '', '')$$,
  '22023', 'User is not pending approval', 'approving an already-approved member is rejected'
);
select is(
  (select role::text from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000003'),
  'employee',
  'a rejected approval leaves the target role unchanged'
);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', null, '', '')$$,
  '22023', 'Role is required', 'approval without a role is rejected'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', 'employee', '', '')$$,
  '42501', 'Only administrators can approve users', 'management cannot approve users'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', 'employee', '', '')$$,
  '42501', 'Profile not found in organization', 'cross-organization approval is rejected'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000005', 'employee', '', '')$$,
  '42501', 'Only administrators can approve users', 'a pending user cannot self-approve'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$select public.approve_pending_user('11000000-0000-0000-0000-000000000009', 'employee', '', '')$$,
  '42501', 'Only administrators can approve users', 'metadata role grants no approval authority'
);

-- ---------------------------------------------------------------------------
-- reject_pending_user: administrator-only, pending-only, soft (no hard delete).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.reject_pending_user('11000000-0000-0000-0000-000000000009')$$,
  'administrator rejects a pending user'
);
select is(
  (select approval_status::text from public.profiles where id = '11000000-0000-0000-0000-000000000009'),
  'rejected',
  'rejection marks the profile rejected'
);
select is(
  (select is_active from public.profiles where id = '11000000-0000-0000-0000-000000000009'),
  false,
  'rejection deactivates the profile without deleting it'
);
select throws_ok(
  $$select public.reject_pending_user('11000000-0000-0000-0000-000000000003')$$,
  '22023', 'User is not pending approval', 'rejecting an approved member is rejected'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.reject_pending_user('11000000-0000-0000-0000-000000000009')$$,
  '42501', 'Only administrators can reject users', 'non-administrator cannot reject'
);

-- ---------------------------------------------------------------------------
-- create_pending_profile: creates a pending profile in the default org, and is
-- idempotent (never overwrites an existing, possibly approved profile).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000010', true);
select lives_ok(
  $$select public.create_pending_profile('Self Registered')$$,
  'a self-registered user creates their pending profile'
);
-- Read the resulting profile as the administrator: RLS lets an administrator
-- read any member of their organization, while a pending user cannot read
-- profiles at all (their organization identity resolves to null).
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is(
  (select approval_status::text from public.profiles where id = '11000000-0000-0000-0000-000000000010'),
  'pending',
  'self-registration lands in the pending state'
);
select is(
  (select organization_id from public.profiles where id = '11000000-0000-0000-0000-000000000010'),
  '20000000-0000-0000-0000-000000000011'::uuid,
  'self-registration associates the default organization'
);
select is(
  (select display_name from public.profiles where id = '11000000-0000-0000-0000-000000000010'),
  'Self Registered',
  'self-registration stores the submitted display name'
);
select is(
  (select count(*) from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000010'),
  0::bigint,
  'self-registration assigns no role'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000010', true);
select lives_ok(
  $$select public.create_pending_profile('Self Registered')$$,
  'calling create_pending_profile again is idempotent'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.profiles where id = '11000000-0000-0000-0000-000000000010'),
  1::bigint,
  'idempotency does not duplicate the profile'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.create_pending_profile('Hijack')$$,
  'an approved user can call create_pending_profile without effect'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is(
  (select approval_status::text from public.profiles where id = '11000000-0000-0000-0000-000000000003'),
  'approved',
  'create_pending_profile never demotes an approved profile'
);

-- ---------------------------------------------------------------------------
-- Partial-signup recovery: an authenticated user whose profile was never
-- created (a transient signup failure) can idempotently recover their own
-- pending profile. Display name is derived from signup metadata; no role, no
-- approved state, and no other user's profile are ever created.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000012', true);
select lives_ok(
  $$select public.create_pending_profile('')$$,
  'recovery creates the caller''s own pending profile'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is(
  (select display_name from public.profiles where id = '11000000-0000-0000-0000-000000000012'),
  'Recovered Name',
  'recovery derives the display name from signup metadata'
);
select is(
  (select approval_status::text from public.profiles where id = '11000000-0000-0000-0000-000000000012'),
  'pending',
  'recovery never creates an approved state'
);
select is(
  (select count(*) from public.user_roles where profile_id = '11000000-0000-0000-0000-000000000012'),
  0::bigint,
  'recovery never creates a role'
);
select is(
  (select count(*) from public.profiles where id = '11000000-0000-0000-0000-000000000012'),
  1::bigint,
  'recovery creates exactly one profile'
);
select is(
  (select count(*) from public.profiles where id = '11000000-0000-0000-0000-000000000013'),
  0::bigint,
  'recovery cannot create another user''s profile'
);

-- ---------------------------------------------------------------------------
-- RLS gating: a pending user resolves no organization and reads no business
-- rows, so operational access is denied at the database layer.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000010', true);
select is(
  (select private.current_organization_id()),
  null,
  'a pending user resolves no organization identity'
);
select is(
  (select count(*) from public.profiles),
  0::bigint,
  'a pending user cannot read the member directory'
);
select is(
  (select count(*) from public.projects),
  0::bigint,
  'a pending user cannot read projects'
);
select is(
  (select count(*) from public.resources),
  0::bigint,
  'a pending user cannot read resources'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.projects where id = '30000000-0000-0000-0000-000000000011'),
  1::bigint,
  'the approved administrator can read the fixture project'
);

select * from finish();
rollback;
