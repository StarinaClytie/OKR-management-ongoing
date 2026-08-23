-- Daily-report uploads are authorized by short-lived, server-created sessions.
-- The session is the authority binding a pending Storage object to its report,
-- author, organization, and eventual report revision.

create table if not exists public.daily_report_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'abandoned', 'completed')),
  created_at timestamptz not null default timezone('utc', now()),
  abandoned_at timestamptz,
  completed_at timestamptz,
  unique (organization_id, report_id, id),
  foreign key (organization_id, report_id) references public.daily_reports (organization_id, id) on delete cascade,
  foreign key (organization_id, author_id) references public.profiles (organization_id, id) on delete restrict,
  check (
    (status = 'active' and abandoned_at is null and completed_at is null)
    or (status = 'abandoned' and abandoned_at is not null and completed_at is null)
    or (status = 'completed' and completed_at is not null and abandoned_at is null)
  )
);

alter table public.daily_report_upload_sessions enable row level security;
alter table public.daily_report_upload_sessions force row level security;

alter table public.report_attachments
  add column if not exists upload_session_id uuid references public.daily_report_upload_sessions(id) on delete restrict;

create index if not exists report_attachments_upload_session_id_idx
  on public.report_attachments (upload_session_id)
  where state in ('pending', 'uploaded');

create index if not exists daily_report_upload_sessions_author_report_status_idx
  on public.daily_report_upload_sessions (author_id, report_id, status);

create or replace function private.daily_report_is_editable(
  report_id uuid,
  actor_id uuid,
  business_date date
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
    where report.id = report_id
      and report.organization_id = private.current_organization_id()
      and report.author_id = actor_id
      and report.report_date = business_date
      and report.status <> 'confirmed'
  )
$$;

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

  -- Lock every active session before deciding whether a refresh can resume a
  -- recoverable one. A session with finalized uploads remains authoritative:
  -- returning it keeps its attachment identities submittable after reload.
  perform 1
  from public.daily_report_upload_sessions session
  where session.organization_id = target_org
    and session.report_id = target_report.id
    and session.author_id = auth.uid()
    and session.status = 'active'
  for update;

  -- Finalization locks an attachment row. Lock pending rows before the
  -- recoverability scan so it either commits first (and is resumed as
  -- uploaded) or is rejected after this transaction retires the session.
  perform 1
  from public.report_attachments attachment
  join public.daily_report_upload_sessions session
    on session.id = attachment.upload_session_id
  where attachment.organization_id = target_org
    and attachment.report_id = target_report.id
    and attachment.uploader_id = auth.uid()
    and attachment.state = 'pending'
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
        and attachment.state = 'uploaded'
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

  update public.report_attachments attachment
  set state = 'deleted'
  where attachment.upload_session_id = target_session.id
    and attachment.organization_id = target_session.organization_id
    and attachment.report_id = target_session.report_id
    and attachment.uploader_id = auth.uid()
    and attachment.state = 'pending';

  update public.daily_report_upload_sessions
  set status = 'abandoned', abandoned_at = timezone('utc', now())
  where id = target_session.id;
end;
$$;

