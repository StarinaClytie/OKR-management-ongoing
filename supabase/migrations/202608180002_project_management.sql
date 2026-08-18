-- Phase 2 — Operational Project Management
--
-- Turns the demoed Projects page into real, RLS/RPC-protected project CRUD,
-- leader assignment, member assignment, lifecycle/status, and archive behavior.
--
-- Schema changes are additive only: a new `project_status` enum, a `status`
-- column (default `active`), and an `archived_at` timestamp on `projects`.
-- Archive replaces destructive hard-delete as the normal project workflow,
-- which the existing FKs already make unsafe (daily_reports `on delete restrict`,
-- objectives/key_results `on delete set null`, milestones/risks/members/collab
-- `on delete cascade`).
--
-- All mutations are SECURITY DEFINER RPCs. `projects` and `project_members`
-- already receive only SELECT from the authenticated role (see 202608130002),
-- so no broad authenticated write is introduced. Authorization is derived from
-- auth.uid() / private.current_organization_id() only; the browser never supplies
-- organization_id.

create type public.project_status as enum (
  'planned', 'active', 'on_hold', 'completed', 'archived'
);

alter table public.projects
  add column status public.project_status not null default 'active',
  add column archived_at timestamptz;

-- Existing projects are already operational; the default `active` backfills them
-- without touching a single row's identity or timestamps.
comment on column public.projects.status is
  'Project lifecycle. Archive is the non-destructive replacement for deletion; archived projects remain readable to authorized users but hidden from default active lists.';

create index projects_organization_status_idx on public.projects (organization_id, status);
create index project_members_profile_id_idx on public.project_members (profile_id);

-- A profile is assignable as a leader or member only when it is a real, active,
-- onboarding-complete member of the same organization who already holds clearance
-- for the project's classification. Cross-organization, inactive, orphan,
-- onboarding-incomplete, and under-cleared accounts are all excluded here.
-- Called only from SECURITY DEFINER project RPCs (as function owner), so it is
-- deliberately not granted EXECUTE to authenticated: the browser must never probe
-- another profile's assignment eligibility.
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
      and p.onboarding_completed
      and private.classification_rank(p.clearance) >= private.classification_rank(required_classification)
  )
$$;

revoke all on function private.is_eligible_project_assignee(uuid, uuid, public.classification) from public, anon;

-- Administrator read parity: administrators must see projects with the same
-- visibility as management (within their own organization and subject to
-- classification clearance). The Phase 1 projects_read policy omitted the
-- administrator role, so drop and recreate it here.
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.is_project_leader(id)
    or private.has_role('management')
    or private.has_role('administrator')
    or private.is_project_member(id)
    or private.has_project_collaboration(id)
  )
);

-- ---------------------------------------------------------------------------
-- create_project — management/administrator only, atomic project + membership.
-- ---------------------------------------------------------------------------
create or replace function public.create_project(
  p_name text,
  p_description text,
  p_leader_id uuid,
  p_start_date date,
  p_due_date date,
  p_classification public.classification,
  p_status public.project_status,
  p_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  new_project_id uuid := gen_random_uuid();
  member_id uuid;
begin
  target_org := private.current_organization_id();
  if target_org is null or not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Only management or administrators can create projects' using errcode = '42501';
  end if;

  if length(trim(p_name)) = 0 then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if length(p_name) > 120 then
    raise exception 'Project name is too long' using errcode = '22023';
  end if;
  if p_start_date is null or p_due_date is null or p_due_date < p_start_date then
    raise exception 'Project dates are invalid' using errcode = '22023';
  end if;
  if p_classification is null or not private.has_clearance(p_classification) then
    raise exception 'Project classification exceeds user clearance' using errcode = '42501';
  end if;
  if p_status is null or p_status = 'archived'::public.project_status then
    raise exception 'Project status is invalid' using errcode = '22023';
  end if;
  if not private.is_eligible_project_assignee(p_leader_id, target_org, p_classification) then
    raise exception 'Project leader is not an eligible organization member' using errcode = '22023';
  end if;

  for member_id in select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) loop
    if member_id is not null and not private.is_eligible_project_assignee(member_id, target_org, p_classification) then
      raise exception 'Project member is not an eligible organization member' using errcode = '22023';
    end if;
  end loop;

  insert into public.projects (
    id, organization_id, name, description, leader_id, classification, start_date, due_date, status
  ) values (
    new_project_id, target_org, trim(p_name), coalesce(p_description, ''),
    p_leader_id, p_classification, p_start_date, p_due_date, p_status
  );

  insert into public.project_members (organization_id, project_id, profile_id)
  select target_org, new_project_id, m.member_id
  from (select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) as member_id) m
  where m.member_id is not null;

  return new_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_project — metadata edit. management/administrator edit every field;
