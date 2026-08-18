-- Phase 3 — Resources & Supplies (资源与耗材)
--
-- A shared, searchable inventory of heterogeneous laboratory/company physical
-- resources (optics, chemicals, vacuum, tools, electronics, mechanical parts,
-- consumables, safety, other) with a durable/consumable distinction, non-
-- destructive archive, a problem-reporting lifecycle, and server-resolved email
-- notification to the resource owner.
--
-- Schema is additive only. Three new business tables (resources,
-- resource_attachments, resource_problems) plus a notification audit trail
-- (resource_problem_notifications). All mutations are SECURITY DEFINER RPCs;
-- the authenticated role receives SELECT only (as with projects in Phase 2), so
-- no broad authenticated write is introduced. Authorization is always derived
-- from auth.uid() / private.current_organization_id(); the browser never
-- supplies organization_id or owner_id.

create type public.resource_category as enum (
  'optics', 'chemicals', 'vacuum', 'tools', 'electronics',
  'mechanical', 'consumables', 'safety', 'other'
);

create type public.resource_kind as enum (
  'durable', 'consumable'
);

create type public.resource_status as enum (
  'available', 'in_use', 'maintenance', 'damaged', 'missing',
  'out_of_stock', 'archived'
);

create type public.resource_problem_type as enum (
  'location_incorrect', 'missing', 'damaged', 'malfunction',
  'quantity_incorrect', 'manual_issue', 'other'
);

create type public.resource_problem_status as enum (
  'open', 'resolved'
);

create type public.resource_notification_status as enum (
  'pending', 'sent', 'failed'
);

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category public.resource_category not null default 'other',
  resource_kind public.resource_kind not null default 'durable',
  description text not null default '',
  owner_id uuid not null references public.profiles(id) on delete restrict,
  location text not null check (length(trim(location)) > 0),
  purchase_date date,
  purchase_vendor text,
  purchase_reference text,
  usage_notes text,
  manual_url text,
  quantity numeric check (quantity >= 0),
  unit text,
  status public.resource_status not null default 'available',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

alter table public.resources add constraint resources_organization_id_id_key unique (organization_id, id);
alter table public.resources
  add constraint resources_organization_owner_fkey
    foreign key (organization_id, owner_id) references public.profiles (organization_id, id),
  add constraint resources_organization_created_by_fkey
    foreign key (organization_id, created_by) references public.profiles (organization_id, id);

comment on column public.resources.archived_at is
  'Non-destructive archive timestamp. When set, status is always ''archived''; archived resources are hidden from default lists but keep problems and attachments.';

create index resources_organization_idx on public.resources (organization_id);
create index resources_owner_idx on public.resources (owner_id);
create index resources_category_idx on public.resources (category);
create index resources_status_idx on public.resources (status);
create index resources_organization_status_idx on public.resources (organization_id, status);

-- ---------------------------------------------------------------------------
-- resource_attachments
-- ---------------------------------------------------------------------------
create table public.resource_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete restrict,
  file_name text not null check (length(trim(file_name)) > 0),
  storage_path text not null check (length(trim(storage_path)) > 0),
  mime_type text not null check (length(trim(mime_type)) > 0),
  size_bytes integer not null constraint resource_attachments_size_bytes_in_range check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default timezone('utc', now()),
  unique (storage_path)
);

alter table public.resource_attachments add constraint resource_attachments_organization_id_id_key unique (organization_id, id);
alter table public.resource_attachments
  add constraint resource_attachments_organization_resource_fkey
    foreign key (organization_id, resource_id) references public.resources (organization_id, id),
  add constraint resource_attachments_organization_uploader_fkey
    foreign key (organization_id, uploader_id) references public.profiles (organization_id, id);

create index resource_attachments_resource_idx on public.resource_attachments (resource_id);

-- ---------------------------------------------------------------------------
-- resource_problems
-- ---------------------------------------------------------------------------
create table public.resource_problems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  problem_type public.resource_problem_type not null,
  description text not null check (length(trim(description)) > 0),
  status public.resource_problem_status not null default 'open',
  reported_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolution_note text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.resource_problems add constraint resource_problems_organization_id_id_key unique (organization_id, id);
