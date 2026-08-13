create schema if not exists private;
revoke all on schema private from public;

alter table public.profiles
  add column clearance public.classification not null default 'internal';

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid() and p.is_active
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
  where p.id = auth.uid() and p.is_active
$$;

create or replace function private.has_role(required_role public.app_role)
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
      and ur.role = required_role
      and ur.is_active
  )
$$;

create or replace function private.classification_rank(value public.classification)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case value
    when 'public' then 0
    when 'internal' then 1
    when 'confidential' then 2
    when 'restricted' then 3
  end
$$;

create or replace function private.has_clearance(required_classification public.classification)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.classification_rank((select p.clearance from public.profiles p where p.id = auth.uid() and p.is_active))
      >= private.classification_rank(required_classification),
    false
  )
$$;

create or replace function private.is_project_leader(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id
      and p.organization_id = private.current_organization_id()
      and p.leader_id = auth.uid()
  )
$$;

create or replace function private.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id
      and pm.organization_id = private.current_organization_id()
      and pm.profile_id = auth.uid()
  )
$$;

create or replace function private.has_project_collaboration(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collaboration_links cl
    where cl.project_id = target_project_id
      and cl.organization_id = private.current_organization_id()
      and cl.grantee_id = auth.uid()
      and cl.expires_at > now()
  )
$$;

create or replace function private.can_read_business_subject(
  subject_profile_id uuid,
  subject_project_id uuid,
  subject_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    subject_organization_id = private.current_organization_id()
    and not private.has_role('hr')
    and (
      subject_profile_id = auth.uid()
      or private.has_role('management')
      or exists (
        select 1 from public.projects p
        where p.id = subject_project_id
          and p.organization_id = subject_organization_id
          and p.leader_id = auth.uid()
      )
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = subject_project_id
          and pm.organization_id = subject_organization_id
          and pm.profile_id = auth.uid()
      )
      or exists (
        select 1 from public.collaboration_links cl
        where cl.project_id = subject_project_id
          and cl.organization_id = subject_organization_id
          and cl.grantee_id = auth.uid()
          and cl.expires_at > now()
      )
    ),
    false
  )
$$;

create or replace function private.can_read_report_detail(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and private.has_clearance(dr.classification)
      and private.can_read_business_subject(dr.author_id, dr.project_id, dr.organization_id)
  )
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.has_clearance(public.classification) to authenticated;
grant execute on function private.is_project_leader(uuid) to authenticated;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.has_project_collaboration(uuid) to authenticated;
grant execute on function private.can_read_business_subject(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_read_report_detail(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.reporting_lines enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.collaboration_links enable row level security;
alter table public.objectives enable row level security;
alter table public.key_results enable row level security;
alter table public.progress_baselines enable row level security;
alter table public.milestones enable row level security;
alter table public.risks enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_revisions enable row level security;
alter table public.daily_report_revision_krs enable row level security;
alter table public.daily_objectives enable row level security;
alter table public.daily_key_results enable row level security;
alter table public.report_evidence_links enable row level security;
alter table public.report_attachments enable row level security;

alter table public.organizations force row level security;
alter table public.profiles force row level security;
alter table public.user_roles force row level security;
alter table public.reporting_lines force row level security;
alter table public.projects force row level security;
alter table public.project_members force row level security;
alter table public.collaboration_links force row level security;
alter table public.objectives force row level security;
alter table public.key_results force row level security;
alter table public.progress_baselines force row level security;
alter table public.milestones force row level security;
alter table public.risks force row level security;
alter table public.daily_reports force row level security;
alter table public.daily_report_revisions force row level security;
alter table public.daily_report_revision_krs force row level security;
alter table public.daily_objectives force row level security;
alter table public.daily_key_results force row level security;
alter table public.report_evidence_links force row level security;
alter table public.report_attachments force row level security;

create policy organizations_read on public.organizations for select to authenticated
using (id = private.current_organization_id());

create policy profiles_read on public.profiles for select to authenticated
using (organization_id = private.current_organization_id());
create policy profiles_admin_update on public.profiles for update to authenticated
using (organization_id = private.current_organization_id() and private.has_role('administrator'))
with check (organization_id = private.current_organization_id());

create policy roles_read on public.user_roles for select to authenticated
using (profile_id = auth.uid() or (organization_id = private.current_organization_id() and private.has_role('administrator')));
create policy roles_admin_all on public.user_roles for all to authenticated
using (organization_id = private.current_organization_id() and private.has_role('administrator'))
with check (organization_id = private.current_organization_id() and private.has_role('administrator'));

create policy reporting_lines_read on public.reporting_lines for select to authenticated
using (organization_id = private.current_organization_id() and (manager_id = auth.uid() or subordinate_id = auth.uid() or private.has_role('management')));

create policy projects_read on public.projects for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.is_project_leader(id)
    or private.has_role('management')
    or private.is_project_member(id)
    or private.has_project_collaboration(id)
  )
);

