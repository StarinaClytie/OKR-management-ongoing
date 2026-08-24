-- Store resource attachment bytes in Alibaba Cloud OSS. PostgreSQL remains
-- authoritative for attachment identity, authorization and object lifecycle.

alter table public.resource_attachments
  add column if not exists state public.attachment_state not null default 'pending',
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
    and attachment.state = 'pending'
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
    and state = 'pending'
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
  set state = 'uploaded',
      object_verified_at = timezone('utc', now()),
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
    and attachment.state = 'uploaded'
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
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
  for update of attachment;
  if not found or not private.is_operational() then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator') or exists (
    select 1 from public.resources resource where resource.id = target.resource_id and resource.owner_id = auth.uid()
  )) then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;

  update public.resource_attachments
  set state = 'deleted'
  where id = target.id and state <> 'deleted';

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
  where id = p_attachment_id and state = 'deleted';
  if not found then
    raise exception 'Deleted attachment not found' using errcode = '42501';
  end if;
end;
$$;

-- Resource detail is a completed-object view. Pending metadata and metadata
-- whose OSS object has been deleted must not appear as downloadable files.
create or replace function public.get_resource_detail(p_resource_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  owner_name text;
  attachments jsonb := '[]'::jsonb;
  problems jsonb := '[]'::jsonb;
begin
  select * into target
  from public.resources
  where id = p_resource_id
    and organization_id = private.current_organization_id();
  if not found or not private.is_operational() then
    return null;
  end if;

  select p.display_name into owner_name
  from public.profiles p
  where p.id = target.owner_id;

  select coalesce(jsonb_agg(a order by a->>'createdAt'), '[]'::jsonb) into attachments
  from (
    select jsonb_build_object(
      'id', ra.id,
      'fileName', ra.file_name,
      'mimeType', ra.mime_type,
      'sizeBytes', ra.size_bytes,
      'createdAt', ra.created_at
    ) as a
    from public.resource_attachments ra
    where ra.resource_id = target.id
      and ra.state = 'uploaded'
      and ra.object_verified_at is not null
      and ra.object_deleted_at is null
  ) attachment_rows;

  select coalesce(jsonb_agg(pr order by pr->>'reportedAt'), '[]'::jsonb) into problems
  from (
    select jsonb_build_object(
      'id', rp.id,
      'problemType', rp.problem_type,
      'description', rp.description,
      'status', rp.status,
      'reporterId', rp.reporter_id,
      'reporterName', reporter.display_name,
      'reportedAt', rp.reported_at,
      'resolvedAt', rp.resolved_at,
      'resolvedBy', rp.resolved_by,
      'resolvedByName', resolver.display_name,
      'resolutionNote', rp.resolution_note,
      'notificationStatus', coalesce(n.status, 'pending'::public.resource_notification_status),
      'notificationErrorCode', n.error_code
    ) as pr
    from public.resource_problems rp
    join public.profiles reporter on reporter.id = rp.reporter_id
    left join public.profiles resolver on resolver.id = rp.resolved_by
    left join public.resource_problem_notifications n on n.problem_id = rp.id
    where rp.resource_id = target.id
  ) problem_rows;

  return jsonb_build_object(
    'id', target.id,
    'name', target.name,
    'category', target.category,
    'resourceKind', target.resource_kind,
    'description', target.description,
    'ownerId', target.owner_id,
    'ownerName', coalesce(owner_name, ''),
    'location', target.location,
    'purchaseDate', target.purchase_date,
    'purchaseVendor', target.purchase_vendor,
    'purchaseReference', target.purchase_reference,
    'usageNotes', target.usage_notes,
    'manualUrl', target.manual_url,
    'quantity', target.quantity,
    'unit', target.unit,
    'status', target.status,
    'createdById', target.created_by,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at,
    'archivedAt', target.archived_at,
    'attachments', attachments,
    'problems', problems
  );
end;
$$;

-- Resource attachment bytes no longer transit Supabase Storage. Remove the
-- legacy direct-object policies and helper execution grants as defense in depth.
drop policy if exists resource_document_object_insert on storage.objects;
drop policy if exists resource_document_object_read on storage.objects;

revoke all on function public.begin_resource_attachment_upload(uuid, text, text, integer) from public, anon;
revoke all on function public.finalize_resource_attachment_upload(uuid) from public, anon, authenticated;
revoke all on function public.create_resource_attachment_download(uuid) from public, anon, authenticated;
revoke all on function private.can_insert_resource_attachment_object(text, jsonb) from public, anon, authenticated;
revoke all on function private.can_read_resource_attachment_object(text) from public, anon, authenticated;
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
