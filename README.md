# Northstar OKR

Northstar OKR is a Chinese-first enterprise OKR management frontend prototype. It demonstrates role-aware dashboards, protected navigation, structured daily reporting, project visualizations, and confidentiality-aware UI boundaries using local mock data.

## Highlights

- Five roles: Administrator, Management, Project Leader, Employee, and HR
- Eight application areas: Dashboard, OKR Management, Projects, Daily Report, Weekly Report, Team, Analytics, and Settings
- Modular dashboards tailored to each role
- Five project views: alignment tree, Gantt chart, progress trend, risk matrix, and workload
- Structured daily Objective and Key Result entry with manually entered progress, work hours, measurement types, linked OKRs, and evidence metadata
- Project Leader self-reporting plus member report review, confirmation, return, and comments
- Permission-aware rendering for OKRs, reports, evidence, milestones, risks, tasks, and system metadata
- Responsive navigation, keyboard interactions, focus management, and accessible status/error feedback

## Technology

- React 19
- TypeScript
- Vite
- React Router
- Recharts
- Vitest and Testing Library

## Run Locally

Requirements: Node.js 20 or later and npm.

```bash
git clone https://github.com/StarinaClytie/OKR-management-ongoing.git
cd OKR-management-ongoing
npm install
npm run dev
```

Open the local URL printed by Vite.

## Quality Checks

```bash
npm run test:run
npm run typecheck
npm run build
```

The production bundle is written to `dist/`.

## Explore the Demo

Use the role switcher in the top bar to move between the five simulated identities. Each role receives a different dashboard composition and permission scope. Protected routes display an access-denied state when the active user lacks the required capability.

Project Leaders can write their own daily reports and review member reports without modifying the member's original content. HR views authorized workload fields only; report bodies and evidence remain outside the HR view. The five project visualizations can be switched with the mouse or keyboard.

## Permission Model

The frontend models both role capabilities and resource-level relationships. It distinguishes summary access from detailed access and treats OKRs, report bodies, evidence, attachments, milestones, risks, project tasks, and audit metadata as separate permission resources.

The prototype also models classification levels and filters unauthorized data before mapping, aggregation, or DOM rendering. Administrator and Management are intentionally different roles: administrators manage system configuration and access metadata but do not automatically receive confidential business content.

## Project Structure

```text
src/
  app/          Application shell and routes
  auth/         Permission evaluation and route protection
  components/   Shared UI and security components
  dashboard/    Role-specific widgets and visualizations
  domain/       Types, permissions, and daily-report conversion
  layout/       Sidebar, role switcher, and responsive shell
  mocks/        Local demonstration data
  pages/        Route-level page frameworks and daily report UI
  styles/       Design tokens and global responsive styles
```

## Prototype Boundaries

This repository is a frontend foundation, not a production authorization system. It currently has no backend, real identity provider, database, persistent file upload, encryption service, production export pipeline, or AI-based OKR evaluation. Submitted demo state is stored in browser memory and resets on refresh.

Client-side menu hiding and route guards improve the demonstration experience, but a production system must repeat every authorization and classification check on the server. Never treat frontend checks as a security boundary.

## Deployment

Build the static application with:

```bash
npm ci
npm run build
```

Serve the generated `dist/` directory from a static host or web server. Configure history fallback to `index.html` so React Router URLs work when opened directly.

## Roadmap

- Backend API, database, and persistent audit trail
- Enterprise authentication and server-enforced authorization
- Real attachment upload and secure object storage
- Configurable progress baselines and risk-scoring explanations
- Editable submitted reports with version history
- AI-assisted Objective and Key Result writing feedback

## License

No open-source license has been added yet. All rights are reserved unless a license is added in a future release.
