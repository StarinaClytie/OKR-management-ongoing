# Daily Report Upload and Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload each selected Daily OKR attachment immediately with real progress, enable submission only after every file is finalized, prevent stale uploads from blocking reports, enforce user clearance, and lock reports after review or the Shanghai business date changes.

**Architecture:** Keep Supabase Storage behind `api.okr.trspectra.com`, but split attachment transfer from report submission. A server-created report shell and upload session authorize immediate uploads; the browser reports byte progress, while database RPCs remain authoritative for finalization, attachment association, clearance, and lock state. Database and UI use the same `Asia/Shanghai` date rule, and submission references only explicitly finalized attachments.

**Tech Stack:** React, TypeScript, Vite, Supabase Auth/PostgREST/Storage, PostgreSQL 17, pgTAP, Vitest, Testing Library, XMLHttpRequest upload progress.

## Global Constraints

- One user has at most one Daily Report per business date.
- Business date and midnight locking use `Asia/Shanghai`.
- A management review/confirmation locks the report immediately.
- Users may select only classifications at or below their administrator-assigned clearance.
- The browser never receives an OSS AccessKey and continues through `https://api.okr.trspectra.com/storage/v1/...`.
- Only uploaded and server-finalized attachments may be associated with a report revision.
- Every behavior change follows a red-green test cycle; database changes are additive migrations.

---

## File Map

- `supabase/migrations/202608230006_daily_upload_sessions_and_locks.sql`: upload-session lifecycle, stale-pending cleanup, explicit attachment association, and database lock enforcement.
- `supabase/tests/daily_upload_lifecycle.test.sql`: pgTAP coverage for session ownership, stale records, finalized attachments, and report locks.
- `supabase/tests/storage.test.sql`: Alibaba Storage INSERT compatibility and final metadata validation.
- `src/domain/types.ts`: expose user clearance and report review/lock fields.
- `src/domain/dailyEntry.ts`: upload state and session-aware attachment draft types.
- `src/domain/dailyReportPolicy.ts`: pure classification and edit-lock decisions.
- `src/domain/dailyReportPolicy.test.ts`: policy boundary tests.
- `src/data/types.ts`: immediate-upload repository interfaces and progress callback types.
- `src/data/supabaseRepository.ts`: create/resume shell, start/finalize/cancel attachment, submit finalized IDs.
- `src/data/supabaseRepository.test.ts`: repository request ordering, cleanup, and error mapping.
- `src/services/supabaseStorageUpload.ts`: authenticated XHR upload with byte progress.
- `src/services/supabaseStorageUpload.test.ts`: progress, completion, abort, and HTTP error tests.
- `src/pages/daily-report/DailyReportEvidence.tsx`: immediate-upload events and clearance-filtered classification choices.
- `src/pages/daily-report/AttachmentList.tsx`: progress/status/retry/remove presentation.
- `src/pages/daily-report/DailyReportForm.tsx`: upload orchestration and submission gating.
- `src/pages/DailyReportsPage.tsx`: upload API wiring and locked edit actions.
- Related `*.test.tsx`, `src/i18n/messages.ts`, and `src/styles.css`: UI behavior, copy, and accessible progress styling.

---

### Task 1: Authoritative Upload Lifecycle and Report Locks

**Files:**
- Create: `supabase/migrations/202608230006_daily_upload_sessions_and_locks.sql`
- Create: `supabase/tests/daily_upload_lifecycle.test.sql`
- Modify: `supabase/tests/storage.test.sql`

**Interfaces:**
- Produces: `public.begin_daily_report_upload_session(date, report_status, classification) -> jsonb` with `{reportId, sessionId}`.
- Produces: `public.begin_entry_attachment_upload(..., p_upload_session_id uuid, ...) -> jsonb` with `{id, path, bucket}`.
- Produces: `public.abandon_daily_report_upload_session(uuid) -> void`.
- Produces: `public.save_daily_report(..., p_upload_session_id uuid, ...) -> table(report_id uuid, revision integer)`.
- Produces: `private.daily_report_is_editable(report_id uuid, actor_id uuid, business_date date) -> boolean`.

