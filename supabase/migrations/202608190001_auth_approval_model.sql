-- Auth model replacement: public self-registration → admin approval → role
-- assignment. Replaces the administrator-invite onboarding model.
--
-- New account lifecycle: a self-registered user gets an auth account and a
-- profile immediately, but the profile starts `approval_status = 'pending'` and
-- carries NO operational app_role. Only an administrator approving the profile
-- (which atomically assigns a role) grants access. `onboarding_completed` is
-- retained for compatibility but is no longer part of the authorization path;
-- it is superseded by `approval_status`.

-- ---------------------------------------------------------------------------
-- 1. Approval state enum + profile column.
-- ---------------------------------------------------------------------------
create type public.approval_status as enum ('pending', 'approved', 'rejected');

alter table public.profiles
  add column approval_status public.approval_status not null default 'pending';

comment on column public.profiles.approval_status is
  'Account lifecycle gate. Fail-closed default: a profile inserted without an explicit approval state is ''pending'' (no access). Only administrator approval (which assigns a role) moves a profile to ''approved''.';

-- ---------------------------------------------------------------------------
-- 2. Backfill existing users. Users who completed onboarding (actually set a
--    password) are operational and become explicitly approved; everyone else
--    (incomplete invitees) keeps the pending default. Existing administrator
--    accounts have set a password and therefore remain approved, preserving
--    their access.
-- ---------------------------------------------------------------------------
update public.profiles
set approval_status = 'approved'
where onboarding_completed = true;

-- ---------------------------------------------------------------------------
-- 3. The operational gate is now "approved + active", not "onboarding completed".
-- ---------------------------------------------------------------------------
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
      and p.approval_status = 'approved'
  )
$$;

-- ---------------------------------------------------------------------------
-- 4. A pending/rejected user resolves NO organization/identity for RLS
--    purposes, so every organization-scoped RLS policy denies them by
--    construction (organization_id = private.current_organization_id() is null).
-- ---------------------------------------------------------------------------
create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.approval_status = 'approved'
$$;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.approval_status = 'approved'
$$;

-- ---------------------------------------------------------------------------
-- 5. Project assignment eligibility now requires approval (not onboarding).
-- ---------------------------------------------------------------------------
create or replace function private.is_eligible_project_assignee(
  target_profile_id uuid,
  target_org uuid,
  required_classification public.classification
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_profile_id
      and p.organization_id = target_org
      and p.is_active
      and p.approval_status = 'approved'
      and private.classification_rank(p.clearance) >= private.classification_rank(required_classification)
  )
$$;

-- ---------------------------------------------------------------------------
-- 6. Authoritative profile-state resolution for the signed-in caller.
--    Outcomes: missing / rejected / inactive / pending / error / active.
-- ---------------------------------------------------------------------------
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
  if target.approval_status = 'rejected' then
    return jsonb_build_object('state', 'rejected');
  end if;
  if target.is_active = false then
    return jsonb_build_object('state', 'inactive');
  end if;
  if target.approval_status = 'pending' then
    return jsonb_build_object('state', 'pending');
  end if;
  if not exists (
    select 1
    from public.user_roles ur
    where ur.profile_id = target.id
      and ur.organization_id = target.organization_id
      and ur.is_active
  ) then
    return jsonb_build_object('state', 'error');
  end if;
  return jsonb_build_object('state', 'active');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Self-registration profile creation. Idempotent: it never overwrites an
