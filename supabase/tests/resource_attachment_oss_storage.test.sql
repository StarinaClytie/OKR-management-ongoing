begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

-- Operational users and resource fixtures mirror the resource access boundary:
-- only approved, active members with an active organization role may use OSS RPCs.
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
  ('35000000-0000-0000-0000-000000000001'::uuid, 'owner@resource-oss.test'),
  ('35000000-0000-0000-0000-000000000002'::uuid, 'peer@resource-oss.test'),
  ('35000000-0000-0000-0000-000000000003'::uuid, 'inactive@resource-oss.test'),
  ('35000000-0000-0000-0000-000000000004'::uuid, 'cross-org@resource-oss.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('33000000-0000-0000-0000-000000000001', 'Resource OSS Org A'),
  ('33000000-0000-0000-0000-000000000002', 'Resource OSS Org B');

insert into public.profiles (id, organization_id, display_name, email, clearance, is_active, onboarding_completed, approval_status) values
  ('35000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'Owner', 'owner@resource-oss.test', 'confidential', true, true, 'approved'),
  ('35000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', 'Peer', 'peer@resource-oss.test', 'confidential', true, true, 'approved'),
  ('35000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000001', 'Inactive', 'inactive@resource-oss.test', 'confidential', false, true, 'approved'),
  ('35000000-0000-0000-0000-000000000004', '33000000-0000-0000-0000-000000000002', 'Cross Organization', 'cross-org@resource-oss.test', 'confidential', true, true, 'approved');

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('33000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'employee', true),
  ('33000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000002', 'employee', true),
  ('33000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000003', 'employee', true),
  ('33000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000004', 'management', true);

insert into public.resources (id, organization_id, name, category, resource_kind, owner_id, location, status, created_by) values
  ('34000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'OSS Fixture Resource', 'tools', 'durable', '35000000-0000-0000-0000-000000000001', 'Test Lab', 'available', '35000000-0000-0000-0000-000000000001');

select has_column('public', 'resource_attachments', 'object_verified_at', 'resource attachments record OSS verification');
select has_column('public', 'resource_attachments', 'object_deleted_at', 'resource attachments record OSS deletion');
select has_function('public', 'authorize_resource_attachment_object_upload', array['uuid'], 'user upload authorization exists');
select has_function('public', 'confirm_resource_attachment_object_upload', array['uuid', 'text', 'text', 'bigint'], 'server upload confirmation exists');
select has_function('public', 'authorize_resource_attachment_object_download', array['uuid'], 'user download authorization exists');
select has_function('public', 'request_resource_attachment_object_deletion', array['uuid'], 'user deletion authorization exists');
select has_function('public', 'confirm_resource_attachment_object_deletion', array['uuid'], 'server deletion confirmation exists');

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.begin_resource_attachment_upload('34000000-0000-0000-0000-000000000001', 'maximum.pdf', 'application/pdf', 104857600)$$,
  'an approved active resource owner can begin a 100 MB upload'
);
select is(
  (select count(*) from jsonb_object_keys(public.begin_resource_attachment_upload('34000000-0000-0000-0000-000000000001', 'metadata.pdf', 'application/pdf', 1))),
  2::bigint,
  'pending resource metadata contains only id and database-generated path'
);
select matches(
  (select storage_path from public.resource_attachments where file_name = 'maximum.pdf'),
  '^organization/33000000-0000-0000-0000-000000000001/resources/34000000-0000-0000-0000-000000000001/[0-9a-f-]+/maximum\.pdf$',
  'the database generates the resource OSS path'
);
select throws_ok(
  $$select public.begin_resource_attachment_upload('34000000-0000-0000-0000-000000000001', 'too-large.pdf', 'application/pdf', 104857601)$$,
  '22023', 'Attachment size must be between 1 and 104857600 bytes', '100 MB plus one byte is rejected'
);
select lives_ok(
  $$select public.authorize_resource_attachment_object_upload((select id from public.resource_attachments where file_name = 'maximum.pdf'))$$,
  'an approved active same-organization uploader can authorize OSS upload'
);

reset role;
insert into public.resource_attachments (id, organization_id, resource_id, uploader_id, file_name, storage_path, mime_type, size_bytes) values
  ('36000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000003', 'inactive.pdf', 'organization/33000000-0000-0000-0000-000000000001/resources/34000000-0000-0000-0000-000000000001/36000000-0000-0000-0000-000000000001/inactive.pdf', 'application/pdf', 1),
  ('36000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'unverified.pdf', 'organization/33000000-0000-0000-0000-000000000001/resources/34000000-0000-0000-0000-000000000001/36000000-0000-0000-0000-000000000002/unverified.pdf', 'application/pdf', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.authorize_resource_attachment_object_upload('36000000-0000-0000-0000-000000000001')$$,
  '42501', 'Attachment is not available for upload', 'inactive users cannot authorize OSS uploads'
);
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.authorize_resource_attachment_object_upload((select id from public.resource_attachments where file_name = 'maximum.pdf'))$$,
  '42501', 'Attachment is not available for upload', 'cross-organization users cannot authorize OSS uploads'
);
select ok(has_function_privilege('authenticated', 'public.authorize_resource_attachment_object_upload(uuid)', 'execute'), 'authenticated users can authorize OSS uploads');
select ok(not has_function_privilege('authenticated', 'public.confirm_resource_attachment_object_upload(uuid,text,text,bigint)', 'execute'), 'authenticated users cannot attest OSS uploads');
select ok(has_function_privilege('service_role', 'public.confirm_resource_attachment_object_upload(uuid,text,text,bigint)', 'execute'), 'service role can attest verified OSS uploads');
select ok(not has_function_privilege('authenticated', 'public.confirm_resource_attachment_object_deletion(uuid)', 'execute'), 'authenticated users cannot confirm OSS deletion');
select ok(has_function_privilege('service_role', 'public.confirm_resource_attachment_object_deletion(uuid)', 'execute'), 'service role can confirm OSS deletion');

select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000001', true);
select ok(not has_function_privilege('authenticated', 'public.finalize_resource_attachment_upload(uuid)', 'execute'), 'legacy Supabase Storage finalization is denied to authenticated users');
select ok(not has_function_privilege('authenticated', 'public.create_resource_attachment_download(uuid)', 'execute'), 'legacy Supabase Storage download cannot expose unverified objects');
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.authorize_resource_attachment_object_download('36000000-0000-0000-0000-000000000002')$$,
  '42501', 'Attachment is not available', 'unverified objects cannot be downloaded'
);

reset role;
select lives_ok(
  $$select public.confirm_resource_attachment_object_upload((select id from public.resource_attachments where file_name = 'maximum.pdf'), 'checksum', 'application/pdf', 104857600)$$,
  'the server can confirm matching OSS object metadata'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.authorize_resource_attachment_object_download((select id from public.resource_attachments where file_name = 'maximum.pdf'))$$,
  'an approved active same-organization user can download a verified object'
);
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.request_resource_attachment_object_deletion((select id from public.resource_attachments where file_name = 'maximum.pdf'))$$,
  'the uploader can request deletion of an OSS object'
);

reset role;
select lives_ok(
  $$select public.confirm_resource_attachment_object_deletion((select id from public.resource_attachments where file_name = 'maximum.pdf'))$$,
  'the server can confirm OSS object deletion'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.authorize_resource_attachment_object_download((select id from public.resource_attachments where file_name = 'maximum.pdf'))$$,
  '42501', 'Attachment is not available', 'deleted objects cannot be downloaded'
);

select * from finish();
rollback;
