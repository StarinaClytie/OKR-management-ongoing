alter table public.report_attachments
  add column replacement_for_id uuid references public.report_attachments(id) on delete restrict;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-attachments',
  'report-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.safe_attachment_name(original_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
begin
  cleaned := regexp_replace(coalesce(original_name, ''), '^.*[\\/]', '');
  cleaned := regexp_replace(cleaned, '[^A-Za-z0-9._ -]', '_', 'g');
  cleaned := regexp_replace(cleaned, '\.{2,}', '.', 'g');
  cleaned := trim(both ' .-' from cleaned);
  if cleaned = '' then
    raise exception 'Attachment filename is invalid' using errcode = '22023';
  end if;
  return left(cleaned, 180);
end;
$$;

create or replace function private.attachment_type_allowed(original_name text, mime_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(substring(original_name from '\.([^.]+)$'))
    when 'pdf' then mime_type = 'application/pdf'
    when 'doc' then mime_type = 'application/msword'
    when 'docx' then mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xls' then mime_type = 'application/vnd.ms-excel'
    when 'xlsx' then mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'csv' then mime_type = 'text/csv'
    when 'png' then mime_type = 'image/png'
    when 'jpg' then mime_type = 'image/jpeg'
    when 'jpeg' then mime_type = 'image/jpeg'
    when 'txt' then mime_type = 'text/plain'
    else false
  end
$$;

create or replace function public.begin_attachment_upload(
  p_report_id uuid,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer,
  p_classification public.classification
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report public.daily_reports%rowtype;
  attachment_id uuid := gen_random_uuid();
  safe_name text;
begin
  select * into target_report
  from public.daily_reports
  where id = p_report_id
    and author_id = auth.uid()
    and status in ('draft', 'submitted', 'returned');

  if not found then
    raise exception 'Report is not available for attachment upload' using errcode = '42501';
  end if;
  if p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'Attachment size must be between 1 and 10485760 bytes' using errcode = '22023';
  end if;
  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;

  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, original_name, storage_path,
    mime_type, byte_size, classification, state
  ) values (
    attachment_id,
    target_report.organization_id,
    target_report.id,
    auth.uid(),
    safe_name,
    format('organization/%s/reports/%s/%s/%s', target_report.organization_id, target_report.id, attachment_id, safe_name),
    p_mime_type,
    p_byte_size,
    p_classification,
    'pending'
  );
  return jsonb_build_object(
    'id', attachment_id,
    'path', format('organization/%s/reports/%s/%s/%s', target_report.organization_id, target_report.id, attachment_id, safe_name),
    'bucket', 'report-attachments'
  );
end;
$$;

create or replace function public.finalize_attachment_upload(p_attachment_id uuid, p_checksum text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
begin
  select * into target
  from public.report_attachments
  where id = p_attachment_id and uploader_id = auth.uid() and state = 'pending'
  for update;
  if not found then
    raise exception 'Pending attachment not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'report-attachments'
      and o.name = target.storage_path
      and o.owner_id = auth.uid()::text
      and coalesce((o.metadata->>'size')::integer, -1) = target.byte_size
      and o.metadata->>'mimetype' = target.mime_type
  ) then
    raise exception 'Uploaded object metadata does not match attachment' using errcode = '22023';
  end if;

  update public.report_attachments
  set state = 'uploaded', checksum = nullif(p_checksum, '')
  where id = target.id;

  if target.replacement_for_id is not null then
    update public.report_attachments
    set state = 'replaced'
    where id = target.replacement_for_id
      and uploader_id = auth.uid()
      and state = 'uploaded';
  end if;
  return jsonb_build_object('id', target.id);
end;
$$;

create or replace function public.replace_attachment(
  p_attachment_id uuid,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer,
  p_classification public.classification
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_attachment public.report_attachments%rowtype;
  new_attachment jsonb;
begin
  select * into old_attachment from public.report_attachments
  where id = p_attachment_id and uploader_id = auth.uid() and state = 'uploaded';
  if not found then
    raise exception 'Attachment is not available for replacement' using errcode = '42501';
  end if;
  new_attachment := public.begin_attachment_upload(old_attachment.report_id, p_original_name, p_mime_type, p_byte_size, p_classification);
  update public.report_attachments set replacement_for_id = old_attachment.id where id = (new_attachment->>'id')::uuid;
  return new_attachment;
end;
$$;

create or replace function public.soft_delete_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.report_attachments a
  set state = 'deleted'
  where a.id = p_attachment_id
    and a.uploader_id = auth.uid()
    and a.state in ('pending', 'uploaded', 'failed')
    and exists (select 1 from public.daily_reports dr where dr.id = a.report_id and dr.author_id = auth.uid() and dr.status <> 'confirmed');
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_attachment_download(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
begin
  select * into target from public.report_attachments
  where id = p_attachment_id
    and state = 'uploaded'
    and private.has_clearance(classification)
    and private.can_read_report_detail(report_id);
  if not found then
    raise exception 'Attachment is not available' using errcode = '42501';
  end if;
  return jsonb_build_object('bucket', 'report-attachments', 'path', target.storage_path, 'expiresIn', 60);
end;
$$;

create or replace function private.can_insert_attachment_object(object_name text, object_metadata jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.report_attachments a
    join public.daily_reports dr on dr.id = a.report_id
    where a.storage_path = object_name
      and a.uploader_id = auth.uid()
      and a.state = 'pending'
      and dr.author_id = auth.uid()
      and dr.status in ('draft', 'submitted', 'returned')
      and object_metadata->>'mimetype' = a.mime_type
      and coalesce((object_metadata->>'size')::integer, -1) = a.byte_size
  )
$$;

create or replace function private.can_read_attachment_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.report_attachments a
    where a.storage_path = object_name
      and a.state = 'uploaded'
      and private.has_clearance(a.classification)
      and private.can_read_report_detail(a.report_id)
  )
$$;

create policy attachment_object_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-attachments'
  and owner_id = auth.uid()::text
  and private.can_insert_attachment_object(name, metadata)
);
create policy attachment_object_read on storage.objects for select to authenticated
using (bucket_id = 'report-attachments' and private.can_read_attachment_object(name));
create policy attachment_object_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'report-attachments'
  and exists (
    select 1 from public.report_attachments a
    where a.storage_path = name
      and a.uploader_id = auth.uid()
      and a.state in ('replaced', 'deleted')
  )
);

revoke all on function public.begin_attachment_upload(uuid, text, text, integer, public.classification) from public, anon;
revoke all on function public.finalize_attachment_upload(uuid, text) from public, anon;
revoke all on function public.replace_attachment(uuid, text, text, integer, public.classification) from public, anon;
revoke all on function public.soft_delete_attachment(uuid) from public, anon;
revoke all on function public.create_attachment_download(uuid) from public, anon;
grant execute on function public.begin_attachment_upload(uuid, text, text, integer, public.classification) to authenticated;
grant execute on function public.finalize_attachment_upload(uuid, text) to authenticated;
grant execute on function public.replace_attachment(uuid, text, text, integer, public.classification) to authenticated;
grant execute on function public.soft_delete_attachment(uuid) to authenticated;
grant execute on function public.create_attachment_download(uuid) to authenticated;
grant execute on function private.can_insert_attachment_object(text, jsonb) to authenticated;
grant execute on function private.can_read_attachment_object(text) to authenticated;
