begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures: one organization with two managers, a project leader, an employee,
-- an HR user, and an administrator.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('d1000000-0000-0000-0000-000000000001'::uuid, 'mgr1@dr.test'),
  ('d1000000-0000-0000-0000-000000000002'::uuid, 'mgr2@dr.test'),
  ('d1000000-0000-0000-0000-000000000003'::uuid, 'pl@dr.test'),
  ('d1000000-0000-0000-0000-000000000004'::uuid, 'emp@dr.test'),
  ('d1000000-0000-0000-0000-000000000005'::uuid, 'hr@dr.test'),
  ('d1000000-0000-0000-0000-000000000006'::uuid, 'admin@dr.test')
) users(id, email);

insert into public.organizations (id, name) values ('d2000000-0000-0000-0000-000000000001', 'DR Test Organization');

insert into public.profiles (id, organization_id, display_name, clearance) values
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Manager One', 'confidential'),
  ('d1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'Manager Two', 'confidential'),
  ('d1000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000001', 'Project Leader', 'confidential'),
  ('d1000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000001', 'Employee', 'confidential'),
  ('d1000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000001', 'Human Resources', 'confidential'),
  ('d1000000-0000-0000-0000-000000000006', 'd2000000-0000-0000-0000-000000000001', 'Administrator', 'confidential');

update public.profiles set approval_status = 'approved';

insert into public.user_roles (organization_id, profile_id, role) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'management'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'management'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', 'project_leader'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 'employee'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 'hr'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000006', 'administrator');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Any organization member may save a daily report with no linked KR.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select * from public.save_daily_report(
    current_date, 'submitted', 'confidential',
    '[{"dailyObjective":"招聘推进","workDescription":"筛选简历","result":"完成3人初筛","hours":3,"linkedKeyResultId":""}]'::jsonb,
    '[]'::jsonb)$$,
  'employee saves a daily report without a linked KR'
);
select is(
  (select count(*) from public.daily_reports dr where dr.author_id = 'd1000000-0000-0000-0000-000000000004' and dr.report_date = current_date and dr.project_id is null),
  1::bigint,
  'unlinked report resolves to a null project'
);
select is(
  (select count(*) from public.daily_okr_blocks b join public.daily_reports dr on dr.id = b.report_id where dr.author_id = 'd1000000-0000-0000-0000-000000000004' and b.linked_key_result_id is null),
  1::bigint,
  'unlinked block stores a null linked_key_result_id'
);

select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select * from public.save_daily_report(
    current_date, 'submitted', 'confidential',
    '[{"dailyObjective":"日常支持","workDescription":"处理工单","result":"闭环10单","hours":2,"linkedKeyResultId":""}]'::jsonb,
    '[]'::jsonb)$$,
  'project leader without a KR still saves a daily report'
);

select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000006', true);
select lives_ok(
  $$select * from public.save_daily_report(
    current_date, 'submitted', 'confidential',
    '[{"dailyObjective":"系统巡检","workDescription":"核对权限","result":"完成巡检","hours":1,"linkedKeyResultId":""}]'::jsonb,
    '[]'::jsonb)$$,
  'administrator saves a daily report'
);
select is(
  (select count(*) from public.daily_reports dr where dr.author_id = 'd1000000-0000-0000-0000-000000000006' and dr.report_date = current_date),
  1::bigint,
  'administrator is stored as the report author via profiles.id'
);

-- ---------------------------------------------------------------------------
-- 2. Management reports stay submitted and out of the review queue.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.save_daily_report(
    current_date, 'submitted', 'confidential',
    '[{"dailyObjective":"经营回顾","workDescription":"汇总数据","result":"输出周报","hours":1,"linkedKeyResultId":""}]'::jsonb,
    '[]'::jsonb)$$,
  'manager saves a daily report'
);
select is(
  (select status::text from public.daily_reports dr where dr.author_id = 'd1000000-0000-0000-0000-000000000001' and dr.report_date = current_date),
  'submitted',
  'manager report stays submitted (no auto-confirm)'
);

select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.confirm_daily_report(
    (select id from public.daily_reports where author_id = 'd1000000-0000-0000-0000-000000000001' and report_date = current_date),
    1)$$,
  '42501', 'Only an authorized daily report reviewer can confirm this report',
  'a management-authored report is excluded from the review queue'
);

select * from finish();
rollback;
