-- Restore the two authenticated privileges that the HR OKR / block-project work
-- introduced without granting:
--
-- 1. `public.objective_owners` ships RLS plus a SELECT policy for `authenticated`
--    (and the client repository selects from it), but the table was never granted
--    SELECT to `authenticated`, so every read failed with 42501.
--
-- 2. `private.is_objective_kr_assignee` is called from the `objectives_read` RLS
--    policy but was created with only a revoke, matching the same defect that
--    `202608270002_hr_okr_rls_helper_grant.sql` fixed for
--    `private.can_hr_read_objective`.
--
-- Neither change alters the policy logic; RLS remains the authority.

grant select on table public.objective_owners to authenticated;
grant execute on function private.is_objective_kr_assignee(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
