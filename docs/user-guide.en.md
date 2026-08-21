# TIME-TECH SPECTRA OKR User Guide (English)

TIME-TECH SPECTRA OKR manages company Objectives, Key Results (KRs), daily reports, actual progress, and recorded work hours. The interface defaults to Chinese on the first visit. Use the control in the top bar to switch instantly between 中文 and English without changing the URL. Interface text is translated; business content entered by users—such as Objectives, KRs, and daily reports—stays in its original language.

## 1. Sign-in and visible scope

After sign-in, the application uses your organization, role, project relationship, and classification to decide what to show. Do not try to infer a restricted project by guessing URLs or sharing them: restricted projects do not appear in the employee or HR project list, and no name, count, classification, description, placeholder, or ARIA metadata is exposed. A direct link to an unauthorized resource shows only a generic access-denied page.

- An employee can view authorized projects and owned OKRs, update actual progress only for an owned KR, and create, edit, or resolve risk events for an owned KR or Objective.
- A Project Leader can manage project-wide risk events in projects they lead and maintain planned progress and milestones. A Project Leader cannot impersonate an employee or alter that employee's actual KR progress.
- HR has no general risk-management permission and cannot learn metadata about a restricted project from the project list.

## 2. Update My KR: real, traceable actual progress

Open **OKR Management** and select **Update My KR**. Choose a KR that you own, enter an actual completion percentage from **0–100**, an effective date, and an update note, then save.

- This is a normal save, not a simulated preview, but it calls the restricted backend RPC and writes to Supabase only in a correctly configured production build with `VITE_APP_MODE=supabase`, a valid Supabase URL, and a public publishable/anon key. Demo mode is a non-persistent local preview and is not evidence of real saving.
- Each successful save appends an immutable KR progress record with its date and note. Earlier history is not overwritten.
- Only the KR owner can write actual progress. An invalid percentage, missing date or note, network issue, or authorization failure creates no record; correct the form and submit again.
- After a save, the page reloads data and recalculates execution status from planned progress, milestones, dates, and unresolved risks.

### Planned versus actual progress

Planned progress is the Project Leader's scheduling and forecasting baseline. Actual progress is the fact recorded by the KR owner. They are intentionally different values: their gap is an input to the execution-status calculation, but it never rewrites the employee's actual-progress history.

## 3. Daily OKR reports

Each employee has one Daily Report per day. Every Daily OKR Entry records today’s objective, related Objective, related KR, work description, result/data, entry attachments, and hours. Saving again on the same day updates the report and retains a revision instead of creating a duplicate.

## 4. Objective and KR collaboration

Management creates quarterly Objectives and assigns a Project Leader. The Project Leader cannot edit the Objective and can only create KRs beneath an assigned Objective. A KR owner can be any approved, active employee in the organization; assignment automatically adds that employee to the project team.

## 5. Roles and data visibility

Administrators maintain users and roles only. Management sees company Objectives, KR progress, Project Leaders, project progress, and employee recorded hours. Employees see Objectives they contribute to, their assigned KRs, progress, and daily reports.

## 6. Switch between 中文 and English

Use **中文 / English** in the top bar to switch instantly; the page and URL stay in place. Chinese is the default on the first visit. Before sign-in the choice is stored locally. After your profile loads, its saved preference takes precedence and is safely written back. If preference persistence temporarily fails, the interface still switches immediately and you can select the language again later.

## 7. Daily reports, evidence, and attachments

Complete structured daily reports and evidence as requested by the page. Upload only material you are authorized to handle; attachments are protected by permission, file-type, and size restrictions. HR and unauthorized people should not see protected attachment names, counts, paths, or download links. If an upload fails, check type, size, and network, then use the retry or replacement action in the interface.

## 8. Help and troubleshooting

- **KR progress did not save:** confirm that you own the KR, the percentage is 0–100, and date and note are present. The form retains its values after an error, so correct it and retry.
- **A project is not visible:** this is normally an authorization boundary, not an application error. Restricted projects deliberately leave no project-list metadata. Ask a project administrator for membership or authorization; do not share screenshots or guess project names.
- **Preparing a migration or deployment:** use the [Supabase and Aliyun deployment guide](supabase-setup.md). Database migrations and production deployment need explicit approval, backups, and local verification. Never put a service-role key, database password, or user token in frontend variables or logs.
