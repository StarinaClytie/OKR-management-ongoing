-- ---------------------------------------------------------------------------
-- Production schema convergence after an observed historical-migration drift.
--
-- WHAT HAPPENED
--
-- `202608260001_hr_okr_and_work_hours.sql` was applied to production in the
-- form it had at commit 784d27a. Commit 53a1e89 then EDITED that already-applied
-- migration file instead of adding a forward migration. A clean `db reset`
-- therefore produces the corrected schema, while production — which records
-- 202608260001 as applied and never re-runs it — kept the original objects.
--
-- Two failures were observed in production as a direct result:
--
--   * 42883  function private.is_objective_kr_assignee(uuid, uuid) does not
--            exist — raised by `202608270004_daily_report_rls_grants.sql`, which
--            grants EXECUTE on a helper that only exists in the edited version
--            of 202608260001.
--
--   * 42P17  infinite recursion detected in policy for relation "objectives" —
--            the original `objectives_read` inlined a subquery over
--            `key_results`/`kr_assignments`; `kr_assignments_read` in turn joins
--            `objectives`, closing the cycle:
--                objectives_read -> kr_assignments -> kr_assignments_read
--                                -> objectives     -> objectives_read -> ...
--
-- Production was restored with manual emergency SQL (creating
-- `private.is_objective_kr_assignee`, adding grants, hand-patching
-- `kr_assignments_read`, and introducing an unversioned helper
-- `private.can_read_kr_assignment(uuid, uuid)` to break the cycle from the other
-- side). Those manual fixes are not reproducible from Git.
--
-- WHAT THIS MIGRATION DOES
--
-- Converge every object touched by that drift onto the canonical definitions in
-- `main`, from EITHER starting point:
--
--   A. a clean `db reset` database (already canonical — this is a no-op rewrite)
--   B. a legacy production database that ran the pre-53a1e89 202608260001, with
--      or without the manual emergency SQL on top
--
-- Only re-creatable objects are touched: SECURITY DEFINER helpers, RLS policies
-- and privileges. No CREATE TYPE / CREATE TABLE / ADD COLUMN — the drift did not
-- affect base structure (`public.objective_owners`, `public.objective_type` and
-- `public.objectives.objective_type` are created in the *unedited* prefix of
-- 202608260001 and therefore exist in both databases).
--
-- Ordering matters: the policies that depend on the helper are dropped first so
-- the helper itself can be replaced regardless of the parameter names the manual
-- emergency SQL happened to use (CREATE OR REPLACE cannot rename parameters).
-- ---------------------------------------------------------------------------


-- 1. Release policy dependencies -------------------------------------------
--
-- `objectives_read` may reference `private.is_objective_kr_assignee` (canonical
-- or emergency-created), and `kr_assignments_read` may reference the unversioned
-- `private.can_read_kr_assignment`. Dropping both first makes the helper
-- replacement below unconditional, and makes this file re-runnable.

drop policy if exists objectives_read on public.objectives;
drop policy if exists key_results_read on public.key_results;
drop policy if exists kr_assignments_read on public.kr_assignments;
drop policy if exists kr_progress_updates_read on public.kr_progress_updates;
drop policy if exists objective_owners_read on public.objective_owners;


-- 2. Canonical recursion-breaking helper ------------------------------------
--
-- SECURITY DEFINER is the whole point: executing as the owner bypasses RLS on
-- `key_results` and `kr_assignments`, so `objectives_read` can ask "is the caller
-- assigned to a KR under this Objective?" without re-entering either table's
-- policy. `set search_path = ''` forces fully-qualified names so the definer
-- context cannot be hijacked by a caller-controlled search_path.
--
-- Dropped rather than replaced: a manually created production copy may have
-- different parameter names, which CREATE OR REPLACE refuses to change (42P13).
-- If some production-only object still depends on it, this DROP fails loudly and
-- the whole migration rolls back, which is the correct outcome.

drop function if exists private.is_objective_kr_assignee(uuid, uuid);

create function private.is_objective_kr_assignee(
  p_objective_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.key_results key_result
    join public.kr_assignments assignment
      on assignment.organization_id = key_result.organization_id
     and assignment.kr_id = key_result.id
    where key_result.organization_id = private.current_organization_id()
      and key_result.objective_id = p_objective_id
      and assignment.profile_id = p_profile_id
  )
$$;

revoke all on function private.is_objective_kr_assignee(uuid, uuid)
  from public, anon;
grant execute on function private.is_objective_kr_assignee(uuid, uuid)
  to authenticated;


-- 3. Canonical read policies -------------------------------------------------
--
-- Bodies are byte-equivalent to the post-53a1e89 202608260001. Every predicate is
-- explicitly table-qualified: the original version left `organization_id` and
-- `objective_id` unqualified inside EXISTS subqueries, where the inner relation
-- shadowed the policy's own table and silently degraded the organization scope to
-- a self-comparison.