-- a project leader may edit only name/description/dates for their own project
-- (never classification, status, or leader).
-- ---------------------------------------------------------------------------
create or replace function public.update_project(
  p_project_id uuid,
  p_name text,
  p_description text,
  p_start_date date,
  p_due_date date,
  p_classification public.classification,
  p_status public.project_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projects%rowtype;
  is_management boolean;
  is_leader boolean;
begin
  select * into target
  from public.projects p
  where p.id = p_project_id
    and p.organization_id = private.current_organization_id()
    and private.has_clearance(p.classification)
  for update;
  if not found then
    raise exception 'Project is not editable by the current user' using errcode = '42501';
  end if;

  is_management := private.has_role('management') or private.has_role('administrator');
  is_leader := target.leader_id = auth.uid();
  if not (is_management or is_leader) then
    raise exception 'Project is not editable by the current user' using errcode = '42501';
  end if;

  if target.status = 'archived'::public.project_status then
    raise exception 'Archived projects cannot be edited' using errcode = '22023';
  end if;

  if length(trim(p_name)) = 0 then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if length(p_name) > 120 then
    raise exception 'Project name is too long' using errcode = '22023';
  end if;
  if p_start_date is null or p_due_date is null or p_due_date < p_start_date then
    raise exception 'Project dates are invalid' using errcode = '22023';
  end if;

  -- A leader may never change classification, status, or (handled elsewhere)
  -- the leader. Management may change classification only within its clearance,
  -- and may change status but must use the dedicated archive/restore path.
  if not is_management and p_classification is distinct from target.classification then
    raise exception 'Project leader cannot change classification' using errcode = '42501';
  end if;
  if not is_management and p_status is distinct from target.status then
    raise exception 'Project leader cannot change status' using errcode = '42501';
  end if;
  if not is_management and p_status = 'archived'::public.project_status then
    raise exception 'Project status is invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Project classification exceeds user clearance' using errcode = '42501';
  end if;
  if p_status is null or p_status = 'archived'::public.project_status then
    raise exception 'Project status is invalid' using errcode = '22023';
  end if;

  -- Classification escalation must not strand the existing team: the leader and
  -- every current member must already hold clearance for the new classification.
  if private.classification_rank(p_classification) > private.classification_rank(target.classification) then
    if not exists (
      select 1 from public.profiles p
      where p.id = target.leader_id
        and private.classification_rank(p.clearance) >= private.classification_rank(p_classification)
    ) then
      raise exception 'Project leader lacks clearance for the new classification' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.project_members pm
      join public.profiles p on p.id = pm.profile_id
      where pm.project_id = target.id
        and private.classification_rank(p.clearance) < private.classification_rank(p_classification)
    ) then
      raise exception 'A project member lacks clearance for the new classification' using errcode = '22023';
    end if;
  end if;

  -- Contracting the project window must not silently strand downstream
  -- date-bearing records outside the new range.
  if p_start_date > target.start_date or p_due_date < target.due_date then
    if exists (
      select 1 from public.objectives o
      where o.project_id = target.id
        and (o.start_date < p_start_date or o.due_date > p_due_date)
    ) or exists (
      select 1 from public.key_results kr
      where kr.project_id = target.id
        and (kr.start_date < p_start_date or kr.due_date > p_due_date)
    ) or exists (
      select 1 from public.milestones m
      where m.project_id = target.id
        and (m.planned_date < p_start_date or m.planned_date > p_due_date)
    ) then
      raise exception 'Project dates conflict with existing dependent records' using errcode = 'DTC01';
    end if;
  end if;

  update public.projects
  set name = trim(p_name),
      description = coalesce(p_description, ''),
      start_date = p_start_date,
      due_date = p_due_date,
      classification = p_classification,
      status = p_status
  where id = target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_project_leader — management/administrator only. Reassignment preserves
-- historical data; RLS immediately reflects the new leader via leader_id.
-- ---------------------------------------------------------------------------
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
end;
$$;

