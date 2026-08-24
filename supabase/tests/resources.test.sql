begin;

create extension if not exists pgtap with schema extensions;

select plan(105);

-- ---------------------------------------------------------------------------
-- Fixtures: org A (admin/management/leader/employee owner/employee peer/HR/
-- inactive/onboarding-incomplete) and org B (management/employee) for cross-org
-- rejection.
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
  ('15000000-0000-0000-0000-000000000001'::uuid, 'admin@resource.test'),
  ('15000000-0000-0000-0000-000000000002'::uuid, 'mgr@resource.test'),
  ('15000000-0000-0000-0000-000000000003'::uuid, 'leader@resource.test'),
  ('15000000-0000-0000-0000-000000000004'::uuid, 'owner@resource.test'),
  ('15000000-0000-0000-0000-000000000005'::uuid, 'peer@resource.test'),
  ('15000000-0000-0000-0000-000000000006'::uuid, 'hr@resource.test'),
  ('15000000-0000-0000-0000-000000000007'::uuid, 'inactive@resource.test'),
  ('15000000-0000-0000-0000-000000000008'::uuid, 'onboarding@resource.test'),
  ('15000000-0000-0000-0000-000000000009'::uuid, 'mgrb@resource.test'),
  ('15000000-0000-0000-0000-000000000010'::uuid, 'empb@resource.test'),
  ('15000000-0000-0000-0000-000000000011'::uuid, 'norole@resource.test')
) as users(id, email);

insert into public.organizations (id, name) values
  ('23000000-0000-0000-0000-000000000001', 'Resource Org A'),
  ('23000000-0000-0000-0000-000000000002', 'Resource Org B');

insert into public.profiles (id, organization_id, display_name, email, clearance, is_active, onboarding_completed)
select id, organization_id, display_name, email, clearance, is_active, onboarding_completed
from (values
  ('15000000-0000-0000-0000-000000000001'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Administrator A', 'admin@resource.test', 'restricted'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000002'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Management A', 'mgr@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000003'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Leader A', 'leader@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000004'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Owner A', 'owner@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000005'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Peer A', 'peer@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000006'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'HR A', 'hr@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000007'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Inactive A', 'inactive@resource.test', 'confidential'::public.classification, false, true),
  ('15000000-0000-0000-0000-000000000008'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'Onboarding A', 'onboarding@resource.test', 'confidential'::public.classification, true, false),
  ('15000000-0000-0000-0000-000000000009'::uuid, '23000000-0000-0000-0000-000000000002'::uuid, 'Management B', 'mgrb@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000010'::uuid, '23000000-0000-0000-0000-000000000002'::uuid, 'Employee B', 'empb@resource.test', 'confidential'::public.classification, true, true),
  ('15000000-0000-0000-0000-000000000011'::uuid, '23000000-0000-0000-0000-000000000001'::uuid, 'No Role A', 'norole@resource.test', 'confidential'::public.classification, true, true)
) as p(id, organization_id, display_name, email, clearance, is_active, onboarding_completed);

-- Backfill mirrors the migration: onboarding-complete members are explicitly
-- approved; "Onboarding A" (onboarding_completed = false) keeps the pending
-- fail-closed default and therefore has no operational access.
update public.profiles set approval_status = 'approved' where onboarding_completed = true;

insert into public.user_roles (organization_id, profile_id, role, is_active) values
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'administrator', true),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'management', true),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000003', 'project_leader', true),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000004', 'employee', true),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000005', 'employee', true),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000006', 'hr', true),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000007', 'employee', false),
  ('23000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000008', 'employee', true),
  ('23000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000009', 'management', true),
  ('23000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000010', 'employee', true);

