-- Store daily-report attachment bytes in Alibaba Cloud OSS. PostgreSQL remains
-- authoritative for identity, authorization, lifecycle, revisions and locks.

alter table public.report_attachments
  add column if not exists object_verified_at timestamptz,
  add column if not exists object_deleted_at timestamptz;

alter table public.report_attachments
  drop constraint if exists report_attachments_byte_size_in_range;
alter table public.report_attachments
  add constraint report_attachments_byte_size_in_range
  check (byte_size between 1 and 104857600);

-- Keep both legacy metadata entry points aligned with the session-based path.
-- They still only create PostgreSQL metadata; object bytes are uploaded to OSS.
create or replace function public.begin_attachment_upload(
  p_report_id uuid, p_original_name text, p_mime_type text,
  p_byte_size integer, p_classification public.classification
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
  storage_name text;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_report from public.daily_reports
  where id = p_report_id and organization_id = private.current_organization_id()
    and author_id = auth.uid();
  if not found or not private.daily_report_is_editable(p_report_id, auth.uid(), business_date) then
    raise exception 'Report is not available for attachment upload' using errcode = '42501';
  end if;
  if p_byte_size < 1 or p_byte_size > 104857600 then
    raise exception 'Attachment size must be between 1 and 104857600 bytes' using errcode = '22023';
  end if;
  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;
  storage_name := format('organization/%s/reports/%s/%s/%s',
    target_report.organization_id, target_report.id, attachment_id, safe_name);
  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, original_name, storage_path,
    mime_type, byte_size, classification, state
  ) values (
    attachment_id, target_report.organization_id, target_report.id, auth.uid(),
    safe_name, storage_name, p_mime_type, p_byte_size, p_classification, 'pending'
  );
  return jsonb_build_object('id', attachment_id, 'path', storage_name, 'bucket', 'report-attachments');
end;
$$;

create or replace function public.begin_entry_attachment_upload(
  p_report_id uuid, p_entry_position integer, p_original_name text,
  p_mime_type text, p_byte_size integer, p_classification public.classification
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
  storage_name text;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_report from public.daily_reports
  where id = p_report_id and organization_id = private.current_organization_id()
    and author_id = auth.uid();
  if not found or not private.daily_report_is_editable(p_report_id, auth.uid(), business_date) then
    raise exception 'Report is not available for attachment upload' using errcode = '42501';
  end if;
  if p_entry_position < 1 then
    raise exception 'Daily OKR entry position is invalid' using errcode = '22023';
  end if;
  if p_byte_size < 1 or p_byte_size > 104857600 then
    raise exception 'Attachment size must be between 1 and 104857600 bytes' using errcode = '22023';
  end if;
  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;
  storage_name := format('organization/%s/reports/%s/%s/%s',
    target_report.organization_id, target_report.id, attachment_id, safe_name);
  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, original_name, storage_path,
    mime_type, byte_size, classification, state, entry_position
  ) values (
    attachment_id, target_report.organization_id, target_report.id, auth.uid(),
    safe_name, storage_name, p_mime_type, p_byte_size, p_classification, 'pending', p_entry_position
  );
  return jsonb_build_object('id', attachment_id, 'path', storage_name, 'bucket', 'report-attachments');
end;
$$;

create or replace function public.begin_entry_attachment_upload(
  p_report_id uuid,
  p_upload_session_id uuid,
  p_entry_position integer,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer,
  p_classification public.classification,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.daily_report_upload_sessions%rowtype;
  attachment_id uuid := gen_random_uuid();
  safe_name text;
  storage_name text;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.report_id = p_report_id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target_session.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;
  if p_entry_position < 1 then
    raise exception 'Daily OKR entry position is invalid' using errcode = '22023';
  end if;
  if p_byte_size < 1 or p_byte_size > 104857600 then
    raise exception 'Attachment size must be between 1 and 104857600 bytes' using errcode = '22023';
  end if;
  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'Attachment display name is invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;

  storage_name := format('organization/%s/reports/%s/%s/%s',
    target_session.organization_id, target_session.report_id, attachment_id, safe_name);
  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, upload_session_id,
    original_name, display_name, storage_path, mime_type, byte_size,
    classification, state, entry_position
  ) values (
    attachment_id, target_session.organization_id, target_session.report_id, auth.uid(), target_session.id,
    safe_name, trim(p_display_name), storage_name, p_mime_type, p_byte_size,
    p_classification, 'pending', p_entry_position
  );
  return jsonb_build_object('id', attachment_id, 'path', storage_name, 'bucket', 'report-attachments');
end;
$$;

create or replace function public.authorize_attachment_object_upload(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select attachment.* into target
  from public.report_attachments attachment
  left join public.daily_report_upload_sessions session
    on session.id = attachment.upload_session_id
   and session.organization_id = attachment.organization_id
   and session.report_id = attachment.report_id
   and session.author_id = attachment.uploader_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.state = 'pending'
    and attachment.object_verified_at is null
    and attachment.object_deleted_at is null
    and (attachment.upload_session_id is null or session.status = 'active');
  if not found or not private.daily_report_is_editable(target.report_id, auth.uid(), business_date) then
    raise exception 'Attachment is not available for upload' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', target.id, 'path', target.storage_path, 'mimeType', target.mime_type,
    'byteSize', target.byte_size, 'classification', target.classification
  );
