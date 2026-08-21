# TIME-TECH SPECTRA OKR Business Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-usable OKR workflow for 南京瞬谱光电科技有限公司 with correct role boundaries, atomic KR membership synchronization, one daily report per user per day, entry-scoped attachments, focused dashboards, and no fabricated production data.

**Architecture:** Preserve the React/Vite repository abstraction and Supabase Objective→Project→KR storage model. Enforce mutations in SECURITY DEFINER RPCs and RLS, while React permission helpers and selectors mirror—not replace—the database boundary. Keep `projects` as an internal membership container but present only Objective→KR to users; retain historical risk tables without runtime product paths.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Supabase/PostgreSQL migrations and SQL tests.

## Global Constraints

- Administrator manages accounts and roles only; only Management creates, edits, archives, or restores Objectives.
- Project Leaders cannot edit Objectives and only the assigned Objective leader manages its KRs.
- KR owners come from real approved, active users in the same organization with role `project_leader` or `employee`; pre-existing project membership is not required.
- Assigning a KR owner must atomically create the corresponding `project_members` row and `kr_assignments` OWNER row.
- One `(organization_id, author_id, report_date)` Daily Report exists; repeated submission updates it through a new revision.
- Attachments belong to a Daily OKR Entry, not a report-wide evidence section.
- Do not create, guess, or seed employee names, email addresses, auth accounts, Objectives, KRs, or Daily Reports in production.
- Runtime branding is 瞬谱光电 / TIME-TECH SPECTRA / 南京瞬谱光电科技有限公司; no Northstar string may remain user-visible.
- Do not show Risk Matrix, risk creation, risk dashboard widgets, Available Capacity, or Resource Utilization.
- Keep historical risk tables and rows; this plan performs no destructive production-data migration.

---

### Task 1: Lock the role workflow and real-user selector contract

**Files:**
- Modify: `src/domain/okrRedesign.test.ts`
- Modify: `src/pages/okr/selectorFiltering.test.tsx`
- Modify: `src/pages/ObjectiveDetailPage.tsx`
- Modify: `src/pages/okr/KeyResultFormModal.tsx`
- Modify: `src/domain/okrPermissions.ts`

**Interfaces:**
- Consumes: `OkrRepository.listOrganizationUsers()`, `canCreateObjective`, `canEditObjective`, `canManageKeyResults`.
- Produces: `KeyResultFormModal` prop `ownerCandidates: readonly OrganizationUser[]`; Objective detail loads all approved active organization users before opening the KR modal.

- [ ] **Step 1: Write failing role and selector tests**

Add assertions proving Administrator cannot create/edit an Objective, Management can, and only the assigned Project Leader manages KRs. Replace the member-only selector fixture with one project member and one approved active non-member:

```tsx
it('offers an approved active employee who is not yet a project member as a KR owner', async () => {
  const outsider = organizationUser({
    id: 'employee-not-yet-member', displayName: '测试员工', role: 'employee',
    isActive: true, approvalStatus: 'approved', projectIds: [],
  });
  const repository = objectiveRepository({ organizationUsers: [leader, outsider] });
  renderObjectiveDetailAs('leader', repository);
  await userEvent.click(await screen.findByRole('button', { name: '添加 KR' }));
  expect(await screen.findByRole('checkbox', { name: '测试员工' })).toBeEnabled();
});
```

Also assert pending, inactive, Management, Administrator, and HR users never appear as KR owners.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/domain/okrRedesign.test.ts src/pages/okr/selectorFiltering.test.tsx`

Expected: the non-member employee checkbox is absent because `ObjectiveDetailPage` currently passes only `projectMembers`.

- [ ] **Step 3: Implement the organization-wide owner selector**

When opening the create-KR dialog, call `listOrganizationUsers`, filter to `isActive && approvalStatus === 'approved' && (role === 'project_leader' || role === 'employee')`, and pass that list to `KeyResultFormModal`. Rename the prop from `members` to `ownerCandidates`; keep defensive role filtering in the modal. Never introduce fallback fixture users when the request fails.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/domain/okrRedesign.test.ts src/pages/okr/selectorFiltering.test.tsx src/pages/OkrPhase.test.tsx`

Expected: all tests pass and Administrator remains denied Objective mutations.

- [ ] **Step 5: Commit**

```bash
git add src/domain/okrRedesign.test.ts src/pages/okr/selectorFiltering.test.tsx src/pages/ObjectiveDetailPage.tsx src/pages/okr/KeyResultFormModal.tsx src/domain/okrPermissions.ts
git commit -m "fix: align OKR owner selection with organization roles"
```

