-- ---------------------------------------------------------------------------
-- Data-integrity hardening: leader membership + KR owner project membership.
--
-- Follow-up to 202608200001_org_membership.sql. Closes two remaining gaps in the
-- derived relationship User → Project membership → Project Leader → Objective →
-- KR owner without changing the model or any visibility policy:
--
--   1. `create_project` did not add the project's leader to `project_members`,
--      unlike `set_project_leader`, `create_objective`, and the backfill. A
--      standalone project creation could therefore leave `projects.leader_id`
--      pointing at a user with no `project_members` row for that project.
--
--   2. `create_key_result` / `update_key_result` only checked that a KR owner
--      held the `project_leader` or `employee` role; they trusted the frontend
--      to have already limited candidates to the Objective's project members.
--      The DB now re-derives the Objective → project and rejects any owner who
--      is not an approved, active, eligible-role project member of that project.
--
-- This migration is purely additive (CREATE OR REPLACE FUNCTION only). It
-- deletes no existing memberships and no `kr_assignments` history.
-- ---------------------------------------------------------------------------

-- 1. Leader is always a member — close the standalone create_project gap.
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

  -- Leader is always a member (invariant); a no-op when the leader was already
  -- passed in p_member_ids.
  insert into public.project_members (organization_id, project_id, profile_id)
  values (target_org, new_project_id, p_leader_id)
  on conflict do nothing;

  return new_project_id;
end;
$$;

-- 2. KR-owner eligibility: an owner must be an approved, active, eligible-role
--    (project_leader or employee) member of the Objective's project. Called only
--    from SECURITY DEFINER KR RPCs, so it is deliberately not granted EXECUTE to
--    authenticated (the browser must not probe arbitrary project membership).
create or replace function private.is_eligible_kr_owner(
  target_profile_id uuid,
  target_org uuid,
  target_project_id uuid
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
      and exists (
        select 1
        from public.user_roles ur
        where ur.profile_id = target_profile_id
          and ur.organization_id = target_org
          and ur.role in ('project_leader'::public.app_role, 'employee'::public.app_role)
          and ur.is_active
      )
      and exists (
        select 1
        from public.project_members pm
        where pm.project_id = target_project_id
          and pm.organization_id = target_org
          and pm.profile_id = target_profile_id
      )
  )
$$;

revoke all on function private.is_eligible_kr_owner(uuid, uuid, uuid) from public, anon;

-- 3. Enforce KR-owner project membership on create. The Objective → project is
--    resolved server-side from `target.project_id`; the frontend selector is not
--    trusted. The whole transaction is rejected if any owner is invalid, so no
--    owner assignments are written partially.
create or replace function public.create_key_result(
  p_objective_id uuid,
  p_title text,
  p_owner_ids uuid[],
  p_due_date date,
  p_metric_type public.kr_metric_type,
  p_current_value numeric,
  p_target_value numeric,
  p_unit text,
  p_notes text,
  p_confidence_index numeric,
  p_priority public.okr_priority,
  p_classification public.classification
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.objectives%rowtype;
  new_kr_id uuid := gen_random_uuid();
  owner_id uuid;
begin
  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Key Result objective is not available' using errcode = '42501';
  end if;
  if target.owner_id <> auth.uid() then
    raise exception 'Only the project leader can create key results' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived objectives cannot gain key results' using errcode = '22023';
  end if;
  if length(trim(p_title)) = 0 or p_due_date is null then
    raise exception 'Key Result fields are invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_owner_ids), 0) = 0 then
    raise exception 'Key Result requires at least one owner' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Key Result classification exceeds user clearance' using errcode = '42501';
  end if;

  for owner_id in select distinct unnest(p_owner_ids) loop
    if owner_id is null or not private.is_eligible_kr_owner(owner_id, target.organization_id, target.project_id) then
      raise exception 'Key Result owners must be eligible members of the Objective''s project.' using errcode = '22023';
    end if;
  end loop;

  insert into public.key_results (
    id, organization_id, objective_id, project_id, owner_id, title,
    measurement_type, metric_type, target_value, current_value, unit, notes,
    confidence_index, priority, progress, classification, start_date, due_date, okr_status
  ) values (
    new_kr_id, target.organization_id, target.id, target.project_id, p_owner_ids[1], trim(p_title),
    'number', p_metric_type, p_target_value, p_current_value, nullif(p_unit, ''), nullif(p_notes, ''),
    p_confidence_index, coalesce(p_priority, 'medium'), 0, p_classification,
    target.start_date, p_due_date,
    case when target.start_date > current_date then 'not_started'::public.okr_status else 'on_track'::public.okr_status end
  );

  for owner_id in select distinct unnest(p_owner_ids) loop
    insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
    values (target.organization_id, new_kr_id, owner_id, 'owner');
  end loop;

  return new_kr_id;
end;
$$;

-- 4. Enforce the same rule on the owner-changing update path.
create or replace function public.update_key_result(
  p_key_result_id uuid,
  p_title text,
  p_owner_ids uuid[],
  p_due_date date,
  p_metric_type public.kr_metric_type,
  p_current_value numeric,
  p_target_value numeric,
  p_unit text,
  p_notes text,
  p_confidence_index numeric,
  p_priority public.okr_priority,
  p_classification public.classification
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.key_results%rowtype;
  objective public.objectives%rowtype;
  owner_id uuid;
begin
  select * into target
  from public.key_results kr
  where kr.id = p_key_result_id
    and kr.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Key Result is not editable by the current user' using errcode = '42501';
  end if;

  select * into objective
  from public.objectives o
  where o.id = target.objective_id
    and o.organization_id = target.organization_id;
  if objective.owner_id <> auth.uid() then
    raise exception 'Only the project leader can edit key results' using errcode = '42501';
  end if;
  if length(trim(p_title)) = 0 or p_due_date is null then
    raise exception 'Key Result fields are invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_owner_ids), 0) = 0 then
    raise exception 'Key Result requires at least one owner' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Key Result classification exceeds user clearance' using errcode = '42501';
  end if;

  for owner_id in select distinct unnest(p_owner_ids) loop
    if owner_id is null or not private.is_eligible_kr_owner(owner_id, objective.organization_id, objective.project_id) then
      raise exception 'Key Result owners must be eligible members of the Objective''s project.' using errcode = '22023';
    end if;
  end loop;

  update public.key_results
  set title = trim(p_title),
      owner_id = p_owner_ids[1],
      due_date = p_due_date,
      metric_type = p_metric_type,
      target_value = p_target_value,
      current_value = p_current_value,
      unit = nullif(p_unit, ''),
      notes = nullif(p_notes, ''),
      confidence_index = p_confidence_index,
      priority = coalesce(p_priority, 'medium'),
      classification = p_classification
  where id = target.id;

  delete from public.kr_assignments where kr_id = target.id;
  for owner_id in select distinct unnest(p_owner_ids) loop
    insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
    values (target.organization_id, target.id, owner_id, 'owner');
  end loop;
end;
$$;
