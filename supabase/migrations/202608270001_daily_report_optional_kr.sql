-- ---------------------------------------------------------------------------
-- Daily reports are authored work records; OKR/KR linkage is an optional tag.
--
-- Three changes:
--   1. `save_daily_report` / `create_daily_report` / `update_daily_report` no
--      longer require a linked quarterly KR per block, and only enforce
--      `is_kr_owner` when a KR is actually linked. A report with no linked KR
--      resolves to null `project_id`/`objective_id` (already nullable).
--   2. Management-authored reports never enter the review queue:
--      `can_review_daily_report(_block)` excludes them, so `confirm_daily_report`
--      refuses them too. Their status stays `submitted` (no auto-confirm).
-- ---------------------------------------------------------------------------

-- 1. Blocks-model daily report write paths -----------------------------------

create or replace function public.save_daily_report(
  p_report_date date,
  p_status public.report_status,
  p_classification public.classification,
  p_blocks jsonb,
  p_upload_session_id uuid,
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
  target_session public.daily_report_upload_sessions%rowtype;
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
  target_attachment public.report_attachments%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  target_org := private.current_organization_id();
  if target_org is null or p_report_date is null or not private.has_clearance(p_classification) then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  if p_report_date <> business_date then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'Daily report requires at least one Daily OKR entry' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_blocks) loop
    linked_kr := nullif(item->>'linkedKeyResultId', '')::uuid;
    if length(trim(coalesce(item->>'dailyObjective', ''))) = 0
      or length(trim(coalesce(item->>'workDescription', ''))) = 0
      or length(trim(coalesce(item->>'result', ''))) = 0
      or (item->>'hours') is null
      or (item->>'hours')::numeric < 0
      or (item->>'hours')::numeric > 24 then
      raise exception 'Daily OKR entry fields are invalid' using errcode = '22023';
    end if;
    if linked_kr is not null and not exists (
      select 1 from public.key_results key_result
      where key_result.id = linked_kr
        and key_result.organization_id = target_org
        and private.is_kr_owner(key_result.id)
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

  select key_result.project_id, key_result.objective_id
  into resolved_project_id, resolved_objective_id
  from public.key_results key_result
  where key_result.id = first_kr;

  insert into public.daily_reports (
    organization_id, author_id, project_id, objective_id, report_date,
    status, classification, total_hours, current_revision
  ) values (
    target_org, auth.uid(), resolved_project_id, resolved_objective_id, p_report_date,
    p_status, p_classification, 0, 0
  )
  on conflict (organization_id, author_id, report_date) do nothing;

  select * into target
  from public.daily_reports report
  where report.organization_id = target_org
    and report.author_id = auth.uid()
    and report.report_date = p_report_date
  for update;
  if not found or not private.daily_report_is_editable(target.id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  select * into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = target_org
    and session.report_id = target.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;

  foreach requested_attachment_id in array requested_attachment_ids loop
    select attachment.* into target_attachment
    from public.report_attachments attachment
    where attachment.id = requested_attachment_id
      and attachment.organization_id = target_org
      and attachment.report_id = target.id
      and attachment.uploader_id = auth.uid()
      and attachment.upload_session_id = target_session.id
      and attachment.state = 'uploaded'
    for update;
    if not found then
      raise exception 'Attachment is not available for this report revision' using errcode = '42501';
    end if;
    if not private.has_clearance(target_attachment.classification) then
      raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
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
      nullif(item->>'linkedKeyResultId', '')::uuid, trim(item->>'workDescription'),
      (item->>'hours')::numeric, trim(item->>'result'),
      jsonb_build_array(jsonb_build_object('title', trim(item->>'workDescription'))),
      coalesce(item->'evidenceLinks', '[]'::jsonb)
    )
    returning id into new_block_id;

    for attachment_item in select value from jsonb_array_elements(coalesce(item->'attachments', '[]'::jsonb)) loop
      requested_attachment_id := (attachment_item->>'attachmentId')::uuid;
      requested_classification := (attachment_item->>'classification')::public.classification;

      update public.report_attachments attachment
      set revision_id = new_revision_id,
          daily_okr_block_id = new_block_id,
          classification = case
            when private.classification_rank(requested_classification) > private.classification_rank(attachment.classification)
              then requested_classification
            else attachment.classification
          end
      where attachment.id = requested_attachment_id
        and attachment.upload_session_id = target_session.id
        and attachment.state = 'uploaded';

      insert into public.report_attachment_revisions (
        organization_id, report_id, revision_id, daily_okr_block_id,
        attachment_id, display_name, classification
      ) values (
        target_org, target.id, new_revision_id, new_block_id,
        requested_attachment_id, trim(attachment_item->>'displayName'), requested_classification
      );
    end loop;
  end loop;

  update public.daily_reports
  set project_id = resolved_project_id,
      objective_id = resolved_objective_id,
      status = p_status,
      classification = p_classification,
      total_hours = resolved_total,
      current_revision = next_revision
  where id = target.id;

  update public.daily_report_upload_sessions
  set status = 'completed', completed_at = timezone('utc', now())
  where id = target_session.id;

  return query select target.id, next_revision;
end;
$$;

-- Legacy blocks-model paths keep the same relaxed rule.

-- 5-arg save_daily_report overload (no upload session) — same relaxation.
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
      or (item->>'hours') is null
      or (item->>'hours')::numeric < 0
      or (item->>'hours')::numeric > 24 then
      raise exception 'Daily OKR entry fields are invalid' using errcode = '22023';
    end if;
    if linked_kr is not null and not exists (
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
      nullif(item->>'linkedKeyResultId', '')::uuid, trim(item->>'workDescription'),
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

  for item in select value from jsonb_array_elements(p_blocks) loop
    if length(trim(coalesce(item->>'dailyObjective', ''))) = 0 then
      raise exception 'Daily O is required for every block' using errcode = '22023';
    end if;
    linked_kr := nullif(item->>'linkedKeyResultId', '')::uuid;
    if linked_kr is not null and not private.is_kr_owner(linked_kr) then
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
    if linked_kr is not null and not private.is_kr_owner(linked_kr) then
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

-- 2. Management-authored reports stay out of the review queue -----------------

create or replace function private.can_review_daily_report_block(
  p_report_id uuid,
  p_block_id uuid,
  p_reviewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_reports report
    join public.daily_report_revisions revision
      on revision.report_id = report.id
     and revision.organization_id = report.organization_id
     and revision.revision_number = report.current_revision
    join public.daily_okr_blocks block
      on block.id = p_block_id
     and block.organization_id = report.organization_id
     and block.report_id = report.id
     and block.revision_id = revision.id
    join public.profiles reviewer
      on reviewer.id = p_reviewer_id
     and reviewer.organization_id = report.organization_id
    join public.user_roles reviewer_role
      on reviewer_role.profile_id = reviewer.id
     and reviewer_role.organization_id = reviewer.organization_id
     and reviewer_role.is_active
    where report.id = p_report_id
      and reviewer.is_active
      and reviewer.approval_status = 'approved'
      and report.author_id <> reviewer.id
      and not exists (
        select 1 from public.user_roles author_role
        where author_role.profile_id = report.author_id
          and author_role.organization_id = report.organization_id
          and author_role.role = 'management'
          and author_role.is_active
      )
      and private.classification_rank(reviewer.clearance)
        >= private.classification_rank(revision.classification)
      and (
        reviewer_role.role = 'management'
        or exists (
          select 1
          from public.key_results key_result
          join public.objectives objective
            on objective.id = key_result.objective_id
           and objective.organization_id = key_result.organization_id
          left join public.projects kr_project
            on kr_project.id = key_result.project_id
           and kr_project.organization_id = key_result.organization_id
          where key_result.id = block.linked_key_result_id
            and key_result.organization_id = report.organization_id
            and (objective.owner_id = reviewer.id or kr_project.leader_id = reviewer.id)
        )
      )
  )
$$;

create or replace function private.can_review_daily_report(
  p_report_id uuid,
  p_reviewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_reports report
    join public.daily_report_revisions revision
      on revision.report_id = report.id
     and revision.organization_id = report.organization_id
     and revision.revision_number = report.current_revision
    join public.profiles reviewer
      on reviewer.id = p_reviewer_id
     and reviewer.organization_id = report.organization_id
    join public.user_roles reviewer_role
      on reviewer_role.profile_id = reviewer.id
     and reviewer_role.organization_id = reviewer.organization_id
     and reviewer_role.is_active
    where report.id = p_report_id
      and reviewer.is_active
      and reviewer.approval_status = 'approved'
      and report.author_id <> reviewer.id
      and not exists (
        select 1 from public.user_roles author_role
        where author_role.profile_id = report.author_id
          and author_role.organization_id = report.organization_id
          and author_role.role = 'management'
          and author_role.is_active
      )
      and private.classification_rank(reviewer.clearance)
        >= private.classification_rank(revision.classification)
      and (
        reviewer_role.role = 'management'
        or exists (
          select 1
          from public.projects project
          where project.id = report.project_id
            and project.organization_id = report.organization_id
            and project.leader_id = reviewer.id
        )
        or exists (
          select 1
          from public.daily_okr_blocks block
          where block.organization_id = report.organization_id
            and block.report_id = report.id
            and block.revision_id = revision.id
            and private.can_review_daily_report_block(report.id, block.id, reviewer.id)
        )
      )
  )
$$;

revoke all on function private.can_review_daily_report_block(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_review_daily_report(uuid, uuid) from public, anon, authenticated;
