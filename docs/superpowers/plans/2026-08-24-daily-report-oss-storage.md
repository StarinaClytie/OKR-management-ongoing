# Daily Report OSS Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store all new daily-report attachment bytes in private Alibaba Cloud OSS while preserving PostgreSQL authorization, upload sessions, report locks, revisions, adoption, cleanup, review, and UI progress.

**Architecture:** A localhost-only Node service authenticates Supabase bearer tokens, delegates user authorization to SECURITY DEFINER RPCs, and signs exact OSS object operations. Browsers upload bytes directly to OSS; service-role-only RPCs record verified physical-object facts after OSS HEAD/delete succeeds. Resource attachments remain on Supabase Storage.

**Tech Stack:** React/Vite/TypeScript, Supabase JS/Auth/RPC, PostgreSQL/pgTAP, Node.js, Express, `ali-oss`, Vitest/Supertest, Nginx/systemd documentation.

## Global Constraints

- Only daily-report attachments move to OSS; `resource-documents` remains unchanged.
- No historical attachment migration or legacy compatibility is required because current report attachments are test data.
- No OSS AccessKey or service-role credential may use a `VITE_` prefix, enter a client bundle, appear in logs, or be committed.
- OSS bucket `timetech-okr-files` remains private in region `oss-cn-shanghai`.
- Browser-to-OSS upload uses an exact-object signed PUT URL with a five-minute TTL; downloads use approximately 60 seconds.
- Daily-report attachment maximum is exactly `100 * 1024 * 1024` bytes; existing MIME/extension validation remains.
- Do not edit historical migrations; add one new migration.
- Do not deploy, push, or execute production migrations.

---

### Task 1: OSS Database Trust Boundary and Lifecycle

**Files:**
- Create: `supabase/migrations/202608240003_daily_report_oss_storage.sql`
- Create: `supabase/tests/daily_report_oss_storage.test.sql`
- Modify: `supabase/tests/storage.test.sql`
- Modify: `supabase/tests/daily_upload_lifecycle.test.sql`

**Interfaces:**
- Produces user-context RPCs `authorize_attachment_object_upload(uuid)`, `authorize_attachment_object_download(uuid)`, and `request_attachment_object_deletion(uuid)` returning database-owned attachment metadata.
- Produces service-only RPCs `confirm_attachment_object_upload(uuid,text,text,bigint)` and `confirm_attachment_object_deletion(uuid)`.
- Redefines effective begin/finalize/download/delete/abandon behavior without `storage.objects` for report attachments.

- [ ] **Step 1: Add failing pgTAP assertions**

Cover: new columns, 100 MB boundary, user upload authorization, cross-user denial, server-only confirmation grants, byte/MIME confirmation, retryable deletion, abandonment waiting for `object_deleted_at`, revision/adoption visibility, and unchanged `resource-documents` Storage behavior.

- [ ] **Step 2: Verify the SQL tests fail**

Run: `supabase db reset && supabase test db`

Expected: new OSS assertions fail because columns/RPCs do not exist.

- [ ] **Step 3: Add the migration**

Add nullable `object_verified_at` and `object_deleted_at`. Redefine begin RPC size checks to allow `104857600`. User authorization RPCs must derive organization, uploader, session, report editability, classification and `storage_path` from locked database rows. Service-only confirmation RPCs verify expected path-independent metadata arguments against the row, transition `pending -> uploaded`, or record physical deletion. Revoke service confirmation RPCs from `public`, `anon`, and `authenticated`; grant only to `service_role`.

Redefine cleanup so `deleted` unassociated metadata prevents session abandonment until `object_deleted_at` is populated. Remove report-attachment `storage.objects` checks without changing resource bucket policies or functions.

- [ ] **Step 4: Run SQL tests and lint**

Run: `supabase db reset && supabase test db && supabase db lint --local --level warning`

Expected: all pgTAP tests pass; no new lint error.

- [ ] **Step 5: Record the uncommitted checkpoint**

Run `git diff --check` and record the focused SQL test result. Do not commit because the user requires approval after implementation.

### Task 2: Server Configuration, Authentication, and OSS Adapter