create policy objectives_read on public.objectives for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.can_read_business_subject(owner_id, project_id, organization_id)
    or private.is_objective_kr_assignee(objectives.id)
    or exists (
      select 1 from public.reporting_lines rl
      where rl.manager_id = objectives.owner_id and rl.subordinate_id = auth.uid() and rl.organization_id = objectives.organization_id
    )
    or private.can_hr_read_objective(objectives.id)
  )
);

create policy key_results_read on public.key_results for select to authenticated
using (
  key_results.organization_id = private.current_organization_id()
  and private.has_clearance(key_results.classification)
  and (
    private.can_read_business_subject(key_results.owner_id, key_results.project_id, key_results.organization_id)
    or private.is_kr_assignee(key_results.id)
    or private.can_hr_read_objective(key_results.objective_id)
  )
);

-- Reads `public.objectives` in its HR branch. That hop is safe *because*
-- `objectives_read` above resolves KR assignment through the SECURITY DEFINER
-- helper instead of querying `kr_assignments` under RLS, so the cycle that
-- produced 42P17 no longer closes.
create policy kr_assignments_read on public.kr_assignments for select to authenticated
using (
  kr_assignments.organization_id = private.current_organization_id()
  and (
    kr_assignments.profile_id = auth.uid()
    or exists (
      select 1
      from public.key_results kr
      where kr.id = kr_assignments.kr_id
        and kr.organization_id = kr_assignments.organization_id
        and private.has_clearance(kr.classification)
        and private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
    )
    or exists (
      select 1
      from public.key_results kr
      join public.objectives o on o.id = kr.objective_id and o.organization_id = kr.organization_id
      where kr.id = kr_assignments.kr_id
        and kr.organization_id = kr_assignments.organization_id
        and o.objective_type = 'hr'
        and private.has_role('hr')
    )
  )
);

create policy kr_progress_updates_read on public.kr_progress_updates for select to authenticated
using (
  exists (
    select 1
    from public.key_results kr
    where kr.id = kr_progress_updates.kr_id
      and kr.organization_id = kr_progress_updates.organization_id
      and private.has_clearance(kr.classification)
      and (
        private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
        or private.is_kr_assignee(kr.id)
        or private.can_hr_read_objective(kr.objective_id)
      )
  )
);

create policy objective_owners_read on public.objective_owners for select to authenticated
using (
  objective_owners.organization_id = private.current_organization_id()
  and (
    private.can_hr_read_objective(objective_owners.objective_id)
    or exists (
      select 1
      from public.objectives o
      where o.id = objective_owners.objective_id
        and o.organization_id = objective_owners.organization_id
        and private.can_read_business_subject(o.owner_id, o.project_id, o.organization_id)
    )
  )
);


-- 4. Privileges the policies above depend on ---------------------------------
--
-- RLS predicates execute as the querying role, so every helper a policy calls
-- needs EXECUTE for `authenticated`. `202608270002` and `202608270004` already
-- grant these, but they are re-asserted here because 202608270004 aborted
-- mid-push in production (42883) and may never have been recorded as applied.
-- All statements are idempotent.

grant usage on schema private to authenticated;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.has_clearance(public.classification) to authenticated;
grant execute on function private.can_read_business_subject(uuid, uuid, uuid) to authenticated;
grant execute on function private.is_kr_assignee(uuid) to authenticated;
grant execute on function private.can_hr_read_objective(uuid) to authenticated;
grant select on table public.objective_owners to authenticated;


-- 5. Retire the unversioned production emergency helper ----------------------
--
-- `private.can_read_kr_assignment(uuid, uuid)` exists only in production, created
-- by hand to break the recursion from the `kr_assignments` side. Section 3 above
-- restored the canonical `kr_assignments_read`, which does not reference it, so
-- it is now dead code — but it is dropped only after proving nothing else points
-- at it. A production-only dependency leaves the function in place and reports
-- it, rather than cascading or aborting the convergence.

do $$
declare
  target_oid oid;
  dependents text;
begin
  -- to_regprocedure resolves by argument TYPES; matching on
  -- pg_get_function_identity_arguments would fail because that text includes the
  -- parameter names, which hand-written emergency SQL chose arbitrarily.
  target_oid := to_regprocedure('private.can_read_kr_assignment(uuid, uuid)');

  if target_oid is null then
    raise notice 'private.can_read_kr_assignment(uuid, uuid) is absent; nothing to retire.';
    return;
  end if;

  select string_agg(distinct
           case
             when d.classid = 'pg_policy'::regclass then
               format('policy %s on %s',
                      (select pol.polname from pg_policy pol where pol.oid = d.objid),
                      (select pol.polrelid::regclass::text from pg_policy pol where pol.oid = d.objid))
             else format('%s oid %s', d.classid::regclass, d.objid)
           end, ', ')
  into dependents
  from pg_depend d
  where d.refclassid = 'pg_proc'::regclass
    and d.refobjid = target_oid
    and d.deptype <> 'i'
    and d.classid <> 'pg_proc'::regclass;

  if dependents is not null then
    raise notice 'private.can_read_kr_assignment(uuid, uuid) still has dependents (%); leaving it in place for manual review.', dependents;
    return;
  end if;

  execute 'drop function private.can_read_kr_assignment(uuid, uuid)';
  raise notice 'Retired unversioned production helper private.can_read_kr_assignment(uuid, uuid).';
