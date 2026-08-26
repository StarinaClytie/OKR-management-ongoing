# Daily Report KR Linking and Hours Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore assigned KR choices in daily reports, add explicit project attribution for unlinked work, keep multi-block authoring discoverable, and enforce employee/project-leader hours visibility consistently in React and Supabase.

**Architecture:** Treat `kr_assignments` as the source of truth for linkable KRs and persist a project on every new Daily OKR block. The save RPC validates either KR ownership or project membership, while dashboard hour construction scopes each block by its resolved project; the UI mirrors those rules without converting permission failures into empty states.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Supabase PostgreSQL/PLpgSQL, pgTAP.

## Global Constraints

- “不关联 KR” is always the first KR option.
- A linked KR derives its Objective and project and cannot accept a separately selected project.
- An unlinked block requires a project the author participates in or leads.
- Employees see only their own hours; project leaders see their own hours plus member hours attributed to projects they lead.
- Existing management and HR visibility rules remain unchanged.
- Historical blocks with neither KR nor project remain visible to their author and organization-level readers, but not to project leaders through project scope.
- Archived KRs are excluded from new choices and retained when editing existing reports.
- Database changes are forward-only migrations; never edit a deployed migration.

---

## File Structure

- `src/domain/dailyEntry.ts`: add block-level `projectId` validation and local conversion semantics.
- `src/domain/types.ts`: expose persisted block-level project attribution.
- `src/data/types.ts`: include `projectId` in repository write inputs.
- `src/pages/DailyReportsPage.tsx`: build assignment-based KR choices and eligible project choices; serialize block project IDs.
- `src/pages/daily-report/DailyReportForm.tsx`: render conditional project selection and persistent add-block control.
- `src/data/supabaseRepository.ts`: fetch/map `daily_okr_blocks.project_id`.
- `src/dashboard/widgets/hoursFiltering.ts`: authorize and aggregate hours by block project.
- `src/i18n/messages.ts`: add bilingual labels, hints, and actionable errors.
- `supabase/migrations/202608270003_daily_report_block_projects.sql`: add block project attribution, validate saves, and update project-leader read scope.
- Existing adjacent test files plus a new pgTAP test prove each boundary.

### Task 1: Domain model and validation for block projects

**Files:**
- Modify: `src/domain/dailyEntry.ts`
- Modify: `src/domain/dailyEntry.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/data/types.ts`

**Interfaces:**
- Produces: `DailyOkrBlockDraft.projectId: string`, `DailyOkrBlock.projectId: string`, and `DailyOkrBlockInput.projectId: string`.
- Produces: validation issue field `blocks.<index>.projectId` with message `请选择所属项目` only when `linkedKeyResultId === ''`.
- Consumes: existing `validateDailyReportDraft()` and `toLocalDailyReport()` conversion flow.

- [ ] **Step 1: Write failing domain tests**

Add tests showing an unlinked block without `projectId` fails, an unlinked block with `projectId: 'p1'` passes, and a linked block derives its project from KR/Objective even if its draft `projectId` is empty. Assert the issue exactly:

```ts
expect(validateDailyReportDraft(unlinkedDraft)).toContainEqual({
  field: 'blocks.0.projectId',
  message: '请选择所属项目',
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run src/domain/dailyEntry.test.ts`

Expected: FAIL because block drafts do not contain or validate `projectId`.

- [ ] **Step 3: Add the project fields and minimal validation/conversion**

Add `projectId: string` to the three block interfaces. In `validateDailyReportDraft`, append the project issue only for an unlinked block. In `toLocalDailyReport`, set each local block’s `projectId` to the linked Objective project when a KR exists, otherwise use the draft project. Initialize all new blank blocks with `projectId: ''`.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --run src/domain/dailyEntry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/domain/dailyEntry.ts src/domain/dailyEntry.test.ts src/domain/types.ts src/data/types.ts
git commit -m "feat: model project attribution on daily work blocks"
```

### Task 2: Correct assignment-based KR candidates and project candidates

**Files:**
- Modify: `src/pages/DailyReportsPage.tsx`
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/pages/DailyReportsPage.user-change.test.tsx`

