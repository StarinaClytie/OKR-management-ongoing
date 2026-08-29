\set ON_ERROR_STOP on
\pset pager off

\if :{?expected_auth_users}
\else
  \echo 'ERROR: expected_auth_users is required'
  \quit
\endif
\if :{?expected_organizations}
\else
  \echo 'ERROR: expected_organizations is required'
  \quit
\endif
\if :{?expected_profiles}
\else
  \echo 'ERROR: expected_profiles is required'
  \quit
\endif
\if :{?expected_user_roles}
\else
  \echo 'ERROR: expected_user_roles is required'
  \quit
\endif
\if :{?expected_reporting_lines}
\else
  \echo 'ERROR: expected_reporting_lines is required'
  \quit
\endif

begin;
select pg_advisory_xact_lock(hashtext('production-test-data-cleanup'));

create temporary table cleanup_expected_counts (
  table_name text primary key,
  expected_count bigint not null check (expected_count >= 0)
) on commit drop;

insert into cleanup_expected_counts (table_name, expected_count) values
  ('auth.users', :'expected_auth_users'::bigint),
  ('public.organizations', :'expected_organizations'::bigint),
  ('public.profiles', :'expected_profiles'::bigint),
  ('public.user_roles', :'expected_user_roles'::bigint),
  ('public.reporting_lines', :'expected_reporting_lines'::bigint);

do $$
declare
  mismatch text;
  unexpected_tables text;
begin
  select string_agg(table_name || ': expected ' || expected_count || ', found ' || actual_count, '; ')
  into mismatch
  from (
    select e.table_name, e.expected_count,
      case e.table_name
        when 'auth.users' then (select count(*) from auth.users)
        when 'public.organizations' then (select count(*) from public.organizations)
        when 'public.profiles' then (select count(*) from public.profiles)
        when 'public.user_roles' then (select count(*) from public.user_roles)
        when 'public.reporting_lines' then (select count(*) from public.reporting_lines)
      end as actual_count
    from cleanup_expected_counts e
  ) counts
  where expected_count <> actual_count;

  if mismatch is not null then
    raise exception 'Preserved-count guard failed before cleanup: %', mismatch;
  end if;

  select string_agg(tablename, ', ' order by tablename)
  into unexpected_tables
  from pg_catalog.pg_tables
  where schemaname = 'public'
    and tablename not in (
      'organizations', 'profiles', 'user_roles', 'reporting_lines',
      'collaboration_links', 'project_members', 'objective_owners',
      'kr_assignments', 'kr_progress_updates', 'progress_baselines',
      'progress_snapshots', 'milestones', 'risks', 'legacy_project_risks',
      'daily_report_comments', 'resource_problem_notifications',
      'user_notifications', 'report_attachment_revisions',
      'report_attachments', 'daily_key_results', 'daily_objectives',
      'daily_okr_blocks', 'daily_report_revision_krs',
      'report_evidence_links', 'daily_report_upload_sessions',
      'daily_report_revisions', 'daily_reports', 'resource_attachments',
      'resource_problems', 'resources', 'key_results', 'objectives', 'projects'
    );

  if unexpected_tables is not null then
    raise exception 'Unexpected public tables require review before cleanup: %', unexpected_tables;
  end if;
end
$$;

truncate table
  public.collaboration_links,
  public.project_members,
  public.objective_owners,
  public.kr_assignments,
  public.kr_progress_updates,
  public.progress_baselines,
  public.progress_snapshots,
  public.milestones,
  public.risks,
  public.legacy_project_risks,
  public.daily_report_comments,
  public.resource_problem_notifications,
  public.user_notifications,
  public.report_attachment_revisions,
  public.report_attachments,
  public.daily_key_results,
  public.daily_objectives,
  public.daily_okr_blocks,
  public.daily_report_revision_krs,
  public.report_evidence_links,
  public.daily_report_upload_sessions,
  public.daily_report_revisions,
  public.daily_reports,
  public.resource_attachments,
  public.resource_problems,
  public.resources,
  public.key_results,
  public.objectives,
  public.projects
restart identity;

do $$
declare
  mismatch text;
  business_table text;
  remaining bigint;
begin
  select string_agg(table_name || ': expected ' || expected_count || ', found ' || actual_count, '; ')
  into mismatch
  from (
    select e.table_name, e.expected_count,
      case e.table_name
        when 'auth.users' then (select count(*) from auth.users)
        when 'public.organizations' then (select count(*) from public.organizations)
        when 'public.profiles' then (select count(*) from public.profiles)
        when 'public.user_roles' then (select count(*) from public.user_roles)
        when 'public.reporting_lines' then (select count(*) from public.reporting_lines)
      end as actual_count
    from cleanup_expected_counts e
  ) counts
  where expected_count <> actual_count;

  if mismatch is not null then
    raise exception 'Preserved-count guard failed after cleanup: %', mismatch;
  end if;

  foreach business_table in array array[
    'collaboration_links', 'project_members', 'objective_owners', 'kr_assignments',
    'kr_progress_updates', 'progress_baselines', 'progress_snapshots', 'milestones',
    'risks', 'legacy_project_risks', 'daily_report_comments',
    'resource_problem_notifications', 'user_notifications',
    'report_attachment_revisions', 'report_attachments', 'daily_key_results',
    'daily_objectives', 'daily_okr_blocks', 'daily_report_revision_krs',
    'report_evidence_links', 'daily_report_upload_sessions',
    'daily_report_revisions', 'daily_reports', 'resource_attachments',
    'resource_problems', 'resources', 'key_results', 'objectives', 'projects'
  ] loop
    execute format('select count(*) from public.%I', business_table) into remaining;
    if remaining <> 0 then
      raise exception 'Cleanup failed: public.% still contains % rows', business_table, remaining;
    end if;
  end loop;
end
$$;

commit;
\echo 'CLEANUP COMMITTED: preserved counts matched and all approved business tables are empty.'