-- Fixture resource owned by Owner A, with a fixture attachment.
insert into public.resources (id, organization_id, name, category, resource_kind, owner_id, location, status, created_by) values
  ('24000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'Fixture Lens', 'optics', 'durable', '15000000-0000-0000-0000-000000000004', 'Optics Lab / Cabinet A', 'available', '15000000-0000-0000-0000-000000000004');

insert into public.resource_attachments (id, organization_id, resource_id, uploader_id, file_name, storage_path, mime_type, size_bytes) values
  ('24000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000004', 'lens-manual.pdf', 'organization/23000000-0000-0000-0000-000000000001/resources/24000000-0000-0000-0000-000000000001/manual.pdf', 'application/pdf', 1024);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Creation and automatic ownership.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.create_resource('Lens Set', 'optics', 'durable', '', 'Optics Lab / Cabinet A', null, 'Thorlabs', null, '', null, null, null)$$,
  'employee creates a resource'
);
select is(
  (select owner_id::text from public.resources where name = 'Lens Set'),
  '15000000-0000-0000-0000-000000000004',
  'creator automatically becomes owner'
);
select is(
  (select created_by::text from public.resources where name = 'Lens Set'),
  '15000000-0000-0000-0000-000000000004',
  'created_by is the authenticated creator'
);
select lives_ok(
  $$select public.update_resource((select id from public.resources where name = 'Lens Set'), 'Lens Set', 'optics', 'durable', '', 'Optics Lab / Cabinet B', null, 'Thorlabs', null, '', null, null, null, 'available')$$,
  'owner edits their own resource'
);
select is(
  (select owner_id::text from public.resources where name = 'Lens Set'),
  '15000000-0000-0000-0000-000000000004',
  'owner_id is immutable (browser-supplied owner cannot be spoofed)'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_resource('Vacuum Pump', 'vacuum', 'durable', '', 'Clean Room / Shelf B2', null, null, null, '', null, null, null)$$,
  'management creates a resource'
);
select is(
  (select owner_id::text from public.resources where name = 'Vacuum Pump'),
  '15000000-0000-0000-0000-000000000002',
  'management creator owns the resource'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_resource('Admin Resource', 'tools', 'durable', '', 'Workshop / Drawer 1', null, null, null, '', null, null, null)$$,
  'administrator creates a resource'
);
select is(
  (select owner_id::text from public.resources where name = 'Admin Resource'),
  '15000000-0000-0000-0000-000000000001',
  'administrator creator owns the resource'
);

-- ---------------------------------------------------------------------------
-- Read authorization.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.resources where name = 'Fixture Lens'), 1::bigint, 'same-org peer reads a resource');
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.resources where name = 'Fixture Lens'), 1::bigint, 'project leader reads a resource');
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000006', true);
select is((select count(*) from public.resources where name = 'Fixture Lens'), 1::bigint, 'HR reads a resource');
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.resources), 0::bigint, 'org B management cannot read org A resources');
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000010', true);
select is((select count(*) from public.resources), 0::bigint, 'org B employee cannot read org A resources');
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000009', true);
select is(
  public.get_resource_detail('24000000-0000-0000-0000-000000000001'),
  null,
  'cross-org detail returns null (existence not leaked)'
);

-- ---------------------------------------------------------------------------
-- Create authorization.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000007', true);
select throws_ok(
  $$select public.create_resource('Nope', 'tools', 'durable', '', 'Nowhere', null, null, null, '', null, null, null)$$,
  '42501', 'Resources are not writable by the current user', 'inactive user cannot create'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000008', true);
select throws_ok(
  $$select public.create_resource('Nope', 'tools', 'durable', '', 'Nowhere', null, null, null, '', null, null, null)$$,
  '42501', 'Resources are not writable by the current user', 'pending-approval user cannot create'
);

-- ---------------------------------------------------------------------------
-- Edit authorization.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.update_resource('24000000-0000-0000-0000-000000000001', 'Fixture Lens', 'optics', 'durable', '', 'Optics Lab / Cabinet A', null, null, null, '', null, null, null, 'available')$$,
  '42501', 'Resource is not editable by the current user', 'unrelated employee cannot edit'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_resource('24000000-0000-0000-0000-000000000001', 'Fixture Lens', 'optics', 'durable', 'Updated by admin', 'Optics Lab / Cabinet A', null, null, null, '', null, null, null, 'available')$$,
  'administrator edits any resource'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.update_resource('24000000-0000-0000-0000-000000000001', 'Fixture Lens', 'optics', 'durable', 'Updated by management', 'Optics Lab / Cabinet A', null, null, null, '', null, null, null, 'available')$$,
  'management edits any resource'
);

