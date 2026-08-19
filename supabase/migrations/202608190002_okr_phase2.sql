-- Phase 2 — OKR Management domain (Objectives as R&D projects, KR assignments,
-- and chronological progress updates).
--
-- Additive and RLS/RPC-protected. The Objective portfolio treats each Objective
-- as an R&D project: management creates Objectives; a Project Leader decomposes
-- them into Key Results; KRs carry an owner plus collaborators via
-- `kr_assignments`; progress changes append to `kr_progress_updates` (the
-- digitized replacement for the former "回溯1-6" columns).
--
-- No broad authenticated write is introduced: every mutation below is a
-- SECURITY DEFINER RPC, and the browser only ever holds the publishable anon key.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.okr_status as enum ('not_started', 'on_track', 'at_risk', 'delayed', 'completed');
create type public.kr_metric_type as enum ('numeric', 'percentage', 'milestone');
create type public.okr_priority as enum ('low', 'medium', 'high');
create type public.kr_assignment_role as enum ('owner', 'collaborator');

-- ---------------------------------------------------------------------------
-- Objective columns (project number, cycle, priority, lifecycle status)
-- ---------------------------------------------------------------------------
alter table public.objectives
  add column number text,
  add column quarter text,
  add column priority public.okr_priority not null default 'medium',
  add column okr_status public.okr_status not null default 'on_track',
  add column archived_at timestamptz;

create unique index objectives_organization_number_key
  on public.objectives (organization_id, number)
  where number is not null;

-- ---------------------------------------------------------------------------
-- Key Result columns (metric configuration, notes, confidence, priority)
-- `current_value` / `target_value` already exist from the core schema.
-- ---------------------------------------------------------------------------
alter table public.key_results
  add column metric_type public.kr_metric_type not null default 'numeric',
  add column unit text,
  add column notes text,
  add column confidence_index numeric(5, 2),
  add column priority public.okr_priority not null default 'medium',
  add column okr_status public.okr_status not null default 'on_track';

-- ---------------------------------------------------------------------------
-- KR assignments (owner + collaborators) — replaces a single kr.owner_id for
-- the responsibility model. The canonical primary owner is still recorded on
-- key_results.owner_id; collaborators are represented here.
-- ---------------------------------------------------------------------------
create table public.kr_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kr_id uuid not null references public.key_results(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assignment_role public.kr_assignment_role not null default 'collaborator',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (kr_id, profile_id)
);

alter table public.kr_assignments
  add constraint kr_assignments_organization_key_result_fkey
    foreign key (organization_id, kr_id) references public.key_results (organization_id, id),
  add constraint kr_assignments_organization_profile_fkey
    foreign key (organization_id, profile_id) references public.profiles (organization_id, id);

