-- ---------------------------------------------------------------------------
-- HR OKR execution + work-hours overview.
--
-- HR stops being a pure viewer and becomes an OKR participant scoped to
-- *HR Objectives*: Management can mark an Objective as HR-specific and assign
-- one or more HR owners (kept in a dedicated relation, not stuffed into
-- `objectives.owner_id`). Those HR owners may decompose KRs (whose owners are
-- HR-only) and — because KR owners may already author daily reports — record
-- progress and hours against their KRs. Every HR can read every HR Objective,
-- while business Objectives stay behind the existing `not has_role('hr')`
-- boundary.
--
-- A dedicated SECURITY DEFINER RPC exposes the whole organization's hours to HR
-- as investment rows only (no report text / result / evidence / attachments).
-- ---------------------------------------------------------------------------

-- 1. Objective type + owner relation -----------------------------------------

create type public.objective_type as enum ('business', 'hr');

alter table public.objectives
  add column objective_type public.objective_type not null default 'business';

create type public.objective_owner_role as enum ('project_leader', 'hr', 'management');

create table public.objective_owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_type public.objective_owner_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (objective_id, profile_id)
);

alter table public.objective_owners
  add constraint objective_owners_organization_objective_fkey
  foreign key (organization_id, objective_id)
  references public.objectives(organization_id, id) on delete cascade;

alter table public.objective_owners
  add constraint objective_owners_organization_profile_fkey
  foreign key (organization_id, profile_id)
  references public.profiles(organization_id, id) on delete cascade;

alter table public.objective_owners enable row level security;
alter table public.objective_owners force row level security;

-- 2. HR-scoped helper functions ----------------------------------------------

-- A profile eligible to be an HR KR owner / HR objective owner.
create or replace function private.is_eligible_hr_kr_owner(
  target_profile_id uuid,
  target_org uuid
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
          and ur.role = 'hr'
          and ur.is_active
      )
  )
$$;

-- Whether `target_profile_id` is an assigned HR owner of the objective.
create or replace function private.is_hr_objective_owner(
  target_objective_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.objective_owners oo
    where oo.objective_id = target_objective_id
      and oo.organization_id = private.current_organization_id()
      and oo.profile_id = target_profile_id
      and oo.role_type = 'hr'
  )
$$;

