begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('e1000000-0000-0000-0000-000000000001'::uuid, 'leader@block-project.test'),
  ('e1000000-0000-0000-0000-000000000002'::uuid, 'member@block-project.test'),
  ('e1000000-0000-0000-0000-000000000003'::uuid, 'outsider@block-project.test')
) users(id, email);

insert into public.organizations (id, name)
values ('e2000000-0000-0000-0000-000000000001', 'Block Project Test');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status) values
  ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'Leader', 'internal', 'approved'),
  ('e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'Member', 'internal', 'approved'),
  ('e1000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000001', 'Outsider', 'internal', 'approved');

insert into public.user_roles (organization_id, profile_id, role) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'project_leader'),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'employee'),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'employee');

insert into public.projects (id, organization_id, name, description, leader_id, classification, start_date, due_date, status) values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'Led Project', '', 'e1000000-0000-0000-0000-000000000001', 'internal', current_date, current_date + 30, 'active'),
  ('e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'Other Project', '', 'e1000000-0000-0000-0000-000000000003', 'internal', current_date, current_date + 30, 'active');

insert into public.project_members (organization_id, project_id, profile_id)
values ('e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002');

insert into public.objectives (id, organization_id, project_id, title, description, owner_id, classification, start_date, due_date, quarter)
values ('e4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Objective', '', 'e1000000-0000-0000-0000-000000000001', 'internal', current_date, current_date + 30, '2026-Q3');

insert into public.key_results (id, organization_id, project_id, objective_id, title, owner_id, measurement_type, target_value, classification, start_date, due_date)
values ('e5000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'Assigned KR', 'e1000000-0000-0000-0000-000000000001', 'number', 100, 'internal', current_date, current_date + 30);

insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
values ('e2000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'owner');

select has_column('public', 'daily_okr_blocks', 'project_id', 'daily blocks persist project attribution');
select ok(to_regprocedure('private.resolve_daily_report_block_project(uuid,uuid,uuid,uuid)') is not null, 'block project resolver exists');
select is(
  private.resolve_daily_report_block_project('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', null),
  'e3000000-0000-0000-0000-000000000001'::uuid,
  'linked KR derives its project'
);
select is(
  private.resolve_daily_report_block_project('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', null, 'e3000000-0000-0000-0000-000000000001'),
  'e3000000-0000-0000-0000-000000000001'::uuid,
  'member may explicitly attribute unlinked work'
);
select is(
  private.resolve_daily_report_block_project('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', null, 'e3000000-0000-0000-0000-000000000001'),
  'e3000000-0000-0000-0000-000000000001'::uuid,
  'project leader may explicitly attribute own work'
);
select throws_ok(
  $$select private.resolve_daily_report_block_project('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', null, 'e3000000-0000-0000-0000-000000000002')$$,
  '42501', 'Daily OKR project is not available to the current user',
  'member cannot attribute work to another project'
);
select throws_ok(
  $$select private.resolve_daily_report_block_project('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', null, null)$$,
  '42501', 'Daily OKR project is not available to the current user',
  'new unlinked work requires a project'
);

select * from finish();
rollback;
