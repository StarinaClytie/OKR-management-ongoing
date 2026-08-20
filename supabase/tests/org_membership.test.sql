begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures: one organization with an administrator, management, two project
-- leaders, three employees, and pending/inactive accounts.
--
--   Alpha (leader PL1): PL1, Emp1, Emp2
--   Beta  (leader PL1): PL1, Emp1
--   Gamma (leader PL2): PL2, Emp3
--
-- So PL1 leads Alpha+Beta and sees {PL1, Emp1, Emp2}; Emp3 is unrelated.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('91000000-0000-0000-0000-000000000001'::uuid, 'admin@membership.test'),
  ('91000000-0000-0000-0000-000000000002'::uuid, 'management@membership.test'),
  ('91000000-0000-0000-0000-000000000003'::uuid, 'pl1@membership.test'),
  ('91000000-0000-0000-0000-000000000004'::uuid, 'pl2@membership.test'),
  ('91000000-0000-0000-0000-000000000005'::uuid, 'emp1@membership.test'),
  ('91000000-0000-0000-0000-000000000006'::uuid, 'emp2@membership.test'),
  ('91000000-0000-0000-0000-000000000007'::uuid, 'emp3@membership.test'),
  ('91000000-0000-0000-0000-000000000008'::uuid, 'pending@membership.test'),
  ('91000000-0000-0000-0000-000000000009'::uuid, 'inactive@membership.test')
) users(id, email);

insert into public.organizations (id, name) values ('93000000-0000-0000-0000-000000000001', 'Membership Organization');

insert into public.profiles (id, organization_id, display_name, clearance) values
  ('91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Administrator', 'confidential'),
  ('91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', 'Management', 'confidential'),
  ('91000000-0000-0000-0000-000000000003', '93000000-0000-0000-0000-000000000001', 'Project Leader One', 'confidential'),
  ('91000000-0000-0000-0000-000000000004', '93000000-0000-0000-0000-000000000001', 'Project Leader Two', 'confidential'),
  ('91000000-0000-0000-0000-000000000005', '93000000-0000-0000-0000-000000000001', 'Employee One', 'confidential'),
  ('91000000-0000-0000-0000-000000000006', '93000000-0000-0000-0000-000000000001', 'Employee Two', 'confidential'),
  ('91000000-0000-0000-0000-000000000007', '93000000-0000-0000-0000-000000000001', 'Employee Three', 'confidential'),
  ('91000000-0000-0000-0000-000000000008', '93000000-0000-0000-0000-000000000001', 'Pending User', 'internal'),
  ('91000000-0000-0000-0000-000000000009', '93000000-0000-0000-0000-000000000001', 'Inactive User', 'internal');

update public.profiles set approval_status = 'approved'
where id in (
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000004',
  '91000000-0000-0000-0000-000000000005',
  '91000000-0000-0000-0000-000000000006',
  '91000000-0000-0000-0000-000000000007'
);
update public.profiles set is_active = false where id = '91000000-0000-0000-0000-000000000009';

insert into public.user_roles (organization_id, profile_id, role) values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'administrator'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'management'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'project_leader'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'project_leader'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'employee'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000006', 'employee'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000007', 'employee');

insert into public.projects (id, organization_id, name, description, leader_id, classification, start_date, due_date, status) values
  ('92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Alpha', '', '91000000-0000-0000-0000-000000000003', 'confidential', current_date, current_date + 90, 'active'),
  ('92000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', 'Beta', '', '91000000-0000-0000-0000-000000000003', 'confidential', current_date, current_date + 90, 'active'),
  ('92000000-0000-0000-0000-000000000003', '93000000-0000-0000-0000-000000000001', 'Gamma', '', '91000000-0000-0000-0000-000000000004', 'confidential', current_date, current_date + 90, 'active');

insert into public.project_members (organization_id, project_id, profile_id) values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003'),
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005'),
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000006'),
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000003'),
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000005'),
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000004'),
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000007');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Management visibility (root cause: management must see all approved active
-- business users, with their roles populated).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000005'),
  1::bigint,
  'management sees employee one'
);
select is(
  (select e.value->'user_roles'->0->>'role' from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000005'),
  'employee',
  'management sees employee role'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000007'),
  1::bigint,
  'management sees unrelated employee three'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000008'),
  0::bigint,
  'management does not see pending users'
);

-- Management has no administrator account-control powers.
select throws_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000005', array['92000000-0000-0000-0000-000000000001']::uuid[])$$,
  '42501', 'Only administrators can manage project membership', 'management cannot administer project membership'
);
select throws_ok(
  $$select public.update_user_profile('91000000-0000-0000-0000-000000000005', 'Renamed', 'e@example.com', 'D', 'T', 'employee')$$,
  '42501', 'Only administrators can update users', 'management cannot mutate accounts'
);

