-- Objective ownership is historical assignment data, not current authority.
-- Require the caller to still hold an active Project Leader role whenever a
-- Key Result is created or structurally edited.

create or replace function public.create_key_result(
  p_objective_id uuid,
  p_title text,
  p_owner_ids uuid[],
  p_due_date date,
  p_metric_type public.kr_metric_type,
  p_current_value numeric,
  p_target_value numeric,
  p_unit text,
  p_notes text,
  p_confidence_index numeric,
  p_priority public.okr_priority,
  p_classification public.classification
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.objectives%rowtype;
  new_kr_id uuid := gen_random_uuid();
  owner_id uuid;
begin
  select * into target
  from public.objectives o
  where o.id = p_objective_id
    and o.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Key Result objective is not available' using errcode = '42501';
  end if;
  if target.owner_id <> auth.uid() or not private.has_role('project_leader') then
    raise exception 'Only an active project leader can create key results' using errcode = '42501';
  end if;
  if target.archived_at is not null then
    raise exception 'Archived objectives cannot gain key results' using errcode = '22023';
  end if;
  if length(trim(p_title)) = 0 or p_due_date is null then
    raise exception 'Key Result fields are invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_owner_ids), 0) = 0 then
    raise exception 'Key Result requires at least one owner' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Key Result classification exceeds user clearance' using errcode = '42501';
  end if;

  for owner_id in select distinct unnest(p_owner_ids) loop
    if owner_id is null or not private.is_eligible_kr_owner(owner_id, target.organization_id, target.project_id) then
      raise exception 'Key Result owners must be eligible members of the Objective''s project.' using errcode = '22023';
    end if;
  end loop;

  insert into public.key_results (
    id, organization_id, objective_id, project_id, owner_id, title,
    measurement_type, metric_type, target_value, current_value, unit, notes,
    confidence_index, priority, progress, classification, start_date, due_date, okr_status
  ) values (
    new_kr_id, target.organization_id, target.id, target.project_id, p_owner_ids[1], trim(p_title),
    'number', p_metric_type, p_target_value, p_current_value, nullif(p_unit, ''), nullif(p_notes, ''),
    p_confidence_index, coalesce(p_priority, 'medium'), 0, p_classification,
    target.start_date, p_due_date,
    case when target.start_date > current_date then 'not_started'::public.okr_status else 'on_track'::public.okr_status end
  );

  for owner_id in select distinct unnest(p_owner_ids) loop
    insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
    values (target.organization_id, new_kr_id, owner_id, 'owner');
  end loop;

  return new_kr_id;
end;
$$;

create or replace function public.update_key_result(
  p_key_result_id uuid,
  p_title text,
  p_owner_ids uuid[],
  p_due_date date,
  p_metric_type public.kr_metric_type,
  p_current_value numeric,
  p_target_value numeric,
  p_unit text,
  p_notes text,
  p_confidence_index numeric,
  p_priority public.okr_priority,
  p_classification public.classification
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.key_results%rowtype;
  objective public.objectives%rowtype;
  owner_id uuid;
begin
  select * into target
  from public.key_results kr
  where kr.id = p_key_result_id
    and kr.organization_id = private.current_organization_id()
  for update;
  if not found then
    raise exception 'Key Result is not editable by the current user' using errcode = '42501';
  end if;

  select * into objective
  from public.objectives o
  where o.id = target.objective_id
    and o.organization_id = target.organization_id;
  if objective.owner_id <> auth.uid() or not private.has_role('project_leader') then
    raise exception 'Only an active project leader can edit key results' using errcode = '42501';
  end if;
  if length(trim(p_title)) = 0 or p_due_date is null then
    raise exception 'Key Result fields are invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_owner_ids), 0) = 0 then
    raise exception 'Key Result requires at least one owner' using errcode = '22023';
  end if;
  if not private.has_clearance(p_classification) then
    raise exception 'Key Result classification exceeds user clearance' using errcode = '42501';
  end if;

  for owner_id in select distinct unnest(p_owner_ids) loop
    if owner_id is null or not private.is_eligible_kr_owner(owner_id, objective.organization_id, objective.project_id) then
      raise exception 'Key Result owners must be eligible members of the Objective''s project.' using errcode = '22023';
    end if;
  end loop;

  update public.key_results
  set title = trim(p_title),
      owner_id = p_owner_ids[1],
      due_date = p_due_date,
      metric_type = p_metric_type,
      target_value = p_target_value,
      current_value = p_current_value,
      unit = nullif(p_unit, ''),
      notes = nullif(p_notes, ''),
      confidence_index = p_confidence_index,
      priority = coalesce(p_priority, 'medium'),
      classification = p_classification
  where id = target.id;

  delete from public.kr_assignments where kr_id = target.id;
  for owner_id in select distinct unnest(p_owner_ids) loop
    insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
    values (target.organization_id, target.id, owner_id, 'owner');
  end loop;
end;
$$;

revoke all on function public.create_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) from public, anon;
revoke all on function public.update_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) from public, anon;
grant execute on function public.create_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) to authenticated;
grant execute on function public.update_key_result(uuid, text, uuid[], date, public.kr_metric_type, numeric, numeric, text, text, numeric, public.okr_priority, public.classification) to authenticated;
