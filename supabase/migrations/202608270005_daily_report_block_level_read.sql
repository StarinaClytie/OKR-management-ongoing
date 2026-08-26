-- Daily report read/review scope must follow each block's project attribution,
-- not the legacy report-level `project_id` summary. Before this change a project
-- leader who led the report's *summary* project could read and review every block
-- in the report, including blocks attributed to a project they do not lead — the
-- exact cross-project over-permission that per-block attribution was meant to
-- close.
--
-- The report-level field stays only as a legacy summary; block visibility is now:
--   * the block's author, management, or HR (unchanged report-level paths), or
--   * a project leader who leads `daily_okr_blocks.project_id`, or
--   * for historical blocks without a project, the owner of the linked KR's
--     Objective (the pre-block-attribution fallback).
--
-- No behavior changes for authors, management, HR, or the author-role review
-- exclusions already in place.

-- ---------------------------------------------------------------------------
-- Block-level read predicate, shared by the blocks RLS policy and the detail
-- RPC. Mirrors `private.can_review_daily_report_block` (which already scopes by
-- `block.project_id`) but for read access, without the reviewer-only guards.
-- ---------------------------------------------------------------------------
create or replace function private.can_read_daily_report_block(
  p_report_id uuid,
  p_block_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_okr_blocks block
    join public.daily_reports report
      on report.id = block.report_id
     and report.organization_id = block.organization_id
    where block.id = p_block_id
      and block.report_id = p_report_id
      and block.organization_id = private.current_organization_id()
      and private.has_clearance(report.classification)
      and (
        report.author_id = auth.uid()
        or private.has_role('management')
        or exists (
          select 1
          from public.projects project
          where project.id = block.project_id
            and project.organization_id = block.organization_id
            and project.leader_id = auth.uid()
        )
        or (
          block.project_id is null
          and exists (
            select 1
            from public.key_results key_result
            join public.objectives objective
              on objective.id = key_result.objective_id
             and objective.organization_id = key_result.organization_id
            where key_result.id = block.linked_key_result_id
              and key_result.organization_id = block.organization_id
              and objective.owner_id = auth.uid()
          )
        )
      )
  )
$$;

revoke all on function private.can_read_daily_report_block(uuid, uuid)
  from public, anon;