-- ---------------------------------------------------------------------------
-- Project leader visibility: led projects + members only, unrelated excluded.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000005'),
  1::bigint,
  'PL1 sees shared employee one'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000006'),
  1::bigint,
  'PL1 sees employee two (Alpha member)'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000007'),
  0::bigint,
  'PL1 does not see unrelated employee three'
);
select is(
  (select jsonb_array_length(e.value->'project_members') from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000005'),
  2,
  'shared employee appears through both Alpha and Beta'
);

-- list_projects scoping: PL1 sees Alpha + Beta, not Gamma.
select is(
  (select count(*) from jsonb_array_elements(public.list_projects()) e where e.value->>'name' in ('Alpha', 'Beta')),
  2::bigint,
  'PL1 lists both led projects'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_projects()) e where e.value->>'name' = 'Gamma'),
  0::bigint,
  'PL1 does not list unrelated Gamma'
);

-- ---------------------------------------------------------------------------
-- Employee visibility: project peers only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000005', true);

select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000006'),
  1::bigint,
  'employee one sees peer employee two'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000007'),
  0::bigint,
  'employee one does not see unrelated employee three'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_organization_users()) e where e.value->>'id' = '91000000-0000-0000-0000-000000000002'),
  0::bigint,
  'employee one does not see management'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_projects()) e where e.value->>'name' in ('Alpha', 'Beta')),
  2::bigint,
  'employee one lists their two projects'
);

-- ---------------------------------------------------------------------------
-- profiles_read tightening: a project leader cannot read unrelated profiles
-- directly through PostgREST.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*) from public.profiles where id = '91000000-0000-0000-0000-000000000007'),
  0::bigint,
  'profiles_read hides unrelated profiles from a project leader'
);
select is(
  (select count(*) from public.profiles where id = '91000000-0000-0000-0000-000000000005'),
  1::bigint,
  'profiles_read allows a project leader to read a member profile'
);

-- ---------------------------------------------------------------------------
-- Administrator membership administration.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000006', array['92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002']::uuid[])$$,
  'administrator adds employee two to Alpha and Beta'
);
select is(
  (select count(*) from public.project_members where profile_id = '91000000-0000-0000-0000-000000000006'),
  2::bigint,
  'membership persists across two projects'
);

select lives_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000006', array['92000000-0000-0000-0000-000000000001']::uuid[])$$,
  'administrator removes employee two from Beta'
);
select is(
  (select count(*) from public.project_members where profile_id = '91000000-0000-0000-0000-000000000006'),
  1::bigint,
  'membership removal persists'
);

select throws_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000008', array['92000000-0000-0000-0000-000000000001']::uuid[])$$,
  '22023', 'Only approved active users can be project members', 'pending user cannot become a member'
);
select throws_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000009', array['92000000-0000-0000-0000-000000000001']::uuid[])$$,
  '22023', 'Only approved active users can be project members', 'inactive user cannot become a member'
);

-- A project leader's led-project membership is preserved by the RPC.
select lives_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000003', '{}'::uuid[])$$,
  'administrator clears a project leader membership'
);
select is(
  (select count(*) from public.project_members where profile_id = '91000000-0000-0000-0000-000000000003'),
  2::bigint,
  'leader-led projects are re-added automatically'
);

-- ---------------------------------------------------------------------------
-- Membership removal preserves historical KR/assignment records.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_objective('Membership Objective', null, '91000000-0000-0000-0000-000000000003', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'management creates an objective for the membership test'
);

-- Employee one must belong to the Objective's project to own a KR under it.
select lives_ok(
  $$select public.set_project_members(
    (select project_id from public.objectives where title = 'Membership Objective'),
    array['91000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000005']::uuid[])$$,
  'management adds employee one to the objective project'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Membership Objective'),
    'Owned KR', array['91000000-0000-0000-0000-000000000005']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'project leader creates a KR owned by employee one'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_user_project_memberships('91000000-0000-0000-0000-000000000005', '{}'::uuid[])$$,
  'administrator removes employee one membership'
);

-- Data-preservation check runs as the table owner (bypassing RLS): removing a
-- membership must not delete the historical KR assignment row.
reset role;
select is(
  (select count(*) from public.kr_assignments ka join public.key_results kr on kr.id = ka.kr_id where kr.title = 'Owned KR'),
  1::bigint,
  'removing membership preserves historical KR assignments'
);

select * from finish();
rollback;
