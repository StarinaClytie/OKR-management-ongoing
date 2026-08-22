# OKR Workflow and Application Shell Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Project Leaders assign KRs to any eligible real employee, make Daily OKR file evidence and validation unambiguous, and deliver the confirmed resources toolbar and collapsible sidebar layouts.

**Architecture:** Add a narrowly authorized Supabase RPC for KR owner candidates instead of widening the team directory, then route ObjectiveDetailPage through a new repository method. Keep daily evidence storage compatible while narrowing authoring to files and improving field-level focus/error behavior. AppShell owns persisted desktop collapse state; Sidebar owns navigation and bottom utility rendering; ResourcesPage receives a dedicated responsive toolbar class.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, PostgreSQL 17, Supabase/PostgREST, CSS.

## Global Constraints

- Do not create demo users, Objectives, KRs, reports, or resources.
- Project Leaders cannot edit Objectives.
- KR candidates are approved, active organization `employee` or `project_leader` accounts regardless of project membership.
- OWNER assignment must atomically create `project_members`.
- Daily evidence authoring accepts uploaded files only, not links.
- Desktop collapse state must not change mobile drawer behavior.
- All user-facing copy remains localized in Chinese and English.

---

### Task 1: Focused KR owner candidate authorization

**Files:**
- Create: `supabase/migrations/202608220001_eligible_kr_owners.sql`
- Modify: `supabase/tests/kr_owner_membership.test.sql`
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: `public.list_eligible_kr_owners(p_objective_id uuid) returns jsonb`
- Depends on: `private.current_organization_id()`, `private.has_role()`, `public.objectives`, `public.projects`, `public.profiles`, `public.user_roles`

- [ ] **Step 1: Add failing SQL assertions for organization-wide candidates**

Extend `supabase/tests/kr_owner_membership.test.sql` with a second approved active employee who has no `project_members` row. As the assigned Project Leader, call `public.list_eligible_kr_owners(objective_id)` and assert that both that employee and eligible Project Leaders are returned, while administrator/management/HR/pending/inactive profiles are absent.

- [ ] **Step 2: Add failing authorization assertions**

In `supabase/tests/rls.test.sql`, assert that an unrelated employee cannot enumerate candidates for an Objective and that a Project Leader cannot enumerate candidates for an Objective assigned to another leader.

- [ ] **Step 3: Run SQL tests and verify the function-missing failure**

Run the repository's documented pgTAP command for `supabase/tests/kr_owner_membership.test.sql` and `supabase/tests/rls.test.sql`.

Expected: FAIL because `public.list_eligible_kr_owners(uuid)` does not exist.

- [ ] **Step 4: Implement the idempotent SECURITY DEFINER RPC**

Create a migration with this contract:

```sql
create or replace function public.list_eligible_kr_owners(p_objective_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid := private.current_organization_id();
  result jsonb;
begin
  if caller_org is null or not exists (
    select 1
    from public.objectives o
    join public.projects pr on pr.id = o.project_id and pr.organization_id = o.organization_id
    where o.id = p_objective_id
      and o.organization_id = caller_org
      and o.owner_id = auth.uid()
      and private.has_role('project_leader')
  ) then
    raise exception 'Objective is not available for KR assignment' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(candidate order by candidate->>'display_name'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'email', coalesce(p.email, ''),
      'department', coalesce(p.department, ''),
      'job_title', coalesce(p.job_title, ''),
      'is_active', p.is_active,
      'approval_status', p.approval_status,
      'created_at', p.created_at,
      'preferred_locale', p.preferred_locale,
      'organizations', jsonb_build_object('name', org.name),
      'user_roles', jsonb_build_array(jsonb_build_object('role', ur.role)),
      'project_members', coalesce((
        select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
        from public.project_members pm
        where pm.organization_id = caller_org and pm.profile_id = p.id
      ), '[]'::jsonb)
    ) candidate
    from public.profiles p
    join public.organizations org on org.id = p.organization_id
    join public.user_roles ur on ur.profile_id = p.id and ur.organization_id = p.organization_id
    where p.organization_id = caller_org
      and p.is_active
      and p.approval_status = 'approved'
      and ur.is_active
      and ur.role in ('project_leader'::public.app_role, 'employee'::public.app_role)
  ) eligible;
  return result;
end;
$$;

revoke all on function public.list_eligible_kr_owners(uuid) from public, anon;
grant execute on function public.list_eligible_kr_owners(uuid) to authenticated;
```

