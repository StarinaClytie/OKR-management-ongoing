# Operational OKR Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Supabase backend and implement transparent status/planning/risk behavior, persistent daily-report editing, real classified attachments, and the approved spacing refinements without introducing AI behavior.

**Architecture:** Keep the existing mock repository as explicit demo mode and add a Supabase implementation behind typed service interfaces. Supabase Auth supplies identity; PostgreSQL and private Storage enforce ownership, relationships, classification, and field-level visibility through RLS and security-definer RPCs. Pure domain modules own calculations and validation so charts and forms use the same testable rules.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS v2, Supabase Auth, PostgreSQL, Row Level Security, Supabase Storage, Vitest, Testing Library, Supabase CLI policy tests.

## Global Constraints

- Chinese-first application UI; English developer documentation is acceptable.
- `VITE_APP_MODE=demo` preserves the current local mock experience; `VITE_APP_MODE=supabase` uses real identity and data.
- The role switcher must be hidden and powerless in Supabase mode.
- Administrator and Management remain separate roles; Administrator does not inherit business-body access.
- RLS is authoritative. No service-role key may appear in browser code, committed files, tests, logs, or documentation examples.
- The provided publishable key may be stored only in an ignored local `.env.local`; commit `.env.example` with placeholders.
- Employee-entered O/KR completion values must never be inferred, overwritten, or recalculated by the system.
- Every evidence item and attachment is classified and authorized independently before counting, aggregation, metadata rendering, or URL signing.
- HR receives authorized hours/workload fields only unless a separate business relationship grants detail access.
- Accepted uploads: PDF, DOC/DOCX, XLS/XLSX, CSV, PNG/JPEG, TXT; maximum 10 MB per file.
- AI review, rewriting, scoring, and generated progress are out of scope.
- Every behavior change follows RED → GREEN → refactor and preserves all existing tests.

---

## File Structure

- `supabase/config.toml`: local Supabase project configuration.
- `supabase/migrations/202608130001_core_schema.sql`: enums, organization, identity, project, OKR, plan, risk, and report tables.
- `supabase/migrations/202608130002_security.sql`: helper functions, RLS policies, restricted views, and grants.
- `supabase/migrations/202608130003_storage.sql`: private bucket, attachment lifecycle RPCs, and Storage policies.
- `supabase/tests/rls.test.sql`: pgTAP role/relationship/classification policy matrix.
- `src/lib/supabase.ts`: validated browser client initialization.
- `src/data/types.ts`: repository/service interfaces and result types.
- `src/data/demoRepository.ts`: adapter over the existing mocks.
- `src/data/supabaseRepository.ts`: typed database/RPC implementation.
- `src/data/repositoryFactory.ts`: mode selection and fail-fast environment validation.
- `src/auth/SupabaseAuthProvider.tsx`: session-backed authenticated user state.
- `src/domain/progressStatus.ts`: status derivation and human-readable reasons.
- `src/domain/progressPlan.ts`: planned baseline validation and interpolation.
- `src/domain/riskScore.ts`: probability/impact scoring and explanation.
- `src/services/attachmentService.ts`: file/link validation and upload lifecycle.
- `src/pages/daily-report/DailyReportForm.tsx`: create/edit form orchestration.
- `src/pages/daily-report/DailyReportEvidence.tsx`: file picker, classified links/files, progress, retry, replace, remove.
- `src/pages/DailyReportsPage.tsx`: persistent loading, create/edit/revision workflow.
- `src/dashboard/widgets/*`: chart explanations, plan baselines, risk details and corrected axis.
- `src/pages/SettingsPage.tsx`, `src/styles/global.css`: consistent card spacing.
- `.env.example`, `README.md`, `docs/supabase-setup.md`: environment and deployment instructions.

### Task 1: Supabase Project Scaffold and Core Schema

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202608130001_core_schema.sql`
- Create: `supabase/tests/schema.test.sql`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces database enums `app_role`, `classification`, `report_status`, `kr_measurement_type`, `risk_level`, and `attachment_state`.
- Produces relational tables named in the approved design.
- Produces immutable `daily_report_revisions` and normalized `daily_report_revision_krs` snapshot tables.
- Produces browser variables `VITE_APP_MODE`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Add failing schema assertions**

Create pgTAP assertions that the required enums/tables exist, foreign keys connect every child to its parent, `daily_report_revisions` rejects update/delete, progress checks accept `0..100` only, risk probability/impact accept `1..3` only, attachment size is `1..10485760`, and attachment Storage paths are unique.

Run:

```bash
supabase test db supabase/tests/schema.test.sql
```

Expected: FAIL because no local Supabase configuration or schema exists.

- [ ] **Step 2: Add the local Supabase scaffold and dependency**

Install `@supabase/supabase-js`. Add `supabase/config.toml` with local Auth, Database, and Storage enabled. Add this committed template only:

```dotenv
VITE_APP_MODE=demo
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Add `.env.local`, `.env.*.local`, and Supabase temporary directories to `.gitignore`. Store the supplied URL/key in `.env.local`, never in committed files.

