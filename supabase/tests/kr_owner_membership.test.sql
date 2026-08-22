begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

-- ---------------------------------------------------------------------------
-- Fixtures: one organization with an administrator, management, two project
-- leaders, four employees, HR, and inactive/pending accounts.
--
--   PL1 leads the Objective's project; EmpA and PL2 are added as members.
--   EmpB is a member of an unrelated project. EmpNoMember and EmpNoMemberTwo
--   belong to nothing.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('b1000000-0000-0000-0000-000000000001'::uuid, 'admin@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000002'::uuid, 'management@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000003'::uuid, 'pl1@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000004'::uuid, 'pl2@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000005'::uuid, 'empa@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000006'::uuid, 'empb@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000007'::uuid, 'empnomember@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000008'::uuid, 'inactive@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000009'::uuid, 'pending@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000010'::uuid, 'empnomembertwo@kr-owner.test'),
  ('b1000000-0000-0000-0000-000000000011'::uuid, 'hr@kr-owner.test')
) users(id, email);

insert into public.organizations (id, name) values ('b2000000-0000-0000-0000-000000000001', 'KR Owner Organization');

insert into public.profiles (id, organization_id, display_name, clearance) values
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Administrator', 'confidential'),
  ('b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001', 'Management', 'confidential'),
  ('b1000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'Project Leader One', 'confidential'),
  ('b1000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000001', 'Project Leader Two', 'confidential'),
  ('b1000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000001', 'Employee A', 'confidential'),
  ('b1000000-0000-0000-0000-000000000006', 'b2000000-0000-0000-0000-000000000001', 'Employee B', 'confidential'),
  ('b1000000-0000-0000-0000-000000000007', 'b2000000-0000-0000-0000-000000000001', 'Employee No Member', 'confidential'),
  ('b1000000-0000-0000-0000-000000000008', 'b2000000-0000-0000-0000-000000000001', 'Inactive User', 'confidential'),
  ('b1000000-0000-0000-0000-000000000009', 'b2000000-0000-0000-0000-000000000001', 'Pending User', 'confidential'),
  ('b1000000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-000000000001', 'Employee No Member Two', 'confidential'),
  ('b1000000-0000-0000-0000-000000000011', 'b2000000-0000-0000-0000-000000000001', 'Human Resources', 'confidential');

update public.profiles set approval_status = 'approved'
where id in (
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000003',
  'b1000000-0000-0000-0000-000000000004',
  'b1000000-0000-0000-0000-000000000005',
  'b1000000-0000-0000-0000-000000000006',
  'b1000000-0000-0000-0000-000000000007',
  'b1000000-0000-0000-0000-000000000008',
  'b1000000-0000-0000-0000-000000000010',
  'b1000000-0000-0000-0000-000000000011'
);
update public.profiles set is_active = false where id = 'b1000000-0000-0000-0000-000000000008';

insert into public.user_roles (organization_id, profile_id, role) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'administrator'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'management'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'project_leader'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'project_leader'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'employee'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'employee'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000007', 'employee'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000008', 'employee'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000009', 'employee'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'employee'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000011', 'hr');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. create_project preserves leader membership.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_project('Led Project', '', 'b1000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  'management creates a project with a project leader'
);
select is(
  (select count(*) from public.projects where name = 'Led Project'),
  1::bigint,
  'project created'
);
select is(
  (select count(*) from public.project_members pm join public.projects p on p.id = pm.project_id where p.name = 'Led Project' and pm.profile_id = 'b1000000-0000-0000-0000-000000000003'),
  1::bigint,
  'leader automatically appears in project_members'
);

