# Enterprise OKR Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple, Chinese-first, role-aware enterprise OKR frontend with protected routing, mock data, confidentiality controls, role dashboards, and five interactive project visualizations.

**Architecture:** A React + TypeScript + Vite single-page application uses configuration-driven RBAC plus resource-scope checks. Domain-shaped mock repositories feed a role-specific dashboard registry and reusable visualization widgets, while route and component guards consume one permission service so navigation and actions remain consistent.

**Tech Stack:** React 19, TypeScript 5, Vite 7, React Router 7, Recharts 3, Lucide React, Vitest 3, Testing Library, jsdom, CSS Modules/global design tokens.

## Global Constraints

- The first release is Chinese-first.
- No backend, database, real authentication, real file encryption, real export generation, or AI OKR validation.
- Roles are `administrator`, `management`, `project_leader`, `employee`, and `hr`.
- Administrator may manage users, roles, permissions, settings, and audit metadata but cannot read confidential business content by default.
- Permission decisions combine role capability, resource scope, confidentiality level, and action.
- Project leaders may own KRs, update their own KRs, and author their own daily reports while reviewing project-member reports.
- All five project views ship: alignment tree, Gantt chart, progress trend, risk matrix, and workload.
- Default screens stay simple: one clear primary action, role-appropriate defaults, and advanced views disclosed through tabs.
- Use one mock domain model across dashboards and all visualizations.
- Unknown roles, unknown permissions, and incomplete resource context fail closed.
- Preserve all existing PDF, DOCX, XLSX, TXT, design, and Graphify files in the workspace.

---

## Planned File Structure

```text
package.json                         dependency and script contract
vite.config.ts                      Vite and Vitest configuration
tsconfig.json                       TypeScript project references
tsconfig.app.json                   browser compilation rules
tsconfig.node.json                  toolchain compilation rules
index.html                          SPA entry document
src/main.tsx                        React bootstrap
src/app/App.tsx                     router and provider composition
src/app/routes.tsx                  route metadata and protected routes
src/styles/tokens.css               color, spacing, type, radius tokens
src/styles/global.css               reset and responsive application styles
src/domain/types.ts                 domain and permission types
src/domain/permissions.ts           capability and scope definitions
src/mocks/users.ts                  role users
src/mocks/okr.ts                    projects, objectives, KRs, milestones
src/mocks/reports.ts                daily/weekly reports and work logs
src/mocks/security.ts               documents, grants, audit events
src/mocks/repository.ts             typed mock read API
src/auth/AuthContext.tsx            current simulated identity
src/auth/permissionService.ts       fail-closed permission evaluator
src/auth/PermissionGate.tsx         component-level access control
src/auth/ProtectedRoute.tsx         route-level access control
src/navigation/navigation.ts        sidebar metadata
src/layout/AppShell.tsx             top bar, sidebar, content shell
src/layout/Sidebar.tsx              permission-filtered navigation
src/components/*                    shared UI and security components
src/dashboard/dashboardRegistry.ts  per-role widget configuration
src/dashboard/DashboardPage.tsx     role dashboard composition
src/dashboard/widgets/*             dashboard and visualization widgets
src/pages/*                         route page frameworks
src/test/setup.ts                   Testing Library setup
src/**/*.test.ts(x)                 colocated unit/component tests
```

---

### Task 1: Application Foundation and Test Harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/test/setup.ts`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: none
- Produces: `App(): JSX.Element`, npm scripts `dev`, `build`, `test`, `test:run`, and `typecheck`

- [ ] **Step 1: Create the package and compiler contracts**

```json
{
  "name": "northstar-okr",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "lucide-react": "latest",
    "react": "latest",
    "react-dom": "latest",
    "react-router-dom": "latest",
    "recharts": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

Configure `vite.config.ts` with React and `test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true }`. Configure strict TypeScript, `jsx: react-jsx`, `moduleResolution: bundler`, and no emit.

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `node_modules/` and `package-lock.json` are created without dependency resolution errors.

- [ ] **Step 3: Write the failing smoke test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Chinese application identity', () => {
  render(<App />);
  expect(screen.getByText('Northstar OKR')).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:run -- src/app/App.test.tsx`

Expected: FAIL because `App` is not implemented.

