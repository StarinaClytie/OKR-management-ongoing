-- One report per organization/author/date, saved through an atomic upsert.
-- Daily OKR content and attachment ownership are scoped to each ordered entry.

alter table public.daily_okr_blocks
  add column if not exists work_description text not null default '',
  add column if not exists evidence_links jsonb not null default '[]'::jsonb;

alter table public.report_attachments
  add column if not exists entry_position integer check (entry_position > 0),
  add column if not exists daily_okr_block_id uuid references public.daily_okr_blocks(id) on delete set null;

create or replace function public.save_daily_report(
  p_report_date date,
  p_status public.report_status,
  p_classification public.classification,
  p_blocks jsonb,
  p_evidence_links jsonb default '[]'::jsonb
)
returns table(report_id uuid, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target public.daily_reports%rowtype;
  first_kr uuid;
  resolved_project_id uuid;
  resolved_objective_id uuid;
  resolved_total numeric := 0;
  next_revision integer;
  new_revision_id uuid := gen_random_uuid();
  item jsonb;
  item_position integer := 0;
  linked_kr uuid;
begin
  target_org := private.current_organization_id();
  if target_org is null or p_report_date is null or not private.has_clearance(p_classification) then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'Daily report requires at least one Daily OKR entry' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_blocks) loop
    linked_kr := nullif(item->>'linkedKeyResultId', '')::uuid;
    if length(trim(coalesce(item->>'dailyObjective', ''))) = 0
      or length(trim(coalesce(item->>'workDescription', ''))) = 0
      or length(trim(coalesce(item->>'result', ''))) = 0
      or linked_kr is null
      or (item->>'hours') is null
      or (item->>'hours')::numeric < 0
      or (item->>'hours')::numeric > 24 then
      raise exception 'Daily OKR entry fields are invalid' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.key_results kr
      where kr.id = linked_kr
        and kr.organization_id = target_org
        and private.is_kr_owner(kr.id)
    ) then
      raise exception 'Daily OKR Key Result is not available to the current user' using errcode = '42501';
    end if;
    first_kr := coalesce(first_kr, linked_kr);
    resolved_total := resolved_total + (item->>'hours')::numeric;
  end loop;

  select kr.project_id, kr.objective_id
  into resolved_project_id, resolved_objective_id
  from public.key_results kr where kr.id = first_kr;

  insert into public.daily_reports (
    organization_id, author_id, project_id, objective_id, report_date,
    status, classification, total_hours, current_revision
  ) values (
    target_org, auth.uid(), resolved_project_id, resolved_objective_id, p_report_date,
    p_status, p_classification, 0, 0
  )
  on conflict (organization_id, author_id, report_date) do nothing;

  select * into target
  from public.daily_reports dr
  where dr.organization_id = target_org
    and dr.author_id = auth.uid()
    and dr.report_date = p_report_date
  for update;

  if not found or target.status = 'confirmed' then
    raise exception 'Daily report is not editable by the current user' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.report_attachments a
    where a.report_id = target.id and a.uploader_id = auth.uid()
      and a.revision_id is null and a.state = 'pending'
  ) then
    raise exception 'All report attachments must finish uploading before submission' using errcode = '55000';
  end if;

  next_revision := target.current_revision + 1;
  insert into public.daily_report_revisions (
    id, organization_id, report_id, revision_number, editor_id,
    daily_objective, objective_progress, classification
  ) values (
    new_revision_id, target_org, target.id, next_revision, auth.uid(),
    p_blocks->0->>'dailyObjective', 0, p_classification
  );

  for item in select value from jsonb_array_elements(p_blocks) loop
    item_position := item_position + 1;
    insert into public.daily_okr_blocks (
      organization_id, report_id, revision_id, position, daily_objective,
      linked_key_result_id, work_description, hours, result, key_results, evidence_links
    ) values (
      target_org, target.id, new_revision_id, item_position, trim(item->>'dailyObjective'),
      (item->>'linkedKeyResultId')::uuid, trim(item->>'workDescription'),
      (item->>'hours')::numeric, trim(item->>'result'),
      jsonb_build_array(jsonb_build_object('title', trim(item->>'workDescription'))),
      coalesce(item->'evidenceLinks', '[]'::jsonb)
    );
  end loop;

  update public.report_attachments a
  set revision_id = new_revision_id,
      daily_okr_block_id = b.id
  from public.daily_okr_blocks b
  where a.report_id = target.id
    and a.uploader_id = auth.uid()
    and a.revision_id is null
    and a.state = 'uploaded'
    and b.revision_id = new_revision_id
    and b.position = a.entry_position;

  update public.daily_reports
  set project_id = resolved_project_id,
      objective_id = resolved_objective_id,
      status = p_status,
      classification = p_classification,
      total_hours = resolved_total,
      current_revision = next_revision
  where id = target.id;

  return query select target.id, next_revision;
end;
$$;

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
  target_org uuid;
  target_id uuid;
begin
  target_org := private.current_organization_id();
  if target_org is null or not private.has_clearance(p_classification) then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  insert into public.daily_reports (
    organization_id, author_id, report_date, status, classification, total_hours, current_revision
  ) values (target_org, auth.uid(), p_report_date, p_status, p_classification, 0, 0)
  on conflict (organization_id, author_id, report_date) do nothing;
  select id into target_id from public.daily_reports
  where organization_id = target_org and author_id = auth.uid() and report_date = p_report_date;
  if target_id is null then
    raise exception 'Daily report is not editable by the current user' using errcode = '42501';
  end if;
  return target_id;
end;
$$;

create or replace function public.begin_entry_attachment_upload(
  p_report_id uuid,
  p_entry_position integer,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer,
  p_classification public.classification
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report public.daily_reports%rowtype;
  attachment_id uuid := gen_random_uuid();
  safe_name text;
  storage_name text;
begin
  select * into target_report from public.daily_reports
  where id = p_report_id and author_id = auth.uid() and status in ('draft', 'submitted', 'returned');
  if not found then
    raise exception 'Report is not available for attachment upload' using errcode = '42501';
  end if;
  if p_entry_position < 1 then
    raise exception 'Daily OKR entry position is invalid' using errcode = '22023';
  end if;
  if p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'Attachment size must be between 1 and 10485760 bytes' using errcode = '22023';
  end if;
  safe_name := private.safe_attachment_name(p_original_name);
  if not private.attachment_type_allowed(safe_name, p_mime_type) then
    raise exception 'Unsupported attachment type' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;
  storage_name := format('organization/%s/reports/%s/%s/%s', target_report.organization_id, target_report.id, attachment_id, safe_name);
  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, original_name, storage_path,
    mime_type, byte_size, classification, state, entry_position
  ) values (
    attachment_id, target_report.organization_id, target_report.id, auth.uid(), safe_name,
    storage_name, p_mime_type, p_byte_size, p_classification, 'pending', p_entry_position
  );
  return jsonb_build_object('id', attachment_id, 'path', storage_name, 'bucket', 'report-attachments');
end;
$$;

revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb) from public, anon;
revoke all on function public.begin_entry_attachment_upload(uuid, integer, text, text, integer, public.classification) from public, anon;
grant execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb) to authenticated;
grant execute on function public.begin_entry_attachment_upload(uuid, integer, text, text, integer, public.classification) to authenticated;
