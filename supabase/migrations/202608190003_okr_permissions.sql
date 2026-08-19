-- Phase 3 — OKR role model + multi-owner Key Results.
--
-- Aligns the OKR domain with the layered business model:
--   * Management alone creates and edits quarterly Objectives.
--   * A Project Leader (role = project_leader) is the only assignable Objective
--     leader, and is the only role that decomposes/edit KRs under an Objective.
--   * A KR may have one or many OWNERS drawn from project_leader + employee only.
--   * Employees (and project leaders) who own a KR must immediately see it — and
--     its parent Objective — through RLS, not just via mock state.
--
-- All mutations remain SECURITY DEFINER RPCs; the browser only holds the anon key.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create or replace function private.has_role_in(required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.profile_id = auth.uid()
      and ur.organization_id = private.current_organization_id()
      and ur.role = any (required_roles)
      and ur.is_active
  )
$$;

create or replace function private.profile_has_role(target_profile_id uuid, required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.profile_id = target_profile_id
      and ur.organization_id = private.current_organization_id()
      and ur.role = required_role
      and ur.is_active
  )
$$;

-- Whether a profile is an eligible KR owner (project_leader or employee).
create or replace function private.is_okr_owner_role(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.profile_has_role(target_profile_id, 'project_leader')
      or private.profile_has_role(target_profile_id, 'employee')
$$;

-- Whether the current user owns a KR via kr_assignments (multi-owner).
create or replace function private.is_kr_owner(target_kr_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kr_assignments ka
    where ka.kr_id = target_kr_id
      and ka.organization_id = private.current_organization_id()
      and ka.profile_id = auth.uid()
      and ka.assignment_role = 'owner'
  )
$$;

-- Whether the current user is assigned (owner or collaborator) to a KR.
create or replace function private.is_kr_assignee(target_kr_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kr_assignments ka
    where ka.kr_id = target_kr_id
      and ka.organization_id = private.current_organization_id()
      and ka.profile_id = auth.uid()
  )
$$;

revoke all on function private.has_role_in(public.app_role[]) from public, anon;
revoke all on function private.profile_has_role(uuid, public.app_role) from public, anon;
revoke all on function private.is_okr_owner_role(uuid) from public, anon;
revoke all on function private.is_kr_owner(uuid) from public, anon;
revoke all on function private.is_kr_assignee(uuid) from public, anon;
grant execute on function private.has_role_in(public.app_role[]) to authenticated;
grant execute on function private.profile_has_role(uuid, public.app_role) to authenticated;
grant execute on function private.is_okr_owner_role(uuid) to authenticated;
grant execute on function private.is_kr_owner(uuid) to authenticated;
grant execute on function private.is_kr_assignee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Objective creation/editing: Management only, Project Leader assignee only.
-- ---------------------------------------------------------------------------
create or replace function public.create_objective(
  p_name text,
  p_number text,
  p_leader_id uuid,
  p_quarter text,
  p_start_date date,
  p_due_date date,
  p_priority public.okr_priority,
  p_description text,
  p_classification public.classification
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  new_project_id uuid := gen_random_uuid();
  new_objective_id uuid := gen_random_uuid();
  resolved_number text;
  seq integer;
begin
  target_org := private.current_organization_id();
  if target_org is null or not private.has_role('management') then
    raise exception 'Only management can create objectives' using errcode = '42501';
  end if;
  if length(trim(p_name)) = 0 then
    raise exception 'Objective name is required' using errcode = '22023';
  end if;
  if p_start_date is null or p_due_date is null or p_due_date < p_start_date then
    raise exception 'Objective dates are invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Objective classification exceeds user clearance' using errcode = '42501';
  end if;
  if not private.profile_has_role(p_leader_id, 'project_leader') then
    raise exception 'Objective leader must be a project leader' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_number, '')), '') is null then
    select coalesce(count(*), 0) + 1 into seq
    from public.objectives
    where organization_id = target_org and quarter = p_quarter;
    resolved_number := 'O-' || p_quarter || '-' || lpad(seq::text, 3, '0');
  else
    resolved_number := trim(p_number);
  end if;

  insert into public.projects (
    id, organization_id, name, description, leader_id, classification, start_date, due_date, status
  ) values (
    new_project_id, target_org, trim(p_name), coalesce(p_description, ''),
    p_leader_id, p_classification, p_start_date, p_due_date, 'active'
  );

  insert into public.project_members (organization_id, project_id, profile_id)
  values (target_org, new_project_id, p_leader_id);

  insert into public.objectives (
    id, organization_id, project_id, owner_id, title, description, classification,
    start_date, due_date, progress, number, quarter, priority, okr_status
  ) values (
    new_objective_id, target_org, new_project_id, p_leader_id, trim(p_name), coalesce(p_description, ''),
    p_classification, p_start_date, p_due_date, 0, resolved_number, p_quarter, p_priority,
    case when p_start_date > current_date then 'not_started'::public.okr_status else 'on_track'::public.okr_status end
  );

  return new_objective_id;
end;
$$;

