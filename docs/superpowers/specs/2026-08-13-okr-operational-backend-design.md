# Operational OKR Backend and Workflow Refinements

**Date:** 2026-08-13
**Status:** Approved for implementation planning

## Purpose

Convert the current frontend-only OKR demonstration into a deployable first backend phase using Supabase Auth, PostgreSQL, and private Supabase Storage. This phase implements requirements 1–7 from the product review while preserving the existing five-role permission model and manually entered employee completion percentages. AI writing assistance remains out of scope.

## Scope

This phase delivers:

1. Transparent criteria for `正常推进`, `存在风险`, `已偏离`, and `已完成`.
2. User-managed planned-progress baselines for trend and Gantt views.
3. An explained risk matrix with corrected axis presentation and deterministic placement.
4. Functional editing of a user's submitted daily reports with revision history.
5. Improved spacing in the daily-report form and Settings personal preferences.
6. Persistent file attachments and links backed by Supabase Storage and PostgreSQL.
7. Preservation and backend persistence of the approved structured daily-report workflow.

AI analysis, AI rewriting, and AI-generated completion values are explicitly excluded.

## Architecture

The React application remains the presentation layer. A new data-access layer owns all Supabase calls and maps database rows to domain models. Page and widget components consume typed repository interfaces instead of importing Supabase directly.

Supabase provides:

- Auth for email/password identity and sessions.
- PostgreSQL for profiles, roles, organizational relationships, OKRs, reports, revisions, plans, risks, and attachment metadata.
- Private Storage for uploaded report files.
- Row Level Security for every business table and Storage object.
- Signed URLs for authorized downloads.

Local mock data remains available only when `VITE_APP_MODE=demo`. Hosted environments use `VITE_APP_MODE=supabase`; the role switcher is hidden and cannot influence authorization there.

## Identity and Role Assignment

Authentication uses Supabase email/password sign-in. `auth.users.id` is the canonical user identifier.

A `profiles` row is created for each authenticated user. New profiles start with no organizational role and cannot read business data. An Administrator assigns one of these roles:

- Administrator
- Management
- Project Leader
- Employee
- HR

Administrator is a system-governance role, not a synonym for Management. Administrators manage users, roles, policies, and audit metadata but do not automatically receive confidential business content. Management receives organization-wide business visibility according to classification policy.

## Core Data Model

### Organization and access

- `profiles`: user identity, display name, active status.
- `user_roles`: one active organizational role per user for this version.
- `reporting_lines`: manager/subordinate relationships.
- `projects`: project metadata and owning Project Leader.
- `project_members`: user membership in a project.
- `collaboration_links`: explicit work-related access with expiry and grantor metadata.

### OKRs and planning

- `objectives`: company, project, or personal Objectives with owner, project, classification, dates, and current progress.
- `key_results`: typed KRs with owner, measurement method, target/current values, dates, classification, and employee-entered progress.
- `progress_baselines`: dated planned values for a KR.
- `milestones`: planned and actual milestone dates/statuses for Gantt display.
- `risks`: title, explanation, probability, impact, mitigation, owner, project, classification, and review timestamp.

### Daily reporting

- `daily_reports`: author, date, project, linked Objective, status, aggregate hours, classification, and current revision number.
- `daily_report_revisions`: immutable snapshots of every successful create or edit.
- `daily_objectives`: the report's daily O text and employee-entered progress.
- `daily_key_results`: ordered daily KRs, measurement fields, work hours, work note, linked KR, and employee-entered progress.
- `report_evidence_links`: URL evidence with independent classification.
- `report_attachments`: file metadata, Storage path, MIME type, byte size, checksum, classification, uploader, and lifecycle state.

All business records include `created_at` and `updated_at`; revision and audit records are append-only.

## Authorization and Transparency Rules

RLS is the authoritative security boundary. Frontend gates are retained for usability but never replace RLS.

### Full-detail visibility

Full detail includes O/KR content, progress, daily-report body, each daily O/KR, work notes, evidence, and authorized attachments.

- Management can read all organizational business records allowed by their classification clearance.
- A manager can read subordinate records along the reporting line within classification limits.
- A Project Leader can read member records for projects they lead.
- Members of the same project can read one another's project-related OKRs and reports within classification limits.
- An explicitly linked collaborator can read the granted resource until the grant expires.
- Authors and owners can read and modify their own records where workflow status permits.