- [ ] **Step 3: Implement the normalized schema**

Create UUID-primary-key tables with `created_at`/`updated_at`, explicit foreign keys, non-empty text checks, progress/risk/file constraints, and organization scoping. Use `auth.users(id)` for profile identity. Add an `updated_at` trigger only to mutable projection tables; revision tables remain append-only.

Required report transaction inputs are represented by:

```sql
daily_reports(id, organization_id, author_id, project_id, objective_id,
  report_date, status, classification, total_hours, current_revision)
daily_report_revisions(id, report_id, revision_number, editor_id,
  daily_objective, objective_progress, classification, created_at)
daily_report_revision_krs(id, revision_id, position, title, measurement_type,
  progress, hours, work_note, linked_key_result_id, measurement_data)
```

- [ ] **Step 4: Verify schema GREEN**

Run `supabase db reset`, the schema pgTAP suite, `npm run typecheck`, and `git diff --check`.

- [ ] **Step 5: Commit Task 1**

```bash
git add .env.example .gitignore package.json package-lock.json supabase
git commit -m "feat: scaffold Supabase OKR schema"
```

### Task 2: RLS, Storage Policies, and Security Test Matrix

**Files:**
- Create: `supabase/migrations/202608130002_security.sql`
- Create: `supabase/migrations/202608130003_storage.sql`
- Create: `supabase/tests/rls.test.sql`
- Create: `supabase/tests/storage.test.sql`

**Interfaces:**
- Produces `private.current_profile_id()`, `private.has_role(app_role)`, `private.has_clearance(classification)`, `private.can_read_business_subject(uuid, uuid, uuid)`, and `private.can_read_report_detail(uuid)`.
- Produces restricted RPCs `create_daily_report`, `update_daily_report`, `begin_attachment_upload`, `finalize_attachment_upload`, `replace_attachment`, `soft_delete_attachment`, and `create_attachment_download`.
- Produces private bucket `report-attachments` and path contract `organization/{org}/reports/{report}/{attachment}/{name}`.

- [ ] **Step 1: Write failing RLS tests**

Seed users for all five roles plus manager/subordinate, project peers, unrelated employee, collaborator, and HR. Assert:

- Management reads organization detail within clearance.
- Project Leader reads member detail and cannot edit member content.
- Peer project members read project-related report detail.
- Subordinate reads upstream O/KR summary but not report/evidence/attachments.
- HR reads the workload view without body, evidence, filename, path, or count columns.
- Administrator manages role metadata but cannot read confidential report bodies merely by role.
- Restricted records require explicit clearance/grant.
- Unrelated users receive zero rows rather than redacted names/counts.

Expected initial result: FAIL because RLS is not enabled and helper functions do not exist.

- [ ] **Step 2: Implement helper functions and RLS**

Use stable, `security definer` helpers with a fixed `search_path`, revoke public execution, and grant only to `authenticated`. Enable and force RLS on every business table. Policies must constrain `organization_id`, ownership, reporting line, project membership/leadership, collaboration grant, role, and classification.

Expose HR through a view containing only:

```sql
(user_id, report_date, project_id, total_hours, planned_hours, capacity_hours)
```

Do not grant HR direct `daily_reports` or revision-table select.

- [ ] **Step 3: Write failing Storage lifecycle tests**

Assert owner upload succeeds only for an existing owned draft/submitted report; forbidden MIME/size/path fails; permitted readers can request a signed-download token through RPC; unrelated users and HR cannot enumerate object names; replace swaps metadata only after new object finalizes; delete marks metadata without leaking old paths.

- [ ] **Step 4: Implement private bucket and attachment RPCs**

Create a private bucket with 10 MB limit and allowlisted MIME types. Storage object policies validate the attachment row, current user, organization, report, generated attachment UUID, and lifecycle state. RPCs derive owner/path server-side and never accept caller-supplied ownership.

- [ ] **Step 5: Verify policy GREEN**

