\pset format unaligned
\pset tuples_only on
select '=== POLICY ' || tablename || '.' || policyname || ' [' || cmd || '] roles=' || array_to_string(roles,',') || E'\n' || coalesce(qual, '(no qual)')
from pg_policies
where schemaname='public'
  and policyname in ('objectives_read','key_results_read','kr_assignments_read','kr_progress_updates_read','objective_owners_read')
order by policyname;

select '=== FUNCTION ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || E'\n' || pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'
  and p.proname in ('is_objective_kr_assignee','can_hr_read_objective','is_kr_assignee','can_read_business_subject','can_review_daily_report_block','can_read_kr_assignment')
order by p.proname;

select '=== FUNC PRIV ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') authenticated_execute=' ||
       has_function_privilege('authenticated', p.oid, 'execute')::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'
  and p.proname in ('is_objective_kr_assignee','can_hr_read_objective','is_kr_assignee','can_read_business_subject','can_review_daily_report_block','can_read_kr_assignment','current_organization_id','has_role','has_clearance')
order by 1;

select '=== TABLE GRANT ' || table_name || ' ' || grantee || ' ' || string_agg(distinct privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public'
  and grantee='authenticated'
  and table_name in ('objectives','key_results','kr_assignments','kr_progress_updates','objective_owners')
group by table_name, grantee
order by 1;

select '=== TAIL FUNCTION ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') authenticated_execute=' ||
       has_function_privilege('authenticated', p.oid, 'execute')::text || E'\n' || md5(pg_get_functiondef(p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('list_organization_users','get_hr_work_hours','create_objective','update_objective')
order by 1;

select '=== OVERLOAD COUNT ' || p.proname || ' = ' || count(*)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_objective','update_objective')
group by p.proname order by 1;