### Task 2: Make KR owner membership synchronization atomic

**Files:**
- Create: `supabase/migrations/202608210001_okr_owner_auto_membership.sql`
- Modify: `supabase/tests/kr_owner_membership.test.sql`
- Modify: `supabase/tests/okr_permissions.test.sql`

**Interfaces:**
- Consumes: organization/profile/role tables and current `create_key_result(...)` / `update_key_result(...)` signatures.
- Produces: `private.is_eligible_kr_owner(uuid, uuid)` checking organization/account/role only; RPCs idempotently insert project membership before OWNER assignments.

- [ ] **Step 1: Write failing SQL tests**

Create an approved, active, same-organization employee fixture that is not a project member. Assert:

```sql
select lives_ok(
  $$ select public.create_key_result(
    :'objective_id', 'Non-member assignment', array[:'employee_id']::uuid[],
    current_date + 30, 'numeric', 0, 10, '组', null, null, 'medium', 'internal'
  ) $$,
  'eligible organization employee can be assigned before project membership exists'
);
select ok(exists(select 1 from public.project_members where project_id = :'project_id' and profile_id = :'employee_id'), 'assignment creates project membership');
select ok(exists(select 1 from public.kr_assignments where profile_id = :'employee_id' and assignment_role = 'owner'), 'assignment creates OWNER relationship');
```

Add rejection and rollback coverage for inactive, pending, wrong-role, and other-organization profiles, plus update reassignment.

- [ ] **Step 2: Run SQL tests and verify RED**

Run: `npx supabase test db supabase/tests/kr_owner_membership.test.sql supabase/tests/okr_permissions.test.sql`

Expected: the eligible non-member case fails with the current project-membership requirement. If local Supabase is unavailable, record the exact environmental error.

- [ ] **Step 3: Implement the migration**

Replace `private.is_eligible_kr_owner` so it validates organization, active/approved profile, eligible active role, and clearance without requiring `project_members`. In both KR RPCs, validate the complete owner set first, then execute:

```sql
insert into public.project_members (organization_id, project_id, profile_id)
select target.organization_id, target.project_id, candidate.owner_id
from (select distinct unnest(p_owner_ids) as owner_id) candidate
on conflict (project_id, profile_id) do nothing;
```

Keep current parameters and authorization. On update, validate all owners before replacing assignments so failure preserves the old set.

- [ ] **Step 4: Run SQL tests and verify GREEN**

Run: `npx supabase test db supabase/tests/kr_owner_membership.test.sql supabase/tests/okr_permissions.test.sql supabase/tests/objective_leader_membership.test.sql`

Expected: eligible non-members are added and assigned atomically; invalid candidates fail closed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608210001_okr_owner_auto_membership.sql supabase/tests/kr_owner_membership.test.sql supabase/tests/okr_permissions.test.sql
git commit -m "fix: auto-add KR owners to project membership"
```

### Task 3: Redesign Daily OKR Entry data and entry-scoped attachments

**Files:**
- Modify: `src/domain/dailyEntry.ts`
- Modify: `src/domain/dailyEntry.test.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/dailyReportMapper.ts`
- Modify: `src/data/dailyReportMapper.test.ts`
- Modify: `src/pages/daily-report/DailyReportForm.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.test.tsx`
- Modify: `src/pages/daily-report/DailyReportEvidence.tsx`
- Modify: `src/test/dailyReportTestHelpers.ts`

**Interfaces:**
- Consumes: owned KRs, readable Objectives, `DailyEvidenceDraft`, and classified attachments.
- Produces: `DailyOkrBlockDraft` with `workDescription`, `result`, `hours`, and `evidence`; no report-global evidence.

- [ ] **Step 1: Write failing domain and form tests**

Define the desired Entry in tests:

```ts
const entry: DailyOkrBlockDraft = {
  id: 'entry-1', dailyObjective: '完成第一轮训练', linkedKeyResultId: 'kr-ai-model',
  workDescription: '训练并检查第一轮模型', result: '完成 5000 组数据训练', hours: 5,
  evidence: [{ id: 'file-1', label: '训练结果', kind: 'file', classification: 'internal', file }],
};
```

Assert the selected KR displays its related Objective read-only, each Entry contains its own attachment control, and the global evidence panel is absent. Assert “Add another Daily OKR” is absent until the first Entry is valid, then appends the second Entry.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/domain/dailyEntry.test.ts src/data/dailyReportMapper.test.ts src/pages/daily-report/DailyReportForm.test.tsx`

