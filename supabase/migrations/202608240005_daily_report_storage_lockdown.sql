-- The supported daily attachment flow uploads bytes directly to OSS and only
-- uses PostgreSQL for metadata, authorization and server-side confirmation.
-- Remove the remaining Supabase Storage policies and helper grants without
-- changing the session-aware metadata RPC used to start OSS uploads.

drop policy if exists attachment_object_insert on storage.objects;
drop policy if exists attachment_object_read on storage.objects;
drop policy if exists attachment_object_delete on storage.objects;

revoke all on function private.can_insert_attachment_object(text, jsonb)
  from public, anon, authenticated;
revoke all on function private.can_read_attachment_object(text)
  from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');
