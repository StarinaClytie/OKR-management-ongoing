\set ON_ERROR_STOP on
\pset pager off

\echo '=== PRESERVED COUNTS (copy these five values) ==='
select 'auth.users' as table_name, count(*) as row_count from auth.users
union all select 'public.organizations', count(*) from public.organizations
union all select 'public.profiles', count(*) from public.profiles
union all select 'public.user_roles', count(*) from public.user_roles
union all select 'public.reporting_lines', count(*) from public.reporting_lines
order by table_name;

\echo '=== EXACT COUNTS FOR ALL PUBLIC TABLES ==='
select format(
  'select %L as table_name, count(*) as row_count from public.%I;',
  tablename,
  tablename
)
from pg_catalog.pg_tables
where schemaname = 'public'
order by tablename
\gexec

\echo '=== ATTACHMENT OBJECT INVENTORY (export before deleting OSS bytes) ==='
select
  'daily'::text as attachment_kind,
  id as attachment_id,
  organization_id,
  storage_path as object_key,
  state::text as metadata_state
from public.report_attachments
where storage_path is not null
union all
select
  'resource'::text,
  id,
  organization_id,
  storage_path,
  case when object_deleted_at is null then 'present' else 'deleted' end
from public.resource_attachments
where storage_path is not null
order by organization_id, attachment_kind, attachment_id;

\echo '=== FOREIGN KEYS TOUCHING THE APPROVED BUSINESS TABLES ==='
with business_tables(table_name) as (
  values
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
)
select
  constraint_name,
  source_schema || '.' || source_table as source_table,
  target_schema || '.' || target_table as target_table
from (
  select
    c.conname as constraint_name,
    ns.nspname as source_schema,
    source.relname as source_table,
    nt.nspname as target_schema,
    target.relname as target_table
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class source on source.oid = c.conrelid
  join pg_catalog.pg_namespace ns on ns.oid = source.relnamespace
  join pg_catalog.pg_class target on target.oid = c.confrelid
  join pg_catalog.pg_namespace nt on nt.oid = target.relnamespace
  where c.contype = 'f'
) fk
where source_table in (select table_name from business_tables)
   or target_table in (select table_name from business_tables)
order by source_schema, source_table, constraint_name;

\echo 'PREVIEW COMPLETE: no rows were changed.'
