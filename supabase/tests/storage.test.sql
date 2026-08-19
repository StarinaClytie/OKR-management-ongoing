begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

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
  ('75000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', current_date, 'submitted', 'confidential');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.begin_attachment_upload('75000000-0000-0000-0000-000000000001', 'evidence.pdf', 'application/pdf', 10485760, 'confidential')$$,
  'owner begins an allowed 10 MB upload'
);
select matches((select storage_path from public.report_attachments limit 1), '^organization/72000000-0000-0000-0000-000000000001/reports/75000000-0000-0000-0000-000000000001/[0-9a-f-]+/evidence\.pdf$', 'server derives the storage path');
select throws_ok(
  $$select public.begin_attachment_upload('75000000-0000-0000-0000-000000000001', 'payload.exe', 'application/x-msdownload', 12, 'internal')$$,
  '22023', 'Unsupported attachment type', 'forbidden MIME type is rejected'
);
select throws_ok(
  $$select public.begin_attachment_upload('75000000-0000-0000-0000-000000000001', 'empty.pdf', 'application/pdf', 0, 'internal')$$,
  '22023', 'Attachment size must be between 1 and 10485760 bytes', 'zero-byte upload is rejected'
);
select throws_ok(
  $$select public.begin_attachment_upload('75000000-0000-0000-0000-000000000001', 'large.pdf', 'application/pdf', 10485761, 'internal')$$,
  '22023', 'Attachment size must be between 1 and 10485760 bytes', '10 MB plus one byte is rejected'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', storage_path, auth.uid()::text, jsonb_build_object('mimetype', mime_type, 'size', byte_size)
from public.report_attachments where state = 'pending';
select lives_ok(
  $$select public.finalize_attachment_upload((select id from public.report_attachments where state = 'pending'), 'sha256:first')$$,
  'owner finalizes an uploaded object'
);
select is((select state::text from public.report_attachments limit 1), 'uploaded', 'finalize marks metadata uploaded');
select is((select count(*) from storage.objects where bucket_id = 'report-attachments'), 1::bigint, 'owner can enumerate only the uploaded object');
select is((public.create_attachment_download((select id from public.report_attachments limit 1))->>'path'), (select storage_path from public.report_attachments limit 1), 'authorized owner receives a verified download path');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select is((select count(*) from storage.objects where bucket_id = 'report-attachments'), 0::bigint, 'project member without a scoped block cannot enumerate the object');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select is((select count(*) from storage.objects where bucket_id = 'report-attachments'), 0::bigint, 'unrelated user cannot enumerate object names');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
select is((select count(*) from storage.objects where bucket_id = 'report-attachments'), 0::bigint, 'HR cannot enumerate object names');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.replace_attachment((select id from public.report_attachments where state = 'uploaded'), 'replacement.pdf', 'application/pdf', 128, 'confidential')$$,
  'owner begins replacement without exposing a caller path'
);
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', storage_path, auth.uid()::text, jsonb_build_object('mimetype', mime_type, 'size', byte_size)
from public.report_attachments where state = 'pending';
select public.finalize_attachment_upload((select id from public.report_attachments where state = 'pending'), 'sha256:replacement');
select results_eq(
  $$select state::text, count(*) from public.report_attachments group by state order by state::text$$,
  $$values ('replaced'::text, 1::bigint), ('uploaded'::text, 1::bigint)$$,
  'replacement swaps metadata only after new object finalizes'
);
select lives_ok(
  $$select public.soft_delete_attachment((select id from public.report_attachments where state = 'uploaded'))$$,
  'owner soft-deletes uploaded metadata before object cleanup'
);
select is((select count(*) from public.report_attachments where state = 'deleted'), 1::bigint, 'soft deletion hides the current attachment');

select * from finish();
rollback;
