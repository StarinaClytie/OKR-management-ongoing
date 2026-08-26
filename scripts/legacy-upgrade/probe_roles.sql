-- Five-identity RLS probe over every table implicated in the drift.
-- Rolls back, so it can be run repeatedly against any schema state.
--
-- Fixture (one organization):
--   MGMT  management
--   PL_A  project_leader, leads Project A (Objective A lives on Project A)
--   EMP_A employee, member of Project A, KR owner on Objective A's KR
--   EMP_B employee, member of Project B only (unrelated to Objective A)
--   HR1   hr, assigned HR owner of the HR Objective, KR owner on the HR KR
--   HR2   hr, plain HR (no HR-owner assignment)

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('d1000000-0000-0000-0000-00000000000a'::uuid, 'mgmt@probe.test'),
  ('d1000000-0000-0000-0000-00000000000b'::uuid, 'pla@probe.test'),
  ('d1000000-0000-0000-0000-00000000000c'::uuid, 'empa@probe.test'),
  ('d1000000-0000-0000-0000-00000000000d'::uuid, 'empb@probe.test'),
  ('d1000000-0000-0000-0000-00000000000e'::uuid, 'hr1@probe.test'),
  ('d1000000-0000-0000-0000-00000000000f'::uuid, 'hr2@probe.test'),
  ('d1000000-0000-0000-0000-000000000010'::uuid, 'plb@probe.test')
) u(id, email);

insert into public.organizations (id, name) values ('d2000000-0000-0000-0000-000000000001', 'Probe Org');

insert into public.profiles (id, organization_id, display_name, clearance, approval_status) values
  ('d1000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000001', 'Mgmt',  'confidential', 'approved'),
  ('d1000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-000000000001', 'PL A',  'confidential', 'approved'),
  ('d1000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-000000000001', 'Emp A', 'confidential', 'approved'),
  ('d1000000-0000-0000-0000-00000000000d', 'd2000000-0000-0000-0000-000000000001', 'Emp B', 'confidential', 'approved'),
  ('d1000000-0000-0000-0000-00000000000e', 'd2000000-0000-0000-0000-000000000001', 'HR 1',  'confidential', 'approved'),
  ('d1000000-0000-0000-0000-00000000000f', 'd2000000-0000-0000-0000-000000000001', 'HR 2',  'confidential', 'approved'),
  ('d1000000-0000-0000-0000-000000000010', 'd2000000-0000-0000-0000-000000000001', 'PL B',  'confidential', 'approved');

insert into public.user_roles (organization_id, profile_id, role) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000a', 'management'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000b', 'project_leader'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000c', 'employee'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000d', 'employee'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000e', 'hr'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000f', 'hr'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000010', 'project_leader');

-- Project A (business), Project B (unrelated business), Project H (HR objective)
insert into public.projects (id, organization_id, name, description, leader_id, classification, start_date, due_date, status) values
  ('d3000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000001', 'Project A', '', 'd1000000-0000-0000-0000-00000000000b', 'internal', current_date, current_date + 60, 'active'),
  ('d3000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-000000000001', 'Project B', '', 'd1000000-0000-0000-0000-000000000010', 'internal', current_date, current_date + 60, 'active'),
  ('d3000000-0000-0000-0000-0000000000cc', 'd2000000-0000-0000-0000-000000000001', 'Project H', '', 'd1000000-0000-0000-0000-00000000000b', 'internal', current_date, current_date + 60, 'active');

insert into public.project_members (organization_id, project_id, profile_id) values
  ('d2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000c'),
  ('d2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000d');

