\set ON_ERROR_STOP on

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cleanup-admin@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cleanup-worker@example.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name)
values ('d2000000-0000-0000-0000-000000000001', 'Cleanup Test Organization');

insert into public.profiles (
  id, organization_id, display_name, approval_status, onboarding_completed
) values
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Cleanup Admin', 'approved', true),
  ('d1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'Cleanup Worker', 'approved', true);

insert into public.user_roles (organization_id, profile_id, role) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'administrator'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'employee');

insert into public.reporting_lines (organization_id, manager_id, subordinate_id)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002');

insert into public.projects (id, organization_id, name, leader_id, start_date, due_date)
values ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Cleanup Project', 'd1000000-0000-0000-0000-000000000001', current_date, current_date + 30);

insert into public.project_members (organization_id, project_id, profile_id)
values ('d2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002');

insert into public.collaboration_links (organization_id, grantor_id, grantee_id, project_id, expires_at)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001', now() + interval '1 day');

insert into public.objectives (id, organization_id, project_id, owner_id, title, start_date, due_date)
values ('d4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Cleanup Objective', current_date, current_date + 30);

insert into public.key_results (id, organization_id, objective_id, project_id, owner_id, title, measurement_type, start_date, due_date)
values ('d5000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'Cleanup KR', 'percentage', current_date, current_date + 30);

insert into public.progress_baselines (organization_id, key_result_id, planned_for, planned_value)
values ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', current_date, 10);

insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
values ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'owner');

insert into public.kr_progress_updates (organization_id, kr_id, author_id, previous_progress, new_progress, summary)
values ('d2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 0, 10, 'Cleanup progress');

insert into public.milestones (organization_id, project_id, key_result_id, title, planned_date)
values ('d2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'Cleanup milestone', current_date + 1);

insert into public.risks (
  organization_id, project_id, owner_id, title, reason, mitigation,
  probability, impact, level, key_result_id
)
values ('d2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Cleanup risk', 'Test', 'Delete', 1, 1, 'low', 'd5000000-0000-0000-0000-000000000001');

set session_replication_role = replica;

insert into public.daily_reports (id, organization_id, author_id, report_date, total_hours, current_revision)
values ('d6000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', current_date, 1, 1);

insert into public.daily_report_revisions (id, organization_id, report_id, revision_number, editor_id, daily_objective, objective_progress, classification)
values ('d7000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 1, 'd1000000-0000-0000-0000-000000000002', 'Cleanup report', 10, 'internal');

insert into public.daily_okr_blocks (organization_id, report_id, revision_id, position, daily_objective, linked_key_result_id, hours)
values ('d2000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 1, 'Cleanup block', 'd5000000-0000-0000-0000-000000000001', 1);

insert into public.report_attachments (id, organization_id, report_id, revision_id, uploader_id, original_name, storage_path, mime_type, byte_size, classification, state)
values ('d8000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'daily.txt', 'organization/d2/reports/d6/d8/daily.txt', 'text/plain', 10, 'internal', 'uploaded');

set session_replication_role = origin;

insert into public.resources (id, organization_id, name, owner_id, location, created_by)
values ('d9000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Cleanup resource', 'd1000000-0000-0000-0000-000000000001', 'Test shelf', 'd1000000-0000-0000-0000-000000000001');

insert into public.resource_attachments (id, organization_id, resource_id, uploader_id, file_name, storage_path, mime_type, size_bytes)
values ('da000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'resource.txt', 'organization/d2/resources/d9/da/resource.txt', 'text/plain', 10);

insert into public.user_notifications (organization_id, recipient_id, actor_id, notification_type, resource_id)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'resource_owner_assigned', 'd9000000-0000-0000-0000-000000000001');
