-- Secure, server-owned daily report review and account notification boundary.

create table public.daily_report_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (organization_id, report_id)
    references public.daily_reports(organization_id, id) on delete cascade,
  foreign key (organization_id, author_id)
    references public.profiles(organization_id, id) on delete restrict
);

create index daily_report_comments_report_created_idx
  on public.daily_report_comments (report_id, created_at, id);

alter table public.daily_report_comments enable row level security;
alter table public.daily_report_comments force row level security;
revoke all on public.daily_report_comments from public, anon, authenticated;

alter table public.user_notifications
  add constraint user_notifications_comment_id_fkey
  foreign key (comment_id) references public.daily_report_comments(id) on delete cascade;

alter table public.user_notifications
  add constraint user_notifications_target_check check (
    (
      notification_type = 'resource_owner_assigned'
      and resource_id is not null
      and report_id is null
      and comment_id is null
    )
    or (
      notification_type = 'daily_report_comment'
      and resource_id is null
      and report_id is not null
      and comment_id is not null
    )
    or (
      notification_type = 'daily_report_confirmed'
      and resource_id is null
      and report_id is not null
      and comment_id is null
    )
  );

create unique index user_notifications_confirmed_once_idx
  on public.user_notifications (recipient_id, report_id, notification_type)
  where notification_type = 'daily_report_confirmed';

create or replace function private.can_review_daily_report_block(
  p_report_id uuid,
  p_block_id uuid,
  p_reviewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_reports report
    join public.daily_report_revisions revision
      on revision.report_id = report.id
     and revision.organization_id = report.organization_id
     and revision.revision_number = report.current_revision
    join public.daily_okr_blocks block
      on block.id = p_block_id
     and block.organization_id = report.organization_id
     and block.report_id = report.id
     and block.revision_id = revision.id
    join public.profiles reviewer
      on reviewer.id = p_reviewer_id
     and reviewer.organization_id = report.organization_id
    join public.user_roles reviewer_role
      on reviewer_role.profile_id = reviewer.id
     and reviewer_role.organization_id = reviewer.organization_id
     and reviewer_role.is_active
    where report.id = p_report_id
      and reviewer.is_active
      and reviewer.approval_status = 'approved'
      and report.author_id <> reviewer.id
      and private.classification_rank(reviewer.clearance)
        >= private.classification_rank(revision.classification)
      and (
        reviewer_role.role = 'management'
        or (
          reviewer_role.role = 'project_leader'
          and exists (
            select 1
            from public.key_results key_result
            join public.objectives objective
              on objective.id = key_result.objective_id
             and objective.organization_id = key_result.organization_id
            where key_result.id = block.linked_key_result_id
              and key_result.organization_id = report.organization_id
              and objective.owner_id = reviewer.id
          )
        )
      )
  )
$$;

create or replace function private.can_review_daily_report(
  p_report_id uuid,
  p_reviewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_reports report
    join public.daily_report_revisions revision
      on revision.report_id = report.id
     and revision.organization_id = report.organization_id
     and revision.revision_number = report.current_revision
    join public.profiles reviewer
      on reviewer.id = p_reviewer_id
     and reviewer.organization_id = report.organization_id
    join public.user_roles reviewer_role
      on reviewer_role.profile_id = reviewer.id
     and reviewer_role.organization_id = reviewer.organization_id
     and reviewer_role.is_active
    where report.id = p_report_id
      and reviewer.is_active
      and reviewer.approval_status = 'approved'
      and report.author_id <> reviewer.id
      and private.classification_rank(reviewer.clearance)
        >= private.classification_rank(revision.classification)
      and (
        reviewer_role.role = 'management'
        or (
          reviewer_role.role = 'project_leader'
          and exists (
            select 1
            from public.daily_okr_blocks block
            where block.organization_id = report.organization_id
              and block.report_id = report.id
              and block.revision_id = revision.id
              and private.can_review_daily_report_block(report.id, block.id, reviewer.id)
          )
        )
      )
  )
$$;

