begin;

create extension if not exists pgtap with schema extensions;

create or replace function pg_temp.confirm_test_upload(
  p_attachment_id uuid,
  p_checksum text,
  p_byte_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.report_attachments%rowtype;
begin
  select * into target from public.report_attachments where id = p_attachment_id;
  return public.confirm_attachment_object_upload(
    target.id, p_checksum, target.mime_type, coalesce(p_byte_size, target.byte_size::bigint)
  );
end;
$$;

create or replace function pg_temp.confirm_test_deletion(p_attachment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$ select public.confirm_attachment_object_deletion(p_attachment_id) $$;
select plan(71);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'employee@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'leader@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'administrator@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'public@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'management@upload-lifecycle.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name)
values ('92000000-0000-0000-0000-000000000001', 'Upload Lifecycle Organization');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status)
values
  ('91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Employee', 'internal', 'approved'),
  ('91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'Leader', 'internal', 'approved'),
  ('91000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', 'Administrator', 'internal', 'approved'),
  ('91000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', 'Public employee', 'public', 'approved'),
  ('91000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', 'Management reviewer', 'internal', 'approved');

insert into public.user_roles (organization_id, profile_id, role)
values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'project_leader'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'administrator'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000004', 'employee'),
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000005', 'management');

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date)
values ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Upload Lifecycle Project', '91000000-0000-0000-0000-000000000002', 'internal', current_date - 1, current_date + 1);

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date)
values ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'Upload Lifecycle Objective', 'internal', current_date - 1, current_date + 1);

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
  resumed_session_id uuid,
  associated_attachment_id uuid,
  associated_path text,
  cancel_session_id uuid,
  cleanup_attachment_id uuid,
  cleanup_path text,
  edit_session_id uuid,
  forged_session_id uuid,
  orphan_session_id uuid,
  orphan_attachment_id uuid,
  locked_session_id uuid,
  locked_attachment_id uuid
);
grant select, insert, update, delete on table upload_lifecycle_ids to authenticated;

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

