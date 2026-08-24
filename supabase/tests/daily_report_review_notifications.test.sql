begin;

create extension if not exists pgtap with schema extensions;
select plan(95);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'author@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'leader-a@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'leader-b@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'unrelated@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'management@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'administrator@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'low-clearance@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'outsider@report-review.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name) values
  ('82000000-0000-0000-0000-000000000001', 'Report Review Organization'),
  ('82000000-0000-0000-0000-000000000002', 'Outside Organization');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status) values
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'Report Author', 'confidential', 'approved'),
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 'Leader A', 'internal', 'approved'),
  ('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 'Leader B', 'confidential', 'approved'),
  ('81000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000001', 'Unrelated Leader', 'confidential', 'approved'),
  ('81000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000001', 'Management Reviewer', 'confidential', 'approved'),
  ('81000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000001', 'Administrator', 'confidential', 'approved'),
  ('81000000-0000-0000-0000-000000000007', '82000000-0000-0000-0000-000000000001', 'Low Clearance Manager', 'public', 'approved'),
  ('81000000-0000-0000-0000-000000000008', '82000000-0000-0000-0000-000000000002', 'Outside Manager', 'confidential', 'approved');

insert into public.user_roles (organization_id, profile_id, role) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'employee'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'project_leader'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'project_leader'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', 'project_leader'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000005', 'management'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000006', 'administrator'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000007', 'management'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000008', 'management');

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'Mixed Leader Project', '81000000-0000-0000-0000-000000000004', 'internal', current_date - 30, current_date + 30);

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'Leader A Objective', 'internal', current_date - 30, current_date + 30),
  ('84000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'Leader B Objective', 'internal', current_date - 30, current_date + 30);

insert into public.key_results (
  id, organization_id, objective_id, project_id, owner_id, title,
  measurement_type, target_value, classification, start_date, due_date
) values
  ('85000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Leader A KR', 'percentage', 100, 'internal', current_date - 30, current_date + 30),
  ('85000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Leader B KR', 'percentage', 100, 'internal', current_date - 30, current_date + 30);

insert into public.daily_reports (
  id, organization_id, author_id, project_id, objective_id, report_date,
  status, classification, total_hours, current_revision
) values (
  '86000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000001', date '2026-08-24',
  'submitted', 'internal', 8, 0
);

insert into public.daily_report_revisions (
  id, organization_id, report_id, revision_number, editor_id,
  daily_objective, objective_progress, classification
) values (
  '87000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  '86000000-0000-0000-0000-000000000001', 1, '81000000-0000-0000-0000-000000000001',
  'Mixed Objective Work', 50, 'internal'
);

insert into public.daily_okr_blocks (
  id, organization_id, report_id, revision_id, position, daily_objective,
  linked_key_result_id, work_description, hours, result, key_results, evidence_links
) values
  ('88000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', 1, 'Leader A work', '85000000-0000-0000-0000-000000000001', 'Measure sample A', 3, 'A complete', '[{"id":"daily-a","title":"Measure sample A"}]'::jsonb, '[]'::jsonb),
  ('88000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', 2, 'Leader B work', '85000000-0000-0000-0000-000000000002', 'Measure sample B', 5, 'B complete', '[{"id":"daily-b","title":"Measure sample B"}]'::jsonb, '[]'::jsonb);

update public.daily_reports
set current_revision = 1
where id = '86000000-0000-0000-0000-000000000001';

insert into public.report_attachments (
  id, organization_id, report_id, revision_id, daily_okr_block_id, uploader_id,
  original_name, display_name, storage_path, mime_type, byte_size,
  classification, state, entry_position
) values
  ('89000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'leader-a.pdf', 'Leader A evidence', 'organization/secret/path/leader-a.pdf', 'application/pdf', 128, 'internal', 'uploaded', 1),
  ('89000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'confidential-a.pdf', 'Confidential A evidence', 'organization/secret/path/confidential-a.pdf', 'application/pdf', 128, 'confidential', 'uploaded', 1),
  ('89000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'leader-b.pdf', 'Leader B evidence', 'organization/secret/path/leader-b.pdf', 'application/pdf', 128, 'internal', 'uploaded', 2);

insert into public.report_attachment_revisions (
  organization_id, report_id, revision_id, daily_okr_block_id,
  attachment_id, display_name, classification
) values
  ('82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000001', 'Leader A evidence', 'internal'),
  ('82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000002', 'Confidential A evidence', 'confidential'),
  ('82000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000002', '89000000-0000-0000-0000-000000000003', 'Leader B evidence', 'internal');

create temporary table review_notification_ids (
  own_id uuid,
  foreign_id uuid
);
grant select, insert, update on review_notification_ids to authenticated;

-- Schema, immutability, and controlled interfaces.
select has_table('public', 'daily_report_comments', 'daily report comments table exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = to_regclass('public.daily_report_comments')),
  'daily report comments enforce row-level security'
);
select ok(not has_table_privilege('authenticated', 'public.daily_report_comments', 'INSERT'), 'browser cannot insert report comments directly');
select ok(not has_table_privilege('authenticated', 'public.daily_report_comments', 'UPDATE'), 'browser cannot update immutable report comments');
select ok(not has_table_privilege('authenticated', 'public.daily_report_comments', 'DELETE'), 'browser cannot delete immutable report comments');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.user_notifications')
      and conname = 'user_notifications_comment_id_fkey'
      and contype = 'f'
  ),
  'notifications reference report comments'
);
select ok(
  exists (
    select 1 from pg_index
    where indexrelid = to_regclass('public.user_notifications_confirmed_once_idx')
      and indisunique
      and indpred is not null
  ),
  'confirmed report notifications have a partial unique index'
);
select ok(to_regprocedure('public.get_daily_report_detail(uuid)') is not null, 'report detail RPC exists');
select ok(to_regprocedure('public.comment_daily_report(uuid,text)') is not null, 'report comment RPC exists');
select ok(to_regprocedure('public.confirm_daily_report(uuid,integer)') is not null, 'report confirmation RPC exists');
select ok(to_regprocedure('public.list_my_notifications(integer,timestamp with time zone,uuid)') is not null, 'notification list RPC exists');
select ok(to_regprocedure('public.mark_notification_read(uuid)') is not null, 'single notification read RPC exists');
select ok(to_regprocedure('public.mark_all_notifications_read()') is not null, 'bulk notification read RPC exists');
select ok(to_regprocedure('private.can_review_daily_report_block(uuid,uuid,uuid)') is not null, 'block reviewer helper exists');
select ok(to_regprocedure('private.can_review_daily_report(uuid,uuid)') is not null, 'report reviewer helper exists');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')$$,
  'author reads full own detail'
);
select is(
  (select array_agg(key order by key) from jsonb_object_keys(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')) key),
  array['authorId', 'authorName', 'blocks', 'canComment', 'canConfirm', 'comments', 'currentRevision', 'date', 'hours', 'id', 'status'],
  'report detail has the fixed top-level JSON shape'
);
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'id', '86000000-0000-0000-0000-000000000001', 'detail identifies the requested report');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'authorName', 'Report Author', 'detail resolves the author display name');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'date', '2026-08-24', 'detail serializes the business date');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'status', 'submitted', 'detail returns report status');
select is((public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'hours')::numeric, 8::numeric, 'detail returns total report hours');
select is((public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'currentRevision')::integer, 1, 'detail returns the current revision');
select is(jsonb_array_length(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks'), 2, 'author receives every current-revision block');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canComment', 'false', 'author cannot comment through the reviewer boundary');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canConfirm', 'false', 'author cannot confirm through the reviewer boundary');
select is(
  (select sum(jsonb_array_length(block->'attachments'))::integer from jsonb_array_elements(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks') block),
  3,
  'author receives all attachment metadata allowed by clearance'
);
select is(
  (
    select array_agg(distinct key order by key)
    from jsonb_array_elements(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks') block
    cross join lateral jsonb_array_elements(block->'attachments') attachment
    cross join lateral jsonb_object_keys(attachment) key
  ),
  array['attachmentId', 'classification', 'displayName'],
  'attachment objects expose only identifiers, display names, and classifications'
);
select ok(
  public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')::text not like '%organization/secret/path%',
  'report detail never exposes storage paths'
);
select is(jsonb_array_length(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'comments'), 0, 'new report detail starts without comments');
select throws_ok(
  $$select public.comment_daily_report('86000000-0000-0000-0000-000000000001', 'self review')$$,
  '42501', 'Daily report is not available',
  'report author cannot add a reviewer comment'
);

set local role postgres;
select ok(private.can_review_daily_report('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002'), 'direct leader has report review scope');
select ok(private.can_review_daily_report_block('86000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002'), 'direct leader has scope for their Objective block');
select ok(not private.can_review_daily_report_block('86000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002'), 'direct leader has no scope for another leader block');
select ok(not private.can_review_daily_report('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001'), 'employee author is not also a reviewer');
update public.user_roles set role = 'management' where profile_id = '81000000-0000-0000-0000-000000000001';
select ok(not private.can_review_daily_report('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001'), 'report author is never a reviewer even with a management role');
update public.user_roles set role = 'employee' where profile_id = '81000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')$$,
  'direct leader reads authorized report detail'
);
select is(jsonb_array_length(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks'), 1, 'direct leader sees only blocks in their Objective scope');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks'->0->>'id', '88000000-0000-0000-0000-000000000001', 'direct leader receives the correct scoped block');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canComment', 'true', 'direct leader can comment');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canConfirm', 'true', 'direct leader can confirm a submitted report');
select is(jsonb_array_length(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks'->0->'attachments'), 1, 'leader attachment metadata is also filtered by clearance');
select ok(
  not jsonb_path_exists(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001'), '$.blocks[*].attachments[*] ? (@.classification == "confidential")'),
  'leader cannot infer an attachment above their clearance'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks'->0->>'id', '88000000-0000-0000-0000-000000000002', 'second leader sees only the second Objective block');

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')$$,
  '42501', 'Daily report is not available',
  'unrelated leader cannot read report detail even when assigned as project leader'
);
select throws_ok(
  $$select public.comment_daily_report('86000000-0000-0000-0000-000000000001', 'no')$$,
  '42501', 'Daily report is not available',
  'unrelated leader rejected'
);
select throws_ok(
  $$select public.confirm_daily_report('86000000-0000-0000-0000-000000000001', 1)$$,
  '42501', 'Only an authorized daily report reviewer can confirm this report',
  'unrelated leader cannot confirm through project-level authority'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')$$,
  '42501', 'Daily report is not available',
  'administrator alone rejected'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')$$,
  '42501', 'Daily report is not available',
  'management without report clearance is rejected'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000008', true);
select throws_ok(
  $$select public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')$$,
  '42501', 'Daily report is not available',
  'management cannot cross organization boundaries'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000005', true);
select is(jsonb_array_length(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'blocks'), 2, 'management sees all current blocks with sufficient clearance');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canConfirm', 'true', 'management can confirm a submitted report');

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.comment_daily_report('86000000-0000-0000-0000-000000000001', '  Please add measurement data  ')$$,
  'direct leader comments'
);
set local role postgres;
select is((select body from public.daily_report_comments), 'Please add measurement data', 'comment body is trimmed before storage');
select is((select count(*) from public.user_notifications where notification_type = 'daily_report_comment'), 1::bigint, 'comment creates one notification');
select is((select count(*) from public.user_notifications where recipient_id <> '81000000-0000-0000-0000-000000000001'), 0::bigint, 'notifications target only report author');
select is(
  (select notification.comment_id::text from public.user_notifications notification where notification.notification_type = 'daily_report_comment'),
  (select comment.id::text from public.daily_report_comments comment),
  'comment notification references the atomically inserted comment'
);
select is(
  (select actor_id::text from public.user_notifications where notification_type = 'daily_report_comment'),
  '81000000-0000-0000-0000-000000000002',
  'comment notification records the reviewer as actor'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select is(jsonb_array_length(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->'comments'), 1, 'author sees the reviewer comment in report detail');

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.comment_daily_report('86000000-0000-0000-0000-000000000001', '   ')$$,
  '22023', 'Daily report comment must contain between 1 and 4000 characters',
  'empty reviewer comment is rejected'
);
select throws_ok(
  $$select public.comment_daily_report('86000000-0000-0000-0000-000000000001', repeat('x', 4001))$$,
  '22023', 'Daily report comment must contain between 1 and 4000 characters',
  'overlong reviewer comment is rejected'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.confirm_daily_report('86000000-0000-0000-0000-000000000001', 2)$$,
  '40001', 'Daily report revision conflict',
  'confirmation preserves optimistic revision checking'
);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.confirm_daily_report('86000000-0000-0000-0000-000000000001', 1)$$,
  '42501', 'Only an authorized daily report reviewer can confirm this report',
  'report author cannot confirm their own report'
);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.confirm_daily_report('86000000-0000-0000-0000-000000000001', 1)$$,
  'direct Objective leader confirms a submitted report'
);
set local role postgres;
select is((select status::text from public.daily_reports where id = '86000000-0000-0000-0000-000000000001'), 'confirmed', 'confirmation locks the report status');
select is((select count(*) from public.user_notifications where notification_type = 'daily_report_confirmed'), 1::bigint, 'first confirmation creates one author notification');
select is(
  (select actor_id::text from public.user_notifications where notification_type = 'daily_report_confirmed'),
  '81000000-0000-0000-0000-000000000002',
  'confirmation notification records the confirming reviewer'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.confirm_daily_report('86000000-0000-0000-0000-000000000001', 1)$$,
  'repeated confirmation is idempotent'
);
set local role postgres;
select is((select count(*) from public.user_notifications where notification_type = 'daily_report_confirmed'), 1::bigint, 'repeated confirmation does not duplicate its notification');
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.confirm_daily_report('86000000-0000-0000-0000-000000000001', 2)$$,
  '40001', 'Daily report revision conflict',
  'confirmed report still rejects a stale expected revision'
);
select lives_ok(
  $$select public.comment_daily_report('86000000-0000-0000-0000-000000000001', 'Confirmed reports remain commentable')$$,
  'confirmed report remains commentable'
);
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canComment', 'true', 'confirmed detail keeps the comment capability');
select is(public.get_daily_report_detail('86000000-0000-0000-0000-000000000001')->>'canConfirm', 'false', 'confirmed detail disables the confirm capability');
set local role postgres;
select is((select count(*) from public.daily_report_comments), 2::bigint, 'comment after confirmation is committed');
select is((select count(*) from public.user_notifications where notification_type = 'daily_report_comment'), 2::bigint, 'post-confirmation comment also creates one notification');

-- Add deterministic rows after atomic side-effect assertions to exercise paging.
insert into public.user_notifications (
  organization_id, recipient_id, actor_id, notification_type, report_id, comment_id, created_at
)
select
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  'daily_report_comment',
  '86000000-0000-0000-0000-000000000001',
  (select id from public.daily_report_comments order by created_at, id limit 1),
  timestamptz '2030-01-01 00:00:00+00' + make_interval(secs => value)
from generate_series(1, 52) value;

insert into public.resources (
  id, organization_id, name, category, resource_kind, owner_id, location, status, created_by
) values (
  '8a000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  'Notification Resource', 'tools', 'durable', '81000000-0000-0000-0000-000000000005',
  'Cabinet', 'available', '81000000-0000-0000-0000-000000000002'
);
insert into public.user_notifications (
  organization_id, recipient_id, actor_id, notification_type, resource_id, created_at
) values (
  '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000005',
  '81000000-0000-0000-0000-000000000002', 'resource_owner_assigned',
  '8a000000-0000-0000-0000-000000000001', timestamptz '2031-01-01 00:00:00+00'
);
insert into review_notification_ids (own_id, foreign_id)
select
  (select id from public.user_notifications where recipient_id = '81000000-0000-0000-0000-000000000001' order by created_at, id limit 1),
  (select id from public.user_notifications where recipient_id = '81000000-0000-0000-0000-000000000005' order by created_at, id limit 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select is(
  (select array_agg(key order by key) from jsonb_object_keys(public.list_my_notifications(2, null, null)) key),
  array['items', 'nextCursor', 'unreadCount'],
  'notification page has the fixed JSON shape'
);
select is(jsonb_array_length(public.list_my_notifications(2, null, null)->'items'), 2, 'notification list respects the requested page limit');
select is((public.list_my_notifications(2, null, null)->>'unreadCount')::integer, 55, 'notification page reports the recipient total unread count');
select ok(public.list_my_notifications(2, null, null)->'nextCursor' <> 'null'::jsonb, 'notification page returns a cursor when more rows exist');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(public.list_my_notifications(2, null, null)->'items'->0) key),
  array['actorName', 'createdAt', 'id', 'readAt', 'reportId', 'resourceId', 'type'],
  'notification items expose only the account notification contract'
);
select is(
  public.list_my_notifications(2, null, null)->'items'->0->>'createdAt',
  '2030-01-01T00:00:52+00:00',
  'notifications are ordered newest first by creation time'
);
select is(
  jsonb_array_length(public.list_my_notifications(
    2,
    (public.list_my_notifications(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_my_notifications(2, null, null)->'nextCursor'->>'id')::uuid
  )->'items'),
  2,
  'notification cursor returns the next page'
);
select is(
  public.list_my_notifications(
    2,
    (public.list_my_notifications(2, null, null)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_my_notifications(2, null, null)->'nextCursor'->>'id')::uuid
  )->'items'->0->>'createdAt',
  '2030-01-01T00:00:50+00:00',
  'notification cursor does not repeat the preceding page boundary'
);
select is(jsonb_array_length(public.list_my_notifications(100, null, null)->'items'), 50, 'notification page hard-caps limits at fifty');
select throws_ok(
  $$select public.list_my_notifications(10, timestamptz '2030-01-01 00:00:00+00', null)$$,
  '22023', 'Notification cursor is invalid',
  'notification cursor requires both tuple components'
);
select lives_ok(
  $$select public.mark_notification_read((select foreign_id from review_notification_ids))$$,
  'marking another recipient notification is a safe no-op'
);
set local role postgres;
select ok((select read_at is null from public.user_notifications where id = (select foreign_id from review_notification_ids)), 'another recipient notification remains unread');
set local role authenticated;
select lives_ok(
  $$select public.mark_notification_read((select own_id from review_notification_ids))$$,
  'recipient marks one own notification read'
);
set local role postgres;
select ok((select read_at is not null from public.user_notifications where id = (select own_id from review_notification_ids)), 'single notification read timestamp is persisted');
set local role authenticated;
select lives_ok(
  $$select public.mark_notification_read((select own_id from review_notification_ids))$$,
  'marking an already-read notification is idempotent'
);
select is(public.mark_all_notifications_read(), 54, 'bulk mark returns the number of newly read own notifications');
set local role postgres;
select is((select count(*) from public.user_notifications where recipient_id = '81000000-0000-0000-0000-000000000001' and read_at is null), 0::bigint, 'bulk mark reads every notification for the current recipient');
select is((select count(*) from public.user_notifications where recipient_id = '81000000-0000-0000-0000-000000000005' and read_at is null), 1::bigint, 'bulk mark leaves another recipient notification unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', true);
select throws_ok(
  $$select public.list_my_notifications(20, null, null)$$,
  '42501', 'Notifications are not available',
  'unknown account cannot list notifications'
);
select throws_ok(
  $$select public.mark_all_notifications_read()$$,
  '42501', 'Notifications are not available',
  'unknown account cannot mutate notifications'
);

select * from finish();
rollback;
