-- Account & Administrator User Management (Phase 1)
--
-- Adds the real profile fields the frontend `User` domain already expects
-- (`department`, `job_title`) plus a denormalized `email` so administrators can
-- list organization members without ever reading `auth.users` from the browser.
-- All administrator mutations are exposed as restricted SECURITY DEFINER RPCs:
-- the browser only ever holds the publishable anon key, and `auth.users` is
-- never reachable through PostgREST/RLS.

alter table public.profiles
  add column department text not null default '',
  add column job_title text not null default '',
  add column email text not null default '';

-- Current authentication state for the signed-in caller. Security definer so it
-- can read the caller's own profile even when `is_active = false`, which RLS
-- otherwise hides by collapsing `private.current_organization_id()` to null.
create or replace function public.get_my_profile_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
begin
  select * into target from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('state', 'missing');
  end if;
  if target.is_active = false then
    return jsonb_build_object('state', 'inactive');
  end if;
  if not exists (
    select 1
    from public.user_roles
    where profile_id = target.id
      and organization_id = target.organization_id
      and is_active
  ) then
    return jsonb_build_object('state', 'unassigned');
  end if;
  return jsonb_build_object('state', 'active');
end;
$$;

-- Approve an unassigned auth user: create their profile and role atomically.
-- The organization is always the administrator's own; callers never supply it.
create or replace function public.approve_pending_user(
  p_target_user_id uuid,
  p_display_name text,
  p_email text,
  p_department text,
  p_job_title text,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
begin
  select private.current_organization_id() into target_org;
  if target_org is null or not private.has_role('administrator') then
    raise exception 'Only administrators can approve users' using errcode = '42501';
  end if;
  if length(trim(p_display_name)) = 0 then
    raise exception 'Display name is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Profile already exists for this user' using errcode = '23505';
  end if;

  insert into public.profiles (id, organization_id, display_name, department, job_title, email, is_active)
  values (p_target_user_id, target_org, trim(p_display_name), coalesce(p_department, ''), coalesce(p_job_title, ''), coalesce(p_email, ''), true);

  insert into public.user_roles (organization_id, profile_id, role, is_active)
  values (target_org, p_target_user_id, p_role, true);
end;
$$;

-- Update an organization member's display fields and role. Cannot change the
-- profile UUID or organization; the role write goes to `user_roles`.
create or replace function public.update_user_profile(
  p_target_user_id uuid,
  p_display_name text,
  p_email text,
  p_department text,
  p_job_title text,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
begin
  select private.current_organization_id() into target_org;
  if target_org is null or not private.has_role('administrator') then
    raise exception 'Only administrators can update users' using errcode = '42501';
  end if;
  if length(trim(p_display_name)) = 0 then
    raise exception 'Display name is required' using errcode = '22023';
  end if;
  if p_target_user_id = auth.uid() and p_role <> 'administrator'::public.app_role then
    raise exception 'Administrator cannot remove their own administrator role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id and organization_id = target_org) then
    raise exception 'Profile not found in organization' using errcode = '42501';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      email = coalesce(p_email, ''),
      department = coalesce(p_department, ''),
      job_title = coalesce(p_job_title, '')
  where id = p_target_user_id and organization_id = target_org;

  update public.user_roles
  set role = p_role
  where profile_id = p_target_user_id and organization_id = target_org;

  if not found then
    insert into public.user_roles (organization_id, profile_id, role, is_active)
    select target_org, p_target_user_id, p_role, is_active
    from public.profiles
    where id = p_target_user_id and organization_id = target_org;
  end if;
end;
$$;

-- Deactivate or reactivate an organization member without deleting history.
create or replace function public.set_user_active(
  p_target_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
begin
  select private.current_organization_id() into target_org;
  if target_org is null or not private.has_role('administrator') then
    raise exception 'Only administrators can change user status' using errcode = '42501';
  end if;
  if p_target_user_id = auth.uid() and p_is_active = false then
    raise exception 'Administrator cannot deactivate their own account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id and organization_id = target_org) then
    raise exception 'Profile not found in organization' using errcode = '42501';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_target_user_id and organization_id = target_org;

  update public.user_roles
  set is_active = p_is_active
  where profile_id = p_target_user_id and organization_id = target_org;
end;
$$;

-- Administrators manage the organization's accounts, which includes reading
-- each member's project affiliations for the "Projects" column. This mirrors
-- the existing `roles_read` administrator clause.
create policy project_members_admin_read on public.project_members for select to authenticated
using (organization_id = private.current_organization_id() and private.has_role('administrator'));

revoke all on function public.get_my_profile_state() from public, anon;
revoke all on function public.approve_pending_user(uuid, text, text, text, text, public.app_role) from public, anon;
revoke all on function public.update_user_profile(uuid, text, text, text, text, public.app_role) from public, anon;
revoke all on function public.set_user_active(uuid, boolean) from public, anon;
grant execute on function public.get_my_profile_state() to authenticated;
grant execute on function public.approve_pending_user(uuid, text, text, text, text, public.app_role) to authenticated;
grant execute on function public.update_user_profile(uuid, text, text, text, text, public.app_role) to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;
