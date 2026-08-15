# Structured Daily OKR Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the daily-report placeholder action with a simple Chinese structured form for an employee-authored daily O, multiple KRs, self-assessed progress, per-KR hours, optional existing-OKR links, and classified evidence.

**Architecture:** Extend the typed mock domain with draft-only daily OKR fields, keep calculation guidance separate from employee-entered progress, and render the form as focused components inside the existing permission-filtered daily-report page. State remains local and mock-only; security decisions continue through the shared permission service, while help content is static and contains no protected resource data.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, existing CSS tokens and permission service.

## Global Constraints

- Chinese-first UI; no backend, network request, database, real upload, or AI quality evaluation.
- Employee and Project Leader may author only their own report; Project Leader may review but never edit a member's original report.
- Completion for every daily KR and the daily O is entered by the employee; the system may show formulas and a KR average reference but must never write or overwrite the self-assessment.
- Help uses progressive disclosure: one formula, one example, and one caution for the selected field; full guidance stays collapsed.
- Every attachment/evidence item has its own classification; no protected title, body, filename, count, tooltip, ARIA label, or hidden DOM may leak before authorization.
- Keep the form usable in a few minutes and avoid introducing a form or chart dependency.

---

## File Structure

- `src/domain/dailyEntry.ts`: draft types, KR measurement metadata, progress validation, and non-authoritative KR-average calculation.
- `src/domain/dailyEntry.test.ts`: pure tests for validation, reference average, and type-specific guidance.
- `src/pages/daily-report/DailyReportForm.tsx`: form orchestration and local draft state.
- `src/pages/daily-report/DailyObjectiveField.tsx`: daily O input and progressively disclosed O-writing examples.
- `src/pages/daily-report/DailyKeyResultEditor.tsx`: one KR's type-specific fields, hours, self-assessed progress, and selected guidance.
- `src/pages/daily-report/DailyReportEvidence.tsx`: optional OKR links and classified mock evidence rows.
- `src/pages/daily-report/DailyReportForm.test.tsx`: interaction, validation, progressive-help, and non-overwrite tests.
- `src/pages/DailyReportsPage.tsx`: open/close the authoring form while preserving permission-filtered lists and review-only member actions.
- `src/pages/DailyReportsPage.test.tsx`: route and role-boundary integration tests.
- `src/styles/global.css`: responsive two-column form/help layout and accessible controls.

### Task 1: Typed Daily Entry Model and Guidance

**Files:**
- Create: `src/domain/dailyEntry.ts`
- Create: `src/domain/dailyEntry.test.ts`
- Modify: `src/domain/types.ts`

**Interfaces:**
- Produces: `DailyKrType = 'quantity' | 'ratio' | 'milestone' | 'subjective'`.
- Produces: `DailyKeyResultDraft`, `DailyEvidenceDraft`, and `DailyReportDraft`.
- Produces: `validateProgress(value: number): string | null`.
- Produces: `getKrAverageReference(krs: DailyKeyResultDraft[]): number | null`.
- Produces: `getKrGuidance(type: DailyKrType): { label: string; formula: string; example: string; caution: string }`.
- Produces: `toLocalDailyReport(draft: DailyReportDraft, context: { authorId: string; projectId: string; fallbackObjectiveId: string; date: string }): DailyReport`.

- [ ] **Step 1: Write failing domain tests**

```ts
it('keeps progress employee-entered and only calculates a reference average', () => {
  const krs = [quantityKr({ progress: 75 }), quantityKr({ progress: 25 })];
  expect(getKrAverageReference(krs)).toBe(50);
  expect(krs.map((kr) => kr.progress)).toEqual([75, 25]);
});

it.each([[-1], [101]])('rejects progress outside 0 to 100: %s', (value) => {
  expect(validateProgress(value)).toBe('完成度需填写 0%～100%');
});

it('explains a quantity KR without calculating the employee value', () => {
  expect(getKrGuidance('quantity')).toEqual(expect.objectContaining({
    formula: '实际完成值 ÷ 目标值',
    example: '目标 20 条，完成 15 条，可填写 75%',
  }));
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm run test:run -- src/domain/dailyEntry.test.ts`

