\set ON_ERROR_STOP on
\pset pager off

\echo '=== PRESERVED COUNTS AFTER CLEANUP ==='
select 'auth.users' as table_name, count(*) as row_count from auth.users
union all select 'public.organizations', count(*) from public.organizations
union all select 'public.profiles', count(*) from public.profiles
union all select 'public.user_roles', count(*) from public.user_roles
union all select 'public.reporting_lines', count(*) from public.reporting_lines
order by table_name;

\echo '=== BUSINESS COUNTS AFTER CLEANUP ==='
select format(
  'select %L as table_name, count(*) as row_count from public.%I;',
  table_name,
  table_name
)
from (values
  ('collaboration_links'), ('project_members'), ('objective_owners'),
  ('kr_assignments'), ('kr_progress_updates'), ('progress_baselines'),
  ('progress_snapshots'), ('milestones'), ('risks'), ('legacy_project_risks'),
  ('daily_report_comments'), ('resource_problem_notifications'),
  ('user_notifications'), ('report_attachment_revisions'),
  ('report_attachments'), ('daily_key_results'), ('daily_objectives'),
  ('daily_okr_blocks'), ('daily_report_revision_krs'),
  ('report_evidence_links'), ('daily_report_upload_sessions'),
  ('daily_report_revisions'), ('daily_reports'), ('resource_attachments'),
  ('resource_problems'), ('resources'), ('key_results'), ('objectives'),
  ('projects')
) approved(table_name)
order by table_name
\gexec

do $$
declare
  business_table text;
  remaining bigint;
begin
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
      raise exception 'Verification failed: public.% contains % rows', business_table, remaining;
    end if;
  end loop;
end
$$;

select 'verification passed: all approved business tables are empty' as result;
