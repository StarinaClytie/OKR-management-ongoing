-- ---------------------------------------------------------------------------
-- Data-integrity hardening: update_objective preserves leader membership.
--
-- Follow-up to 202608200002_kr_owner_membership.sql. Closes the last path that
-- could break the invariant "projects.leader_id = X implies
-- project_members(project_id, X) exists":
--
--   `update_objective` reassigns an Objective's Project Leader by writing
--   `projects.leader_id`, but did not add the newly assigned leader to
--   `project_members`. Reassigning the leader now also inserts the new leader
--   as a member (idempotently). The old leader's membership is intentionally
--   NOT removed — an outgoing leader may legitimately remain a project
--   participant, and membership removal stays an explicit project-membership
--   operation.
--
-- Purely additive (CREATE OR REPLACE FUNCTION only).
-- ---------------------------------------------------------------------------

create or replace function public.update_objective(
  p_objective_id uuid,
  p_name text,
  p_number text,
  p_leader_id uuid,
  p_quarter text,
  p_start_date date,
  p_due_date date,
  p_priority public.okr_priority,
  p_description text,
  p_classification public.classification
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.objectives%rowtype;
begin
  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Objective is not editable by the current user' using errcode = '42501';
  end if;

  if not private.has_role('management') then
    raise exception 'Only management can edit objectives' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived objectives cannot be edited' using errcode = '22023';
  end if;
  if length(trim(p_name)) = 0 then
    raise exception 'Objective name is required' using errcode = '22023';
  end if;
  if p_start_date is null or p_due_date is null or p_due_date < p_start_date then
    raise exception 'Objective dates are invalid' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Objective classification exceeds user clearance' using errcode = '42501';
  end if;
  if not private.profile_has_role(p_leader_id, 'project_leader') then
    raise exception 'Objective leader must be a project leader' using errcode = '22023';
  end if;

  update public.objectives
  set title = trim(p_name),
      number = nullif(trim(coalesce(p_number, '')), ''),
      owner_id = p_leader_id,
      quarter = p_quarter,
      start_date = p_start_date,
      due_date = p_due_date,
      priority = p_priority,
      description = coalesce(p_description, ''),
      classification = p_classification
  where id = target.id;

  update public.projects
  set name = trim(p_name),
      leader_id = p_leader_id,
      start_date = p_start_date,
      due_date = p_due_date,
      classification = p_classification
  where id = target.project_id;

  -- Maintain the leader-is-a-member invariant when the Objective's Project
  -- Leader changes. Idempotent; the previous leader is not removed here.
  insert into public.project_members (organization_id, project_id, profile_id)
  values (target.organization_id, target.project_id, p_leader_id)
  on conflict do nothing;
end;
$$;
