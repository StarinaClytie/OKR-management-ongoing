# Production Test Data Cleanup Design

## Goal

Remove all test business content from the current production organization while preserving authentication accounts, organizations, user profiles, assigned roles, and reporting relationships.

## Preserved Data

The cleanup must not modify these tables or the authentication schema:

- `auth.users`
- `public.organizations`
- `public.profiles`
- `public.user_roles`
- `public.reporting_lines`

Passwords, login identities, approval state, display names, roles, and manager/subordinate relationships therefore remain unchanged.

## Deleted Data

The cleanup removes all rows from the current business-data tables, including:

- Projects, project membership, and collaboration grants
- Objectives, objective owners, key results, assignments, and progress history
- Milestones, risks, and legacy project risks
- Daily reports, revisions, OKR blocks, evidence, comments, upload sessions, and work-hour records stored in daily-report structures
- Resources, resource problems, resource notifications, and resource attachments
- User notifications generated from deleted business activity

The implementation must discover and report any additional `public` tables that reference a deleted business table before destructive execution. It must stop rather than silently leave unexpected dependent data.

## Attachment Handling

Attachment bytes and attachment metadata are separate:

- Bytes are stored in the private Alibaba Cloud OSS bucket used by the attachment service.
- Metadata is stored in `public.report_attachments`, `public.report_attachment_revisions`, and `public.resource_attachments`.

The preview stage exports every non-null object key from both attachment metadata tables. The operator deletes only those exact keys from OSS and records the result. Database cleanup must not run until the expected OSS keys have been removed or the operator explicitly accepts a documented list of missing keys.

Deleting metadata without deleting OSS objects is prohibited because it produces inaccessible orphaned files.

## Execution Model

The cleanup has four explicit stages:

1. **Preview:** Run read-only SQL in the Alibaba Cloud RDS Supabase SQL console. Capture preserved-row counts, business-row counts, attachment IDs, object keys, and organization IDs.
2. **OSS cleanup:** Delete the exported exact object keys in the Alibaba Cloud OSS console or with authenticated `ossutil`. Do not delete the bucket or use a broad prefix unless the preview proves the prefix contains only listed test objects.
3. **Database cleanup:** Run one transaction in the RDS SQL console. Acquire an advisory transaction lock, verify preserved tables still match the preview guard values, delete/truncate only the approved business tables, validate the preserved tables, and commit only if all assertions pass.
4. **Verification:** Run read-only SQL confirming every approved business table has zero rows and preserved counts are unchanged. Log in as representative retained roles and verify the application loads empty states.

The SQL must be run as a database owner/administrative database account. It must not be executed through the browser application's Supabase client because RLS and request timeouts make that path unsuitable for an administrative reset.

## Safety and Failure Behavior

- Create or confirm a recoverable RDS backup/snapshot before starting.
- Do not disable foreign-key constraints, RLS, or triggers globally.
- Do not use `DROP SCHEMA`, delete `auth.users`, or delete an organization.
- The destructive SQL begins with `BEGIN` and uses assertions. Any mismatch or SQL error rolls back the database transaction.
- OSS deletion is not transactional. The exported inventory is therefore the audit and recovery boundary for file cleanup.
- The script must print before/after counts suitable for saving with the deployment record.
- Production execution is a manual operator action and is never run automatically by application deployment or migrations.

## Alternatives Considered

### Direct `TRUNCATE ... CASCADE`

Fast, but rejected as the standalone procedure because it does not remove OSS bytes and a broad cascade could affect an unexpected future table without an explicit review gate.

### Recreate the Supabase instance and OSS bucket

Provides the cleanest environment, but rejected because the user wants to retain the current accounts, roles, organization, and reporting relationships.

### Two-stage inventory and controlled cleanup

Selected because it preserves identity data, accounts for external OSS objects, provides an auditable preview, and allows the database portion to roll back on assertion failure.

## Success Criteria

- All approved business tables contain zero rows.
- No attachment object listed by the preview remains in OSS.
- Counts and identifiers in `auth.users`, `organizations`, `profiles`, `user_roles`, and `reporting_lines` remain unchanged.
- Existing users can still authenticate with their original credentials and retain their roles.
- Dashboard, OKR, project, report, work-hours, resource, and notification pages show valid empty states without permission errors.
- No application source code, migration history, or GitHub data is deleted as part of the production cleanup.