Expected: evidence is global, `workDescription` is missing, and the add button is always visible.

- [ ] **Step 3: Implement the entry model and UI**

Move `evidence` into each `DailyOkrBlockDraft`; add required `workDescription`. Render in order: Today's Objective, Related company Objective, Related KR, Work description, Result / Data, Attachments, Working hours. Derive Objective from KR and do not accept an independent Objective ID.

Create `isCompleteDailyOkrBlock(block)` and use it for validation and add-button visibility. Show the add button only after the final block is complete.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/domain/dailyEntry.test.ts src/data/dailyReportMapper.test.ts src/pages/daily-report/DailyReportForm.test.tsx src/pages/DailyReportsPage.test.tsx`

Expected: entry fields, entry attachments, sequencing, and total hours pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dailyEntry.ts src/domain/dailyEntry.test.ts src/data/types.ts src/data/dailyReportMapper.ts src/data/dailyReportMapper.test.ts src/pages/daily-report/DailyReportForm.tsx src/pages/daily-report/DailyReportForm.test.tsx src/pages/daily-report/DailyReportEvidence.tsx src/test/dailyReportTestHelpers.ts
git commit -m "feat: model attachments inside Daily OKR entries"
```

### Task 4: Replace daily create/update branching with one atomic daily save

**Files:**
- Create: `supabase/migrations/202608210002_daily_report_upsert_entries.sql`
- Modify: `supabase/tests/schema.test.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/pages/DailyReportsPage.tsx`
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/pages/DailyReportsPage.user-change.test.tsx`

**Interfaces:**
- Consumes: daily unique key, revisions, block JSON, and entry attachment uploads.
- Produces: `save_daily_report(...) returns table(report_id uuid, revision integer)` and repository `saveDailyReport(...)`.

- [ ] **Step 1: Write failing repository, page, and SQL tests**

```ts
it('uses one save RPC for first and repeated same-day submissions', async () => {
  await repository.saveDailyReport(input, []);
  expect(rpc).toHaveBeenCalledWith('save_daily_report', expect.objectContaining({
    p_report_date: input.reportDate, p_blocks: expect.any(Array),
  }));
});
```

SQL: save twice as the same user/date; assert one report, revision 2, two revision rows, and latest blocks/hours. Page: create entry point with today's report already present still calls `saveDailyReport`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/data/supabaseRepository.test.ts src/pages/DailyReportsPage.test.tsx src/pages/DailyReportsPage.user-change.test.tsx`

Expected: `saveDailyReport` is absent and duplicate create can surface the unique constraint.

- [ ] **Step 3: Implement atomic save and entry attachment association**

The RPC trusts only current organization/auth user, validates each linked KR is owned, locks an existing report, or inserts with `on conflict ... do nothing` and selects it `for update`. It creates the next revision, ordered blocks and attachment associations, updates total hours/current revision, and returns report ID/revision. Reject pending/failed uploads before advancing revision.

Replace UI branching on `editingReport` with `saveDailyReport`; editing controls prefill only.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/data/supabaseRepository.test.ts src/pages/DailyReportsPage.test.tsx src/pages/DailyReportsPage.user-change.test.tsx src/pages/daily-report/DailyReportForm.test.tsx`

Run when available: `npx supabase test db supabase/tests/schema.test.sql supabase/tests/rls.test.sql supabase/tests/storage.test.sql`

Expected: repeated submission keeps one report and increments revision without `23505`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608210002_daily_report_upsert_entries.sql supabase/tests/schema.test.sql supabase/tests/rls.test.sql src/data/types.ts src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/pages/DailyReportsPage.tsx src/pages/DailyReportsPage.test.tsx src/pages/DailyReportsPage.user-change.test.tsx
git commit -m "fix: upsert one daily report per employee and date"
```

### Task 5: Simplify alignment and focus Management Dashboard metrics

