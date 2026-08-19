-- Phase 4 — Daily OKR Report (layered blocks model).
--
-- A daily report is a dated, authored record that contains one or more Daily OKR
-- blocks. Each block carries its own 今日 O, exactly one linked quarterly KR the
-- author OWNS, recorded hours, an optional result, and one or more 今日 KR.
-- Total hours are the sum of the block hours.
--
-- The legacy single-O daily-report columns (daily_reports.project_id /
-- objective_id, daily_report_revision_krs, daily_objectives, daily_key_results)
-- are retained losslessly but become inert; blocks are the source of truth.

-- ---------------------------------------------------------------------------
-- Header: a daily report may span multiple Objectives/KRs, so the legacy single
-- project/objective pointers become nullable.
-- ---------------------------------------------------------------------------
alter table public.daily_reports
  alter column project_id drop not null,
  alter column objective_id drop not null;

-- ---------------------------------------------------------------------------
-- Daily OKR blocks.
-- ---------------------------------------------------------------------------
create table public.daily_okr_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_id uuid not null references public.daily_report_revisions(id) on delete cascade,
  position integer not null check (position > 0),
  daily_objective text not null check (length(trim(daily_objective)) > 0),
  linked_key_result_id uuid references public.key_results(id) on delete set null,
  hours numeric(5, 2) not null check (hours between 0 and 24),
  result text not null default '',
  key_results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (revision_id, position)
);

alter table public.daily_okr_blocks
  add constraint daily_okr_blocks_organization_report_fkey
    foreign key (organization_id, report_id) references public.daily_reports (organization_id, id),
  add constraint daily_okr_blocks_organization_revision_fkey
    foreign key (organization_id, revision_id) references public.daily_report_revisions (organization_id, id),
  add constraint daily_okr_blocks_organization_linked_key_result_fkey
    foreign key (organization_id, linked_key_result_id) references public.key_results (organization_id, id);

create trigger set_daily_okr_blocks_updated_at before update on public.daily_okr_blocks
for each row execute function public.set_updated_at();

alter table public.daily_okr_blocks enable row level security;
alter table public.daily_okr_blocks force row level security;

-- ---------------------------------------------------------------------------
-- Report-scoped read visibility helper.
-- ---------------------------------------------------------------------------
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
      and (
        dr.author_id = auth.uid()
        or private.has_role('management')
        or exists (
          select 1
          from public.daily_okr_blocks dob
          join public.key_results kr on kr.id = dob.linked_key_result_id
          join public.objectives o on o.id = kr.objective_id
          where dob.report_id = dr.id
            and o.owner_id = auth.uid()
        )
      )
  )
$$;

-- A block is readable by its author, management, or the project leader of the
-- Objective under the linked quarterly KR (project-scoped, per Phase 4 §22).
create policy daily_okr_blocks_read on public.daily_okr_blocks for select to authenticated
using (
  organization_id = private.current_organization_id()
  and (
    exists (select 1 from public.daily_reports dr where dr.id = report_id and dr.author_id = auth.uid())
    or private.has_role('management')
    or exists (
      select 1
      from public.key_results kr
      join public.objectives o on o.id = kr.objective_id
      where kr.id = linked_key_result_id
        and o.owner_id = auth.uid()
    )
  )
);

drop policy if exists reports_read on public.daily_reports;
create policy reports_read on public.daily_reports for select to authenticated
using (private.can_read_report_detail(id));

revoke all on table public.daily_okr_blocks from public, anon, authenticated;
grant select on table public.daily_okr_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- Daily report RPCs — blocks model.
-- ---------------------------------------------------------------------------
drop function if exists public.create_daily_report(uuid, uuid, date, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb);
drop function if exists public.update_daily_report(uuid, integer, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb);