-- The current HR caller may read this HR Objective (shared by several RLS
-- policies). Returns false for business Objectives and non-HR callers.
create or replace function private.can_hr_read_objective(
  target_objective_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('hr')
    and exists (
      select 1
      from public.objectives o
      where o.id = target_objective_id
        and o.organization_id = private.current_organization_id()
        and o.objective_type = 'hr'
    )
$$;

revoke all on function private.is_eligible_hr_kr_owner(uuid, uuid) from public, anon;
revoke all on function private.is_hr_objective_owner(uuid, uuid) from public, anon;
revoke all on function private.can_hr_read_objective(uuid) from public, anon;

create policy objective_owners_read on public.objective_owners for select to authenticated
using (
  organization_id = private.current_organization_id()
  and (
    private.can_hr_read_objective(objective_id)
    or exists (
      select 1
      from public.objectives o
      where o.id = objective_id
        and o.organization_id = organization_id
        and private.can_read_business_subject(o.owner_id, o.project_id, o.organization_id)
    )
  )
);

-- 3. Objective creation/editing carries HR ownership -------------------------

create or replace function public.create_objective(
  p_name text,
  p_number text,
  p_leader_id uuid,
  p_quarter text,
  p_start_date date,
  p_due_date date,
  p_priority public.okr_priority,
  p_description text,
  p_classification public.classification,
  p_objective_type public.objective_type default 'business',
  p_hr_owner_ids uuid[] default '{}'::uuid[]
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
  hr_owner uuid;
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
  if p_objective_type = 'hr' then
    if coalesce(cardinality(p_hr_owner_ids), 0) = 0 then
      raise exception '当前没有可选择的 HR 成员，请先创建或启用 HR 用户。' using errcode = '22023';
    end if;
    for hr_owner in select distinct unnest(p_hr_owner_ids) loop
      if hr_owner is null or not private.is_eligible_hr_kr_owner(hr_owner, target_org) then
        raise exception 'HR 负责人必须是已启用且审批通过的 HR 用户。' using errcode = '22023';
      end if;
    end loop;
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
    start_date, due_date, progress, number, quarter, priority, okr_status, objective_type
  ) values (
    new_objective_id, target_org, new_project_id, p_leader_id, trim(p_name), coalesce(p_description, ''),
    p_classification, p_start_date, p_due_date, 0, resolved_number, p_quarter, p_priority,
    case when p_start_date > current_date then 'not_started'::public.okr_status else 'on_track'::public.okr_status end,
    p_objective_type
  );

  insert into public.objective_owners (organization_id, objective_id, profile_id, role_type)
  values (target_org, new_objective_id, p_leader_id, 'project_leader');

  if p_objective_type = 'hr' then
    for hr_owner in select distinct unnest(p_hr_owner_ids) loop
      insert into public.objective_owners (organization_id, objective_id, profile_id, role_type)
      values (target_org, new_objective_id, hr_owner, 'hr');
    end loop;
  end if;

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
  p_classification public.classification,
  p_objective_type public.objective_type default 'business',
  p_hr_owner_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.objectives%rowtype;
  hr_owner uuid;
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
  if p_objective_type = 'hr' then
    if coalesce(cardinality(p_hr_owner_ids), 0) = 0 then
      raise exception '当前没有可选择的 HR 成员，请先创建或启用 HR 用户。' using errcode = '22023';
    end if;
    for hr_owner in select distinct unnest(p_hr_owner_ids) loop
      if hr_owner is null or not private.is_eligible_hr_kr_owner(hr_owner, target.organization_id) then
        raise exception 'HR 负责人必须是已启用且审批通过的 HR 用户。' using errcode = '22023';
      end if;
    end loop;
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
      classification = p_classification,
      objective_type = p_objective_type
  where id = target.id;

  update public.projects
  set name = trim(p_name),
      leader_id = p_leader_id,
      start_date = p_start_date,
      due_date = p_due_date,
      classification = p_classification
  where id = target.project_id;

  insert into public.project_members (organization_id, project_id, profile_id)
  values (target.organization_id, target.project_id, p_leader_id)
  on conflict do nothing;

  delete from public.objective_owners where objective_id = target.id;

  insert into public.objective_owners (organization_id, objective_id, profile_id, role_type)
  values (target.organization_id, target.id, p_leader_id, 'project_leader');

  if p_objective_type = 'hr' then
    for hr_owner in select distinct unnest(p_hr_owner_ids) loop
      insert into public.objective_owners (organization_id, objective_id, profile_id, role_type)
      values (target.organization_id, target.id, hr_owner, 'hr');
    end loop;
  end if;
end;
$$;

-- 4. KR creation/editing scoped to HR Objectives -----------------------------

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
  if target.objective_type = 'hr' then
    if not private.is_hr_objective_owner(target.id, auth.uid()) then
      raise exception 'Only an assigned HR owner can create key results for HR objectives' using errcode = '42501';
    end if;
  else
    if target.owner_id <> auth.uid() or not private.has_role('project_leader') then
      raise exception 'Only an active project leader can create key results' using errcode = '42501';
    end if;
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
    if owner_id is null then
      raise exception 'Key Result owners must be valid members' using errcode = '22023';
    end if;
    if target.objective_type = 'hr' then
      if not private.is_eligible_hr_kr_owner(owner_id, target.organization_id) then
        raise exception 'Key Result owners for HR objectives must be HR members' using errcode = '22023';
      end if;
    else
      if not private.is_eligible_kr_owner(owner_id, target.organization_id, target.project_id) then
        raise exception 'Key Result owners must be eligible members of the Objective''s project.' using errcode = '22023';
      end if;
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

  if objective.objective_type = 'hr' then
    if not private.is_hr_objective_owner(objective.id, auth.uid()) then
      raise exception 'Only an assigned HR owner can edit key results for HR objectives' using errcode = '42501';
    end if;
  else
    if objective.owner_id <> auth.uid() or not private.has_role('project_leader') then
      raise exception 'Only an active project leader can edit key results' using errcode = '42501';
    end if;
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
    if owner_id is null then
      raise exception 'Key Result owners must be valid members' using errcode = '22023';
    end if;
    if objective.objective_type = 'hr' then
      if not private.is_eligible_hr_kr_owner(owner_id, objective.organization_id) then
        raise exception 'Key Result owners for HR objectives must be HR members' using errcode = '22023';
      end if;
    else
      if not private.is_eligible_kr_owner(owner_id, objective.organization_id, objective.project_id) then
        raise exception 'Key Result owners must be eligible members of the Objective''s project.' using errcode = '22023';
      end if;
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

-- 5. KR owner candidates: HR-only for HR Objectives --------------------------

create or replace function public.list_eligible_kr_owners(p_objective_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid := private.current_organization_id();
  target public.objectives%rowtype;
  result jsonb;
begin
  if caller_org is null then
    raise exception 'Objective is not available for KR assignment' using errcode = '42501';
  end if;

  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = caller_org;

  if not found then
    raise exception 'Objective is not available for KR assignment' using errcode = '42501';
  end if;

  if target.objective_type = 'hr' then
    if not private.is_hr_objective_owner(target.id, auth.uid()) then
      raise exception 'Objective is not available for KR assignment' using errcode = '42501';
    end if;
  else
    if target.owner_id <> auth.uid() or not private.has_role('project_leader') then
      raise exception 'Objective is not available for KR assignment' using errcode = '42501';
    end if;
  end if;

  select coalesce(jsonb_agg(candidate order by candidate->>'display_name'), '[]'::jsonb)
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
      'organizations', jsonb_build_object('name', org.name),
      'user_roles', jsonb_build_array(jsonb_build_object('role', ur.role)),
      'project_members', coalesce((
        select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
        from public.project_members pm
        where pm.organization_id = caller_org and pm.profile_id = p.id
      ), '[]'::jsonb)
    ) candidate
    from public.profiles p
    join public.organizations org on org.id = p.organization_id
    join public.user_roles ur on ur.profile_id = p.id and ur.organization_id = p.organization_id
    where p.organization_id = caller_org
      and p.is_active
      and p.approval_status = 'approved'
      and ur.is_active
      and ur.role = any (
        case when target.objective_type = 'hr'
          then array['hr'::public.app_role]
          else array['project_leader'::public.app_role, 'employee'::public.app_role]
        end
      )
  ) eligible;
  return result;
