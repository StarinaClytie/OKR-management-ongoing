# Resource Attachments on Alibaba OSS Design

## Scope

Move all newly uploaded resource attachment bytes from Supabase Storage to the existing private Alibaba OSS bucket `timetech-okr-files`. Existing resource attachments are disposable test data and require no migration or legacy download compatibility. Daily-report attachments continue using the OSS implementation introduced in `202608240003_daily_report_oss_storage.sql`.

PostgreSQL remains authoritative for attachment identity, organization scope, resource association, uploader, MIME type, byte size, lifecycle state, and authorization. No OSS credential or service-role credential may enter the browser bundle, Git repository, client-visible environment variables, or logs.

## Architecture

Extend the existing localhost-only attachment Node service instead of creating another service. Daily-report and resource attachments share authentication, OSS signing, HEAD verification, deletion primitives, and the same Nginx `/api/` proxy. Resource-specific database RPCs retain their own authorization rules.

OSS object prefixes remain separated:

- Daily reports: `organization/{organizationId}/reports/...`
- Resources: `organization/{organizationId}/resources/...`

The database generates every object path. Requests from the browser contain only the attachment identifier and never supply or override an OSS path.

## Upload Flow

1. An authorized user asks PostgreSQL to create pending resource attachment metadata.
2. The browser calls `POST /api/resource-attachments/{attachmentId}/upload-url` with its current Supabase access token.
3. The Node service validates the token and calls a resource-specific authorization RPC.
4. The service signs a five-minute OSS PUT for the database-issued path and MIME type.
5. The browser uploads directly to OSS and displays byte progress capped at 99 percent.
6. The browser calls `POST /api/resource-attachments/{attachmentId}/finalize`.
7. The Node service performs OSS HEAD, compares size and MIME type with PostgreSQL metadata, and calls a service-role-only confirmation RPC.
8. Only after confirmation does the UI display 100 percent and treat the attachment as uploaded.

New resource attachments accept the same supported MIME types as the existing feature and have a 100 MB maximum. A failed upload remains non-final and can be cleaned up or retried without presenting a false completed record.

## Download and Deletion

`GET /api/resource-attachments/{attachmentId}/download-url` authenticates the caller, checks the current resource visibility policy through PostgreSQL, and returns a short-lived signed OSS GET URL.

If resource attachment deletion is exposed by the current workflow, deletion uses the same authorize → OSS delete → service-role confirmation sequence. No database row is treated as physically deleted until OSS confirms deletion. This work does not add a new resource deletion UI solely for migration purposes.

## Authorization

- Only approved, active users with an active organization role participate in resource workflows.
- Read/download follows the resource visibility rules introduced by `202608240001_resource_access.sql`.
- Upload requires permission to manage the target resource under the existing resource business rules.
- Cross-organization access is always rejected.
- Service-role RPCs are not executable by `authenticated`, `anon`, or `public`.
- The private OSS bucket is never made public and does not need a custom domain binding.

## Frontend and Repository Boundary

The repository uses an attachment transport keyed by attachment kind (`daily-report` or `resource`). Both transports call the same-origin Node API and then upload directly to the returned OSS URL. Resource attachment code must no longer call `client.storage.from(...).upload()` or `createSignedUrl()`.

The resource page shows real upload progress and an explicit verification phase. Controls remain disabled while transfer or verification is active, and errors remain retryable.

## Database Migration

Add one forward-only migration after `202608240003` that:

- extends resource attachment lifecycle metadata for OSS verification/deletion;
- raises the resource attachment size constraint to 100 MB;
- redefines resource upload metadata creation without trusting caller paths;
- adds authenticated upload/download authorization RPCs;
- adds service-role-only upload/deletion confirmation RPCs;
- disables authenticated use of the legacy Supabase Storage finalization path;
- reloads the PostgREST schema cache.

No existing resource objects are copied or rewritten.

## Verification

- Unit tests cover token rejection, database-issued paths, direct PUT progress, HEAD mismatch, download signing, and cleanup failures.
- Repository tests prove resource attachments no longer call Supabase Storage while daily-report OSS behavior remains intact.
- pgTAP covers 100 MB boundaries, active-user authorization, cross-organization rejection, service-role grants, verification state, and download visibility.
- The complete Vitest suite, TypeScript checks, both builds, local database reset, full pgTAP suite, and Supabase lint must pass before integration.
- Production deployment updates code, applies all pending migrations in order, rebuilds frontend and Node outputs, restarts the single attachment service, reloads Nginx, and verifies both attachment kinds against real approved accounts.
