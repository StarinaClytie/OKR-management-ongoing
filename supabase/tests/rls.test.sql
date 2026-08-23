begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

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
  ('10000000-0000-0000-0000-000000000010'::uuid, 'other-org@rls.test'),
  ('10000000-0000-0000-0000-000000000011'::uuid, 'other-leader@rls.test')
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
  ('10000000-0000-0000-0000-000000000009'::uuid, 'HR', 'confidential'::public.classification),
  ('10000000-0000-0000-0000-000000000011'::uuid, 'Other Project Leader', 'confidential'::public.classification)
) as profiles(id, name, clearance);

insert into public.profiles (id, organization_id, display_name) values
  ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', 'Other Org');

-- Existing operational users are explicitly approved (fail-closed default).
update public.profiles set approval_status = 'approved';

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
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 'project_leader'),
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
insert into public.key_results (id, organization_id, objective_id, project_id, owner_id, title, measurement_type, target_value, classification, start_date, due_date) values
  ('41000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Restricted KR', 'percentage', 100, 'restricted', current_date - 1, current_date + 30);

-- A project-leader-led objective and an employee-owned KR under it, so the
-- project leader can read a report through its Daily OKR block (project-scoped).
insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Leader Objective', 'confidential', current_date - 1, current_date + 30);
insert into public.key_results (id, organization_id, objective_id, project_id, owner_id, title, measurement_type, target_value, classification, start_date, due_date) values
  ('41000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Leader-linked KR', 'percentage', 100, 'confidential', current_date - 1, current_date + 30);
insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role) values
  ('20000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'owner');

insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification, total_hours) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', current_date, 'submitted', 'confidential', 7.5);

insert into public.daily_report_revisions (id, organization_id, report_id, revision_number, editor_id, daily_objective, objective_progress, classification) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, '10000000-0000-0000-0000-000000000004', 'Confidential report body', 25, 'confidential');
insert into public.daily_okr_blocks (organization_id, report_id, revision_id, position, daily_objective, linked_key_result_id, hours, result, key_results) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 1, 'Confidential report body', '41000000-0000-0000-0000-000000000003', 7.5, '', '[]'::jsonb);
update public.daily_reports set current_revision = 1 where id = '50000000-0000-0000-0000-000000000001';