**Files:**
- Create: `server/config.ts`
- Create: `server/auth.ts`
- Create: `server/oss.ts`
- Create: `server/types.ts`
- Create: `server/config.test.ts`
- Create: `server/auth.test.ts`
- Create: `server/oss.test.ts`
- Create: `tsconfig.server.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces `loadServerConfig(env)` that requires all eight server-only variables.
- Produces `authenticateBearer(header)` and caller-context Supabase RPC clients.
- Produces an injectable `OssObjectStore` with `signPut`, `head`, `signGet`, and `delete` methods.

- [ ] **Step 1: Write failing configuration/auth/OSS adapter tests**

Assert missing configuration fails without echoing values; missing/malformed/invalid bearer tokens return authentication failures; signing receives only a database-derived key; HEAD normalizes length/type; delete errors propagate.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- --run server/config.test.ts server/auth.test.ts server/oss.test.ts`

- [ ] **Step 3: Install server dependencies and implement focused modules**

Add runtime dependencies `express`, `ali-oss`, and `dotenv`; add development dependencies `@types/express`, `@types/node`, `supertest`, `@types/supertest`, and `tsx`. Add scripts `server:dev`, `server:build`, `server:start`, and `server:test`. Keep config parsing separate from process startup so missing-env behavior is testable.

- [ ] **Step 4: Run focused tests and server typecheck**

Run: `npm test -- --run server/config.test.ts server/auth.test.ts server/oss.test.ts && npm run server:build`

- [ ] **Step 5: Record the uncommitted checkpoint**

Run `git diff --check` and record the server foundation test result. Do not commit.

### Task 3: Same-Origin Attachment API

**Files:**
- Create: `server/attachments.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`
- Create: `server/attachments.test.ts`

**Interfaces:**
- Produces `GET /api/health`.
- Produces authenticated upload-url, finalize, download-url and delete endpoints.
- Consumes Task 1 RPCs and Task 2 authentication/OSS adapters.

- [ ] **Step 1: Write failing endpoint tests**

Using injected fake auth, RPC, OSS and service-confirmation clients, assert: missing/invalid bearer is 401; database denial is 403; request bodies cannot select a path; upload signing uses the authorized key/MIME; finalize reauthorizes and rejects HEAD size/type mismatch; download signs authorized keys only; delete confirms only after OSS success; OSS deletion failure remains unconfirmed; health is credential-free and contains no secrets.

- [ ] **Step 2: Verify endpoint tests fail**

Run: `npm test -- --run server/attachments.test.ts`

- [ ] **Step 3: Implement the API**

Use Express JSON limits suitable only for metadata. Do not enable broad CORS. Map authentication errors to 401, database authorization to 403, validation mismatch to 422, and external failures to 502. Never accept or return credentials.

- [ ] **Step 4: Run server tests and build**

Run: `npm test -- --run server/*.test.ts && npm run server:build`

- [ ] **Step 5: Record the uncommitted checkpoint**

Run `git diff --check` and record the endpoint test result. Do not commit.

### Task 4: Shared Browser OSS Transport and 100 MB Validation

**Files:**
- Create: `src/services/ossAttachmentTransport.ts`
- Create: `src/services/ossAttachmentTransport.test.ts`
- Modify: `src/services/attachmentService.ts`
- Modify: `src/services/attachmentService.test.ts`
- Modify: `src/data/types.ts`

**Interfaces:**
- Produces `uploadDailyAttachment({attachmentId,file,signal,onProgress})`, `getDailyAttachmentDownloadUrl(id)`, and `deleteDailyAttachment(id)` against same-origin `/api/attachments`.
- Updates `StorageTransport` so daily attachment operations use attachment IDs rather than caller-selected paths.

- [ ] **Step 1: Write failing transport and boundary tests**

Assert exactly 100 MB is accepted and 100 MB plus one byte returns `文件不能超过 100 MB`. Assert bearer-authenticated signing/finalize requests, direct XHR PUT progress, abort/network/finalize failure, signed download response, delete request, and no Supabase Storage call.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- --run src/services/attachmentService.test.ts src/services/ossAttachmentTransport.test.ts`

- [ ] **Step 3: Implement the shared transport**

Read the current access token through an injected provider, call only same-origin API paths, and PUT directly to the returned signed OSS URL. Reserve UI 100% for successful finalize. Do not send an object key to the API.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/services/attachmentService.test.ts src/services/ossAttachmentTransport.test.ts`

