-- Authorize report evidence against the immutable revision/block association,
-- not the mutable classification on daily_reports' current aggregate.

create or replace function private.can_read_report_revision(target_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_report_revisions revision
    join public.daily_reports report
      on report.id = revision.report_id
     and report.organization_id = revision.organization_id
    where revision.id = target_revision_id
      and revision.organization_id = private.current_organization_id()
      and private.has_clearance(revision.classification)
      and (
        report.author_id = auth.uid()
        or private.has_role('management')
        or exists (
          select 1
          from public.daily_okr_blocks block
          join public.key_results key_result on key_result.id = block.linked_key_result_id
          join public.objectives objective on objective.id = key_result.objective_id
          where block.revision_id = revision.id
            and block.report_id = revision.report_id
            and block.organization_id = revision.organization_id
            and key_result.organization_id = revision.organization_id
            and objective.organization_id = revision.organization_id
            and objective.owner_id = auth.uid()
        )
      )
  )
$$;

create or replace function private.can_read_report_revision_block(
  target_revision_id uuid,
  target_block_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_report_revisions revision
    join public.daily_reports report
      on report.id = revision.report_id
     and report.organization_id = revision.organization_id
    join public.daily_okr_blocks block
      on block.id = target_block_id
     and block.organization_id = revision.organization_id
     and block.report_id = revision.report_id
     and block.revision_id = revision.id
    where revision.id = target_revision_id
      and revision.organization_id = private.current_organization_id()
      and private.has_clearance(revision.classification)
      and (
        report.author_id = auth.uid()
        or private.has_role('management')
        or exists (
          select 1
          from public.key_results key_result
          join public.objectives objective on objective.id = key_result.objective_id
          where key_result.id = block.linked_key_result_id
            and key_result.organization_id = revision.organization_id
            and objective.organization_id = revision.organization_id
            and objective.owner_id = auth.uid()
        )
      )
  )
$$;

create or replace function private.can_read_report_attachment(target_attachment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_attachments attachment
    where attachment.id = target_attachment_id
      and attachment.organization_id = private.current_organization_id()
      and attachment.state = 'uploaded'
      and private.has_clearance(attachment.classification)
      and (
        exists (
          select 1
          from public.report_attachment_revisions association
          where association.attachment_id = attachment.id
            and association.organization_id = attachment.organization_id
            and association.report_id = attachment.report_id
            and private.has_clearance(association.classification)
            and private.can_read_report_revision_block(association.revision_id, association.daily_okr_block_id)
        )
        or (
          not exists (
            select 1
            from public.report_attachment_revisions association
            where association.attachment_id = attachment.id
          )
          and (
            (
              attachment.revision_id is not null
              and (
                (
                  attachment.daily_okr_block_id is not null
                  and private.can_read_report_revision_block(attachment.revision_id, attachment.daily_okr_block_id)
                )
                or (
                  attachment.daily_okr_block_id is null
                  and private.can_read_report_revision(attachment.revision_id)
                )
              )
            )
            or (
              attachment.revision_id is null
              and attachment.daily_okr_block_id is null
              and attachment.uploader_id = auth.uid()
              and exists (
                select 1
                from public.daily_reports report
                where report.id = attachment.report_id
                  and report.organization_id = attachment.organization_id
                  and report.author_id = auth.uid()
                  and private.has_clearance(report.classification)
              )
            )
          )
        )
      )
  )
$$;

revoke all on function private.can_read_report_revision(uuid) from public, anon;
revoke all on function private.can_read_report_revision_block(uuid, uuid) from public, anon;
revoke all on function private.can_read_report_attachment(uuid) from public, anon;
grant execute on function private.can_read_report_revision(uuid) to authenticated;
grant execute on function private.can_read_report_revision_block(uuid, uuid) to authenticated;
grant execute on function private.can_read_report_attachment(uuid) to authenticated;

drop policy if exists report_attachment_revisions_read on public.report_attachment_revisions;
create policy report_attachment_revisions_read on public.report_attachment_revisions
for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and private.can_read_report_revision_block(revision_id, daily_okr_block_id)
  and exists (
    select 1
    from public.report_attachments attachment
    where attachment.id = attachment_id
      and attachment.organization_id = organization_id
      and attachment.report_id = report_id
      and attachment.state = 'uploaded'
      and private.has_clearance(attachment.classification)
  )
);

drop policy if exists attachments_read on public.report_attachments;
create policy attachments_read on public.report_attachments
for select to authenticated
using (private.can_read_report_attachment(id));

create or replace function public.create_attachment_download(p_attachment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.report_attachments%rowtype;
begin
  select attachment.* into target
  from public.report_attachments attachment
  where attachment.id = p_attachment_id
    and private.can_read_report_attachment(attachment.id);
  if not found then
    raise exception 'Attachment is not available' using errcode = '42501';
  end if;
  return jsonb_build_object('bucket', 'report-attachments', 'path', target.storage_path, 'expiresIn', 60);
end;
$$;

create or replace function private.can_read_attachment_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_attachments attachment
    where attachment.storage_path = object_name
      and private.can_read_report_attachment(attachment.id)
  )
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
begin
  select attachment.* into target
  from public.report_attachments attachment
  join public.daily_reports report on report.id = attachment.report_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = private.current_organization_id()
    and attachment.uploader_id = auth.uid()
    and attachment.state = 'uploaded'
    and report.author_id = auth.uid()
    and report.status <> 'confirmed';
  if not found then
    raise exception 'Attachment is not available for revision removal' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.report_attachment_revisions association
    join public.daily_report_revisions revision on revision.id = association.revision_id
    join public.daily_reports report on report.id = revision.report_id
    where association.attachment_id = target.id
      and report.id = target.report_id
      and revision.revision_number = report.current_revision
      and private.has_clearance(association.classification)
      and private.can_read_report_revision_block(association.revision_id, association.daily_okr_block_id)
  ) and not exists (
    select 1
    from public.daily_report_revisions revision
    join public.daily_reports report on report.id = revision.report_id
    where revision.id = target.revision_id
      and report.id = target.report_id
      and revision.revision_number = report.current_revision
      and target.daily_okr_block_id is not null
      and private.can_read_report_revision_block(revision.id, target.daily_okr_block_id)
  ) then
    raise exception 'Attachment is not part of the current report revision' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_attachment_download(uuid) from public, anon;
revoke all on function private.can_read_attachment_object(text) from public, anon;
revoke all on function public.authorize_attachment_revision_removal(uuid) from public, anon;
grant execute on function public.create_attachment_download(uuid) to authenticated;
grant execute on function private.can_read_attachment_object(text) to authenticated;
grant execute on function public.authorize_attachment_revision_removal(uuid) to authenticated;