**Interfaces:**
- Consumes: `isKrOwner(userId, krId, krAssignments)`.
- Produces: `ownedKeyResults` containing active assigned KRs without the generic `can(..., 'okr.read_summary')` second filter.
- Produces: `eligibleProjects` where `project.leaderId === currentUser.id || project.memberIds.includes(currentUser.id)`.
- Passes: `projects={eligibleProjects}` into `DailyReportForm` and serializes `projectId` in every `DailyOkrBlockInput`.

- [ ] **Step 1: Write failing page tests for the regression**

Create a fixture where worker2 appears in `krAssignments` for `kr-worker`, while the KR’s legacy `ownerId` is another user. Assert the form options are ordered as `不关联 KR`, then the assigned KR title. Add an archived parent Objective case and assert it is omitted for create mode but retained when editing a report that already references it. Add a project fixture and assert only joined/led projects reach the form.

- [ ] **Step 2: Run the page tests and verify failure**

Run: `npm test -- --run src/pages/DailyReportsPage.test.tsx src/pages/DailyReportsPage.user-change.test.tsx`

Expected: FAIL because the generic summary permission removes the assigned KR and no project candidates are passed.

- [ ] **Step 3: Implement candidate construction**

Filter KRs with `isKrOwner` as the authorization fact, exclude KRs whose parent Objective has `archivedAt`, and union the currently edited linked KRs back into edit-mode choices. Build eligible projects from membership/leadership. Remove `linkableObjectives` filtering that can discard the context of an otherwise valid assignment; pass only Objectives needed by the final candidate list plus historical edit references.

- [ ] **Step 4: Serialize project attribution**

When building `DailyReportInput.blocks`, include:

```ts
projectId: block.linkedKeyResultId ? '' : block.projectId,
```

The database remains authoritative and derives the linked path from the KR.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- --run src/pages/DailyReportsPage.test.tsx src/pages/DailyReportsPage.user-change.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit candidate and serialization behavior**

```bash
git add src/pages/DailyReportsPage.tsx src/pages/DailyReportsPage.test.tsx src/pages/DailyReportsPage.user-change.test.tsx
git commit -m "fix: expose assigned KRs and eligible projects in daily reports"
```

### Task 3: Daily report form project selector and persistent add-block affordance

**Files:**
- Modify: `src/pages/daily-report/DailyReportForm.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.test.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Consumes: `projects: readonly Project[]` from Task 2.
- Produces: a required project selector for unlinked blocks and read-only project context for linked blocks.
- Produces: an always-rendered add button with `disabled={!lastBlockComplete}` and localized hint.

- [ ] **Step 1: Write failing form interaction tests**

Assert that the KR select begins with the unlinked option, selecting it reveals a required project select, selecting a KR hides the project select and displays its Objective/project context, and two newly added groups keep independent `linkedKeyResultId`/`projectId` state. Assert the add button is present but disabled initially with `请先完成当前组必填内容`, then enabled after all required fields are completed.

- [ ] **Step 2: Run the focused form test and verify failure**

Run: `npm test -- --run src/pages/daily-report/DailyReportForm.test.tsx`

Expected: FAIL because projects are not rendered and the add button is conditionally absent.

- [ ] **Step 3: Implement the conditional project UI**

Add `projects` to `DailyReportFormProps`. For each block, render the existing KR `<select>` with the empty option first. If `linkedKeyResultId === ''`, render a project `<select required>` bound to `block.projectId`. If a KR is selected, clear the draft’s explicit `projectId` and show the resolved Objective/project names as read-only context.

- [ ] **Step 4: Implement discoverable multi-block behavior**

Always render the button:

```tsx
<button type="button" onClick={addBlock} disabled={!lastBlockComplete}>
  {t('daily.addBlock')}