Keep the exact authorization consistent with the existing Objective owner model and retain the existing OWNER membership trigger.

- [ ] **Step 5: Run SQL tests and verify they pass**

Expected: candidate and membership pgTAP assertions PASS; existing RLS assertions remain green.

- [ ] **Step 6: Commit the database boundary**

```bash
git add supabase/migrations/202608220001_eligible_kr_owners.sql supabase/tests/kr_owner_membership.test.sql supabase/tests/rls.test.sql
git commit -m "fix: expose eligible KR owners safely"
```

---

### Task 2: Route the KR form through the focused candidate API

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/demoRepository.ts`
- Modify: `src/pages/ObjectiveDetailPage.tsx`
- Modify: `src/pages/ObjectiveDetailPage.test.tsx`
- Modify: `src/pages/okr/selectorFiltering.test.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces: `OkrRepository.listEligibleKrOwners(objectiveId: string): Promise<RepositoryResult<OrganizationUser[]>>`
- Consumes: `public.list_eligible_kr_owners(p_objective_id uuid)`

- [ ] **Step 1: Write failing repository tests**

Assert that `SupabaseOkrRepository.listEligibleKrOwners('objective-1')` calls:

```ts
client.rpc('list_eligible_kr_owners', { p_objective_id: 'objective-1' })
```

and maps the returned JSON through the existing OrganizationUser mapper.

- [ ] **Step 2: Write failing Objective detail tests**

Open the KR modal as a Project Leader and assert that `listEligibleKrOwners(objective.id)` is used, an employee with `projectIds: []` is visible, and a request failure shows a localized error rather than the no-candidates hint.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test -- --run src/data/supabaseRepository.test.ts src/pages/ObjectiveDetailPage.test.tsx src/pages/okr/selectorFiltering.test.tsx
```

Expected: FAIL because the repository method and focused loading path are absent.

- [ ] **Step 4: Add the repository method and demo-compatible implementation**

Add the typed interface method. Supabase calls the focused RPC. Demo mode derives candidates from its existing users only; do not add records.

- [ ] **Step 5: Separate Objective and KR candidate loading**

Keep `listOrganizationUsers()` for management Objective leader selection. Change `openCreateKeyResult()` to call `listEligibleKrOwners(objectiveData.id)`, track loading failure separately, and pass only the focused result to `KeyResultFormModal`.

Add localized messages equivalent to:

```text
无法加载可分配的 KR 负责人，请稍后重试。
Unable to load eligible KR owners. Try again.
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Task 2 focused command. Expected: PASS.

- [ ] **Step 7: Commit the frontend candidate path**

```bash
git add src/data/types.ts src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/data/demoRepository.ts src/pages/ObjectiveDetailPage.tsx src/pages/ObjectiveDetailPage.test.tsx src/pages/okr/selectorFiltering.test.tsx src/i18n/messages.ts
git commit -m "fix: list all eligible KR owners"
```

---

### Task 3: File-only Daily OKR evidence and precise validation

**Files:**
- Modify: `src/domain/dailyEntry.ts`
- Modify: `src/domain/dailyEntry.test.ts`
- Modify: `src/pages/daily-report/DailyReportEvidence.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.tsx`
- Modify: `src/pages/daily-report/DailyReportForm.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Keeps: `DailyEvidenceDraft` persistence shape for compatibility
- Narrows authoring: newly selected evidence always has `kind: 'file'`
- Produces: exact inline validation messages and first-invalid-control focus

- [ ] **Step 1: Write failing file-only evidence tests**

Assert within each Daily OKR block that:

```ts
expect(screen.queryByText('关联与成果')).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /添加成果附件或链接/ })).not.toBeInTheDocument();
expect(screen.queryByRole('option', { name: '链接' })).not.toBeInTheDocument();
```

After uploading a `File`, assert Result/Data precedes the picker, the row exposes result name and classification, type is not editable, hours follows the attachment area, and the file draft uses `kind: 'file'`.

- [ ] **Step 2: Write failing validation focus tests**

Submit an incomplete form and assert the exact inline errors are visible. Assert `document.activeElement` is the first invalid quarterly-KR select. Fill fields progressively and ensure the next remaining error receives focus. Confirm a fully complete entry submits.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test -- --run src/domain/dailyEntry.test.ts src/pages/daily-report/DailyReportForm.test.tsx
```

