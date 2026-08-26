begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select ok(
  has_function_privilege('authenticated', 'private.can_hr_read_objective(uuid)', 'execute'),
  'authenticated users can execute the HR Objective RLS helper'
);

-- ---------------------------------------------------------------------------
-- Fixtures: one organization with management, a project leader, two HR users,
-- and an employee.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('c1000000-0000-0000-0000-000000000001'::uuid, 'mgr@hr.test'),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 'pl@hr.test'),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 'hr1@hr.test'),
  ('c1000000-0000-0000-0000-000000000004'::uuid, 'hr2@hr.test'),
  ('c1000000-0000-0000-0000-000000000005'::uuid, 'emp@hr.test'),
  ('c1000000-0000-0000-0000-000000000006'::uuid, 'hr3@hr.test')
) users(id, email);

insert into public.organizations (id, name) values ('c2000000-0000-0000-0000-000000000001', 'HR Test Organization');

insert into public.profiles (id, organization_id, display_name, clearance) values
  ('c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Management', 'confidential'),
  ('c1000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Project Leader', 'confidential'),
  ('c1000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'HR One', 'confidential'),
  ('c1000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'HR Two', 'confidential'),
  ('c1000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'Employee', 'confidential'),
  ('c1000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000001', 'HR Three', 'confidential');

update public.profiles set approval_status = 'approved';

insert into public.user_roles (organization_id, profile_id, role) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'management'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'project_leader'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'hr'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'hr'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'employee'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006', 'hr');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Management creates business + HR Objectives.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.create_objective('Business Objective', null, 'c1000000-0000-0000-0000-000000000002', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'management creates a business objective'
);

select lives_ok(
  $$select public.create_objective('HR Objective', null, 'c1000000-0000-0000-0000-000000000002', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential', 'hr', array['c1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000004']::uuid[])$$,
  'management creates an HR objective with two HR owners'
);

select is(
  (select count(*) from public.objective_owners oo join public.objectives o on o.id = oo.objective_id where o.title = 'HR Objective'),
  3::bigint,
  'objective_owners records the project leader plus both HR owners'
);

select throws_ok(
  $$select public.create_objective('Empty HR Objective', null, 'c1000000-0000-0000-0000-000000000002', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential', 'hr', '{}'::uuid[])$$,
  '22023', '当前没有可选择的 HR 成员，请先创建或启用 HR 用户。', 'HR objective without HR owners is rejected'
);

-- ---------------------------------------------------------------------------
-- 2. HR owner vs non-owner KR creation.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'HR Objective'),
    'KR HR Hire', array['c1000000-0000-0000-0000-000000000003']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'assigned HR owner creates a KR under the HR objective'
);

select is(
  (select count(*) from public.kr_assignments ka join public.key_results kr on kr.id = ka.kr_id where kr.title = 'KR HR Hire' and ka.profile_id = 'c1000000-0000-0000-0000-000000000003' and ka.assignment_role = 'owner'),
  1::bigint,
  'the HR owner is stored as the KR owner'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000006', true);

select throws_ok(
  $$select public.create_key_result(
    (select id from public.objectives where title = 'HR Objective'),
    'KR HR Forbidden', array['c1000000-0000-0000-0000-000000000006']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  '42501', 'Only an assigned HR owner can create key results for HR objectives', 'non-owner HR cannot create a KR'
);

-- ---------------------------------------------------------------------------
-- 3. KR owner candidates are HR-only for HR objectives.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);

select ok(
  (select public.list_eligible_kr_owners((select id from public.objectives where title = 'HR Objective')) @> jsonb_build_array(jsonb_build_object('id', 'c1000000-0000-0000-0000-000000000003'::uuid))),
  'HR owner is a KR owner candidate'
);
select ok(
  (select public.list_eligible_kr_owners((select id from public.objectives where title = 'HR Objective')) @> jsonb_build_array(jsonb_build_object('id', 'c1000000-0000-0000-0000-000000000004'::uuid))),
  'another HR user is a KR owner candidate'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'HR Objective')) @> jsonb_build_array(jsonb_build_object('id', 'c1000000-0000-0000-0000-000000000005'::uuid))),
  'an employee is NOT a KR owner candidate for an HR objective'
);
select ok(
  not (select public.list_eligible_kr_owners((select id from public.objectives where title = 'HR Objective')) @> jsonb_build_array(jsonb_build_object('id', 'c1000000-0000-0000-0000-000000000002'::uuid))),
  'a project leader is NOT a KR owner candidate for an HR objective'
);

-- ---------------------------------------------------------------------------
-- 4. HR work-hours overview exposes effort rows only.
-- ---------------------------------------------------------------------------
-- Seed report data as the migration superuser so author-level RLS does not
-- reject a report authored by the employee while the authenticated caller is HR.
reset role;

insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification, total_hours, current_revision)
values (
  'c3000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000005',
  (select project_id from public.objectives where title = 'HR Objective'),
  (select id from public.objectives where title = 'HR Objective'),
  current_date, 'submitted', 'confidential', 3, 1
);

insert into public.daily_report_revisions (id, organization_id, report_id, revision_number, editor_id, daily_objective, objective_progress, classification)
values (
  'c3000000-0000-0000-0000-000000000002',
  'c2000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001',
  1,
  'c1000000-0000-0000-0000-000000000005',
  '招聘推进', 0, 'confidential'
);

insert into public.daily_okr_blocks (id, organization_id, report_id, revision_id, position, daily_objective, linked_key_result_id, hours, result, key_results, work_description, evidence_links)
values (
  'c3000000-0000-0000-0000-000000000003',
  'c2000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  1,
  '招聘推进',
  (select id from public.key_results where title = 'KR HR Hire'),
  3, '完成 3 人初筛', '[]'::jsonb, '筛选简历', '[]'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);

select is(
  jsonb_array_length(public.get_hr_work_hours(current_date, current_date)),
  1::integer,
  'HR work-hours returns one effort row for the seeded block'
);

select is(
  (public.get_hr_work_hours(current_date, current_date) -> 0 ->> 'role'),
  'employee',
  'the effort row carries the author role'
);

select is(
  (public.get_hr_work_hours(current_date, current_date) -> 0 ->> 'krTitle'),
  'KR HR Hire',
  'the effort row resolves the linked KR title'
);

select ok(
  not (public.get_hr_work_hours(current_date, current_date) -> 0 ? 'dailyObjective'),
  'daily report text is not exposed'
);
select ok(
  not (public.get_hr_work_hours(current_date, current_date) -> 0 ? 'result'),
  'daily report result is not exposed'
);
select ok(
  not (public.get_hr_work_hours(current_date, current_date) -> 0 ? 'workDescription'),
  'daily work description is not exposed'
);

-- ---------------------------------------------------------------------------
-- 5. RLS: HR reads HR objectives only.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.objectives where title = 'HR Objective'),
  1::bigint,
  'HR reads its HR objective'
);
select is(
  (select count(*) from public.objectives where title = 'Business Objective'),
  0::bigint,
  'HR cannot read a business objective'
);

select * from finish();
rollback;