**Files:**
- Modify: `src/dashboard/widgets/visualizationData.ts`
- Modify: `src/dashboard/widgets/visualizationData.test.ts`
- Modify: `src/dashboard/widgets/AlignmentTreeWidget.tsx`
- Modify: `src/dashboard/widgets/ProjectVisualizationsWidget.tsx`
- Modify: `src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx`
- Modify: `src/dashboard/widgets/CompanyHealthWidget.tsx`
- Modify: `src/dashboard/widgets/HoursWidget.tsx`
- Modify: `src/dashboard/dashboardRegistry.ts`
- Modify: `src/dashboard/dashboardRegistry.test.ts`
- Modify: `src/dashboard/DashboardPage.test.tsx`
- Modify: `src/app/accessibility.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: visible Objectives, KRs, assignments, reports, projects, and users.
- Produces: Objective nodes with Project Leader/progress/KRs and Management metrics for Objective, KR, recorded hours, and project progress.

- [ ] **Step 1: Write failing dashboard tests**

Assert alignment renders only Objective and KR nodes and never “项目目标” / “Project objective”. Assert Management sees Objective completion, KR completion, recorded hours, project progress, and Project Leader names. Assert no Risk Matrix, risk count, Available Capacity, Resource Utilization, or capacity series. Require the Project Leader “OKR 对齐摘要” details affordance.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/dashboard/widgets/visualizationData.test.ts src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx src/dashboard/dashboardRegistry.test.ts src/dashboard/DashboardPage.test.tsx src/app/accessibility.test.tsx`

Expected: current tree exposes project-goal duplication and the accessibility test fails.

- [ ] **Step 3: Implement Objective→KR preparation and widgets**

Remove project as a visible hierarchy node; retain `projectId` only for filtering and project progress lookup. Render Objective title, leader and completion, followed by KR title, owner and completion. Calculate recorded hours from report totals, never capacity. Derive project progress from its Objective/KR progress.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/dashboard src/app/accessibility.test.tsx`

Expected: dashboards pass with no forbidden widget or label.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard src/app/accessibility.test.tsx src/styles/global.css
git commit -m "feat: focus dashboards on OKR progress and recorded hours"
```

### Task 6: Remove risk product paths without deleting historical data

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/demoRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/mocks/repository.ts`
- Modify: `src/domain/okrStatus.ts`
- Modify: `src/domain/progressStatus.ts`
- Modify: `src/domain/progressStatus.test.ts`
- Delete: `src/components/StatusExplanation.tsx`
- Delete: `src/components/StatusExplanation.test.tsx`

**Interfaces:**
- Consumes: progress, dates, milestones, and KR updates only.
- Produces: active repository reads that do not fetch risks; status resolution independent of risk rows.

- [ ] **Step 1: Write failing no-risk tests**

Assert `getDashboardData` does not select `risks`, active aggregates do not require risks, and unresolved historical risks cannot change Objective/KR status. Preserve historical SQL tables.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/data/supabaseRepository.test.ts src/domain/progressStatus.test.ts src/pages/okr/selectorFiltering.test.tsx`

Expected: repository/status code still references risk data.

- [ ] **Step 3: Remove active risk consumers**

Remove risk query/mapping and mutation methods from `OkrRepository` implementations. Remove risk fixtures from active aggregate construction. Keep `at_risk` enum compatibility for existing records, but do not derive it from risk tables. Do not drop or truncate `public.risks` and do not edit historical migrations.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/data src/domain src/pages/okr/selectorFiltering.test.tsx`

Expected: no active query or UI mutation touches risk data.

- [ ] **Step 5: Commit**

```bash
git add -A src/data src/domain src/mocks src/components/StatusExplanation.tsx src/components/StatusExplanation.test.tsx
git commit -m "refactor: remove risk features from active OKR product"
```

### Task 7: Replace branding and remove obsolete product language

**Files:**
- Modify: `index.html`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `src/layout/Sidebar.tsx`
- Modify: `src/layout/Sidebar.test.tsx`
- Modify: `src/auth/LoginForm.test.tsx`
- Modify: `src/auth/RegisterForm.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/LocaleProvider.test.tsx`
- Modify: `docs/user-guide.zh-CN.md`
- Modify: `docs/user-guide.en.md`

**Interfaces:**
- Consumes: current translation key contract.
- Produces: consistent TIME-TECH brand copy and focused documentation.

- [ ] **Step 1: Write failing brand and copy tests**

```tsx
expect(screen.getByRole('link', { name: /瞬谱光电/ })).toBeVisible();
expect(screen.queryByText(/Northstar/i)).not.toBeInTheDocument();
```

Assert visible dashboard/help copy contains neither risk-feature language nor Available Capacity/Resource Utilization.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/layout/Sidebar.test.tsx src/auth/LoginForm.test.tsx src/auth/RegisterForm.test.tsx src/i18n/LocaleProvider.test.tsx`

Expected: Northstar remains in runtime branding and obsolete descriptions.

