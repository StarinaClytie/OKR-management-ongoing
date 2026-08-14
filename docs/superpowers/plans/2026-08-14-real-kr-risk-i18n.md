# Real KR, Risk, Permissions, and Bilingual UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining demo-only KR/risk behavior with authorized Supabase persistence, clearly connect saved risk events to computed execution status, hide unauthorized project metadata, and add instant Chinese/English switching with Chinese default.

**Architecture:** PostgreSQL remains the authority for immutable actual-progress history, owned-subject risk events, locale preferences, and relationship-aware authorization. Stable domain codes drive deterministic calculations; React presentation translates codes at the boundary through a typed locale provider. Supabase mode reads and writes repository data only, while demo mode remains explicitly identified.

**Tech Stack:** React 19, TypeScript, Vite, Supabase PostgreSQL/Auth/Storage, Vitest, Testing Library, pgTAP, Nginx static deployment.

## Global Constraints

- Employees may update actual progress only for KRs they own.
- Employees may create/update/resolve risk events only for KRs or Objectives they own; Project Leaders may manage all risks in projects they lead.
- Risk matrix coordinates are `Y = probability 1..3`, `X = impact 1..3`; score is `probability × impact`.
- Risk-event severity and execution status are separate concepts; scores `1–4` do not alone escalate execution status.
- Execution status uses parallel progress, milestone, due-date, and unresolved-risk rules; the most severe result wins.
- Hidden projects expose no placeholder, name, count, classification, or ARIA metadata.
- First visit defaults to `zh-CN`; instant English switching keeps the URL unchanged.
- User-entered business content is not automatically translated.
- No AI behavior is introduced in this implementation.
- Production persistence is proven only in `VITE_APP_MODE=supabase`.

---

### Task 1: Immutable KR Progress and Risk Subject Schema

**Files:**
- Create: `supabase/migrations/202608140001_real_kr_risk_i18n.sql`
- Modify: `supabase/tests/schema.test.sql`
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: `public.save_kr_progress(p_key_result_id uuid, p_progress numeric, p_effective_date date, p_note text) returns uuid`
- Produces: `public.save_owned_risk(p_risk_id uuid, p_project_id uuid, p_key_result_id uuid, p_objective_id uuid, p_title text, p_probability smallint, p_impact smallint, p_reason text, p_mitigation text, p_last_reviewed_at date, p_classification classification, p_resolved boolean) returns uuid`
- Produces: `public.set_my_locale(p_locale text) returns void`

- [ ] **Step 1: Write failing schema and policy tests**

Add pgTAP assertions that profiles default to `zh-CN`, progress snapshots contain non-empty notes and immutable effective dates, risks reference exactly one owned KR or Objective, and all three RPCs exist. Add role tests proving an employee can append progress only to their own KR, can save a risk only against their own KR/Objective, a leader can save project risks, and HR/non-owner attempts fail.

- [ ] **Step 2: Run the database tests to verify RED**

```bash
npx supabase db reset
npx supabase test db
```

Expected: failures for missing locale, subject constraints, and RPC signatures.

- [ ] **Step 3: Implement the migration**

Add `preferred_locale text not null default 'zh-CN' check (preferred_locale in ('zh-CN','en'))`; add `note` and `effective_date` to `progress_snapshots`; add nullable `key_result_id`, `objective_id`, `resolved_at`, and a check requiring exactly one risk subject. Implement security-definer RPCs with explicit `auth.uid()` ownership/leader checks, `0..100` progress validation, non-empty notes/reasons/mitigations, probability/impact `1..3`, organization equality, and no direct employee update/delete grant on progress snapshots.

- [ ] **Step 4: Rebuild and verify GREEN**

```bash
npx supabase db reset
npx supabase test db
npx supabase db lint
```

Expected: all pgTAP tests pass and lint returns no schema errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608140001_real_kr_risk_i18n.sql supabase/tests
git commit -m "feat: secure KR progress and owned risk writes"
```

### Task 2: Supabase Repository Reads and Writes

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/demoRepository.ts`

**Interfaces:**
- Produces: `saveKrProgress(input: { keyResultId: string; progress: number; effectiveDate: string; note: string }): Promise<RepositoryResult<{ snapshotId: string }>>`
- Produces: `saveOwnedRisk(input: OwnedRiskInput): Promise<RepositoryResult<{ id: string }>>`
- Produces: `setMyLocale(locale: 'zh-CN' | 'en'): Promise<RepositoryResult<void>>`
- Produces real `getDashboardData` mappings for profiles, projects, Objectives, KRs, plans, milestones, risks, and progress snapshots.

- [ ] **Step 1: Write failing repository tests**

Assert exact RPC names/arguments, safe error mapping, row-to-domain mappings, risk subject IDs, resolved state, locale, and that Supabase mode never calls `mockRepository`.