end;
$$;

-- 6. KR-owner membership trigger: HR owners are not project members ----------

create or replace function private.ensure_kr_owner_project_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  target_organization_id uuid;
  target_objective_type public.objective_type;
begin
  select kr.project_id, kr.organization_id, o.objective_type
  into target_project_id, target_organization_id, target_objective_type
  from public.key_results kr
  join public.objectives o on o.id = kr.objective_id
  where kr.id = new.kr_id;

  if target_organization_id is null
    or target_organization_id <> new.organization_id then
    raise exception 'Key Result assignment target is invalid' using errcode = '22023';
  end if;

  if target_objective_type = 'hr' then
    if not private.is_eligible_hr_kr_owner(new.profile_id, target_organization_id) then
      raise exception 'Key Result owner is not an eligible HR member' using errcode = '22023';
    end if;
  else
    if target_project_id is null
      or not private.is_eligible_kr_owner(new.profile_id, target_organization_id, target_project_id) then
      raise exception 'Key Result owner is not an eligible organization member' using errcode = '22023';
    end if;

    insert into public.project_members (organization_id, project_id, profile_id)
    values (target_organization_id, target_project_id, new.profile_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_kr_owner_project_membership on public.kr_assignments;
create trigger ensure_kr_owner_project_membership
before insert on public.kr_assignments
for each row
when (new.assignment_role = 'owner')
execute function private.ensure_kr_owner_project_membership();

-- 7. RLS: HR reads HR Objectives (and only those) ----------------------------

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
    or private.can_hr_read_objective(objectives.id)
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
    or private.can_hr_read_objective(objective_id)
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
    or exists (
      select 1
      from public.key_results kr
      join public.objectives o on o.id = kr.objective_id and o.organization_id = kr.organization_id
      where kr.id = kr_id
        and kr.organization_id = organization_id
        and o.objective_type = 'hr'
        and private.has_role('hr')
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
        or private.can_hr_read_objective(kr.objective_id)
      )
  )
);