- [ ] **Step 3: Replace branding and documentation**

Use 瞬谱光电 in Chinese UI, TIME-TECH SPECTRA in English UI, and 南京瞬谱光电科技有限公司 where the legal name is appropriate. Update README/user guides for real Supabase roles and workflows. Do not add sample employees or emails.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx vitest run src/layout src/auth src/i18n src/app/App.test.tsx`

Run: `git grep -n -i northstar -- ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*' ':!supabase/migrations/202608140001_real_kr_risk_i18n.sql'`

Expected: no user-visible Northstar result; retained historical occurrences are not runtime-accessible.

- [ ] **Step 5: Commit**

```bash
git add index.html package.json README.md src/layout src/auth src/i18n docs/user-guide.zh-CN.md docs/user-guide.en.md
git commit -m "chore: rebrand the application for TIME-TECH SPECTRA"
```

### Task 8: Complete cross-role QA and release verification

**Files:**
- Create: `src/app/okrBusinessWorkflow.e2e.test.tsx`
- Modify: `supabase/tests/okr_permissions.test.sql`
- Modify: `supabase/tests/kr_owner_membership.test.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `README.md`

**Interfaces:**
- Consumes: final repository, role switching, OKR/report/dashboard pages, RPCs and RLS.
- Produces: one automated role-synchronization narrative and final verification evidence.

- [ ] **Step 1: Write the cross-role workflow test**

Use an isolated stateful repository fixture:

```ts
// Administrator assigns roles; Objective creation is absent.
// Management creates Objective and assigns the registered Project Leader.
// Project Leader sees but cannot edit Objective, then creates KR for an approved non-member Employee.
// Assert membership and OWNER assignment synchronize.
// Employee sees Objective/KR, records progress and submits a complete five-hour Daily Entry.
// Re-submit same date; assert one report with revision two.
// Management refreshes and sees KR progress and five recorded hours.
```

Use clearly test-only identifiers, not requirement-example names/emails.

- [ ] **Step 2: Run the workflow test and verify RED if an integration gap remains**

Run: `npx vitest run src/app/okrBusinessWorkflow.e2e.test.tsx`

Expected: remaining cache or visibility gaps fail at the exact role transition.

- [ ] **Step 3: Apply only minimal integration fixes**

Refresh data after successful Objective, KR, progress and report writes. Ensure cache keys are user-specific and role switching never retains another user's protected data. Do not broaden RLS or add production fixtures.

- [ ] **Step 4: Run complete verification**

```bash
npm run test:run
npm run typecheck
npm run build
npm run verify:config
```

When local Supabase is available:

```bash
npx supabase db reset
npx supabase test db
npx supabase db lint
```

Expected: all available commands pass. If Docker/Supabase is unavailable, report the exact unexecuted command and error; never describe database E2E as passing.

- [ ] **Step 5: Perform forbidden-feature and data-safety checks**

```bash
git grep -n -E 'Northstar|项目目标|Project objective|Available Capacity|Resource Utilization|风险矩阵|Risk Matrix' -- src index.html README.md docs/user-guide.zh-CN.md docs/user-guide.en.md
git diff --check
git status --short
```

Expected: no runtime forbidden strings, no whitespace errors, and no migration INSERTs fabricated profiles, auth users, emails, Objectives, KRs, or reports.

- [ ] **Step 6: Request code review and correct verified findings**

Invoke `requesting-code-review`; reproduce each accepted defect with a failing regression test, apply the minimal correction, and rerun the affected suite.

- [ ] **Step 7: Commit final QA**

```bash
git add src/app/okrBusinessWorkflow.e2e.test.tsx supabase/tests/okr_permissions.test.sql supabase/tests/kr_owner_membership.test.sql supabase/tests/rls.test.sql README.md
git commit -m "test: verify the complete TIME-TECH OKR workflow"
```

## Plan Self-Review

- Spec coverage: Tasks 1–8 cover role boundaries, Objective→KR, owner auto-membership, Daily Entry fields/attachments, same-day upsert, dashboard metrics, risk/capacity removal, branding, real-data protection, and cross-role synchronization.
- Placeholder scan: no deferred implementation placeholders are present.
- Type consistency: Tasks 3–4 move evidence into `DailyOkrBlockDraft` and expose one `saveDailyReport`; Tasks 5–6 remove risk consumers before Task 7 removes obsolete wording.
- Scope: database and UI contracts change together, and every task ends in an independently testable commit.