- [ ] **Step 2: Run repository tests to verify RED**

```bash
npm test -- --run src/data/supabaseRepository.test.ts src/data/repositoryFactory.test.ts
```

Expected: missing repository methods and dashboard mapping failures.

- [ ] **Step 3: Implement typed repository methods and mappings**

Add `OwnedRiskInput`, `KrProgressInput`, stable `RepositoryResult` returns, RPC calls, and explicit table selects. Filter and map only data returned under RLS; never merge mock rows into Supabase results.

- [ ] **Step 4: Verify GREEN and type safety**

```bash
npm test -- --run src/data/supabaseRepository.test.ts src/data/repositoryFactory.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "feat: persist real KR progress and risk events"
```

### Task 3: Real Employee KR and Risk Workflows

**Files:**
- Create: `src/pages/KrProgressEditor.tsx`
- Create: `src/pages/KrProgressEditor.test.tsx`
- Modify: `src/pages/RiskEditor.tsx`
- Modify: `src/pages/RiskEditor.test.tsx`
- Modify: `src/pages/OkrManagementPage.tsx`
- Modify: `src/pages/pageFrameworks.test.tsx`

**Interfaces:**
- Consumes repository methods from Task 2.
- Produces employee actions `更新我的 KR / Update My KR` and `新增风险 / Add Risk`.

- [ ] **Step 1: Write failing interaction tests**

Use real employee data to assert owned-KR selection, `0` and `100` acceptance, out-of-range rejection, required date/note, duplicate-submit prevention, successful RPC persistence, failure value retention, owned KR/Objective risk subject selection, live coordinate/score text, and edit/resolve actions. Assert employees cannot select unowned subjects and leaders receive project-wide subjects.

- [ ] **Step 2: Run focused tests to verify RED**

```bash
npm test -- --run src/pages/KrProgressEditor.test.tsx src/pages/RiskEditor.test.tsx src/pages/pageFrameworks.test.tsx
```

- [ ] **Step 3: Implement editors and page data refresh**

Replace the simulation notice with the progress editor. Add `新增风险 / Add Risk`, an attached-risk list per owned OKR, edit/resolve controls for authorized events, and a route/action to the full matrix. After successful writes, refetch repository data and render the recalculated status explanation.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --run src/pages/KrProgressEditor.test.tsx src/pages/RiskEditor.test.tsx src/pages/pageFrameworks.test.tsx
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/pages
git commit -m "feat: add real employee KR and risk workflows"
```

### Task 4: Explain Risk Matrix and Status Relationship

**Files:**
- Modify: `src/domain/riskScore.ts`
- Modify: `src/domain/riskScore.test.ts`
- Modify: `src/domain/progressStatus.test.ts`
- Modify: `src/dashboard/widgets/RiskMatrixWidget.tsx`
- Modify: `src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx`
- Modify: `src/components/StatusExplanation.tsx`

**Interfaces:**
- Produces all nine `getRiskCoordinate(probability, impact)` results.
- Produces separate event severity and execution-status explanation copy.

- [ ] **Step 1: Write failing nine-cell and explanation tests**

Assert all 9 coordinate pairs, `1×3=3` is a medium event without automatic status escalation, score 6 escalates to at-risk, score 9 escalates to off-track, progress/date rules operate in parallel, and the most severe result wins. Component tests must find axis definitions, formula, score bands, example, and “risk event ≠ execution status” text.

- [ ] **Step 2: Run tests to verify RED**

```bash
npm test -- --run src/domain/riskScore.test.ts src/domain/progressStatus.test.ts src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx
```

- [ ] **Step 3: Implement coordinate and explanatory presentation**

Keep deterministic scoring unchanged, add a coordinate helper, visible help disclosure, score-band legend, and per-event text showing probability, impact, multiplication, event severity, and whether it escalates execution status. Status explanations enumerate every contributing parallel rule.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- --run src/domain/riskScore.test.ts src/domain/progressStatus.test.ts src/dashboard/widgets/ProjectVisualizationsWidget.test.tsx
git add src/domain src/dashboard src/components
git commit -m "feat: explain matrix events and execution status"
```

### Task 5: Hide Unauthorized Project Metadata

**Files:**
- Modify: `src/pages/ProjectsPage.tsx`
- Modify: `src/pages/pageFrameworks.test.tsx`
- Modify: `src/app/routes.test.tsx`

**Interfaces:**
- Produces authorized-project rows or a neutral empty state only.

- [ ] **Step 1: Write failing employee and HR non-disclosure tests**

Assert no restricted-content card, hidden count, hidden name, classification, description, or protected ARIA text exists for employee or HR. Retain a generic direct-route access-denied test without resource metadata.

- [ ] **Step 2: Run tests to verify RED**

```bash
npm test -- --run src/pages/pageFrameworks.test.tsx src/app/routes.test.tsx
```