### Summary-only upward visibility

A subordinate can read an upstream manager's Objective title, KR titles, and KR progress. The subordinate cannot read the manager's report body, work notes, evidence, attachments, or other detailed content unless another full-detail relationship applies.

### HR visibility

HR can read authorized workload fields: user, date, project, total hours, planned hours, and capacity. HR cannot read daily O/KR text, report body, work notes, evidence labels, attachment names, Storage paths, or signed URLs unless HR separately qualifies through a business relationship.

### Administrator visibility

Administrators can manage profile, role, policy, bucket, and audit metadata. They do not receive business-body access merely because they are administrators.

### Classification

Every sensitive resource has `public`, `internal`, `confidential`, or `restricted` classification. Classification is checked per resource before selection or aggregation. Attachment access is evaluated independently from its report and from neighboring attachments.

## Status Criteria

Status is derived by a pure, documented function from the employee-entered actual progress and the planned progress expected as of the evaluation date. The system does not calculate or overwrite the employee's completion percentage.

Let `gap = actualProgress - plannedProgress` in percentage points:

- `已完成`: actual progress is 100%, or the KR is explicitly completed with all required milestones completed.
- `正常推进`: `gap >= -10`, no overdue incomplete milestone, and no unresolved high risk.
- `存在风险`: `-25 <= gap < -10`, or there is an overdue incomplete milestone, or an unresolved risk score is 6 or higher.
- `已偏离`: `gap < -25`, or the due date has passed while progress is below 100%, or an unresolved risk score is 9.

When several rules apply, the most severe status wins. The UI shows an explanation such as “实际 55%，计划 72%，落后 17 个百分点” and lists milestone/risk overrides. Authorized users may correct source inputs but cannot directly select an unexplained status.

## Planned Progress

Authorized Objective/KR owners and Project Leaders can define baseline points with a date and expected percentage/value. The editor validates:

- dates fall within the KR period;
- dates are unique and ascending;
- values do not decrease for cumulative measurement types;
- percentage plans stay between 0 and 100;
- the final point matches the target date and intended target.

Trend charts use baseline points for the dashed planned line and recorded progress snapshots for the solid actual line. Gantt charts use milestone planned dates for dashed baseline bars and actual dates/status for solid execution bars. Each view contains a visible legend and a concise “How this is calculated” disclosure.

## Risk Matrix

Probability and impact are entered by an authorized risk owner using explained 1–3 scales:

- Probability: 1 unlikely (`<30%`), 2 possible (`30–69%`), 3 likely (`>=70%`).
- Impact: 1 low (local/recoverable), 2 medium (milestone or cross-team impact), 3 high (Objective, deadline, compliance, or material business impact).

`riskScore = probability × impact`:

- 1–2: low
- 3–4: medium
- 6: high
- 9: critical

The matrix places a risk at its probability/impact coordinates. The vertical label `发生概率` uses readable top-to-bottom writing rather than a rotated upside-down string. Each risk card or detail disclosure explains its probability, impact, score, selected evidence/reason, owner, mitigation, and last review date.

## Daily Report Create and Edit

The create form preserves the approved order:

1. Daily Objective and manually entered Objective completion.
2. One or more daily KRs.
3. For each KR: measurement type, required measurement fields, manually calculated completion, hours, work note, and optional linked existing KR.
4. Evidence links and file attachments, each with independent classification.
5. Submit.

The system never infers or overwrites O/KR completion percentages.

“编辑我的日报” loads the selected report's current revision into the same structured form. Only the author can edit. A Project Leader may review, comment, confirm, or return a member report but cannot edit the member's words or files. Confirmed reports are read-only until returned or reopened by an authorized workflow action.

Every successful edit runs in a PostgreSQL transaction, writes a new immutable revision snapshot, increments `current_revision`, and updates the current projection. The UI shows revision number and last-updated time. Failed validation or upload does not create a partial revision.

## Real Attachments and Links

### Accepted files

- PDF
- DOC and DOCX
- XLS and XLSX
- CSV
- PNG and JPEG
- TXT