- [ ] **Step 5: Implement the minimal application shell**

```tsx
export function App() {
  return <main><h1>Northstar OKR</h1></main>;
}
```

Create design tokens for near-white canvas, white surfaces, blue primary, charcoal text, muted borders, 4/8/12/16/24/32 spacing, and 6/10/14 radii. Bootstrap `App` from `src/main.tsx` and import tokens/global styles there.

- [ ] **Step 6: Verify the foundation**

Run: `npm run test:run -- src/app/App.test.tsx && npm run typecheck && npm run build`

Expected: one passing test, clean typecheck, and a successful production build.

- [ ] **Step 7: Initialize version control and commit**

Run: `git init && git add package.json package-lock.json index.html vite.config.ts tsconfig*.json src && git commit -m "chore: scaffold OKR frontend"`

Expected: a new local Git repository with the foundation committed; existing reference files remain unchanged and untracked until intentionally added.

---

### Task 2: Domain Model and Shared Mock Repository

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/permissions.ts`
- Create: `src/mocks/users.ts`
- Create: `src/mocks/okr.ts`
- Create: `src/mocks/reports.ts`
- Create: `src/mocks/security.ts`
- Create: `src/mocks/repository.ts`
- Test: `src/mocks/repository.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `Role`, `User`, `Project`, `Objective`, `KeyResult`, `DailyReport`, `WeeklyReport`, `DocumentRecord`, `Risk`, `Milestone`, `ProgressSnapshot`, `WorkloadEntry`; `mockRepository.getDashboardData(userId): DashboardData`

- [ ] **Step 1: Write repository behavior tests**

```ts
import { mockRepository } from './repository';

it('models a project leader who personally owns a KR', () => {
  const data = mockRepository.getDashboardData('user-project-leader');
  expect(data.keyResults.some(kr => kr.ownerId === data.currentUser.id)).toBe(true);
});

it('provides twelve weekly points for honest trend rendering', () => {
  const data = mockRepository.getDashboardData('user-project-leader');
  expect(data.progressSnapshots).toHaveLength(12);
});
```

- [ ] **Step 2: Run the repository tests to verify failure**

Run: `npm run test:run -- src/mocks/repository.test.ts`

Expected: FAIL because the repository and domain types do not exist.

- [ ] **Step 3: Define exact domain unions and records**

```ts
export type Role = 'administrator' | 'management' | 'project_leader' | 'employee' | 'hr';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ReportStatus = 'draft' | 'submitted' | 'returned' | 'confirmed';
export type ProgressStatus = 'on_track' | 'at_risk' | 'off_track' | 'complete';

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  ownerId: string;
  progress: number;
  status: ProgressStatus;
  startDate: string;
  dueDate: string;
  classification: Classification;
}
```

Define each remaining interface with stable string IDs and ISO date strings. `DailyReport` must include `authorId`, `projectId`, `objectiveId`, `keyResultIds`, `hours`, `evidence`, and `status`.

- [ ] **Step 4: Create coherent cross-file mock data**

Create one user per role, two projects, objectives and KRs with mixed ownership, twelve weekly progress snapshots, milestones, four risks, workloads, daily reports, weekly reports, confidential documents, an administrator without project membership, and HR-safe work-hour records.

Implement:

```ts
export interface DashboardData {
  currentUser: User;
  projects: Project[];
  objectives: Objective[];
  keyResults: KeyResult[];
  milestones: Milestone[];
  risks: Risk[];
  progressSnapshots: ProgressSnapshot[];
  workloads: WorkloadEntry[];
}

export const mockRepository = {
  getUser(id: string) { return users.find(user => user.id === id); },
  getDashboardData(userId: string): DashboardData { /* deterministic joins */ }
};
```

- [ ] **Step 5: Verify repository integrity**

Run: `npm run test:run -- src/mocks/repository.test.ts && npm run typecheck`

Expected: all repository tests pass and every cross-reference is typed.

- [ ] **Step 6: Commit**

Run: `git add src/domain src/mocks && git commit -m "feat: add OKR domain mock data"`

---

### Task 3: Fail-Closed Permission Architecture

