# Resource Attachments on Alibaba OSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every newly uploaded resource attachment in the existing private Alibaba OSS bucket while PostgreSQL retains authorization and lifecycle metadata.

**Architecture:** Extend the existing same-origin Node attachment API with resource-specific routes backed by new PostgreSQL authorization and service-role confirmation RPCs. The browser uploads directly to a database-issued OSS path, the Node service verifies OSS HEAD metadata, and the repository never transfers resource files through Supabase Storage.

**Tech Stack:** React, TypeScript, Supabase Auth/RPC/PostgreSQL, Express, `ali-oss`, XMLHttpRequest, Vitest, Supertest, pgTAP, Nginx, systemd.

## Global Constraints

- Existing resource attachments are disposable test data; do not migrate or support legacy Supabase Storage objects.
- Use the private bucket `timetech-okr-files` with `organization/{organizationId}/resources/...` paths generated only by PostgreSQL.
- Maximum resource attachment size is 100 MB.
- No OSS or service-role secret may enter Git, logs, `VITE_` variables, or browser code.
- Reuse the existing attachment Node service and `/api/` Nginx proxy.
- Do not deploy or execute production migrations until the complete local verification suite passes and the user approves deployment.

---

### Task 1: Resource Attachment OSS Database Contract

**Files:**
- Create: `supabase/migrations/202608240004_resource_attachment_oss_storage.sql`
- Modify: `supabase/tests/resources.test.sql`
- Create: `supabase/tests/resource_attachment_oss_storage.test.sql`

**Interfaces:**
- Produces: `authorize_resource_attachment_object_upload(uuid)`, `confirm_resource_attachment_object_upload(uuid,text,text,bigint)`, `authorize_resource_attachment_object_download(uuid)`, `request_resource_attachment_object_deletion(uuid)`, and `confirm_resource_attachment_object_deletion(uuid)`.
- Produces: pending metadata from `begin_resource_attachment_upload(uuid,text,text,integer)` with `{id,path}`.

- [ ] **Step 1: Add failing pgTAP assertions**

Assert the 100 MB constraint, generated resource prefix, approved/active same-organization authorization, cross-organization denial, service-role-only confirmation grants, verified download requirement, and legacy finalization denial.

- [ ] **Step 2: Verify the new pgTAP file fails**

Run: `npx supabase test db supabase/tests/resource_attachment_oss_storage.test.sql`
Expected: FAIL because the migration RPCs and columns do not exist.

- [ ] **Step 3: Implement the forward migration**

Add `object_verified_at` and `object_deleted_at`, replace the 10 MB constraint with `1..104857600`, generate `organization/{org}/resources/{resource}/{attachment}/{safeName}`, expose authenticated authorization RPCs, expose service-role confirmation RPCs, revoke authenticated legacy finalization, and notify PostgREST.

- [ ] **Step 4: Reset and test the database contract**

Run: `npx supabase db reset --local --no-seed && npx supabase test db supabase/tests/resource_attachment_oss_storage.test.sql supabase/tests/resources.test.sql`
Expected: PASS.

### Task 2: Generic Node Attachment API Routes

**Files:**
- Modify: `server/app.ts`
- Modify: `server/auth.ts`
- Modify: `server/types.ts`
- Modify: `server/attachments.test.ts`

**Interfaces:**
- Consumes: database RPCs from Task 1.
- Produces: `POST /api/resource-attachments/:attachmentId/upload-url`, `POST /api/resource-attachments/:attachmentId/finalize`, `GET /api/resource-attachments/:attachmentId/download-url`, and `DELETE /api/resource-attachments/:attachmentId`.

- [ ] **Step 1: Add failing API tests**

Cover missing/invalid tokens, database-issued resource paths, ignored caller paths, HEAD size/MIME mismatch, signed download, successful deletion confirmation, and no confirmation after OSS failure.

- [ ] **Step 2: Verify API tests fail**

Run: `npm test -- --run server/attachments.test.ts`
Expected: FAIL with 404 resource routes.

- [ ] **Step 3: Extend API routing without duplicating OSS primitives**

Map attachment kind to the correct authorize/confirm RPC family while keeping authentication, signing, verification, and error responses shared.

