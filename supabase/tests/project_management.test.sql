begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

-- ---------------------------------------------------------------------------
-- Fixtures: two organizations, one management/administrator/leader/member/non-
-- member/HR per org A, plus inactive and onboarding-incomplete members and an
-- org-B management/employee for cross-organization rejection.
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
  ('14000000-0000-0000-0000-000000000001'::uuid, 'mgrA@project.test'),
  ('14000000-0000-0000-0000-000000000002'::uuid, 'adminA@project.test'),
  ('14000000-0000-0000-0000-000000000003'::uuid, 'leaderA@project.test'),
  ('14000000-0000-0000-0000-000000000004'::uuid, 'memberA@project.test'),
  ('14000000-0000-0000-0000-000000000005'::uuid, 'nonmemberA@project.test'),
  ('14000000-0000-0000-0000-000000000006'::uuid, 'hrA@project.test'),
  ('14000000-0000-0000-0000-000000000007'::uuid, 'inactiveA@project.test'),
  ('14000000-0000-0000-0000-000000000008'::uuid, 'onboardingA@project.test'),
  ('14000000-0000-0000-0000-000000000009'::uuid, 'mgrB@project.test'),
  ('14000000-0000-0000-0000-000000000010'::uuid, 'empB@project.test'),
  ('14000000-0000-0000-0000-000000000011'::uuid, 'lowclearA@project.test'),
  ('14000000-0000-0000-0000-000000000012'::uuid, 'adminA2@project.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('21000000-0000-0000-0000-000000000001', 'Project Org A'),
  ('21000000-0000-0000-0000-000000000002', 'Project Org B');

insert into public.profiles (id, organization_id, display_name, clearance, is_active, onboarding_completed)
select id, organization_id, display_name, clearance, is_active, onboarding_completed
from (values
  ('14000000-0000-0000-0000-000000000001'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Management A', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000002'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Administrator A', 'restricted'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000003'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Leader A', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000004'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Member A', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000005'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Non-member A', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000006'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'HR A', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000007'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Inactive A', 'confidential'::public.classification, false, true),
  ('14000000-0000-0000-0000-000000000008'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Onboarding A', 'confidential'::public.classification, true, false),
  ('14000000-0000-0000-0000-000000000009'::uuid, '21000000-0000-0000-0000-000000000002'::uuid, 'Management B', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000010'::uuid, '21000000-0000-0000-0000-000000000002'::uuid, 'Employee B', 'confidential'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000011'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Low Clearance A', 'internal'::public.classification, true, true),
  ('14000000-0000-0000-0000-000000000012'::uuid, '21000000-0000-0000-0000-000000000001'::uuid, 'Administrator A2', 'confidential'::public.classification, true, true)
) as p(id, organization_id, display_name, clearance, is_active, onboarding_completed);

-- Backfill mirrors the migration: onboarding-complete members are explicitly
-- approved; "Onboarding A" (onboarding_completed = false) keeps the pending
-- fail-closed default, so it is not an eligible assignee.
update public.profiles set approval_status = 'approved' where onboarding_completed = true;

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'management', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002', 'administrator', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000003', 'project_leader', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000004', 'employee', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000005', 'employee', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000006', 'hr', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000007', 'employee', false),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000008', 'employee', true),
  ('21000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000009', 'management', true),
  ('21000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000010', 'employee', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000011', 'employee', true),
  ('21000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000012', 'administrator', true);

-- Fixture projects for read/archive/classification/cross-org tests (inserted as
-- postgres, bypassing RLS). Alpha/Beta/Gamma are created later through the RPC.
insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date) values
  ('22000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Fixture Project', '14000000-0000-0000-0000-000000000003', 'confidential', current_date, current_date + 30),
  ('22000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Org B Project', '14000000-0000-0000-0000-000000000009', 'confidential', current_date, current_date + 30),
  ('22000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', 'Restricted Project', '14000000-0000-0000-0000-000000000002', 'restricted', current_date, current_date + 30);

insert into public.project_members (organization_id, project_id, profile_id) values
  ('21000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000004');

insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date) values
  ('22000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000004', 'Fixture Objective', 'confidential', current_date, current_date + 30);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Create authorization and validation.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_project('Alpha', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['14000000-0000-0000-0000-000000000004']::uuid[])$$,
  'management creates a project in org A'
);
select is(
  (select count(*) from public.projects where name = 'Alpha'),
  1::bigint,
  'created project is persisted'
);
select is(
  (select leader_id::text from public.projects where name = 'Alpha'),
  '14000000-0000-0000-0000-000000000003',
  'created project stores the selected leader'
);
select is(
  (select count(*) from public.project_members pm join public.projects p on p.id = pm.project_id where p.name = 'Alpha'),
  2::bigint,
  'created project stores the initial member and the leader atomically'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_project('Beta', '', '14000000-0000-0000-0000-000000000004', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  'administrator creates a project in org A'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.create_project('Nope', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '42501', 'Only management or administrators can create projects', 'employee cannot create a project'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.create_project('Nope', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '42501', 'Only management or administrators can create projects', 'HR cannot create a project'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_project('CrossOrg', '', '14000000-0000-0000-0000-000000000009', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project leader is not an eligible organization member', 'leader from org B is rejected'
);
select throws_ok(
  $$select public.create_project('InactiveLeader', '', '14000000-0000-0000-0000-000000000007', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project leader is not an eligible organization member', 'inactive leader is rejected'
);
select throws_ok(
  $$select public.create_project('OnboardingLeader', '', '14000000-0000-0000-0000-000000000008', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project leader is not an eligible organization member', 'pending-approval leader is rejected'
);
select throws_ok(
  $$select public.create_project('CrossOrgMember', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['14000000-0000-0000-0000-000000000010']::uuid[])$$,
  '22023', 'Project member is not an eligible organization member', 'member from org B is rejected'
);
select throws_ok(
  $$select public.create_project('InactiveMember', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['14000000-0000-0000-0000-000000000007']::uuid[])$$,
  '22023', 'Project member is not an eligible organization member', 'inactive member is rejected'
);
select throws_ok(
  $$select public.create_project('OnboardingMember', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['14000000-0000-0000-0000-000000000008']::uuid[])$$,
  '22023', 'Project member is not an eligible organization member', 'pending-approval member is rejected'
);
select throws_ok(
  $$select public.create_project('BadDates', '', '14000000-0000-0000-0000-000000000003', current_date + 30, current_date, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project dates are invalid', 'inverted date range is rejected'
);
select throws_ok(
  $$select public.create_project('   ', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project name is required', 'empty project name is rejected'
);
select throws_ok(
  $$select public.create_project('Restricted', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'restricted', 'active', '{}'::uuid[])$$,
  '42501', 'Project classification exceeds user clearance', 'management cannot create a project above its clearance'
);

-- Duplicate members are de-duplicated by the RPC.
select lives_ok(
  $$select public.create_project('Gamma', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['14000000-0000-0000-0000-000000000004','14000000-0000-0000-0000-000000000004','14000000-0000-0000-0000-000000000005']::uuid[])$$,
  'management creates a project with duplicate member ids'
);
select is(
  (select count(*) from public.project_members pm join public.projects p on p.id = pm.project_id where p.name = 'Gamma'),
  3::bigint,
  'duplicate member ids do not create duplicate rows and the leader is included'
);

-- ---------------------------------------------------------------------------
-- Read authorization.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.projects where name = 'Alpha'), 1::bigint, 'project leader reads their own project');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.projects where name = 'Alpha'), 1::bigint, 'assigned member reads their project');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.projects where name = 'Alpha'), 0::bigint, 'non-member employee cannot read an unassigned project');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.projects), 4::bigint, 'management reads all organization projects');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000006', true);
select is((select count(*) from public.projects), 0::bigint, 'HR gains no detailed project access');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.projects where name = 'Restricted Project'), 0::bigint, 'management cannot read a project above its clearance');