create policy project_members_read on public.project_members for select to authenticated
using (organization_id = private.current_organization_id() and (profile_id = auth.uid() or private.has_role('management') or private.is_project_leader(project_id)));

create policy collaboration_links_read on public.collaboration_links for select to authenticated
using (organization_id = private.current_organization_id() and (grantor_id = auth.uid() or grantee_id = auth.uid() or private.has_role('management')));

create policy objectives_read on public.objectives for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.can_read_business_subject(owner_id, project_id, organization_id)
    or exists (select 1 from public.reporting_lines rl where rl.manager_id = owner_id and rl.subordinate_id = auth.uid() and rl.organization_id = organization_id)
  )
);
create policy objectives_owner_write on public.objectives for all to authenticated
using (owner_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid()))
with check (organization_id = private.current_organization_id() and (owner_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid())));

create policy key_results_read on public.key_results for select to authenticated
using (organization_id = private.current_organization_id() and private.has_clearance(classification) and private.can_read_business_subject(owner_id, project_id, organization_id));
create policy key_results_owner_write on public.key_results for all to authenticated
using (owner_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid()))
with check (organization_id = private.current_organization_id() and (owner_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid())));

create policy baselines_read on public.progress_baselines for select to authenticated
using (exists (select 1 from public.key_results kr where kr.id = key_result_id));
create policy baselines_write on public.progress_baselines for all to authenticated
using (exists (select 1 from public.key_results kr join public.projects p on p.id = kr.project_id where kr.id = key_result_id and (kr.owner_id = auth.uid() or p.leader_id = auth.uid())))
with check (organization_id = private.current_organization_id() and exists (select 1 from public.key_results kr join public.projects p on p.id = kr.project_id where kr.id = key_result_id and (kr.owner_id = auth.uid() or p.leader_id = auth.uid())));

create policy milestones_read on public.milestones for select to authenticated
using (exists (select 1 from public.projects p where p.id = project_id));
create policy milestones_write on public.milestones for all to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid()))
with check (organization_id = private.current_organization_id() and exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid()));

create policy risks_read on public.risks for select to authenticated
using (organization_id = private.current_organization_id() and private.has_clearance(classification) and private.can_read_business_subject(owner_id, project_id, organization_id));
create policy risks_write on public.risks for all to authenticated
using (owner_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid()))
with check (organization_id = private.current_organization_id() and (owner_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.leader_id = auth.uid())));

create policy reports_read on public.daily_reports for select to authenticated
using (private.has_clearance(classification) and private.can_read_business_subject(author_id, project_id, organization_id));
create policy reports_author_insert on public.daily_reports for insert to authenticated
with check (organization_id = private.current_organization_id() and author_id = auth.uid());
create policy reports_author_update on public.daily_reports for update to authenticated
using (author_id = auth.uid() and status <> 'confirmed')
with check (organization_id = private.current_organization_id() and author_id = auth.uid());

create policy revisions_read on public.daily_report_revisions for select to authenticated
using (private.has_clearance(classification) and private.can_read_report_detail(report_id));
create policy revisions_author_insert on public.daily_report_revisions for insert to authenticated
with check (editor_id = auth.uid() and exists (select 1 from public.daily_reports dr where dr.id = report_id and dr.author_id = auth.uid() and dr.status <> 'confirmed'));

create policy revision_krs_read on public.daily_report_revision_krs for select to authenticated
using (exists (select 1 from public.daily_report_revisions rr where rr.id = revision_id));
create policy revision_krs_author_insert on public.daily_report_revision_krs for insert to authenticated
with check (exists (select 1 from public.daily_report_revisions rr join public.daily_reports dr on dr.id = rr.report_id where rr.id = revision_id and dr.author_id = auth.uid() and rr.editor_id = auth.uid()));

