-- Preserve attachment metadata per immutable report revision. The uploaded file
-- row remains the storage/security identity; this table records how that file
-- is labelled, classified, and associated in each revision.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_okr_blocks_org_report_revision_id_key'
      and conrelid = 'public.daily_okr_blocks'::regclass
  ) then
    alter table public.daily_okr_blocks
      add constraint daily_okr_blocks_org_report_revision_id_key
      unique (organization_id, report_id, revision_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'report_attachments_org_report_id_key'
      and conrelid = 'public.report_attachments'::regclass
  ) then
    alter table public.report_attachments
      add constraint report_attachments_org_report_id_key
      unique (organization_id, report_id, id);
  end if;
end;
$$;

create table if not exists public.report_attachment_revisions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null,
  revision_id uuid not null,
  daily_okr_block_id uuid not null,
  attachment_id uuid not null,
  display_name text not null check (length(trim(display_name)) > 0),
  classification public.classification not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (revision_id, attachment_id),
  foreign key (organization_id, report_id, revision_id)
    references public.daily_report_revisions (organization_id, report_id, id) on delete cascade,
  foreign key (organization_id, report_id, revision_id, daily_okr_block_id)
    references public.daily_okr_blocks (organization_id, report_id, revision_id, id) on delete cascade,
  foreign key (organization_id, report_id, attachment_id)
    references public.report_attachments (organization_id, report_id, id) on delete restrict
);

alter table public.report_attachment_revisions enable row level security;
alter table public.report_attachment_revisions force row level security;

drop policy if exists report_attachment_revisions_read on public.report_attachment_revisions;
create policy report_attachment_revisions_read on public.report_attachment_revisions
for select to authenticated
using (
  private.has_clearance(classification)
  and private.can_read_report_detail(report_id)
  and exists (
    select 1 from public.report_attachments attachment
    where attachment.id = attachment_id
      and attachment.state = 'uploaded'
      and private.has_clearance(attachment.classification)
  )
);

revoke all on public.report_attachment_revisions from public, anon, authenticated;
grant select on public.report_attachment_revisions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'prevent_report_attachment_revision_mutation'
      and tgrelid = 'public.report_attachment_revisions'::regclass
  ) then
    create trigger prevent_report_attachment_revision_mutation
    before update or delete on public.report_attachment_revisions
    for each row execute function public.reject_daily_report_revision_mutation();
  end if;
end;
$$;

-- Backward-compatible history for attachments created before the association
-- table. The original file name remains the fallback when no display name was
-- stored by an older client.
insert into public.report_attachment_revisions (
  organization_id, report_id, revision_id, daily_okr_block_id,
  attachment_id, display_name, classification
)
select
  attachment.organization_id,
  attachment.report_id,
  attachment.revision_id,
  attachment.daily_okr_block_id,
  attachment.id,
  coalesce(nullif(trim(attachment.display_name), ''), attachment.original_name),
  attachment.classification
from public.report_attachments attachment
where attachment.revision_id is not null
  and attachment.daily_okr_block_id is not null
on conflict (revision_id, attachment_id) do nothing;

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
  new_block_id uuid;
  item jsonb;
  attachment_item jsonb;
  item_position integer := 0;
  linked_kr uuid;
  requested_attachment_id uuid;
  requested_attachment_ids uuid[] := '{}'::uuid[];
  requested_classification public.classification;
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
    if jsonb_typeof(coalesce(item->'attachments', '[]'::jsonb)) <> 'array' then
      raise exception 'Daily OKR attachment metadata must be an array' using errcode = '22023';
    end if;
    for attachment_item in select value from jsonb_array_elements(coalesce(item->'attachments', '[]'::jsonb)) loop
      requested_attachment_id := nullif(attachment_item->>'attachmentId', '')::uuid;
      requested_classification := nullif(attachment_item->>'classification', '')::public.classification;
      if requested_attachment_id is null
        or length(trim(coalesce(attachment_item->>'displayName', ''))) = 0
        or requested_classification is null then
        raise exception 'Daily OKR attachment metadata is invalid' using errcode = '22023';
      end if;
      if requested_attachment_id = any(requested_attachment_ids) then
        raise exception 'Daily OKR attachment metadata is duplicated' using errcode = '22023';
      end if;
      if not private.has_clearance(requested_classification) then
        raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
      end if;
      requested_attachment_ids := array_append(requested_attachment_ids, requested_attachment_id);
    end loop;
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

  -- Validate persisted attachment identities only after locking the report.
  foreach requested_attachment_id in array requested_attachment_ids loop
    perform 1
    from public.report_attachments attachment
    where attachment.id = requested_attachment_id
      and attachment.organization_id = target_org
      and attachment.report_id = target.id
      and attachment.uploader_id = auth.uid()
      and attachment.state = 'uploaded';
    if not found then
      raise exception 'Attachment is not available for this report revision' using errcode = '42501';
    end if;
  end loop;

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
    )
    returning id into new_block_id;

    for attachment_item in select value from jsonb_array_elements(coalesce(item->'attachments', '[]'::jsonb)) loop
      requested_attachment_id := (attachment_item->>'attachmentId')::uuid;
      requested_classification := (attachment_item->>'classification')::public.classification;
      insert into public.report_attachment_revisions (
        organization_id, report_id, revision_id, daily_okr_block_id,
        attachment_id, display_name, classification
      ) values (
        target_org, target.id, new_revision_id, new_block_id,
        requested_attachment_id, trim(attachment_item->>'displayName'), requested_classification
      );

      -- Never widen access to the stored object. Raising a revision's evidence
      -- classification raises the storage identity monotonically; lowering a
      -- display classification does not weaken download/storage RLS.
      update public.report_attachments attachment
      set classification = requested_classification
      where attachment.id = requested_attachment_id
        and private.classification_rank(requested_classification) > private.classification_rank(attachment.classification);
    end loop;
  end loop;

  update public.report_attachments attachment
  set revision_id = new_revision_id,
      daily_okr_block_id = block.id
  from public.daily_okr_blocks block
  where attachment.report_id = target.id
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null
    and attachment.state = 'uploaded'
    and block.revision_id = new_revision_id
    and block.position = attachment.entry_position;

  insert into public.report_attachment_revisions (
    organization_id, report_id, revision_id, daily_okr_block_id,
    attachment_id, display_name, classification
  )
  select
    attachment.organization_id,
    attachment.report_id,
    new_revision_id,
    attachment.daily_okr_block_id,
    attachment.id,
    coalesce(nullif(trim(attachment.display_name), ''), attachment.original_name),
    attachment.classification
  from public.report_attachments attachment
  where attachment.report_id = target.id
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id = new_revision_id
    and attachment.daily_okr_block_id is not null
    and attachment.state = 'uploaded'
  on conflict (revision_id, attachment_id) do nothing;

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

revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb) from public, anon;
grant execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb) to authenticated;