-- ---------------------------------------------------------------------------
-- Administrator read parity.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.projects where id = '22000000-0000-0000-0000-000000000001'), 1::bigint, 'administrator reads a project without being leader or member');
select is(
  public.get_project_detail('22000000-0000-0000-0000-000000000001') ->> 'name',
  'Fixture Project',
  'administrator reads project detail'
);
select is((select count(*) from public.projects where id = '22000000-0000-0000-0000-000000000002'), 0::bigint, 'administrator cannot read an organization B project');
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000012', true);
select is((select count(*) from public.projects where id = '22000000-0000-0000-0000-000000000003'), 0::bigint, 'administrator without clearance cannot read a higher-classified project');

-- ---------------------------------------------------------------------------
-- Clearance-validated assignment and classification escalation.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_project('LowLeader', '', '14000000-0000-0000-0000-000000000011', current_date, current_date + 30, 'confidential', 'active', '{}'::uuid[])$$,
  '22023', 'Project leader is not an eligible organization member', 'low-clearance leader is rejected for a higher-classification project'
);
select throws_ok(
  $$select public.create_project('LowMember', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'confidential', 'active', array['14000000-0000-0000-0000-000000000011']::uuid[])$$,
  '22023', 'Project member is not an eligible organization member', 'low-clearance member is rejected for a higher-classification project'
);
select lives_ok(
  $$select public.create_project('LowOk', '', '14000000-0000-0000-0000-000000000011', current_date, current_date + 30, 'internal', 'active', '{}'::uuid[])$$,
  'low-clearance user is accepted for a project within their clearance'
);

