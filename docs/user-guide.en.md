# Northstar OKR User Guide (English)

Northstar OKR records Objectives, Key Results (KRs), actual progress, planned progress, and confirmed risk events. The interface defaults to Chinese on the first visit. Use the control in the top bar to switch instantly between 中文 and English without changing the URL. Interface text is translated; business content that users enter—Objectives, KRs, reports, reasons, and mitigations—stays in its original language.

## 1. Sign-in and visible scope

After sign-in, the application uses your organization, role, project relationship, and classification to decide what to show. Do not try to infer a restricted project by guessing URLs or sharing them: restricted projects do not appear in the employee or HR project list, and no name, count, classification, description, placeholder, or ARIA metadata is exposed. A direct link to an unauthorized resource shows only a generic access-denied page.

- An employee can view authorized projects and owned OKRs, update actual progress only for an owned KR, and create, edit, or resolve risk events for an owned KR or Objective.
- A Project Leader can manage project-wide risk events in projects they lead and maintain planned progress and milestones. A Project Leader cannot impersonate an employee or alter that employee's actual KR progress.
- HR has no general risk-management permission and cannot learn metadata about a restricted project from the project list.

## 2. Update My KR: real, traceable actual progress

Open **OKR Management** and select **Update My KR**. Choose a KR that you own, enter an actual completion percentage from **0–100**, an effective date, and an update note, then save.

- This is a normal save, not a simulated preview. In production with `VITE_APP_MODE=supabase`, it calls a restricted backend RPC.
- Each successful save appends an immutable KR progress record with its date and note. Earlier history is not overwritten.
- Only the KR owner can write actual progress. An invalid percentage, missing date or note, network issue, or authorization failure creates no record; correct the form and submit again.
- After a save, the page reloads data and recalculates execution status from planned progress, milestones, dates, and unresolved risks.

### Planned versus actual progress

Planned progress is the Project Leader's scheduling and forecasting baseline. Actual progress is the fact recorded by the KR owner. They are intentionally different values: their gap is an input to the execution-status calculation, but it never rewrites the employee's actual-progress history.

## 3. Add Risk: add an event, not an OKR to the matrix

From OKR Management, select **Add Risk / 新增风险**. Choose an owned KR or Objective, then describe a concrete risk event and enter probability, business impact, reason, mitigation, and review date. Saving plots that **risk event**, not the KR or Objective itself, in the matrix. You can see attached events near the OKR and edit or resolve an event when authorized.

Risks are reported by authorized people. The system and AI do not invent risk events automatically. A saved unresolved event participates in execution-status rules; once resolved, it no longer participates as an unresolved risk.

## 4. The 3×3 risk matrix: location, score, and all nine cells

The vertical axis is **probability** and the horizontal axis is **impact**. Choose each independently:

- probability 1: unlikely, below 30%; 2: possible, 30–69%; 3: likely, at least 70%.
- impact 1: local and recoverable; 2: affects a milestone or cross-team work; 3: affects an Objective, deadline, compliance, or a material business outcome.
- `riskScore = probability × impact`

All nine cells are shown below (rows are probability and columns are impact):

| probability \ impact | 1 | 2 | 3 |
| --- | ---: | ---: | ---: |
| 1 | 1 | 2 | 3 |
| 2 | 2 | 4 | 6 |
| 3 | 3 | 6 | 9 |

Event severity is: 1–2 low, 3–4 medium, 6 high, and 9 critical. For example, probability 1 and impact 3 is at `(impact 3, probability 1)`, so **1×3=3** and the event severity is medium.

## 5. Risk events and execution status: related, but different

An event's matrix severity is not the same thing as the execution status shown for a KR or Objective (on track, at risk, off track, or complete). A medium event with a score of 1–4 stays visible and actionable in the matrix, but does not by itself make the OKR at risk.

Execution status applies parallel rules and the **most severe** applicable outcome wins:

- Actual minus planned progress of at least -10 percentage points: no escalation from the progress gap.
- A gap from -25 through less than -10: at risk.
- A gap below -25: off track.
- An overdue incomplete milestone: at least at risk.
- A past-due incomplete KR: off track.
- An unresolved event with score 6: at least at risk; score 9: at least off track.

Accordingly, **1×3=3** is a medium event that needs attention but does not alone escalate execution status. An unresolved 2×3=6 event does escalate it to at least at risk. The status explanation in the application lists every applicable reason.

## 6. Switch between 中文 and English

Use **中文 / English** in the top bar to switch instantly; the page and URL stay in place. Chinese is the default on the first visit. Before sign-in the choice is stored locally. After your profile loads, its saved preference takes precedence and is safely written back. If preference persistence temporarily fails, the interface still switches immediately and you can select the language again later.

## 7. Daily reports, evidence, and attachments

Complete structured daily reports and evidence as requested by the page. Upload only material you are authorized to handle; attachments are protected by permission, file-type, and size restrictions. HR and unauthorized people should not see protected attachment names, counts, paths, or download links. If an upload fails, check type, size, and network, then use the retry or replacement action in the interface.

## 8. Help and troubleshooting

- **KR progress did not save:** confirm that you own the KR, the percentage is 0–100, and date and note are present. The form retains its values after an error, so correct it and retry.
- **Cannot add or edit a risk:** choose an owned KR or Objective. A Project Leader can manage risks only in projects they lead.
- **A project is not visible:** this is normally an authorization boundary, not an application error. Restricted projects deliberately leave no project-list metadata. Ask a project administrator for membership or authorization; do not share screenshots or guess project names.
- **The matrix and status look inconsistent:** separate event severity from execution status. Read the status explanation for plan gap, milestones, due dates, and unresolved risks.
- **Preparing a migration or deployment:** use the [Supabase and Aliyun deployment guide](supabase-setup.md). Database migrations and production deployment need explicit approval, backups, and local verification. Never put a service-role key, database password, or user token in frontend variables or logs.
