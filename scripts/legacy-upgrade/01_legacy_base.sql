-- L1 — "aborted original apply".
--
-- The pre-53a1e89 202608260001 CANNOT apply cleanly: its `kr_assignments_read`
-- body says `and kr.organization_id = organization_id` inside a subquery that
-- joins BOTH key_results and objectives, so the bare `organization_id` is
-- genuinely ambiguous and CREATE POLICY aborts with 42702. (This is the
-- "ambiguity" commit 53a1e89 was named after.)
--
-- Applied statement-by-statement — which is what a manual/emergency deployment
-- looks like — the file gets as far as:
--     objective_owners_read  created (old body)
--     objectives_read        created (old, recursive-shaped body)
--     key_results_read       created (old body)
--     kr_assignments_read    DROPPED, then CREATE fails  -> policy absent
--     kr_progress_updates_read  never reached            -> policy absent
-- and neither `private.is_objective_kr_assignee` nor the 202608270002 /
-- 202608270004 grants exist.

begin;

drop policy if exists objectives_read on public.objectives;
drop policy if exists key_results_read on public.key_results;
drop policy if exists kr_assignments_read on public.kr_assignments;
drop policy if exists kr_progress_updates_read on public.kr_progress_updates;
drop policy if exists objective_owners_read on public.objective_owners;

drop function if exists private.is_objective_kr_assignee(uuid, uuid);

revoke execute on function private.can_hr_read_objective(uuid) from authenticated;
revoke select on table public.objective_owners from authenticated;

create policy objective_owners_read on public.objective_owners for select to authenticated
using (
  organization_id = private.current_organization_id()
  and (
    private.can_hr_read_objective(objective_id)
    or exists (
      select 1
      from public.objectives o
      where o.id = objective_id
        and o.organization_id = organization_id
        and private.can_read_business_subject(o.owner_id, o.project_id, o.organization_id)
    )
  )
);

create policy objectives_read on public.objectives for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.can_read_business_subject(owner_id, project_id, organization_id)
    or exists (
      select 1
      from public.key_results kr
      join public.kr_assignments ka on ka.kr_id = kr.id
      where kr.objective_id = objectives.id
        and ka.organization_id = objectives.organization_id
        and ka.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.reporting_lines rl
      where rl.manager_id = owner_id and rl.subordinate_id = auth.uid() and rl.organization_id = organization_id
    )
    or private.can_hr_read_objective(objectives.id)
  )
);

create policy key_results_read on public.key_results for select to authenticated
using (
  organization_id = private.current_organization_id()
  and private.has_clearance(classification)
  and (
    private.can_read_business_subject(owner_id, project_id, organization_id)
    or private.is_kr_assignee(id)
    or private.can_hr_read_objective(objective_id)
  )
);

-- kr_assignments_read / kr_progress_updates_read intentionally left absent.

commit;
