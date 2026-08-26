-- The optional-KR save rewrite (202608270001) replaced the hardened
-- `save_daily_report` and dropped two guards the upload lifecycle depends on:
--
--   1. the author-status guard that stops an author forging `confirmed`, and
--   2. the unassociated-attachment guard that refuses submission while the
--      upload session still owns cleanup targets (errcode 55000).
--
-- `begin_daily_report_upload_session` kept its own status guard, so the save
-- path is where both regressions live. Restore both on the public save entry
-- points, ahead of block-project resolution, so the rejections happen before any
-- other validation.

-- 6-arg overload (upload session path) — the browser-callable entry point.
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
  target_org uuid := private.current_organization_id();
  saved_report_id uuid;
  saved_revision integer;
  item jsonb;
  requested_attachment_ids uuid[] := '{}'::uuid[];
begin
  if p_status is null or p_status not in ('draft'::public.report_status, 'submitted'::public.report_status) then
    raise exception 'Authors cannot confirm daily reports' using errcode = '42501';
  end if;

  if target_org is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;

  select coalesce(array_agg((attachment.value->>'attachmentId')::uuid), '{}'::uuid[])
  into requested_attachment_ids
  from jsonb_array_elements(p_blocks) block(value)
  cross join lateral jsonb_array_elements(coalesce(block.value->'attachments', '[]'::jsonb)) attachment(value)
  where nullif(attachment.value->>'attachmentId', '') is not null;

  -- Preserve the inner function's ordering: a locked report is rejected before
  -- any orphan/attachment validation, so a confirmed report never surfaces a
  -- cleanup error instead.
  if exists (
    select 1
    from public.daily_reports report
    where report.organization_id = target_org
      and report.author_id = auth.uid()
      and report.report_date = p_report_date
      and not private.daily_report_is_editable(report.id, auth.uid(), (timezone('Asia/Shanghai', now()))::date)
  ) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  -- Serialize against concurrent saves and refuse submission while the active
  -- session still owns uploaded attachments the caller did not reference.
  perform 1
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = target_org
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update of session;

  if exists (
    select 1
    from public.report_attachments attachment
    where attachment.upload_session_id = p_upload_session_id
      and attachment.organization_id = target_org
      and attachment.uploader_id = auth.uid()
      and attachment.revision_id is null
      and attachment.daily_okr_block_id is null
      and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
      and not (attachment.id = any(requested_attachment_ids))
  ) then
    raise exception 'Upload session has unassociated attachments requiring cleanup' using errcode = '55000';
  end if;

  for item in select value from jsonb_array_elements(p_blocks) loop
    perform private.resolve_daily_report_block_project(
      target_org,
      auth.uid(),
      nullif(item->>'linkedKeyResultId', '')::uuid,
      nullif(item->>'projectId', '')::uuid
    );
  end loop;

  select saved.report_id, saved.revision
  into saved_report_id, saved_revision
  from public.save_daily_report_without_block_projects_20260827(
    p_report_date, p_status, p_classification, p_blocks,
    p_upload_session_id, p_evidence_links
  ) saved;

  with resolved_blocks as (
    select item_with_position.ordinality::integer as position,
      private.resolve_daily_report_block_project(
        target_org,
        auth.uid(),
        nullif(item_with_position.value->>'linkedKeyResultId', '')::uuid,
        nullif(item_with_position.value->>'projectId', '')::uuid
      ) as project_id
    from jsonb_array_elements(p_blocks) with ordinality item_with_position(value, ordinality)
  )
  update public.daily_okr_blocks block
  set project_id = resolved.project_id
  from public.daily_report_revisions report_revision, resolved_blocks resolved
  where report_revision.report_id = saved_report_id
    and report_revision.revision_number = saved_revision
    and block.report_id = saved_report_id
    and block.revision_id = report_revision.id
    and block.position = resolved.position;

  return query select saved_report_id, saved_revision;
end;
$$;

revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb)
  from public, anon;
grant execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb)
  to authenticated;

-- 5-arg overload (legacy no-session path) — kept unavailable to browser clients,
-- but guarded for the trusted paths that SET ROLE and call it directly.
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
  target_org uuid := private.current_organization_id();
  saved_report_id uuid;
  saved_revision integer;
  item jsonb;
begin
  if p_status is null or p_status not in ('draft'::public.report_status, 'submitted'::public.report_status) then
    raise exception 'Authors cannot confirm daily reports' using errcode = '42501';
  end if;

  if target_org is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;

  for item in select value from jsonb_array_elements(p_blocks) loop
    perform private.resolve_daily_report_block_project(
      target_org, auth.uid(),
      nullif(item->>'linkedKeyResultId', '')::uuid,
      nullif(item->>'projectId', '')::uuid
    );
  end loop;

  select saved.report_id, saved.revision
  into saved_report_id, saved_revision
  from public.save_daily_report_without_block_projects_legacy_20260827(
    p_report_date, p_status, p_classification, p_blocks, p_evidence_links
  ) saved;

  with resolved_blocks as (
    select item_with_position.ordinality::integer as position,
      private.resolve_daily_report_block_project(
        target_org, auth.uid(),
        nullif(item_with_position.value->>'linkedKeyResultId', '')::uuid,
        nullif(item_with_position.value->>'projectId', '')::uuid
      ) as project_id
    from jsonb_array_elements(p_blocks) with ordinality item_with_position(value, ordinality)
  )
  update public.daily_okr_blocks block
  set project_id = resolved.project_id
  from public.daily_report_revisions report_revision, resolved_blocks resolved
  where report_revision.report_id = saved_report_id
    and report_revision.revision_number = saved_revision
    and block.report_id = saved_report_id
    and block.revision_id = report_revision.id
    and block.position = resolved.position;

  return query select saved_report_id, saved_revision;
end;
$$;

revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