Expected: FAIL because `dailyEntry.ts` and its exported interfaces do not exist.

- [ ] **Step 3: Add the minimal types and pure helpers**

```ts
export type DailyKrType = 'quantity' | 'ratio' | 'milestone' | 'subjective';

export interface DailyKeyResultDraft {
  id: string;
  title: string;
  type: DailyKrType;
  hours: number;
  progress: number;
  workNote: string;
  targetValue?: number;
  actualValue?: number;
  baselineValue?: number;
  dueDate?: string;
  milestoneStatus?: 'not_started' | 'in_progress' | 'completed';
  acceptanceCriteria?: string;
  linkedKeyResultId?: string;
}

export interface DailyEvidenceDraft {
  id: string;
  label: string;
  kind: 'file' | 'link';
  classification: Classification;
}

export interface DailyReportDraft {
  dailyObjective: string;
  objectiveProgress: number;
  linkedObjectiveId?: string;
  keyResults: DailyKeyResultDraft[];
  evidence: DailyEvidenceDraft[];
  classification: Classification;
}

export const validateProgress = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= 100 ? null : '完成度需填写 0%～100%';

export function getKrAverageReference(krs: DailyKeyResultDraft[]) {
  if (krs.length === 0) return null;
  return Math.round(krs.reduce((sum, kr) => sum + kr.progress, 0) / krs.length);
}

const classificationRank: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function mostRestrictiveClassification(current: Classification, item: DailyEvidenceDraft) {
  return classificationRank[item.classification] > classificationRank[current]
    ? item.classification
    : current;
}

export function toLocalDailyReport(
  draft: DailyReportDraft,
  context: { authorId: string; projectId: string; fallbackObjectiveId: string; date: string },
): DailyReport {
  return {
    id: `local-${context.authorId}-${context.date}`,
    authorId: context.authorId,
    projectId: context.projectId,
    objectiveId: draft.linkedObjectiveId ?? context.fallbackObjectiveId,
    keyResultIds: draft.keyResults.flatMap((kr) => kr.linkedKeyResultId ? [kr.linkedKeyResultId] : []),
    date: context.date,
    content: draft.dailyObjective,
    dailyObjective: draft.dailyObjective,
    objectiveProgress: draft.objectiveProgress,
    dailyKeyResults: draft.keyResults,
    classification: draft.classification,
    hours: draft.keyResults.reduce((sum, kr) => sum + kr.hours, 0),
    evidence: draft.evidence.map((item) => item.label),
    evidenceClassification: draft.evidence.reduce<Classification>(mostRestrictiveClassification, 'public'),
    attachmentIds: [],
    status: 'submitted',
  };
}
```

Add `dailyObjective`, `objectiveProgress`, and typed `dailyKeyResults` as optional fields on persisted `DailyReport` so existing fixtures remain compatible while mock submissions can be represented.

- [ ] **Step 4: Run focused and affected domain tests**

Run: `npm run test:run -- src/domain/dailyEntry.test.ts src/mocks/repository.test.ts src/auth/permissionService.test.ts`

Expected: PASS; existing report permissions remain unchanged.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/domain/dailyEntry.ts src/domain/dailyEntry.test.ts src/domain/types.ts
git commit -m "feat: model structured daily OKR entries"
```

### Task 2: Progressive Daily O and KR Form

**Files:**
- Create: `src/pages/daily-report/DailyObjectiveField.tsx`
- Create: `src/pages/daily-report/DailyKeyResultEditor.tsx`
- Create: `src/pages/daily-report/DailyReportEvidence.tsx`
- Create: `src/pages/daily-report/DailyReportForm.tsx`
- Create: `src/pages/daily-report/DailyReportForm.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `DailyReportDraft`, `DailyKeyResultDraft`, `DailyKrType`, `getKrGuidance`, `getKrAverageReference`, and `validateProgress` from Task 1.
- Produces: `DailyReportForm({ objectives, keyResults, onCancel, onSubmit })` where `onSubmit(draft: DailyReportDraft): void` receives only the current employee's local draft.

- [ ] **Step 1: Write failing interaction and safety tests**