revoke all on function private.can_review_daily_report_block(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_review_daily_report(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_daily_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target record;
  caller_is_author boolean := false;
  caller_is_management boolean := false;
  caller_can_review boolean := false;
  visible_blocks jsonb := '[]'::jsonb;
  visible_comments jsonb := '[]'::jsonb;
begin
  select
    report.id,
    report.organization_id,
    report.author_id,
    report.report_date,
    report.status,
    report.total_hours,
    report.current_revision,
    revision.id as revision_id,
    author.display_name as author_name
  into target
  from public.daily_reports report
  join public.daily_report_revisions revision
    on revision.report_id = report.id
   and revision.organization_id = report.organization_id
   and revision.revision_number = report.current_revision
  join public.profiles author
    on author.id = report.author_id
   and author.organization_id = report.organization_id
  where report.id = p_report_id
    and report.organization_id = private.current_organization_id()
    and private.is_operational()
    and private.has_clearance(revision.classification);

  if not found then
    raise exception 'Daily report is not available' using errcode = '42501';
  end if;

  caller_is_author := target.author_id = auth.uid();
  caller_can_review := private.can_review_daily_report(target.id, auth.uid());
  caller_is_management := caller_can_review and private.has_role('management');

  if not caller_is_author and not caller_can_review then
    raise exception 'Daily report is not available' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', block.id,
        'dailyObjective', block.daily_objective,
        'keyResultId', block.linked_key_result_id,
        'workDescription', block.work_description,
        'hours', block.hours,
        'result', block.result,
        'keyResults', block.key_results,
        'attachments', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'attachmentId', association.attachment_id,
              'displayName', association.display_name,
              'classification', association.classification
            ) order by association.created_at, association.attachment_id
          )
          from public.report_attachment_revisions association
          join public.report_attachments attachment
            on attachment.id = association.attachment_id
           and attachment.organization_id = association.organization_id
           and attachment.report_id = association.report_id
          where association.organization_id = block.organization_id
            and association.report_id = block.report_id
            and association.revision_id = block.revision_id
            and association.daily_okr_block_id = block.id
            and attachment.state = 'uploaded'
            and private.has_clearance(association.classification)
            and private.has_clearance(attachment.classification)
        ), '[]'::jsonb)
      ) order by block.position
    ),
    '[]'::jsonb
  )
  into visible_blocks
  from public.daily_okr_blocks block
  where block.organization_id = target.organization_id
    and block.report_id = target.id
    and block.revision_id = target.revision_id
    and (
      caller_is_author
      or caller_is_management
      or private.can_review_daily_report_block(target.id, block.id, auth.uid())
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', comment.id,
        'reportId', comment.report_id,
        'authorId', comment.author_id,
        'authorName', comment_author.display_name,
        'body', comment.body,
        'createdAt', comment.created_at
      ) order by comment.created_at, comment.id
    ),
    '[]'::jsonb
  )
  into visible_comments
  from public.daily_report_comments comment
  join public.profiles comment_author
    on comment_author.id = comment.author_id
   and comment_author.organization_id = comment.organization_id
  where comment.organization_id = target.organization_id
    and comment.report_id = target.id;

  return jsonb_build_object(
    'id', target.id,
    'authorId', target.author_id,
    'authorName', target.author_name,
    'date', target.report_date,
    'status', target.status,
    'hours', target.total_hours,
    'currentRevision', target.current_revision,
    'blocks', visible_blocks,
    'comments', visible_comments,
    'canComment', caller_can_review,
    'canConfirm', caller_can_review and target.status = 'submitted'
  );
end;
$$;

