begin;

select plan(69);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'schema-test@example.com',
  'not-used-by-schema-test',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000003', 'Schema Test Organization');
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000008',
  'authenticated',
  'authenticated',
  'schema-test-other@example.com',
  'not-used-by-schema-test',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000009', 'Other Schema Test Organization');
insert into public.profiles (id, organization_id, display_name) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'Schema Tester');
insert into public.profiles (id, organization_id, display_name) values
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000009', 'Other Schema Tester');
insert into public.projects (id, organization_id, name, leader_id, start_date, due_date) values
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'Schema Test Project', '00000000-0000-0000-0000-000000000002', current_date, current_date);
insert into public.objectives (id, organization_id, project_id, owner_id, title, start_date, due_date) values
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Schema Test Objective', current_date, current_date);
insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date) values
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', current_date);
insert into public.daily_report_revisions (id, organization_id, report_id, revision_number, editor_id, daily_objective, objective_progress, classification) values
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 1, '00000000-0000-0000-0000-000000000002', 'Schema Test Daily Objective', 10, 'internal');
update public.daily_reports set current_revision = 1 where id = '00000000-0000-0000-0000-000000000006';
insert into public.daily_reports (id, organization_id, author_id, project_id, objective_id, report_date) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', current_date + 1);
insert into public.daily_report_revisions (id, organization_id, report_id, revision_number, editor_id, daily_objective, objective_progress, classification) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 1, '00000000-0000-0000-0000-000000000002', 'Second Schema Test Daily Objective', 20, 'internal');
update public.daily_reports set current_revision = 1 where id = '00000000-0000-0000-0000-000000000010';