Maximum size is 10 MB per file. The client provides early validation, but Storage/bucket rules and server-side/database checks are authoritative.

### Upload flow

1. User selects one or more files with a native file picker.
2. The UI validates type and size and lets the user set classification per file.
3. The app creates a pending attachment record after verifying report ownership.
4. The client uploads to the private bucket path `organization/{organization_id}/reports/{report_id}/{attachment_id}/{sanitized_name}`.
5. Progress, retry, cancellation, and error state are shown per file.
6. On success, metadata is finalized with size, MIME type, and checksum.
7. Downloads use short-lived signed URLs generated only after RLS authorization.

Replacement uploads a new object first, then atomically swaps metadata and removes the old object after success. Removal soft-deletes metadata immediately and queues object deletion. Failed/pending uploads are cleaned by a scheduled job. PostgreSQL metadata never trusts a client-provided owner or Storage path.

Links are stored separately, require `https://`, have independent classification, and are validated before saving.

## UI and Accessibility Refinements

- Increase card padding, label-to-control spacing, section gaps, and mobile spacing throughout the daily-report form.
- Apply the same spacing system to Settings → Personal Preferences so its heading, description, controls, and notices do not touch card borders.
- File controls expose progress and errors through accessible status regions.
- Edit mode announces the loaded report and moves focus to the form heading.
- Chart explanations are keyboard reachable and do not rely on color alone.
- Risk matrix cells and risks remain keyboard navigable with textual coordinates and scores.

## Error Handling

- Authentication expiry returns the user to sign-in without exposing cached data from the previous identity.
- RLS denial produces a generic access-denied message without revealing resource names.
- Upload validation identifies the rejected file and reason.
- Network failures preserve form content and permit retry.
- Database/revision failures do not display success and do not discard the previous revision.
- Signed URL failures can be retried and never expose the underlying private object path.

## Migration and Demo Compatibility

The existing mock repository remains unchanged for local demonstrations. A typed repository factory chooses mock or Supabase implementations from `VITE_APP_MODE`. Production builds fail fast if Supabase mode lacks `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`.

Initial SQL seeds roles and optional non-sensitive demo records only. No confidential local mock text or uploaded file is migrated automatically.

## Testing Strategy

- Unit tests for status derivation, baseline validation, risk scoring, file validation, and row-to-domain mapping.
- Component tests for edit loading, revision/error states, upload progress/retry/removal, chart explanations, and spacing hooks.
- Repository tests with a mocked Supabase transport for success, failure, and identity switching.
- SQL policy tests for every role/relationship/classification combination, including HR field isolation and Administrator/Management separation.
- Storage policy tests for upload, signed download, replacement, and deletion.
- Integration tests for create → upload → submit → edit → revision → download.
- Existing 184 frontend tests must remain green.

## Deployment and Operations

The Supabase Free plan is suitable for development and demonstration. The project uses private Storage and database migrations committed under `supabase/migrations/`. Secrets are configured through local/hosting environment variables and never committed.

Operational documentation will cover project creation, migration application, bucket configuration, authentication settings, local development, deployment variables, backup/retention expectations, and upgrading the Supabase plan without changing application object paths.

## Out of Scope

- AI evaluation or rewriting of Objectives and KRs.
- AI-generated progress values.
- Enterprise SSO, SCIM, or multi-factor policy administration.
- Antivirus/content-disarm services; the first release uses allowlisted MIME types and size checks only.
- Mobile native applications.
- Cross-organization tenancy beyond the schema and path isolation required for this first organization.

## Acceptance Criteria

- A real authenticated Employee or Project Leader can create and edit their own structured daily report.
- Every create/edit preserves manually entered completion values and writes a revision.
- A permitted user can upload, download, replace, and remove an allowed file from private Storage.
- Unauthorized users cannot discover file names, metadata, object paths, counts, or signed URLs.
- Status, planned progress, Gantt baselines, and risk placement all show their calculation/explanation.
- The risk probability label is readable and correctly oriented.
- Daily-report and Personal Preferences cards have consistent internal spacing at desktop and mobile widths.
- RLS enforces the approved management, reporting-line, project-peer, collaborator, HR, and Administrator boundaries.
- The application remains usable in explicit local demo mode without Supabase credentials.
- No AI assistant behavior is introduced.
