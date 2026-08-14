# Real KR Updates, Risk Semantics, Permissions, and Bilingual UX

## Goal

Replace remaining demo-only product actions with real Supabase-backed behavior, make the relationship between risk events and execution status explicit, hide unauthorized project metadata completely, and provide an instant Chinese/English interface with Chinese as the default.

## Risk Events and Execution Status Are Separate but Connected

The product has two distinct concepts:

1. **Risk event / 风险事件**: a concrete event entered by an authorized person and plotted in the 3×3 risk matrix.
2. **Execution status / 执行状态**: the computed health of a KR or Objective: on track, at risk, off track, or complete.

An employee may create and update risks linked to a KR they own. A Project Leader may create and manage every risk in their project. Other project members may read only risks allowed by relationship and classification policies. HR has no general risk-management permission.

Risk placement uses independently selected, explained axes:

- Probability `1`: unlikely, `<30%`; `2`: possible, `30–69%`; `3`: likely, `>=70%`.
- Business impact `1`: local and recoverable; `2`: affects a milestone or cross-team work; `3`: affects the Objective, deadline, compliance, or material business outcome.
- Matrix coordinate: `Y = probability`, `X = impact`.
- Score: `probability × impact`.
- Event severity: `1–2 low`, `3–4 medium`, `6 high`, `9 critical`.

Example: probability `1` and impact `3` is plotted at coordinate `(impact 3, probability 1)`, scores `3`, and is a medium risk event.

Execution status is calculated from parallel deterministic rules. The most severe applicable result wins:

- Actual minus planned progress `>= -10`: no status escalation from progress.
- Gap from `-25` through less than `-10`: at risk.
- Gap below `-25`: off track.
- An overdue incomplete milestone: at least at risk.
- A past-due incomplete KR: off track.
- An unresolved event score `6`: at least at risk.
- An unresolved event score `9`: at least off track.
- Event scores `1–4` remain visible and actionable but do not alone escalate execution status.

The UI must never collapse “medium risk event” into “at-risk execution status.” Every status displays its contributing reasons. Risk matrix help and the eventual user guide must explain both layers, the formulas, examples, and the most-severe-wins rule.

Risk events are user-reported, not AI-detected. The deterministic status engine evaluates saved progress, plans, milestones, dates, and saved unresolved risks. Future AI may suggest a possible risk, but it cannot create or score one without an authorized user confirming all fields.

## Real KR Progress Updates

“更新我的 KR / Update My KR” opens a real editor for KRs owned by the signed-in employee. The employee selects an owned KR, enters actual progress from `0–100`, an update note, and an effective date. Saving calls a restricted Supabase RPC and appends an immutable progress snapshot; it does not overwrite history.

Only the KR owner may enter actual progress. A Project Leader may set planned progress and milestones but may not impersonate the employee or alter the employee's recorded actual progress. After save, the UI reloads the affected KR and recalculates execution status from the current planned value, dates, milestones, and unresolved risks. Validation or authorization failure creates no snapshot.

Demo mode may keep an explicitly labeled local preview, but production/Supabase mode must never display “data will not be saved.” The deployed production configuration must use Supabase mode.

## Project Permission Presentation

Employees and HR see only projects they are authorized to know about. Hidden projects produce no placeholder, title, description, count, classification badge, or ARIA metadata. Consequently, the generic “受限内容 / Restricted content” card is removed from the project list for these roles.

If a user directly navigates to a known but unauthorized resource URL, a generic access-denied page remains appropriate and reveals no protected resource metadata. An empty authorized list displays only “当前没有可查看的项目 / No projects are available to you.”

## Chinese and English

The top bar provides an instant `中文 / English` switch without changing the URL. First visit defaults to Simplified Chinese. Before login, the preference is stored locally; after login, it is stored in the user's profile and local storage is used only as a fast initial preference. A signed-in profile preference wins after loading.

Translation coverage includes navigation, headings, buttons, forms, validation and server-safe errors, status names and explanations, matrix definitions, permission messages, empty states, accessibility labels, and the user guide. User-entered objectives, KRs, reports, evidence labels, risk reasons, and mitigations stay in their original language and are not automatically translated.

Use a type-safe in-application `zh-CN`/`en` dictionary and a small locale provider. Missing keys fail tests. Domain calculation functions return stable codes and numbers; UI translation happens at the presentation boundary.

## Data and Authorization Changes

- Add immutable KR progress snapshot creation through a `save_kr_progress` security-definer RPC with owner, organization, range, date, and note validation.
- Add risk-to-KR association so employee ownership can be authorized without broad project write access.
- Split risk create/update authorization: KR owner for their linked KR; Project Leader for any risk in the led project.
- Add locale preference to profiles with `zh-CN` default and a restricted self-update RPC.
- Repository reads must use Supabase-backed data in Supabase mode; mock data cannot silently supply production pages.
- RLS/pgTAP tests cover owner/non-owner/leader/HR behavior, immutable snapshot history, project metadata non-disclosure, and locale self-update boundaries.

## UI Components and Flows

- `KrProgressEditor`: owned-KR selector, progress, effective date, note, submit status, and accessible errors.
- `RiskEditor`: linked KR where applicable, probability and impact definitions, coordinate, live multiplication, severity, reason, mitigation, review date, resolution state.
- `RiskMatrixWidget`: visible axis definitions, formula, score-band legend, event/status distinction, and detailed status-impact explanation.
- `LocaleProvider` and `LanguageSwitcher`: immediate update and preference persistence.
- Project list: authorized rows only; no hidden-content placeholder.
- User guide: bilingual section explaining KR updates, planned versus actual progress, risk-event entry, nine cells, execution-status rules, permissions, and language switching.

## Error Handling

All writes return typed success or generic safe errors. Conflict, unauthorized, validation, and network errors are translated without leaking protected labels. Forms retain entered values after failure and prevent duplicate submission. Status calculation never mutates employee-entered progress and never silently fabricates a risk.

## Verification

- Unit tests for all nine risk coordinates, score bands, parallel status rules, most-severe-wins behavior, and translated explanations.
- Component tests for real KR editing, risk ownership/leader flows, bilingual switching, default Chinese, preference restoration, and hidden project metadata absence.
- Repository and pgTAP tests for progress immutability, owner-only actual progress, risk write boundaries, locale preference, and RLS.
- Browser smoke tests in Chinese and English for employee KR update, employee risk entry, leader risk management, matrix/status explanations, employee/HR project pages, and narrow layout.
- Production verification confirms `VITE_APP_MODE=supabase`; demo mode is not accepted as proof that real persistence works.

## AI Follow-up Boundary

AI integration is a separate design after this deterministic foundation ships. Candidate capabilities include KR-writing feedback, risk suggestions from authorized reports and progress, weekly summaries, and optional translation assistance. AI outputs remain suggestions requiring confirmation and may never directly change actual progress, risk score, execution status, permissions, or stored business records.