</button>
```

Render `t('daily.completeCurrentBlock')` while disabled. Ensure `newBlock()` returns a blank `projectId` and unique ID.

- [ ] **Step 5: Add bilingual messages and validation mapping**

Add Chinese/English values for `daily.project`, `daily.selectProject`, `daily.noEligibleProjects`, `daily.completeCurrentBlock`, `daily.krAssignmentExpired`, `daily.projectMembershipExpired`, and `validation.projectRequired`. Map `请选择所属项目` to `validation.projectRequired`.

- [ ] **Step 6: Run the focused tests and accessibility assertions**

Run: `npm test -- --run src/pages/daily-report/DailyReportForm.test.tsx`

Expected: PASS, including accessible names for both selects and disabled-button description.

- [ ] **Step 7: Commit the form behavior**

```bash
git add src/pages/daily-report/DailyReportForm.tsx src/pages/daily-report/DailyReportForm.test.tsx src/i18n/messages.ts
git commit -m "feat: attribute unlinked daily work and keep add-block visible"
```

### Task 4: Persist and authorize block-level project attribution in Supabase

**Files:**
- Create: `supabase/migrations/202608270003_daily_report_block_projects.sql`
- Create: `supabase/tests/daily_report_block_projects.test.sql`
- Modify: `supabase/config.toml` only if the repository explicitly enumerates pgTAP files there.

**Interfaces:**
- Produces: nullable `public.daily_okr_blocks.project_id uuid` with organization-safe project FK.
- Updates: all current `save_daily_report` overloads that accept block JSON; payload key is `projectId`.
- Updates: `private.can_review_daily_report_block` and dependent report/detail policies to use block project attribution.

- [ ] **Step 1: Write a failing pgTAP authorization test**

Create organization users, two projects, membership rows, one assigned KR, and reports covering linked, valid-unlinked, invalid-unlinked, mixed-project, and historical-null blocks. Assert:

```sql
select throws_ok(
  $$select * from public.save_daily_report(
    current_date,
    'submitted'::public.report_status,
    'internal'::public.classification,
    '[{"dailyObjective":"Unlinked work","linkedKeyResultId":"","projectId":"22222222-2222-2222-2222-222222222222","workDescription":"Work","hours":2,"result":"Done","evidenceLinks":[],"attachments":[]}]'::jsonb,
    '[]'::jsonb
  )$$,
  '42501',
  'Daily OKR project is not available to the current user'
);
```

Also assert the author can save a member project, project leader reads only blocks attributed to a led project, the same block is returned once, and a historical null-project block is invisible to that leader.

- [ ] **Step 2: Run pgTAP and verify failure**

Run: `supabase test db supabase/tests/daily_report_block_projects.test.sql`

Expected: FAIL because the column and validation do not exist. If Docker is unavailable, record that environmental blocker and continue only after the frontend tests; do not claim database verification passed.

- [ ] **Step 3: Add the forward schema migration**

Add `project_id`, its index, and a composite `(organization_id, project_id)` foreign key to projects. Do not backfill null historical blocks by inference.

- [ ] **Step 4: Replace save functions with mutually exclusive validation**

For each block:

```sql
linked_kr := nullif(item->>'linkedKeyResultId', '')::uuid;
requested_project_id := nullif(item->>'projectId', '')::uuid;

if linked_kr is not null then
  -- require private.is_kr_owner(linked_kr), derive project from key_results
elsif requested_project_id is null or not exists (
  select 1 from public.projects p
  left join public.project_members pm on pm.project_id = p.id and pm.profile_id = auth.uid()
  where p.id = requested_project_id
    and p.organization_id = target_org
    and (p.leader_id = auth.uid() or pm.profile_id is not null)
) then
  raise exception 'Daily OKR project is not available to the current user' using errcode = '42501';