insert into public.objectives (id, organization_id, project_id, title, description, owner_id, classification, start_date, due_date, quarter, objective_type) values
  ('d4000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-00000000000a', 'Objective A', '', 'd1000000-0000-0000-0000-00000000000b', 'internal', current_date, current_date + 60, '2026-Q3', 'business'),
  ('d4000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-00000000000b', 'Objective B', '', 'd1000000-0000-0000-0000-000000000010', 'internal', current_date, current_date + 60, '2026-Q3', 'business'),
  ('d4000000-0000-0000-0000-0000000000cc', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-0000000000cc', 'HR Objective', '', 'd1000000-0000-0000-0000-00000000000b', 'internal', current_date, current_date + 60, '2026-Q3', 'hr');

insert into public.objective_owners (organization_id, objective_id, profile_id, role_type) values
  ('d2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000b', 'project_leader'),
  ('d2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-000000000010', 'project_leader'),
  ('d2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-0000000000cc', 'd1000000-0000-0000-0000-00000000000b', 'project_leader'),
  ('d2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-0000000000cc', 'd1000000-0000-0000-0000-00000000000e', 'hr');

insert into public.key_results (id, organization_id, project_id, objective_id, title, owner_id, measurement_type, target_value, classification, start_date, due_date) values
  ('d5000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'KR A', 'd1000000-0000-0000-0000-00000000000c', 'number', 100, 'internal', current_date, current_date + 60),
  ('d5000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000b', 'KR B', 'd1000000-0000-0000-0000-00000000000d', 'number', 100, 'internal', current_date, current_date + 60),
  ('d5000000-0000-0000-0000-0000000000cc', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-0000000000cc', 'd4000000-0000-0000-0000-0000000000cc', 'KR H', 'd1000000-0000-0000-0000-00000000000e', 'number', 100, 'internal', current_date, current_date + 60);

insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role) values
  ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000c', 'owner'),
  ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000d', 'owner'),
  ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-0000000000cc', 'd1000000-0000-0000-0000-00000000000e', 'owner');

insert into public.kr_progress_updates (organization_id, kr_id, author_id, previous_progress, new_progress, summary) values
  ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000000c', 0, 10, 'A progress'),
  ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000000d', 0, 20, 'B progress'),
  ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-0000000000cc', 'd1000000-0000-0000-0000-00000000000e', 0, 30, 'H progress');

set local role authenticated;

do $$
declare
  identity record;
  relation text;
  visible integer;
  outcome text;
begin
  raise notice '%', rpad('IDENTITY', 22) || rpad('objectives', 14) || rpad('key_results', 14)
    || rpad('kr_assignments', 16) || rpad('objective_owners', 18) || 'kr_progress_updates';
  for identity in
    select * from (values
      ('MGMT  (management)',   'd1000000-0000-0000-0000-00000000000a'),
      ('PL_A  (leads A)',      'd1000000-0000-0000-0000-00000000000b'),
      ('EMP_A (KR owner A)',   'd1000000-0000-0000-0000-00000000000c'),
      ('EMP_B (unrelated)',    'd1000000-0000-0000-0000-00000000000d'),
      ('HR1   (HR owner)',     'd1000000-0000-0000-0000-00000000000e'),
      ('HR2   (plain HR)',     'd1000000-0000-0000-0000-00000000000f')
    ) v(label, uid)
  loop
    perform set_config('request.jwt.claim.sub', identity.uid, true);
    outcome := rpad(identity.label, 22);
    foreach relation in array array['objectives', 'key_results', 'kr_assignments', 'objective_owners', 'kr_progress_updates']
    loop
      begin
        execute format('select count(*) from public.%I', relation) into visible;
        outcome := outcome || rpad(visible::text, case relation
          when 'objectives' then 14 when 'key_results' then 14
          when 'kr_assignments' then 16 when 'objective_owners' then 18 else 20 end);
      exception when others then
        outcome := outcome || rpad('ERR ' || SQLSTATE, case relation
          when 'objectives' then 14 when 'key_results' then 14
          when 'kr_assignments' then 16 when 'objective_owners' then 18 else 20 end);
      end;
    end loop;
    raise notice '%', outcome;
  end loop;
end;
$$;

rollback;