alter table public.resource_problems
  add constraint resource_problems_organization_resource_fkey
    foreign key (organization_id, resource_id) references public.resources (organization_id, id),
  add constraint resource_problems_organization_reporter_fkey
    foreign key (organization_id, reporter_id) references public.profiles (organization_id, id),
  add constraint resource_problems_organization_resolved_by_fkey
    foreign key (organization_id, resolved_by) references public.profiles (organization_id, id);

create index resource_problems_resource_idx on public.resource_problems (resource_id);
create index resource_problems_organization_idx on public.resource_problems (organization_id);

-- ---------------------------------------------------------------------------
-- resource_problem_notifications — notification audit trail.
-- Populated server-side by report_resource_problem; delivery is attempted by the
-- `resource-problem-notify` Edge Function. Never exposes provider payloads.
-- ---------------------------------------------------------------------------
create table public.resource_problem_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  problem_id uuid not null references public.resource_problems(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  recipient_email text not null check (length(trim(recipient_email)) > 0),
  status public.resource_notification_status not null default 'pending',
  sent_at timestamptz,
  error_code text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.resource_problem_notifications add constraint resource_problem_notifications_organization_id_id_key unique (organization_id, id);
alter table public.resource_problem_notifications
  add constraint resource_problem_notifications_organization_problem_fkey
    foreign key (organization_id, problem_id) references public.resource_problems (organization_id, id);

create index resource_problem_notifications_problem_idx on public.resource_problem_notifications (problem_id);

create trigger set_resources_updated_at before update on public.resources
for each row execute function public.set_updated_at();
create trigger set_resource_problems_updated_at before update on public.resource_problems
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
-- A profile is operational only when active AND onboarding-complete. Inactive or
-- onboarding-incomplete accounts receive no operational resource access.
create or replace function private.is_operational()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.onboarding_completed
  )
$$;

revoke all on function private.is_operational() from public, anon;
grant execute on function private.is_operational() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.resources enable row level security;
alter table public.resource_attachments enable row level security;
alter table public.resource_problems enable row level security;
alter table public.resource_problem_notifications enable row level security;

alter table public.resources force row level security;
alter table public.resource_attachments force row level security;
alter table public.resource_problems force row level security;
alter table public.resource_problem_notifications force row level security;

create policy resources_read on public.resources for select to authenticated
using (organization_id = private.current_organization_id() and private.is_operational());

create policy resource_attachments_read on public.resource_attachments for select to authenticated
using (organization_id = private.current_organization_id() and private.is_operational());

create policy resource_problems_read on public.resource_problems for select to authenticated
using (organization_id = private.current_organization_id() and private.is_operational());

-- No authenticated read/write on the notification audit trail: only the report
-- RPC (SECURITY DEFINER) inserts and only the Edge Function (service role)
-- updates it.

