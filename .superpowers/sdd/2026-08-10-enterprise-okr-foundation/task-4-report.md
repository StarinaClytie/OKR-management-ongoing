# Task 4 Report: Protected Routing, Light Sidebar, and Role Switcher

## Status

Implemented the protected eight-route application shell, one shared navigation/route metadata source, a light Chinese sidebar, a responsive mobile drawer, and a mock role switcher.

## Files

- Created `src/navigation/navigation.ts` as the single route and sidebar metadata source.
- Created `src/layout/AppShell.tsx`, `src/layout/Sidebar.tsx`, and `src/layout/RoleSwitcher.tsx`.
- Created `src/app/routes.tsx`, `src/pages/AccessDeniedPage.tsx`, and `src/pages/NotFoundPage.tsx`.
- Added navigation and direct-route guard coverage in `src/layout/Sidebar.test.tsx` and `src/app/routes.test.tsx`.
- Updated `src/app/App.tsx` and `src/styles/global.css` to install the shell.

## RED / GREEN

- RED: `npm run test:run -- src/layout/Sidebar.test.tsx src/app/routes.test.tsx` failed as expected: the role selector and protected settings route were absent.
- GREEN: the same focused command passed after implementation (2 tests across 2 files).

## Verification

- `npm run test:run` — 6 files and 39 tests passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `git diff --check` — passed; untracked navigation source was also checked with `git diff --no-index --check`.

## Self-review

- Sidebar rendering and route protection both iterate over `navigationItems`; no separate menu permission map was added.
- Sidebar visibility delegates to `PermissionGate`; direct route enforcement delegates to `ProtectedRoute`.
- Access-denied and placeholder pages contain no business record data, so confidential content cannot leak through the routing scaffold.
- The role selector updates the existing mock AuthContext only; it is explicitly not real authentication.

## Concerns

The current permission model requires typed resource context. The seven business route frameworks intentionally use the existing dashboard system capability because they expose no business data yet; settings uses `permission.manage`. Later page work must keep record-level views and actions behind their own typed resource checks rather than treating this shell-level admission as data access authorization.

## Commit

`feat: add protected application navigation`
