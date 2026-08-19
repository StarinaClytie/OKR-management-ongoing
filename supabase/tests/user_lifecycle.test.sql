begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures: an administrator and an employee in one organization, plus the
-- employee's business records (an objective and a daily report). This mirrors
-- the shape of the `rls.test.sql` fixtures.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000001',
  id,
  'authenticated',
  'authenticated',
  email,
  'not-used',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (values
  ('12000000-0000-0000-0000-000000000001'::uuid, 'admin@lifecycle.test'),
  ('12000000-0000-0000-0000-000000000002'::uuid, 'employee@lifecycle.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000021', 'Lifecycle Organization');

insert into public.profiles (id, organization_id, display_name, is_active) values
  ('12000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000021', 'Admin', true),
  ('12000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000021', 'Employee', true);
-- Existing operational users are explicitly approved (fail-closed default).
update public.profiles set approval_status = 'approved';

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('20000000-0000-0000-0000-000000000021', '12000000-0000-0000-0000-000000000001', 'administrator', true),
  ('20000000-0000-0000-0000-000000000021', '12000000-0000-0000-0000-000000000002', 'employee', true);

insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', 'Lifecycle Project', '12000000-0000-0000-0000-000000000001', 'internal', current_date - 1, current_date + 30);

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('40000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '12000000-0000-0000-0000-000000000002', 'Employee Objective', 'internal', current_date - 1, current_date + 30);

insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date, status, classification, total_hours) values
  ('50000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', '12000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000021', current_date, 'submitted', 'internal', 7.5);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Offboarding (delete account) deactivates the profile without touching the
-- employee's historical business records. `set_user_active` is the DB step the
-- admin delete-account edge function performs after revoking auth access.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_user_active('12000000-0000-0000-0000-000000000002', false)$$,
  'administrator deactivates an offboarded employee'
);
select is(
  (select is_active from public.profiles where id = '12000000-0000-0000-0000-000000000002'),
  false,
  'offboarding flips the profile flag but keeps the profile row'
);
select is(
  (select count(*) from public.objectives where owner_id = '12000000-0000-0000-0000-000000000002'),
  1::bigint,
  'offboarding preserves the employee objective attribution'
);
-- Data-preservation checks bypass RLS: offboarding must not delete the report,
-- regardless of which application role can still read it under the block model.
reset role;
select is(
  (select count(*) from public.daily_reports where author_id = '12000000-0000-0000-0000-000000000002'),
  1::bigint,
  'offboarding preserves the employee daily report attribution'
);
set local role authenticated;
select is(
  (select count(*) from public.profiles where id = '12000000-0000-0000-0000-000000000002'),
  1::bigint,
  'offboarding does not delete the profile'
);
select is(
  (select count(*) from public.user_roles where profile_id = '12000000-0000-0000-0000-000000000002'),
  1::bigint,
  'offboarding keeps the role row (deactivated, not deleted)'
);

-- ---------------------------------------------------------------------------
-- Hard `delete from auth.users` is incompatible with preserving history: the
-- employee profile is referenced by `on delete restrict` foreign keys
-- (objectives.owner_id, daily_reports.author_id), so the cascade is rejected.
-- This documents why delete-account revokes auth access instead of hard-deleting.
-- The DELETE must run under a privileged role rather than `authenticated`, so
-- PostgreSQL reaches FK enforcement instead of failing first on the 42501
-- permission check against `auth.users`.
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$delete from auth.users where id = '12000000-0000-0000-0000-000000000002'$$,
  '23503', 'update or delete on table "profiles" violates foreign key constraint "objectives_owner_id_fkey" on table "objectives"', 'hard auth deletion is blocked by restrict foreign keys that preserve business records'
);

select * from finish();
rollback;
