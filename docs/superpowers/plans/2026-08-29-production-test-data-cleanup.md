# Production Test Data Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an audited, manually operated cleanup kit that removes production test business data and OSS attachments while preserving accounts, organizations, profiles, roles, and reporting relationships.

**Architecture:** Three SQL files separate read-only inventory, transactional database deletion, and read-only verification. A local PostgreSQL regression harness seeds one row through every relevant dependency, executes the purge, and proves the identity boundary is preserved; the operator runbook keeps non-transactional OSS deletion between preview and database purge.

**Tech Stack:** PostgreSQL 17, Supabase migrations/pgTAP-compatible local database, Bash, Alibaba Cloud RDS Supabase SQL console, Alibaba Cloud OSS/`ossutil`.

## Global Constraints

- Never modify or delete `auth.users`, `public.organizations`, `public.profiles`, `public.user_roles`, or `public.reporting_lines`.
- Never run cleanup automatically from application startup, deployment, or a migration.
- Never delete an OSS bucket or use an unverified broad prefix.
- Production database deletion must run inside one transaction with assertions and an advisory transaction lock.
- Production execution remains a manual user action after backup and preview review.

---

## File Structure

- `scripts/production-data-cleanup/preview.sql` — read-only preserved counts, business counts, dependency audit, and exact attachment object inventory.
- `scripts/production-data-cleanup/purge.sql` — explicit transactional cleanup with preserved-count variables supplied by `psql` and fail-closed assertions.
- `scripts/production-data-cleanup/verify.sql` — read-only zero-row and preservation checks.
- `scripts/production-data-cleanup/README.md` — exact Alibaba Cloud execution order and OSS procedure.
- `scripts/production-data-cleanup/tests/run.sh` — disposable local-database regression harness.
- `scripts/production-data-cleanup/tests/assert_cleanup.sql` — fixture creation and post-cleanup assertions.

### Task 1: Local Safety Regression Harness

**Files:**
- Create: `scripts/production-data-cleanup/tests/run.sh`
- Create: `scripts/production-data-cleanup/tests/assert_cleanup.sql`

**Interfaces:**
- Consumes: the schema produced by `npx supabase db reset` and, once implemented, `scripts/production-data-cleanup/purge.sql`.
- Produces: a non-zero exit on any identity mutation, leftover business row, missing purge table, or SQL error.

- [ ] **Step 1: Write the failing fixture and assertions**

Create identities for one organization, administrator, and employee; create preserved `user_roles` and `reporting_lines`; seed project, OKR, progress, daily-report, resource, notification, and attachment metadata rows using schema-valid values. Save preserved IDs and counts in a temporary table. After purge execution, assert:

```sql
select plan(4);
select is((select count(*) from auth.users where id in (:'admin_id', :'employee_id')), 2::bigint, 'auth users remain');
select is((select count(*) from public.user_roles where profile_id in (:'admin_id', :'employee_id')), 2::bigint, 'roles remain');
select is((select count(*) from public.reporting_lines where manager_id = :'admin_id'), 1::bigint, 'reporting line remains');
select is((select count(*) from public.projects), 0::bigint, 'business data is removed');
select * from finish();
```

- [ ] **Step 2: Add the local runner**

The runner must reset only the local Supabase database, apply fixtures, invoke `purge.sql` with expected preserved counts, and execute assertions with `ON_ERROR_STOP=1`. It must print `LOCAL ONLY: destroys local Supabase data` before running and refuse a non-local database URL.

- [ ] **Step 3: Run the harness and verify RED**

Run:

```bash
scripts/production-data-cleanup/tests/run.sh
```

Expected: FAIL because `purge.sql` does not exist.

- [ ] **Step 4: Commit the failing safety test**

```bash
git add scripts/production-data-cleanup/tests
git commit -m "test: define production data cleanup boundary"
```

### Task 2: Preview, Purge, and Verification SQL

**Files:**
- Create: `scripts/production-data-cleanup/preview.sql`
- Create: `scripts/production-data-cleanup/purge.sql`
- Create: `scripts/production-data-cleanup/verify.sql`
- Test: `scripts/production-data-cleanup/tests/run.sh`

**Interfaces:**
- Consumes: `expected_auth_users`, `expected_organizations`, `expected_profiles`, `expected_user_roles`, and `expected_reporting_lines` as required `psql` variables.
- Produces: explicit inventories before deletion, atomic removal of approved public business tables, and pass/fail verification output.

- [ ] **Step 1: Implement read-only preview SQL**

Use `pg_catalog` to print counts for every `public` base table. Separately print preserved counts, business counts, and attachment rows with these columns:

```sql
select 'daily' as attachment_kind, id as attachment_id, organization_id, storage_path as object_key
from public.report_attachments
where storage_path is not null
union all
select 'resource', id, organization_id, storage_path
from public.resource_attachments
where storage_path is not null
order by organization_id, attachment_kind, attachment_id;
```

Also list foreign keys whose referenced or referencing table belongs to the approved business set. This is the future-schema review gate.

- [ ] **Step 2: Implement explicit transactional purge SQL**

Start with `\set ON_ERROR_STOP on`, require all five expected-count variables, `BEGIN`, and acquire `pg_advisory_xact_lock(hashtext('production-test-data-cleanup'))`. Assert preserved counts before deletion. Truncate only the explicit approved business tables, with `RESTART IDENTITY` and without naming preserved tables. Assert preserved counts again, assert every approved business table is empty, then `COMMIT`.

Approved business tables:

```text
collaboration_links, project_members, objective_owners, kr_assignments,
kr_progress_updates, progress_baselines, progress_snapshots, milestones,
risks, legacy_project_risks, daily_report_comments,
resource_problem_notifications, user_notifications,
report_attachment_revisions, report_attachments, daily_key_results,
daily_objectives, daily_okr_blocks, daily_report_revision_krs,
report_evidence_links, daily_report_upload_sessions,
daily_report_revisions, daily_reports, resource_attachments,
resource_problems, resources, key_results, objectives, projects
```

If local tests reveal an additional current business table, add it explicitly rather than relying on an unexplained cascade.

- [ ] **Step 3: Implement verification SQL**

Print preserved table counts, all business table counts, and any remaining attachment object keys. Finish with a `DO` assertion block that raises an exception if a business row remains.

- [ ] **Step 4: Run the local harness and verify GREEN**

Run:

```bash
scripts/production-data-cleanup/tests/run.sh
```

Expected: PASS; all seeded business rows are removed and all preserved identity/hierarchy rows remain.

- [ ] **Step 5: Run repository database verification**

Run:

```bash
npx supabase db reset --local --no-seed
npx supabase test db
git diff --check
```

Expected: reset and all pgTAP files pass; diff check has no output.

- [ ] **Step 6: Commit the SQL kit**

```bash
git add scripts/production-data-cleanup/preview.sql scripts/production-data-cleanup/purge.sql scripts/production-data-cleanup/verify.sql
git commit -m "feat: add guarded production data cleanup sql"
```

### Task 3: Alibaba Cloud Operator Runbook

**Files:**
- Create: `scripts/production-data-cleanup/README.md`
- Test: `scripts/production-data-cleanup/tests/run.sh`

**Interfaces:**
- Consumes: the three SQL files and the attachment inventory emitted by `preview.sql`.
- Produces: a copy/paste execution sequence that never embeds production credentials or secret endpoints.

- [ ] **Step 1: Document the preflight**

Require a successful RDS backup/snapshot, maintenance window, application write pause, saved preview output, and confirmation that preserved counts match the intended users/roles/hierarchy.

- [ ] **Step 2: Document exact execution locations**

State that `preview.sql`, `purge.sql`, and `verify.sql` run from an administrative `psql` session connected to Alibaba Cloud RDS PostgreSQL. Explain that if the Alibaba SQL console cannot set `psql` variables, the operator uses an ECS `psql` client with secrets entered interactively or substitutes the five expected integer literals into a temporary copy that is never committed.

- [ ] **Step 3: Document OSS cleanup**

In the OSS console, open the configured private attachment bucket, search for each exact `object_key` exported by preview, delete it, and save the deletion result. If using `ossutil`, require `--dry-run`/listing first where supported and one reviewed key list; do not include live AccessKey values in commands or shell history.

- [ ] **Step 4: Document purge and verification**

Show the `psql` invocation order, required expected-count arguments, success output to retain, application login smoke tests, and the stop/restore procedure for any mismatch.

- [ ] **Step 5: Self-review the runbook**

Confirm it contains no hostname, database password, OSS key, AccessKey, service-role key, broad recursive delete command, or instruction to modify `auth.users`.

- [ ] **Step 6: Run final verification and commit**

```bash
scripts/production-data-cleanup/tests/run.sh
git diff --check
git grep -nE '(AKIA|LTAI|service_role.*eyJ|postgres(ql)?://[^ ]+:[^ ]+@)' -- scripts/production-data-cleanup
git add scripts/production-data-cleanup/README.md
git commit -m "docs: add production cleanup runbook"
```

Expected: harness passes, diff check is empty, and secret scan has no matches.

## Production Handoff Gate

Implementation completion does not authorize production execution. Before the user runs the kit, present:

- local harness output;
- exact Git commit IDs;
- the five preserved preview counts;
- the count of attachment object keys;
- a reminder that OSS deletion is irreversible without OSS versioning or backup.
