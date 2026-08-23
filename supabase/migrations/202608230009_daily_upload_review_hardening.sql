-- Close the final daily-report upload/review authorization and recovery gaps.
-- Author writes, reviewer confirmation, and temporary upload cleanup deliberately
-- use separate RPCs so a locked report cannot be edited but its orphaned bytes can
-- still be removed safely.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_attachments'::regclass
      and conname = 'report_attachments_upload_session_subject_fkey'
  ) then
    alter table public.report_attachments
      add constraint report_attachments_upload_session_subject_fkey
      foreign key (organization_id, report_id, upload_session_id)
      references public.daily_report_upload_sessions (organization_id, report_id, id)
      on delete restrict
      not valid;
  end if;
end;
$$;

-- NOT VALID still enforces every new/changed row, while avoiding a deployment
-- outage if an older environment contains a pre-hardening mismatched link. A
-- production data audit can validate it separately after any legacy repair.

-- Preserve the deployed implementation behind an inaccessible internal entry
-- point. The wrapper below adds author-status and orphan checks while retaining
-- the already-reviewed atomic revision writer.
do $$
begin
  if to_regprocedure('public.begin_daily_report_upload_session_impl_20260823(date,public.report_status,public.classification)') is null then
    execute 'alter function public.begin_daily_report_upload_session(date, public.report_status, public.classification) rename to begin_daily_report_upload_session_impl_20260823';
  end if;