set local role authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(private.current_profile_id(), '10000000-0000-0000-0000-000000000004'::uuid, 'current profile comes from auth uid');
select ok(private.has_role('employee'), 'active role is recognized');
select ok(private.has_clearance('confidential'), 'owner has clearance to own confidential content');
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'author reads own report detail');
select throws_ok(
  $$update public.key_results set progress = 40 where id = '41000000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table key_results', 'KR owner cannot directly overwrite actual progress'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'management reads organization report detail');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.daily_report_revisions), 1::bigint, 'project leader reads member report detail');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.list_eligible_kr_owners('40000000-0000-0000-0000-000000000002')$$,
  '42501', 'Objective is not available for KR assignment', 'unrelated employee cannot enumerate KR owner candidates'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$select public.list_eligible_kr_owners('40000000-0000-0000-0000-000000000002')$$,
  '42501', 'Objective is not available for KR assignment', 'project leader cannot enumerate candidates for another leader objective'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is_empty(
  $$update public.daily_report_revisions set daily_objective = 'leader edit' where id = '60000000-0000-0000-0000-000000000001' returning id$$,
  'project leader cannot edit member report body'
);
select throws_ok(
  $$update public.key_results set progress = 60 where id = '41000000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table key_results', 'project leader cannot directly overwrite employee actual progress'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'project peer cannot read project-related detail without a scoped block');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000008', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'active collaborator cannot read report detail without a scoped block');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is((select count(*) from public.objectives), 1::bigint, 'subordinate reads upstream objective summary');
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'subordinate cannot read upstream report body');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'HR cannot read report body');
select is((select count(*) from public.daily_reports), 0::bigint, 'HR cannot count hidden project reports directly');
select is((select count(*) from public.projects), 0::bigint, 'HR cannot count hidden projects directly');
select is((select count(*) from public.hr_workload), 1::bigint, 'HR reads workload-only view');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'hr_workload'), array['user_id','report_date','total_hours','planned_hours','capacity_hours']::text[], 'HR workload view exposes neither project IDs nor project/report counts');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'administrator role alone cannot read confidential business body');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.daily_report_revisions), 0::bigint, 'unrelated employee receives zero report rows');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.create_daily_report(
    current_date + 1,
    'draft', 'confidential',
    '[{"dailyObjective":"Created through RPC","linkedKeyResultId":"41000000-0000-0000-0000-000000000001","hours":2,"result":"","keyResults":[{"title":"KR zero"}]}]'::jsonb,
    '[]'::jsonb
  )$$,
  'author creates report and initial immutable revision atomically'
);
select is((select current_revision from public.daily_reports where report_date = current_date + 1), 1, 'create RPC sets revision exactly once');
select is(
  public.update_daily_report(
    (select id from public.daily_reports where report_date = current_date + 1),
    1, 'submitted', 'confidential',
    '[{"dailyObjective":"Updated through RPC","linkedKeyResultId":"41000000-0000-0000-0000-000000000001","hours":3,"result":"","keyResults":[{"title":"KR zero"}]}]'::jsonb,
    '[]'::jsonb
  ),
  2,
  'update RPC increments revision exactly once'
);
select throws_ok(
  $$select public.update_daily_report(
    (select id from public.daily_reports where report_date = current_date + 1),
    1, 'submitted', 'confidential',
    '[{"dailyObjective":"Stale update","linkedKeyResultId":"41000000-0000-0000-0000-000000000001","hours":3,"result":"","keyResults":[{"title":"KR zero"}]}]'::jsonb,
    '[]'::jsonb
  )$$,
  '40001', 'Daily report revision conflict', 'stale expected revision is rejected'
);
select lives_ok(
  $$select * from public.save_daily_report(
    current_date + 2, 'submitted', 'confidential',
    '[{"dailyObjective":"First save","linkedKeyResultId":"41000000-0000-0000-0000-000000000001","workDescription":"Execute owned KR","hours":2,"result":"First result","evidenceLinks":[]}]'::jsonb,
    '[]'::jsonb
  )$$,
  'first submission creates the daily report through the atomic save RPC'
);
select lives_ok(
  $$select * from public.save_daily_report(
    current_date + 2, 'submitted', 'confidential',
    '[{"dailyObjective":"Second save","linkedKeyResultId":"41000000-0000-0000-0000-000000000001","workDescription":"Continue owned KR","hours":5,"result":"Second result","evidenceLinks":[]}]'::jsonb,
    '[]'::jsonb
  )$$,
  'second same-day submission updates instead of violating the unique key'
);
select is(
  (select count(*) from public.daily_reports where author_id = '10000000-0000-0000-0000-000000000004' and report_date = current_date + 2),
  1::bigint,
  'same-day submissions keep exactly one report row'
);
select is(
  (select current_revision from public.daily_reports where author_id = '10000000-0000-0000-0000-000000000004' and report_date = current_date + 2),
  2,
  'same-day submissions append immutable revisions'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.list_report_revisions('50000000-0000-0000-0000-000000000001')), 1::bigint, 'authorized author lists immutable revision history');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.update_daily_report(
    (select id from public.daily_reports where report_date = current_date + 1),
    2, 'submitted', 'confidential',
    '[{"dailyObjective":"Leader update","linkedKeyResultId":"41000000-0000-0000-0000-000000000001","hours":3,"result":"","keyResults":[{"title":"KR zero"}]}]'::jsonb,
    '[]'::jsonb
  )$$,
  '42501', 'Daily report is not editable by the current user', 'project leader cannot use RPC to edit member report'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.save_progress_plan('41000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('date', (current_date + 30)::text, 'value', 100)))$$,
  'KR owner saves a validated progress plan'
);
select is((select count(*) from public.progress_baselines where key_result_id = '41000000-0000-0000-0000-000000000001'), 1::bigint, 'save progress plan replaces points atomically');
select lives_ok(
  $$select public.save_kr_progress('41000000-0000-0000-0000-000000000001', 40, current_date, 'Completed the first integration milestone')$$,
  'KR owner appends actual progress through the restricted RPC'
);
select is((select count(*) from public.progress_snapshots where key_result_id = '41000000-0000-0000-0000-000000000001'), 1::bigint, 'KR progress RPC appends one immutable snapshot');
select lives_ok(
  $$select public.save_kr_progress('41000000-0000-0000-0000-000000000001', 90, current_date - 1, 'Recorded an older effective update')$$,
  'KR owner may append a backdated immutable progress record'
);
select is(
  (select progress from public.key_results where id = '41000000-0000-0000-0000-000000000001'),
  40.00::numeric,
  'a backdated progress record does not replace the current effective progress'
);
select throws_ok(
  $$select public.save_kr_progress('41000000-0000-0000-0000-000000000001', 100, current_date + 1, 'Attempted future actual progress')$$,
  '22023', 'KR progress effective date cannot be in the future', 'future actual progress is rejected instead of overwriting current progress'
);
select is((select count(*) from public.progress_snapshots where key_result_id = '41000000-0000-0000-0000-000000000001'), 2::bigint, 'rejected future progress does not append a snapshot');
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
select throws_ok(
  $$select public.save_kr_progress('41000000-0000-0000-0000-000000000001', 50, current_date, 'Attempted peer update')$$,
  '42501', 'KR progress is not editable by the current user', 'non-owner employee cannot append KR progress'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Delivery risk', 2::smallint, 3::smallint, 'Dependency delay', 'Fallback', current_date, 'confidential'::public.classification, false)$$,
  'project leader saves a risk for any subject in their project'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Unauthorized', 1::smallint, 1::smallint, 'No access', 'None', current_date, 'internal'::public.classification, false)$$,
  '42501', 'Risk is not editable by the current user', 'non-owner employee cannot save a risk against another employee KR'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Downgraded subject risk', 1::smallint, 1::smallint, 'Classification mismatch', 'Use the subject classification', current_date, 'internal'::public.classification, false)$$,
  '42501', 'Risk classification cannot be lower than its protected context', 'employee cannot classify a risk below its confidential subject or project'
);
select lives_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'KR risk', 1::smallint, 1::smallint, 'A local dependency is delayed', 'Coordinate the dependency', current_date, 'confidential'::public.classification, false)$$,
  'employee saves a risk against their owned KR'
);
select lives_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, null::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'Objective risk', 1::smallint, 2::smallint, 'Scope uncertainty', 'Clarify scope', current_date, 'confidential'::public.classification, false)$$,
  'employee saves a risk against their owned objective'
);
select lives_ok(
  $$select public.set_my_locale('en')$$,
  'profile owner saves their locale through the restricted RPC'
);
select is((select preferred_locale from public.profiles where id = '10000000-0000-0000-0000-000000000004'), 'en', 'locale RPC only changes the signed-in profile preference');
select ok(
  not has_table_privilege('authenticated', 'public.progress_snapshots', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.progress_snapshots', 'DELETE')
    and not has_table_privilege('authenticated', 'public.progress_snapshots', 'INSERT'),
  'employees have no direct progress snapshot mutation privileges'
);
select lives_ok(
  $$select public.save_owned_risk((select id from public.risks where title = 'KR risk'), '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Resolved KR risk', 1::smallint, 1::smallint, 'The dependency is available', 'No further action needed', current_date, 'confidential'::public.classification, true)$$,
  'employee resolves their own risk event'
);
select ok((select resolved_at is not null from public.risks where title = 'Resolved KR risk'), 'resolving a risk records its resolution time');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.save_owned_risk((select id from public.risks where title = 'Resolved KR risk'), '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Peer overwrite', 1::smallint, 1::smallint, 'No access', 'None', current_date, 'confidential'::public.classification, false)$$,
  '42501', 'Risk is not editable by the current user', 'a peer cannot update another employee risk event'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.save_owned_risk((select id from public.risks where title = 'Resolved KR risk'), '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Downgraded existing risk', 1::smallint, 1::smallint, 'Classification downgrade', 'Keep the original classification', current_date, 'internal'::public.classification, false)$$,
  '42501', 'Risk classification cannot be lower than its protected context', 'project leader cannot downgrade an existing confidential risk'
);
select lives_ok(
  $$select public.save_owned_risk((select id from public.risks where title = 'Resolved KR risk'), '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'Leader-reviewed risk', 1::smallint, 1::smallint, 'Leader verified the mitigation', 'Continue monitoring', current_date, 'confidential'::public.classification, false)$$,
  'project leader updates a member risk event in their project'
);
select throws_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000002'::uuid, null::uuid, 'Restricted subject', 1::smallint, 1::smallint, 'Known restricted subject', 'No action', current_date, 'confidential'::public.classification, false)$$,
  '42501', 'Risk is not editable by the current user', 'a hidden subject UUID is indistinguishable from an unauthorized subject'
);
select throws_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '41000000-0000-0000-0000-000000000099'::uuid, null::uuid, 'Unknown subject', 1::smallint, 1::smallint, 'Unknown subject', 'No action', current_date, 'confidential'::public.classification, false)$$,
  '42501', 'Risk is not editable by the current user', 'a nonexistent subject UUID returns the same response as a hidden subject UUID'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000009', true);
select throws_ok(
  $$select public.save_kr_progress('41000000-0000-0000-0000-000000000001', 60, current_date, 'HR attempted update')$$,
  '42501', 'KR progress is not editable by the current user', 'HR cannot append employee KR progress'
);
select throws_ok(
  $$select public.save_owned_risk(null::uuid, '30000000-0000-0000-0000-000000000001'::uuid, null::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'HR risk', 1::smallint, 1::smallint, 'No permission', 'None', current_date, 'internal'::public.classification, false)$$,
  '42501', 'Risk is not editable by the current user', 'HR cannot save project risks'
);

select * from finish();
rollback;
