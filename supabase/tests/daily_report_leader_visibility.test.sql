begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

-- Project A: Alice leads, Bob is a member and authors the report under a KR she
-- owns. Project B: Erin leads, Dana authors an unrelated report.
--
-- The project leader of Project A is deliberately *not* the objective owner for
-- the second scenario: `set_project_leader` rewrites `projects.leader_id` alone,
-- so the two identities diverge in production and the visibility rule must
-- follow `projects.leader_id`.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'alice@leader-visibility.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bob@leader-visibility.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'erin@leader-visibility.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dana@leader-visibility.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'mona@leader-visibility.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'frank@leader-visibility.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name) values
  ('92000000-0000-0000-0000-000000000001', 'Leader Visibility Organization');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status, onboarding_completed) values
  ('91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Alice', 'internal', 'approved', true),
  ('91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'Bob', 'internal', 'approved', true),
  ('91000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', 'Erin', 'internal', 'approved', true),
  ('91000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', 'Dana', 'internal', 'approved', true),
  ('91000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', 'Mona', 'confidential', 'approved', true),
  ('91000000-0000-0000-0000-000000000006', '92000000-0000-0000-0000-000000000001', 'Frank', 'internal', 'approved', true);

insert into public.user_roles (organization_id, profile_id, role) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'project_leader'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'project_leader'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'management'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000006', 'project_leader');

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Project A', '91000000-0000-0000-0000-000000000001', 'internal', current_date - 30, current_date + 30),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'Project B', '91000000-0000-0000-0000-000000000003', 'internal', current_date - 30, current_date + 30);

insert into public.project_members (organization_id, project_id, profile_id) values
  ('92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002'),
  ('92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000003'),
  ('92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004');

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Project A Objective', 'internal', current_date - 30, current_date + 30),
  -- Frank owns Project B's objective while Erin leads the project: the two
  -- identities diverge exactly as they do after `set_project_leader`.
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000006', 'Project B Objective', 'internal', current_date - 30, current_date + 30);

insert into public.key_results (
  id, organization_id, objective_id, project_id, owner_id, title, notes,
  measurement_type, target_value, classification, start_date, due_date
) values
  ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', '提升产品交付效率', '完成 OKR 系统核心功能开发', 'percentage', 100, 'internal', current_date - 30, current_date + 30),
  ('95000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004', 'Project B KR', null, 'percentage', 100, 'internal', current_date - 30, current_date + 30);

insert into public.daily_reports (
  id, organization_id, author_id, project_id, objective_id, report_date,
  status, classification, total_hours, current_revision
) values
  ('96000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', date '2026-08-24', 'submitted', 'internal', 8, 1),
  -- Draft: detail access must not depend on report status.
  ('96000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', date '2026-08-23', 'draft', 'internal', 4, 1),
  ('96000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', '93000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000002', date '2026-08-24', 'submitted', 'internal', 8, 1),
  -- Confirmed and returned: detail access must not depend on report status.
  ('96000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', date '2026-08-22', 'confirmed', 'internal', 4, 1),
  ('96000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', date '2026-08-21', 'returned', 'internal', 4, 1);

insert into public.daily_report_revisions (
  id, organization_id, report_id, revision_number, editor_id,
  daily_objective, objective_progress, classification
) values
  ('97000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', 1, '91000000-0000-0000-0000-000000000002', 'Bob submitted work', 50, 'internal'),
  ('97000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', 1, '91000000-0000-0000-0000-000000000002', 'Bob draft work', 20, 'internal'),
  ('97000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000003', 1, '91000000-0000-0000-0000-000000000004', 'Dana work', 50, 'internal'),
  ('97000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000004', 1, '91000000-0000-0000-0000-000000000002', 'Bob confirmed work', 80, 'internal'),
  ('97000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000005', 1, '91000000-0000-0000-0000-000000000002', 'Bob returned work', 60, 'internal');

insert into public.daily_okr_blocks (
  id, organization_id, report_id, revision_id, position, daily_objective,
  linked_key_result_id, work_description, hours, result, key_results, evidence_links
) values
  ('98000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', '97000000-0000-0000-0000-000000000001', 1, 'Bob today O', '95000000-0000-0000-0000-000000000001', '完成接口联调', 8, '接口通过', '[{"title":"完成接口联调"}]'::jsonb, '[]'::jsonb),
  ('98000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', '97000000-0000-0000-0000-000000000002', 1, 'Bob draft O', '95000000-0000-0000-0000-000000000001', '整理草稿', 4, '草稿完成', '[{"title":"整理草稿"}]'::jsonb, '[]'::jsonb),
  ('98000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000003', '97000000-0000-0000-0000-000000000003', 1, 'Dana today O', '95000000-0000-0000-0000-000000000002', 'Project B work', 8, 'Done', '[{"title":"Project B work"}]'::jsonb, '[]'::jsonb),
  ('98000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000004', '97000000-0000-0000-0000-000000000004', 1, 'Bob confirmed O', '95000000-0000-0000-0000-000000000001', '确认完成', 4, '已确认', '[{"title":"确认完成"}]'::jsonb, '[]'::jsonb),
  ('98000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000005', '97000000-0000-0000-0000-000000000005', 1, 'Bob returned O', '95000000-0000-0000-0000-000000000001', '退回重做', 4, '已退回', '[{"title":"退回重做"}]'::jsonb, '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- Alice: leader of Project A and owner of its objective.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.daily_reports),
  4,
  'project leader reads exactly their own project members reports'
);
select ok(
  private.can_read_report_detail('96000000-0000-0000-0000-000000000002'),
  'project leader reads a member draft report'
);
select ok(
  private.can_read_report_detail('96000000-0000-0000-0000-000000000004'),
  'project leader reads a member confirmed report'
);
select ok(
  private.can_read_report_detail('96000000-0000-0000-0000-000000000005'),
  'project leader reads a member returned report'
);
select ok(
  not private.can_read_report_detail('96000000-0000-0000-0000-000000000003'),
  'project leader cannot read another projects report'
);
select is(
  (select count(*)::integer from public.daily_okr_blocks),
  4,
  'project leader reads blocks only for reports they can read'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000001')->'blocks'->0->'keyResult'->>'title'),
  '提升产品交付效率',
  'report detail carries the linked quarterly KR title'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000001')->'blocks'->0->'keyResult'->>'description'),
  '完成 OKR 系统核心功能开发',
  'report detail carries the linked quarterly KR description'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000001')->'blocks'->0->'keyResult'->>'ownerName'),
  'Bob',
  'report detail carries the linked quarterly KR owner name'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000002')->>'status'),
  'draft',
  'report detail opens regardless of report status'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000004')->>'status'),
  'confirmed',
  'a confirmed member report opens for the project leader'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000005')->>'status'),
  'returned',
  'a returned member report opens for the project leader'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000001')->>'canComment'),
  'true',
  'project leader may comment on a member report'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000001')->>'canConfirm'),
  'true',
  'project leader may confirm a submitted member report'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000002')->>'canConfirm'),
  'false',
  'a draft member report is readable but not confirmable'
);
select throws_ok(
  $$select public.get_daily_report_detail('96000000-0000-0000-0000-000000000003')$$,
  '42501', 'Daily report is not available',
  'project leader cannot open another projects report detail'
);

-- ---------------------------------------------------------------------------
-- Erin: leads Project B but does not own its objective.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);