end if;
```

Insert the derived or requested project into each block. Keep report-level `project_id/objective_id` only as legacy summary fields and do not use the first block to authorize every block.

- [ ] **Step 5: Update leader read helpers and detail RPC**

Authorize each block when the reviewer leads `block.project_id`; preserve author, management, HR, classification, and management-authored-report restrictions already present. Include `projectId` in `get_daily_report_detail` JSON. Revoke PUBLIC/anon access and restore only the exact authenticated grants required by RLS/RPCs.

- [ ] **Step 6: Run pgTAP suites**

Run: `supabase test db supabase/tests/daily_report_block_projects.test.sql supabase/tests/daily_report_optional_kr.test.sql supabase/tests/daily_report_leader_visibility.test.sql supabase/tests/hr_okr_work_hours.test.sql supabase/tests/rls.test.sql`

Expected: PASS.

- [ ] **Step 7: Commit the database contract**

```bash
git add supabase/migrations/202608270003_daily_report_block_projects.sql supabase/tests/daily_report_block_projects.test.sql supabase/config.toml
git commit -m "feat: secure daily work attribution by project"
```

Omit `supabase/config.toml` from `git add` if it did not require modification.

### Task 5: Map persisted project IDs through the repository

**Files:**
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/dailyReportMapper.ts`
- Modify: `src/data/dailyReportMapper.test.ts`

**Interfaces:**
- Consumes: `daily_okr_blocks.project_id` and detail RPC `projectId` from Task 4.
- Produces: `DailyOkrBlock.projectId` in dashboard rows, detail views, and edit drafts.

- [ ] **Step 1: Write failing mapper and repository tests**

Update fixtures with `project_id: 'p1'` and assert dashboard blocks, report details, and `dailyReportToDraft()` all retain `projectId: 'p1'`. Add a null historical row and assert it maps safely to `projectId: ''`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run src/data/supabaseRepository.test.ts src/data/dailyReportMapper.test.ts`

Expected: FAIL because project IDs are not selected or mapped.

- [ ] **Step 3: Implement repository mapping**

Add `project_id` to the `daily_okr_blocks` select list and map it to `projectId`. Update detail mapping to accept `row.projectId`, and update `dailyReportToDraft()` so edits preserve unlinked project attribution.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run src/data/supabaseRepository.test.ts src/data/dailyReportMapper.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit repository support**

```bash
git add src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/data/dailyReportMapper.ts src/data/dailyReportMapper.test.ts
git commit -m "feat: map daily block project attribution"
```

### Task 6: Enforce hours visibility and prevent double counting

**Files:**
- Modify: `src/dashboard/widgets/hoursFiltering.ts`
- Modify: `src/dashboard/widgets/hoursFiltering.test.ts`
- Modify: `src/dashboard/widgets/HoursWidget.tsx`
- Modify: `src/dashboard/widgets/HoursWidget.test.tsx`

**Interfaces:**
- Consumes: `DailyOkrBlock.projectId` from Task 5 and `Project.leaderId`/`memberIds`.
- Produces: one `HourEntry` per authorized block, using block project as scope and identity.

- [ ] **Step 1: Write failing scope tests**

Cover employee-own-only, project leader’s own blocks across all projects, member blocks in led projects, exclusion of member blocks from other projects, exclusion of historical null-project member blocks, inclusion of linked and unlinked blocks, and no duplicates when the same employee/project relationship is discoverable through multiple paths.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run src/dashboard/widgets/hoursFiltering.test.ts src/dashboard/widgets/HoursWidget.test.tsx`

Expected: FAIL because project leaders are currently scoped by Objective ownership and entire reports rather than individual block projects.

- [ ] **Step 3: Implement block-level authorization**

Build `ledProjectIds` from `projects.filter(project => project.leaderId === currentUser.id)`. For each block, resolve `projectId` from `block.projectId`, falling back to linked KR → Objective only for compatible historical linked rows. Include a block when:

```ts
report.authorId === currentUser.id
  || role === 'management'
  || (role === 'project_leader' && projectId !== '' && ledProjectIds.has(projectId))
```

Retain the existing separate HR workload path. Push each source block once; never loop over memberships to construct entries.

- [ ] **Step 4: Align widget filters and empty states**

For employees, hide or disable member filtering and label the view as personal hours. For project leaders, populate member/project filters only from authorized entries and led projects. Ensure summary hours, distinct member count, and record count all derive from the same filtered entry list.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/dashboard/widgets/hoursFiltering.test.ts src/dashboard/widgets/HoursWidget.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit hours scoping**

```bash
git add src/dashboard/widgets/hoursFiltering.ts src/dashboard/widgets/hoursFiltering.test.ts src/dashboard/widgets/HoursWidget.tsx src/dashboard/widgets/HoursWidget.test.tsx
git commit -m "fix: scope recorded hours by author and led projects"
```

### Task 7: Error-state regression coverage and full verification

**Files:**
- Modify: `src/components/RepositoryDataState.tsx` only if current behavior maps authorization/loading failures to empty content.
- Create: `src/components/RepositoryDataState.test.tsx` only if the component changes.
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: repository failures with code `42501` or equivalent permission errors.
- Produces: visible request/permission error state distinct from a successful empty dataset.

- [ ] **Step 1: Add regression tests for permission failures**

Mock `getDashboardData()` returning a permission failure and assert both Dashboard and Daily Reports render an error state, not zero cards or “暂无数据”. Add submission tests mapping stale KR assignment and stale project membership failures to the actionable localized messages introduced in Task 3 when the repository exposes distinguishable error details; otherwise assert the safe generic request failure.

- [ ] **Step 2: Run regression tests and verify their current result**

Run: `npm test -- --run src/pages/DailyReportsPage.test.tsx src/dashboard/DashboardPage.test.tsx src/components/RepositoryDataState.test.tsx`

Expected: either FAIL and require Step 3, or PASS proving no component change is needed. Record the result in the implementation notes.

- [ ] **Step 3: Make the minimal error-state correction if the tests fail**

Keep `ready` with zero rows as the only empty-data path. Render `RepositoryDataState` for `error` and preserve the translated repository error key. Do not catch a failed query and substitute `[]`.

- [ ] **Step 4: Run all frontend verification**

Run: `npm run test:run && npm run typecheck && npm run build`

Expected: all Vitest suites pass, TypeScript exits 0, and Vite production build exits 0.

- [ ] **Step 5: Run complete database verification**

Run: `supabase test db`

Expected: all pgTAP tests pass. If Docker/Supabase is unavailable, report this explicitly and do not describe database verification as complete.

- [ ] **Step 6: Inspect migration and grant safety**

Run:

```bash
git diff --check
rg -n "revoke all on function|grant execute on function" supabase/migrations/202608270003_daily_report_block_projects.sql
git status --short
```

Expected: no whitespace errors; every browser-callable RPC has authenticated execute and no unintended PUBLIC/anon grant.

- [ ] **Step 7: Commit final regression changes**

```bash
git add src/components/RepositoryDataState.tsx src/components/RepositoryDataState.test.tsx src/pages/DailyReportsPage.test.tsx src/dashboard/DashboardPage.test.tsx
git commit -m "test: cover daily report and hours permission regressions"
```

Only stage files actually changed.

## Deployment Checklist

- Apply `202608270003_daily_report_block_projects.sql` to the target Supabase project before or together with the frontend deployment.
- Verify the migration appears in the remote migration history.
- Log in as an assigned employee, a project leader, management, and HR and repeat the acceptance scenarios.
- Confirm Network responses for `daily_reports` and `daily_okr_blocks` contain no `42501` errors.
- Confirm a worker with a multi-owner KR sees it in the daily report selector and can add two independent blocks.
- Confirm project leader totals contain self + led-project member work and exclude unrelated projects.
