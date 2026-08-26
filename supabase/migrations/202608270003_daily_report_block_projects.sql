-- Attribute every new Daily OKR block to a project. Linked work derives its
-- project from the assigned KR; unlinked work must name a project the author
-- leads or has joined. Historical null project rows remain unchanged.

alter table public.daily_okr_blocks
  add column project_id uuid;

alter table public.daily_okr_blocks
  add constraint daily_okr_blocks_organization_project_fkey
  foreign key (organization_id, project_id)
  references public.projects (organization_id, id);

create index daily_okr_blocks_project_revision_idx
  on public.daily_okr_blocks (project_id, revision_id)
  where project_id is not null;

create or replace function private.resolve_daily_report_block_project(
  p_organization_id uuid,
  p_actor_id uuid,
  p_linked_key_result_id uuid,
  p_requested_project_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_project_id uuid;
begin
  if p_linked_key_result_id is not null then
    select key_result.project_id
    into resolved_project_id
    from public.key_results key_result
    join public.kr_assignments assignment
      on assignment.organization_id = key_result.organization_id
     and assignment.kr_id = key_result.id
     and assignment.profile_id = p_actor_id
     and assignment.assignment_role = 'owner'
    join public.objectives objective
      on objective.organization_id = key_result.organization_id
     and objective.id = key_result.objective_id
    where key_result.organization_id = p_organization_id
      and key_result.id = p_linked_key_result_id
      and objective.archived_at is null;

    if resolved_project_id is null then
      raise exception 'Daily OKR Key Result is not available to the current user' using errcode = '42501';
    end if;
    return resolved_project_id;
  end if;

  select project.id
  into resolved_project_id
  from public.projects project
  where project.organization_id = p_organization_id
    and project.id = p_requested_project_id
    and project.status <> 'archived'
    and (
      project.leader_id = p_actor_id
      or exists (
        select 1
        from public.project_members membership
        where membership.organization_id = project.organization_id
          and membership.project_id = project.id
          and membership.profile_id = p_actor_id
      )
    );

  if resolved_project_id is null then
    raise exception 'Daily OKR project is not available to the current user' using errcode = '42501';
  end if;
  return resolved_project_id;
end;
$$;

revoke all on function private.resolve_daily_report_block_project(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

-- Keep the already-audited save implementations intact and wrap them with
-- block-project validation/attribution. The wrapper and updates are one SQL
-- transaction, so callers never observe unattributed newly-created blocks.
alter function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb)
  rename to save_daily_report_without_block_projects_20260827;

revoke all on function public.save_daily_report_without_block_projects_20260827(date, public.report_status, public.classification, jsonb, uuid, jsonb)
  from public, anon, authenticated;

create function public.save_daily_report(
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
begin
  if target_org is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Daily report subject is not available to the current user' using errcode = '42501';
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

alter function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb)
  rename to save_daily_report_without_block_projects_legacy_20260827;

revoke all on function public.save_daily_report_without_block_projects_legacy_20260827(date, public.report_status, public.classification, jsonb, jsonb)
  from public, anon, authenticated;

create function public.save_daily_report(
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

-- This compatibility overload remains unavailable to browser clients, matching
-- the pre-migration grant state. Tests and trusted server paths may SET ROLE.
revoke all on function public.save_daily_report(date, public.report_status, public.classification, jsonb, jsonb)
  from public, anon, authenticated;

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
     and block.report_id = report.id
     and block.revision_id = revision.id
     and block.organization_id = report.organization_id
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
          where project.organization_id = report.organization_id
            and project.id = block.project_id
            and project.leader_id = reviewer.id
        )
        or exists (
          select 1
          from public.key_results key_result
          join public.objectives objective
            on objective.organization_id = key_result.organization_id
           and objective.id = key_result.objective_id
          join public.projects project
            on project.organization_id = key_result.organization_id
           and project.id = key_result.project_id
          where block.project_id is null
            and key_result.organization_id = report.organization_id
            and key_result.id = block.linked_key_result_id
            and objective.owner_id = reviewer.id
        )
      )
  )
$$;

revoke all on function private.can_review_daily_report_block(uuid, uuid, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
