-- Daily report review scope for project leaders, and readable KR content in the
-- report detail payload.
--
-- Two defects are addressed here.
--
-- 1. "Project leader" was expressed in the daily-report boundary as *objective
--    ownership* only. `create_objective` seeds `objectives.owner_id` and
--    `projects.leader_id` from the same person, so the two agree at creation and
--    the narrower rule looked correct. They diverge the moment
--    `set_project_leader` runs: it rewrites `projects.leader_id` alone, leaving
--    the incoming leader unable to read or review their own members' reports.
--    `private.can_view_project_member` already treats `projects.leader_id` as
--    the definition of project leadership; the daily-report boundary now agrees.
--
-- 2. `get_daily_report_detail` returned `linked_key_result_id` as a bare uuid and
--    a `key_results` jsonb snapshot that holds a copy of the work description
--    (written by `save_daily_report`), so no caller could render the linked
--    quarterly KR. The detail payload now carries the joined KR row.
--
-- Also restores the `organization_id` predicate that
-- `private.can_read_report_detail` lost in 202608190004: without it the
-- `has_role('management')` branch matched reports in *any* organization.

-- ---------------------------------------------------------------------------
-- Report-scoped read visibility: author, management, project leader, or the
-- owner of the objective above the linked quarterly KR.
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
          from public.projects project
          where project.id = report.project_id
            and project.organization_id = report.organization_id
            and project.leader_id = auth.uid()
        )
        or exists (
          select 1
          from public.daily_okr_blocks block
          join public.key_results key_result
            on key_result.id = block.linked_key_result_id
           and key_result.organization_id = block.organization_id
          join public.objectives objective
            on objective.id = key_result.objective_id
           and objective.organization_id = key_result.organization_id
          left join public.projects kr_project
            on kr_project.id = key_result.project_id
           and kr_project.organization_id = key_result.organization_id
          where block.report_id = report.id
            and block.organization_id = report.organization_id
            and (objective.owner_id = auth.uid() or kr_project.leader_id = auth.uid())
        )
      )
  )
$$;

-- Blocks follow the same rule as the report that owns them.
drop policy if exists daily_okr_blocks_read on public.daily_okr_blocks;
create policy daily_okr_blocks_read on public.daily_okr_blocks for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.can_read_report_detail(report_id)
);

-- ---------------------------------------------------------------------------
-- Review authority (comment + confirm). Review is strictly narrower than read:
-- it never covers the caller's own report, and it still requires clearance for
-- the current revision's classification.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Report detail: resolve the linked quarterly KR to readable content.
--
-- `keyResultId` stays on the payload for correlation, but callers must render
-- `keyResult`. The left join keeps the entry visible when the KR row was
-- deleted (`linked_key_result_id` is `on delete set null`), in which case
-- `keyResult` is null and the client shows an explicit "unavailable" label
-- rather than a uuid.
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
  caller_leads_project boolean := false;
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
  caller_leads_project := exists (
    select 1
    from public.projects project
    where project.id = target.project_id
      and project.organization_id = target.organization_id
      and project.leader_id = auth.uid()
  );

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
      or caller_leads_project
      or private.can_review_daily_report_block(target.id, block.id, auth.uid())
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