select has_type('public', 'app_role', 'app_role enum exists');
select has_type('public', 'classification', 'classification enum exists');
select has_type('public', 'report_status', 'report_status enum exists');
select has_type('public', 'kr_measurement_type', 'kr_measurement_type enum exists');
select has_type('public', 'risk_level', 'risk_level enum exists');
select has_type('public', 'attachment_state', 'attachment_state enum exists');

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'user_roles', 'user_roles table exists');
select has_table('public', 'reporting_lines', 'reporting_lines table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'project_members', 'project_members table exists');
select has_table('public', 'collaboration_links', 'collaboration_links table exists');
select has_table('public', 'objectives', 'objectives table exists');
select has_table('public', 'key_results', 'key_results table exists');
select has_table('public', 'progress_baselines', 'progress_baselines table exists');
select has_table('public', 'milestones', 'milestones table exists');
select has_table('public', 'risks', 'risks table exists');
select has_table('public', 'daily_reports', 'daily_reports table exists');
select has_table('public', 'daily_report_revisions', 'daily_report_revisions table exists');
select has_table('public', 'daily_report_revision_krs', 'daily_report_revision_krs table exists');
select has_table('public', 'daily_objectives', 'daily_objectives table exists');
select has_table('public', 'daily_key_results', 'daily_key_results table exists');
select has_table('public', 'report_evidence_links', 'report_evidence_links table exists');
select has_table('public', 'report_attachments', 'report_attachments table exists');

select fk_ok('public', 'profiles', array['id'], 'auth', 'users', array['id'], 'profile identity references auth users');
select fk_ok('public', 'user_roles', array['organization_id', 'profile_id'], 'public', 'profiles', array['organization_id', 'id'], 'role assignment stays in its organization');
select fk_ok('public', 'reporting_lines', array['organization_id', 'manager_id'], 'public', 'profiles', array['organization_id', 'id'], 'reporting lines stay in their organization');
select fk_ok('public', 'reporting_lines', array['organization_id', 'subordinate_id'], 'public', 'profiles', array['organization_id', 'id'], 'reporting lines keep subordinates in their organization');
select fk_ok('public', 'projects', array['organization_id', 'leader_id'], 'public', 'profiles', array['organization_id', 'id'], 'projects stay with their owning leader organization');
select fk_ok('public', 'project_members', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'project members stay with their project organization');
select fk_ok('public', 'project_members', array['organization_id', 'profile_id'], 'public', 'profiles', array['organization_id', 'id'], 'project members stay with their profile organization');
select fk_ok('public', 'collaboration_links', array['organization_id', 'grantee_id'], 'public', 'profiles', array['organization_id', 'id'], 'collaboration links stay in their organization');
select fk_ok('public', 'collaboration_links', array['organization_id', 'grantor_id'], 'public', 'profiles', array['organization_id', 'id'], 'collaboration grants stay with their grantor organization');
select fk_ok('public', 'collaboration_links', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'collaboration project links stay in their organization');
select fk_ok('public', 'objectives', array['organization_id', 'owner_id'], 'public', 'profiles', array['organization_id', 'id'], 'objectives stay with their owner organization');
select fk_ok('public', 'objectives', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'objectives stay with their project organization');
select fk_ok('public', 'key_results', array['organization_id', 'objective_id'], 'public', 'objectives', array['organization_id', 'id'], 'key results stay with their objective organization');
select fk_ok('public', 'key_results', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'key results stay with their project organization');
select fk_ok('public', 'key_results', array['organization_id', 'owner_id'], 'public', 'profiles', array['organization_id', 'id'], 'key results stay with their owner organization');
select fk_ok('public', 'progress_baselines', array['organization_id', 'key_result_id'], 'public', 'key_results', array['organization_id', 'id'], 'baselines stay with their key result organization');
select fk_ok('public', 'milestones', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'milestones stay with their project organization');
select fk_ok('public', 'milestones', array['organization_id', 'key_result_id'], 'public', 'key_results', array['organization_id', 'id'], 'milestones stay with their key result organization');
select fk_ok('public', 'risks', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'risks stay with their project organization');
select fk_ok('public', 'risks', array['organization_id', 'owner_id'], 'public', 'profiles', array['organization_id', 'id'], 'risks stay with their owner organization');
select fk_ok('public', 'daily_reports', array['organization_id', 'author_id'], 'public', 'profiles', array['organization_id', 'id'], 'reports stay with their author organization');
select fk_ok('public', 'daily_reports', array['organization_id', 'project_id'], 'public', 'projects', array['organization_id', 'id'], 'reports stay with their project organization');
select fk_ok('public', 'daily_reports', array['organization_id', 'objective_id'], 'public', 'objectives', array['organization_id', 'id'], 'reports stay with their objective organization');
select fk_ok('public', 'daily_report_revisions', array['organization_id', 'report_id'], 'public', 'daily_reports', array['organization_id', 'id'], 'revisions stay with their report organization');
select fk_ok('public', 'daily_report_revisions', array['organization_id', 'editor_id'], 'public', 'profiles', array['organization_id', 'id'], 'revisions stay with their editor organization');
select fk_ok('public', 'daily_report_revision_krs', array['organization_id', 'revision_id'], 'public', 'daily_report_revisions', array['organization_id', 'id'], 'revision KRs stay with their revision organization');
select fk_ok('public', 'daily_report_revision_krs', array['organization_id', 'linked_key_result_id'], 'public', 'key_results', array['organization_id', 'id'], 'revision KRs stay with linked key result organization');
select fk_ok('public', 'daily_objectives', array['organization_id', 'report_id', 'revision_id'], 'public', 'daily_report_revisions', array['organization_id', 'report_id', 'id'], 'daily objectives stay in their report revision chain');
select fk_ok('public', 'daily_key_results', array['organization_id', 'revision_id', 'revision_kr_id'], 'public', 'daily_report_revision_krs', array['organization_id', 'revision_id', 'id'], 'daily key results stay in their revision chain');
select fk_ok('public', 'report_evidence_links', array['organization_id', 'report_id', 'revision_id'], 'public', 'daily_report_revisions', array['organization_id', 'report_id', 'id'], 'evidence links stay in their report revision chain');
select fk_ok('public', 'report_attachments', array['organization_id', 'report_id'], 'public', 'daily_reports', array['organization_id', 'id'], 'attachments stay in their report organization');
select fk_ok('public', 'report_attachments', array['organization_id', 'uploader_id'], 'public', 'profiles', array['organization_id', 'id'], 'attachments stay with their uploader organization');
select fk_ok('public', 'report_attachments', array['organization_id', 'report_id', 'revision_id'], 'public', 'daily_report_revisions', array['organization_id', 'report_id', 'id'], 'attachments stay in their report revision chain');

select has_check('public', 'key_results', 'key result progress has a check constraint');
select has_check('public', 'risks', 'risk fields have check constraints');
select has_check('public', 'risks', 'risk fields remain constrained');
select has_check('public', 'report_attachments', 'attachment byte size has a check constraint');
select col_is_unique('public', 'report_attachments', array['storage_path'], 'attachment storage paths are unique');
select throws_ok(
  $$update public.daily_report_revisions set daily_objective = 'Mutated' where id = '00000000-0000-0000-0000-000000000007'$$,
  'P0001',
  'Daily report revisions are immutable',
  'revisions reject updates'
);
select throws_ok(
  $$delete from public.daily_report_revisions where id = '00000000-0000-0000-0000-000000000007'$$,
  'P0001',
  'Daily report revisions are immutable',
  'revisions reject deletes'
);
select throws_ok(
  $$insert into public.project_members (organization_id, project_id, profile_id) values ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000008')$$,
  '23503',
  'insert or update on table "project_members" violates foreign key constraint "project_members_organization_project_fkey"',
  'child records reject mismatched organization parents'
);
select throws_ok(
  $$insert into public.daily_objectives (organization_id, report_id, revision_id, content, progress) values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000011', 'Mismatched Snapshot', 10)$$,
  '23503',
  'insert or update on table "daily_objectives" violates foreign key constraint "daily_objectives_organization_report_revision_fkey"',
  'daily objective snapshots reject unrelated report revisions'
);
select throws_ok(
  $$update public.daily_reports set current_revision = 2 where id = '00000000-0000-0000-0000-000000000006'; set constraints all immediate$$,
  '23514',
  'Daily report current revision must match its latest revision',
  'reports reject a pointer to a nonexistent revision'
);
select lives_ok(
  $$delete from public.daily_reports where id = '00000000-0000-0000-0000-000000000010'; set constraints all immediate$$,
  'parent cleanup cascades through immutable revisions'
);

select * from finish();

rollback;
