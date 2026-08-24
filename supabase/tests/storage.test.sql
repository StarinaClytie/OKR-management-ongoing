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
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('71000000-0000-0000-0000-000000000001'::uuid, 'owner@storage.test'),
  ('71000000-0000-0000-0000-000000000002'::uuid, 'reader@storage.test'),
  ('71000000-0000-0000-0000-000000000003'::uuid, 'unrelated@storage.test'),
  ('71000000-0000-0000-0000-000000000004'::uuid, 'hr@storage.test')
) users(id, email);

insert into public.organizations (id, name) values ('72000000-0000-0000-0000-000000000001', 'Storage Organization');
insert into public.profiles (id, organization_id, display_name, clearance) values
  ('71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Owner', 'confidential'),
  ('71000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 'Reader', 'confidential'),
  ('71000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Unrelated', 'confidential'),
  ('71000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000001', 'HR', 'confidential');
-- Existing operational users are explicitly approved (fail-closed default).
update public.profiles set approval_status = 'approved';
insert into public.user_roles (organization_id, profile_id, role) values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'employee'),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 'employee'),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003', 'employee'),
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000004', 'hr');
insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Storage Project', '71000000-0000-0000-0000-000000000001', 'confidential', current_date, current_date + 1);
insert into public.project_members (organization_id, project_id, profile_id) values
  ('72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'),
  ('72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002');
insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('74000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Storage Objective', 'confidential', current_date, current_date + 1);
insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification) values
  ('75000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', (timezone('Asia/Shanghai', now()))::date, 'submitted', 'confidential');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

create temporary table storage_upload_session (id uuid not null);
insert into storage_upload_session (id)
select (public.begin_daily_report_upload_session((timezone('Asia/Shanghai', now()))::date, 'submitted', 'confidential')->>'sessionId')::uuid;

select lives_ok(
  $$select public.begin_entry_attachment_upload('75000000-0000-0000-0000-000000000001', (select id from storage_upload_session), 1, 'raw-proof.pdf', 'application/pdf', 128, 'confidential', '验收结果图')$$,
  'owner begins an entry attachment upload with an editable display name'
);
select is(
  (select display_name from public.report_attachments where original_name = 'raw-proof.pdf'),
  '验收结果图',
  'entry attachment metadata persists the display name separately from the original filename'
);
select public.soft_delete_attachment((select id from public.report_attachments where original_name = 'raw-proof.pdf'));

select lives_ok(
  $$select public.begin_entry_attachment_upload('75000000-0000-0000-0000-000000000001', (select id from storage_upload_session), 1, 'evidence.pdf', 'application/pdf', 10485760, 'confidential', 'Evidence')$$,
  'owner begins an allowed 10 MB upload'
);
select matches((select storage_path from public.report_attachments where original_name = 'evidence.pdf'), '^organization/72000000-0000-0000-0000-000000000001/reports/75000000-0000-0000-0000-000000000001/[0-9a-f-]+/evidence\.pdf$', 'server derives the storage path');
select throws_ok(
  $$select public.begin_entry_attachment_upload('75000000-0000-0000-0000-000000000001', (select id from storage_upload_session), 1, 'payload.exe', 'application/x-msdownload', 12, 'internal', 'Payload')$$,
  '22023', 'Unsupported attachment type', 'forbidden MIME type is rejected'
);
select throws_ok(
  $$select public.begin_entry_attachment_upload('75000000-0000-0000-0000-000000000001', (select id from storage_upload_session), 1, 'empty.pdf', 'application/pdf', 0, 'internal', 'Empty')$$,
  '22023', 'Attachment size must be between 1 and 104857600 bytes', 'zero-byte upload is rejected'
);
select throws_ok(
  $$select public.begin_entry_attachment_upload('75000000-0000-0000-0000-000000000001', (select id from storage_upload_session), 1, 'large.pdf', 'application/pdf', 104857601, 'internal', 'Large')$$,
  '22023', 'Attachment size must be between 1 and 104857600 bytes', '100 MB plus one byte is rejected'
);

select throws_ok(
  $$select private.can_insert_attachment_object(
    (select storage_path from public.report_attachments where state = 'pending' limit 1),
    '{}'::jsonb
  )$$,
  '42501', null, 'authenticated users cannot invoke the retired daily Storage insert helper'
);
select lives_ok(
  $$select pg_temp.confirm_test_upload((select id from public.report_attachments where state = 'pending'), 'sha256:first')$$,
  'owner finalizes an uploaded object'
);
select is((select state::text from public.report_attachments where original_name = 'evidence.pdf'), 'uploaded', 'finalize marks metadata uploaded');
select is((public.create_attachment_download((select id from public.report_attachments where original_name = 'evidence.pdf'))->>'path'), (select storage_path from public.report_attachments where original_name = 'evidence.pdf'), 'authorized owner receives a verified download path');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.begin_entry_attachment_upload('75000000-0000-0000-0000-000000000001', (select id from storage_upload_session), 1, 'mismatch.pdf', 'application/pdf', 128, 'confidential', 'Mismatch')$$,
  'owner begins a second session-authorized upload without exposing a caller path'
);
select throws_ok(
  $$select pg_temp.confirm_test_upload((select id from public.report_attachments where original_name = 'mismatch.pdf'), 'sha256:mismatch', 127)$$,
  '22023', 'Uploaded object metadata does not match attachment',
  'finalization still rejects an object whose MIME type or byte size differs from its server-issued metadata'
);
select lives_ok(
  $$select public.soft_delete_attachment((select id from public.report_attachments where state = 'uploaded'))$$,
  'owner soft-deletes uploaded metadata before object cleanup'
);
select is((select state::text from public.report_attachments where original_name = 'evidence.pdf'), 'deleted', 'soft deletion hides the current attachment');

select * from finish();
rollback;
