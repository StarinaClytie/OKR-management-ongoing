# OKR Workflow and Application Shell Refinement Design

## Goal

Correct the remaining production workflow mismatch for KR owner selection and Daily OKR submission, simplify evidence capture to file-only attachments, and refine the resources filters and desktop application shell without adding demo data.

## Confirmed Business Rules

### KR owner selection

- A Project Leader may create Key Results only beneath an Objective assigned to that Project Leader.
- The Objective remains immutable to the Project Leader.
- The KR owner selector must include every approved, active organization member whose active role is `employee` or `project_leader`.
- Eligibility must not depend on existing `project_members` rows.
- Assigning an OWNER to a KR must atomically create the corresponding `project_members` relationship.
- The broader team directory remains role-scoped; selecting a KR owner must not accidentally grant Project Leaders organization-wide directory visibility elsewhere.

### Daily OKR report

Each Daily OKR entry has this order:

1. Related quarterly KR
2. Today's Objective
3. Related company Objective, derived read-only from the selected KR
4. Work description
5. Result / Data
6. File attachments
7. Recorded hours

The generic “关联与成果” section heading is removed. Evidence supports uploaded files only; webpage links are not supported. Each selected file shows an editable result name and classification. Its type is fixed to attachment and is not presented as an editable selector.

“Add another Daily OKR” appears after the current entry is complete. A failed client-side submission identifies the exact invalid fields, exposes inline messages, and moves focus to the first invalid field rather than showing only a generic status. One user still has at most one Daily Report per organization and report date; later saves update that report through the existing atomic upsert.

### Resources filters

The filter area uses the confirmed two-row card layout:

- Row 1: a full-width resource-name search field.
- Row 2: category, status, owner, and the archived toggle.
- Labels, heights, borders, focus states, and spacing follow the existing form system.
- The layout stacks cleanly at narrow widths.

### Sidebar and account tools

- Desktop sidebar supports expanded and collapsed states.
- Expanded state shows brand, navigation icons and labels, then language and account tools fixed at the bottom.
- Collapsed state remains an icon rail; navigation, language, account avatar, and expand control remain accessible with labels/tooltips.
- The chosen desktop state persists locally between navigation and reloads.
- Language and account controls are removed from the desktop top bar.
- The account menu retains profile, settings, organization/email summary, and sign-out.
- The active role is still visible in the account identity.
- Mobile continues to use the current modal drawer and is not forced into the desktop collapsed state.

## Root Causes

### Missing Employee in KR selector

`KeyResultFormModal` already accepts active approved `employee` and `project_leader` candidates. The production `list_organization_users()` RPC is the limiting boundary: for a Project Leader it returns only the caller and project-connected profiles. An employee with no `project_members` relationship never reaches the modal.

The fix is a focused `list_eligible_kr_owners()` SECURITY DEFINER RPC. It verifies the caller is an active Project Leader assigned to an eligible Objective/project context and returns only approved, active `employee` and `project_leader` profiles in the caller organization. The existing organization directory RPC keeps its narrower visibility rules.

### Opaque Daily Report validation

The form computes field-level validation issues but the overall status only says to complete required fields. Some controls do not render their corresponding message, so a visually complete lower section can conceal a missing field above it. The form needs a stable field-to-control mapping, inline messages for all required controls, an accessible error summary, and focus/scroll to the first invalid control.

## Architecture

### Database and repository

Add an idempotent migration that defines `public.list_eligible_kr_owners(p_objective_id uuid)`. The function derives the caller organization, verifies the caller may manage KRs for the Objective, and returns the minimal OrganizationUser-compatible JSON fields needed by the selector. Execution is granted only to `authenticated`.

Add `listEligibleKrOwners(objectiveId)` to `OkrRepository` and its Supabase implementation. The Objective detail page calls this focused method when opening the KR form. Demo repository behavior remains deterministic but no demo records are added.

The existing `ensure_kr_owner_project_membership` trigger remains the source of truth for automatic project membership. Database tests cover both candidate visibility and post-assignment membership.

### Daily entry components

Keep `DailyOkrBlockDraft.evidence` as the attachment collection to minimize data migration. Narrow new authoring behavior to file evidence. Split the visual evidence area into a focused file picker/list component if necessary, while retaining attachment upload state and per-entry ownership.

`DailyReportForm` owns validation submission and focus behavior. Every required control receives a stable ID/ref and its localized inline error. The status region provides a concise summary but does not replace field-level detail.

### Application shell

`AppShell` owns desktop collapsed state and persistence. `Sidebar` receives the state and callbacks, renders the collapse control and bottom utility region, and keeps mobile behavior separate. AccountMenu and LanguageSwitcher are reusable inside the sidebar. CSS uses explicit expanded and collapsed widths so the content column adjusts without overlaying the page.

### Resources toolbar

ResourcesPage receives a dedicated semantic class for the two-row filter card. Existing filter state and behavior remain unchanged; the change is visual and responsive only.

## Error Handling and Accessibility

- If eligible-owner loading fails, the KR modal displays a request error rather than an empty-list message that implies no employees exist.
- If no eligible employees exist, show the genuine empty state.
- A server rejection during KR save remains visible in the modal.
- Daily validation uses `aria-invalid`, `aria-describedby`, inline `role="alert"` messages, and focus on the first invalid control.
- Sidebar collapse control exposes `aria-expanded` and an explicit localized label.
- Collapsed links retain accessible names and visible tooltips on hover/focus.
- Persisted sidebar values are validated before use and fall back to expanded.

## Testing

### KR workflow

- Project Leader receives all approved active employees and Project Leaders even without project membership.
- Administrator, management, HR, pending, rejected, and inactive accounts are excluded.
- Unauthorized callers cannot use the focused RPC to enumerate eligible owners.
- OWNER assignment creates `project_members` before the assignment is stored.
- Project Leader still cannot edit the Objective.

### Daily reports

- A complete entry submits successfully.
- Missing required fields display their exact messages and focus the first invalid control.
- Result/Data is immediately followed by file attachment controls.
- File evidence exposes name and classification only; link authoring and editable type are absent.
- The next-entry control appears only after the current entry is complete.
- Same-day submission updates the existing Daily Report and does not violate the uniqueness constraint.

### Layout

- Resource search occupies the first toolbar row and remaining filters occupy the second.
- Resource filters stack at narrow widths.
- Desktop sidebar expands and collapses while preserving navigation.
- Collapsed state retains icons, language, account, accessible labels, and persistence.
- Mobile drawer behavior and focus trapping remain unchanged.
- Account menu retains profile, settings, and sign-out actions from its sidebar position.

## Deployment and Data Safety

- No demo users, Objectives, KRs, resources, or reports are created.
- The migration is additive/idempotent and does not rewrite user business data.
- Run database tests, focused component tests, full Vitest, TypeScript checking, and the production build before release.
- Deploy by pushing the code, pulling it on ECS, applying the new migration to the Alibaba RDS Supabase database, rebuilding production assets, and verifying the Administrator, Project Leader, and Employee workflows against real accounts.