Run all pgTAP suites twice: once after a clean reset and once after seeded relationship changes. Run `supabase db lint` and `git diff --check`.

- [ ] **Step 6: Commit Task 2**

```bash
git add supabase/migrations/202608130002_security.sql supabase/migrations/202608130003_storage.sql supabase/tests
git commit -m "feat: enforce OKR RLS and private storage"
```

### Task 3: Typed Supabase Client, Repository Boundary, and Auth

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/data/types.ts`
- Create: `src/data/demoRepository.ts`
- Create: `src/data/supabaseRepository.ts`
- Create: `src/data/repositoryFactory.ts`
- Create: `src/data/repositoryFactory.test.ts`
- Create: `src/auth/SupabaseAuthProvider.tsx`
- Create: `src/auth/SupabaseAuthProvider.test.tsx`
- Modify: `src/auth/AuthContext.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/layout/RoleSwitcher.tsx`

**Interfaces:**
- Produces `OkrRepository` with `getCurrentProfile`, `getDashboardData`, `listDailyReports`, `createDailyReport`, `updateDailyReport`, `listReportRevisions`, and attachment lifecycle methods.
- Produces `AuthState = { status: 'loading' | 'signed_out' | 'unassigned' | 'ready'; user?: User }`.
- Produces `createRepository({ mode, supabase })` with fail-fast Supabase environment validation.

- [ ] **Step 1: Write RED tests for mode isolation and identity switching**

Test that demo mode never constructs a Supabase client; Supabase mode rejects missing URL/key; role switcher is absent in Supabase mode; signed-out users see sign-in; unassigned profiles see an assignment-pending screen; changing sessions clears the previous user's cached reports synchronously.

- [ ] **Step 2: Implement repository interfaces and adapters**

Move existing mock access behind `DemoOkrRepository`. Implement Supabase row mapping without widening classification/role strings. Return typed discriminated errors (`unauthorized`, `validation`, `conflict`, `network`, `unknown`) without protected resource labels.

- [ ] **Step 3: Implement session-backed Auth provider**

Subscribe to `onAuthStateChange`, fetch the profile/role through RLS, and bind all cached state to `session.user.id`. Never accept role data from local storage, query strings, or the demo switcher in Supabase mode.

- [ ] **Step 4: Verify GREEN and regression**

Run focused auth/data tests, all existing permission tests, full frontend tests, typecheck, build, and `git diff --check`.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib src/data src/auth src/app/App.tsx src/layout/RoleSwitcher.tsx
git commit -m "feat: add Supabase identity and repository boundary"
```

### Task 4: Transparent Status and Planned Progress

**Files:**
- Create: `src/domain/progressStatus.ts`
- Create: `src/domain/progressStatus.test.ts`
- Create: `src/domain/progressPlan.ts`
- Create: `src/domain/progressPlan.test.ts`
- Create: `src/components/StatusExplanation.tsx`
- Create: `src/components/StatusExplanation.test.tsx`
- Create: `src/pages/ProgressPlanEditor.tsx`
- Create: `src/pages/ProgressPlanEditor.test.tsx`
- Modify: `src/domain/types.ts`
- Modify: `src/dashboard/widgets/ProgressTrendWidget.tsx`
- Modify: `src/dashboard/widgets/GanttChartWidget.tsx`
- Modify: `src/dashboard/widgets/visualizationData.ts`

**Interfaces:**
- Produces `deriveProgressStatus(input): { status: ProgressStatus; reasons: StatusReason[] }`.
- Produces `validateProgressPlan(points, kr): ValidationError[]` and `plannedProgressAt(points, date): number`.
- Produces repository methods `saveProgressPlan` and `saveMilestones`, limited to owner/Project Leader by RLS.

- [ ] **Step 1: Write RED boundary tests for the approved rules**

Cover gaps of `-10`, `-11`, `-25`, `-26`; 100% completion; overdue due date; overdue milestone; risk score 6; risk score 9; and “most severe wins.” Assert actual progress input is not mutated.

- [ ] **Step 2: Implement pure status derivation and explanations**

Return reason codes plus localized parameters, for example:

```ts
{ code: 'behind_plan', severity: 'at_risk', actual: 55, planned: 72, gap: -17 }
```

Render textual reasons next to status badges without relying on color.

- [ ] **Step 3: Write RED baseline editor and interpolation tests**

Reject duplicate/out-of-period dates, decreasing cumulative values, values outside `0..100`, and a missing final due-date point. Assert interpolation is deterministic and does not modify actual snapshots.