select public.request_attachment_object_deletion(
  (select id from public.report_attachments where original_name = 'stale.pdf')
);
select pg_temp.confirm_test_deletion(
  (select id from public.report_attachments where original_name = 'stale.pdf')
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
select public.delete_daily_report_upload_attachment(
  (select unfinalized_attachment_id from upload_lifecycle_ids where unfinalized_attachment_id is not null)
);
select pg_temp.confirm_test_deletion(
  (select unfinalized_attachment_id from upload_lifecycle_ids where unfinalized_attachment_id is not null)
);
select public.abandon_daily_report_upload_session(
  (select current_session_id from upload_lifecycle_ids where current_session_id is not null)
);
update upload_lifecycle_ids
set current_session_id = (
  public.begin_daily_report_upload_session(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal'
  )->>'sessionId'
)::uuid
where current_session_id is not null;
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
  'submission succeeds after the rejected pending attachment session is cleaned and abandoned'
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
  'an editable report can begin an upload session before refresh'
);
select lives_ok(
  $$select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select retired_session_id from upload_lifecycle_ids where retired_session_id is not null),
    1, 'retired.pdf', 'application/pdf', 128, 'internal', 'Retired upload'
  )$$,
  'the session owns a pending attachment cleanup target'
);
insert into upload_lifecycle_ids (fresh_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
set local role postgres;
select is(
  (select status from public.daily_report_upload_sessions where id = (select retired_session_id from upload_lifecycle_ids where retired_session_id is not null)),
  'active',
  'refresh resumes a session that still owns an unassociated cleanup target'
);
select is(
  (select state::text from public.report_attachments where original_name = 'retired.pdf'),
  'pending',
  'resuming a session preserves its incomplete attachment for checked cleanup'
);
set local role authenticated;
select public.request_attachment_object_deletion(
  (select id from public.report_attachments where original_name = 'retired.pdf')
);
select pg_temp.confirm_test_deletion(
  (select id from public.report_attachments where original_name = 'retired.pdf')
);
select public.abandon_daily_report_upload_session(
  (select retired_session_id from upload_lifecycle_ids where retired_session_id is not null)
);
update upload_lifecycle_ids
set fresh_session_id = (
  public.begin_daily_report_upload_session(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal'
  )->>'sessionId'
)::uuid
where fresh_session_id is not null;
set local role postgres;
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
  $$select pg_temp.confirm_test_upload(
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
select public.delete_daily_report_upload_attachment(
  (select over_clearance_attachment_id from upload_lifecycle_ids where over_clearance_attachment_id is not null)
);
select pg_temp.confirm_test_deletion(
  (select over_clearance_attachment_id from upload_lifecycle_ids where over_clearance_attachment_id is not null)
);
set local role postgres;
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
where bucket_id = 'report-attachments'
  and name = (select over_clearance_path from upload_lifecycle_ids where over_clearance_path is not null);
set local role authenticated;
select public.abandon_daily_report_upload_session(
  (select fresh_session_id from upload_lifecycle_ids where fresh_session_id is not null)
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
select pg_temp.confirm_test_upload(
  (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null),
  'sha256:associated'
);
select lives_ok(
  $$select public.abandon_daily_report_upload_session(
    (select associated_session_id from upload_lifecycle_ids where associated_session_id is not null)
  )$$,
  'abandonment keeps a session recoverable when it already owns a finalized upload'
);
insert into upload_lifecycle_ids (resumed_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
select is(
  (select resumed_session_id::text from upload_lifecycle_ids where resumed_session_id is not null),
  (select associated_session_id::text from upload_lifecycle_ids where associated_session_id is not null),
  'repeated begin resumes the active session that owns finalized uploads'
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
    (select resumed_session_id from upload_lifecycle_ids where resumed_session_id is not null),
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

insert into upload_lifecycle_ids (cancel_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
select throws_ok(
  $$select public.adopt_daily_report_revision_attachments(
    '96000000-0000-0000-0000-000000000001',
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null),
    array[
      (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null),
      (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)
    ]
  )$$,
  '22023', 'Daily report attachment metadata is duplicated',
  'adoption rejects duplicate attachment identities'
);
select throws_ok(
  $$select public.adopt_daily_report_revision_attachments(
    '96000000-0000-0000-0000-000000000001',
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null),
    array[(select over_clearance_attachment_id from upload_lifecycle_ids where over_clearance_attachment_id is not null)]
  )$$,
  '42501', 'Attachment is not available for adoption',
  'adoption rejects an uploaded attachment outside the current revision'
);
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.adopt_daily_report_revision_attachments(
    '96000000-0000-0000-0000-000000000001',
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null),
    array[(select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)]
  )$$,
  '42501', 'Daily report is locked',
  'another user cannot adopt evidence into the owner session'
);
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.adopt_daily_report_revision_attachments(
    '96000000-0000-0000-0000-000000000001',
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null),
    array[(select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)]
  )$$,
  'the current revision attachment is explicitly adopted into a new edit session'
);
set local role postgres;
select is(
  (select upload_session_id::text from public.report_attachments where id = (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)),
  (select cancel_session_id::text from upload_lifecycle_ids where cancel_session_id is not null),
  'adoption binds the retained attachment to the requested session instead of relying on its old session'
);
set local role authenticated;
with started as (
  select public.begin_entry_attachment_upload(
    '96000000-0000-0000-0000-000000000001',
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null),
    1, 'cancel-cleanup.pdf', 'application/pdf', 128, 'internal', 'Cancel cleanup'
  ) as value
)
insert into upload_lifecycle_ids (cleanup_attachment_id, cleanup_path)
select (value->>'id')::uuid, value->>'path' from started;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', cleanup_path, auth.uid()::text,
  jsonb_build_object('mimetype', 'application/pdf', 'size', 128)
from upload_lifecycle_ids where cleanup_attachment_id is not null;
select lives_ok(
  $$select pg_temp.confirm_test_upload(
    (select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null),
    'sha256:cancel-cleanup'
  )$$,
  'a new session attachment is finalized before cancellation cleanup'
);
select results_eq(
  $$select attachment_id from public.list_daily_report_upload_session_cleanup(
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null)
  )$$,
  $$values ((select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null))$$,
  'cleanup discovery returns new finalized uploads but excludes adopted revision evidence'
);
select is(
  (public.delete_daily_report_upload_attachment(
    (select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null)
  )->>'path'),
  (select cleanup_path from upload_lifecycle_ids where cleanup_path is not null),
  'destructive cleanup returns the Storage path for checked object deletion'
);
set local role postgres;
select is(
  (select state::text from public.report_attachments where id = (select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null)),
  'deleted',
  'destructive cleanup marks only the unassociated session attachment deleted'
);
set local role authenticated;
select results_eq(
  $$select attachment_id from public.list_daily_report_upload_session_cleanup(
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null)
  )$$,
  $$values ((select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null))$$,
  'deleted metadata remains discoverable until the client confirms Storage deletion'
);
select lives_ok(
  $$select public.abandon_daily_report_upload_session(
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null)
  )$$,
  'metadata deletion alone cannot abandon a session while its Storage object still exists'
);
set local role postgres;
select is(
  (select status from public.daily_report_upload_sessions where id = (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null)),
  'active',
  'the session stays active until Storage deletion is observable server-side'
);
-- Isolate the failed Storage cleanup from retained revision evidence. The
-- immutable revision association remains intact; only its temporary edit
-- session adoption is released for this refresh-recovery regression.
update public.report_attachments
set upload_session_id = null
where id = (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null);
set local role authenticated;
select is(
  public.begin_daily_report_upload_session(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal'
  )->>'sessionId',
  (select cancel_session_id::text from upload_lifecycle_ids where cancel_session_id is not null),
  'refresh resumes the active session that still owns a deleted cleanup target'
);
select is(
  (public.delete_daily_report_upload_attachment(
    (select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null)
  )->>'path'),
  (select cleanup_path from upload_lifecycle_ids where cleanup_path is not null),
  'the resumed session can retry idempotent metadata deletion before Storage cleanup'
);
set local role postgres;
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
where bucket_id = 'report-attachments'
  and name = (select cleanup_path from upload_lifecycle_ids where cleanup_path is not null);
