-- ---------------------------------------------------------------------------
-- Organization / Project Membership Integration.
--
-- Establishes the derived relationship end-to-end:
--   User → Project membership → Project Leader → Objective → KR owner → Daily OKR.
--
-- The directory of users was previously read directly through PostgREST with an
-- embedded `user_roles` join, but `roles_read` is self-or-administrator only, so
-- Management (and every non-admin) saw everyone else's role as NULL and the
-- frontend dropped those rows — "Management only sees itself". This migration
-- moves directory reads to a security-definer RPC and tightens `profiles_read`
-- so Project Leaders/Employees no longer read the whole org directory.
--
-- Leadership remains the existing single `projects.leader_id`. A leader is
-- always a member of the projects they lead (backfilled here, and enforced for
-- membership administration) so the derived relationship and KR-owner selector
-- stay coherent. No new membership table is introduced.
-- ---------------------------------------------------------------------------

-- 1. Backfill: ensure every project leader is also a project member.
--    Idempotent; preserves production projects and memberships.
insert into public.project_members (organization_id, project_id, profile_id)
select p.organization_id, p.id, p.leader_id
from public.projects p
where not exists (
  select 1
  from public.project_members pm
  where pm.project_id = p.id
    and pm.profile_id = p.leader_id
);

-- 2. Private helper: whether the current user may view a target profile through
--    a project relationship (leads a project the target belongs to, or shares a
--    project with the target).
create or replace function private.can_view_project_member(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects pr
    join public.project_members pm on pm.project_id = pr.id
    where pr.leader_id = auth.uid()
      and pr.organization_id = private.current_organization_id()
      and pm.profile_id = target_profile_id
  )
  or exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.profile_id = auth.uid()
      and mine.organization_id = private.current_organization_id()
      and theirs.profile_id = target_profile_id
  )
$$;

revoke all on function private.can_view_project_member(uuid) from public, anon;
grant execute on function private.can_view_project_member(uuid) to authenticated;

-- 3. Tighten `profiles_read`: no longer org-wide. Self is always readable;
--    administrators/management read the org directory; everyone else reads only
--    project-connected profiles (via can_view_project_member). Defense-in-depth
--    mirrors the role-scoped directory RPC below.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (
  organization_id = private.current_organization_id()
  and (
    id = auth.uid()
    or private.has_role('administrator')
    or private.has_role('management')
    or private.can_view_project_member(id)
  )
);

-- 4. Role-scoped directory read. Returns a jsonb array whose elements match the
--    shape of the previous PostgREST `profiles` select with embedded
--    `organizations` / `user_roles` / `project_members`, so the frontend mappers
--    remain unchanged while roles are populated for every visible user.
create or replace function public.list_organization_users()
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
  if caller_org is null then
    return '[]'::jsonb;
  end if;

  -- administrator: full directory (pending/rejected/inactive included for the
  -- approval workflow).
  if private.has_role('administrator') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
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
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
    ) directory;
    return result;
  end if;

  -- management: approved + active users who hold a role (organization-wide
  -- business visibility, read-only).
  if private.has_role('management') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
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
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
        and p.is_active
        and p.approval_status = 'approved'
        and exists (
          select 1
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        )
    ) directory;
    return result;
  end if;

  -- project leader / employee: self plus project-connected profiles.
  if private.has_role('project_leader') or private.has_role('employee') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
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
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
        and p.is_active
        and p.approval_status = 'approved'
        and (p.id = auth.uid() or private.can_view_project_member(p.id))
    ) directory;
    return result;
  end if;

  -- hr and any other role: self only (HR workload visibility is served by the
  -- workload/report tables, not by the org directory).
  select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
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
        select jsonb_agg(jsonb_build_object('role', ur.role))
        from public.user_roles ur
        where ur.profile_id = p.id
          and ur.organization_id = caller_org
          and ur.is_active
      ), '[]'::jsonb),
      'project_members', coalesce((
        select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
        from public.project_members pm
        where pm.profile_id = p.id
          and pm.organization_id = caller_org
      ), '[]'::jsonb)
    ) as item
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.id = auth.uid()
  ) directory;
  return result;
end;
$$;

