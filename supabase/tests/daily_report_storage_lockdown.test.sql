begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'owner@daily-storage-lockdown.test',
  'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.organizations (id, name)
values ('a2000000-0000-0000-0000-000000000001', 'Daily Storage Lockdown Organization');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status)
values ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Owner', 'internal', 'approved');

insert into public.user_roles (organization_id, profile_id, role)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'employee');

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date)
values ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Daily Storage Lockdown Project', 'a1000000-0000-0000-0000-000000000001', 'internal', current_date - 1, current_date + 1);

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date)
values ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Daily Storage Lockdown Objective', 'internal', current_date - 1, current_date + 1);

insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification)
values ('a5000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal');

select has_function('public', 'authorize_attachment_object_upload', array['uuid'], 'daily OSS upload authorization exists');
select has_function('public', 'confirm_attachment_object_upload', array['uuid', 'text', 'text', 'bigint'], 'daily OSS upload confirmation exists');
select ok(has_function_privilege('authenticated', 'public.authorize_attachment_object_upload(uuid)', 'execute'), 'authenticated users can authorize a daily OSS upload');
select ok(not has_function_privilege('authenticated', 'public.confirm_attachment_object_upload(uuid,text,text,bigint)', 'execute'), 'authenticated users cannot attest a daily OSS upload');
select ok(has_function_privilege('service_role', 'public.confirm_attachment_object_upload(uuid,text,text,bigint)', 'execute'), 'service role can attest a daily OSS upload');
select ok(not has_function_privilege('authenticated', 'public.finalize_attachment_upload(uuid,text)', 'execute'), 'obsolete client daily finalizer is denied to authenticated users');

select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'attachment_object_insert'
), 'daily Storage insert policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'attachment_object_read'
), 'daily Storage read policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'attachment_object_delete'
), 'daily Storage delete policy is removed');
select ok(not has_function_privilege('authenticated', 'private.can_insert_attachment_object(text,jsonb)', 'execute'), 'authenticated users cannot execute the daily legacy Storage insert helper');
select ok(not has_function_privilege('authenticated', 'private.can_read_attachment_object(text)', 'execute'), 'authenticated users cannot execute the daily legacy Storage read helper');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);

create temporary table daily_storage_lockdown_ids (
  session_id uuid not null,
  pending_attachment_id uuid not null,
  pending_path text not null
);

insert into daily_storage_lockdown_ids (session_id, pending_attachment_id, pending_path)
select
  (session.value->>'sessionId')::uuid,
  (attachment.value->>'id')::uuid,
  attachment.value->>'path'
from lateral public.begin_daily_report_upload_session(
  (timezone('Asia/Shanghai', now()))::date, 'submitted', 'internal'
) as session(value)
cross join lateral public.begin_entry_attachment_upload(
  'a5000000-0000-0000-0000-000000000001',
  (session.value->>'sessionId')::uuid,
  1, 'oss-only.pdf', 'application/pdf', 128, 'internal', 'OSS only'
) as attachment(value);

select lives_ok(
  $$select public.authorize_attachment_object_upload((select pending_attachment_id from daily_storage_lockdown_ids))$$,
  'session-aware daily metadata remains usable by the OSS authorization contract'
);

reset role;
insert into public.report_attachments (
  id, organization_id, report_id, uploader_id, original_name, display_name,
  storage_path, mime_type, byte_size, classification, state, object_verified_at
) values
  ('a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'legacy-read.pdf', 'Legacy read', 'organization/a2000000-0000-0000-0000-000000000001/reports/a5000000-0000-0000-0000-000000000001/a6000000-0000-0000-0000-000000000001/legacy-read.pdf', 'application/pdf', 1, 'internal', 'uploaded', timezone('utc', now())),
  ('a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'legacy-delete.pdf', 'Legacy delete', 'organization/a2000000-0000-0000-0000-000000000001/reports/a5000000-0000-0000-0000-000000000001/a6000000-0000-0000-0000-000000000002/legacy-delete.pdf', 'application/pdf', 1, 'internal', 'deleted', timezone('utc', now()));
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', storage_path, uploader_id::text, jsonb_build_object('mimetype', mime_type, 'size', byte_size)
from public.report_attachments
where original_name in ('legacy-read.pdf', 'legacy-delete.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    select 'report-attachments', pending_path, auth.uid()::text,
      jsonb_build_object('mimetype', 'application/pdf', 'size', 128)
    from daily_storage_lockdown_ids$$,
  '42501', null, 'authenticated users cannot directly insert daily attachment bytes into Supabase Storage'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'report-attachments' and name like '%/legacy-read.pdf'),
  0::bigint,
  'authenticated users cannot directly read daily attachment bytes from Supabase Storage'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'report-attachments' and name like '%/legacy-delete.pdf'$$,
  '42501', 'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'authenticated users cannot directly delete daily attachment bytes from Supabase Storage'
);

reset role;
select lives_ok(
  $$select public.confirm_attachment_object_upload(
    (select pending_attachment_id from daily_storage_lockdown_ids),
    'sha256:oss-only', 'application/pdf', 128
  )$$,
  'the server-side daily OSS confirmation contract remains functional'
);

select * from finish();
rollback;
