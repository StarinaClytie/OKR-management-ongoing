# Task 4 Report: Immediate Daily Evidence Upload State Machine

Implementation commits:

- `b54666d` — `feat: upload daily evidence before submission`
- `7adde4b` — `fix: integrate daily upload sessions end to end` (review fix round 1/5)

## Delivered

- Added the `verifying` upload state plus reusable domain predicates that require every file evidence item to be finalized (`uploaded` with an attachment ID) before submission.
- Added typed repository/session interfaces for beginning or resuming a daily-report upload session, uploading one attachment with state/progress callbacks, abandoning a session, and submitting against that session.
- Implemented the Task 1 RPC sequence in `SupabaseOkrRepository`: begin session, create pending attachment metadata, upload through Task 3's authenticated progress transport, finalize server-side, and expose the finalized attachment ID. Authentication, transport, and finalization failures clean up the pending object/metadata before returning a retryable failure.
- Removed attachment transfer from the legacy `saveDailyReport` path and added `submitDailyReportSession`, which passes `p_upload_session_id` to the session-aware `save_daily_report` RPC.
- Selecting a valid file now starts or reuses one lazy session immediately. Progress and all requested states render from the matching draft item; retry reuses that item, and the local `File` is retained until finalization succeeds.
- Submission and cancellation are gated while mutations are active. Submission creates a session even for a valid attachment-free report, and cancellation awaits session abandonment before closing.
- Removal aborts or waits for in-flight work, distinguishes current-session attachments from persisted revision attachments, and cleans every attachment before removing a whole Daily OKR block. A failed cleanup keeps both the item and its current-session cleanup semantics for retry.
- Persisted attachments initialize as uploaded at 100%. Evidence classification choices are filtered through `allowedClassifications(clearance)`; persisted evidence above a lowered clearance remains visible and read-only, and blocks submission until authorized removal.

## TDD and Review

- Repository ordering and component behavior were specified first. The initial focused RED run produced 18 expected failures because the repository session methods and immediate-upload UI did not exist.
- Additional RED regressions covered queued removal during session creation, over-clearance persisted evidence, current-session destructive cleanup, lazy session creation for attachment-free submission, whole-block cleanup, and retention of cleanup provenance after a failed removal.
- The first full-suite run exposed a circular import through the Task 3 transport's Supabase configuration. The upload transport is now imported only when an upload starts, preserving repository-factory initialization without changing Task 3's API.
- Independent review confirmed the Task 4 state machine and identified page/database integration concerns listed below. The actionable Task 4 whole-block cleanup and failed-removal retry defects were fixed and regression-tested.

## Review Fix Round 1/5

- `DailyReportsPage` now passes the Shanghai business date (or today's editable report date), `currentUser.clearance`, and bound upload-repository wrappers into the real form. Supabase submissions no longer call the revoked attachment-free overload: even a report with no attachments begins/resumes a session and calls `submitDailyReportSession`.
- The page uses `canEditDailyReport` in addition to permission checks, so only the author can edit today's unconfirmed report. Confirmed reports and prior Shanghai business dates render locked before the form can open.
- Added additive migration `202608230007_daily_attachment_adoption.sql`. `adopt_daily_report_revision_attachments` validates the active author/session/report boundary, rejects duplicate, foreign, unassociated, non-current-revision, and over-clearance evidence, then explicitly binds retained current-revision attachments to the edit session. Saving preserves the prior immutable association and adds the new revision association.
- The migration also adds session cleanup discovery and idempotent destructive deletion RPCs. Adopted immutable evidence is excluded from destructive cleanup and detached when a cleaned edit session is abandoned. Unassociated finalized uploads remain recoverable until metadata and Storage deletion both succeed.
- Repository abandonment discovers and removes unassociated session rows (including after refresh) before calling abandon. Metadata and Storage failures are checked and returned; the final failed UI update clears provisional attachment IDs so they cannot be mistaken for finalized provenance.
- Form cancellation first removes every locally known finalized session upload, then asks the repository to clean recovered leftovers and abandon. A cleanup failure keeps the form open. Whole-block deletion now removes each successful item from draft state immediately, so a later failure leaves only failed items for retry.
- The page removal adapter preserves historical revision evidence by default and honors `{ preserveRevisionHistory: false }` for new session uploads.

Round 1 TDD evidence:

- Repository RED: 5 failures for the absent adoption method, unchecked metadata/Storage cleanup, retained provisional ID, and abandon-without-recovery cleanup.
- Form RED: 4 failures for provisional-ID retention, missing finalized cleanup before cancel, missing refresh-session recovery, and partial whole-block cleanup rollback.
- Page RED: 4 failures for absent clearance/session/upload wiring and missing confirmed/prior-day locks.
- pgTAP was authored before the additive migration. Its RED/GREEN execution remains environment-blocked as described below.

## Verification

Fresh verification after review fix round 1:

```text
npm test -- --run src/data/supabaseRepository.test.ts src/pages/DailyReportsPage.test.tsx src/pages/daily-report/DailyReportForm.test.tsx src/pages/daily-report/DailyReportEvidence.test.tsx src/pages/daily-report/AttachmentList.test.tsx
  5 files passed; 94 tests passed

npm run typecheck
  passed

npm run build
  passed (Vite emitted its existing >500 kB chunk-size advisory)

npm test -- --run
  58 files passed; 451 tests passed

git diff --check
  passed
```

The lifecycle pgTAP plan now contains 46 assertions. These commands were each
attempted after the final code change:

```text
npx supabase test db supabase/tests/daily_upload_lifecycle.test.sql
npx supabase test db supabase/tests/storage.test.sql
npx supabase db lint --local --level warning
```

All three exited with status 1 before executing SQL because the local database
at `127.0.0.1:54322` refused the connection. Docker/local Supabase is not
running. Start it with `supabase start`, then rerun all three commands; the SQL
suite and database lint are therefore **not claimed as passing** in this report.

## Remaining Concerns

- The only verification gap is environmental: the additive migration and 46-assertion pgTAP suite need a running local Supabase instance. JS/TS integration, build, typecheck, and full unit/component regression are verified as above.