end;
$$;


-- 6. Re-assert the block-review predicate ------------------------------------
--
-- `202608270003_daily_report_block_projects.sql` was also edited after creation
-- (commit b7badf1 added the legacy fallback below to
-- `private.can_review_daily_report_block`). Unlike 202608260001 there is no
-- production evidence that the pre-edit version was applied, but the push window
-- overlaps, so the canonical body is re-asserted defensively. Parameter names are
-- unchanged across every version, so CREATE OR REPLACE is safe here.

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


-- 7. Re-assert the tail of 202608260001 that a 42702 abort would have skipped --
--
-- The pre-53a1e89 202608260001 cannot be applied atomically at all: its
-- `kr_assignments_read` body compares `kr.organization_id = organization_id`
-- inside a subquery that joins BOTH `key_results` and `objectives`, so the bare
-- column is genuinely ambiguous and CREATE POLICY aborts with
--     42702  column reference "organization_id" is ambiguous
-- at what is line 708 of that file. (Reproduced locally; this is the "ambiguity"
-- commit 53a1e89 was named after.)
--
-- A transactional `db push` would therefore have rolled the whole migration
-- back. Production instead ended up with the objects BEFORE line 708 — which is
-- only possible if the file was applied statement-by-statement, so each
-- statement committed on its own. That means everything AFTER line 708 may never
-- have run:
--
--   section 8   public.list_organization_users()  — the HR branch, without which
--               HR sees only itself in the org directory
--   section 9   public.get_hr_work_hours(date, date) — the entire HR work-hours
--               overview RPC
--   section 10  drops of the legacy 9-argument create_objective/update_objective
--               overloads, without which PostgREST can resolve the wrong one
--   section 11  EXECUTE grants for create_objective / update_objective /
--               get_hr_work_hours
--
-- All of it is re-assertable: CREATE OR REPLACE FUNCTION, DROP FUNCTION IF
-- EXISTS and GRANT are idempotent, so this section is a no-op on a database that
-- already has the canonical definitions and a repair on one that does not. The
-- text below is copied verbatim from sections 8-11 of the current
-- 202608260001_hr_okr_and_work_hours.sql.

-- 8. HR org directory: active approved PL/employee/HR users ------------------

create or replace function public.list_organization_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid;
  result jsonb;