set local role authenticated;
select pg_temp.confirm_test_deletion(
  (select cleanup_attachment_id from upload_lifecycle_ids where cleanup_attachment_id is not null)
);
select lives_ok(
  $$select public.abandon_daily_report_upload_session(
    (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null)
  )$$,
  'the cleaned edit session can be abandoned'
);
set local role postgres;
select is(
  (select upload_session_id::text from public.report_attachments where id = (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)),
  null,
  'abandoning detaches adopted immutable evidence from the cancelled session'
);
select is(
  (select status from public.daily_report_upload_sessions where id = (select cancel_session_id from upload_lifecycle_ids where cancel_session_id is not null)),
  'abandoned',
  'the cancelled edit session is retired after cleanup'
);
set local role authenticated;
insert into upload_lifecycle_ids (edit_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
select lives_ok(
  $$select public.adopt_daily_report_revision_attachments(
    '96000000-0000-0000-0000-000000000001',
    (select edit_session_id from upload_lifecycle_ids where edit_session_id is not null),
    array[(select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)]
  )$$,
  'retained evidence can be adopted again for a later edit attempt'
);
select lives_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Edited objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Edited work', 'hours', 3, 'result', 'Edited result',
      'attachments', jsonb_build_array(jsonb_build_object(
        'attachmentId', (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null),
        'displayName', 'Associated upload retained', 'classification', 'internal'
      ))
    )),
    (select edit_session_id from upload_lifecycle_ids where edit_session_id is not null),
    '[]'::jsonb
  )$$,
  'an explicitly adopted current-revision attachment can be carried into the next revision'
);
set local role postgres;
select is(
  (select count(*) from public.report_attachment_revisions where attachment_id = (select associated_attachment_id from upload_lifecycle_ids where associated_attachment_id is not null)),
  2::bigint,
  'copy-forward preserves the prior immutable association and adds the new revision association'
);
set local role authenticated;

select ok(
  private.daily_report_is_editable(
    '96000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    (timezone('Asia/Shanghai', now()))::date
  ),
  'the owner can update an unreviewed report dated today'
);

select throws_ok(
  $$select public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'confirmed', 'internal')$$,
  '42501', 'Authors cannot confirm daily reports',
  'an author cannot forge confirmation while opening an upload session'
);

insert into upload_lifecycle_ids (forged_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
select throws_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'confirmed', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Forged confirmation',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'Forged work', 'hours', 1, 'result', 'Forged result', 'attachments', '[]'::jsonb
    )),
    (select forged_session_id from upload_lifecycle_ids where forged_session_id is not null),
    '[]'::jsonb
  )$$,
  '42501', 'Authors cannot confirm daily reports',
  'an author cannot forge confirmation while saving a report revision'
);
select lives_ok(
  $$select public.abandon_daily_report_upload_session((select forged_session_id from upload_lifecycle_ids where forged_session_id is not null))$$,
  'the rejected forged-confirmation session remains recoverable and can be abandoned'
);