create policy daily_objectives_read on public.daily_objectives for select to authenticated
using (exists (select 1 from public.daily_report_revisions rr where rr.id = revision_id));
create policy daily_key_results_read on public.daily_key_results for select to authenticated
using (exists (select 1 from public.daily_report_revisions rr where rr.id = revision_id));
create policy evidence_links_read on public.report_evidence_links for select to authenticated
using (private.has_clearance(classification) and private.can_read_report_detail(report_id));
create policy evidence_links_author_write on public.report_evidence_links for all to authenticated
using (exists (select 1 from public.daily_reports dr where dr.id = report_id and dr.author_id = auth.uid() and dr.status <> 'confirmed'))
with check (organization_id = private.current_organization_id() and exists (select 1 from public.daily_reports dr where dr.id = report_id and dr.author_id = auth.uid() and dr.status <> 'confirmed'));
create policy attachments_read on public.report_attachments for select to authenticated
using (state = 'uploaded' and private.has_clearance(classification) and private.can_read_report_detail(report_id));
create policy attachments_owner_write on public.report_attachments for all to authenticated
using (uploader_id = auth.uid() and exists (select 1 from public.daily_reports dr where dr.id = report_id and dr.author_id = auth.uid() and dr.status <> 'confirmed'))
with check (organization_id = private.current_organization_id() and uploader_id = auth.uid() and exists (select 1 from public.daily_reports dr where dr.id = report_id and dr.author_id = auth.uid() and dr.status <> 'confirmed'));

create view public.hr_workload
with (security_barrier = true)
as
select
  dr.author_id as user_id,
  dr.report_date,
  dr.project_id,
  dr.total_hours,
  null::numeric as planned_hours,
  8::numeric as capacity_hours
from public.daily_reports dr
where dr.organization_id = private.current_organization_id()
  and private.has_role('hr');

revoke all on public.hr_workload from public, anon;
grant select on public.hr_workload to authenticated;

grant select on public.organizations, public.profiles, public.user_roles, public.reporting_lines,
  public.projects, public.project_members, public.collaboration_links, public.objectives,
  public.key_results, public.progress_baselines, public.milestones, public.risks,
  public.daily_reports, public.daily_report_revisions, public.daily_report_revision_krs,
  public.daily_objectives, public.daily_key_results, public.report_evidence_links,
  public.report_attachments to authenticated;
grant insert, update on public.profiles, public.user_roles, public.objectives, public.key_results,
  public.progress_baselines, public.milestones, public.risks, public.daily_reports,
  public.daily_report_revisions, public.daily_report_revision_krs, public.report_evidence_links,
  public.report_attachments to authenticated;
grant delete on public.user_roles, public.progress_baselines, public.milestones, public.risks,
  public.report_evidence_links, public.report_attachments to authenticated;