- [ ] **Step 1: Write failing pgTAP tests for session ownership and stale pending isolation**

Create fixtures for an employee, leader, reviewed report, yesterday report, current session, and abandoned session. Assert that:

```sql
select is(
  public.begin_daily_report_upload_session(current_date, 'submitted', 'internal')->>'reportId',
  'expected-report-id',
  'today reuses the unique daily report shell'
);

select throws_ok(
  $$select public.begin_entry_attachment_upload(..., foreign_session_id, ...)$$,
  '42501', 'Upload session is not available',
  'another user cannot use an upload session'
);

select lives_ok(
  $$select * from public.save_daily_report(..., current_session_id, ...)$$,
  'pending rows from an abandoned session do not block submission'
);
```

- [ ] **Step 2: Write failing pgTAP tests for lock boundaries**

Assert that an owner can update an unreviewed report dated today, while `confirmed` and yesterday reports both raise `42501` with `Daily report is locked`.

- [ ] **Step 3: Run the new SQL test and verify RED**

Run:

```bash
npx supabase test db supabase/tests/daily_upload_lifecycle.test.sql
```

Expected: FAIL because the new RPCs and lock helper do not exist.

- [ ] **Step 4: Implement the additive migration**

Add `upload_session_id uuid` and a server-generated upload-session table scoped by organization, report, author, status, and timestamps. Ensure `abandon` changes only the caller's `pending` attachments to `deleted`. Replace the blanket “any pending attachment” guard with validation of only attachment IDs explicitly present in `p_blocks`; every referenced attachment must be `uploaded`, owned by the author, associated with the current session/report, and unique.

Use the database business date expression consistently:

```sql
(timezone('Asia/Shanghai', now()))::date
```

The lock helper must require the actor to be the author, `report_date` equal to that business date, and status not `confirmed`. Apply it inside every report/attachment mutation RPC.

- [ ] **Step 5: Preserve secure Alibaba Storage compatibility**

Keep INSERT authorization based on the server-issued pending path, author, organization, report, and active session. Keep MIME type and byte-size equality in `finalize_attachment_upload`; do not move final validation into the browser.

- [ ] **Step 6: Run SQL tests and lint**

Run:

```bash
npx supabase test db supabase/tests/daily_upload_lifecycle.test.sql
npx supabase test db supabase/tests/storage.test.sql
npx supabase db lint --local --level warning
```

Expected: all assertions pass and lint reports no new warnings.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202608230006_daily_upload_sessions_and_locks.sql supabase/tests/daily_upload_lifecycle.test.sql supabase/tests/storage.test.sql
git commit -m "fix: make daily attachment uploads session scoped"
```

---

### Task 2: Clearance and Lock Policy in the Domain Model

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/dailyReportPolicy.ts`
- Create: `src/domain/dailyReportPolicy.test.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`

**Interfaces:**
- Produces: `User.clearance: Classification`.
- Produces: `allowedClassifications(clearance: Classification): readonly Classification[]`.
- Produces: `canEditDailyReport(userId: string, report: Pick<DailyReport, 'authorId' | 'date' | 'status'>, businessDate: string): boolean`.

- [ ] **Step 1: Write failing pure policy tests**

```ts
expect(allowedClassifications('internal')).toEqual(['public', 'internal']);
expect(allowedClassifications('restricted')).toEqual(['public', 'internal', 'confidential', 'restricted']);
expect(canEditDailyReport('owner', todaySubmitted, today)).toBe(true);
expect(canEditDailyReport('owner', todayConfirmed, today)).toBe(false);
expect(canEditDailyReport('owner', yesterdaySubmitted, today)).toBe(false);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- --run src/domain/dailyReportPolicy.test.ts
```

Expected: FAIL because the policy module and `User.clearance` do not exist.

- [ ] **Step 3: Implement classification rank and edit policy**

Use one ordered constant:

```ts
export const classificationOrder = ['public', 'internal', 'confidential', 'restricted'] as const;
```

