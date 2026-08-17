alter table public.profiles
  add column preferred_locale text not null default 'zh-CN'
    check (preferred_locale in ('zh-CN', 'en'));

create table public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key_result_id uuid not null references public.key_results(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  progress numeric(5, 2) not null check (progress between 0 and 100),
  effective_date date not null,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.progress_snapshots
  add constraint progress_snapshots_organization_key_result_fkey
    foreign key (organization_id, key_result_id) references public.key_results (organization_id, id),
  add constraint progress_snapshots_organization_reporter_fkey
    foreign key (organization_id, reporter_id) references public.profiles (organization_id, id);

create function public.reject_progress_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Progress snapshots are immutable';
end;
$$;

create trigger reject_progress_snapshot_mutation
before update or delete on public.progress_snapshots
for each row execute function public.reject_progress_snapshot_mutation();

alter table public.risks
  add column key_result_id uuid references public.key_results(id) on delete restrict,
  add column objective_id uuid references public.objectives(id) on delete restrict,
  add column resolved_at timestamptz,
  add constraint risks_exactly_one_subject check (num_nonnulls(key_result_id, objective_id) = 1) not valid,
  add constraint risks_organization_key_result_fkey
    foreign key (organization_id, key_result_id) references public.key_results (organization_id, id),
  add constraint risks_organization_objective_fkey
    foreign key (organization_id, objective_id) references public.objectives (organization_id, id);

create function public.assert_risk_subject_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  subject_project_id uuid;
begin
  if num_nonnulls(new.key_result_id, new.objective_id) <> 1 then
    return new;
  end if;

  if new.key_result_id is not null then
    select kr.project_id into subject_project_id
    from public.key_results kr
    where kr.id = new.key_result_id
      and kr.organization_id = new.organization_id;
  else
    select o.project_id into subject_project_id
    from public.objectives o
    where o.id = new.objective_id
      and o.organization_id = new.organization_id;
  end if;

  if not found or subject_project_id is distinct from new.project_id then
    raise exception 'Risk subject must belong to the risk project' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger assert_risk_subject_project
before insert or update on public.risks
for each row execute function public.assert_risk_subject_project();

-- Legacy risks were project-level records and did not identify a KR or Objective.
-- Quarantine them losslessly instead of inventing an arbitrary subject association.
-- Administrators can later classify and re-enter each record through an explicit
-- remediation workflow; application roles receive no access to this archive.
create table public.legacy_project_risks (
  id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null,
  title text not null,
  reason text not null,
  mitigation text not null,
  probability smallint not null,
  impact smallint not null,
  level public.risk_level not null,
  classification public.classification not null,
  last_reviewed_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived_at timestamptz not null default timezone('utc', now())
);

insert into public.legacy_project_risks (
  id, organization_id, project_id, owner_id, title, reason, mitigation,
  probability, impact, level, classification, last_reviewed_at, created_at, updated_at
)
select
  id, organization_id, project_id, owner_id, title, reason, mitigation,
  probability, impact, level, classification, last_reviewed_at, created_at, updated_at
from public.risks
where num_nonnulls(key_result_id, objective_id) <> 1;

delete from public.risks
where num_nonnulls(key_result_id, objective_id) <> 1;

alter table public.risks validate constraint risks_exactly_one_subject;
comment on constraint risks_exactly_one_subject on public.risks is
  'Each active risk references exactly one explicitly selected KR or Objective. Legacy project-level risks are preserved without an invented subject in public.legacy_project_risks.';

alter table public.progress_snapshots enable row level security;
alter table public.progress_snapshots force row level security;
alter table public.legacy_project_risks enable row level security;
alter table public.legacy_project_risks force row level security;

create policy progress_snapshots_read on public.progress_snapshots for select to authenticated
using (
  exists (
    select 1
    from public.key_results kr
    where kr.id = key_result_id
      and kr.organization_id = organization_id
      and private.has_clearance(kr.classification)
      and private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
  )
);

revoke all on function public.reject_progress_snapshot_mutation() from public, anon, authenticated;
revoke all on function public.assert_risk_subject_project() from public, anon, authenticated;
revoke all on table public.progress_snapshots from public, anon, authenticated;
revoke all on table public.legacy_project_risks from public, anon, authenticated;
grant select on table public.progress_snapshots to authenticated;

-- HR receives workload totals by person and day only. Grouping removes any
-- project/report fan-out and the view deliberately exposes no project identifier.
drop view public.hr_workload;
create view public.hr_workload
with (security_barrier = true)
as
select
  dr.author_id as user_id,
  dr.report_date,
  sum(dr.total_hours) as total_hours,
  null::numeric as planned_hours,
  8::numeric as capacity_hours
from public.daily_reports dr
where dr.organization_id = private.current_organization_id()
  and private.has_role('hr')
group by dr.author_id, dr.report_date;

revoke all on public.hr_workload from public, anon;
grant select on public.hr_workload to authenticated;

revoke update on table public.profiles from authenticated;
grant update (organization_id, display_name, is_active, clearance) on table public.profiles to authenticated;

revoke update on table public.key_results from authenticated;
grant update (objective_id, project_id, owner_id, title, measurement_type, target_value, current_value, classification, start_date, due_date)
  on table public.key_results to authenticated;

revoke insert, update, delete on table public.risks from authenticated;
revoke execute on function public.save_risk(uuid, text, integer, integer, text, text, date, public.classification) from authenticated;

create or replace function public.save_kr_progress(
  p_key_result_id uuid,
  p_progress numeric,
  p_effective_date date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.key_results%rowtype;
  snapshot_id uuid := gen_random_uuid();
begin
  select * into target
  from public.key_results kr
  where kr.id = p_key_result_id
    and kr.organization_id = private.current_organization_id()
    and kr.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'KR progress is not editable by the current user' using errcode = '42501';
  end if;

  if p_progress is null or p_progress < 0 or p_progress > 100
    or p_effective_date is null or length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'KR progress fields are invalid' using errcode = '22023';
  end if;

  if p_effective_date > current_date then
    raise exception 'KR progress effective date cannot be in the future' using errcode = '22023';
  end if;

  if not private.has_clearance(target.classification) then
    raise exception 'KR progress classification exceeds user clearance' using errcode = '42501';
  end if;

  insert into public.progress_snapshots (
    id, organization_id, key_result_id, reporter_id, progress, effective_date, note
  ) values (
    snapshot_id, target.organization_id, target.id, auth.uid(), p_progress, p_effective_date, p_note
  );

  update public.key_results
  set progress = p_progress
  where id = target.id
    and organization_id = target.organization_id
    and p_effective_date = (
      select max(ps.effective_date)
      from public.progress_snapshots ps
      where ps.key_result_id = target.id
        and ps.organization_id = target.organization_id
        and ps.effective_date <= current_date
    );

  return snapshot_id;
end;
$$;

create or replace function public.save_owned_risk(
  p_risk_id uuid,
  p_project_id uuid,
  p_key_result_id uuid,
  p_objective_id uuid,
  p_title text,
  p_probability smallint,
  p_impact smallint,
  p_reason text,
  p_mitigation text,
  p_last_reviewed_at date,
  p_classification public.classification,
  p_resolved boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project public.projects%rowtype;
  existing_risk public.risks%rowtype;
  risk_id uuid := coalesce(p_risk_id, gen_random_uuid());
  subject_classification public.classification;
  is_project_leader boolean := false;
  minimum_classification_rank integer;
  score integer;
  calculated_level public.risk_level;
begin
  select * into target_project
  from public.projects p
  where p.id = p_project_id
    and p.organization_id = private.current_organization_id();
  if not found or private.has_role('hr') then
    raise exception 'Risk is not editable by the current user' using errcode = '42501';
  end if;

  if not private.has_clearance(target_project.classification) then
    raise exception 'Risk is not editable by the current user' using errcode = '42501';
  end if;

  if num_nonnulls(p_key_result_id, p_objective_id) <> 1 then
    raise exception 'Risk requires exactly one KR or objective subject' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0
    or length(trim(coalesce(p_reason, ''))) = 0
    or length(trim(coalesce(p_mitigation, ''))) = 0
    or p_probability is null or p_probability not between 1 and 3
    or p_impact is null or p_impact not between 1 and 3
    or p_last_reviewed_at is null or p_classification is null or p_resolved is null then
    raise exception 'Risk fields are invalid' using errcode = '22023';
  end if;

  if not private.has_clearance(p_classification) then
    raise exception 'Risk classification exceeds user clearance' using errcode = '42501';
  end if;

  is_project_leader := target_project.leader_id = auth.uid();

  if p_key_result_id is not null then
    select kr.classification into subject_classification
    from public.key_results kr
    where kr.id = p_key_result_id
      and kr.organization_id = target_project.organization_id
      and kr.project_id = target_project.id
      and (is_project_leader or kr.owner_id = auth.uid())
      and private.has_clearance(kr.classification);
  else
    select o.classification into subject_classification
    from public.objectives o
    where o.id = p_objective_id
      and o.organization_id = target_project.organization_id
      and o.project_id = target_project.id
      and (is_project_leader or o.owner_id = auth.uid())
      and private.has_clearance(o.classification);
  end if;

  if not found then
    raise exception 'Risk is not editable by the current user' using errcode = '42501';
  end if;

  if p_risk_id is not null then
    select * into existing_risk
    from public.risks r
    where r.id = p_risk_id
      and r.organization_id = target_project.organization_id
      and r.project_id = target_project.id
      and (is_project_leader or r.owner_id = auth.uid())
      and private.has_clearance(r.classification)
    for update;
    if not found then
      raise exception 'Risk is not editable by the current user' using errcode = '42501';
    end if;
  end if;

  minimum_classification_rank := greatest(
    private.classification_rank(target_project.classification),
    private.classification_rank(subject_classification),
    coalesce(private.classification_rank(existing_risk.classification), 0)
  );
  if private.classification_rank(p_classification) < minimum_classification_rank then
    raise exception 'Risk classification cannot be lower than its protected context' using errcode = '42501';
  end if;

  score := p_probability * p_impact;
  calculated_level := (case
    when score <= 2 then 'low'
    when score <= 4 then 'medium'
    when score = 6 then 'high'
    else 'critical'
  end)::public.risk_level;

  if p_risk_id is null then
    insert into public.risks (
      id, organization_id, project_id, key_result_id, objective_id, owner_id,
      title, reason, mitigation, probability, impact, level, classification,
      last_reviewed_at, resolved_at
    ) values (
      risk_id, target_project.organization_id, target_project.id, p_key_result_id, p_objective_id, auth.uid(),
      p_title, p_reason, p_mitigation, p_probability, p_impact, calculated_level, p_classification,
      p_last_reviewed_at::timestamptz,
      case when p_resolved then timezone('utc', now()) else null end
    );
  else
    update public.risks
    set key_result_id = p_key_result_id,
        objective_id = p_objective_id,
        title = p_title,
        reason = p_reason,
        mitigation = p_mitigation,
        probability = p_probability,
        impact = p_impact,
        level = calculated_level,
        classification = p_classification,
        last_reviewed_at = p_last_reviewed_at::timestamptz,
        resolved_at = case when p_resolved then timezone('utc', now()) else null end
    where id = risk_id and organization_id = target_project.organization_id;
  end if;

  return risk_id;
end;
$$;

create or replace function public.set_my_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_locale is null or p_locale not in ('zh-CN', 'en') then
    raise exception 'Locale is invalid' using errcode = '22023';
  end if;

  update public.profiles
  set preferred_locale = p_locale
  where id = auth.uid()
    and organization_id = private.current_organization_id()
    and is_active;

  if not found then
    raise exception 'Locale is not editable by the current user' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.save_kr_progress(uuid, numeric, date, text) from public, anon;
revoke all on function public.save_owned_risk(uuid, uuid, uuid, uuid, text, smallint, smallint, text, text, date, public.classification, boolean) from public, anon;
revoke all on function public.set_my_locale(text) from public, anon;
grant execute on function public.save_kr_progress(uuid, numeric, date, text) to authenticated;
grant execute on function public.save_owned_risk(uuid, uuid, uuid, uuid, text, smallint, smallint, text, text, date, public.classification, boolean) to authenticated;
grant execute on function public.set_my_locale(text) to authenticated;