- [ ] **Step 4: Verify API tests pass**

Run: `npm test -- --run server/attachments.test.ts server/config.test.ts`
Expected: PASS.

### Task 3: Browser Resource OSS Transport and Repository Integration

**Files:**
- Modify: `src/services/ossAttachmentTransport.ts`
- Modify: `src/services/ossAttachmentTransport.test.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/types.ts` only if progress callback typing is required.

**Interfaces:**
- Consumes: resource API routes from Task 2.
- Produces: resource upload/download/remove methods keyed only by attachment ID.
- Preserves: `uploadResourceAttachment(resourceId, file)` public repository signature unless UI progress requires an optional callback.

- [ ] **Step 1: Add failing transport and repository tests**

Assert `/api/resource-attachments/...` calls, XHR progress capped at 99 before finalize, 100 after finalize, repository metadata creation before upload, and zero calls to `client.storage` for resource attachments.

- [ ] **Step 2: Verify focused tests fail**

Run: `npm test -- --run src/services/ossAttachmentTransport.test.ts src/data/supabaseRepository.test.ts`
Expected: FAIL because resource methods still call Supabase Storage.

- [ ] **Step 3: Implement resource transport integration**

Parameterize the existing OSS transport by attachment API base path and replace resource Storage upload/download/finalize calls with the OSS transport. Map API failures to existing repository error categories.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- --run src/services/ossAttachmentTransport.test.ts src/data/supabaseRepository.test.ts`
Expected: PASS.

### Task 4: Resource Upload Progress UI

**Files:**
- Modify: `src/pages/ResourceDetailPage.tsx`
- Modify: `src/pages/ResourceDetailPage.test.tsx`
- Modify: `src/pages/ResourcesPage.tsx`
- Modify: `src/pages/ResourcesPage.test.tsx`

**Interfaces:**
- Consumes: optional resource upload progress emitted by Task 3.
- Produces: selected, uploading, verifying, uploaded, and failed resource attachment UI states.

- [ ] **Step 1: Add failing UI tests**

Assert the progress indicator remains below 100 during PUT, displays verification state, disables duplicate submission, reaches 100 only after finalize, and exposes a retryable error.

- [ ] **Step 2: Verify focused UI tests fail**

Run: `npm test -- --run src/pages/ResourceDetailPage.test.tsx src/pages/ResourcesPage.test.tsx`
Expected: FAIL because current resource uploads have no OSS progress lifecycle.

- [ ] **Step 3: Implement minimal progress UI**

Thread progress through the repository without changing resource creation semantics. Reuse existing upload visual styles and keep controls disabled only during active upload/verification.

- [ ] **Step 4: Verify focused UI tests pass**

Run: `npm test -- --run src/pages/ResourceDetailPage.test.tsx src/pages/ResourcesPage.test.tsx`
Expected: PASS.

### Task 5: Deployment Documentation and Complete Verification

**Files:**
- Modify: `docs/alibaba-oss-daily-attachments.md`
- Modify: `docs/alibaba-rds-supabase-init.md`

**Interfaces:**
- Produces: one deployment sequence covering migrations `202608240001` through `202608240004`, frontend build, Node build/restart, Nginx health, and OSS CORS verification.

- [ ] **Step 1: Update deployment documentation**

State that all new business files use OSS, resource and daily-report prefixes share one private bucket, no custom OSS domain is required, old test objects are not migrated, and production secrets remain only in the ECS runtime environment.

- [ ] **Step 2: Run complete verification**

Run: `npm test -- --run && npm run typecheck && npm run build && npm run server:build && npx supabase db reset --local --no-seed && npx supabase test db && npx supabase db lint --local --level error && git diff --check`
Expected: all Vitest and pgTAP assertions pass, both builds pass, lint reports no errors, and diff check is empty.

- [ ] **Step 3: Review storage boundary**

Run: `rg -n "client\\.storage|storage\\.from" src/data/supabaseRepository.ts`
Expected: no daily-report or resource attachment byte transfer remains; any match must belong to an explicitly non-business legacy path or be removed.

- [ ] **Step 4: Present changes for user approval**

Do not push, deploy, or apply production migrations until the user reviews the changed files, test evidence, and remaining production-only checks.