Map `profiles.clearance` into `User` in `mapProfile`, and include `clearance` in the profile select. Do not infer clearance from role.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
npm test -- --run src/domain/dailyReportPolicy.test.ts src/data/supabaseRepository.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/dailyReportPolicy.ts src/domain/dailyReportPolicy.test.ts src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts
git commit -m "feat: expose daily report clearance and lock policy"
```

---

### Task 3: Authenticated Upload Transport With Real Progress

**Files:**
- Create: `src/services/supabaseStorageUpload.ts`
- Create: `src/services/supabaseStorageUpload.test.ts`
- Modify: `src/lib/supabase.ts`

**Interfaces:**
- Produces: `uploadStorageObject(input: { bucket: string; path: string; file: File; accessToken: string; onProgress(percent: number): void; signal?: AbortSignal }): Promise<void>`.

- [ ] **Step 1: Write failing XHR transport tests**

Use a controllable fake `XMLHttpRequest`. Verify authorization/apikey/content-type headers, encoded object URL, progress conversion using `Math.round(loaded / total * 100)`, resolution only for HTTP 2xx, rejection for abort/network/HTTP errors, and no false 100% before the response succeeds.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/services/supabaseStorageUpload.test.ts
```

Expected: FAIL because the transport does not exist.

- [ ] **Step 3: Implement the minimal transport**

Build the URL from the configured Supabase public API base, preserve path segments with `encodeURIComponent`, and send the current Supabase access token plus anon `apikey`. Never add OSS credentials or a direct OSS endpoint.

- [ ] **Step 4: Run tests and typecheck**

```bash
npm test -- --run src/services/supabaseStorageUpload.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabaseStorageUpload.ts src/services/supabaseStorageUpload.test.ts src/lib/supabase.ts
git commit -m "feat: report storage upload progress"
```

---

### Task 4: Immediate Attachment Upload State Machine

**Files:**
- Modify: `src/domain/dailyEntry.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/pages/daily-report/DailyReportForm.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.test.tsx`
- Modify: `src/pages/daily-report/DailyReportEvidence.tsx`
- Modify: `src/pages/daily-report/DailyReportEvidence.test.tsx`
- Modify: `src/pages/daily-report/AttachmentList.tsx`
- Modify: `src/pages/daily-report/AttachmentList.test.tsx`

**Interfaces:**
- Produces repository methods `beginDailyReportUploadSession`, `uploadDailyReportAttachment`, `abandonDailyReportUploadSession`, and `submitDailyReportSession`.
- Consumes `uploadStorageObject(... onProgress ...)` from Task 3.
- Produces UI states `selected | pending | uploading | verifying | uploaded | failed | deleting`.

- [ ] **Step 1: Write failing repository ordering tests**

Assert this exact sequence for each file:

```text
begin session → begin attachment metadata → upload progress → finalize attachment → uploaded
```

Assert submission sends finalized attachment IDs only, retry reuses the draft item without duplicating active attachments, and abandon removes only current-session pending rows.

- [ ] **Step 2: Write failing component tests**

Verify selecting a file immediately invokes upload; progress values 1, 50, and 100 render in the matching progressbar; submit is disabled for `selected`, `pending`, `uploading`, `verifying`, `failed`, and `deleting`; submit is enabled only when validation passes and all file evidence is `uploaded`.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test -- --run src/data/supabaseRepository.test.ts src/pages/daily-report/DailyReportForm.test.tsx src/pages/daily-report/DailyReportEvidence.test.tsx src/pages/daily-report/AttachmentList.test.tsx
```

Expected: new assertions fail because selection currently only stores local files and upload happens during submit.

- [ ] **Step 4: Implement repository session methods**

Remove file transfer from `saveDailyReport`. Upload methods must transition UI callbacks through pending/uploading/verifying/uploaded, call server cleanup on failure, and retain a retryable local `File` only until finalization.

- [ ] **Step 5: Implement form state and submission gate**

Create the session lazily on first valid file selection. Disable both duplicate submission and cancellation races while mutations are active. On cancellation, await session abandon before closing. Persisted attachments loaded for editing start at `uploaded` and 100%.

- [ ] **Step 6: Filter classifications by clearance**

Pass `currentUser.clearance` into the form/evidence component and render only `allowedClassifications(clearance)`. If an existing attachment exceeds newly lowered clearance, render it read-only and require authorized removal rather than silently changing its classification.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
npm test -- --run src/data/supabaseRepository.test.ts src/pages/daily-report/DailyReportForm.test.tsx src/pages/daily-report/DailyReportEvidence.test.tsx src/pages/daily-report/AttachmentList.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/dailyEntry.ts src/data/types.ts src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/pages/daily-report
git commit -m "feat: upload daily evidence before submission"
```

