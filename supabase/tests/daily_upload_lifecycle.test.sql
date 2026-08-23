begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'employee@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'leader@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name)
values ('92000000-0000-0000-0000-000000000001', 'Upload Lifecycle Organization');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status)
values
  ('91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Employee', 'internal', 'approved'),
  ('91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'Leader', 'internal', 'approved');

insert into public.user_roles (organization_id, profile_id, role)
values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'project_leader');

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date)
values ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Upload Lifecycle Project', '91000000-0000-0000-0000-000000000001', 'internal', current_date - 1, current_date + 1);

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date)
values ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Upload Lifecycle Objective', 'internal', current_date - 1, current_date + 1);

insert into public.key_results (id, organization_id, objective_id, project_id, owner_id, title, measurement_type, target_value, classification, start_date, due_date)
values ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Upload Lifecycle KR', 'percentage', 100, 'internal', current_date - 1, current_date + 1);

insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
values ('92000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'owner');

insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification)
values
  ('96000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal'),
  ('96000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', (timezone('Asia/Shanghai', now()))::date, 'confirmed', 'internal'),
  ('96000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', (timezone('Asia/Shanghai', now()))::date - 1, 'submitted', 'internal');

create temporary table upload_lifecycle_ids (
  current_session_id uuid,
  abandoned_session_id uuid,
  unfinalized_attachment_id uuid
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select is(
  public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'reportId',
  '96000000-0000-0000-0000-000000000001',
  'today reuses the unique daily report shell'
);

insert into upload_lifecycle_ids (current_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;

insert into upload_lifecycle_ids (abandoned_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;

select lives_ok(
  $$select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select abandoned_session_id from upload_lifecycle_ids where abandoned_session_id is not null),
    1, 'stale.pdf', 'application/pdf', 128, 'internal', 'Stale upload'
  )$$,
  'owner creates a pending attachment in the session that will be abandoned'
);

select lives_ok(
  $$select public.abandon_daily_report_upload_session((select abandoned_session_id from upload_lifecycle_ids where abandoned_session_id is not null))$$,
  'owner abandons only their active upload session'
);

set local role postgres;
select is(
  (select state::text from public.report_attachments where original_name = 'stale.pdf'),
  'deleted',
  'abandoning a session deletes only its pending attachment rows'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select current_session_id from upload_lifecycle_ids where current_session_id is not null),
    1, 'foreign.pdf', 'application/pdf', 128, 'internal', 'Foreign upload'
  )$$,
  '42501', 'Upload session is not available',
  'another user cannot use an upload session'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
insert into upload_lifecycle_ids (unfinalized_attachment_id)
select (public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select current_session_id from upload_lifecycle_ids where current_session_id is not null),
    1, 'unfinalized.pdf', 'application/pdf', 128, 'internal', 'Unfinalized upload'
  )->>'id')::uuid;
select ok(
  (select unfinalized_attachment_id from upload_lifecycle_ids where unfinalized_attachment_id is not null) is not null,
  'owner creates an attachment that has not been finalized'
);
select throws_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Current objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Current work',
      'hours', 2,
      'result', 'Current result',
      'evidenceLinks', '[]'::jsonb,
      'attachments', jsonb_build_array(jsonb_build_object(
        'attachmentId', (select unfinalized_attachment_id from upload_lifecycle_ids where unfinalized_attachment_id is not null),
        'displayName', 'Unfinalized upload',
        'classification', 'internal'
      ))
    )),
    (select current_session_id from upload_lifecycle_ids where current_session_id is not null),
    '[]'::jsonb
  )$$,
  '42501', 'Attachment is not available for this report revision',
  'a pending attachment cannot enter a report revision'
);
select lives_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Current objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Current work',
      'hours', 2,
      'result', 'Current result',
      'evidenceLinks', '[]'::jsonb,
      'attachments', '[]'::jsonb
    )),
    (select current_session_id from upload_lifecycle_ids where current_session_id is not null),
    '[]'::jsonb
  )$$,
  'pending rows from an abandoned session do not block submission'
);

select ok(
  private.daily_report_is_editable(
    '96000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    (timezone('Asia/Shanghai', now()))::date
  ),
  'the owner can update an unreviewed report dated today'
);

select ok(
  not private.daily_report_is_editable(
    '96000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000002',
    (timezone('Asia/Shanghai', now()))::date
  ),
  'a confirmed report is not editable'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')$$,
  '42501', 'Daily report is locked',
  'a confirmed report is locked immediately'
);

select throws_ok(
  $$select public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date - 1, 'submitted', 'internal')$$,
  '42501', 'Daily report is locked',
  'a prior-day report is locked'
);

select * from finish();
rollback;