- [ ] **Step 5: Record the uncommitted checkpoint**

Run `git diff --check` and record the transport test result. Do not commit.

### Task 5: Repository Integration and Failure Cleanup

**Files:**
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/repositoryFactory.ts`
- Modify: `src/data/repositoryFactory.test.ts`
- Delete: `src/services/supabaseStorageUpload.ts`
- Delete: `src/services/supabaseStorageUpload.test.ts`

**Interfaces:**
- Both session upload and legacy `uploadAll` consume the Task 4 OSS transport.
- Resource upload/download continues to use `client.storage.from('resource-documents')`.

- [ ] **Step 1: Write failing repository tests**

Assert entry-level/report-level uploads use the shared OSS transport; progress/finalize/retry behavior remains; multi-file failure cleans prior and current metadata in reverse order; deletion routes through Node; download routes through Node; resource uploads still use Supabase Storage.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- --run src/data/supabaseRepository.test.ts src/data/repositoryFactory.test.ts`

- [ ] **Step 3: Replace only report-attachment Storage coupling**

Remove `report-attachments` upload/remove/createSignedUrl calls from repository and attachment service. Retain the Supabase client Storage interface for resource code. Keep adoption, revisions, display names, classification and report update sequencing intact.

- [ ] **Step 4: Run repository and page tests**

Run: `npm test -- --run src/data/supabaseRepository.test.ts src/pages/DailyReportsPage.test.tsx src/pages/daily-report/*.test.tsx`

- [ ] **Step 5: Record the uncommitted checkpoint**

Run `git diff --check` and record repository/page test results. Do not commit.

### Task 6: Production Documentation and Secret Audit

**Files:**
- Modify: `docs/alibaba-rds-supabase-init.md`
- Create: `docs/alibaba-oss-daily-attachments.md`
- Modify: `scripts/build-production.mjs`
- Add tests only if production config validation behavior changes.

**Interfaces:**
- Documents `/etc/timetech-okr/attachments.env`, systemd service, Nginx proxy, OSS CORS, migration and restart order.

- [ ] **Step 1: Add deployment documentation**

Document `chmod 600 /etc/timetech-okr/attachments.env` and these exact server-only names: `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_BUCKET`, `OSS_REGION`, `OSS_ENDPOINT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Include a localhost-bound systemd unit, `/api/` Nginx block, health request, frontend/server build commands, schema migration order, rollback considerations, and no automatic live edits.

- [ ] **Step 2: Document manual OSS CORS**

Allow only `https://okr.trspectra.com`; methods PUT/GET/HEAD; headers actually signed including Content-Type; expose ETag only if used; never use wildcard origin.

- [ ] **Step 3: Audit tracked content without printing values**

Run searches for tracked `OSS_ACCESS_KEY_ID=`, `OSS_ACCESS_KEY_SECRET=`, and `SUPABASE_SERVICE_ROLE_KEY=` assignments and verify `.env.production.local` and server env files remain ignored. Inspect production bundles for OSS/service-role identifiers and secret values without printing values.

- [ ] **Step 4: Record the uncommitted checkpoint**

Run `git diff --check` and verify documentation contains no credential values. Do not commit.

### Task 7: Full Verification and Handoff

**Files:**
- Modify only files required by failures proven during this task.

**Interfaces:**
- Produces test/build/security evidence and a deployment checklist; does not deploy or push.

- [ ] **Step 1: Run frontend and server verification**

Run: `npm test -- --run && npm run typecheck && npm run server:build && npm run build`

- [ ] **Step 2: Run database verification**

Run: `supabase db reset && supabase test db && supabase db lint --local --level warning`

- [ ] **Step 3: Verify exact storage boundaries**

Confirm no report-attachment frontend path calls Supabase Storage, resource documents still do, API accepts no object path, the service binds localhost, and bundles contain no server credential.

- [ ] **Step 4: Prepare handoff without committing or pushing further**

Report git diff summary, changed files, architecture, test results, server variables, database/server/frontend deployment order, manual OSS CORS, cleanup of existing test attachments, and remaining operational risks. Leave all implementation changes uncommitted and wait for explicit approval before commit, push, or deployment.