```tsx
it('shows concise O help and reveals full examples only on request', async () => {
  renderForm();
  expect(screen.getByText('建议使用动词＋结果描述今天最重要的目标')).toBeVisible();
  expect(screen.queryByText('副词＋动词＋名词')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '查看更多 O 写法' }));
  expect(screen.getByText('副词＋动词＋名词')).toBeVisible();
});

it('never overwrites employee-entered KR or O progress', async () => {
  renderForm();
  await enterQuantityKr({ target: '20', actual: '15', progress: '70' });
  expect(screen.getByLabelText('KR1 完成度')).toHaveValue(70);
  expect(screen.getByText('公式参考：实际完成值 ÷ 目标值')).toBeVisible();
  expect(screen.getByText(/KR 平均完成度参考：70%/)).toBeVisible();
  expect(screen.getByLabelText('当日 O 完成度')).toHaveValue(null);
});

it('switches fields and one concise information card with KR type', async () => {
  renderForm();
  await user.selectOptions(screen.getByLabelText('KR1 度量类型'), 'milestone');
  expect(screen.getByLabelText('KR1 截止日期')).toBeVisible();
  expect(screen.getByLabelText('KR1 当前状态')).toBeVisible();
  expect(screen.queryByLabelText('KR1 目标值')).not.toBeInTheDocument();
  expect(screen.getByText('完成可填写 100%，未完成可填写 0%')).toBeVisible();
});
```

Add explicit cases for the remaining contract:

```tsx
expect(screen.getAllByRole('group', { name: /当日 KR/ })).toHaveLength(1);
await user.click(screen.getByRole('button', { name: '添加 KR' }));
expect(screen.getAllByRole('group', { name: /当日 KR/ })).toHaveLength(2);
await user.type(screen.getByLabelText('KR1 本日工时'), '3.5');
await user.type(screen.getByLabelText('KR1 完成度'), '101');
expect(screen.getByText('完成度需填写 0%～100%')).toBeVisible();
expect(screen.getByLabelText('关联已有 O')).toBeVisible();
expect(screen.getByRole('button', { name: '添加成果附件或链接' })).toBeEnabled();
expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the form test and verify RED**

Run: `npm run test:run -- src/pages/daily-report/DailyReportForm.test.tsx`

Expected: FAIL because the form components do not exist.

- [ ] **Step 3: Implement the minimal controlled form**

Use one `DailyReportDraft` state in `DailyReportForm`. Create KR IDs locally with a deterministic counter for tests. Render an `<aside aria-label="填写帮助">` whose content comes only from `getKrGuidance(selectedType)` and contains no project resource title unless that resource has already been permission-filtered by the parent.

The form order must be:

```text
当日 O
当日 O 完成度（员工填写） + KR 平均值参考
KR1 / KR2 / …（类型、内容、工时、完成度、类型字段、工作说明）
关联已有 OKR（可选）
成果附件或链接 + 独立密级
保存草稿 / 提交日报（均为页面内模拟状态）
```

Do not derive or set `progress` in a target/current-value effect. The only progress setter must be the employee's completion input handler.

- [ ] **Step 4: Add responsive and accessible CSS**

Use the existing tokens. At desktop width, use `minmax(0, 1fr) 280px` for form and contextual help. Below 760px, stack the help below the active editor. Keep the primary submit action visible without sticky overlays, preserve keyboard focus outlines, and label every repeated KR input with its KR number.

```css
.daily-entry-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: var(--space-5);
}

