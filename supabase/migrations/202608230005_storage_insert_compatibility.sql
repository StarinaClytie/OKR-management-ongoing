-- Alibaba Cloud's Supabase Storage gateway evaluates the storage.objects
-- INSERT policy before the final object metadata is populated. Authorize the
-- server-issued pending path here; finalize_attachment_upload remains the
-- strict MIME type and byte-size verification boundary.
create or replace function private.can_insert_attachment_object(
  object_name text,
  object_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_attachments attachment
    join public.daily_reports report on report.id = attachment.report_id
    where attachment.storage_path = object_name
      and attachment.organization_id = private.current_organization_id()
      and attachment.uploader_id = auth.uid()
      and attachment.state = 'pending'
      and report.organization_id = attachment.organization_id
      and report.author_id = auth.uid()
      and report.status in ('draft', 'submitted', 'returned')
  )
$$;

revoke all on function private.can_insert_attachment_object(text, jsonb) from public, anon;
grant execute on function private.can_insert_attachment_object(text, jsonb) to authenticated;