-- ---------------------------------------------------------------------------
-- Field validation.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.create_resource('Bad Quantity', 'consumables', 'consumable', '', 'Store Room', null, null, null, '', null, -1, 'pieces')$$,
  '22023', 'Resource quantity cannot be negative', 'negative quantity rejected'
);
select throws_ok(
  $$select public.create_resource('   ', 'tools', 'durable', '', 'Store Room', null, null, null, '', null, null, null)$$,
  '22023', 'Resource name is required', 'empty name rejected'
);
select throws_ok(
  $$select public.create_resource('No Location', 'tools', 'durable', '', '   ', null, null, null, '', null, null, null)$$,
  '22023', 'Resource location is required', 'empty location rejected'
);

-- ---------------------------------------------------------------------------
-- Report problem and server-side owner resolution.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'location_incorrect', 'Cannot find the lens at the recorded location')$$,
  'any valid user can report a problem'
);
select is(
  (select reporter_id::text from public.resource_problems where description = 'Cannot find the lens at the recorded location'),
  '15000000-0000-0000-0000-000000000005',
  'reporter is always auth.uid()'
);
-- The notification audit trail is intentionally not readable by the browser
-- (authenticated role), so verify it as postgres, then resume authenticated.
reset role;
select is(
  (select recipient_id::text from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Cannot find the lens at the recorded location'),
  '15000000-0000-0000-0000-000000000004',
  'notification targets the resource owner server-side'
);
select is(
  (select recipient_email from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Cannot find the lens at the recorded location'),
  'owner@resource.test',
  'notification resolves the owner email server-side'
);
select is(
  (select n.status::text from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Cannot find the lens at the recorded location'),
  'pending',
  'notification starts in pending state'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000009', true);
select throws_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'missing', 'Cross-org attempt')$$,
  '42501', 'Resource problem is not reportable by the current user', 'cross-org report rejected'
);

-- ---------------------------------------------------------------------------
-- Resolution authorization.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.resolve_resource_problem((select id from public.resource_problems where description = 'Cannot find the lens at the recorded location'), 'Moved to Cabinet B and updated location')$$,
  'owner resolves a problem on their resource'
);
select is(
  (select resolved_by::text from public.resource_problems where description = 'Cannot find the lens at the recorded location'),
  '15000000-0000-0000-0000-000000000004',
  'resolution records the resolver'
);
select ok(
  (select resolved_at is not null from public.resource_problems where description = 'Cannot find the lens at the recorded location'),
  'resolution records its timestamp'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'damaged', 'Scratched coating')$$,
  'a second user reports an independent problem'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.resolve_resource_problem((select id from public.resource_problems where description = 'Scratched coating'), 'Unrelated attempt')$$,
  '42501', 'Resource problem is not resolvable by the current user', 'unrelated employee cannot resolve'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.resolve_resource_problem((select id from public.resource_problems where description = 'Scratched coating'), 'Replaced the optic')$$,
  'administrator resolves any problem'
);

