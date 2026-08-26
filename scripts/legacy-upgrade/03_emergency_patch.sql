-- Overlay the manual emergency SQL that was run against production to restore
-- service after the 42883 / 42P17 incident, as described by the maintainer.
--
-- Deliberately hostile details, to prove the convergence migration survives them:
--   * `is_objective_kr_assignee` uses DIFFERENT parameter names than canonical,
--     which is what hand-written recovery SQL typically looks like. CREATE OR
--     REPLACE cannot rename parameters (42P13), so a convergence migration that
--     used CREATE OR REPLACE here would fail on production.
--   * `can_read_kr_assignment` is an unversioned helper that exists in no
--     migration, and `kr_assignments_read` is hand-patched to call it.

begin;

create function private.is_objective_kr_assignee(
  objective_id_in uuid,
  profile_id_in uuid default auth.uid()
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
      and key_result.objective_id = objective_id_in
      and assignment.profile_id = profile_id_in
  )
$$;

grant execute on function private.is_objective_kr_assignee(uuid, uuid) to authenticated;
grant execute on function private.can_hr_read_objective(uuid) to authenticated;
grant select on table public.objective_owners to authenticated;

-- Emergency helper: breaks the recursion from the kr_assignments side instead,
-- leaving the old recursive-shaped objectives_read in place.
create function private.can_read_kr_assignment(
  p_kr_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.key_results kr
    join public.objectives o on o.id = kr.objective_id and o.organization_id = kr.organization_id
    where kr.id = p_kr_id
      and kr.organization_id = p_organization_id
      and o.objective_type = 'hr'
      and private.has_role('hr')
  )
  or exists (
    select 1
    from public.key_results kr
    where kr.id = p_kr_id
      and kr.organization_id = p_organization_id
      and private.has_clearance(kr.classification)
      and private.can_read_business_subject(kr.owner_id, kr.project_id, kr.organization_id)
  )
$$;

grant execute on function private.can_read_kr_assignment(uuid, uuid) to authenticated;

drop policy if exists kr_assignments_read on public.kr_assignments;
create policy kr_assignments_read on public.kr_assignments for select to authenticated
using (
  organization_id = private.current_organization_id()
  and (
    profile_id = auth.uid()
    or private.can_read_kr_assignment(kr_id, organization_id)
  )
);

commit;