grant execute on function private.can_read_daily_report_block(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Report-scoped read visibility: author, management, or at least one readable
-- block. The old `report.project_id` and `kr_project.leader_id` branches are
-- dropped in favour of block-level attribution.
-- ---------------------------------------------------------------------------
create or replace function private.can_read_report_detail(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_reports report
    where report.id = target_report_id
      and report.organization_id = private.current_organization_id()
      and private.has_clearance(report.classification)
      and (
        report.author_id = auth.uid()
        or private.has_role('management')
        or exists (
          select 1
          from public.daily_okr_blocks block
          where block.report_id = report.id
            and block.organization_id = report.organization_id
            and private.can_read_daily_report_block(report.id, block.id)
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Blocks follow their own project attribution, not the report's summary field.
-- ---------------------------------------------------------------------------
drop policy if exists daily_okr_blocks_read on public.daily_okr_blocks;
create policy daily_okr_blocks_read on public.daily_okr_blocks for select to authenticated
using (
  private.can_read_daily_report_block(report_id, id)
);

-- ---------------------------------------------------------------------------
-- Review authority: management, or at least one block the reviewer may review.
-- The report-level `project_id` branch is removed.
-- ---------------------------------------------------------------------------
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
          from public.daily_okr_blocks block
          where block.organization_id = report.organization_id
            and block.report_id = report.id
            and block.revision_id = revision.id
            and private.can_review_daily_report_block(report.id, block.id, reviewer.id)
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Report detail: filter blocks by block-level read scope. `caller_leads_project`
-- (the report-level summary) is removed.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target record;
  caller_is_author boolean := false;
  caller_is_management boolean := false;
  caller_can_review boolean := false;
  visible_blocks jsonb := '[]'::jsonb;
  visible_comments jsonb := '[]'::jsonb;
begin
  select
    report.id,
    report.organization_id,
    report.author_id,
    report.project_id,
    report.report_date,
    report.status,
    report.total_hours,
    report.current_revision,
    revision.id as revision_id,
    author.display_name as author_name
  into target
  from public.daily_reports report
  join public.daily_report_revisions revision
    on revision.report_id = report.id
   and revision.organization_id = report.organization_id
   and revision.revision_number = report.current_revision
  join public.profiles author
    on author.id = report.author_id
   and author.organization_id = report.organization_id
  where report.id = p_report_id
    and report.organization_id = private.current_organization_id()
    and private.is_operational()
    and private.has_clearance(revision.classification);

  if not found then
    raise exception 'Daily report is not available' using errcode = '42501';
  end if;

  caller_is_author := target.author_id = auth.uid();
  caller_can_review := private.can_review_daily_report(target.id, auth.uid());
  caller_is_management := caller_can_review and private.has_role('management');

  if not caller_is_author and not caller_can_review then
    raise exception 'Daily report is not available' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', block.id,
        'dailyObjective', block.daily_objective,
        'keyResultId', block.linked_key_result_id,
        'keyResult', case
          when linked_key_result.id is null then null
          else jsonb_build_object(
            'id', linked_key_result.id,
            'title', linked_key_result.title,
            'description', coalesce(linked_key_result.notes, ''),
            'ownerId', linked_key_result.owner_id,
            'ownerName', coalesce(key_result_owner.display_name, '')
          )
        end,
        'workDescription', block.work_description,
        'hours', block.hours,
        'result', block.result,
        'keyResults', block.key_results,
        'attachments', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'attachmentId', association.attachment_id,
              'displayName', association.display_name,
              'classification', association.classification
            ) order by association.created_at, association.attachment_id
          )
          from public.report_attachment_revisions association
          join public.report_attachments attachment
            on attachment.id = association.attachment_id
           and attachment.organization_id = association.organization_id
           and attachment.report_id = association.report_id
          where association.organization_id = block.organization_id
            and association.report_id = block.report_id
            and association.revision_id = block.revision_id
            and association.daily_okr_block_id = block.id
            and attachment.state = 'uploaded'
            and private.has_clearance(association.classification)
            and private.has_clearance(attachment.classification)
        ), '[]'::jsonb)
      ) order by block.position
    ),
    '[]'::jsonb
  )
  into visible_blocks
  from public.daily_okr_blocks block
  left join public.key_results linked_key_result
    on linked_key_result.id = block.linked_key_result_id
   and linked_key_result.organization_id = block.organization_id
  left join public.profiles key_result_owner
    on key_result_owner.id = linked_key_result.owner_id
   and key_result_owner.organization_id = linked_key_result.organization_id
  where block.organization_id = target.organization_id
    and block.report_id = target.id
    and block.revision_id = target.revision_id
    and (
      caller_is_author
      or caller_is_management
      or private.can_read_daily_report_block(target.id, block.id)
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', comment.id,
        'reportId', comment.report_id,
        'authorId', comment.author_id,
        'authorName', comment_author.display_name,
        'body', comment.body,
        'createdAt', comment.created_at
      ) order by comment.created_at, comment.id
    ),
    '[]'::jsonb
  )
  into visible_comments
  from public.daily_report_comments comment
  join public.profiles comment_author
    on comment_author.id = comment.author_id
   and comment_author.organization_id = comment.organization_id
  where comment.organization_id = target.organization_id
    and comment.report_id = target.id;

  return jsonb_build_object(
    'id', target.id,
    'authorId', target.author_id,
    'authorName', target.author_name,
    'date', target.report_date,
    'status', target.status,
    'hours', target.total_hours,
    'currentRevision', target.current_revision,
    'blocks', visible_blocks,
    'comments', visible_comments,
    'canComment', caller_can_review,
    'canConfirm', caller_can_review and target.status = 'submitted'
  );
end;
$$;

revoke all on function public.get_daily_report_detail(uuid) from public, anon;
grant execute on function public.get_daily_report_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