-- ---------------------------------------------------------------------------
-- History and archive.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.resource_problems where resource_id = '24000000-0000-0000-0000-000000000001'),
  2::bigint,
  'problem history is preserved (resolved problems are not deleted)'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.archive_resource('24000000-0000-0000-0000-000000000001')$$,
  '42501', 'Resource is not archivable by the current user', 'owner cannot archive a resource'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.archive_resource('24000000-0000-0000-0000-000000000001')$$,
  'management archives a resource'
);
select is(
  (select status::text from public.resources where id = '24000000-0000-0000-0000-000000000001'),
  'archived',
  'archived resource records archived status'
);
select ok(
  (select archived_at is not null from public.resources where id = '24000000-0000-0000-0000-000000000001'),
  'archived resource records its timestamp'
);
select is(
  (select count(*) from public.resource_problems where resource_id = '24000000-0000-0000-0000-000000000001'),
  2::bigint,
  'archive preserves problems'
);
select is(
  (select count(*) from public.resource_attachments where resource_id = '24000000-0000-0000-0000-000000000001'),
  1::bigint,
  'archive preserves attachments'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'missing', 'Cannot find')$$,
  '22023', 'Archived resources cannot be reported', 'archived resource rejects new reports'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.update_resource('24000000-0000-0000-0000-000000000001', 'Fixture Lens', 'optics', 'durable', '', 'Optics Lab / Cabinet A', null, null, null, '', null, null, null, 'available')$$,
  '22023', 'Archived resources cannot be edited', 'archived resource rejects edits'
);
select throws_ok(
  $$select public.restore_resource('24000000-0000-0000-0000-000000000001')$$,
  '42501', 'Resource is not archivable by the current user', 'owner cannot restore an archived resource'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.restore_resource('24000000-0000-0000-0000-000000000001')$$,
  'management restores an archived resource'
);
select is(
  (select status::text from public.resources where id = '24000000-0000-0000-0000-000000000001'),
  'available',
  'restore sets the resource back to available'
);
select ok(
  (select archived_at is null from public.resources where id = '24000000-0000-0000-0000-000000000001'),
  'restore clears archived_at'
);

-- ---------------------------------------------------------------------------
-- Notification retry & idempotency.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'malfunction', 'Notification state machine fixture')$$,
  'report a problem to exercise the notification state machine'
);

