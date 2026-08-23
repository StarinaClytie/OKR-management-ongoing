-- Keep an active upload session recoverable while it owns unassociated
-- attachment cleanup targets. In particular, Storage deletion happens after
-- metadata is marked deleted, so a refresh must return the same session until
-- the object has actually gone away and the session can be abandoned.
create or replace function public.begin_daily_report_upload_session(
  p_report_date date,
  p_status public.report_status,
  p_classification public.classification
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target_report public.daily_reports%rowtype;
  target_session_id uuid;
  resumable_session_id uuid;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  target_org := private.current_organization_id();
  if target_org is null or p_report_date is null or not private.has_clearance(p_classification) then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  if p_report_date <> business_date then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  insert into public.daily_reports (
    organization_id, author_id, report_date, status, classification, total_hours, current_revision
  ) values (
    target_org, auth.uid(), p_report_date, p_status, p_classification, 0, 0
  )
  on conflict (organization_id, author_id, report_date) do nothing;

  select * into target_report
  from public.daily_reports report
  where report.organization_id = target_org
    and report.author_id = auth.uid()
    and report.report_date = p_report_date
  for update;

  if not found or not private.daily_report_is_editable(target_report.id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  perform 1
  from public.daily_report_upload_sessions session
  where session.organization_id = target_org
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;

  -- Serialize session recovery with finalization, adoption, and destructive
  -- metadata cleanup. The subsequent Storage request is intentionally outside
  -- this transaction; a deleted row therefore keeps this session recoverable.
  perform 1
  from public.report_attachments attachment
  join public.daily_report_upload_sessions session
    on session.id = attachment.upload_session_id
  where attachment.organization_id = target_org
    and attachment.report_id = target_report.id
    and attachment.uploader_id = auth.uid()
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
    and session.organization_id = target_org
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update of attachment;

  select session.id into resumable_session_id
  from public.daily_report_upload_sessions session
  where session.organization_id = target_org
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
    and exists (
      select 1
      from public.report_attachments attachment
      where attachment.upload_session_id = session.id
        and attachment.organization_id = target_org
        and attachment.report_id = target_report.id
        and attachment.uploader_id = auth.uid()
        and (
          -- All unassociated rows are client cleanup targets. Resuming their
          -- owning session is required for the checked deletion RPC to retry.
          (
            attachment.revision_id is null
            and attachment.daily_okr_block_id is null
            and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
          )
          -- Preserve Task 1's refresh recovery for finalized evidence. This
          -- does not make associated evidence destructively cleanable.
          or attachment.state = 'uploaded'
        )
    )
  order by session.created_at desc, session.id desc
  limit 1;

  update public.report_attachments attachment
  set state = 'deleted'
  where attachment.organization_id = target_org
    and attachment.report_id = target_report.id
    and attachment.uploader_id = auth.uid()
    and attachment.state = 'pending'
    and attachment.upload_session_id in (
      select session.id
      from public.daily_report_upload_sessions session
      where session.organization_id = target_org
        and session.report_id = target_report.id
        and session.author_id = auth.uid()
        and session.status = 'active'
    )
    and (resumable_session_id is null or attachment.upload_session_id <> resumable_session_id);

  update public.daily_report_upload_sessions
  set status = 'abandoned', abandoned_at = timezone('utc', now())
  where organization_id = target_org
    and report_id = target_report.id
    and author_id = auth.uid()
    and status = 'active'
    and (resumable_session_id is null or id <> resumable_session_id);

  if resumable_session_id is not null then
    return jsonb_build_object('reportId', target_report.id, 'sessionId', resumable_session_id);
  end if;

  insert into public.daily_report_upload_sessions (organization_id, report_id, author_id)
  values (target_org, target_report.id, auth.uid())
  returning id into target_session_id;

  return jsonb_build_object('reportId', target_report.id, 'sessionId', target_session_id);
end;
$$;