create or replace function public.create_daily_report(
  p_project_id uuid,
  p_objective_id uuid,
  p_report_date date,
  p_status public.report_status,
  p_classification public.classification,
  p_total_hours numeric,
  p_daily_objective text,
  p_objective_progress numeric,
  p_krs jsonb,
  p_evidence_links jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  report_id uuid := gen_random_uuid();
  revision_id uuid := gen_random_uuid();
  item jsonb;
  item_position integer := 0;
begin
  select o.organization_id into organization_id
  from public.objectives o
  join public.projects p on p.id = p_project_id and p.organization_id = o.organization_id
  where o.id = p_objective_id
    and o.project_id = p_project_id
    and o.owner_id = auth.uid()
    and o.organization_id = private.current_organization_id();
  if not found then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Daily report classification exceeds user clearance' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_krs, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_evidence_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Daily report collections must be arrays' using errcode = '22023';
  end if;

  insert into public.daily_reports (
    id, organization_id, author_id, project_id, objective_id, report_date,
    status, classification, total_hours, current_revision
  ) values (
    report_id, organization_id, auth.uid(), p_project_id, p_objective_id, p_report_date,
    p_status, p_classification, p_total_hours, 0
  );
  insert into public.daily_report_revisions (
    id, organization_id, report_id, revision_number, editor_id,
    daily_objective, objective_progress, classification
  ) values (
    revision_id, organization_id, report_id, 1, auth.uid(),
    p_daily_objective, p_objective_progress, p_classification
  );

  for item in select value from jsonb_array_elements(coalesce(p_krs, '[]'::jsonb)) loop
    item_position := item_position + 1;
    insert into public.daily_report_revision_krs (
      organization_id, revision_id, position, title, measurement_type,
      progress, hours, work_note, linked_key_result_id, measurement_data
    ) values (
      organization_id, revision_id, item_position, item->>'title',
      (item->>'measurementType')::public.kr_measurement_type,
      (item->>'progress')::numeric, (item->>'hours')::numeric,
      coalesce(item->>'workNote', ''), nullif(item->>'linkedKeyResultId', '')::uuid,
      coalesce(item->'measurementData', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_evidence_links, '[]'::jsonb)) loop
    insert into public.report_evidence_links (
      organization_id, report_id, revision_id, url, label, classification
    ) values (
      organization_id, report_id, revision_id, item->>'url', item->>'label',
      coalesce((item->>'classification')::public.classification, p_classification)
    );
  end loop;
  update public.daily_reports set current_revision = 1 where id = report_id;
  return report_id;
end;
$$;

create or replace function public.update_daily_report(
  p_report_id uuid,
  p_expected_revision integer,
  p_status public.report_status,
  p_classification public.classification,
  p_total_hours numeric,
  p_daily_objective text,
  p_objective_progress numeric,
  p_krs jsonb,
  p_evidence_links jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.daily_reports%rowtype;
  next_revision integer;
  revision_id uuid := gen_random_uuid();
  item jsonb;
  item_position integer := 0;
begin
  select * into target from public.daily_reports
  where id = p_report_id and author_id = auth.uid()
  for update;
  if not found or target.status = 'confirmed' then
    raise exception 'Daily report is not editable by the current user' using errcode = '42501';
  end if;
  if target.current_revision <> p_expected_revision then
    raise exception 'Daily report revision conflict' using errcode = '40001';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Daily report classification exceeds user clearance' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_krs, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_evidence_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Daily report collections must be arrays' using errcode = '22023';
  end if;
  next_revision := target.current_revision + 1;

  insert into public.daily_report_revisions (
    id, organization_id, report_id, revision_number, editor_id,
    daily_objective, objective_progress, classification
  ) values (
    revision_id, target.organization_id, target.id, next_revision, auth.uid(),
    p_daily_objective, p_objective_progress, p_classification
  );
  for item in select value from jsonb_array_elements(coalesce(p_krs, '[]'::jsonb)) loop
    item_position := item_position + 1;
    insert into public.daily_report_revision_krs (
      organization_id, revision_id, position, title, measurement_type,
      progress, hours, work_note, linked_key_result_id, measurement_data
    ) values (
      target.organization_id, revision_id, item_position, item->>'title',
      (item->>'measurementType')::public.kr_measurement_type,
      (item->>'progress')::numeric, (item->>'hours')::numeric,
      coalesce(item->>'workNote', ''), nullif(item->>'linkedKeyResultId', '')::uuid,
      coalesce(item->'measurementData', '{}'::jsonb)
    );
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_evidence_links, '[]'::jsonb)) loop
    insert into public.report_evidence_links (
      organization_id, report_id, revision_id, url, label, classification
    ) values (
      target.organization_id, target.id, revision_id, item->>'url', item->>'label',
      coalesce((item->>'classification')::public.classification, p_classification)
    );
  end loop;
  update public.daily_reports set
    status = p_status,
    classification = p_classification,
    total_hours = p_total_hours,
    current_revision = next_revision
  where id = target.id;
  return next_revision;
end;
$$;

