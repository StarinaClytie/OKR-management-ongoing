begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

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
  ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@rls.test'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'management@rls.test'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'leader@rls.test'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'author@rls.test'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'peer@rls.test'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'subordinate@rls.test'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'unrelated@rls.test'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'collaborator@rls.test'),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'hr@rls.test'),
  ('10000000-0000-0000-0000-000000000010'::uuid, 'other-org@rls.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'RLS Organization'),
  ('20000000-0000-0000-0000-000000000002', 'Other Organization');

insert into public.profiles (id, organization_id, display_name, clearance)
select id, '20000000-0000-0000-0000-000000000001', name, clearance
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'Administrator', 'restricted'::public.classification),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'Management', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'Project Leader', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'Author', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'Peer', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'Subordinate', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'Unrelated', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'Collaborator', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'HR', 'confidential'::public.classification)
) as profiles(id, name, clearance);

insert into public.profiles (id, organization_id, display_name) values
  ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', 'Other Org');

insert into public.user_roles (organization_id, profile_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'administrator'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'management'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'project_leader'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'employee'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'employee'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'employee'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'employee'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008', 'employee'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000009', 'hr'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010', 'management');

insert into public.reporting_lines (organization_id, manager_id, subordinate_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000006');

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'RLS Project', '10000000-0000-0000-0000-000000000003', 'confidential', current_date - 1, current_date + 30);

insert into public.project_members (organization_id, project_id, profile_id) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005');

insert into public.collaboration_links (organization_id, grantor_id, grantee_id, project_id, expires_at) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', now() + interval '1 day');

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Confidential Objective', 'confidential', current_date - 1, current_date + 30);
insert into public.key_results (id, organization_id, objective_id, project_id, owner_id, title, measurement_type, target_value, classification, start_date, due_date) values
  ('41000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Planned KR', 'percentage', 100, 'confidential', current_date - 1, current_date + 30);

insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification, total_hours) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', current_date, 'submitted', 'confidential', 7.5);

insert into public.daily_report_revisions (id, organization_id, report_id, revision_number, editor_id, daily_objective, objective_progress, classification) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, '10000000-0000-0000-0000-000000000004', 'Confidential report body', 25, 'confidential');
update public.daily_reports set current_revision = 1 where id = '50000000-0000-0000-0000-000000000001';

set local role authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(private.current_profile_id(), '10000000-0000-0000-0000-000000000004'::uuid, 'current profile comes from auth uid');
select ok(private.has_role('employee'), 'active role is recognized');
select ok(private.has_clearance('confidential'), 'owner has clearance to own confidential content');
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'author reads own report detail');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'management reads organization report detail');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'project leader reads member report detail');
select is_empty(
  $$update public.daily_report_revisions set daily_objective = 'leader edit' where id = '60000000-0000-0000-0000-000000000001' returning id$$,
  'project leader cannot edit member report body'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'project peer reads project-related detail');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000008', true);
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'active collaborator reads granted project detail');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is((select count(*) from public.objectives), 1::bigint, 'subordinate reads upstream objective summary');
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'subordinate cannot read upstream report body');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'HR cannot read report body');
select is((select count(*) from public.hr_workload), 1::bigint, 'HR reads workload-only view');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'hr_workload'), array['user_id','report_date','project_id','total_hours','planned_hours','capacity_hours']::text[], 'HR view exposes only approved workload fields');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'administrator role alone cannot read confidential business body');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'unrelated employee receives zero report rows');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.create_daily_report(
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    current_date + 1,
    'draft', 'confidential', 2,
    'Created through RPC', 0,
    '[{"title":"KR zero","measurementType":"percentage","progress":0,"hours":2,"workNote":"Started","measurementData":{}}]'::jsonb,
    '[]'::jsonb
  )$$,
  'author creates report and initial immutable revision atomically'
);
select is((select current_revision from public.daily_reports where report_date = current_date + 1), 1, 'create RPC sets revision exactly once');
select is(
  public.update_daily_report(
    (select id from public.daily_reports where report_date = current_date + 1),
    1, 'submitted', 'confidential', 3,
    'Updated through RPC', 10,
    '[{"title":"KR zero","measurementType":"percentage","progress":10,"hours":3,"workNote":"Continued","measurementData":{}}]'::jsonb,
    '[]'::jsonb
  ),
  2,
  'update RPC increments revision exactly once'
);
select throws_ok(
  $$select public.update_daily_report(
    (select id from public.daily_reports where report_date = current_date + 1),
    1, 'submitted', 'confidential', 3,
    'Stale update', 20, '[]'::jsonb, '[]'::jsonb
  )$$,
  '40001', 'Daily report revision conflict', 'stale expected revision is rejected'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.update_daily_report(
    (select id from public.daily_reports where report_date = current_date + 1),
    2, 'submitted', 'confidential', 3,
    'Leader update', 20, '[]'::jsonb, '[]'::jsonb
  )$$,
  '42501', 'Daily report is not editable by the current user', 'project leader cannot use RPC to edit member report'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.save_progress_plan('41000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('date', (current_date + 30)::text, 'value', 100)))$$,
  'KR owner saves a validated progress plan'
);
select is((select count(*) from public.progress_baselines where key_result_id = '41000000-0000-0000-0000-000000000001'), 1::bigint, 'save progress plan replaces points atomically');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.save_milestones('30000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('title', 'Release gate', 'plannedDate', (current_date + 10)::text, 'keyResultId', '41000000-0000-0000-0000-000000000001')))$$,
  'project leader saves project milestones'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.save_progress_plan('41000000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', 'Progress plan is not editable by the current user', 'unrelated employee cannot replace a progress plan'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.save_risk('30000000-0000-0000-0000-000000000001', 'Delivery risk', 2, 3, 'Dependency delay', 'Fallback', current_date, 'confidential')$$,
  'project leader saves an explained calculated risk'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.save_risk('30000000-0000-0000-0000-000000000001', 'Unauthorized', 1, 1, 'No access', 'None', current_date, 'internal')$$,
  '42501', 'Risk is not editable by the current user', 'unrelated employee cannot save project risk'
);

select * from finish();
rollback;
