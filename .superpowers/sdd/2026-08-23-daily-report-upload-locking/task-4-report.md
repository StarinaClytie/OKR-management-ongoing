# Task 4 Report: Immediate Daily Evidence Upload State Machine

Implementation commit: `b54666d` — `feat: upload daily evidence before submission`

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

## Verification

Fresh verification after the final change:

```text
npm test -- --run src/data/supabaseRepository.test.ts src/pages/daily-report/DailyReportForm.test.tsx src/pages/daily-report/DailyReportEvidence.test.tsx src/pages/daily-report/AttachmentList.test.tsx
  4 files passed; 79 tests passed

npm run typecheck
  passed

npm test -- --run
  58 files passed; 441 tests passed

git diff --check
  passed
```

## Handoff Concerns

- Task 5 must pass `reportDate`, `currentUser.clearance`, and the four upload repository methods from `DailyReportsPage`, and must submit through `submitDailyReportSession`. The legacy `saveDailyReport` signature is revoked by the Task 1 migration and is retained here only for interface compatibility until that page wiring changes.
- Task 5's removal adapter must honor `{ preserveRevisionHistory: false }` for attachments finalized in the active session; persisted revision attachments continue to use revision-preserving removal.
- Task 1 accepts only attachments owned by the active upload session when saving a revision. Editing a report while carrying forward persisted attachments therefore needs an explicit server contract or copy-forward mechanism; changing that migration/RPC was outside Task 4's file scope.
- The page-level `canEditDailyReport` lock policy is Task 5 scope and is not wired by this commit.