revoke all on function public.create_daily_report(uuid, uuid, date, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb) from public, anon;
revoke all on function public.update_daily_report(uuid, integer, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.create_daily_report(uuid, uuid, date, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb) to authenticated;
grant execute on function public.update_daily_report(uuid, integer, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb) to authenticated;

create or replace function public.save_progress_plan(p_key_result_id uuid, p_points jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.key_results%rowtype;
  item jsonb;
  point_date date;
  point_value numeric;
  previous_date date;
  previous_value numeric;
begin
  select * into target from public.key_results kr
  where kr.id = p_key_result_id
    and kr.organization_id = private.current_organization_id()
    and (kr.owner_id = auth.uid() or private.is_project_leader(kr.project_id));
  if not found then
    raise exception 'Progress plan is not editable by the current user' using errcode = '42501';
  end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) = 0 then
    raise exception 'Progress plan requires at least one point' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_points) loop
    point_date := (item->>'date')::date;
    point_value := (item->>'value')::numeric;
    if point_date < target.start_date or point_date > target.due_date
      or point_value < 0 or point_value > 100
      or (previous_date is not null and point_date <= previous_date)
      or (previous_value is not null and point_value < previous_value) then
      raise exception 'Progress plan points are invalid' using errcode = '22023';
    end if;
    previous_date := point_date;
    previous_value := point_value;
  end loop;
  if previous_date <> target.due_date or previous_value <> coalesce(target.target_value, 100) then
    raise exception 'Progress plan must end at the due-date target' using errcode = '22023';
  end if;
  delete from public.progress_baselines where key_result_id = target.id;
  insert into public.progress_baselines (organization_id, key_result_id, planned_for, planned_value)
  select target.organization_id, target.id, (value->>'date')::date, (value->>'value')::numeric
  from jsonb_array_elements(p_points);
end;
$$;

create or replace function public.save_milestones(p_project_id uuid, p_milestones jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projects%rowtype;
  item jsonb;
begin
  select * into target from public.projects p
  where p.id = p_project_id
    and p.organization_id = private.current_organization_id()
    and p.leader_id = auth.uid();
  if not found then
    raise exception 'Milestones are not editable by the current user' using errcode = '42501';
  end if;
  if jsonb_typeof(p_milestones) <> 'array' then
    raise exception 'Milestones must be an array' using errcode = '22023';
  end if;
  delete from public.milestones where project_id = target.id;
  for item in select value from jsonb_array_elements(p_milestones) loop
    if length(trim(coalesce(item->>'title', ''))) = 0
      or (item->>'plannedDate')::date < target.start_date
      or (item->>'plannedDate')::date > target.due_date then
      raise exception 'Milestone is outside the project plan' using errcode = '22023';
    end if;
    insert into public.milestones (organization_id, project_id, key_result_id, title, planned_date)
    values (target.organization_id, target.id, nullif(item->>'keyResultId', '')::uuid, item->>'title', (item->>'plannedDate')::date);
  end loop;
end;
$$;

revoke all on function public.save_progress_plan(uuid, jsonb) from public, anon;
revoke all on function public.save_milestones(uuid, jsonb) from public, anon;
grant execute on function public.save_progress_plan(uuid, jsonb) to authenticated;
grant execute on function public.save_milestones(uuid, jsonb) to authenticated;

create or replace function public.save_risk(
  p_project_id uuid, p_title text, p_probability integer, p_impact integer,
  p_reason text, p_mitigation text, p_last_reviewed_at date,
  p_classification public.classification
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projects%rowtype;
  risk_id uuid := gen_random_uuid();
  score integer := p_probability * p_impact;
  calculated_level public.risk_level;
begin
  select * into target from public.projects p
  where p.id = p_project_id and p.organization_id = private.current_organization_id()
    and (p.leader_id = auth.uid() or private.has_role('management'));
  if not found then raise exception 'Risk is not editable by the current user' using errcode = '42501'; end if;
  if length(trim(p_title)) = 0 or length(trim(p_reason)) = 0 or length(trim(p_mitigation)) = 0
    or p_probability not between 1 and 3 or p_impact not between 1 and 3 then
    raise exception 'Risk fields are invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then raise exception 'Risk classification exceeds user clearance' using errcode = '42501'; end if;
  calculated_level := (case when score <= 2 then 'low' when score <= 4 then 'medium' when score = 6 then 'high' else 'critical' end)::public.risk_level;
  insert into public.risks (id, organization_id, project_id, owner_id, title, reason, mitigation, probability, impact, level, classification, last_reviewed_at)
  values (risk_id, target.organization_id, target.id, auth.uid(), p_title, p_reason, p_mitigation, p_probability, p_impact, calculated_level, p_classification, p_last_reviewed_at::timestamptz);
  return risk_id;
end;
$$;
revoke all on function public.save_risk(uuid, text, integer, integer, text, text, date, public.classification) from public, anon;
grant execute on function public.save_risk(uuid, text, integer, integer, text, text, date, public.classification) to authenticated;
