begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures: one organization with management, two project leaders, an employee,
-- and an inactive project leader.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000001', id, 'authenticated', 'authenticated', email, 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('c1000000-0000-0000-0000-000000000001'::uuid, 'management@obj-leader.test'),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 'pl1@obj-leader.test'),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 'pl2@obj-leader.test'),
  ('c1000000-0000-0000-0000-000000000004'::uuid, 'employee@obj-leader.test'),
  ('c1000000-0000-0000-0000-000000000005'::uuid, 'inactive-pl@obj-leader.test')
) users(id, email);

insert into public.organizations (id, name) values ('c2000000-0000-0000-0000-000000000001', 'Objective Leader Organization');

insert into public.profiles (id, organization_id, display_name, clearance) values
  ('c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Management', 'confidential'),
  ('c1000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Project Leader One', 'confidential'),
  ('c1000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'Project Leader Two', 'confidential'),
  ('c1000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'Employee', 'confidential'),
  ('c1000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'Inactive Project Leader', 'confidential');

update public.profiles set approval_status = 'approved'
where id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000005'
);
update public.profiles set is_active = false where id = 'c1000000-0000-0000-0000-000000000005';

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'management', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'project_leader', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'project_leader', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'employee', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'project_leader', false);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Management creates an Objective led by PL1. create_objective creates the
-- backing project and already adds PL1 as a member.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_objective('Leader Objective', null, 'c1000000-0000-0000-0000-000000000002', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'management creates an Objective led by PL1'
);

-- 1. Objective is initially led by PL1.
select is(
  (select owner_id from public.objectives where title = 'Leader Objective'),
  'c1000000-0000-0000-0000-000000000002',
  'objective is initially led by PL1'
);

-- 2. PL2 is an eligible project leader (read as the table owner: `roles_read`
--    is self-or-administrator, so management cannot read another user's role).
reset role;
select is(
  (select count(*) from public.user_roles where profile_id = 'c1000000-0000-0000-0000-000000000003' and role = 'project_leader' and is_active),
  1::bigint,
  'PL2 holds an active project_leader role'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);

-- 3. Management reassigns the Objective leader PL1 -> PL2.
select lives_ok(
  $$select public.update_objective(
    (select id from public.objectives where title = 'Leader Objective'),
    'Leader Objective', null, 'c1000000-0000-0000-0000-000000000003', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'management updates the Objective leader from PL1 to PL2'
);

-- 4. projects.leader_id becomes PL2.
select is(
  (select leader_id from public.projects where id = (select project_id from public.objectives where title = 'Leader Objective')),
  'c1000000-0000-0000-0000-000000000003',
  'projects.leader_id becomes PL2'
);

-- 5. PL2 is automatically inserted into project_members.
select is(
  (select count(*) from public.project_members pm
   where pm.project_id = (select project_id from public.objectives where title = 'Leader Objective')
     and pm.profile_id = 'c1000000-0000-0000-0000-000000000003'),
  1::bigint,
  'PL2 is automatically added to project_members'
);

-- 6. PL1 is not automatically removed from project_members.
select is(
  (select count(*) from public.project_members pm
   where pm.project_id = (select project_id from public.objectives where title = 'Leader Objective')
     and pm.profile_id = 'c1000000-0000-0000-0000-000000000002'),
  1::bigint,
  'PL1 is not automatically removed from project_members'
);

-- 7. Repeating the equivalent update creates no duplicate membership.
select lives_ok(
  $$select public.update_objective(
    (select id from public.objectives where title = 'Leader Objective'),
    'Leader Objective', null, 'c1000000-0000-0000-0000-000000000003', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  'repeating the equivalent leader update succeeds'
);
select is(
  (select count(*) from public.project_members pm
   where pm.project_id = (select project_id from public.objectives where title = 'Leader Objective')
     and pm.profile_id = 'c1000000-0000-0000-0000-000000000003'),
  1::bigint,
  'repeated update does not create a duplicate membership row'
);

-- 8. invalid / inactive / non-project-leader assignment remains rejected.
select throws_ok(
  $$select public.update_objective(
    (select id from public.objectives where title = 'Leader Objective'),
    'Leader Objective', null, 'c1000000-0000-0000-0000-000000000004', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  '22023', 'Objective leader must be a project leader', 'employee (non-project-leader) is rejected as Objective leader'
);
select throws_ok(
  $$select public.update_objective(
    (select id from public.objectives where title = 'Leader Objective'),
    'Leader Objective', null, 'c1000000-0000-0000-0000-000000000005', '2026-Q4', current_date, current_date + 90, 'medium', '', 'confidential')$$,
  '22023', 'Objective leader must be a project leader', 'inactive project leader is rejected as Objective leader'
);

-- 9. Transaction stays atomic when leader validation fails: the objective and
--    project leader are still PL2 after the rejected updates above.
select is(
  (select owner_id from public.objectives where title = 'Leader Objective'),
  'c1000000-0000-0000-0000-000000000003',
  'rejected update leaves the Objective owner unchanged'
);
select is(
  (select leader_id from public.projects where id = (select project_id from public.objectives where title = 'Leader Objective')),
  'c1000000-0000-0000-0000-000000000003',
  'rejected update leaves projects.leader_id unchanged'
);

select * from finish();
rollback;