- [ ] **Step 3: Remove hidden-project presentation and verify GREEN**

Render only authorized rows and neutral empty copy; do not calculate or expose hidden counts in the component.

```bash
npm test -- --run src/pages/pageFrameworks.test.tsx src/app/routes.test.tsx
git add src/pages/ProjectsPage.tsx src/pages/pageFrameworks.test.tsx src/app/routes.test.tsx
git commit -m "fix: hide unauthorized project metadata"
```

### Task 6: Type-Safe Chinese/English Switching

**Files:**
- Create: `src/i18n/messages.ts`
- Create: `src/i18n/LocaleProvider.tsx`
- Create: `src/i18n/LocaleProvider.test.tsx`
- Create: `src/components/LanguageSwitcher.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/layout/TopBar.tsx`
- Modify: route/page/widget files containing product copy.

**Interfaces:**
- Produces: `type Locale = 'zh-CN' | 'en'`
- Produces: `useLocale(): { locale: Locale; setLocale(locale: Locale): Promise<void>; t(key: MessageKey, values?: Record<string,string|number>): string }`

- [ ] **Step 1: Write failing locale tests**

Assert default Chinese, instant English switching without URL change, local restoration, authenticated profile preference override, repository persistence, safe persistence failure behavior, translated validation/status/matrix/permission/accessibility copy, and compile-time-equal message keys.

- [ ] **Step 2: Run tests to verify RED**

```bash
npm test -- --run src/i18n/LocaleProvider.test.tsx src/app/routes.test.tsx src/pages/pageFrameworks.test.tsx
```

- [ ] **Step 3: Implement provider, dictionaries, switcher, and presentation translation**

Use `zh-CN` as the synchronous fallback. Store `northstar.locale` locally; after authenticated profile load, apply and persist the profile locale. Translate system copy and stable codes only; render user-authored content unchanged.

- [ ] **Step 4: Scan for untranslated simulation/permission copy and verify**

```bash
rg -n "模拟进度|数据不会保存|受限内容" src
npm run test:run
npm run typecheck
npm run build
```

Expected: no production simulation notice; all tests, typecheck, and build pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: add Chinese English interface switching"
```

### Task 7: Bilingual User Guide and Production Gate

**Files:**
- Create: `docs/user-guide.zh-CN.md`
- Create: `docs/user-guide.en.md`
- Modify: `README.md`
- Modify: `docs/supabase-setup.md`
- Modify: `scripts/verify-supabase-config.mjs`

**Interfaces:**
- Produces bilingual operator/user explanations and rejects demo-mode production verification.

- [ ] **Step 1: Write guide validation and production-config tests**

Add a script check requiring both guides to contain probability/impact definitions, `riskScore = probability × impact`, the `1×3=3` example, parallel status rules, employee/leader permissions, real KR update instructions, and language switching. Add `--production` to the config verifier and assert it fails for `demo` and passes only with valid Supabase public configuration without printing keys.

- [ ] **Step 2: Write both complete user guides**

Document login, KR progress history, planned versus actual progress, employee `Add Risk`, why the event—not the OKR—enters the matrix, all nine cells, event severity versus execution status, most-severe-wins examples, project visibility, bilingual switching, attachment handling, and support/troubleshooting.

- [ ] **Step 3: Run complete local verification**

```bash
npm run test:run
npm run typecheck
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
VITE_APP_MODE=supabase VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-public-key node scripts/verify-supabase-config.mjs --production
git diff --check
```

- [ ] **Step 4: Browser smoke test**

Verify Chinese default, English switching, employee KR save, employee risk save/edit/resolve, automatic matrix placement, status explanations, leader project-wide risk management, employee/HR project non-disclosure, direct denial, desktop, and 390px layout. Live Supabase writes require the existing explicit migration approval gate.

- [ ] **Step 5: Commit**

```bash
git add README.md docs scripts
git commit -m "docs: add bilingual Northstar OKR user guide"
```

### Task 8: Pull Request and Deployment Handoff

**Files:**
- No new product files unless verification reveals a defect.

**Interfaces:**
- Produces a reviewed branch, exact migration list, and Aliyun rebuild instructions.

- [ ] **Step 1: Review branch diff and migration sequence**

Confirm the new migration follows `202608130003_storage.sql` and no secrets or service-role values are tracked.

- [ ] **Step 2: Push and update the existing PR**

```bash
git push origin codex/operational-okr-backend
gh pr view 1 --repo StarinaClytie/OKR-management-ongoing
```

- [ ] **Step 3: Stop at the live Supabase gate**

Present the exact migration and local pgTAP evidence before `supabase db push`. After explicit approval, apply migrations, rebuild Aliyun with `VITE_APP_MODE=supabase`, reload Nginx, and verify production behavior.
