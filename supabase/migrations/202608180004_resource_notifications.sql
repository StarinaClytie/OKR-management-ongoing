-- Phase 3 — Resources & Supplies: notification retry & idempotent delivery.
--
-- report_resource_problem already persists a `pending` notification and lets the
-- browser invoke `resource-problem-notify` to attempt delivery. This migration
-- makes that delivery *recoverable* and *at-most-once* so a lost browser
-- follow-up (tab close, network drop, crash, Edge Function timeout) can never
-- leave a notification permanently stuck:
--
--   * `sending` marks an in-flight delivery claim so two concurrent invocations
--     cannot double-send; a stale claim (older than 5 minutes) is reclaimable,
--     so a crashed delivery never wedges the row.
--   * `attempted_at` records the last delivery attempt.
--   * a UNIQUE index on problem_id enforces "one notification identity per
--     problem/recipient/purpose" (the recipient is always the resource owner in
--     V1), so retries reuse the same row instead of creating duplicates.
--
-- The notification audit trail remains invisible to the browser (authenticated
-- role): only the SECURITY DEFINER RPCs below and the service-role Edge
-- Function touch it.

alter type public.resource_notification_status add value if not exists 'sending' before 'sent';

alter table public.resource_problem_notifications
  add column if not exists attempted_at timestamptz;

drop index if exists public.resource_problem_notifications_problem_idx;
create unique index resource_problem_notifications_problem_uidx
  on public.resource_problem_notifications (problem_id);

-- ---------------------------------------------------------------------------
-- claim_resource_problem_notification — the Edge Function's atomic claim
-- primitive. Called with the service role. Returns:
--   'claimed'     — this caller now owns the delivery, send the email;
--   'sent'        — already delivered, do NOT send again;
--   'in_progress' — a live concurrent delivery owns the claim, do nothing.
-- A `sending` claim older than 5 minutes is treated as a crashed delivery and
-- reclaimed, so retries are deterministic and never wedge the notification.
-- ---------------------------------------------------------------------------
create or replace function public.claim_resource_problem_notification(p_notification_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.resource_notification_status;
  current_attempted timestamptz;
begin
  select status, attempted_at into current_status, current_attempted
  from public.resource_problem_notifications
  where id = p_notification_id
  for update;
  if not found then
    raise exception 'Notification not found' using errcode = '22023';
  end if;

  if current_status = 'sent' then
    return 'sent';
  end if;

  if current_status = 'sending'
     and current_attempted is not null
     and current_attempted >= timezone('utc', now()) - interval '5 minutes' then
    return 'in_progress';
  end if;

  -- pending, failed, or a stale sending claim → claim it now.
  update public.resource_problem_notifications
  set status = 'sending',
      attempted_at = timezone('utc', now()),
      error_code = null
  where id = p_notification_id;
  return 'claimed';
end;
$$;

-- ---------------------------------------------------------------------------
-- retry_resource_problem_notification — the authorized retry entry point for a
-- persisted problem. The resource owner, management, and administrator may
-- retry; anyone else is rejected. Returns the existing notification (never a
-- new one), whose delivery is then attempted by the `resource-problem-notify`
-- Edge Function. The recipient is never supplied by the client.
-- ---------------------------------------------------------------------------
create or replace function public.retry_resource_problem_notification(p_problem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.resource_problems%rowtype;
  target_resource public.resources%rowtype;
  notification public.resource_problem_notifications%rowtype;
begin
  select * into target
  from public.resource_problems
  where id = p_problem_id
    and organization_id = private.current_organization_id();
  if not found or not private.is_operational() then
    raise exception 'Notification is not retryable by the current user' using errcode = '42501';
  end if;

  select * into target_resource
  from public.resources
  where id = target.resource_id
    and organization_id = target.organization_id;

  if not (private.has_role('management') or private.has_role('administrator') or target_resource.owner_id = auth.uid()) then
    raise exception 'Notification is not retryable by the current user' using errcode = '42501';
  end if;

  select * into notification
  from public.resource_problem_notifications
  where problem_id = target.id;
  if not found then
    raise exception 'Notification not found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'problemId', target.id,
    'notificationId', notification.id,
    'status', notification.status::text,
    'errorCode', notification.error_code
  );
end;
$$;

revoke all on function public.claim_resource_problem_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_resource_problem_notification(uuid) to service_role;

revoke all on function public.retry_resource_problem_notification(uuid) from public, anon;
grant execute on function public.retry_resource_problem_notification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_resource_detail — redefined to expose each problem's notification status
-- (and generic error code) so the detail page can offer a retry action when
-- delivery is pending or failed, without exposing the notification audit trail.
-- ---------------------------------------------------------------------------
create or replace function public.get_resource_detail(p_resource_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  owner_name text;
  attachments jsonb := '[]'::jsonb;
  problems jsonb := '[]'::jsonb;
begin
  select * into target
  from public.resources
  where id = p_resource_id
    and organization_id = private.current_organization_id();
  if not found or not private.is_operational() then
    return null;
  end if;

  select p.display_name into owner_name
  from public.profiles p
  where p.id = target.owner_id;

  select coalesce(jsonb_agg(a order by a->>'createdAt'), '[]'::jsonb) into attachments
  from (
    select jsonb_build_object(
      'id', ra.id,
      'fileName', ra.file_name,
      'mimeType', ra.mime_type,
      'sizeBytes', ra.size_bytes,
      'createdAt', ra.created_at
    ) as a
    from public.resource_attachments ra
    where ra.resource_id = target.id
  ) attachment_rows;

  select coalesce(jsonb_agg(pr order by pr->>'reportedAt'), '[]'::jsonb) into problems
  from (
    select jsonb_build_object(
      'id', rp.id,
      'problemType', rp.problem_type,
      'description', rp.description,
      'status', rp.status,
      'reporterId', rp.reporter_id,
      'reporterName', reporter.display_name,
      'reportedAt', rp.reported_at,
      'resolvedAt', rp.resolved_at,
      'resolvedBy', rp.resolved_by,
      'resolvedByName', resolver.display_name,
      'resolutionNote', rp.resolution_note,
      'notificationStatus', coalesce(n.status, 'pending'::public.resource_notification_status),
      'notificationErrorCode', n.error_code
    ) as pr
    from public.resource_problems rp
    join public.profiles reporter on reporter.id = rp.reporter_id
    left join public.profiles resolver on resolver.id = rp.resolved_by
    left join public.resource_problem_notifications n on n.problem_id = rp.id
    where rp.resource_id = target.id
  ) problem_rows;

  return jsonb_build_object(
    'id', target.id,
    'name', target.name,
    'category', target.category,
    'resourceKind', target.resource_kind,
    'description', target.description,
    'ownerId', target.owner_id,
    'ownerName', coalesce(owner_name, ''),
    'location', target.location,
    'purchaseDate', target.purchase_date,
    'purchaseVendor', target.purchase_vendor,
    'purchaseReference', target.purchase_reference,
    'usageNotes', target.usage_notes,
    'manualUrl', target.manual_url,
    'quantity', target.quantity,
    'unit', target.unit,
    'status', target.status,
    'createdById', target.created_by,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at,
    'archivedAt', target.archived_at,
    'attachments', attachments,
    'problems', problems
  );
end;
$$;