-- 8. HR org directory: active approved PL/employee/HR users ------------------

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

  -- hr: active, approved users who can own KRs / log hours (PL, employee, hr).
  -- HR's OKR tree needs to resolve project-leader and HR-owner names, and the
  -- work-hours overview needs the roster. Business report bodies stay hidden.
  if private.has_role('hr') then
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
            and ur.role in ('project_leader'::public.app_role, 'employee'::public.app_role, 'hr'::public.app_role)
        )
    ) directory;
    return result;
  end if;

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

-- 9. HR work-hours overview: investment rows only ----------------------------

create or replace function public.get_hr_work_hours(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid := private.current_organization_id();
  result jsonb;
begin
  if caller_org is null or not private.has_role('hr') then
    raise exception 'HR work hours are not available to the current user' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item->>'date', item->>'displayName', item->>'krTitle'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'date', dr.report_date,
      'userId', dr.author_id,
      'displayName', p.display_name,
      'role', ur.role,
      'projectLeaderName', pl.display_name,
      'projectLeaderId', pl.id,
      'projectId', kr.project_id,
      'projectName', pr.name,
      'objectiveId', kr.objective_id,
      'objectiveTitle', o.title,
      'objectiveArchived', (o.archived_at is not null),
      'krId', kr.id,
      'krTitle', kr.title,
      'hours', b.hours
    ) as item
    from public.daily_okr_blocks b
    join public.daily_reports dr
      on dr.id = b.report_id and dr.organization_id = b.organization_id
    join public.daily_report_revisions rev
      on rev.id = b.revision_id and rev.report_id = b.report_id
    join public.profiles p
      on p.id = dr.author_id and p.organization_id = dr.organization_id
    left join public.key_results kr
      on kr.id = b.linked_key_result_id and kr.organization_id = b.organization_id
    left join public.objectives o
      on o.id = kr.objective_id and o.organization_id = kr.organization_id
    left join public.projects pr
      on pr.id = kr.project_id and pr.organization_id = kr.organization_id
    left join public.profiles pl
      on pl.id = pr.leader_id and pl.organization_id = pr.organization_id
    left join public.user_roles ur
      on ur.profile_id = p.id and ur.organization_id = dr.organization_id and ur.is_active
    where dr.organization_id = caller_org
      and dr.report_date between p_from and p_to
      and rev.revision_number = dr.current_revision
  ) rows;
  return result;
end;
$$;

-- 10. Drop legacy single-owner overloads -------------------------------------
-- `create or replace` matches on name + argument types, so the previous 9-arg
-- definitions survive as separate overloads. Drop them so the HR-aware
-- signatures are the only ones callable (and PostgREST's `.rpc` is unambiguous).
drop function if exists public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification);
drop function if exists public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification);

-- 11. Grants -----------------------------------------------------------------

revoke all on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) from public, anon;
revoke all on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) from public, anon;
revoke all on function public.get_hr_work_hours(date, date) from public, anon;

grant execute on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) to authenticated;
grant execute on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) to authenticated;
grant execute on function public.get_hr_work_hours(date, date) to authenticated;
