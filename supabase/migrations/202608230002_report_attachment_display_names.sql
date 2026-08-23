-- Keep the immutable uploaded filename while persisting the user-editable
-- result/display name. Existing rows remain valid and read through the
-- original_name fallback in the application.

alter table public.report_attachments
  add column if not exists display_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_attachments_display_name_valid'
      and conrelid = 'public.report_attachments'::regclass
  ) then
    alter table public.report_attachments
      add constraint report_attachments_display_name_valid
      check (display_name is null or length(trim(display_name)) > 0);
  end if;
end;
$$;

-- Preserve the existing six-argument RPC for older clients. New clients use
-- this explicit seven-argument overload, so PostgREST can resolve it without
-- changing or dropping applied function history.
create or replace function public.begin_entry_attachment_upload(
  p_report_id uuid,
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
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'Attachment display name is invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Attachment classification exceeds user clearance' using errcode = '42501';
  end if;
  storage_name := format('organization/%s/reports/%s/%s/%s', target_report.organization_id, target_report.id, attachment_id, safe_name);
  insert into public.report_attachments (
    id, organization_id, report_id, uploader_id, original_name, display_name,
    storage_path, mime_type, byte_size, classification, state, entry_position
  ) values (
    attachment_id, target_report.organization_id, target_report.id, auth.uid(), safe_name, trim(p_display_name),
    storage_name, p_mime_type, p_byte_size, p_classification, 'pending', p_entry_position
  );
  return jsonb_build_object('id', attachment_id, 'path', storage_name, 'bucket', 'report-attachments');
end;
$$;

revoke all on function public.begin_entry_attachment_upload(uuid, integer, text, text, integer, public.classification, text) from public, anon;
grant execute on function public.begin_entry_attachment_upload(uuid, integer, text, text, integer, public.classification, text) to authenticated;