- [ ] **Step 4: Implement plan editor and chart integration**

Persist points through the repository. Label the dashed trend line `计划进度（由负责人设置）`; label dashed Gantt bars `基准计划（计划日期）`. Add keyboard-reachable “计算说明” disclosures.

- [ ] **Step 5: Verify and commit**

Run focused domain/chart tests, full tests, typecheck, build, and commit:

```bash
git commit -m "feat: explain OKR status and planned progress"
```

### Task 5: Explained Risk Matrix

**Files:**
- Create: `src/domain/riskScore.ts`
- Create: `src/domain/riskScore.test.ts`
- Create: `src/pages/RiskEditor.tsx`
- Create: `src/pages/RiskEditor.test.tsx`
- Modify: `src/dashboard/widgets/RiskMatrixWidget.tsx`
- Modify: `src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx`
- Modify: `src/dashboard/widgets/visualizationData.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces `scoreRisk(probability, impact): { score: 1|2|3|4|6|9; level: 'low'|'medium'|'high'|'critical' }`.
- Produces exact probability and impact definitions from the approved specification.
- Adds risk `reason`, `lastReviewedAt`, and repository `saveRisk`.

- [ ] **Step 1: Write RED scoring, placement, and disclosure tests**

Assert all nine cells, score bands, readable `发生概率`, textual coordinates, probability/impact definitions, reason, mitigation, owner, review date, and no unauthorized risk metadata in DOM/ARIA.

- [ ] **Step 2: Implement risk scoring/editor**

Require probability, impact, reason, mitigation, and review date. Authorized owners save through the repository; RLS remains authoritative.

- [ ] **Step 3: Correct matrix axis and add explanation UI**

Use CSS `writing-mode: vertical-rl` with upright characters or a stacked label, not rotation. Each authorized risk exposes `概率 2 × 影响 3 = 6（高风险）` and its rationale.

- [ ] **Step 4: Verify and commit**

Run risk/visualization/security tests, full tests, typecheck, build, and commit:

```bash
git commit -m "feat: explain and score project risks"
```

### Task 6: Persistent Daily Report Create, Edit, and Revisions

**Files:**
- Create: `src/data/dailyReportMapper.ts`
- Create: `src/data/dailyReportMapper.test.ts`
- Create: `src/pages/daily-report/RevisionHistory.tsx`
- Create: `src/pages/daily-report/RevisionHistory.test.tsx`
- Modify: `src/pages/DailyReportsPage.tsx`
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.test.tsx`
- Modify: `src/domain/dailyEntry.ts`

**Interfaces:**
- Produces `dailyReportToDraft(report): DailyReportDraft` preserving zero progress and typed measurement fields.
- Extends form props with `mode: 'create'|'edit'`, `initialDraft`, and async `onSubmit`.
- Uses repository `createDailyReport`, `updateDailyReport(expectedRevision)`, and `listReportRevisions`.

- [ ] **Step 1: Write RED mapping/edit tests**

Assert “编辑我的日报” opens the actual structured form; loads the selected report, O/KRs, zero progress, links, and classifications; focuses the form heading; author only; confirmed reports are locked; PL review never receives edit controls; cancellation restores focus.

- [ ] **Step 2: Write RED revision and conflict tests**

Assert successful create/edit increments revision exactly once; stale `expectedRevision` returns conflict; validation/network/RLS failures preserve the form and show one error status; no success message or partial local projection appears.

- [ ] **Step 3: Implement mapping and persistent page flow**

Replace local-only submission in Supabase mode with repository calls while retaining demo mode. Refresh only the current user's authorized bucket after success. Render revision number, update time, and accessible immutable history.

- [ ] **Step 4: Verify and commit**

Run daily-form/page/repository tests, full tests, typecheck, build, and commit:

```bash
git commit -m "feat: persist editable daily report revisions"
```

### Task 7: Real Classified Attachment Uploads and Links

**Files:**
- Create: `src/services/attachmentService.ts`
- Create: `src/services/attachmentService.test.ts`
- Create: `src/pages/daily-report/AttachmentList.tsx`
- Create: `src/pages/daily-report/AttachmentList.test.tsx`
- Modify: `src/pages/daily-report/DailyReportEvidence.tsx`
- Modify: `src/pages/daily-report/DailyReportEvidence.test.tsx`
- Modify: `src/pages/DailyReportEvidenceDetails.tsx`
- Modify: `src/pages/DailyReportEvidenceDetails.test.tsx`
- Modify: `src/data/supabaseRepository.ts`