create trigger set_kr_assignments_updated_at before update on public.kr_assignments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Chronological KR progress updates (immutable).
-- ---------------------------------------------------------------------------
create table public.kr_progress_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kr_id uuid not null references public.key_results(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  previous_progress numeric(5, 2) not null check (previous_progress between 0 and 100),
  new_progress numeric(5, 2) not null check (new_progress between 0 and 100),
  summary text not null check (length(trim(summary)) > 0),
  blocker text,
  reason text,
  next_action text,
  evidence text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.kr_progress_updates
  add constraint kr_progress_updates_organization_key_result_fkey
    foreign key (organization_id, kr_id) references public.key_results (organization_id, id),
  add constraint kr_progress_updates_organization_author_fkey
    foreign key (organization_id, author_id) references public.profiles (organization_id, id);

create function public.reject_kr_progress_update_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'KR progress updates are immutable';
end;
$$;

create trigger reject_kr_progress_update_mutation
before update or delete on public.kr_progress_updates
for each row execute function public.reject_kr_progress_update_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.kr_assignments enable row level security;
alter table public.kr_assignments force row level security;
alter table public.kr_progress_updates enable row level security;
alter table public.kr_progress_updates force row level security;

create policy kr_assignments_read on public.kr_assignments for select to authenticated
using (
  exists (
    select 1
    from public.key_results kr
    where kr.id = kr_id
      and kr.organization_id = organization_id
      and private.has_clearance(kr.classification)
      and private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
  )
);

create policy kr_progress_updates_read on public.kr_progress_updates for select to authenticated
using (
  exists (
    select 1
    from public.key_results kr
    where kr.id = kr_id
      and kr.organization_id = organization_id
      and private.has_clearance(kr.classification)
      and private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
  )
);

revoke all on table public.kr_assignments from public, anon, authenticated;
revoke all on table public.kr_progress_updates from public, anon, authenticated;
grant select on table public.kr_assignments to authenticated;
grant select on table public.kr_progress_updates to authenticated;

-- ---------------------------------------------------------------------------
-- Objective CRUD RPCs
-- ---------------------------------------------------------------------------

-- Management/administrator create a company Objective (an R&D project). The
-- Objective and its backing Project are created atomically so 项目 and OKR管理
-- stay cross-linked.
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
  if target_org is null or not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Only management or administrators can create objectives' using errcode = '42501';
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
  is_management boolean;
begin
  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Objective is not editable by the current user' using errcode = '42501';
  end if;

  is_management := private.has_role('management') or private.has_role('administrator');
  if not (is_management or target.owner_id = auth.uid()) then
    raise exception 'Objective is not editable by the current user' using errcode = '42501';
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

create or replace function public.archive_objective(p_objective_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_organization_id() is null
    or not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Only management or administrators can archive objectives' using errcode = '42501';
  end if;
  update public.objectives
  set archived_at = timezone('utc', now())
  where id = p_objective_id
    and organization_id = private.current_organization_id()
    and archived_at is null;
  if not found then
    raise exception 'Objective is not archivable by the current user' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.restore_objective(p_objective_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_organization_id() is null
    or not (private.has_role('management') or private.has_role('administrator')) then
    raise exception 'Only management or administrators can restore objectives' using errcode = '42501';
  end if;
  update public.objectives
  set archived_at = null
  where id = p_objective_id
    and organization_id = private.current_organization_id()
    and archived_at is not null;
  if not found then
    raise exception 'Objective is not restorable by the current user' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Key Result RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_key_result(
  p_objective_id uuid,
  p_title text,
  p_owner_id uuid,
  p_due_date date,
  p_metric_type public.kr_metric_type,
  p_current_value numeric,
  p_target_value numeric,
  p_unit text,
  p_notes text,
  p_confidence_index numeric,
  p_priority public.okr_priority,
  p_classification public.classification,
  p_collaborator_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.objectives%rowtype;
  new_kr_id uuid := gen_random_uuid();
  collaborator_id uuid;
begin
  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Key Result objective is not available' using errcode = '42501';
  end if;
  if not (private.has_role('management') or private.has_role('administrator') or target.owner_id = auth.uid()) then
    raise exception 'Key Result is not editable by the current user' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived objectives cannot gain key results' using errcode = '22023';
  end if;
  if length(trim(p_title)) = 0 or p_owner_id is null or p_due_date is null then
    raise exception 'Key Result fields are invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Key Result classification exceeds user clearance' using errcode = '42501';
  end if;

  insert into public.key_results (
    id, organization_id, objective_id, project_id, owner_id, title,
    measurement_type, metric_type, target_value, current_value, unit, notes,
    confidence_index, priority, progress, classification, start_date, due_date, okr_status
  ) values (
    new_kr_id, target.organization_id, target.id, target.project_id, p_owner_id, trim(p_title),
    'number', p_metric_type, p_target_value, p_current_value, nullif(p_unit, ''), nullif(p_notes, ''),
    p_confidence_index, coalesce(p_priority, 'medium'), 0, p_classification,
    target.start_date, p_due_date,
    case when target.start_date > current_date then 'not_started'::public.okr_status else 'on_track'::public.okr_status end
  );

  insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
  values (target.organization_id, new_kr_id, p_owner_id, 'owner');

  for collaborator_id in select distinct unnest(coalesce(p_collaborator_ids, '{}'::uuid[])) loop
    if collaborator_id is not null and collaborator_id <> p_owner_id then
      insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
      values (target.organization_id, new_kr_id, collaborator_id, 'collaborator');
    end if;
  end loop;

  return new_kr_id;
end;
$$;

create or replace function public.update_key_result(
  p_key_result_id uuid,
  p_title text,
  p_owner_id uuid,
  p_due_date date,
  p_metric_type public.kr_metric_type,
  p_current_value numeric,
  p_target_value numeric,
  p_unit text,
  p_notes text,
  p_confidence_index numeric,
  p_priority public.okr_priority,
  p_classification public.classification,
  p_collaborator_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.key_results%rowtype;
  objective public.objectives%rowtype;
  collaborator_id uuid;
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
  if not (private.has_role('management') or private.has_role('administrator') or objective.owner_id = auth.uid()) then
    raise exception 'Key Result is not editable by the current user' using errcode = '42501';
  end if;
  if length(trim(p_title)) = 0 or p_owner_id is null or p_due_date is null then
    raise exception 'Key Result fields are invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Key Result classification exceeds user clearance' using errcode = '42501';
  end if;

  update public.key_results
  set title = trim(p_title),
      owner_id = p_owner_id,
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
  insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
  values (target.organization_id, target.id, p_owner_id, 'owner');
  for collaborator_id in select distinct unnest(coalesce(p_collaborator_ids, '{}'::uuid[])) loop
    if collaborator_id is not null and collaborator_id <> p_owner_id then
      insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
      values (target.organization_id, target.id, collaborator_id, 'collaborator');
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- KR progress update RPC (the digitized "回溯1-6")
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

  if not (private.has_role('management') or private.has_role('administrator') or objective.owner_id = auth.uid() or target.owner_id = auth.uid()) then
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
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification) from public, anon;
revoke all on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification) from public, anon;
revoke all on function public.archive_objective(uuid) from public, anon;
revoke all on function public.restore_objective(uuid) from public, anon;
revoke all on function public.create_key_result(uuid, text, uuid, date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification, uuid[]) from public, anon;
revoke all on function public.update_key_result(uuid, text, uuid, date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification, uuid[]) from public, anon;
revoke all on function public.save_kr_progress_update(uuid, numeric, numeric, text, text, text, text, text) from public, anon;
revoke all on function public.reject_kr_progress_update_mutation() from public, anon, authenticated;

grant execute on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification) to authenticated;
grant execute on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification) to authenticated;
grant execute on function public.archive_objective(uuid) to authenticated;
grant execute on function public.restore_objective(uuid) to authenticated;
grant execute on function public.create_key_result(uuid, text, uuid, date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification, uuid[]) to authenticated;
grant execute on function public.update_key_result(uuid, text, uuid, date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification, uuid[]) to authenticated;
grant execute on function public.save_kr_progress_update(uuid, numeric, numeric, text, text, text, text, text) to authenticated;