end;
$$;
revoke all on function public.begin_daily_report_upload_session_impl_20260823(date, public.report_status, public.classification)
  from public, anon, authenticated;

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
begin
  if p_status is null or p_status not in ('draft'::public.report_status, 'submitted'::public.report_status) then
    raise exception 'Authors cannot confirm daily reports' using errcode = '42501';
  end if;
  return public.begin_daily_report_upload_session_impl_20260823(
    p_report_date,
    'draft'::public.report_status,
    p_classification
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.save_daily_report_session_impl_20260823(date,public.report_status,public.classification,jsonb,uuid,jsonb)') is null then
    execute 'alter function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) rename to save_daily_report_session_impl_20260823';
  end if;
end;
$$;
revoke all on function public.save_daily_report_session_impl_20260823(
  date, public.report_status, public.classification, jsonb, uuid, jsonb
) from public, anon, authenticated;

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
  target_report public.daily_reports%rowtype;
  target_session public.daily_report_upload_sessions%rowtype;
  requested_attachment_ids uuid[] := '{}'::uuid[];
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  if p_status is null or p_status not in ('draft'::public.report_status, 'submitted'::public.report_status) then
    raise exception 'Authors cannot confirm daily reports' using errcode = '42501';
  end if;

  if jsonb_typeof(p_blocks) = 'array' then
    select coalesce(array_agg((attachment.value->>'attachmentId')::uuid), '{}'::uuid[])
    into requested_attachment_ids
    from jsonb_array_elements(p_blocks) block(value)
    cross join lateral jsonb_array_elements(coalesce(block.value->'attachments', '[]'::jsonb)) attachment(value)
    where nullif(attachment.value->>'attachmentId', '') is not null;
  end if;

  -- Global order for every operation that needs more than one mutable row:
  -- report -> upload session -> attachment.
  select report.* into target_report
  from public.daily_reports report
  where report.organization_id = target_org
    and report.author_id = auth.uid()
    and report.report_date = p_report_date
  for update;
  if not found or not private.daily_report_is_editable(target_report.id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  select session.* into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = target_report.organization_id
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;

  perform 1
  from public.report_attachments attachment
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
  order by attachment.id
  for update;

  if exists (
    select 1
    from public.report_attachments attachment
    where attachment.upload_session_id = target_session.id
      and attachment.organization_id = target_session.organization_id
      and attachment.report_id = target_session.report_id
      and attachment.uploader_id = auth.uid()
      and attachment.revision_id is null
      and attachment.daily_okr_block_id is null
      and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
      and not (attachment.id = any(requested_attachment_ids))
  ) then
    raise exception 'Upload session has unassociated attachments requiring cleanup' using errcode = '55000';
  end if;

  return query
  select saved.report_id, saved.revision
  from public.save_daily_report_session_impl_20260823(
    p_report_date,
    p_status,
    p_classification,
    p_blocks,
    p_upload_session_id,
    p_evidence_links
  ) saved;
end;
$$;

-- Keep the persisted-removal authorization as a read-only gate. The deployed
-- implementation selected a whole row into an otherwise-unused record.
create or replace function public.authorize_attachment_revision_removal(p_attachment_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  perform 1
  from public.report_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.state = 'uploaded'
    and private.daily_report_is_editable(attachment.report_id, auth.uid(), business_date);
  if not found then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;
end;
$$;

-- This lookup never inserts a report shell or upload session. It exists for a
-- refreshed editor/cancel path that needs to resume cleanup without mutation.
create or replace function public.find_daily_report_upload_session(p_report_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select jsonb_build_object('reportId', report.id, 'sessionId', session.id)
    from public.daily_reports report
    join public.daily_report_upload_sessions session
      on session.organization_id = report.organization_id
     and session.report_id = report.id
     and session.author_id = report.author_id
    where report.organization_id = private.current_organization_id()
      and report.author_id = auth.uid()
      and report.report_date = p_report_date
      and session.status = 'active'
    order by session.created_at desc, session.id desc
    limit 1
  )
$$;

-- Adoption previously locked session then report, opposite to begin/save.
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
  target_report public.daily_reports%rowtype;
  target_session public.daily_report_upload_sessions%rowtype;
  target_attachment public.report_attachments%rowtype;
  requested_attachment_id uuid;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select report.* into target_report
  from public.daily_reports report
  where report.id = p_report_id
    and report.organization_id = private.current_organization_id()
    and report.author_id = auth.uid()
  for update;
  if not found or not private.daily_report_is_editable(target_report.id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;

  select session.* into target_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = target_report.organization_id
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
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

-- Locked/expired reports reject content writes, but the author may still see
-- and delete only unassociated temporary artifacts owned by their active
-- session. Historical revision/block associations never qualify.
create or replace function public.list_daily_report_upload_session_cleanup(
  p_upload_session_id uuid
)
returns table(attachment_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select attachment.id
  from public.daily_report_upload_sessions session
  join public.daily_reports report
    on report.organization_id = session.organization_id
   and report.id = session.report_id
   and report.author_id = session.author_id
  join public.report_attachments attachment
    on attachment.upload_session_id = session.id
   and attachment.organization_id = session.organization_id
   and attachment.report_id = session.report_id
   and attachment.uploader_id = session.author_id
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.author_id = auth.uid()
    and session.status = 'active'
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
  order by attachment.created_at, attachment.id
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
  target_report public.daily_reports%rowtype;
  target_session public.daily_report_upload_sessions%rowtype;
  target public.report_attachments%rowtype;
begin
  select report.* into target_report
  from public.report_attachments attachment
  join public.daily_reports report
    on report.organization_id = attachment.organization_id
   and report.id = attachment.report_id
   and report.author_id = attachment.uploader_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
  for update of report;
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;

  select session.* into target_session
  from public.daily_report_upload_sessions session
  join public.report_attachments attachment on attachment.upload_session_id = session.id
  where attachment.id = p_attachment_id
    and session.organization_id = target_report.organization_id
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update of session;
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;

  select attachment.* into target
  from public.report_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    and attachment.state in ('pending', 'uploaded', 'failed', 'deleted')
  for update;
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
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
  candidate_session public.daily_report_upload_sessions%rowtype;
  target_report public.daily_reports%rowtype;
  target_session public.daily_report_upload_sessions%rowtype;
begin
  select session.* into candidate_session
  from public.daily_report_upload_sessions session
  where session.id = p_upload_session_id
    and session.organization_id = private.current_organization_id()
    and session.author_id = auth.uid()
    and session.status = 'active';
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;

  select report.* into target_report
  from public.daily_reports report
  where report.organization_id = candidate_session.organization_id
    and report.id = candidate_session.report_id
    and report.author_id = candidate_session.author_id
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;

  select session.* into target_session
  from public.daily_report_upload_sessions session
  where session.id = candidate_session.id
    and session.organization_id = target_report.organization_id
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;
  if not found then
    raise exception 'Upload session is not available' using errcode = '42501';
  end if;

  perform 1
  from public.report_attachments attachment
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
  order by attachment.id
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

create or replace function public.confirm_daily_report(
  p_report_id uuid,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.daily_reports%rowtype;
begin
  select report.* into target
  from public.daily_reports report
  where report.id = p_report_id
    and report.organization_id = private.current_organization_id()
  for update;
  if not found or target.author_id = auth.uid()
    or not (private.has_role('management') or private.is_project_leader(target.project_id)) then
    raise exception 'Only an authorized daily report reviewer can confirm this report' using errcode = '42501';
  end if;
  if not private.has_clearance(target.classification) then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
  end if;
  if target.current_revision <> p_expected_revision then
    raise exception 'Daily report revision conflict' using errcode = '40001';
  end if;
  if target.status <> 'submitted' then
    raise exception 'Only submitted daily reports can be confirmed' using errcode = '22023';
  end if;

  update public.daily_reports
  set status = 'confirmed'
  where id = target.id;
end;
$$;

revoke all on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) from public, anon;
revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) from public, anon;
revoke all on function public.find_daily_report_upload_session(date) from public, anon;
revoke all on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.list_daily_report_upload_session_cleanup(uuid) from public, anon;
revoke all on function public.delete_daily_report_upload_attachment(uuid) from public, anon;
revoke all on function public.abandon_daily_report_upload_session(uuid) from public, anon;
revoke all on function public.confirm_daily_report(uuid, integer) from public, anon;

grant execute on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) to authenticated;
grant execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.find_daily_report_upload_session(date) to authenticated;
grant execute on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.list_daily_report_upload_session_cleanup(uuid) to authenticated;
grant execute on function public.delete_daily_report_upload_attachment(uuid) to authenticated;
grant execute on function public.abandon_daily_report_upload_session(uuid) to authenticated;
grant execute on function public.confirm_daily_report(uuid, integer) to authenticated;