grant select on public.resources, public.resource_attachments, public.resource_problems to authenticated;
revoke insert, update, delete on public.resources, public.resource_attachments, public.resource_problems from authenticated;
revoke all on public.resource_problem_notifications from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_resource — any operational organization member. The creator becomes the
-- owner automatically; owner_id is never accepted from the caller.
-- ---------------------------------------------------------------------------
create or replace function public.create_resource(
  p_name text,
  p_category public.resource_category,
  p_resource_kind public.resource_kind,
  p_description text,
  p_location text,
  p_purchase_date date,
  p_purchase_vendor text,
  p_purchase_reference text,
  p_usage_notes text,
  p_manual_url text,
  p_quantity numeric,
  p_unit text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  resource_id uuid := gen_random_uuid();
begin
  target_org := private.current_organization_id();
  if target_org is null or not private.is_operational() then
    raise exception 'Resources are not writable by the current user' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Resource name is required' using errcode = '22023';
  end if;
  if length(p_name) > 200 then
    raise exception 'Resource name is too long' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_location, ''))) = 0 then
    raise exception 'Resource location is required' using errcode = '22023';
  end if;
  if p_category is null or p_resource_kind is null then
    raise exception 'Resource category and kind are required' using errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception 'Resource quantity cannot be negative' using errcode = '22023';
  end if;

  insert into public.resources (
    id, organization_id, name, category, resource_kind, description,
    owner_id, location, purchase_date, purchase_vendor, purchase_reference,
    usage_notes, manual_url, quantity, unit, status, created_by
  ) values (
    resource_id, target_org, trim(p_name), p_category, p_resource_kind,
    coalesce(p_description, ''), auth.uid(), trim(p_location), p_purchase_date,
    nullif(trim(coalesce(p_purchase_vendor, '')), ''), nullif(trim(coalesce(p_purchase_reference, '')), ''),
    nullif(trim(coalesce(p_usage_notes, '')), ''), nullif(trim(coalesce(p_manual_url, '')), ''),
    p_quantity, nullif(trim(coalesce(p_unit, '')), ''), 'available', auth.uid()
  );
  return resource_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_resource — owner or management/administrator. Archived resources are
-- frozen until restored. Status is never set to 'archived' here (use
-- archive_resource). owner_id is immutable in V1.
-- ---------------------------------------------------------------------------
create or replace function public.update_resource(
  p_resource_id uuid,
  p_name text,
  p_category public.resource_category,
  p_resource_kind public.resource_kind,
  p_description text,
  p_location text,
  p_purchase_date date,
  p_purchase_vendor text,
  p_purchase_reference text,
  p_usage_notes text,
  p_manual_url text,
  p_quantity numeric,
  p_unit text,
  p_status public.resource_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  is_management boolean;
begin
  select * into target
  from public.resources
  where id = p_resource_id
    and organization_id = private.current_organization_id()
  for update;
  if not found or not private.is_operational() then
    raise exception 'Resource is not editable by the current user' using errcode = '42501';
  end if;

  is_management := private.has_role('management') or private.has_role('administrator');
  if not (is_management or target.owner_id = auth.uid()) then
    raise exception 'Resource is not editable by the current user' using errcode = '42501';
  end if;

  if target.archived_at is not null then
    raise exception 'Archived resources cannot be edited' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Resource name is required' using errcode = '22023';
  end if;
  if length(p_name) > 200 then
    raise exception 'Resource name is too long' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_location, ''))) = 0 then
    raise exception 'Resource location is required' using errcode = '22023';
  end if;
  if p_category is null or p_resource_kind is null or p_status is null then
    raise exception 'Resource category, kind, and status are required' using errcode = '22023';
  end if;
  if p_status = 'archived'::public.resource_status then
    raise exception 'Resource status is invalid' using errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception 'Resource quantity cannot be negative' using errcode = '22023';
  end if;

  update public.resources
  set name = trim(p_name),
      category = p_category,
      resource_kind = p_resource_kind,
      description = coalesce(p_description, ''),
      location = trim(p_location),
      purchase_date = p_purchase_date,
      purchase_vendor = nullif(trim(coalesce(p_purchase_vendor, '')), ''),
      purchase_reference = nullif(trim(coalesce(p_purchase_reference, '')), ''),
      usage_notes = nullif(trim(coalesce(p_usage_notes, '')), ''),
      manual_url = nullif(trim(coalesce(p_manual_url, '')), ''),
      quantity = p_quantity,
      unit = nullif(trim(coalesce(p_unit, '')), ''),
      status = p_status
  where id = target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_resource / restore_resource — owner or management/administrator,
-- idempotent, non-destructive. Problems and attachments are preserved.
-- ---------------------------------------------------------------------------
create or replace function public.archive_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
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

  update public.resources
  set status = 'archived'::public.resource_status,
      archived_at = timezone('utc', now())
  where id = target.id and archived_at is null;
end;
$$;

create or replace function public.restore_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
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

  update public.resources
  set status = 'available'::public.resource_status,
      archived_at = null
  where id = target.id and archived_at is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- report_resource_problem — any operational organization member against a