**Files:**
- Create: `src/auth/permissionService.ts`
- Create: `src/auth/PermissionGate.tsx`
- Create: `src/auth/ProtectedRoute.tsx`
- Create: `src/auth/AuthContext.tsx`
- Test: `src/auth/permissionService.test.ts`
- Test: `src/auth/PermissionGate.test.tsx`

**Interfaces:**
- Consumes: `Role`, `User`, `Classification`, project membership and resource ownership
- Produces: `can(user, action, resource): PermissionDecision`, `useAuth()`, `<PermissionGate>`, `<ProtectedRoute>`

- [ ] **Step 1: Write failing permission tests**

```ts
it('denies administrators confidential body access without a grant', () => {
  expect(can(admin, 'document.read_body', confidentialDocument).allowed).toBe(false);
});

it('allows a project leader to edit their own KR', () => {
  expect(can(projectLeader, 'okr.update', leaderOwnedKr).allowed).toBe(true);
});

it('denies a project leader editing a member report body', () => {
  expect(can(projectLeader, 'daily_report.edit', memberReport).allowed).toBe(false);
});

it('allows HR to read authorized hours but not confidential report content', () => {
  expect(can(hr, 'worklog.read_hours', memberReport).allowed).toBe(true);
  expect(can(hr, 'daily_report.read_body', memberReport).allowed).toBe(false);
});
```

- [ ] **Step 2: Verify the permission tests fail**

Run: `npm run test:run -- src/auth/permissionService.test.ts`

Expected: FAIL because `can` and action definitions do not exist.

- [ ] **Step 3: Implement capability, scope, and classification evaluation**

```ts
export type Action =
  | 'dashboard.view' | 'okr.read' | 'okr.update' | 'project.manage'
  | 'daily_report.create' | 'daily_report.read' | 'daily_report.read_body'
  | 'daily_report.edit' | 'daily_report.review' | 'worklog.read_hours'
  | 'document.read_body' | 'document.download' | 'record.export'
  | 'user.manage' | 'permission.manage' | 'audit.read';

export interface PermissionDecision { allowed: boolean; reason: string; }

export function can(user: User | undefined, action: Action, resource?: PermissionResource): PermissionDecision {
  if (!user) return { allowed: false, reason: '需要登录' };
  // role capability -> scope -> classification -> ownership/grant
  return { allowed: false, reason: '没有访问权限' };
}
```

Use explicit role-action maps. Never default missing actions or missing resource context to allowed. Add special rules for administrator confidentiality, project-leader self-authorship, member-report review, and HR field-level hours access.

- [ ] **Step 4: Verify permission rules pass**

Run: `npm run test:run -- src/auth/permissionService.test.ts`

Expected: all role, scope, confidentiality, self-ownership, review, and export cases pass.

- [ ] **Step 5: Write and implement component guard tests**

```tsx
render(<PermissionGate action="document.read_body" resource={confidentialDocument} fallback={<span>受限内容</span>}><span>机密正文</span></PermissionGate>);
expect(screen.getByText('受限内容')).toBeInTheDocument();
expect(screen.queryByText('机密正文')).not.toBeInTheDocument();
```

Implement `AuthProvider` with five selectable mock users, `PermissionGate` with a non-leaking fallback, and `ProtectedRoute` that redirects to `/access-denied`.

- [ ] **Step 6: Run guard and type tests**

Run: `npm run test:run -- src/auth && npm run typecheck`

Expected: permission and guard suites pass.

- [ ] **Step 7: Commit**

Run: `git add src/auth src/domain/permissions.ts && git commit -m "feat: add role and confidentiality permissions"`

---

### Task 4: Protected Routing, Light Sidebar, and Role Switcher

**Files:**
- Create: `src/navigation/navigation.ts`
- Create: `src/layout/AppShell.tsx`
- Create: `src/layout/Sidebar.tsx`
- Create: `src/layout/RoleSwitcher.tsx`
- Create: `src/app/routes.tsx`
- Create: `src/pages/AccessDeniedPage.tsx`
- Create: `src/pages/NotFoundPage.tsx`
- Test: `src/layout/Sidebar.test.tsx`
- Test: `src/app/routes.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `Action`, `can`, `useAuth`
- Produces: `navigationItems`, `<AppShell>`, protected eight-route application

- [ ] **Step 1: Write failing navigation tests**

```tsx
it('shows administrator system settings but not confidential business shortcuts', () => {
  renderAppAs('administrator');
  expect(screen.getByRole('link', { name: '设置' })).toBeVisible();
  expect(screen.queryByText('机密项目正文')).not.toBeInTheDocument();
});

