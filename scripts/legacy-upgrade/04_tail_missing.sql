-- L4 — the 42702 abort also skipped sections 8-11 of 202608260001.
-- Simulate: no get_hr_work_hours, pre-HR list_organization_users, the legacy
-- 9-argument objective overloads still present, section-11 grants absent.
begin;

drop function if exists public.get_hr_work_hours(date, date);

create or replace function public.list_organization_users()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$ begin return '[]'::jsonb; end; $$;

create or replace function public.create_objective(
  p_name text, p_number text, p_leader_id uuid, p_quarter text,
  p_start_date date, p_due_date date, p_priority public.okr_priority,
  p_description text, p_classification public.classification
) returns uuid language plpgsql security definer set search_path = ''
as $$ begin raise exception 'legacy overload'; end; $$;

create or replace function public.update_objective(
  p_objective_id uuid, p_name text, p_number text, p_leader_id uuid, p_quarter text,
  p_start_date date, p_due_date date, p_priority public.okr_priority,
  p_description text, p_classification public.classification
) returns void language plpgsql security definer set search_path = ''
as $$ begin raise exception 'legacy overload'; end; $$;

revoke execute on function public.create_objective(text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) from authenticated;
revoke execute on function public.update_objective(uuid, text, text, uuid, text, date, date, public.okr_priority, text, public.classification, public.objective_type, uuid[]) from authenticated;

commit;