-- visible, non-archived resource. Reporter is always auth.uid(); the owner's
-- email is resolved server-side into a pending notification so a failed email
-- can never roll back the persisted problem.
-- ---------------------------------------------------------------------------
create or replace function public.report_resource_problem(
  p_resource_id uuid,
  p_problem_type public.resource_problem_type,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  owner_email text;
  problem_id uuid := gen_random_uuid();
  notification_id uuid := gen_random_uuid();
begin
  select * into target
  from public.resources
  where id = p_resource_id
    and organization_id = private.current_organization_id()
  for update;
  if not found or not private.is_operational() then
    raise exception 'Resource problem is not reportable by the current user' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived resources cannot be reported' using errcode = '22023';
  end if;
  if p_problem_type is null or length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Problem type and description are required' using errcode = '22023';
  end if;

  select p.email into owner_email
  from public.profiles p
  where p.id = target.owner_id
    and p.organization_id = target.organization_id;

  insert into public.resource_problems (
    id, organization_id, resource_id, reporter_id, problem_type, description, status
  ) values (
    problem_id, target.organization_id, target.id, auth.uid(), p_problem_type, trim(p_description), 'open'
  );

  insert into public.resource_problem_notifications (
    id, organization_id, problem_id, recipient_id, recipient_email, status
  ) values (
    notification_id, target.organization_id, problem_id, target.owner_id,
    coalesce(owner_email, ''), 'pending'
  );

  return jsonb_build_object('problemId', problem_id, 'notificationId', notification_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_resource_problem — resource owner or management/administrator.
-- Resolution history is preserved; rows are never deleted.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_resource_problem(
  p_problem_id uuid,
  p_resolution_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resource_problems%rowtype;
  target_resource public.resources%rowtype;
begin
  select * into target
  from public.resource_problems
  where id = p_problem_id
    and organization_id = private.current_organization_id()
  for update;
  if not found or not private.is_operational() then
    raise exception 'Resource problem is not resolvable by the current user' using errcode = '42501';
  end if;
  if target.status = 'resolved'::public.resource_problem_status then
    raise exception 'Resource problem is already resolved' using errcode = '22023';
  end if;

  select * into target_resource
  from public.resources
  where id = target.resource_id
    and organization_id = target.organization_id;

  if not (private.has_role('management') or private.has_role('administrator') or target_resource.owner_id = auth.uid()) then
    raise exception 'Resource problem is not resolvable by the current user' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_resolution_note, ''))) = 0 then
    raise exception 'Resolution note is required' using errcode = '22023';
  end if;

  update public.resource_problems
  set status = 'resolved'::public.resource_problem_status,
      resolved_at = timezone('utc', now()),
      resolved_by = auth.uid(),
      resolution_note = trim(p_resolution_note)
  where id = target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_resource_detail — single authorized read for the detail page. Returns null
-- for both "not found" and "not authorized" so a foreign resource's existence is
-- never leaked. Includes owner name, attachments, and problems.
-- ---------------------------------------------------------------------------
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
      'resolutionNote', rp.resolution_note
    ) as pr
    from public.resource_problems rp
    join public.profiles reporter on reporter.id = rp.reporter_id
    left join public.profiles resolver on resolver.id = rp.resolved_by
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

revoke all on function public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text) from public, anon;
revoke all on function public.update_resource(uuid, text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, public.resource_status) from public, anon;
revoke all on function public.archive_resource(uuid) from public, anon;
revoke all on function public.restore_resource(uuid) from public, anon;
revoke all on function public.report_resource_problem(uuid, public.resource_problem_type, text) from public, anon;
revoke all on function public.resolve_resource_problem(uuid, text) from public, anon;
revoke all on function public.get_resource_detail(uuid) from public, anon;

