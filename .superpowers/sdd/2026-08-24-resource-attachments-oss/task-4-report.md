# Task 4 Report: Resource Upload Progress UI

Status: complete

Implemented resource-attachment upload lifecycle UI for both new-resource
creation and the existing resource detail upload dialog. The UI now presents
selected, uploading, server-verifying, uploaded, and failed states with the
existing accessible attachment progress-bar styles. The detail dialog keeps a
failed upload retryable and prevents duplicate submits while active.

The optional repository callback now emits `uploading`, `verifying`,
`uploaded`, and `failed` updates. OSS PUT progress is capped below 100 by the
transport; the repository emits verification at 99 and completion at 100 only
after server finalization succeeds.

Verification:

- Red: `npm test -- --run src/pages/ResourceDetailPage.test.tsx src/pages/ResourcesPage.test.tsx` failed as expected because resource uploads passed no UI progress callback.
- Focused UI green: `npm test -- --run src/pages/ResourceDetailPage.test.tsx src/pages/ResourcesPage.test.tsx` — 43 passed.
- Transport and repository regression: `npm test -- --run src/services/ossAttachmentTransport.test.ts src/data/supabaseRepository.test.ts` — 72 passed.
- Full suite: `npm test -- --run` — 67 files and 578 tests passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

Self-review:

- Verified the callback sequence is `uploading` (including true PUT progress),
  `verifying` at 99, then `uploaded` at 100 only after finalization.
- Verified the create flow creates the resource once, while the existing-detail
  upload retries the attachment only after a failure.
- Reused the existing daily attachment progress styles and localized status
  labels; active uploads disable the submit, cancel, and file-selection
  controls without leaving them disabled after an error.

Concerns: resource-create attachment failures still retain the established
partial-success behavior: the resource is created and the user is directed to
retry its attachment from the resource detail page, preventing duplicate
resource creation.

## Fix round 1: preserve focus and lock active create forms

Separated mount-only autofocus from the Escape-key listener so progress-driven
rerenders and inline parent callbacks cannot move focus back to the resource
name. Every mutable resource-form field is disabled while `submitting` is
active; fields and retry controls return to their normal state once the upload
fails.

Verification:

- Red: `npm test -- --run src/components/ResourceFormModal.test.tsx` — 1 failed, reproducing focus being moved from `Keep focus` to the resource-name input after a progress rerender.
- Focused green: `npm test -- --run src/components/ResourceFormModal.test.tsx src/pages/ResourcesPage.test.tsx src/pages/ResourceDetailPage.test.tsx` — 47 passed.
- Full suite: `npm test -- --run` — 67 files and 579 tests passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