-- The notification is created pending, targeting the owner server-side. The
-- audit trail is invisible to authenticated, so verify it as postgres.
reset role;
select is(
  (select n.status::text from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture'),
  'pending',
  'a new notification starts pending'
);
select is(
  (select n.recipient_id::text from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture'),
  '15000000-0000-0000-0000-000000000004',
  'the recipient is the resource owner (never client-supplied)'
);

-- Atomic claim: the first claim is accepted, a concurrent second is rejected.
select is(
  public.claim_resource_problem_notification((select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture')),
  'claimed',
  'the first delivery claim is accepted'
);
select is(
  (select n.status::text from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture'),
  'sending',
  'a claimed notification enters the sending state'
);
select ok(
  (select n.attempted_at is not null from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture'),
  'a claim records attempted_at'
);
select is(
  public.claim_resource_problem_notification((select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture')),
  'in_progress',
  'a concurrent second claim is rejected (idempotent)'
);

-- Simulate a successful send, then verify a sent notification never sends again.
update public.resource_problem_notifications
set status = 'sent', sent_at = timezone('utc', now()), error_code = null
where id = (select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture');
select is(
  public.claim_resource_problem_notification((select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture')),
  'sent',
  'a sent notification is never claimed again'
);

-- Simulate a failed send, then verify the failure preserves the problem and the
-- notification can be retried.
update public.resource_problem_notifications
set status = 'failed', error_code = 'provider_error', sent_at = null
where id = (select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture');
select is(
  (select count(*) from public.resource_problems where description = 'Notification state machine fixture'),
  1::bigint,
  'a failed notification preserves the problem'
);
select is(
  public.claim_resource_problem_notification((select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture')),
  'claimed',
  'a failed notification can be retried'
);
update public.resource_problem_notifications
set status = 'failed', error_code = 'provider_error'
where id = (select n.id from public.resource_problem_notifications n join public.resource_problems p on p.id = n.problem_id where p.description = 'Notification state machine fixture');

-- get_resource_detail exposes the notification status to an authorized reader.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select is(
  (select p->>'notificationStatus'
   from jsonb_array_elements(public.get_resource_detail('24000000-0000-0000-0000-000000000001')->'problems') as p
   where p->>'description' = 'Notification state machine fixture'),
  'failed',
  'detail exposes the generic notification status'
);

-- Retry authorization: owner, management, and administrator may retry.
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select ok(
  (public.retry_resource_problem_notification((select id from public.resource_problems where description = 'Notification state machine fixture'))->>'notificationId') is not null,
  'the resource owner can retry the notification'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select ok(
  (public.retry_resource_problem_notification((select id from public.resource_problems where description = 'Notification state machine fixture'))->>'notificationId') is not null,
  'management can retry the notification'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select ok(
  (public.retry_resource_problem_notification((select id from public.resource_problems where description = 'Notification state machine fixture'))->>'notificationId') is not null,
  'an administrator can retry the notification'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.retry_resource_problem_notification((select id from public.resource_problems where description = 'Notification state machine fixture'))$$,
  '42501', 'Notification is not retryable by the current user', 'an unrelated employee cannot retry'
);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000009', true);
select throws_ok(
  $$select public.retry_resource_problem_notification((select id from public.resource_problems where description = 'Notification state machine fixture'))$$,
  '42501', 'Notification is not retryable by the current user', 'a cross-org retry is rejected'
);

-- ---------------------------------------------------------------------------
-- Every active role can read, create, and report resource problems.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select lives_ok($$select public.list_resources(false)$$, 'employee can list resources');
select ok(public.get_resource_detail('24000000-0000-0000-0000-000000000001') is not null, 'employee can read resource detail');
select lives_ok(
  $$select public.create_resource('Employee Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set')$$,
  'employee can add a resource'
);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'location_incorrect', 'Employee role matrix')$$,
  'employee can report a resource problem'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000006', true);
select lives_ok($$select public.list_resources(false)$$, 'HR can list resources');
select ok(public.get_resource_detail('24000000-0000-0000-0000-000000000001') is not null, 'HR can read resource detail');
select lives_ok(
  $$select public.create_resource('HR Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set')$$,
  'HR can add a resource'
);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'location_incorrect', 'HR role matrix')$$,
  'HR can report a resource problem'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.list_resources(false)$$, 'Project Leader can list resources');
select ok(public.get_resource_detail('24000000-0000-0000-0000-000000000001') is not null, 'Project Leader can read resource detail');
select lives_ok(
  $$select public.create_resource('Leader Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set')$$,
  'Project Leader can add a resource'
);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'location_incorrect', 'Project Leader role matrix')$$,
  'Project Leader can report a resource problem'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.list_resources(false)$$, 'management can list resources');
select ok(public.get_resource_detail('24000000-0000-0000-0000-000000000001') is not null, 'management can read resource detail');
select lives_ok(
  $$select public.create_resource('Management Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set')$$,
  'management can add a resource'
);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'location_incorrect', 'Management role matrix')$$,
  'management can report a resource problem'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.list_resources(false)$$, 'administrator can list resources');
select ok(public.get_resource_detail('24000000-0000-0000-0000-000000000001') is not null, 'administrator can read resource detail');
select lives_ok(
  $$select public.create_resource('Administrator Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set')$$,
  'administrator can add a resource'
);
select lives_ok(
  $$select public.report_resource_problem('24000000-0000-0000-0000-000000000001', 'location_incorrect', 'Administrator role matrix')$$,
  'administrator can report a resource problem'
);

-- ---------------------------------------------------------------------------
-- Explicit owner assignment validates eligibility and commits atomically with
-- exactly one notification when the owner differs from the creator.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.create_resource('Assigned Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set', '15000000-0000-0000-0000-000000000005')$$,
  'employee assigns an eligible peer as owner'
);
reset role;
select is(
  (select created_by::text || ':' || owner_id::text from public.resources where name = 'Assigned Tool'),
  '15000000-0000-0000-0000-000000000004:15000000-0000-0000-0000-000000000005',
  'creator and assigned owner remain distinct'
);
select is(
  (select count(*) from public.user_notifications where resource_id = (select id from public.resources where name = 'Assigned Tool') and notification_type = 'resource_owner_assigned'),
  1::bigint,
  'assigning another owner creates one notification'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.create_resource('Self Assigned Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set', '15000000-0000-0000-0000-000000000004')$$,
  'employee can explicitly assign themselves as owner'
);
reset role;
select is(
  (select count(*) from public.user_notifications where resource_id = (select id from public.resources where name = 'Self Assigned Tool')),
  0::bigint,
  'assigning self creates no notification'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);

select throws_ok(
  $$select public.create_resource('Cross Org Owner Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set', '15000000-0000-0000-0000-000000000010')$$,
  '42501', 'Resource owner is not eligible', 'cross-organization owner is rejected'
);
select throws_ok(
  $$select public.create_resource('Inactive Owner Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set', '15000000-0000-0000-0000-000000000007')$$,
  '42501', 'Resource owner is not eligible', 'inactive owner is rejected'
);
select throws_ok(
  $$select public.create_resource('Pending Owner Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set', '15000000-0000-0000-0000-000000000008')$$,
  '42501', 'Resource owner is not eligible', 'pending owner is rejected'
);
select throws_ok(
  $$select public.create_resource('No Role Owner Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set', '15000000-0000-0000-0000-000000000011')$$,
  '42501', 'Resource owner is not eligible', 'owner without an active role is rejected'
);
reset role;
select is(
  (select count(*) from public.resources where name in ('Cross Org Owner Tool', 'Inactive Owner Tool', 'Pending Owner Tool', 'No Role Owner Tool')),
  0::bigint,
  'rejected assignments persist no resource'
);
select is(
  (select count(*) from public.user_notifications where actor_id = '15000000-0000-0000-0000-000000000004' and notification_type = 'resource_owner_assigned'),
  1::bigint,
  'rejected assignments add no notification beyond the valid assignment'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*) from jsonb_array_elements(public.list_eligible_resource_owners()) owner where owner->>'id' in (
    '15000000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000003',
    '15000000-0000-0000-0000-000000000004',
    '15000000-0000-0000-0000-000000000005',
    '15000000-0000-0000-0000-000000000006'
  )),
  6::bigint,
  'eligible-owner list contains every active role in the caller organization'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_eligible_resource_owners()) owner where owner->>'id' in (
    '15000000-0000-0000-0000-000000000007',
    '15000000-0000-0000-0000-000000000008',
    '15000000-0000-0000-0000-000000000010',
    '15000000-0000-0000-0000-000000000011'
  )),
  0::bigint,
  'eligible-owner list excludes inactive, pending, cross-org, and roleless profiles'
);

reset role;
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.user_notifications'::regclass), 'user notifications enforce row-level security');
select ok(not has_table_privilege('authenticated', 'public.user_notifications', 'INSERT'), 'browser cannot insert user notifications directly');
select ok(not has_table_privilege('authenticated', 'public.user_notifications', 'UPDATE'), 'browser cannot update user notifications directly');
select ok(not has_table_privilege('authenticated', 'public.user_notifications', 'DELETE'), 'browser cannot delete user notifications directly');
select ok(has_function_privilege('authenticated', 'public.list_eligible_resource_owners()', 'EXECUTE'), 'authenticated users can list eligible owners through RPC');
select ok(not has_function_privilege('anon', 'public.list_eligible_resource_owners()', 'EXECUTE'), 'anonymous users cannot list eligible owners');
select ok(has_function_privilege('authenticated', 'public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, uuid)', 'EXECUTE'), 'authenticated users can call assigned-owner create overload');
select ok(not has_function_privilege('anon', 'public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, uuid)', 'EXECUTE'), 'anonymous users cannot call assigned-owner create overload');

select * from finish();
rollback;