grant execute on function public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.update_resource(uuid, text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, public.resource_status) to authenticated;
grant execute on function public.archive_resource(uuid) to authenticated;
grant execute on function public.restore_resource(uuid) to authenticated;
grant execute on function public.report_resource_problem(uuid, public.resource_problem_type, text) to authenticated;
grant execute on function public.resolve_resource_problem(uuid, text) to authenticated;
grant execute on function public.get_resource_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage — dedicated private bucket for resource documents (manuals,
-- datasheets, SOPs, calibration/safety instructions).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resource-documents',
  'resource-documents',
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

-- begin_resource_attachment_upload — owner or management/administrator starts a
-- manual/document upload against an editable resource.
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
  if p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'Attachment size must be between 1 and 10485760 bytes' using errcode = '22023';
  end if;

  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;

  insert into public.resource_attachments (
    id, organization_id, resource_id, uploader_id, file_name, storage_path, mime_type, size_bytes
  ) values (
    attachment_id, target.organization_id, target.id, auth.uid(), safe_name,
    format('organization/%s/resources/%s/%s/%s', target.organization_id, target.id, attachment_id, safe_name),
    p_mime_type, p_byte_size
  );
  return jsonb_build_object(
    'id', attachment_id,
    'path', format('organization/%s/resources/%s/%s/%s', target.organization_id, target.id, attachment_id, safe_name),
    'bucket', 'resource-documents'
  );
end;
$$;

create or replace function public.finalize_resource_attachment_upload(p_attachment_id uuid)
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
  where id = p_attachment_id and uploader_id = auth.uid()
  for update;
  if not found then
    raise exception 'Pending attachment not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'resource-documents'
      and o.name = target.storage_path
      and o.owner_id = auth.uid()::text
      and coalesce((o.metadata->>'size')::integer, -1) = target.size_bytes
      and o.metadata->>'mimetype' = target.mime_type
  ) then
    raise exception 'Uploaded object metadata does not match attachment' using errcode = '22023';
  end if;
  return jsonb_build_object('id', target.id);
end;
$$;

create or replace function public.create_resource_attachment_download(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.resource_attachments%rowtype;
begin
  select * into target
  from public.resource_attachments ra
  where ra.id = p_attachment_id
    and ra.organization_id = private.current_organization_id()
    and private.is_operational();
  if not found then
    raise exception 'Attachment is not available' using errcode = '42501';
  end if;
  return jsonb_build_object('bucket', 'resource-documents', 'path', target.storage_path, 'expiresIn', 60);
end;
$$;

create or replace function private.can_insert_resource_attachment_object(object_name text, object_metadata jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.resource_attachments a
    join public.resources r on r.id = a.resource_id
    where a.storage_path = object_name
      and a.uploader_id = auth.uid()
      and r.owner_id = auth.uid()
      and object_metadata->>'mimetype' = a.mime_type
      and coalesce((object_metadata->>'size')::integer, -1) = a.size_bytes
  )
$$;

create or replace function private.can_read_resource_attachment_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.resource_attachments a
    where a.storage_path = object_name
      and a.organization_id = private.current_organization_id()
      and private.is_operational()
  )
$$;

create policy resource_document_object_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'resource-documents'
  and owner_id = auth.uid()::text
  and private.can_insert_resource_attachment_object(name, metadata)
);
create policy resource_document_object_read on storage.objects for select to authenticated
using (bucket_id = 'resource-documents' and private.can_read_resource_attachment_object(name));

revoke all on function public.begin_resource_attachment_upload(uuid, text, text, integer) from public, anon;
revoke all on function public.finalize_resource_attachment_upload(uuid) from public, anon;
revoke all on function public.create_resource_attachment_download(uuid) from public, anon;
revoke all on function private.can_insert_resource_attachment_object(text, jsonb) from public, anon;
revoke all on function private.can_read_resource_attachment_object(text) from public, anon;

grant execute on function public.begin_resource_attachment_upload(uuid, text, text, integer) to authenticated;
grant execute on function public.finalize_resource_attachment_upload(uuid) to authenticated;
grant execute on function public.create_resource_attachment_download(uuid) to authenticated;
grant execute on function private.can_insert_resource_attachment_object(text, jsonb) to authenticated;
grant execute on function private.can_read_resource_attachment_object(text) to authenticated;