**Interfaces:**
- Produces `validateAttachment(file): ValidationError | null`.
- Produces `uploadAttachment`, `retryAttachment`, `replaceAttachment`, `removeAttachment`, and `createDownloadUrl` with per-file progress/state.
- Produces `validateEvidenceLink` requiring a valid `https:` URL.

- [ ] **Step 1: Write RED file/link validation tests**

Test every allowed extension/MIME pair, disallowed executable/polyglot mismatch, zero byte, `10 MB` accepted, `10 MB + 1` rejected, HTTPS-only links, filename sanitation, and independent classification.

- [ ] **Step 2: Write RED interaction/security tests**

Use real `File` objects. Assert native picker selection, selected-file list, progress, cancel/retry, replace, remove, signed download, error announcements, and no filename/count/path/URL leakage for unauthorized viewers or HR.

- [ ] **Step 3: Implement the upload state machine**

Use states `selected → pending → uploading → uploaded|failed → deleting`. Request server-derived attachment metadata/path, upload through Supabase Storage with progress-capable transport, finalize by RPC, and clean pending rows on cancel/failure. Do not submit a report revision until all selected files are uploaded or removed.

- [ ] **Step 4: Implement replace/remove/download**

Upload replacement first, atomically swap via RPC, then delete the old object. Soft-delete metadata before object removal. Generate short-lived signed downloads only after authorization and never place raw private paths in the DOM.

- [ ] **Step 5: Verify and commit**

Run attachment/evidence/policy tests, full tests, typecheck, build, and commit:

```bash
git commit -m "feat: add secure report attachment uploads"
```

### Task 8: Spacing, Integration, Deployment Documentation, and Live Migration Gate

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/SettingsPage.test.tsx`
- Modify: `src/pages/daily-report/*.tsx`
- Modify: `src/app/routes.test.tsx`
- Modify: `README.md`
- Create: `docs/supabase-setup.md`
- Create: `scripts/verify-supabase-config.mjs`

**Interfaces:**
- Produces shared `.form-card`, `.form-section`, and `.settings-panel` spacing contracts.
- Produces an operator checklist for local and hosted Supabase setup.
- Produces a read-only configuration verification script that never prints keys.

- [ ] **Step 1: Write RED layout-contract tests**

Assert daily O/KR/evidence sections and Settings personal preferences use the shared padded card classes; mobile maintains section gaps; focus/error/status semantics remain intact. Avoid pixel assertions in jsdom; validate class/structure, then perform browser smoke testing at desktop and 390 px.

- [ ] **Step 2: Apply shared spacing system**

Use existing design tokens with at least `var(--space-5)` card padding on desktop, `var(--space-4)` on narrow screens, explicit heading/description/control gaps, and no text touching borders.

- [ ] **Step 3: Document setup and deployment**

Document Supabase project creation, CLI linking, migrations, private bucket, Auth redirect URLs, environment variables, RLS verification, Free-plan limits, retention/cleanup, backups, and plan upgrades. README must clearly separate demo and Supabase modes.

- [ ] **Step 4: Run complete local verification**

```bash
npm run test:run
npm run typecheck
npm run build
supabase db reset
supabase test db
supabase db lint
git diff --check
```

Expected: all frontend, SQL policy, Storage policy, type, build, and lint checks pass; no secret scanner match in tracked files.

- [ ] **Step 5: Perform browser smoke tests**

Verify sign-in/sign-out, unassigned profile, five authorized role views, plan explanations, risk matrix, create/edit/revision, file upload/download/replace/remove, denied access, identity switching, desktop layout, and 390 px layout.

- [ ] **Step 6: Stop for live-project approval**

Before `supabase link` or `supabase db push`, present the exact migration list and local policy-test evidence. Applying migrations to project `eomesxviqudmowgwftnn` is an external state change and requires explicit user approval at this checkpoint.

- [ ] **Step 7: Commit Task 8**

```bash
git add src README.md docs/supabase-setup.md scripts/verify-supabase-config.mjs
git commit -m "docs: complete Supabase OKR integration"
```

## Final Review Checklist

- Requirements 1–7 each map to at least one independently tested task.
- Daily progress remains employee-entered in every data path.
- No AI feature, prompt, provider, or dependency is introduced.
- No service-role/database password appears in frontend configuration.
- RLS and Storage tests cover role, relationship, classification, field isolation, and metadata side channels.
- Demo and Supabase modes cannot share identity state.
- No live Supabase mutation occurs before Task 8 Step 6 approval.