select ok(
  private.can_read_report_detail('96000000-0000-0000-0000-000000000003'),
  'project leadership alone grants member report visibility'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000003')->>'canComment'),
  'true',
  'project leadership alone grants member report review'
);
select ok(
  not private.can_read_report_detail('96000000-0000-0000-0000-000000000001'),
  'a leader stays out of a project they do not lead'
);

-- ---------------------------------------------------------------------------
-- Bob: an ordinary member.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::integer from public.daily_reports),
  4,
  'an employee reads only their own reports'
);
select ok(
  not private.can_read_report_detail('96000000-0000-0000-0000-000000000003'),
  'an employee cannot read a peer report from another project'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000001')->>'canConfirm'),
  'false',
  'an author cannot confirm their own report'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000002')->>'status'),
  'draft',
  'an author opens their own draft report detail'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000004')->>'status'),
  'confirmed',
  'an author opens their own confirmed report detail'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000005')->>'status'),
  'returned',
  'an author opens their own returned report detail'
);
select throws_ok(
  $$select public.get_daily_report_detail('96000000-0000-0000-0000-000000000003')$$,
  '42501', 'Daily report is not available',
  'an employee cannot open a peer report from another project'
);

-- ---------------------------------------------------------------------------
-- Mona: management.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000005', true);

select is(
  (select count(*)::integer from public.daily_reports),
  5,
  'management reads every report in the organization'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000003')->>'canComment'),
  'true',
  'management may review any member report'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000004')->>'status'),
  'confirmed',
  'management opens a confirmed report'
);
select is(
  (select public.get_daily_report_detail('96000000-0000-0000-0000-000000000005')->>'status'),
  'returned',
  'management opens a returned report'
);

select * from finish();
rollback;
