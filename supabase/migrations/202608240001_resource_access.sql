-- Open resource discovery/creation to every operational role while keeping
-- mutation boundaries server-authoritative. This migration also establishes
-- the shared in-app notification foundation consumed by report review work.

create type public.user_notification_type as enum (
  'daily_report_comment',
  'daily_report_confirmed',
  'resource_owner_assigned'
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type public.user_notification_type not null,
  report_id uuid,
  resource_id uuid references public.resources(id) on delete cascade,
  comment_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check ((notification_type = 'resource_owner_assigned') = (resource_id is not null))
);

create index user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc, id desc);
create index user_notifications_recipient_unread_idx
  on public.user_notifications (recipient_id, created_at desc)
  where read_at is null;
create index user_notifications_report_idx
  on public.user_notifications (report_id)
  where report_id is not null;
create index user_notifications_resource_idx
  on public.user_notifications (resource_id)
  where resource_id is not null;

alter table public.user_notifications enable row level security;
alter table public.user_notifications force row level security;
revoke all on public.user_notifications from public, anon, authenticated;

create or replace function public.list_resources(p_include_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_operational() then
    raise exception 'Resources are not viewable by the current user' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'category', r.category,
      'resourceKind', r.resource_kind,
      'description', r.description,
      'ownerId', r.owner_id,
      'ownerName', coalesce(owner.display_name, ''),
      'location', r.location,
      'purchaseDate', r.purchase_date,
      'purchaseVendor', r.purchase_vendor,
      'purchaseReference', r.purchase_reference,
      'usageNotes', r.usage_notes,
      'manualUrl', r.manual_url,
      'quantity', r.quantity,
      'unit', r.unit,
      'status', r.status,
      'createdAt', r.created_at,
      'updatedAt', r.updated_at,
      'archivedAt', r.archived_at
    ) as item
    from public.resources r
    left join public.profiles owner on owner.id = r.owner_id
    where r.organization_id = private.current_organization_id()
      and (p_include_archived or r.archived_at is null)
  ) resource_rows;

  return result;
end;
$$;

create or replace function public.list_eligible_resource_owners()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid;
  result jsonb;
begin
  caller_org := private.current_organization_id();
  if caller_org is null or not private.is_operational() then
    raise exception 'Resource owners are not viewable by the current user' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'email', coalesce(p.email, ''),
      'department', coalesce(p.department, ''),
      'job_title', coalesce(p.job_title, ''),
      'is_active', p.is_active,
      'approval_status', p.approval_status,
      'created_at', p.created_at,
      'preferred_locale', p.preferred_locale,
      'organizations', jsonb_build_object('name', o.name),
      'user_roles', coalesce((
        select jsonb_agg(jsonb_build_object('role', ur.role) order by ur.role)
        from public.user_roles ur
        where ur.profile_id = p.id
          and ur.organization_id = caller_org
          and ur.is_active
      ), '[]'::jsonb),
      'project_members', coalesce((
        select jsonb_agg(jsonb_build_object('project_id', pm.project_id) order by pm.project_id)
        from public.project_members pm
        where pm.profile_id = p.id
          and pm.organization_id = caller_org
      ), '[]'::jsonb)
    ) as item
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.organization_id = caller_org
      and p.approval_status = 'approved'
      and p.is_active
      and exists (
        select 1
        from public.user_roles active_role
        where active_role.profile_id = p.id
          and active_role.organization_id = caller_org
          and active_role.is_active
      )
  ) eligible_owners;

  return result;
end;
$$;

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
  p_unit text,
  p_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  validated_owner_id uuid := coalesce(p_owner_id, auth.uid());
  resource_id uuid := gen_random_uuid();
begin
  target_org := private.current_organization_id();
  if target_org is null or not private.is_operational() then
    raise exception 'Resources are not writable by the current user' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = validated_owner_id
      and p.organization_id = target_org
      and p.approval_status = 'approved'
      and p.is_active
      and exists (
        select 1
        from public.user_roles ur
        where ur.profile_id = p.id
          and ur.organization_id = target_org
          and ur.is_active
      )
  ) then
    raise exception 'Resource owner is not eligible' using errcode = '42501';
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
    coalesce(p_description, ''), validated_owner_id, trim(p_location), p_purchase_date,
    nullif(trim(coalesce(p_purchase_vendor, '')), ''), nullif(trim(coalesce(p_purchase_reference, '')), ''),
    nullif(trim(coalesce(p_usage_notes, '')), ''), nullif(trim(coalesce(p_manual_url, '')), ''),
    p_quantity, nullif(trim(coalesce(p_unit, '')), ''), 'available', auth.uid()
  );

  if validated_owner_id <> auth.uid() then
    insert into public.user_notifications (
      organization_id, recipient_id, actor_id, notification_type, resource_id
    ) values (
      target_org, validated_owner_id, auth.uid(), 'resource_owner_assigned', resource_id
    );
  end if;

  return resource_id;
end;
$$;

-- Compatibility entry point for deployed clients: the creator remains owner.
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
begin
  return public.create_resource(
    p_name, p_category, p_resource_kind, p_description, p_location,
    p_purchase_date, p_purchase_vendor, p_purchase_reference, p_usage_notes,
    p_manual_url, p_quantity, p_unit, auth.uid()
  );
end;
$$;

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
    raise exception 'Resource is not archivable by the current user' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Resource is not archivable by the current user' using errcode = '42501';
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
    raise exception 'Resource is not archivable by the current user' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Resource is not archivable by the current user' using errcode = '42501';
  end if;

  update public.resources
  set status = 'available'::public.resource_status,
      archived_at = null
  where id = target.id and archived_at is not null;
end;
$$;

revoke all on function public.list_resources(boolean) from public, anon;
revoke all on function public.list_eligible_resource_owners() from public, anon;
revoke all on function public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, uuid) from public, anon;
revoke all on function public.archive_resource(uuid) from public, anon;
revoke all on function public.restore_resource(uuid) from public, anon;

grant execute on function public.list_resources(boolean) to authenticated;
grant execute on function public.list_eligible_resource_owners() to authenticated;
grant execute on function public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.archive_resource(uuid) to authenticated;
grant execute on function public.restore_resource(uuid) to authenticated;
