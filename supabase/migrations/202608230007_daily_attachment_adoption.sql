-- Explicitly carry current-revision evidence into an edit upload session and
-- expose idempotent cleanup targets for browser-side Storage deletion.

create or replace function public.adopt_daily_report_revision_attachments(
  p_report_id uuid,
  p_upload_session_id uuid,
  p_attachment_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.daily_report_upload_sessions%rowtype;
  target_report public.daily_reports%rowtype;
  target_attachment public.report_attachments%rowtype;
  requested_attachment_id uuid;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.report_id = p_report_id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;

  select * into target_report
  from public.daily_reports report
  where report.id = target_session.report_id
    and report.organization_id = target_session.organization_id
    and report.author_id = auth.uid()
  for update;
  if not found or not private.daily_report_is_editable(target_report.id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_attachment_ids), 0) <> coalesce((
    select count(distinct attachment_id)
    from unnest(coalesce(p_attachment_ids, '{}'::uuid[])) attachment_id
  ), 0) then
    raise exception 'Daily report attachment metadata is duplicated' using errcode = '22023';
  end if;

  foreach requested_attachment_id in array coalesce(p_attachment_ids, '{}'::uuid[]) loop
    select attachment.* into target_attachment
    from public.report_attachments attachment
    where attachment.id = requested_attachment_id
      and attachment.organization_id = target_session.organization_id
      and attachment.report_id = target_session.report_id
      and attachment.uploader_id = auth.uid()
      and attachment.state = 'uploaded'
      and exists (
        select 1
        from public.report_attachment_revisions association
        join public.daily_report_revisions revision
          on revision.id = association.revision_id
         and revision.organization_id = association.organization_id
         and revision.report_id = association.report_id
        where association.organization_id = attachment.organization_id
          and association.report_id = attachment.report_id
          and association.attachment_id = attachment.id
          and revision.revision_number = target_report.current_revision
      )
    for update;
    if not found then
      raise exception 'Attachment is not available for adoption' using errcode = '42501';
    end if;
    if not private.has_clearance(target_attachment.classification) then
      raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
    end if;

    update public.report_attachments
    set upload_session_id = target_session.id
    where id = target_attachment.id;
  end loop;
end;
$$;

create or replace function public.list_daily_report_upload_session_cleanup(
  p_upload_session_id uuid
)
returns table(attachment_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_session public.daily_report_upload_sessions%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.author_id = auth.uid()
    and session.status = 'active';
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target_session.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  return query
  select attachment.id
  from public.report_attachments attachment
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    -- A metadata row is marked deleted before the Storage API call because
    -- the Storage DELETE policy authorizes only deleted/replaced rows. Keep
    -- it discoverable so a failed Storage request can retry the same path.
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
  order by attachment.created_at, attachment.id;
end;
$$;

create or replace function public.delete_daily_report_upload_attachment(
  p_attachment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select attachment.* into target
  from public.report_attachments attachment
  join public.daily_report_upload_sessions session
    on session.id = attachment.upload_session_id
   and session.organization_id = attachment.organization_id
   and session.report_id = attachment.report_id
   and session.author_id = attachment.uploader_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
    and session.status = 'active'
  for update of attachment;
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  update public.report_attachments
  set state = 'deleted'
  where id = target.id and state <> 'deleted';

  return jsonb_build_object(
    'id', target.id,
    'bucket', 'report-attachments',
    'path', target.storage_path
  );
end;
$$;

create or replace function public.abandon_daily_report_upload_session(p_upload_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.daily_report_upload_sessions%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select * into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target_session.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  perform 1
  from public.report_attachments attachment
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
  for update;

  update public.report_attachments attachment
  set state = 'deleted'
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    and attachment.state = 'pending';

  -- Metadata must be marked deleted before Storage RLS permits object
  -- deletion. Do not retire the session until the Storage catalog confirms
  -- that every unassociated deleted object's removal actually completed.
  if exists (
    select 1
    from public.report_attachments attachment
    join storage.objects object
      on object.bucket_id = 'report-attachments'
     and object.name = attachment.storage_path
    where attachment.upload_session_id = target_session.id
      and attachment.organization_id = target_session.organization_id
      and attachment.report_id = target_session.report_id
      and attachment.uploader_id = auth.uid()
      and attachment.revision_id is null
      and attachment.daily_okr_block_id is null
      and attachment.state = 'deleted'
  ) then
    return;
  end if;

  -- Finalized unassociated uploads remain recoverable until the client has
  -- explicitly deleted both metadata and the Storage object.
  if exists (
    select 1
    from public.report_attachments attachment
    where attachment.upload_session_id = target_session.id
      and attachment.organization_id = target_session.organization_id
      and attachment.report_id = target_session.report_id
      and attachment.uploader_id = auth.uid()
      and attachment.revision_id is null
      and attachment.daily_okr_block_id is null
      and attachment.state in ('uploaded', 'failed')
  ) then
    return;
  end if;

  update public.report_attachments attachment
  set upload_session_id = null
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
    and (attachment.revision_id is not null or attachment.daily_okr_block_id is not null);

  update public.daily_report_upload_sessions
  set status = 'abandoned', abandoned_at = timezone('utc', now())
  where id = target_session.id;
end;
$$;

revoke all on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.list_daily_report_upload_session_cleanup(uuid) from public, anon;
revoke all on function public.delete_daily_report_upload_attachment(uuid) from public, anon;

grant execute on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.list_daily_report_upload_session_cleanup(uuid) to authenticated;
grant execute on function public.delete_daily_report_upload_attachment(uuid) to authenticated;
