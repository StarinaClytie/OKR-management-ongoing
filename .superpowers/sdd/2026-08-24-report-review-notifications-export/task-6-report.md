# Task 6 Report: Account Notification Center

## Status

Complete. The account menu now exposes an accessible unread count and compact-safe red dot, opens a notification dialog, and supports marking one or all notifications read.

## Implementation

- Added `useNotifications()` with login refresh, explicit refresh, read mutations, newest-first ordering, stale-request protection, immediate account-scoped state isolation, and no polling.
- Added a portal-rendered notification dialog with focus entry/trapping, Escape and scrim dismissal, read-one/read-all controls, localized repository errors, and accessible notification labels.
- Added the account-menu notification entry and unread red dot. Opening the account menu and opening the panel each refresh once.
- Report notifications are marked first, then routed to `/reports?tab=daily`; an AppShell-owned single-item registry queues delayed opens and `ReportsPage` registers the Task 5 `DailyReportsPageHandle`.
- Resource-owner notifications are marked first, then navigate through the existing `/resources/:resourceId` route. No sidebar route was added.
- Successful daily-report comments and confirmations refresh notifications; failures do not.
- Account changes clear notification data and any queued report open, and stale async responses cannot repopulate the new account.

## TDD Evidence

- `useNotifications`: RED on missing hook; GREEN 5 tests.
- `NotificationCenter`: RED on missing component; GREEN 7 tests, including mutation errors and inaccessible report behavior.
- `AccountMenu`: RED on missing context/red dot/panel; GREEN 7 tests.
- AppShell report registry: RED with missing registry; GREEN 4 registry tests inside the 14-test AppShell file.
- ReportsPage bridge: RED because a queued report was not consumed; GREEN 1 test.
- Comment/confirmation refresh: RED because success callbacks were not invoked; GREEN 5 dialog tests.
- Portal placement: RED because the dialog was nested beneath the transformed sidebar; GREEN after rendering into `document.body`.

## Verification

- Required focused/accessibility command: 4 files, 23 tests passed.
- Cross-page integration command: 5 files, 42 tests passed.
- Full frontend suite: 64 files, 544 tests passed with no unhandled errors.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

An older production-data test used an incomplete repository fixture; the full run exposed unhandled notification-method calls. The fixture now mirrors the Task 4 notification contract, and its 8 tests plus the full suite pass cleanly.

## Self-review

- Verified mark-before-open ordering for report and resource actions.
- Verified delayed registration consumes one queued report only, unregister removes stale callbacks, latest queued ID wins, and account clearing drops queued work.
- Verified inaccessible report attempts remain read and surface an error.
- Verified no timer-based polling and no new route/sidebar entry.
- Verified dialog naming, modal semantics, focus entry/trapping, compact red-dot visibility, and accessible unread count.

## Commit

`feat: add account notification center`

## Concerns

None outstanding.