create or replace function public.update_objective(
  p_objective_id uuid,
  p_name text,
  p_number text,
  p_leader_id uuid,
  p_quarter text,
  p_start_date date,
  p_due_date date,
  p_priority public.okr_priority,
  p_description text,
  p_classification public.classification
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.objectives%rowtype;
begin
  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Objective is not editable by the current user' using errcode = '42501';
  end if;

  if not private.has_role('management') then
    raise exception 'Only management can edit objectives' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived objectives cannot be edited' using errcode = '22023';
  end if;
  if length(trim(p_name)) = 0 then
    raise exception 'Objective name is required' using errcode = '22023';
  end if;
  if p_start_date is null or p_due_date is null or p_due_date < p_start_date then
    raise exception 'Objective dates are invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Objective classification exceeds user clearance' using errcode = '42501';
  end if;
  if not private.profile_has_role(p_leader_id, 'project_leader') then
    raise exception 'Objective leader must be a project leader' using errcode = '22023';
  end if;

  update public.objectives
  set title = trim(p_name),
      number = nullif(trim(coalesce(p_number, '')), ''),
      owner_id = p_leader_id,
      quarter = p_quarter,
      start_date = p_start_date,
      due_date = p_due_date,
      priority = p_priority,
      description = coalesce(p_description, ''),
      classification = p_classification
  where id = target.id;

  update public.projects
  set name = trim(p_name),
      leader_id = p_leader_id,
      start_date = p_start_date,
      due_date = p_due_date,
      classification = p_classification
  where id = target.project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Multi-owner Key Result RPCs (Project Leader only; owners = PL + employee).
-- ---------------------------------------------------------------------------
drop function if exists public.create_key_result(uuid, text, uuid, date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification, uuid[]);

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
    if owner_id is null or not private.is_okr_owner_role(owner_id) then
      raise exception 'Key Result owners must be project leaders or employees' using errcode = '22023';
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

drop function if exists public.update_key_result(uuid, text, uuid, date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification, uuid[]);

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
    if owner_id is null or not private.is_okr_owner_role(owner_id) then
      raise exception 'Key Result owners must be project leaders or employees' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- KR progress update: allow any owner (multi-owner) and the project leader.
-- ---------------------------------------------------------------------------
create or replace function public.save_kr_progress_update(
  p_key_result_id uuid,
  p_previous_progress numeric,
  p_new_progress numeric,
  p_summary text,
  p_blocker text,
  p_reason text,
  p_next_action text,
  p_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.key_results%rowtype;
  objective public.objectives%rowtype;
  update_id uuid := gen_random_uuid();
begin
  select * into target
  from public.key_results kr
  where kr.id = p_key_result_id
    and kr.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Key Result progress is not editable by the current user' using errcode = '42501';
  end if;

  select * into objective
  from public.objectives o
  where o.id = target.objective_id
    and o.organization_id = target.organization_id;

  if not (objective.owner_id = auth.uid() or private.is_kr_owner(target.id)) then
    raise exception 'Key Result progress is not editable by the current user' using errcode = '42501';
  end if;
  if p_new_progress is null or p_new_progress < 0 or p_new_progress > 100 then
    raise exception 'New progress must be between 0 and 100' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_summary, ''))) = 0 then
    raise exception 'Update summary is required' using errcode = '22023';
  end if;

  insert into public.kr_progress_updates (
    id, organization_id, kr_id, author_id, previous_progress, new_progress,
    summary, blocker, reason, next_action, evidence
  ) values (
    update_id, target.organization_id, target.id, auth.uid(), p_previous_progress, p_new_progress,
    trim(p_summary), nullif(p_blocker, ''), nullif(p_reason, ''), nullif(p_next_action, ''), nullif(p_evidence, '')
  );

  update public.key_results
  set progress = p_new_progress
  where id = target.id;

  return update_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: employee / project-leader visibility for assigned KRs and Objectives.
-- ---------------------------------------------------------------------------
drop policy if exists objectives_read on public.objectives;
create policy objectives_read on public.objectives for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.can_read_business_subject(owner_id, project_id, organization_id)
    or exists (
      select 1
      from public.key_results kr
      join public.kr_assignments ka on ka.kr_id = kr.id
      where kr.objective_id = objectives.id
        and ka.organization_id = objectives.organization_id
        and ka.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.reporting_lines rl
      where rl.manager_id = owner_id and rl.subordinate_id = auth.uid() and rl.organization_id = organization_id
    )
  )
);

drop policy if exists key_results_read on public.key_results;
create policy key_results_read on public.key_results for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.can_read_business_subject(owner_id, project_id, organization_id)
    or private.is_kr_assignee(id)
  )
);

drop policy if exists kr_assignments_read on public.kr_assignments;
create policy kr_assignments_read on public.kr_assignments for select to authenticated
using (
  organization_id = private.current_organization_id()
  and (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.key_results kr
      where kr.id = kr_id
        and kr.organization_id = organization_id
        and private.has_clearance(kr.classification)
        and private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
    )
  )
);

drop policy if exists kr_progress_updates_read on public.kr_progress_updates;
create policy kr_progress_updates_read on public.kr_progress_updates for select to authenticated
using (
  exists (
    select 1
    from public.key_results kr
    where kr.id = kr_id
      and kr.organization_id = organization_id
      and private.has_clearance(kr.classification)
      and (
        private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
        or private.is_kr_assignee(kr.id)
      )
  )
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification) from public, anon;
revoke all on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification) from public, anon;
revoke all on function public.create_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) from public, anon;
revoke all on function public.update_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) from public, anon;
revoke all on function public.save_kr_progress_update(uuid, numeric, numeric, text, text, text, text, text) from public, anon;

grant execute on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification) to authenticated;
grant execute on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification) to authenticated;
grant execute on function public.create_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) to authenticated;
grant execute on function public.update_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) to authenticated;
grant execute on function public.save_kr_progress_update(uuid, numeric, numeric, text, text, text, text, text) to authenticated;
