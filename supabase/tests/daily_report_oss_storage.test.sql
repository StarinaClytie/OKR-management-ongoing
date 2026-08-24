begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select has_column('public', 'report_attachments', 'object_verified_at', 'attachments record OSS verification');
select has_column('public', 'report_attachments', 'object_deleted_at', 'attachments record OSS deletion');
select has_function('public', 'authorize_attachment_object_upload', array['uuid'], 'user upload authorization exists');
select has_function('public', 'authorize_attachment_object_download', array['uuid'], 'user download authorization exists');
select has_function('public', 'request_attachment_object_deletion', array['uuid'], 'user deletion authorization exists');
select has_function('public', 'confirm_attachment_object_upload', array['uuid', 'text', 'text', 'bigint'], 'server upload confirmation exists');
select has_function('public', 'confirm_attachment_object_deletion', array['uuid'], 'server deletion confirmation exists');
select ok(has_function_privilege('authenticated', 'public.authorize_attachment_object_upload(uuid)', 'execute'), 'authenticated can authorize uploads');
select ok(not has_function_privilege('authenticated', 'public.confirm_attachment_object_upload(uuid,text,text,bigint)', 'execute'), 'authenticated cannot attest OSS uploads');
select ok(has_function_privilege('service_role', 'public.confirm_attachment_object_upload(uuid,text,text,bigint)', 'execute'), 'service role can attest verified OSS uploads');

select * from finish();
rollback;