insert into upload_lifecycle_ids (orphan_session_id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal')->>'sessionId')::uuid;
insert into upload_lifecycle_ids (orphan_attachment_id)
select (public.begin_entry_attachment_upload(
  '96000000-0000-0000-0000-000000000001',
  (select orphan_session_id from upload_lifecycle_ids where orphan_session_id is not null),
  1, 'orphan.pdf', 'application/pdf', 128, 'internal', 'Orphan candidate'
)->>'id')::uuid;
select throws_ok(
  $$select * from public.save_daily_report(
    (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'No orphan objective',
      'linkedKeyResultId', '95000000-0000-0000-0000-000000000001',
      'workDescription', 'No orphan work', 'hours', 1, 'result', 'No orphan result', 'attachments', '[]'::jsonb
    )),
    (select orphan_session_id from upload_lifecycle_ids where orphan_session_id is not null),
    '[]'::jsonb
  )$$,
  '55000', 'Upload session has unassociated attachments requiring cleanup',
  'submission refuses to complete while the session still owns a cleanup target'
);
select is(
  (select attachment_id::text from public.list_daily_report_upload_session_cleanup(
    (select orphan_session_id from upload_lifecycle_ids where orphan_session_id is not null)
  ) limit 1),
  (select orphan_attachment_id::text from upload_lifecycle_ids where orphan_attachment_id is not null),
  'the refused session exposes its orphan as a recoverable cleanup target'
);
select lives_ok(
  $$select public.delete_daily_report_upload_attachment((select orphan_attachment_id from upload_lifecycle_ids where orphan_attachment_id is not null))$$,
  'the orphan metadata can be safely marked for deletion'
);
select pg_temp.confirm_test_deletion(
  (select orphan_attachment_id from upload_lifecycle_ids where orphan_attachment_id is not null)
);
select lives_ok(
  $$select public.abandon_daily_report_upload_session((select orphan_session_id from upload_lifecycle_ids where orphan_session_id is not null))$$,
  'the cleaned orphan session can be abandoned'
);
set local role postgres;
select is(
  (select status from public.daily_report_upload_sessions where id = (select orphan_session_id from upload_lifecycle_ids where orphan_session_id is not null)),
  'abandoned',
  'an orphan-bearing session never becomes completed'
);
set local role authenticated;
select is(
  public.find_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date),
  null::jsonb,
  'a side-effect-free session lookup returns null after cleanup without creating a shell or session'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'public')$$,
  'a public-clearance employee can start a public daily report'
);
select is(
  (select classification::text from public.daily_reports where author_id = auth.uid() and report_date = (timezone('Asia/Shanghai', now()))::date),
  'public',
  'the public-clearance employee report shell uses the safe public classification'
);
select is(
  (select status::text from public.daily_reports where author_id = auth.uid() and report_date = (timezone('Asia/Shanghai', now()))::date),
  'draft',
  'starting an upload never exposes an incomplete shell as a submitted report'
);
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.report_attachments'::regclass
      and conname = 'report_attachments_upload_session_subject_fkey'
  ),
  'attachment upload sessions are protected by a composite report-subject foreign key'
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
  $$select pg_temp.confirm_test_upload(
    (select locked_attachment_id from upload_lifecycle_ids where locked_attachment_id is not null),
    'sha256:locked'
  )$$,
  '42501', 'Daily report is locked',
  'finalization is blocked after review confirmation'
);
select throws_ok(
  $$select public.soft_delete_attachment(
    (select locked_attachment_id from upload_lifecycle_ids where locked_attachment_id is not null)
  )$$,
  '42501', 'Daily report is locked',
  'ordinary content deletion is blocked after review confirmation'
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
select is(
  (select attachment_id::text from public.list_daily_report_upload_session_cleanup(
    (select locked_session_id from upload_lifecycle_ids where locked_session_id is not null)
  ) limit 1),
  (select locked_attachment_id::text from upload_lifecycle_ids where locked_attachment_id is not null),
  'a locked report still exposes only its unassociated temporary cleanup target'
);
select lives_ok(
  $$select public.delete_daily_report_upload_attachment((select locked_attachment_id from upload_lifecycle_ids where locked_attachment_id is not null))$$,
  'a locked report still permits safe deletion of its unassociated temporary attachment'
);
select pg_temp.confirm_test_deletion(
  (select locked_attachment_id from upload_lifecycle_ids where locked_attachment_id is not null)
);
select lives_ok(
  $$select public.abandon_daily_report_upload_session((select locked_session_id from upload_lifecycle_ids where locked_session_id is not null))$$,
  'a locked report still permits safe abandonment after temporary cleanup'
);
set local role postgres;
select is(
  (select status from public.daily_report_upload_sessions where id = (select locked_session_id from upload_lifecycle_ids where locked_session_id is not null)),
  'abandoned',
  'locked-report cleanup retires the upload session without touching evidence history'
);
set local role authenticated;

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

set local role postgres;
update public.daily_reports set status = 'submitted'
where id = '96000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.confirm_daily_report('96000000-0000-0000-0000-000000000001', 2)$$,
  '42501', 'Only an authorized daily report reviewer can confirm this report',
  'administrator status alone does not grant business-review authority'
);
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.confirm_daily_report('96000000-0000-0000-0000-000000000001', 3)$$,
  'management can confirm an organization member report through the reviewer-only RPC'
);
set local role postgres;
update public.daily_reports set status = 'submitted'
where id = '96000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.confirm_daily_report('96000000-0000-0000-0000-000000000001', 3)$$,
  'the assigned project leader can confirm a submitted member report'
);
set local role postgres;
select is(
  (select status::text from public.daily_reports where id = '96000000-0000-0000-0000-000000000001'),
  'confirmed',
  'review confirmation immediately locks the member report'
);

select * from finish();
rollback;
