# Daily Report Attachment OSS Storage Design

## Scope

Move only daily-report attachment bytes from Supabase Storage bucket `report-attachments` to the private Alibaba Cloud OSS bucket `timetech-okr-files`. Structured report, attachment, revision, upload-session, authorization, and review data remains in PostgreSQL. Resource attachments in `resource-documents` remain on Supabase Storage.

Existing daily-report attachment objects are test data and do not require migration or legacy download compatibility. After deployment, new daily-report attachments use OSS exclusively.

## Current Lifecycle Audit

- `begin_attachment_upload` and `begin_entry_attachment_upload` create pending metadata and server-derived `storage_path` values.
- `AttachmentService` and `SupabaseOkrRepository.uploadAll` currently send bytes directly to Supabase Storage.
- `finalize_attachment_upload` currently trusts `storage.objects` to verify object ownership, size, and MIME type.
- `create_attachment_download` authorizes access, then the browser asks Supabase Storage for a signed URL.
- `delete_daily_report_upload_attachment` marks metadata deleted before the browser removes the Storage object.
- `abandon_daily_report_upload_session` inspects `storage.objects` before retiring a session.
- Revision removal, revision adoption, report locks, classification clearance, organization isolation, and reviewer visibility are enforced by existing PostgreSQL functions and remain authoritative.

The effective report-attachment functions requiring new definitions are `begin_attachment_upload`, `begin_entry_attachment_upload`, `finalize_attachment_upload`, `create_attachment_download`, `delete_daily_report_upload_attachment`, `abandon_daily_report_upload_session`, and narrowly scoped object authorization/confirmation helpers. Revision/adoption functions are retained unless their effective implementation depends on Storage-object existence.

## Architecture

The browser calls a same-origin Node API using its current Supabase bearer token. The Node service validates the token and invokes authorization RPCs with that same token. Actual bytes travel directly between the browser and OSS using short-lived signed URLs; ECS never proxies file bytes.

The Node service listens on `127.0.0.1:3001` in production. Nginx proxies `/api/` to it. It reads server-only `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_BUCKET`, `OSS_REGION`, `OSS_ENDPOINT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. No OSS or service-role credential uses a `VITE_` prefix or enters the browser bundle.

## Database Model and Trust Boundary

`report_attachments.storage_path` remains the OSS object key. Add:

- `object_verified_at timestamptz`
- `object_deleted_at timestamptz`

User-context RPCs authorize upload, download, and deletion and return only database-owned object metadata. The Node service performs OSS HEAD/delete operations. After successful physical verification, server-only RPCs callable by `service_role` record `object_verified_at`, transition pending metadata to uploaded, or record `object_deleted_at`.

The service role never decides user authorization. It only records a physical OSS fact after the user-context authorization has succeeded. Browser-callable roles cannot invoke physical confirmation RPCs.

## API and Flows

### Upload

1. Existing begin RPC creates pending metadata.
2. Browser calls `POST /api/attachments/:id/upload-url` with its bearer token.
3. Node calls an upload-authorization RPC using that token. The RPC verifies organization, uploader, active session, editable report, pending state, and expected path/MIME/size.
4. Node returns an exact-object signed PUT URL with an approximately five-minute TTL.
5. Browser uploads directly to OSS using XHR and reports real progress.
6. Browser calls `POST /api/attachments/:id/finalize`.
7. Node reauthorizes, performs OSS HEAD, verifies exact byte size and reliable MIME metadata, then invokes the service-only completion RPC.
8. The UI reaches uploaded/100% only after finalization succeeds.

### Download

`GET /api/attachments/:id/download-url` authenticates the caller, invokes the existing/redefined download authorization using caller context, and returns an approximately 60-second signed OSS GET URL. The bucket stays private.

### Delete and Cleanup

`DELETE /api/attachments/:id` invokes user-context deletion authorization, obtains the database-owned object key, marks metadata deleted while leaving `object_deleted_at` null, deletes that exact OSS object, and confirms deletion with a server-only RPC. Repeating deletion is safe. An OSS failure remains visibly incomplete and retryable.

Session abandonment marks eligible pending metadata deleted but retires the session only when every unassociated deleted attachment has `object_deleted_at` populated and no uploaded/failed cleanup remains. Revision-history and adopted attachments retain existing behavior.

## Frontend

Create one daily-report OSS API transport shared by `AttachmentService` and repository bulk/session uploads. It requests signed URLs, performs direct PUT uploads with progress, finalizes through the Node API, obtains download URLs, and requests deletion. Supabase Storage support stays in place only for resource attachments.

Raise the daily-report attachment maximum from 10 MB to 100 MB and update Chinese validation text. The existing file type whitelist, classification controls, retry behavior, progress states, revision display names, entry-level/report-level associations, partial-failure cleanup, and report locking remain unchanged.

## Security

- Bearer token required for every attachment endpoint.
- No browser-supplied object key, user ID, organization ID, or owner is trusted.
- Private OSS bucket and short-lived exact-object signatures only.
- No broad API CORS; the API is same-origin.
- OSS bucket CORS allows only `https://okr.trspectra.com`, methods `PUT`, `GET`, `HEAD`, required signed-request headers, and `ETag` only if needed. No wildcard origin.
- Secrets are startup-validated, never logged, never committed, and never included in Vite variables.

## Testing

- Frontend: 100 MB boundary, rejection above 100 MB, signing request, direct upload/progress, upload/finalize failure, retry, download, deletion, and partial multi-file cleanup.
- Node API: startup configuration, 401 authentication failures, authorization denial, no arbitrary path signing, upload signing, HEAD verification and mismatch rejection, download signing, deletion, and OSS failure.
- SQL: authorization, physical verification/deletion metadata, session abandonment, revisions/adoption, locks, visibility, and unchanged resource Storage behavior.
- Run frontend/unit tests, server tests, TypeScript checks, Vite build, Supabase reset/pgTAP, and lint where available.

## Deployment Boundary

This implementation does not modify live Nginx, start production services, push code, or execute production migrations. Documentation will provide a systemd unit, Nginx `/api/` proxy block, environment loading, health check, restart sequence, migration order, and manual OSS CORS settings. Deployment waits for explicit approval.
