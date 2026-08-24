-- Store resource attachment bytes in Alibaba Cloud OSS. PostgreSQL remains
-- authoritative for attachment identity, authorization and object lifecycle.

alter table public.resource_attachments
  add column if not exists object_verified_at timestamptz,
  add column if not exists object_deleted_at timestamptz;

alter table public.resource_attachments
  drop constraint if exists resource_attachments_size_bytes_in_range;
alter table public.resource_attachments
  add constraint resource_attachments_size_bytes_in_range
  check (size_bytes between 1 and 104857600);

-- Resource attachment metadata is created before direct OSS upload. The
-- database derives the object path; callers never choose an OSS key.
create or replace function public.begin_resource_attachment_upload(
  p_resource_id uuid,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  attachment_id uuid := gen_random_uuid();
  safe_name text;
  storage_name text;
begin
  select * into target
  from public.resources
  where id = p_resource_id
    and organization_id = private.current_organization_id()
  for update;
  if not found or not private.is_operational() then
    raise exception 'Resource is not editable by the current user' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator') or target.owner_id = auth.uid()) then
    raise exception 'Resource is not editable by the current user' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived resources cannot receive attachments' using errcode = '22023';
  end if;
  if p_byte_size < 1 or p_byte_size > 104857600 then
    raise exception 'Attachment size must be between 1 and 104857600 bytes' using errcode = '22023';
  end if;

  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;
  storage_name := format('organization/%s/resources/%s/%s/%s',
    target.organization_id, target.id, attachment_id, safe_name);

  insert into public.resource_attachments (
    id, organization_id, resource_id, uploader_id, file_name, storage_path, mime_type, size_bytes
  ) values (
    attachment_id, target.organization_id, target.id, auth.uid(), safe_name,
    storage_name, p_mime_type, p_byte_size
  );

  return jsonb_build_object('id', attachment_id, 'path', storage_name);
end;
$$;

create or replace function public.authorize_resource_attachment_object_upload(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.resource_attachments%rowtype;
begin
  select attachment.* into target
  from public.resource_attachments attachment
  join public.resources resource on resource.id = attachment.resource_id
    and resource.organization_id = attachment.organization_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.object_verified_at is null
    and attachment.object_deleted_at is null
    and resource.archived_at is null;
  if not found or not private.is_operational() then
    raise exception 'Attachment is not available for upload' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator') or exists (
    select 1 from public.resources resource where resource.id = target.resource_id and resource.owner_id = auth.uid()
  )) then
    raise exception 'Attachment is not available for upload' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', target.id,
    'path', target.storage_path,
    'mimeType', target.mime_type,
    'byteSize', target.size_bytes
  );
end;
$$;

create or replace function public.confirm_resource_attachment_object_upload(
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
  target public.resource_attachments%rowtype;
begin
  select * into target
  from public.resource_attachments
  where id = p_attachment_id
    and object_verified_at is null
    and object_deleted_at is null
  for update;
  if not found then
    raise exception 'Pending attachment not found' using errcode = '42501';
  end if;
  if target.size_bytes::bigint <> p_byte_size or target.mime_type <> p_mime_type then
    raise exception 'Uploaded object metadata does not match attachment' using errcode = '22023';
  end if;

  update public.resource_attachments
  set object_verified_at = timezone('utc', now()),
      object_deleted_at = null
  where id = target.id;

  return jsonb_build_object('id', target.id);
end;
$$;

-- Supabase Storage can no longer attest resource bytes. The Node attachment
-- service verifies OSS HEAD metadata before invoking the confirmation RPC.
create or replace function public.finalize_resource_attachment_upload(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Attachment finalization requires server-side OSS verification' using errcode = '42501';
end;
$$;

create or replace function public.authorize_resource_attachment_object_download(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.resource_attachments%rowtype;
begin
  select attachment.* into target
  from public.resource_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.object_verified_at is not null
    and attachment.object_deleted_at is null;
  if not found or not private.is_operational() then
    raise exception 'Attachment is not available' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', target.id,
    'path', target.storage_path,
    'mimeType', target.mime_type,
    'fileName', target.file_name,
    'expiresIn', 60
  );
end;
$$;

create or replace function public.request_resource_attachment_object_deletion(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resource_attachments%rowtype;
begin
  select attachment.* into target
  from public.resource_attachments attachment
  join public.resources resource on resource.id = attachment.resource_id
    and resource.organization_id = attachment.organization_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
  for update of attachment;
  if not found or not private.is_operational() then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator') or exists (
    select 1 from public.resources resource where resource.id = target.resource_id and resource.owner_id = auth.uid()
  )) then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', target.id,
    'path', target.storage_path,
    'alreadyDeleted', target.object_deleted_at is not null
  );
end;
$$;

create or replace function public.confirm_resource_attachment_object_deletion(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.resource_attachments
  set object_deleted_at = coalesce(object_deleted_at, timezone('utc', now()))
  where id = p_attachment_id;
  if not found then
    raise exception 'Attachment not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.begin_resource_attachment_upload(uuid, text, text, integer) from public, anon;
revoke all on function public.finalize_resource_attachment_upload(uuid) from public, anon, authenticated;
revoke all on function public.create_resource_attachment_download(uuid) from public, anon, authenticated;
revoke all on function public.authorize_resource_attachment_object_upload(uuid) from public, anon;
revoke all on function public.authorize_resource_attachment_object_download(uuid) from public, anon;
revoke all on function public.request_resource_attachment_object_deletion(uuid) from public, anon;
revoke all on function public.confirm_resource_attachment_object_upload(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.confirm_resource_attachment_object_deletion(uuid) from public, anon, authenticated;

grant execute on function public.begin_resource_attachment_upload(uuid, text, text, integer) to authenticated;
grant execute on function public.authorize_resource_attachment_object_upload(uuid) to authenticated;
grant execute on function public.authorize_resource_attachment_object_download(uuid) to authenticated;
grant execute on function public.request_resource_attachment_object_deletion(uuid) to authenticated;
grant execute on function public.confirm_resource_attachment_object_upload(uuid, text, text, bigint) to service_role;
grant execute on function public.confirm_resource_attachment_object_deletion(uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