it('redirects an employee from an unauthorized settings route', async () => {
  renderAppAt('/settings', 'employee');
  expect(await screen.findByRole('heading', { name: '访问受限' })).toBeVisible();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:run -- src/layout/Sidebar.test.tsx src/app/routes.test.tsx`

Expected: FAIL because routing and navigation are absent.

- [ ] **Step 3: Define one route/navigation metadata source**

```ts
export interface NavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
  action: Action;
}

export const navigationItems: NavigationItem[] = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard, action: 'dashboard.view' },
  { path: '/okrs', label: 'OKR 管理', icon: Target, action: 'okr.read' },
  // projects, daily reports, weekly reports, team, analytics, settings
];
```

Use this same list for sidebar filtering and route guard metadata.

- [ ] **Step 4: Implement the confirmed light shell**

Build a near-white sidebar with blue active state, compact top bar, quarter selector, notification icon, role switcher, and responsive mobile drawer. Keep labels Chinese and avoid more than one primary action per page header.

- [ ] **Step 5: Implement protected routes**

Create routes for `/dashboard`, `/okrs`, `/projects`, `/daily-reports`, `/weekly-reports`, `/team`, `/analytics`, `/settings`, `/access-denied`, and `*`. Use lazy-free page imports initially to keep the scaffold transparent.

- [ ] **Step 6: Verify navigation and routes**

Run: `npm run test:run -- src/layout/Sidebar.test.tsx src/app/routes.test.tsx && npm run typecheck`

Expected: role menu and direct-route guard tests pass.

- [ ] **Step 7: Commit**

Run: `git add src/navigation src/layout src/app src/pages/AccessDeniedPage.tsx src/pages/NotFoundPage.tsx && git commit -m "feat: add protected application navigation"`

---

### Task 5: Shared Enterprise UI and Security Feedback

**Files:**
- Create: `src/components/MetricCard.tsx`
- Create: `src/components/ProgressRing.tsx`
- Create: `src/components/StatusBadge.tsx`
- Create: `src/components/ConfidentialityBadge.tsx`
- Create: `src/components/RestrictedContent.tsx`
- Create: `src/components/ExportGuard.tsx`
- Create: `src/components/EmptyState.tsx`
- Create: `src/components/WidgetErrorBoundary.tsx`
- Test: `src/components/securityComponents.test.tsx`

**Interfaces:**
- Consumes: `Classification`, `Action`, `PermissionResource`, `PermissionGate`
- Produces: shared presentational primitives used by every page and widget

- [ ] **Step 1: Write failing security feedback tests**

```tsx
it('does not leak a restricted document title', () => {
  render(<RestrictedContent classification="restricted" />);
  expect(screen.getByText('严格机密内容')).toBeVisible();
  expect(screen.queryByText(mockRestrictedDocument.title)).not.toBeInTheDocument();
});