---

### Task 5: Locked Editing UI, Error Copy, and Styling

**Files:**
- Modify: `src/pages/DailyReportsPage.tsx`
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/auth/permissionService.ts`
- Modify: `src/auth/permissionService.test.ts`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `canEditDailyReport` and `currentBusinessDate()`.
- Consumes upload state from Task 4.

- [ ] **Step 1: Write failing page and permission tests**

Verify the edit button appears for the owner's unconfirmed current-date report; reviewed or prior-date reports show “已锁定”; the form cannot be opened for a locked report; upload errors distinguish clearance, storage, network, and lock failures; the progressbar has an accessible name and visible percentage.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/pages/DailyReportsPage.test.tsx src/auth/permissionService.test.ts
```

Expected: FAIL because edit permission currently ignores report date/status and errors collapse to a generic request failure.

- [ ] **Step 3: Implement locked actions and actionable copy**

Use the pure policy before rendering/opening edit UI. Keep the database rejection as the final authority. Add localized states for “等待上传”“上传中 {percent}%”“服务器校验中”“上传完成”“上传失败”“附件密级超过权限”“日报已锁定”.

- [ ] **Step 4: Style progress and disabled actions**

Keep each bar inside its Daily OKR attachment row, show percentage text beside it, preserve keyboard focus, and use native `disabled` on submit while also explaining which attachment is incomplete.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- --run src/pages/DailyReportsPage.test.tsx src/auth/permissionService.test.ts src/pages/daily-report
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DailyReportsPage.tsx src/pages/DailyReportsPage.test.tsx src/auth/permissionService.ts src/auth/permissionService.test.ts src/i18n/messages.ts src/styles.css
git commit -m "feat: lock reviewed and historical daily reports"
```

---

### Task 6: Full Verification and Production Handoff

**Files:**
- Modify if needed: `docs/alibaba-rds-supabase-init.md`

**Interfaces:**
- Validates all interfaces produced by Tasks 1–5.

- [ ] **Step 1: Run the complete frontend suite**

```bash
npm test -- --run
npm run typecheck
npm run build:production
```

Expected: all Vitest tests pass, TypeScript exits 0, and the production build contains `https://api.okr.trspectra.com` but no internal RDS hostname.

- [ ] **Step 2: Run the complete database suite**

```bash
npx supabase test db
npx supabase db lint --local --level warning
```

Expected: all pgTAP files pass and no new lint warnings appear.

- [ ] **Step 3: Perform role-based browser QA**

Run Playwright/E2E where available for employee/Project Leader attachment selection, observable progress, disabled submission before finalization, successful submit at 100%, same-day edit, reviewed lock, and prior-day lock. Confirm management review synchronizes to the employee view after reload.

- [ ] **Step 4: Update deployment guidance**

Document the new migration, PostgREST schema reload, no direct OSS-domain requirement, production cleanup of only abandoned pending sessions, and rollback/verification queries without exposing secrets.

- [ ] **Step 5: Commit final verification documentation**

```bash
git add docs/alibaba-rds-supabase-init.md
git commit -m "docs: deploy daily upload lifecycle"
```

- [ ] **Step 6: Push only after fresh verification evidence**

```bash
git status --short
git log --oneline -6
git push origin main
```

Expected: clean worktree and remote `main` updated with all reviewed commits.
