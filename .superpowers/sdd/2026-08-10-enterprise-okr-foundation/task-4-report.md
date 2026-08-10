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

## Fix Round 1

### Changes

- Replaced the fixed quarter text with an accessible `选择季度` control containing all four quarter options and local mock selection state.
- Split desktop navigation from the mobile drawer. The closed mobile drawer now has both `aria-hidden="true"` and `inert`, while the desktop sidebar remains accessible.
- Derived the sidebar brand href from the first `navigationItems` entry rather than a literal path.
- Updated the app identity test to query the accessible brand link, avoiding an implementation-detail assertion against the inert mobile drawer's duplicate visual markup.

### RED / GREEN evidence

- RED: `npm run test:run -- src/layout/AppShell.test.tsx` failed because the quarter selector and rendered mobile drawer accessibility state were absent.
- GREEN: `npm run test:run -- src/layout/AppShell.test.tsx src/layout/Sidebar.test.tsx src/app/routes.test.tsx src/app/App.test.tsx` passed (5 tests across 4 files).
- Full verification: `npm run test:run` passed (7 files, 41 tests); `npm run typecheck`, `npm run build`, and `git diff --check` also passed.

### Fix-round concern

The quarter selector is deliberately local, non-persistent demo state. Future dashboard filtering should consume a shared period state only when the product requirements call for cross-page persistence.