create or replace function public.create_daily_report(
  p_report_date date,
  p_status public.report_status,
  p_classification public.classification,
  p_blocks jsonb,
  p_evidence_links jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  report_id uuid := gen_random_uuid();
  revision_id uuid := gen_random_uuid();
  item jsonb;
  kr_item jsonb;
  item_position integer := 0;
  first_linked_kr uuid;
  resolved_objective_id uuid;
  resolved_project_id uuid;
  block_hours numeric;
  resolved_total numeric := 0;
  linked_kr uuid;
  kr_title text;
begin
  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_evidence_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Daily report collections must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_blocks) = 0 then
    raise exception 'Daily report requires at least one Daily OKR block' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Daily report classification exceeds user clearance' using errcode = '42501';
  end if;

  target_org := private.current_organization_id();
  if target_org is null then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;

  -- Validate every block and resolve its linked KR to an owned KR only.
  for item in select value from jsonb_array_elements(p_blocks) loop
    if length(trim(coalesce(item->>'dailyObjective', ''))) = 0 then
      raise exception 'Daily O is required for every block' using errcode = '22023';
    end if;
    linked_kr := nullif(item->>'linkedKeyResultId', '')::uuid;
    if linked_kr is null or not private.is_kr_owner(linked_kr) then
      raise exception 'Daily OKR must link to a Key Result you own' using errcode = '42501';
    end if;
    block_hours := nullif(item->>'hours', '')::numeric;
    if block_hours is null or block_hours < 0 or block_hours > 24 then
      raise exception 'Daily OKR block hours must be between 0 and 24' using errcode = '22023';
    end if;
    resolved_total := resolved_total + block_hours;

    if item_position = 0 then
      first_linked_kr := linked_kr;
    end if;

    if coalesce(jsonb_typeof(item->'keyResults'), 'null') <> 'array'
      or jsonb_array_length(item->'keyResults') = 0 then
      raise exception 'Each Daily OKR block requires at least one Daily KR' using errcode = '22023';
    end if;
    for kr_item in select value from jsonb_array_elements(item->'keyResults') loop
      kr_title := kr_item->>'title';
      if length(trim(coalesce(kr_title, ''))) = 0 then
        raise exception 'Daily KR content is required' using errcode = '22023';
      end if;
    end loop;
    item_position := item_position + 1;
  end loop;

  select kr.objective_id, kr.project_id into resolved_objective_id, resolved_project_id
  from public.key_results kr
  where kr.id = first_linked_kr
    and kr.organization_id = target_org;

  insert into public.daily_reports (
    id, organization_id, author_id, project_id, objective_id, report_date,
    status, classification, total_hours, current_revision
  ) values (
    report_id, target_org, auth.uid(), resolved_project_id, resolved_objective_id, p_report_date,
    p_status, p_classification, resolved_total, 0
  );

  insert into public.daily_report_revisions (
    id, organization_id, report_id, revision_number, editor_id,
    daily_objective, objective_progress, classification
  ) values (
    revision_id, target_org, report_id, 1, auth.uid(),
    coalesce(p_blocks->0->>'dailyObjective', ''), 0, p_classification
  );

  item_position := 0;
  for item in select value from jsonb_array_elements(p_blocks) loop
    item_position := item_position + 1;
    insert into public.daily_okr_blocks (
      organization_id, report_id, revision_id, position, daily_objective,
      linked_key_result_id, hours, result, key_results
    ) values (
      target_org, report_id, revision_id, item_position, item->>'dailyObjective',
      nullif(item->>'linkedKeyResultId', '')::uuid, (item->>'hours')::numeric,
      coalesce(item->>'result', ''), coalesce(item->'keyResults', '[]'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_evidence_links, '[]'::jsonb)) loop
    insert into public.report_evidence_links (
      organization_id, report_id, revision_id, url, label, classification
    ) values (
      target_org, report_id, revision_id, item->>'url', item->>'label',
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
  p_blocks jsonb,
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
  kr_item jsonb;
  item_position integer := 0;
  block_hours numeric;
  resolved_total numeric := 0;
  linked_kr uuid;
  kr_title text;
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
  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_evidence_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Daily report collections must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_blocks) = 0 then
    raise exception 'Daily report requires at least one Daily OKR block' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_blocks) loop
    if length(trim(coalesce(item->>'dailyObjective', ''))) = 0 then
      raise exception 'Daily O is required for every block' using errcode = '22023';
    end if;
    linked_kr := nullif(item->>'linkedKeyResultId', '')::uuid;
    if linked_kr is null or not private.is_kr_owner(linked_kr) then
      raise exception 'Daily OKR must link to a Key Result you own' using errcode = '42501';
    end if;
    block_hours := nullif(item->>'hours', '')::numeric;
    if block_hours is null or block_hours < 0 or block_hours > 24 then
      raise exception 'Daily OKR block hours must be between 0 and 24' using errcode = '22023';
    end if;
    resolved_total := resolved_total + block_hours;
    if coalesce(jsonb_typeof(item->'keyResults'), 'null') <> 'array'
      or jsonb_array_length(item->'keyResults') = 0 then
      raise exception 'Each Daily OKR block requires at least one Daily KR' using errcode = '22023';
    end if;
    for kr_item in select value from jsonb_array_elements(item->'keyResults') loop
      kr_title := kr_item->>'title';
      if length(trim(coalesce(kr_title, ''))) = 0 then
        raise exception 'Daily KR content is required' using errcode = '22023';
      end if;
    end loop;
  end loop;

  next_revision := target.current_revision + 1;

  insert into public.daily_report_revisions (
    id, organization_id, report_id, revision_number, editor_id,
    daily_objective, objective_progress, classification
  ) values (
    revision_id, target.organization_id, target.id, next_revision, auth.uid(),
    coalesce(p_blocks->0->>'dailyObjective', ''), 0, p_classification
  );

  item_position := 0;
  for item in select value from jsonb_array_elements(p_blocks) loop
    item_position := item_position + 1;
    insert into public.daily_okr_blocks (
      organization_id, report_id, revision_id, position, daily_objective,
      linked_key_result_id, hours, result, key_results
    ) values (
      target.organization_id, target.id, revision_id, item_position, item->>'dailyObjective',
      nullif(item->>'linkedKeyResultId', '')::uuid, (item->>'hours')::numeric,
      coalesce(item->>'result', ''), coalesce(item->'keyResults', '[]'::jsonb)
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
    total_hours = resolved_total,
    current_revision = next_revision
  where id = target.id;
  return next_revision;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attachment flow wrappers (blocks model).
-- ---------------------------------------------------------------------------
drop function if exists public.begin_daily_report_with_attachments(uuid, uuid, date, public.report_status, public.classification, numeric);
drop function if exists public.update_daily_report_with_attachments(uuid, integer, public.report_status, public.classification, numeric, text, numeric, jsonb, jsonb);

create or replace function public.begin_daily_report_with_attachments(
  p_report_date date,
  p_status public.report_status,
  p_classification public.classification
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  report_id uuid := gen_random_uuid();
begin
  target_organization_id := private.current_organization_id();
  if target_organization_id is null or not private.has_clearance(p_classification) then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  insert into public.daily_reports(id, organization_id, author_id, report_date, status, classification, total_hours, current_revision)
  values(report_id, target_organization_id, auth.uid(), p_report_date, p_status, p_classification, 0, 0);
  return report_id;
end;
$$;

create or replace function public.update_daily_report_with_attachments(
  p_report_id uuid,
  p_expected_revision integer,
  p_status public.report_status,
  p_classification public.classification,
  p_blocks jsonb,
  p_evidence_links jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision integer;
  new_revision_id uuid;
begin
  if exists (select 1 from public.report_attachments where report_id = p_report_id and uploader_id = auth.uid() and revision_id is null and state = 'pending') then
    raise exception 'All report attachments must finish uploading before revision submission' using errcode = '55000';
  end if;
  next_revision := public.update_daily_report(p_report_id, p_expected_revision, p_status, p_classification, p_blocks, p_evidence_links);
  select id into new_revision_id from public.daily_report_revisions where report_id = p_report_id and revision_number = next_revision;
  update public.report_attachments set revision_id = new_revision_id where report_id = p_report_id and uploader_id = auth.uid() and revision_id is null and state = 'uploaded';
  return next_revision;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.create_daily_report(date, public.report_status, public.classification, jsonb, jsonb) from public, anon;
revoke all on function public.update_daily_report(uuid, integer, public.report_status, public.classification, jsonb, jsonb) from public, anon;
revoke all on function public.begin_daily_report_with_attachments(date, public.report_status, public.classification) from public, anon;
revoke all on function public.update_daily_report_with_attachments(uuid, integer, public.report_status, public.classification, jsonb, jsonb) from public, anon;

grant execute on function public.create_daily_report(date, public.report_status, public.classification, jsonb, jsonb) to authenticated;
grant execute on function public.update_daily_report(uuid, integer, public.report_status, public.classification, jsonb, jsonb) to authenticated;
grant execute on function public.begin_daily_report_with_attachments(date, public.report_status, public.classification) to authenticated;
grant execute on function public.update_daily_report_with_attachments(uuid, integer, public.report_status, public.classification, jsonb, jsonb) to authenticated;