begin
  caller_org := private.current_organization_id();
  if caller_org is null then
    return '[]'::jsonb;
  end if;

  if private.has_role('administrator') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', coalesce(p.email, ''),
        'department', coalesce(p.department, ''),
        'job_title', coalesce(p.job_title, ''),
        'is_active', p.is_active,
        'approval_status', p.approval_status,
        'created_at', p.created_at,
        'preferred_locale', p.preferred_locale,
        'organizations', jsonb_build_object('name', o.name),
        'user_roles', coalesce((
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
    ) directory;
    return result;
  end if;

  if private.has_role('management') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', coalesce(p.email, ''),
        'department', coalesce(p.department, ''),
        'job_title', coalesce(p.job_title, ''),
        'is_active', p.is_active,
        'approval_status', p.approval_status,
        'created_at', p.created_at,
        'preferred_locale', p.preferred_locale,
        'organizations', jsonb_build_object('name', o.name),
        'user_roles', coalesce((
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
        and p.is_active
        and p.approval_status = 'approved'
        and exists (
          select 1
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        )
    ) directory;
    return result;
  end if;

  if private.has_role('project_leader') or private.has_role('employee') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', coalesce(p.email, ''),
        'department', coalesce(p.department, ''),
        'job_title', coalesce(p.job_title, ''),
        'is_active', p.is_active,
        'approval_status', p.approval_status,
        'created_at', p.created_at,
        'preferred_locale', p.preferred_locale,
        'organizations', jsonb_build_object('name', o.name),
        'user_roles', coalesce((
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
        and p.is_active
        and p.approval_status = 'approved'
        and (p.id = auth.uid() or private.can_view_project_member(p.id))
    ) directory;
    return result;
  end if;

  -- hr: active, approved users who can own KRs / log hours (PL, employee, hr).
  -- HR's OKR tree needs to resolve project-leader and HR-owner names, and the
  -- work-hours overview needs the roster. Business report bodies stay hidden.
  if private.has_role('hr') then
    select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', coalesce(p.email, ''),
        'department', coalesce(p.department, ''),
        'job_title', coalesce(p.job_title, ''),
        'is_active', p.is_active,
        'approval_status', p.approval_status,
        'created_at', p.created_at,
        'preferred_locale', p.preferred_locale,
        'organizations', jsonb_build_object('name', o.name),
        'user_roles', coalesce((
          select jsonb_agg(jsonb_build_object('role', ur.role))
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
        ), '[]'::jsonb),
        'project_members', coalesce((
          select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
          from public.project_members pm
          where pm.profile_id = p.id
            and pm.organization_id = caller_org
        ), '[]'::jsonb)
      ) as item
      from public.profiles p
      join public.organizations o on o.id = p.organization_id
      where p.organization_id = caller_org
        and p.is_active
        and p.approval_status = 'approved'
        and exists (
          select 1
          from public.user_roles ur
          where ur.profile_id = p.id
            and ur.organization_id = caller_org
            and ur.is_active
            and ur.role in ('project_leader'::public.app_role, 'employee'::public.app_role, 'hr'::public.app_role)
        )
    ) directory;
    return result;
  end if;

  select coalesce(jsonb_agg(item order by item->>'display_name'), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'email', coalesce(p.email, ''),
      'department', coalesce(p.department, ''),
      'job_title', coalesce(p.job_title, ''),
      'is_active', p.is_active,
      'approval_status', p.approval_status,
      'created_at', p.created_at,
      'preferred_locale', p.preferred_locale,
      'organizations', jsonb_build_object('name', o.name),
      'user_roles', coalesce((
        select jsonb_agg(jsonb_build_object('role', ur.role))
        from public.user_roles ur
        where ur.profile_id = p.id
          and ur.organization_id = caller_org
          and ur.is_active
      ), '[]'::jsonb),
      'project_members', coalesce((
        select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
        from public.project_members pm
        where pm.profile_id = p.id
          and pm.organization_id = caller_org
      ), '[]'::jsonb)
    ) as item
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.id = auth.uid()
  ) directory;
  return result;
end;
$$;

-- 9. HR work-hours overview: investment rows only ----------------------------

create or replace function public.get_hr_work_hours(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid := private.current_organization_id();
  result jsonb;
begin
  if caller_org is null or not private.has_role('hr') then
    raise exception 'HR work hours are not available to the current user' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by item->>'date', item->>'displayName', item->>'krTitle'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'date', dr.report_date,
      'userId', dr.author_id,
      'displayName', p.display_name,
      'role', ur.role,
      'projectLeaderName', pl.display_name,
      'projectLeaderId', pl.id,
      'projectId', kr.project_id,
      'projectName', pr.name,
      'objectiveId', kr.objective_id,
      'objectiveTitle', o.title,
      'objectiveArchived', (o.archived_at is not null),
      'krId', kr.id,
      'krTitle', kr.title,
      'hours', b.hours
    ) as item
    from public.daily_okr_blocks b
    join public.daily_reports dr
      on dr.id = b.report_id and dr.organization_id = b.organization_id
    join public.daily_report_revisions rev
      on rev.id = b.revision_id and rev.report_id = b.report_id
    join public.profiles p
      on p.id = dr.author_id and p.organization_id = dr.organization_id
    left join public.key_results kr
      on kr.id = b.linked_key_result_id and kr.organization_id = b.organization_id
    left join public.objectives o
      on o.id = kr.objective_id and o.organization_id = kr.organization_id
    left join public.projects pr
      on pr.id = kr.project_id and pr.organization_id = kr.organization_id
    left join public.profiles pl
      on pl.id = pr.leader_id and pl.organization_id = pr.organization_id
    left join public.user_roles ur
      on ur.profile_id = p.id and ur.organization_id = dr.organization_id and ur.is_active
    where dr.organization_id = caller_org
      and dr.report_date between p_from and p_to
      and rev.revision_number = dr.current_revision
  ) rows;
  return result;
end;
$$;

-- 10. Drop legacy single-owner overloads -------------------------------------
-- `create or replace` matches on name + argument types, so the previous 9-arg
-- definitions survive as separate overloads. Drop them so the HR-aware
-- signatures are the only ones callable (and PostgREST's `.rpc` is unambiguous).
drop function if exists public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification);
drop function if exists public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification);

-- 11. Grants -----------------------------------------------------------------

revoke all on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) from public, anon;
revoke all on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) from public, anon;
revoke all on function public.get_hr_work_hours(date, date) from public, anon;

grant execute on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) to authenticated;
grant execute on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) to authenticated;
grant execute on function public.get_hr_work_hours(date, date) to authenticated;

notify pgrst, 'reload schema';
