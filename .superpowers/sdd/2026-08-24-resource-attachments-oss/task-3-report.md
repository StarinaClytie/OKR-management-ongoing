# Task 3 Report: Browser Resource OSS Transport and Repository Integration

Status: complete

Commit: `1f3d4d3 feat: route resource attachments through OSS`

Implemented a parameterized browser OSS transport. Daily attachments retain
`/api/attachments`; resource attachments use `/api/resource-attachments` for
upload signing/finalization, download signing, and deletion. Resource metadata
is still created first through `begin_resource_attachment_upload`, while byte
transfer and finalization occur through the Node attachment API rather than
Supabase Storage.

Verification:

- Red: `npm test -- --run src/services/ossAttachmentTransport.test.ts src/data/supabaseRepository.test.ts` failed for the new resource route and repository-storage regression tests before implementation.
- Green: `npm test -- --run src/services/ossAttachmentTransport.test.ts src/data/supabaseRepository.test.ts` — 68 passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

Self-review: resource upload/download paths use only the resource transport
and attachment ID; `rg -n "client\\.storage|storage\\.from" src/data/supabaseRepository.ts`
returns no direct Storage transfers. Existing daily transport tests remain
green, covering the unchanged default route behavior.

Concerns: no resource upload progress callback was added because the public
repository signature is preserved; Task 4 can add that optional callback when
its UI states require it.

## Fix round 1: cleanup and metadata contract

The repository now invokes `resourceAttachmentTransport.remove(id)` after any
resource transport upload failure. A successful cleanup returns the original
upload/finalization error category; a failed cleanup returns that cleanup error
category instead. `ResourceUploadTarget` now matches the database result
exactly: `{ id, path }`.

Coverage added:

- `removes the resource attachment after its OSS PUT fails`
- `removes the resource attachment after OSS finalization fails`
- `allocates a clean attachment ID when retrying after an OSS upload failure`
- `returns the resource cleanup error when cleanup cannot remove a failed upload`

Commands and output:

- Red: `npm test -- --run src/data/supabaseRepository.test.ts` → `Test Files 1 failed (1)`, `Tests 4 failed | 64 passed (68)`; each failure showed that `remove` had zero calls (and the cleanup-failure case returned `storage` instead of `network`).
- Green: `npm test -- --run src/services/ossAttachmentTransport.test.ts src/data/supabaseRepository.test.ts` → `Test Files 2 passed (2)`, `Tests 72 passed (72)`.
- `npm run typecheck` → `tsc -b --pretty false` exited 0.
- `git diff --check` exited 0.
