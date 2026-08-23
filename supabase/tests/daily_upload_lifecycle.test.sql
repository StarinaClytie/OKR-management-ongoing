begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

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
  unfinalized_attachment_id uuid,
  retired_session_id uuid,
  fresh_session_id uuid,
  over_clearance_attachment_id uuid,
  over_clearance_path text,
  associated_session_id uuid,
  associated_attachment_id uuid,
  associated_path text,
  locked_session_id uuid,
  locked_attachment_id uuid
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select is(
  public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'reportId',
  '96000000-0000-0000-0000-000000000001',
  'today reuses the unique daily report shell'
);

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

insert into upload_lifecycle_ids (current_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;

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
  not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.create_daily_report(uuid,uuid,date,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)'),
    'execute'
  ), false),
  'the historical create_daily_report overload is not executable by authenticated users'
);
select ok(
  not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.update_daily_report(uuid,integer,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)'),
    'execute'
  ), false),
  'the historical update_daily_report overload is not executable by authenticated users'
);
select ok(
  not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.begin_daily_report_with_attachments(uuid,uuid,date,public.report_status,public.classification,numeric)'),
    'execute'
  ), false),
  'the historical report-shell overload is not executable by authenticated users'
);
select ok(
  not coalesce(has_function_privilege(
    'authenticated',
    to_regprocedure('public.update_daily_report_with_attachments(uuid,integer,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)'),
    'execute'
  ), false),
  'the historical attachment-update overload is not executable by authenticated users'
);

insert into upload_lifecycle_ids (retired_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
select ok(
  (select retired_session_id from upload_lifecycle_ids where retired_session_id is not null) is not null,
  'an editable report can begin an upload session before replacement'
);
select lives_ok(
  $$select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select retired_session_id from upload_lifecycle_ids where retired_session_id is not null),
    1, 'retired.pdf', 'application/pdf', 128, 'internal', 'Retired upload'
  )$$,
  'the session that will be replaced owns a pending attachment'
);
insert into upload_lifecycle_ids (fresh_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
set local role postgres;
select is(
  (select status from public.daily_report_upload_sessions where id = (select retired_session_id from upload_lifecycle_ids where retired_session_id is not null)),
  'abandoned',
  'beginning a replacement session retires the prior active session'
);
select is(
  (select state::text from public.report_attachments where original_name = 'retired.pdf'),
  'deleted',
  'replacing a session deletes its incomplete pending attachment rows'
);
update public.profiles set clearance = 'confidential'
where id = '91000000-0000-0000-0000-000000000001';
set local role authenticated;

with started as (
  select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select fresh_session_id from upload_lifecycle_ids where fresh_session_id is not null),
    1, 'over-clearance.pdf', 'application/pdf', 128, 'confidential', 'Over clearance'
  ) as value
)
insert into upload_lifecycle_ids (over_clearance_attachment_id, over_clearance_path)
select (value->>'id')::uuid, value->>'path' from started;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', over_clearance_path, auth.uid()::text,
  jsonb_build_object('mimetype', 'application/pdf', 'size', 128)
from upload_lifecycle_ids where over_clearance_attachment_id is not null;
select lives_ok(
  $$select public.finalize_attachment_upload(
    (select over_clearance_attachment_id from upload_lifecycle_ids where over_clearance_attachment_id is not null),
    'sha256:over-clearance'
  )$$,
  'a confidential attachment is server-finalized before the user clearance changes'
);
set local role postgres;
update public.profiles set clearance = 'internal'
where id = '91000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Clearance objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Clearance work', 'hours', 2, 'result', 'Clearance result',
      'attachments', jsonb_build_array(jsonb_build_object(
        'attachmentId', (select over_clearance_attachment_id from upload_lifecycle_ids where over_clearance_attachment_id is not null),
        'displayName', 'Over clearance', 'classification', 'internal'
      ))
    )),
    (select fresh_session_id from upload_lifecycle_ids where fresh_session_id is not null),
    '[]'::jsonb
  )$$,
  '42501', 'Attachment classification exceeds user clearance',
  'a stored attachment above the caller clearance cannot enter a revision'
);

insert into upload_lifecycle_ids (associated_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
with started as (
  select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select associated_session_id from upload_lifecycle_ids where associated_session_id is not null),
    1, 'associated.pdf', 'application/pdf', 128, 'internal', 'Associated upload'
  ) as value
)
insert into upload_lifecycle_ids (associated_attachment_id, associated_path)
select (value->>'id')::uuid, value->>'path' from started;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', associated_path, auth.uid()::text,
  jsonb_build_object('mimetype', 'application/pdf', 'size', 128)
from upload_lifecycle_ids where associated_attachment_id is not null;
select public.finalize_attachment_upload(
  (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null),
  'sha256:associated'
);
select lives_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Association objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Association work', 'hours', 2, 'result', 'Association result',
      'attachments', jsonb_build_array(jsonb_build_object(
        'attachmentId', (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null),
        'displayName', 'Associated upload', 'classification', 'internal'
      ))
    )),
    (select associated_session_id from upload_lifecycle_ids where associated_session_id is not null),
    '[]'::jsonb
  )$$,
  'a finalized current-session attachment is associated by explicit block metadata'
);
select throws_ok(
  $$select public.soft_delete_attachment(
    (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)
  )$$,
  '42501', 'Attachment is not available for deletion',
  'an attachment already associated with an immutable revision cannot be soft-deleted'
);

select ok(
  private.daily_report_is_editable(
    '96000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    (timezone('Asia/Shanghai', now()))::date
  ),
  'the owner can update an unreviewed report dated today'
);

insert into upload_lifecycle_ids (locked_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
with started as (
  select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select locked_session_id from upload_lifecycle_ids where locked_session_id is not null),
    1, 'locked.pdf', 'application/pdf', 128, 'internal', 'Locked upload'
  ) as value
)
insert into upload_lifecycle_ids (locked_attachment_id)
select (value->>'id')::uuid from started;
set local role postgres;
update public.daily_reports set status = 'confirmed'
where id = '96000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.finalize_attachment_upload(
    (select locked_attachment_id from upload_lifecycle_ids where locked_attachment_id is not null),
    'sha256:locked'
  )$$,
  '42501', 'Daily report is locked',
  'finalization is blocked after review confirmation'
);
select throws_ok(
  $$select public.abandon_daily_report_upload_session(
    (select locked_session_id from upload_lifecycle_ids where locked_session_id is not null)
  )$$,
  '42501', 'Daily report is locked',
  'abandoning an upload is blocked after review confirmation'
);
select throws_ok(
  $$select public.soft_delete_attachment(
    (select locked_attachment_id from upload_lifecycle_ids where locked_attachment_id is not null)
  )$$,
  '42501', 'Daily report is locked',
  'soft deletion is blocked after review confirmation'
);
select throws_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Locked objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Locked work', 'hours', 2, 'result', 'Locked result', 'attachments', '[]'::jsonb
    )),
    (select locked_session_id from upload_lifecycle_ids where locked_session_id is not null),
    '[]'::jsonb
  )$$,
  '42501', 'Daily report is locked',
  'saving is blocked after review confirmation'
);

select ok(
  not private.daily_report_is_editable(
    '96000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    (timezone('Asia/Shanghai', now()))::date
  ),
  'a confirmed report is no longer editable by its author'
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