revoke all on function public.list_organization_users() from public, anon;
grant execute on function public.list_organization_users() to authenticated;

-- 5. Administrator-only: atomically replace a user's project memberships.
--    Leadership is assignment, not membership — a project's leader is re-added
--    unconditionally after the replace.
create or replace function public.set_user_project_memberships(
  p_target_user_id uuid,
  p_project_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_org uuid;
  target public.profiles%rowtype;
  project_id uuid;
begin
  caller_org := private.current_organization_id();
  if caller_org is null or not private.has_role('administrator') then
    raise exception 'Only administrators can manage project membership' using errcode = '42501';
  end if;

  select * into target
  from public.profiles p
  where p.id = p_target_user_id
    and p.organization_id = caller_org;
  if not found then
    raise exception 'User is not in this organization' using errcode = '42501';
  end if;

  if not (target.is_active and target.approval_status = 'approved') then
    raise exception 'Only approved active users can be project members' using errcode = '22023';
  end if;

  for project_id in select distinct unnest(coalesce(p_project_ids, '{}'::uuid[])) loop
    if project_id is not null and not exists (
      select 1 from public.projects pr
      where pr.id = project_id
        and pr.organization_id = caller_org
    ) then
      raise exception 'Project is not in this organization' using errcode = '22023';
    end if;
  end loop;

  delete from public.project_members
  where profile_id = p_target_user_id
    and organization_id = caller_org;

  insert into public.project_members (organization_id, project_id, profile_id)
  select caller_org, pid, p_target_user_id
  from (select distinct unnest(coalesce(p_project_ids, '{}'::uuid[])) as pid) m
  where m.pid is not null;

  insert into public.project_members (organization_id, project_id, profile_id)
  select caller_org, pr.id, p_target_user_id
  from public.projects pr
  where pr.leader_id = p_target_user_id
    and pr.organization_id = caller_org
  on conflict do nothing;
end;
$$;

revoke all on function public.set_user_project_memberships(uuid, uuid[]) from public, anon;
grant execute on function public.set_user_project_memberships(uuid, uuid[]) to authenticated;

-- 6. Authorized project list (id, name, leader) for the membership editor and
--    project selectors. Scope mirrors projects_read.
create or replace function public.list_projects()
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
  if caller_org is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', pr.id,
      'name', pr.name,
      'leader_id', pr.leader_id,
      'leader_name', coalesce(lp.display_name, '')
    ) as item
    from public.projects pr
    left join public.profiles lp on lp.id = pr.leader_id
    where pr.organization_id = caller_org
      and private.has_clearance(pr.classification)
      and (
        private.has_role('administrator')
        or private.has_role('management')
        or private.is_project_leader(pr.id)
        or private.is_project_member(pr.id)
        or private.has_project_collaboration(pr.id)
      )
  ) projects;
  return result;
end;
$$;

revoke all on function public.list_projects() from public, anon;
grant execute on function public.list_projects() to authenticated;

-- 7. Keep "leader is always a member" when a project leader is reassigned.
--    (create_objective already inserts the leader as a member; this closes the
--    gap for the standalone project-management flow.)
create or replace function public.set_project_leader(
  p_project_id uuid,
  p_leader_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projects%rowtype;
  target_org uuid;
begin
  target_org := private.current_organization_id();
  if target_org is null or not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Only management or administrators can change the project leader' using errcode = '42501';
  end if;

  select * into target
  from public.projects p
  where p.id = p_project_id
    and p.organization_id = target_org
    and private.has_clearance(p.classification)
  for update;
  if not found then
    raise exception 'Project is not editable by the current user' using errcode = '42501';
  end if;

  if target.status = 'archived'::public.project_status then
    raise exception 'Archived projects cannot change leader' using errcode = '22023';
  end if;

  if not private.is_eligible_project_assignee(p_leader_id, target_org, target.classification) then
    raise exception 'Project leader is not an eligible organization member' using errcode = '22023';
  end if;

  update public.projects set leader_id = p_leader_id where id = target.id;

  insert into public.project_members (organization_id, project_id, profile_id)
  values (target_org, target.id, p_leader_id)
  on conflict do nothing;
end;
$$;