create or replace function public.comment_daily_report(
  p_report_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report public.daily_reports%rowtype;
  new_comment public.daily_report_comments%rowtype;
  reviewer_name text;
begin
  select report.*
  into target_report
  from public.daily_reports report
  join public.daily_report_revisions revision
    on revision.report_id = report.id
   and revision.organization_id = report.organization_id
   and revision.revision_number = report.current_revision
  where report.id = p_report_id
    and report.organization_id = private.current_organization_id()
    and private.is_operational()
    and private.has_clearance(revision.classification)
  for update of report;

  if not found or not private.can_review_daily_report(p_report_id, auth.uid()) then
    raise exception 'Daily report is not available' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'Daily report comment must contain between 1 and 4000 characters' using errcode = '22023';
  end if;

  insert into public.daily_report_comments (
    organization_id, report_id, author_id, body
  ) values (
    target_report.organization_id, target_report.id, auth.uid(), trim(p_body)
  )
  returning * into new_comment;

  insert into public.user_notifications (
    organization_id, recipient_id, actor_id, notification_type, report_id, comment_id
  ) values (
    target_report.organization_id, target_report.author_id, auth.uid(),
    'daily_report_comment', target_report.id, new_comment.id
  );

  select profile.display_name
  into reviewer_name
  from public.profiles profile
  where profile.id = new_comment.author_id
    and profile.organization_id = new_comment.organization_id;

  return jsonb_build_object(
    'id', new_comment.id,
    'reportId', new_comment.report_id,
    'authorId', new_comment.author_id,
    'authorName', reviewer_name,
    'body', new_comment.body,
    'createdAt', new_comment.created_at
  );
end;
$$;

create or replace function public.confirm_daily_report(
  p_report_id uuid,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report public.daily_reports%rowtype;
begin
  select report.*
  into target_report
  from public.daily_reports report
  where report.id = p_report_id
    and report.organization_id = private.current_organization_id()
    and private.is_operational()
  for update;

  if not found or not private.can_review_daily_report(p_report_id, auth.uid()) then
    raise exception 'Only an authorized daily report reviewer can confirm this report' using errcode = '42501';
  end if;
  if target_report.current_revision <> p_expected_revision then
    raise exception 'Daily report revision conflict' using errcode = '40001';
  end if;
  if target_report.status = 'confirmed' then
    return;
  end if;
  if target_report.status <> 'submitted' then
    raise exception 'Only submitted daily reports can be confirmed' using errcode = '22023';
  end if;

  update public.daily_reports
  set status = 'confirmed'
  where id = target_report.id;

  insert into public.user_notifications (
    organization_id, recipient_id, actor_id, notification_type, report_id
  ) values (
    target_report.organization_id, target_report.author_id, auth.uid(),
    'daily_report_confirmed', target_report.id
  )
  on conflict (recipient_id, report_id, notification_type)
    where notification_type = 'daily_report_confirmed'
    do nothing;
end;
$$;

create or replace function public.list_my_notifications(
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_org uuid := private.current_organization_id();
  resolved_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  notification_items jsonb := '[]'::jsonb;
  total_unread integer := 0;
  has_more boolean := false;
  next_created_at timestamptz;
  next_id uuid;
begin
  if target_org is null or not private.is_operational() then
    raise exception 'Notifications are not available' using errcode = '42501';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Notification cursor is invalid' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', notification.id,
        'type', notification.notification_type,
        'reportId', notification.report_id,
        'resourceId', notification.resource_id,
        'actorName', coalesce(actor.display_name, ''),
        'readAt', notification.read_at,
        'createdAt', notification.created_at
      ) order by notification.created_at desc, notification.id desc
    ),
    '[]'::jsonb
  )
  into notification_items
  from (
    select candidate.*
    from public.user_notifications candidate
    where candidate.organization_id = target_org
      and candidate.recipient_id = auth.uid()
      and (
        p_cursor_created_at is null
        or (candidate.created_at, candidate.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by candidate.created_at desc, candidate.id desc
    limit resolved_limit
  ) notification
  left join public.profiles actor
    on actor.id = notification.actor_id
   and actor.organization_id = notification.organization_id;

  select count(*)::integer
  into total_unread
  from public.user_notifications notification
  where notification.organization_id = target_org
    and notification.recipient_id = auth.uid()
    and notification.read_at is null;

  select exists (
    select 1
    from public.user_notifications candidate
    where candidate.organization_id = target_org
      and candidate.recipient_id = auth.uid()
      and (
        p_cursor_created_at is null
        or (candidate.created_at, candidate.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by candidate.created_at desc, candidate.id desc
    offset resolved_limit
    limit 1
  )
  into has_more;

  if has_more and jsonb_array_length(notification_items) > 0 then
    next_created_at := (notification_items->-1->>'createdAt')::timestamptz;
    next_id := (notification_items->-1->>'id')::uuid;
  end if;

  return jsonb_build_object(
    'items', notification_items,
    'nextCursor', case
      when has_more then jsonb_build_object('createdAt', next_created_at, 'id', next_id)
      else 'null'::jsonb
    end,
    'unreadCount', total_unread
  );
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := private.current_organization_id();
begin
  if target_org is null or not private.is_operational() then
    raise exception 'Notifications are not available' using errcode = '42501';
  end if;

  update public.user_notifications
  set read_at = timezone('utc', now())
  where id = p_notification_id
    and recipient_id = auth.uid()
    and organization_id = target_org
    and read_at is null;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := private.current_organization_id();
  affected_count integer;
begin
  if target_org is null or not private.is_operational() then
    raise exception 'Notifications are not available' using errcode = '42501';
  end if;

  update public.user_notifications
  set read_at = timezone('utc', now())
  where recipient_id = auth.uid()
    and organization_id = target_org
    and read_at is null;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.get_daily_report_detail(uuid) from public, anon;
revoke all on function public.comment_daily_report(uuid, text) from public, anon;
revoke all on function public.confirm_daily_report(uuid, integer) from public, anon;
revoke all on function public.list_my_notifications(integer, timestamptz, uuid) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;

grant execute on function public.get_daily_report_detail(uuid) to authenticated;
grant execute on function public.comment_daily_report(uuid, text) to authenticated;
grant execute on function public.confirm_daily_report(uuid, integer) to authenticated;
grant execute on function public.list_my_notifications(integer, timestamptz, uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