Expected: FAIL because link authoring and the generic evidence heading remain, and missing-field focus is not implemented.

- [ ] **Step 4: Narrow validation to file evidence**

Reject non-file evidence in new drafts with a localized validation issue while preserving the mapper's ability to read old records. Keep classification validation and file label validation.

- [ ] **Step 5: Simplify DailyReportEvidence**

Remove objective-link props and UI, generic headings, add-link behavior, and type selector. Render one file picker followed by rows containing only:

```text
成果 N | 成果 N 密级 | 移除
```

Selected files remain in the same entry and continue through the existing upload lifecycle.

- [ ] **Step 6: Implement exact field errors and focus**

Give required controls stable IDs, render their issue immediately below the control, collect refs by validation field path, and on invalid submit call:

```ts
const firstIssue = validateDailyReportDraft(draft)[0];
fieldRefs.current.get(firstIssue.field)?.focus();
fieldRefs.current.get(firstIssue.field)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
```

Keep the overall status message as a summary. Ensure the add-another control stays after a complete block.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Task 3 command. Expected: PASS.

- [ ] **Step 8: Commit the Daily OKR refinement**

```bash
git add src/domain/dailyEntry.ts src/domain/dailyEntry.test.ts src/pages/daily-report/DailyReportEvidence.tsx src/pages/daily-report/DailyReportForm.tsx src/pages/daily-report/DailyReportForm.test.tsx src/i18n/messages.ts src/styles/global.css
git commit -m "fix: clarify Daily OKR evidence and validation"
```

---

### Task 4: Resources two-row filter card

**Files:**
- Modify: `src/pages/ResourcesPage.tsx`
- Modify: `src/pages/ResourcesPage.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Keeps all existing resource filter state and behavior
- Produces semantic `resources-filter-card`, search-row, and filter-row layout hooks

- [ ] **Step 1: Write a failing structure test**

Assert the search input is inside a dedicated first row and category/status/owner/archive controls are inside a second row within one labelled filter region.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- --run src/pages/ResourcesPage.test.tsx
```

Expected: FAIL because the page uses the generic one-row `filter-row`.

- [ ] **Step 3: Implement the confirmed B layout**

Render a semantic filter card with a full-width search row and a second controls row. Add responsive CSS that stacks controls below the existing narrow breakpoint, while keeping consistent form heights, labels, borders, and focus outlines.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 4 command. Expected: PASS.

- [ ] **Step 5: Commit the resources layout**

```bash
git add src/pages/ResourcesPage.tsx src/pages/ResourcesPage.test.tsx src/styles/global.css
git commit -m "style: refine resource filters"
```

---

### Task 5: Collapsible desktop sidebar with bottom utilities