-- Repeating the equivalent operation must not create a duplicate row.
select lives_ok(
  $$select public.create_project('Dup Project', '', 'b1000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['b1000000-0000-0000-0000-000000000003']::uuid[])$$,
  'management creates a project whose leader is also passed as a member'
);
select is(
  (select count(*) from public.project_members pm join public.projects p on p.id = pm.project_id where p.name = 'Dup Project' and pm.profile_id = 'b1000000-0000-0000-0000-000000000003'),
  1::bigint,
  'leader passed as a member does not create a duplicate membership row'
);

-- Invalid / inactive leaders remain rejected under the existing rules.
select throws_ok(
  $$select public.create_project('Inactive Leader', '', 'b1000000-0000-0000-0000-000000000008', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project leader is not an eligible organization member', 'inactive leader is rejected'
);
select throws_ok(
  $$select public.create_project('Pending Leader', '', 'b1000000-0000-0000-0000-000000000009', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project leader is not an eligible organization member', 'pending-approval leader is rejected'
);

-- ---------------------------------------------------------------------------
-- 2. KR owner must belong to the Objective's project.
-- ---------------------------------------------------------------------------
-- EmpB belongs to an unrelated project (led by PL2), so the unrelated-project
-- case is distinct from the no-membership case.
select lives_ok(
  $$select public.create_project('Unrelated Project', '', 'b1000000-0000-0000-0000-000000000004', current_date, current_date + 30, 'confidential', 'active', array['b1000000-0000-0000-0000-000000000006']::uuid[])$$,
  'management creates an unrelated project for employee B'
);

select lives_ok(
  $$select public.create_objective('Owner Objective', null, 'b1000000-0000-0000-0000-000000000003', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'management creates the Objective for the KR-owner tests'
);

-- Add EmpA and PL2 to the Objective's project (management sets the roster; the
-- leader is kept explicitly).
select lives_ok(
  $$select public.set_project_members(
    (select project_id from public.objectives where title = 'Owner Objective'),
    array['b1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000004']::uuid[])$$,
  'management adds employee A and project leader two to the objective project'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);

-- The selector is intentionally organization-wide: an approved, active employee
-- does not need pre-existing project membership before the KR owner trigger adds it.
select is(
  (select count(*) from public.project_members pm join public.objectives o on o.project_id = pm.project_id where o.title = 'Owner Objective' and pm.profile_id = 'b1000000-0000-0000-0000-000000000010'),
  0::bigint,
  'second eligible employee has no Objective-project membership before selection'
);
select ok(
  (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000010'::uuid))),
  'approved active employee without membership is listed as a KR owner candidate'
);
select ok(
  (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000003'::uuid))),
  'assigned project leader is listed as a KR owner candidate'
);
select ok(
  (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000004'::uuid))),
  'eligible project leader is listed as a KR owner candidate'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000001'::uuid))),
  'administrator is absent from KR owner candidates'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000002'::uuid))),
  'management is absent from KR owner candidates'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000011'::uuid))),
  'HR is absent from KR owner candidates'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000009'::uuid))),
  'pending profile is absent from KR owner candidates'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'Owner Objective')) @> jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-0000-0000-000000000008'::uuid))),
  'inactive profile is absent from KR owner candidates'
);

-- 6. A project-member employee can own a KR.
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR EmpA', array['b1000000-0000-0000-0000-000000000005']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'project member employee can be a KR owner'
);

-- 7. A project-member project leader can own a KR (when allowed).
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR PL2', array['b1000000-0000-0000-0000-000000000004']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'project member project leader can be a KR owner'
);

-- 8. Membership in another project does not restrict organization-wide assignment.
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR EmpB', array['b1000000-0000-0000-0000-000000000006']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'eligible employee from another project can own the KR'
);
select is(
  (select count(*) from public.project_members pm join public.objectives o on o.project_id = pm.project_id where o.title = 'Owner Objective' and pm.profile_id = 'b1000000-0000-0000-0000-000000000006'),
  1::bigint,
  'cross-project employee is added to the Objective project'
);

-- 9. An eligible organization employee needs no pre-existing project membership.
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR NoMember', array['b1000000-0000-0000-0000-000000000007']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'eligible organization employee can be assigned without project membership'
);
select is(
  (select count(*) from public.project_members pm join public.objectives o on o.project_id = pm.project_id where o.title = 'Owner Objective' and pm.profile_id = 'b1000000-0000-0000-0000-000000000007'),
  1::bigint,
  'KR assignment automatically adds the employee to project_members'
);

-- 10. A mixed owner array of eligible organization employees succeeds atomically.
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'Mixed KR', array['b1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'mixed eligible owner array succeeds atomically'
);

select is(
  (select count(*) from public.key_results where title = 'Mixed KR'),
  1::bigint,
  'mixed owner array creates one key_result row'
);
select is(
  (select count(*) from public.kr_assignments ka join public.key_results kr on kr.id = ka.kr_id where kr.title = 'Mixed KR'),
  2::bigint,
  'mixed owner array writes both OWNER assignments'
);

-- 12. update_key_result enforces the same rule.
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR Update', array['b1000000-0000-0000-0000-000000000005']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'project leader creates a KR to update'
);
select lives_ok(
  $$select public.update_key_result(
    (select id from public.key_results where title = 'KR Update'),
    'KR Update', array['b1000000-0000-0000-0000-000000000006']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'update_key_result accepts an eligible organization employee'
);
select is(
  (select count(*) from public.kr_assignments ka join public.key_results kr on kr.id = ka.kr_id where kr.title = 'KR Update' and ka.profile_id = 'b1000000-0000-0000-0000-000000000006'),
  1::bigint,
  'update replaces the OWNER assignment'
);
select is(
  (select count(*) from public.project_members pm join public.objectives o on o.project_id = pm.project_id where o.title = 'Owner Objective' and pm.profile_id = 'b1000000-0000-0000-0000-000000000006'),
  1::bigint,
  'updated owner remains a project member'
);

-- Inactive and pending profiles remain ineligible even without a membership prerequisite.
select throws_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR Inactive', array['b1000000-0000-0000-0000-000000000008']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  '22023', 'Key Result owners must be eligible members of the Objective''s project.', 'inactive employee is rejected'
);
select throws_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'Owner Objective'),
    'KR Pending', array['b1000000-0000-0000-0000-000000000009']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  '22023', 'Key Result owners must be eligible members of the Objective''s project.', 'pending employee is rejected'
);

-- 13. Historical KR assignments are not deleted (the migration is additive and
--     membership removal does not cascade into kr_assignments).
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_user_project_memberships('b1000000-0000-0000-0000-000000000005', '{}'::uuid[])$$,
  'administrator removes employee A membership'
);
reset role;
select is(
  (select count(*) from public.kr_assignments ka join public.key_results kr on kr.id = ka.kr_id where kr.title = 'KR EmpA'),
  1::bigint,
  'historical KR assignment survives membership removal'
);

select * from finish();
rollback;