--    existing (possibly already-approved) profile, and always creates the new
--    profile in the pending state within the configured default organization.
--    The email is read from auth.users, not trusted from the caller.
-- ---------------------------------------------------------------------------
create or replace function public.create_pending_profile(p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_org uuid;
  user_email text;
  meta_name text;
  resolved_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    return;
  end if;
  select id into default_org from public.organizations order by created_at asc, id asc limit 1;
  if default_org is null then
    raise exception 'No organization is configured' using errcode = '42501';
  end if;
  -- Derive email and display-name server-side. The caller may supply a display
  -- name on the immediate signup path, but it is never trusted as identity;
  -- fall back to the signup metadata and finally to the email local-part.
  select email, raw_user_meta_data->>'display_name'
    into user_email, meta_name
  from auth.users where id = auth.uid();
  resolved_name := coalesce(
    nullif(trim(coalesce(p_display_name, '')), ''),
    nullif(trim(coalesce(meta_name, '')), ''),
    split_part(coalesce(user_email, ''), '@', 1)
  );
  if resolved_name = '' then
    resolved_name := 'User';
  end if;
  insert into public.profiles (id, organization_id, display_name, email, is_active, approval_status, onboarding_completed)
  values (auth.uid(), default_org, resolved_name, coalesce(user_email, ''), true, 'pending', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Admin approval: set approved + assign role atomically. The role is
--    validated by the `public.app_role` parameter type; a partial state
--    (approved without a role) is impossible because the whole body is one
--    transaction. Upsert handles both a fresh pending profile (no role row) and
--    a converted legacy invitee (a stale, now-inert role row).
-- ---------------------------------------------------------------------------
drop function if exists public.approve_pending_user(uuid, text, text, text, text, public.app_role);

create or replace function public.approve_pending_user(
  p_target_user_id uuid,
  p_role public.app_role,
  p_department text default '',
  p_job_title text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target public.profiles%rowtype;
begin
  select private.current_organization_id() into target_org;
  if target_org is null or not private.has_role('administrator') then
    raise exception 'Only administrators can approve users' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'Role is required' using errcode = '22023';
  end if;

  select * into target
  from public.profiles
  where id = p_target_user_id and organization_id = target_org
  for update;
  if not found then
    raise exception 'Profile not found in organization' using errcode = '42501';
  end if;
  if target.approval_status <> 'pending'::public.approval_status then
    raise exception 'User is not pending approval' using errcode = '22023';
  end if;

  update public.profiles
  set approval_status = 'approved',
      is_active = true,
      department = coalesce(p_department, ''),
      job_title = coalesce(p_job_title, '')
  where id = target.id;

  insert into public.user_roles (organization_id, profile_id, role, is_active)
  values (target_org, target.id, p_role, true)
  on conflict (organization_id, profile_id)
  do update set role = excluded.role, is_active = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Admin rejection of a pending signup. Soft: the profile is marked rejected
--    and deactivated (never hard-deleted), so historical FKs are untouched.
-- ---------------------------------------------------------------------------
create or replace function public.reject_pending_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target public.profiles%rowtype;
begin
  select private.current_organization_id() into target_org;
  if target_org is null or not private.has_role('administrator') then
    raise exception 'Only administrators can reject users' using errcode = '42501';
  end if;

  select * into target
  from public.profiles
  where id = p_target_user_id and organization_id = target_org
  for update;
  if not found then
    raise exception 'Profile not found in organization' using errcode = '42501';
  end if;
  if target.approval_status <> 'pending'::public.approval_status then
    raise exception 'User is not pending approval' using errcode = '22023';
  end if;

  update public.profiles
  set approval_status = 'rejected', is_active = false
  where id = target.id;

  update public.user_roles
  set is_active = false
  where profile_id = target.id and organization_id = target_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.get_my_profile_state() from public, anon;
revoke all on function public.create_pending_profile(text) from public, anon;
revoke all on function public.approve_pending_user(uuid, public.app_role, text, text) from public, anon;
revoke all on function public.reject_pending_user(uuid) from public, anon;
grant execute on function public.get_my_profile_state() to authenticated;
grant execute on function public.create_pending_profile(text) to authenticated;
grant execute on function public.approve_pending_user(uuid, public.app_role, text, text) to authenticated;
grant execute on function public.reject_pending_user(uuid) to authenticated;