end;
$$;

create or replace function public.confirm_attachment_object_upload(
  p_attachment_id uuid,
  p_checksum text,
  p_mime_type text,
  p_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target from public.report_attachments
  where id = p_attachment_id and state = 'pending'
  for update;
  if not found then
    raise exception 'Pending attachment not found' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target.report_id, target.uploader_id, business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;
  if target.byte_size::bigint <> p_byte_size or target.mime_type <> p_mime_type then
    raise exception 'Uploaded object metadata does not match attachment' using errcode = '22023';
  end if;
  update public.report_attachments
  set state = 'uploaded', checksum = nullif(p_checksum, ''),
      object_verified_at = timezone('utc', now()), object_deleted_at = null
  where id = target.id;
  if target.replacement_for_id is not null then
    update public.report_attachments set state = 'replaced'
    where id = target.replacement_for_id and state = 'uploaded';
  end if;
  return jsonb_build_object('id', target.id);
end;
$$;

create or replace function public.finalize_attachment_upload(p_attachment_id uuid, p_checksum text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Attachment finalization requires server-side OSS verification' using errcode = '42501';
end;
$$;

create or replace function public.authorize_attachment_object_download(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
begin
  select attachment.* into target
  from public.report_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.state = 'uploaded'
    and attachment.object_verified_at is not null
    and attachment.object_deleted_at is null
    and private.can_read_report_attachment(attachment.id);
  if not found then
    raise exception 'Attachment is not available' using errcode = '42501';
  end if;
  return jsonb_build_object('id', target.id, 'path', target.storage_path,
    'mimeType', target.mime_type, 'originalName', target.original_name, 'expiresIn', 60);
end;
$$;

create or replace function public.create_attachment_download(p_attachment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.authorize_attachment_object_download(p_attachment_id)
$$;

create or replace function public.request_attachment_object_deletion(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select attachment.* into target
  from public.report_attachments attachment
  left join public.daily_report_upload_sessions session
    on session.id = attachment.upload_session_id
   and session.organization_id = attachment.organization_id
   and session.report_id = attachment.report_id
   and session.author_id = attachment.uploader_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
    and (attachment.upload_session_id is null or session.status = 'active')
  for update of attachment;
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
  update public.report_attachments set state = 'deleted'
  where id = target.id and state <> 'deleted';
  return jsonb_build_object('id', target.id, 'path', target.storage_path,
    'alreadyDeleted', target.object_deleted_at is not null);
end;
$$;

create or replace function public.delete_daily_report_upload_attachment(p_attachment_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.request_attachment_object_deletion(p_attachment_id)
$$;

create or replace function public.confirm_attachment_object_deletion(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.report_attachments
  set state = 'deleted', object_deleted_at = coalesce(object_deleted_at, timezone('utc', now()))
  where id = p_attachment_id and state = 'deleted';
  if not found then
    raise exception 'Deleted attachment not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.abandon_daily_report_upload_session(p_upload_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.daily_report_upload_sessions%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_session from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.author_id = auth.uid() and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;
  update public.report_attachments attachment set state = 'deleted'
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null and attachment.daily_okr_block_id is null
    and attachment.state = 'pending';
  if exists (
    select 1 from public.report_attachments attachment
    where attachment.upload_session_id = target_session.id
      and attachment.organization_id = target_session.organization_id
      and attachment.report_id = target_session.report_id
      and attachment.uploader_id = auth.uid()
      and attachment.revision_id is null and attachment.daily_okr_block_id is null
      and ((attachment.state = 'deleted' and attachment.object_deleted_at is null)
        or attachment.state in ('uploaded', 'failed'))
  ) then return; end if;
  update public.report_attachments attachment set upload_session_id = null
  where attachment.upload_session_id = target_session.id
    and (attachment.revision_id is not null or attachment.daily_okr_block_id is not null);
  update public.daily_report_upload_sessions
  set status = 'abandoned', abandoned_at = timezone('utc', now())
  where id = target_session.id;
end;
$$;

revoke all on function public.authorize_attachment_object_upload(uuid) from public, anon;
revoke all on function public.authorize_attachment_object_download(uuid) from public, anon;
revoke all on function public.request_attachment_object_deletion(uuid) from public, anon;
revoke all on function public.confirm_attachment_object_upload(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.confirm_attachment_object_deletion(uuid) from public, anon, authenticated;
revoke all on function public.finalize_attachment_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_attachment_object_upload(uuid) to authenticated;
grant execute on function public.authorize_attachment_object_download(uuid) to authenticated;
grant execute on function public.request_attachment_object_deletion(uuid) to authenticated;
grant execute on function public.confirm_attachment_object_upload(uuid, text, text, bigint) to service_role;
grant execute on function public.confirm_attachment_object_deletion(uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
