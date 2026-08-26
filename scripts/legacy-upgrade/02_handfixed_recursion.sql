-- L2 — "operator hand-fixes the 42702, recursion appears".
--
-- The obvious manual repair for the ambiguity is to qualify the columns, which
-- yields exactly the canonical body. But `objectives_read` is still the OLD one
-- that inlines a subquery over kr_assignments, so the cycle now closes:
--     objectives_read -> kr_assignments -> kr_assignments_read
--                     -> objectives     -> objectives_read -> ...
-- This is the state that produced the reported 42P17 in production.

begin;

drop policy if exists kr_assignments_read on public.kr_assignments;
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

drop policy if exists kr_progress_updates_read on public.kr_progress_updates;
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

commit;