**Files:**
- Modify: `src/layout/AppShell.tsx`
- Modify: `src/layout/AppShell.test.tsx`
- Modify: `src/layout/Sidebar.tsx`
- Modify: `src/layout/Sidebar.test.tsx`
- Modify: `src/layout/AccountMenu.tsx`
- Modify: `src/layout/AccountMenu.test.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces: desktop `collapsed: boolean`, `onCollapsedChange(next: boolean)` props on Sidebar
- Persists: localStorage key `time-tech-okr.sidebar-collapsed` with values `true` or `false`
- Keeps: mobile drawer props and behavior

- [ ] **Step 1: Write failing AppShell persistence tests**

Assert desktop starts expanded when storage is absent, toggling writes `true`, remounting restores collapsed state, invalid storage falls back to expanded, and mobile mode ignores desktop collapse state.

- [ ] **Step 2: Write failing Sidebar utility tests**

Assert expanded desktop Sidebar contains LanguageSwitcher and AccountMenu at the bottom. After collapse, link text is visually hidden but accessible names remain, icons remain, the account avatar and language action remain, and the toggle has correct `aria-expanded`/localized label.

- [ ] **Step 3: Run focused layout tests and verify RED**

```bash
npm test -- --run src/layout/AppShell.test.tsx src/layout/Sidebar.test.tsx src/layout/AccountMenu.test.tsx
```

Expected: FAIL because collapse state and sidebar utilities do not exist.

- [ ] **Step 4: Add persisted desktop state to AppShell**

Initialize state using a guarded localStorage read, persist on toggle, pass state/callback to desktop Sidebar, and remove LanguageSwitcher/AccountMenu from the desktop topbar. Keep any necessary mobile utility access inside the mobile drawer.

- [ ] **Step 5: Render Sidebar bottom utilities and collapse control**

Add an explicit bottom region after navigation. Reuse LanguageSwitcher and add an `AccountMenu` `compact: boolean` presentation prop so collapsed mode shows only the avatar. Tooltips/titles and accessible names must remain present.

- [ ] **Step 6: Implement expanded/collapsed CSS**

Use explicit custom properties or state classes for sidebar width and main content. Hide labels visually in compact mode without removing accessible names. Ensure brand mark, icons, account avatar, language button, and toggle align in the icon rail. Preserve mobile drawer width and transitions.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Task 5 command. Expected: PASS.

- [ ] **Step 8: Commit the application shell**

```bash
git add src/layout/AppShell.tsx src/layout/AppShell.test.tsx src/layout/Sidebar.tsx src/layout/Sidebar.test.tsx src/layout/AccountMenu.tsx src/layout/AccountMenu.test.tsx src/styles/global.css src/i18n/messages.ts
git commit -m "feat: add collapsible application sidebar"
```

---

### Task 6: Full verification and production handoff

**Files:**
- Modify: `docs/alibaba-rds-supabase-init.md` only if the new migration deployment step is not already covered generically

**Interfaces:**
- Validates all preceding tasks as one release

- [ ] **Step 1: Run the full frontend suite**

```bash
npm run test:run
```

Expected: all tests PASS.

- [ ] **Step 2: Run type checking and production build**

```bash
npm run typecheck
npm run build:production
```

Expected: both commands exit 0; only the existing chunk-size advisory may remain.

- [ ] **Step 3: Run SQL tests against an isolated test database**

Apply migrations through `202608220001_eligible_kr_owners.sql`, then run the pgTAP suite. Expected: all schema, RLS, KR membership, and daily-report tests PASS.

- [ ] **Step 4: Review the release diff**

```bash
git status --short
git diff --check
git log --oneline --decorate -8
```

Confirm there is no demo data, secret, `.env.production.local`, generated `dist`, or `.superpowers` content in the commit set.

- [ ] **Step 5: Perform role-based E2E QA**

Using real test accounts and Playwright if production-compatible credentials are available, verify:

```text
Administrator: role assignment remains available; Objective workflow unchanged.
Project Leader: sees assigned Objective, cannot edit it, creates KR, selects an unassigned Employee.
Employee: appears as KR owner, gains project membership, sees KR, submits and updates today's report.
All roles: resources filters and sidebar behavior match the confirmed layouts.
```

Do not create synthetic production accounts. If no safe real test account is available for a role, record that scenario as not executed rather than fabricating data.

- [ ] **Step 6: Prepare production commands**

After push/merge, the ECS handoff is:

```bash
cd /var/www/timetech-okr
git pull --ff-only origin main
```

Apply `supabase/migrations/202608220001_eligible_kr_owners.sql` to Alibaba RDS Supabase inside a transaction, notify PostgREST to reload schema, then:

```bash
npm run build:production
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] **Step 7: Report changed files, business logic, tests, and remaining issues**

Include production migration status separately from local test status. Do not claim the real role workflows passed unless they were executed with real authorized accounts.
