begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures: management, a project leader, two employees, and an administrator
-- in one organization.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('81000000-0000-0000-0000-000000000001'::uuid, 'management@okr.test'),
  ('81000000-0000-0000-0000-000000000002'::uuid, 'leader@okr.test'),
  ('81000000-0000-0000-0000-000000000003'::uuid, 'employee@okr.test'),
  ('81000000-0000-0000-0000-000000000004'::uuid, 'employee2@okr.test'),
  ('81000000-0000-0000-0000-000000000005'::uuid, 'admin@okr.test')
) users(id, email);

insert into public.organizations (id, name) values ('82000000-0000-0000-0000-000000000001', 'OKR Organization');
insert into public.profiles (id, organization_id, display_name, clearance) values
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'Management', 'confidential'),
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 'Project Leader', 'confidential'),
  ('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 'Employee', 'confidential'),
  ('81000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000001', 'Employee Two', 'confidential'),
  ('81000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000001', 'Administrator', 'confidential');
update public.profiles set approval_status = 'approved';
insert into public.user_roles (organization_id, profile_id, role) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'management'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'project_leader'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'employee'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', 'employee'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000005', 'administrator');

set local role authenticated;

-- Management alone creates an Objective, with a project-leader-only assignee.
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_objective('Quarterly Objective', null, '81000000-0000-0000-0000-000000000002', '2026-Q3', current_date, current_date + 90, 'high', 'Objective description', 'confidential')$$,
  'management creates an Objective'
);
select is((select count(*) from public.objectives where quarter = '2026-Q3'), 1::bigint, 'Objective persisted');
select throws_ok(
  $$select public.create_objective('Bad Leader Objective', null, '81000000-0000-0000-0000-000000000003', '2026-Q3', current_date, current_date + 90, 'medium', '', 'internal')$$,
  '22023', 'Objective leader must be a project leader', 'employee cannot be assigned as Objective leader'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_objective('Leader Objective', null, '81000000-0000-0000-0000-000000000002', '2026-Q3', current_date, current_date + 90, 'medium', '', 'internal')$$,
  '42501', 'Only management can create objectives', 'project leader cannot create an Objective'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.create_objective('Admin Objective', null, '81000000-0000-0000-0000-000000000002', '2026-Q3', current_date, current_date + 90, 'medium', '', 'internal')$$,
  '42501', 'Only management can create objectives', 'administrator cannot create a business Objective'
);

-- The Objective's project must contain its employees before they can own KRs.
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_project_members(
    (select project_id from public.objectives where quarter = '2026-Q3'),
    array['81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000003']::uuid[])$$,
  'management adds the employee to the objective project'
);

-- Project leader creates a multi-owner KR under their Objective.
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_key_result(
    (select id from public.objectives where quarter = '2026-Q3'),
    'Multi-owner KR', array['81000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  'project leader creates a multi-owner KR'
);
select is(
  (select count(*) from public.kr_assignments where kr_id = (select id from public.key_results where title = 'Multi-owner KR') and assignment_role = 'owner'),
  2::bigint,
  'multi-owner KR persists two owner assignments'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_key_result(
    (select id from public.objectives where quarter = '2026-Q3'),
    'Management KR', array['81000000-0000-0000-0000-000000000003']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  '42501', 'Only the project leader can create key results', 'management cannot create a KR'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.create_key_result(
    (select id from public.objectives where quarter = '2026-Q3'),
    'Employee KR', array['81000000-0000-0000-0000-000000000003']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  '42501', 'Only the project leader can create key results', 'employee cannot create a KR'
);

-- KR owners must be project leaders or employees, not management.
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_key_result(
    (select id from public.objectives where quarter = '2026-Q3'),
    'Management-owner KR', array['81000000-0000-0000-0000-000000000001']::uuid[],
    current_date + 60, 'milestone', null, null, '', '', null, 'medium', 'confidential')$$,
  '22023', 'Key Result owners must be eligible members of the Objective''s project.', 'management cannot be a KR owner'
);

-- Objective-level edits remain management-only.
select throws_ok(
  $$select public.update_objective(
    (select id from public.objectives where quarter = '2026-Q3'),
    'Renamed by leader', null, '81000000-0000-0000-0000-000000000002', '2026-Q3', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  '42501', 'Only management can edit objectives', 'project leader cannot edit the Objective definition'
);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_objective(
    (select id from public.objectives where quarter = '2026-Q3'),
    'Renamed by management', null, '81000000-0000-0000-0000-000000000002', '2026-Q3', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'management edits the Objective definition'
);

select * from finish();
rollback;