create or replace function public.begin_entry_attachment_upload(
  p_report_id uuid,
  p_upload_session_id uuid,
  p_entry_position integer,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer,
  p_classification public.classification,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.daily_report_upload_sessions%rowtype;
  attachment_id uuid := gen_random_uuid();
  safe_name text;
  storage_name text;
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
  if not private.daily_report_is_editable(target_session.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
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
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'Attachment display name is invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;

  storage_name := format(
    'organization/%s/reports/%s/%s/%s',
    target_session.organization_id, target_session.report_id, attachment_id, safe_name
  );

  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, upload_session_id,
    original_name, display_name, storage_path, mime_type, byte_size,
    classification, state, entry_position
  ) values (
    attachment_id, target_session.organization_id, target_session.report_id, auth.uid(), target_session.id,
    safe_name, trim(p_display_name), storage_name, p_mime_type, p_byte_size,
    p_classification, 'pending', p_entry_position
  );

  return jsonb_build_object('id', attachment_id, 'path', storage_name, 'bucket', 'report-attachments');
end;
$$;

create or replace function private.can_insert_attachment_object(
  object_name text,
  object_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_attachments attachment
    join public.daily_report_upload_sessions session
      on session.id = attachment.upload_session_id
     and session.organization_id = attachment.organization_id
     and session.report_id = attachment.report_id
     and session.author_id = attachment.uploader_id
    where attachment.storage_path = object_name
      and attachment.organization_id = private.current_organization_id()
      and attachment.uploader_id = auth.uid()
      and attachment.state = 'pending'
      and session.status = 'active'
      and private.daily_report_is_editable(
        attachment.report_id,
        auth.uid(),
        (timezone('Asia/Shanghai', now()))::date
      )
  )
$$;

create or replace function public.finalize_attachment_upload(
  p_attachment_id uuid,
  p_checksum text default null
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
    and attachment.state = 'pending'
    and session.status = 'active'
  for update of attachment;
  if not found then
    raise exception 'Pending attachment not found' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'report-attachments'
      and object.name = target.storage_path
      and object.owner_id = auth.uid()::text
      and coalesce((object.metadata->>'size')::integer, -1) = target.byte_size
      and object.metadata->>'mimetype' = target.mime_type
  ) then
    raise exception 'Uploaded object metadata does not match attachment' using errcode = '22023';
  end if;

  update public.report_attachments
  set state = 'uploaded', checksum = nullif(p_checksum, '')
  where id = target.id;

  return jsonb_build_object('id', target.id);
end;
$$;

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
      or linked_kr is null
      or (item->>'hours') is null
      or (item->>'hours')::numeric < 0
      or (item->>'hours')::numeric > 24 then
      raise exception 'Daily OKR entry fields are invalid' using errcode = '22023';
    end if;
    if not exists (
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
      (item->>'linkedKeyResultId')::uuid, trim(item->>'workDescription'),
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

create or replace function public.soft_delete_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_date date := (timezone('Asia/Shanghai', now()))::date;
  target public.report_attachments%rowtype;
begin
  select attachment.* into target
  from public.report_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.state in ('pending', 'uploaded', 'failed')
  for update;
  if not found then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
  if not private.daily_report_is_editable(target.report_id, auth.uid(), business_date) then
    raise exception 'Daily report is locked' using errcode = '42501';
  end if;
  if target.upload_session_id is null or target.revision_id is not null or target.daily_okr_block_id is not null then
    raise exception 'Attachment is not available for deletion' using errcode = '42501';
  end if;
  update public.report_attachments set state = 'deleted' where id = target.id;
end;
$$;

create or replace function public.authorize_attachment_revision_removal(p_attachment_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
  business_date date := (timezone('Asia/Shanghai', now()))::date;
begin
  select attachment.* into target
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

-- The session-aware overloads replace every browser-callable mutation path.
-- Legacy entry points remain in the applied history but are no longer callable
-- by authenticated clients, so they cannot bypass the lock/session boundary.
revoke all on function public.begin_attachment_upload(uuid, text, text, integer, public.classification) from public, anon, authenticated;
revoke all on function public.begin_entry_attachment_upload(uuid, integer, text, text, integer, public.classification) from public, anon, authenticated;
revoke all on function public.begin_entry_attachment_upload(uuid, integer, text, text, integer, public.classification, text) from public, anon, authenticated;
revoke all on function public.begin_daily_report_with_attachments(date, public.report_status, public.classification) from public, anon, authenticated;
revoke all on function public.create_daily_report(date, public.report_status, public.classification, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_daily_report(uuid, integer, public.report_status, public.classification, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_daily_report_with_attachments(uuid, integer, public.report_status, public.classification, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.replace_attachment(uuid, text, text, integer, public.classification) from public, anon, authenticated;

do $$
declare
  signature text;
  target regprocedure;
begin
  foreach signature in array array[
    'public.create_daily_report(uuid,uuid,date,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)',
    'public.update_daily_report(uuid,integer,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)',
    'public.begin_daily_report_with_attachments(uuid,uuid,date,public.report_status,public.classification,numeric)',
    'public.update_daily_report_with_attachments(uuid,integer,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)'
  ] loop
    target := to_regprocedure(signature);
    if target is not null then
      execute format('revoke all on function %s from public, anon, authenticated', target);
    end if;
  end loop;
end;
$$;

revoke all on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) from public, anon;
revoke all on function public.abandon_daily_report_upload_session(uuid) from public, anon;
revoke all on function public.begin_entry_attachment_upload(uuid, uuid, integer, text, text, integer, public.classification, text) from public, anon;
revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) from public, anon;
revoke all on function public.finalize_attachment_upload(uuid, text) from public, anon;
revoke all on function public.soft_delete_attachment(uuid) from public, anon;
revoke all on function public.authorize_attachment_revision_removal(uuid) from public, anon;
revoke all on function private.daily_report_is_editable(uuid, uuid, date) from public, anon;
revoke all on function private.can_insert_attachment_object(text, jsonb) from public, anon;

revoke insert, update, delete on public.daily_reports from authenticated;
revoke insert, update, delete on public.daily_report_revisions from authenticated;
revoke insert, update, delete on public.daily_report_revision_krs from authenticated;
revoke insert, update, delete on public.report_evidence_links from authenticated;
revoke insert, update, delete on public.report_attachments from authenticated;

grant execute on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) to authenticated;
grant execute on function public.abandon_daily_report_upload_session(uuid) to authenticated;
grant execute on function public.begin_entry_attachment_upload(uuid, uuid, integer, text, text, integer, public.classification, text) to authenticated;
grant execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.finalize_attachment_upload(uuid, text) to authenticated;
grant execute on function public.soft_delete_attachment(uuid) to authenticated;
grant execute on function public.authorize_attachment_revision_removal(uuid) to authenticated;
grant execute on function private.daily_report_is_editable(uuid, uuid, date) to authenticated;
grant execute on function private.can_insert_attachment_object(text, jsonb) to authenticated;
