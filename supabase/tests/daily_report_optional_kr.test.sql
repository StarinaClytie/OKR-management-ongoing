begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  to_regprocedure('public.save_daily_report(date,public.report_status,public.classification,jsonb,uuid,jsonb)') is not null,
  'session-aware daily report save RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.save_daily_report(date,public.report_status,public.classification,jsonb,uuid,jsonb)', 'EXECUTE'),
  'authenticated authors may use only the upload-session save RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.save_daily_report(date,public.report_status,public.classification,jsonb,jsonb)', 'EXECUTE'),
  'legacy save RPC remains unavailable to browser clients'
);
select col_is_null(
  'public', 'daily_okr_blocks', 'linked_key_result_id',
  'KR linkage remains optional on each Daily OKR block'
);
select col_is_null(
  'public', 'daily_okr_blocks', 'project_id',
  'project attribution stays nullable for immutable historical rows'
);

select * from finish();
rollback;