select lives_ok(
  $$select public.create_project('EscalateLeader', '', '14000000-0000-0000-0000-000000000011', current_date, current_date + 30, 'internal', 'active', '{}'::uuid[])$$,
  'management creates an internal project led by a low-clearance user'
);
select throws_ok(
  $$select public.update_project((select id from public.projects where name = 'EscalateLeader'), 'EscalateLeader', '', current_date, current_date + 30, 'confidential', 'active')$$,
  '22023', 'Project leader lacks clearance for the new classification', 'classification escalation is rejected when the leader lacks clearance'
);
select lives_ok(
  $$select public.create_project('EscalateMember', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'internal', 'active', array['14000000-0000-0000-0000-000000000011']::uuid[])$$,
  'management creates an internal project with a low-clearance member'
);
select throws_ok(
  $$select public.update_project((select id from public.projects where name = 'EscalateMember'), 'EscalateMember', '', current_date, current_date + 30, 'confidential', 'active')$$,
  '22023', 'A project member lacks clearance for the new classification', 'classification escalation is rejected when a member lacks clearance'
);
select lives_ok(
  $$select public.create_project('EscalateOk', '', '14000000-0000-0000-0000-000000000003', current_date, current_date + 30, 'internal', 'active', array['14000000-0000-0000-0000-000000000004']::uuid[])$$,
  'management creates an internal project with a qualifying team'
);
select lives_ok(
  $$select public.update_project((select id from public.projects where name = 'EscalateOk'), 'EscalateOk', '', current_date, current_date + 30, 'confidential', 'active')$$,
  'classification escalation succeeds when the leader and members qualify'
);
select is(
  (select classification::text from public.projects where name = 'EscalateOk'),
  'confidential',
  'escalated project persists the new classification'
);

-- ---------------------------------------------------------------------------
-- Edit, leader reassignment, membership, archive.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.update_project((select id from public.projects where name = 'Alpha'), 'Alpha Renamed', '', current_date, current_date + 30, 'confidential', 'active')$$,
  'project leader edits permitted metadata of their own project'
);
select is((select name from public.projects where id = (select id from public.projects where name = 'Alpha Renamed')), 'Alpha Renamed', 'leader edit persists');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.update_project((select id from public.projects where name = 'Beta'), 'Leader Takes Over', '', current_date, current_date + 30, 'confidential', 'active')$$,
  '42501', 'Project is not editable by the current user', 'leader cannot edit another project'
);
select throws_ok(
  $$select public.set_project_leader((select id from public.projects where name = 'Alpha Renamed'), '14000000-0000-0000-0000-000000000004')$$,
  '42501', 'Only management or administrators can change the project leader', 'project leader cannot reassign the leader'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_project_leader((select id from public.projects where name = 'Alpha Renamed'), '14000000-0000-0000-0000-000000000004')$$,
  'management reassigns the project leader'
);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.projects where name = 'Alpha Renamed'), 1::bigint, 'former leader retains member access after reassignment');
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.projects where name = 'Alpha Renamed'), 1::bigint, 'new leader gains access after reassignment');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_project_members((select id from public.projects where name = 'Alpha Renamed'), array['14000000-0000-0000-0000-000000000005']::uuid[])$$,
  'management replaces the member roster'
);
select is(
  (select count(*) from public.project_members pm join public.projects p on p.id = pm.project_id where p.name = 'Alpha Renamed'),
  1::bigint,
  'membership set replaces atomically'
);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.projects where name = 'Alpha Renamed'), 1::bigint, 'newly assigned member reads the project');

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.archive_project('22000000-0000-0000-0000-000000000001')$$,
  'management archives a project'
);
select is(
  (select status::text from public.projects where id = '22000000-0000-0000-0000-000000000001'),
  'archived',
  'archived project keeps its row with archived status'
);
select is(
  (select count(*) from public.objectives where project_id = '22000000-0000-0000-0000-000000000001'),
  1::bigint,
  'archive preserves dependent records'
);
select throws_ok(
  $$select public.set_project_members('22000000-0000-0000-0000-000000000001', array['14000000-0000-0000-0000-000000000004']::uuid[])$$,
  '22023', 'Archived projects cannot change membership', 'archived project rejects membership changes'
);

-- Archived projects are frozen: only restore_project may un-archive them.
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.update_project('22000000-0000-0000-0000-000000000001', 'Fixture Project', '', current_date, current_date + 30, 'confidential', 'active')$$,
  '22023', 'Archived projects cannot be edited', 'archived project rejects metadata edits'
);
select throws_ok(
  $$select public.set_project_status('22000000-0000-0000-0000-000000000001', 'active')$$,
  '22023', 'Archived projects cannot change status', 'archived project rejects status changes'
);
select throws_ok(
  $$select public.set_project_leader('22000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000004')$$,
  '22023', 'Archived projects cannot change leader', 'archived project rejects leader reassignment'
);

select lives_ok(
  $$select public.restore_project('22000000-0000-0000-0000-000000000001')$$,
  'management restores an archived project'
);
select is(
  (select status::text from public.projects where id = '22000000-0000-0000-0000-000000000001'),
  'active',
  'restore sets the project back to active'
);
select is(
  (select archived_at is null from public.projects where id = '22000000-0000-0000-0000-000000000001'),
  true,
  'restore clears archived_at'
);
select lives_ok(
  $$select public.update_project('22000000-0000-0000-0000-000000000001', 'Fixture Project Restored', '', current_date, current_date + 30, 'confidential', 'active')$$,
  'normal editing resumes after restore'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.set_project_leader('22000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000010')$$,
  '42501', 'Project is not editable by the current user', 'cross-organization mutation is rejected'
);

select * from finish();
rollback;
