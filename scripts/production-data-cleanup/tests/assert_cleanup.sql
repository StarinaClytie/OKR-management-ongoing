\set ON_ERROR_STOP on

do $$
declare
  business_table text;
  remaining bigint;
begin
  if (select count(*) from auth.users where id in (
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002'
  )) <> 2 then
    raise exception 'auth users were changed';
  end if;

  if (select count(*) from public.profiles where organization_id = 'd2000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'profiles were changed';
  end if;

  if (select count(*) from public.user_roles where organization_id = 'd2000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'user roles were changed';
  end if;

  if (select count(*) from public.reporting_lines where organization_id = 'd2000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'reporting lines were changed';
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
      raise exception 'business table public.% still contains % rows', business_table, remaining;
    end if;
  end loop;
end
$$;

select 'cleanup assertions passed' as result;