-- ---------------------------------------------------------------------------
-- set_project_members — replace membership set atomically. management/administrator
-- manage any project; the project's own leader manages its roster. Archived
-- projects reject membership changes until restored.
-- ---------------------------------------------------------------------------
create or replace function public.set_project_members(
  p_project_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projects%rowtype;
  target_org uuid;
  is_management boolean;
  is_leader boolean;
  member_id uuid;
begin
  target_org := private.current_organization_id();
  if target_org is null then
    raise exception 'Project membership is not editable by the current user' using errcode = '42501';
  end if;

  select * into target
  from public.projects p
  where p.id = p_project_id
    and p.organization_id = target_org
    and private.has_clearance(p.classification)
  for update;
  if not found then
    raise exception 'Project membership is not editable by the current user' using errcode = '42501';
  end if;

  is_management := private.has_role('management') or private.has_role('administrator');
  is_leader := target.leader_id = auth.uid();
  if not (is_management or is_leader) then
    raise exception 'Project membership is not editable by the current user' using errcode = '42501';
  end if;

  if target.status = 'archived'::public.project_status then
    raise exception 'Archived projects cannot change membership' using errcode = '22023';
  end if;

  -- Only newly-added members must be eligible. Existing members may remain even
  -- if they later became inactive, so historical attribution is never silently
  -- dropped; removing any member is always permitted.
  for member_id in
    select m.member_id
    from (select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) as member_id) m
    where m.member_id is not null
      and not exists (
        select 1 from public.project_members pm
        where pm.project_id = target.id and pm.profile_id = m.member_id
      )
  loop
    if not private.is_eligible_project_assignee(member_id, target_org, target.classification) then
      raise exception 'Project member is not an eligible organization member' using errcode = '22023';
    end if;
  end loop;

  delete from public.project_members where project_id = target.id;

  insert into public.project_members (organization_id, project_id, profile_id)
  select target_org, target.id, m.member_id
  from (select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) as member_id) m
  where m.member_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_project_status — management/administrator only, non-archived lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.set_project_status(
  p_project_id uuid,
  p_status public.project_status
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
    raise exception 'Only management or administrators can change project status' using errcode = '42501';
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
    raise exception 'Archived projects cannot change status' using errcode = '22023';
  end if;

  if p_status is null or p_status = 'archived'::public.project_status then
    raise exception 'Project status is invalid' using errcode = '22023';
  end if;

  update public.projects set status = p_status where id = target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_project / restore_project — management/administrator only, idempotent,
-- non-destructive. Archive keeps downstream records intact.
-- ---------------------------------------------------------------------------
create or replace function public.archive_project(p_project_id uuid)
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
    raise exception 'Only management or administrators can archive projects' using errcode = '42501';
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

  update public.projects
  set status = 'archived'::public.project_status,
      archived_at = timezone('utc', now())
  where id = target.id and status <> 'archived'::public.project_status;
end;
$$;

create or replace function public.restore_project(p_project_id uuid)
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
    raise exception 'Only management or administrators can restore projects' using errcode = '42501';
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

  update public.projects
  set status = 'active'::public.project_status,
      archived_at = null
  where id = target.id and status = 'archived'::public.project_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_project_detail — single authorized read for the detail page. Returns null
-- for both "not found" and "not authorized" so a confidential project's
-- existence is never leaked. Member roster is full for management/administrator/
-- leader, self-only for a plain member (matching project_members_read RLS).
-- ---------------------------------------------------------------------------
create or replace function public.get_project_detail(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.projects%rowtype;
  leader_name text;
  can_see_roster boolean;
  members jsonb := '[]'::jsonb;
begin
  select * into target
  from public.projects p
  where p.id = p_project_id
    and p.organization_id = private.current_organization_id()
    and private.has_clearance(p.classification)
    and (
      private.is_project_leader(p.id)
      or private.has_role('management')
      or private.has_role('administrator')
      or private.is_project_member(p.id)
      or private.has_project_collaboration(p.id)
    );
  if not found then
    return null;
  end if;

  select p.display_name into leader_name
  from public.profiles p
  where p.id = target.leader_id;

  can_see_roster := private.has_role('management')
    or private.has_role('administrator')
    or private.is_project_leader(target.id);

  select coalesce(jsonb_agg(member order by member->>'name'), '[]'::jsonb) into members
  from (
    select jsonb_build_object(
      'id', pm.profile_id,
      'name', p.display_name,
      'role', coalesce(ur.role, 'employee'::public.app_role),
      'department', coalesce(p.department, ''),
      'jobTitle', coalesce(p.job_title, ''),
      'isActive', p.is_active,
      'onboardingCompleted', p.onboarding_completed,
      'isLeader', (pm.profile_id = target.leader_id)
    ) as member
    from public.project_members pm
    join public.profiles p on p.id = pm.profile_id
    left join public.user_roles ur
      on ur.profile_id = pm.profile_id
     and ur.organization_id = target.organization_id
    where pm.project_id = target.id
      and (can_see_roster or pm.profile_id = auth.uid())
  ) roster;

  return jsonb_build_object(
    'id', target.id,
    'name', target.name,
    'description', target.description,
    'leaderId', target.leader_id,
    'leaderName', coalesce(leader_name, ''),
    'classification', target.classification,
    'startDate', target.start_date,
    'dueDate', target.due_date,
    'status', target.status,
    'archivedAt', target.archived_at,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at,
    'members', members
  );
end;
$$;

revoke all on function public.create_project(text, text, uuid, date, date, public.classification, public.project_status, uuid[]) from public, anon;
revoke all on function public.update_project(uuid, text, text, date, date, public.classification, public.project_status) from public, anon;
revoke all on function public.set_project_leader(uuid, uuid) from public, anon;
revoke all on function public.set_project_members(uuid, uuid[]) from public, anon;
revoke all on function public.set_project_status(uuid, public.project_status) from public, anon;
revoke all on function public.archive_project(uuid) from public, anon;
revoke all on function public.restore_project(uuid) from public, anon;
revoke all on function public.get_project_detail(uuid) from public, anon;

grant execute on function public.create_project(text, text, uuid, date, date, public.classification, public.project_status, uuid[]) to authenticated;
grant execute on function public.update_project(uuid, text, text, date, date, public.classification, public.project_status) to authenticated;
grant execute on function public.set_project_leader(uuid, uuid) to authenticated;
grant execute on function public.set_project_members(uuid, uuid[]) to authenticated;
grant execute on function public.set_project_status(uuid, public.project_status) to authenticated;
grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.restore_project(uuid) to authenticated;
grant execute on function public.get_project_detail(uuid) to authenticated;