@media (max-width: 760px) {
  .daily-entry-layout { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Run focused tests, typecheck, and diff check**

Run: `npm run test:run -- src/pages/daily-report/DailyReportForm.test.tsx src/domain/dailyEntry.test.ts`

Run: `npm run typecheck`

Run: `git diff --check`

Expected: all PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/pages/daily-report src/styles/global.css
git commit -m "feat: add guided daily OKR form"
```

### Task 3: Permission-Safe Page Integration and Final Verification

**Files:**
- Modify: `src/pages/DailyReportsPage.tsx`
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/mocks/reports.ts`
- Test: `src/pages/pageFrameworks.test.tsx`
- Test: `src/auth/permissionService.test.ts`

**Interfaces:**
- Consumes: `DailyReportForm` from Task 2 and permission-filtered `DashboardData` from the mock repository.
- Produces: a real `填写今日日报` flow that adds a mock local report to the author's list without mutating repository fixtures or enabling member-report edits.

- [ ] **Step 1: Write failing route and role-boundary tests**

```tsx
it('lets an employee submit a structured daily O and KR with self-entered progress', async () => {
  renderPageAs('user-employee');
  await user.click(screen.getByRole('button', { name: '填写今日日报' }));
  await user.type(screen.getByLabelText('当日 O'), '完成原型验证，为评审提供依据');
  await user.type(screen.getByLabelText('当日 O 完成度'), '60');
  await user.type(screen.getByLabelText('KR1'), '完成 20 条数据收集');
  await user.type(screen.getByLabelText('KR1 完成度'), '75');
  await user.type(screen.getByLabelText('KR1 本日工时'), '3.5');
  await user.click(screen.getByRole('button', { name: '提交日报' }));
  expect(screen.getByText('完成原型验证，为评审提供依据')).toBeVisible();
  expect(screen.getByText('75%')).toBeVisible();
});

it('keeps a project leader in author mode for self and review-only mode for members', async () => {
  renderPageAs('user-project-leader');
  expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '确认成员日报' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '编辑成员日报' })).not.toBeInTheDocument();
});
```

Add explicit assertions that HR still receives hours-only output, unauthorized linked titles are absent, evidence classification survives submission, and no AI control exists:

```tsx
it('keeps HR out of the authoring form and report body', () => {
  renderPageAs('user-hr');
  expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('当日 O')).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: '日报内容' })).not.toBeInTheDocument();
});

it('does not offer unauthorized OKR titles or AI controls', async () => {
  renderPageAs('user-employee');
  await user.click(screen.getByRole('button', { name: '填写今日日报' }));
  expect(screen.queryByRole('option', { name: '严格机密经营目标' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm run test:run -- src/pages/DailyReportsPage.test.tsx src/pages/pageFrameworks.test.tsx`

Expected: FAIL because `填写今日日报` does not open or submit `DailyReportForm`.

- [ ] **Step 3: Integrate the form behind existing author permission**

Keep a `localReports` state initialized empty and combine it with `readableReports` only after the submitted draft is converted to a `DailyReport` owned by `currentUser.id`. Pass only objectives and KRs already allowed by `can(currentUser, 'okr.read_basic', resource)` into selectors. Preserve the current HR early return and the Project Leader member-review table unchanged.

```tsx
const [isAuthoring, setIsAuthoring] = useState(false);
const [localReports, setLocalReports] = useState<DailyReport[]>([]);
const linkableObjectives = data.objectives.filter(
  (objective) => can(currentUser, 'okr.read_basic', objective).allowed,
);
const linkableKeyResults = data.keyResults.filter(
  (keyResult) => can(currentUser, 'okr.read_basic', keyResult).allowed,
);

function handleSubmit(draft: DailyReportDraft) {
  setLocalReports((reports) => [toLocalDailyReport(draft, {
    authorId: currentUser.id,
    projectId: authoringReport.projectId,
    fallbackObjectiveId: authoringReport.objectiveId,
    date: '2026-08-11',
  }), ...reports]);
  setNotice('日报已保存到当前演示页面，尚未连接后端。');
  setIsAuthoring(false);
}
```

On mock submit, show `日报已保存到当前演示页面，尚未连接后端。` and close the form. Do not generate a real file or upload; evidence rows remain local metadata.

- [ ] **Step 4: Run focused and full verification**

Run: `npm run test:run -- src/domain/dailyEntry.test.ts src/pages/daily-report/DailyReportForm.test.tsx src/pages/DailyReportsPage.test.tsx src/pages/pageFrameworks.test.tsx src/auth/permissionService.test.ts`

Run: `npm run test:run`

Run: `npm run typecheck`

Run: `npm run build`

Run: `git diff --check`

Expected: all tests pass; typecheck and build exit 0; only the already-known Vite chunk-size advisory may remain.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/pages/DailyReportsPage.tsx src/pages/DailyReportsPage.test.tsx src/mocks/reports.ts
git commit -m "feat: integrate structured daily OKR authoring"
```