it('blocks export when export permission is missing', async () => {
  render(<ExportGuard resource={confidentialProject}><button>导出</button></ExportGuard>);
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  expect(screen.getByText('你没有导出该记录的权限')).toBeVisible();
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm run test:run -- src/components/securityComponents.test.tsx`

Expected: FAIL because security components do not exist.

- [ ] **Step 3: Implement simple, consistent components**

Use fixed Chinese mappings for classification and status. `RestrictedContent` accepts no title/body props, preventing accidental leakage. `ExportGuard` evaluates `record.export`, leaves the child disabled when denied, and displays the decision reason without generating a file.

- [ ] **Step 4: Add accessible visual primitives**

`ProgressRing` must include an accessible label such as `完成进度 72%`; badges must include text, not color alone; `EmptyState` accepts exactly one primary action; the error boundary displays “该模块暂时无法显示” while preserving sibling widgets.

- [ ] **Step 5: Verify shared UI**

Run: `npm run test:run -- src/components && npm run typecheck`

Expected: security, leakage, export, accessible-name, and error-boundary tests pass.

- [ ] **Step 6: Commit**

Run: `git add src/components src/styles && git commit -m "feat: add accessible security-aware UI primitives"`

---

### Task 6: Role Dashboard Registry and Simple Role Layouts

**Files:**
- Create: `src/dashboard/types.ts`
- Create: `src/dashboard/dashboardRegistry.ts`
- Create: `src/dashboard/DashboardGrid.tsx`
- Create: `src/dashboard/DashboardPage.tsx`
- Create: `src/dashboard/widgets/TodayFocusWidget.tsx`
- Create: `src/dashboard/widgets/MyKeyResultsWidget.tsx`
- Create: `src/dashboard/widgets/CompanyHealthWidget.tsx`
- Create: `src/dashboard/widgets/ReportReviewWidget.tsx`
- Create: `src/dashboard/widgets/HrSummaryWidget.tsx`
- Create: `src/dashboard/widgets/AdminSystemWidget.tsx`
- Test: `src/dashboard/dashboardRegistry.test.ts`
- Test: `src/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `Role`, `DashboardData`, shared UI components
- Produces: `getDashboardConfig(role): DashboardConfig`, `<DashboardPage>`

- [ ] **Step 1: Write failing role-layout tests**

```ts
expect(getDashboardConfig('management').widgetIds).toContain('company-health');
expect(getDashboardConfig('project_leader').widgetIds).toContain('my-key-results');
expect(getDashboardConfig('employee').widgetIds).toContain('today-focus');
expect(getDashboardConfig('hr').widgetIds).toContain('hr-summary');
expect(getDashboardConfig('administrator').widgetIds).not.toContain('confidential-business-content');
```

- [ ] **Step 2: Verify registry tests fail**

Run: `npm run test:run -- src/dashboard/dashboardRegistry.test.ts`

Expected: FAIL because the registry is absent.

- [ ] **Step 3: Implement typed widget configuration**

```ts
export type WidgetId = 'today-focus' | 'my-key-results' | 'company-health' | 'report-review' | 'hr-summary' | 'admin-system' | 'project-visualizations';
export interface DashboardConfig { title: string; widgetIds: WidgetId[]; }

export function getDashboardConfig(role: Role): DashboardConfig {
  const config = registry[role];
  if (!config) throw new Error('未知角色');
  return config;
}
```

- [ ] **Step 4: Implement role dashboards with progressive disclosure**

Project leader layout starts with today focus, personal KRs, report review, and project visualization tabs. Employee starts with today focus and personal KRs. Management starts with company health and project visualizations. HR starts with HR summary and authorized workload/trend. Administrator starts with system/permission/audit status only.

- [ ] **Step 5: Test high-frequency task simplicity**

```tsx
renderDashboardAs('project_leader');
expect(screen.getByRole('button', { name: '填写今日日报' })).toBeVisible();
expect(screen.getByRole('button', { name: '更新 KR' })).toBeVisible();
expect(screen.queryByText('高级筛选')).not.toBeInTheDocument();
```

- [ ] **Step 6: Verify role dashboard suites**

Run: `npm run test:run -- src/dashboard && npm run typecheck`

Expected: each role receives its exact widget set and administrators see no business-body widget.

- [ ] **Step 7: Commit**

Run: `git add src/dashboard && git commit -m "feat: add role-specific dashboard registry"`

---

### Task 7: Five Interactive Project Visualization Widgets

**Files:**
- Create: `src/dashboard/widgets/WidgetTabs.tsx`
- Create: `src/dashboard/widgets/AlignmentTreeWidget.tsx`
- Create: `src/dashboard/widgets/GanttChartWidget.tsx`
- Create: `src/dashboard/widgets/ProgressTrendWidget.tsx`
- Create: `src/dashboard/widgets/RiskMatrixWidget.tsx`
- Create: `src/dashboard/widgets/WorkloadWidget.tsx`
- Create: `src/dashboard/widgets/ProjectVisualizationsWidget.tsx`
- Test: `src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx`
- Test: `src/dashboard/widgets/visualizationData.test.ts`

**Interfaces:**
- Consumes: shared `DashboardData`, current `User`, permission decisions
- Produces: keyboard-accessible five-tab project visualization surface

- [ ] **Step 1: Write failing interaction and data tests**

```tsx
it.each(['对齐树', '甘特图', '进度趋势', '风险矩阵', '工作负载'])('switches to %s', async label => {
  render(<ProjectVisualizationsWidget data={leaderData} />);
  await userEvent.click(screen.getByRole('tab', { name: label }));
  expect(screen.getByRole('tabpanel', { name: label })).toBeVisible();
});

it('marks a project leader owned KR as mine', () => {
  render(<AlignmentTreeWidget data={leaderData} />);
  expect(screen.getByText('周明（我）')).toBeVisible();
});
```

- [ ] **Step 2: Verify visualization tests fail**

Run: `npm run test:run -- src/dashboard/widgets`

Expected: FAIL because widgets are absent.

- [ ] **Step 3: Implement accessible tab switching**

Use `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`, and arrow-key navigation. Default to the role-appropriate view: alignment for project leader/management, trend for employee, workload for HR.

- [ ] **Step 4: Implement the alignment tree and Gantt**

Alignment tree uses nested semantic lists and connecting CSS lines; restricted nodes render `RestrictedContent`. Gantt uses a CSS grid with week columns, separate solid actual bars and dashed baseline bars, labeled milestone diamonds, and dependency indicators.

- [ ] **Step 5: Implement the progress trend**

Use Recharts `LineChart` with 12 weekly points, `actual` and `planned` lines, visible title/subtitle/percentage unit, direct legend, solid versus dashed strokes, and no gradient. If fewer than eight points are supplied, render a KPI comparison instead of a line chart.

- [ ] **Step 6: Implement risk matrix and workload**

Risk matrix positions text-labeled risks in a 3×3 probability-impact grid with non-color markers. Workload renders member name, planned hours, logged hours, capacity, direct numeric labels, and an overload state using tone plus text. Filter report content from HR data before rendering.

- [ ] **Step 7: Verify all five views and responsive fallback**

Run: `npm run test:run -- src/dashboard/widgets && npm run typecheck`

Expected: tabs switch; leader-owned KR is labeled; twelve-point trend renders; sparse trend falls back; risk labels remain readable without color; HR view contains hours but no report body.

- [ ] **Step 8: Commit**

Run: `git add src/dashboard/widgets && git commit -m "feat: add five OKR project visualizations"`

---

### Task 8: Eight Route Page Frameworks and Report Ownership Flows

**Files:**
- Create: `src/pages/OkrManagementPage.tsx`
- Create: `src/pages/ProjectsPage.tsx`
- Create: `src/pages/DailyReportsPage.tsx`
- Create: `src/pages/WeeklyReportsPage.tsx`
- Create: `src/pages/TeamPage.tsx`
- Create: `src/pages/AnalyticsPage.tsx`
- Create: `src/pages/SettingsPage.tsx`
- Create: `src/components/PageHeader.tsx`
- Create: `src/components/DataTable.tsx`
- Test: `src/pages/DailyReportsPage.test.tsx`
- Test: `src/pages/pageFrameworks.test.tsx`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: repository, permission gates, shared UI
- Produces: structured, non-persistent frameworks for all sidebar routes

- [ ] **Step 1: Write failing project-leader report tests**

```tsx
it('lets the project leader begin their own daily report', () => {
  renderPageAs('project_leader', '/daily-reports');
  expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
});

it('offers review actions but not edit for a member report', () => {
  renderPageAs('project_leader', '/daily-reports');
  expect(screen.getByRole('button', { name: '确认成员日报' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '编辑成员日报' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify page tests fail**

Run: `npm run test:run -- src/pages`

Expected: FAIL because the route pages are placeholders or missing.

- [ ] **Step 3: Implement consistent page frameworks**

Each page gets a Chinese title, one primary action, optional simple filter row, data summary/list, permission-aware actions, empty state, and explanatory mock-data badge. Avoid dense toolbars and hide advanced filters behind “更多筛选”.

- [ ] **Step 4: Implement report ownership behavior**

Daily reports show “我的日报” and, for project leaders, a separate “项目成员日报” review section. Create/edit buttons appear only for the report author. Project leaders receive comment/return/confirm actions. HR receives an hours-only table without `content` or `evidence` columns.

- [ ] **Step 5: Implement security-aware projects and settings**

Projects show classification badges and non-leaking restricted placeholders. Settings show system tabs only to administrator, HR rule preferences to HR, project preferences to project leaders, and personal preferences to all roles.

- [ ] **Step 6: Verify all route frameworks**

Run: `npm run test:run -- src/pages src/app/routes.test.tsx && npm run typecheck`

Expected: eight route pages render, report ownership is correct, HR field restrictions hold, and restricted projects do not leak titles.

- [ ] **Step 7: Commit**

Run: `git add src/pages src/components/PageHeader.tsx src/components/DataTable.tsx src/app/routes.tsx && git commit -m "feat: add OKR management page frameworks"`

---

### Task 9: Responsive, Accessibility, and Completion Verification

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/layout/AppShell.tsx`
- Modify: `src/dashboard/DashboardGrid.tsx`
- Modify: `src/dashboard/widgets/ProjectVisualizationsWidget.tsx`
- Create: `src/app/accessibility.test.tsx`
- Create: `README.md`

**Interfaces:**
- Consumes: complete frontend
- Produces: verified desktop/mobile application and local run guide

- [ ] **Step 1: Write failing responsive/accessibility assertions**

```tsx
it('gives every visualization tab an accessible selected state', () => {
  renderAppAs('project_leader');
  expect(screen.getByRole('tab', { name: '对齐树' })).toHaveAttribute('aria-selected', 'true');
});

it('has one primary Dashboard action for the employee role', () => {
  renderAppAs('employee');
  expect(screen.getAllByTestId('primary-action')).toHaveLength(1);
});
```

- [ ] **Step 2: Verify the tests fail where final polish is missing**

Run: `npm run test:run -- src/app/accessibility.test.tsx`

Expected: FAIL until primary-action and tab accessibility contracts are complete.

- [ ] **Step 3: Implement responsive simplification**

At widths below 768px, replace the sidebar with a drawer, stack dashboard columns, keep the primary action visible, make visualization tabs horizontally scrollable, and show alignment/Gantt summaries with a “查看详情” affordance rather than compressing unreadable charts.

- [ ] **Step 4: Complete keyboard and focus behavior**

Add visible `:focus-visible` rings; ensure drawer close/return focus; support arrow keys in visualization tabs; give icons accessible names only when they perform actions; mark decorative icons `aria-hidden="true"`.

- [ ] **Step 5: Write the local README**

Document:

```md
npm install
npm run dev
npm run test:run
npm run typecheck
npm run build
```

Explain the role switcher, mock-only security boundary, administrator confidentiality rule, and that all files remain local unless the user later deploys them.

- [ ] **Step 6: Run complete verification**

Run: `npm run test:run && npm run typecheck && npm run build`

Expected: all tests pass, TypeScript reports no errors, and Vite produces `dist/` successfully.

- [ ] **Step 7: Run a local visual smoke test**

Run: `npm run dev -- --host 127.0.0.1`

Verify in a browser at desktop and mobile widths: each role switch changes Dashboard content; all eight routes work; direct unauthorized URLs show access denied; all five tabs switch; light sidebar matches the approved direction; no restricted title/body leaks; project leader can start a personal report; HR sees hours without report content.

- [ ] **Step 8: Commit the verified foundation**

Run: `git add README.md src && git commit -m "test: verify responsive OKR foundation"`

Expected: clean working tree except intentionally untracked original reference files and generated local Graphify/brainstorm artifacts.

---

## Final Acceptance Checklist

- [ ] Chinese-first UI with light sidebar and low-complexity defaults
- [ ] Five simulated roles and one permission source of truth
- [ ] Administrator metadata access without default confidential-content access
- [ ] Project leader owns and updates personal KRs and authors personal daily reports
- [ ] Eight protected route frameworks
- [ ] Management, project leader, employee, HR, and administrator dashboards
- [ ] Alignment tree, Gantt, progress trend, risk matrix, and workload tabs
- [ ] Confidentiality badges, non-leaking restricted states, export guard, and audit hooks
- [ ] HR field-level work-hour view without confidential report content
- [ ] Automated tests, typecheck, production build, and desktop/mobile smoke test pass
