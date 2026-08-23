begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'author@attachment-revisions.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'reader@attachment-revisions.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.organizations (id, name) values ('82000000-0000-0000-0000-000000000001', 'Attachment Revision Organization');
insert into public.profiles (id, organization_id, display_name, clearance, approval_status)
values
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'Author', 'confidential', 'approved'),
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 'Reader', 'internal', 'approved');
insert into public.user_roles (organization_id, profile_id, role)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'employee'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'management');
insert into public.projects (id, organization_id, name, leader_id, classification, start_date, due_date)
values ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'Project', '81000000-0000-0000-0000-000000000001', 'internal', current_date, current_date + 7);
insert into public.objectives (id, organization_id, project_id, owner_id, title, classification, start_date, due_date)
values ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Objective', 'internal', current_date, current_date + 7);
insert into public.key_results (id, organization_id, objective_id, project_id, owner_id, title, measurement_type, target_value, classification, start_date, due_date)
values ('85000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'KR', 'percentage', 100, 'internal', current_date, current_date + 7);
insert into public.kr_assignments (organization_id, kr_id, profile_id, assignment_role)
values ('82000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.begin_daily_report_with_attachments(current_date, 'submitted', 'internal')$$,
  'author creates the report shell before uploading evidence'
);
select lives_ok(
  $$select public.begin_entry_attachment_upload((select id from public.daily_reports where report_date = current_date), 1, 'retain.pdf', 'application/pdf', 128, 'internal', 'Retain old label')$$,
  'author uploads evidence that will be retained'
);
select lives_ok(
  $$select public.begin_entry_attachment_upload((select id from public.daily_reports where report_date = current_date), 1, 'remove.pdf', 'application/pdf', 128, 'internal', 'Remove old label')$$,
  'author uploads evidence that will later be removed'
);
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'report-attachments', storage_path, auth.uid()::text, jsonb_build_object('mimetype', mime_type, 'size', byte_size)
from public.report_attachments where state = 'pending';
select public.finalize_attachment_upload(id, 'sha256:first')
from public.report_attachments where state = 'pending';

select lives_ok(
  $$select * from public.save_daily_report(
    current_date, 'submitted', 'internal',
    '[{"dailyObjective":"Revision one","linkedKeyResultId":"85000000-0000-0000-0000-000000000001","workDescription":"First work","hours":2,"result":"First result","evidenceLinks":[],"attachments":[]}]'::jsonb,
    '[]'::jsonb
  )$$,
  'first submission creates revision-scoped associations for new uploads'
);
select is((select count(*) from public.report_attachment_revisions), 2::bigint, 'revision one retains both attachment associations');

select public.soft_delete_attachment((select id from public.report_attachments where original_name = 'remove.pdf'));
select lives_ok(
  $$select * from public.save_daily_report(
    current_date, 'submitted', 'internal',
    jsonb_build_array(jsonb_build_object(
      'dailyObjective', 'Revision two',
      'linkedKeyResultId', '85000000-0000-0000-0000-000000000001',
      'workDescription', 'Second work',
      'hours', 3,
      'result', 'Second result',
      'evidenceLinks', '[]'::jsonb,
      'attachments', jsonb_build_array(jsonb_build_object(
        'attachmentId', (select id from public.report_attachments where original_name = 'retain.pdf'),
        'displayName', 'Retained new label',
        'classification', 'confidential'
      ))
    )),
    '[]'::jsonb
  )$$,
  'second submission carries retained evidence metadata into its new revision'
);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.report_attachment_revisions), 0::bigint, 'a reader below the retained evidence classification cannot read association metadata');
select throws_ok(
  $$select public.create_attachment_download((select id from public.report_attachments where original_name = 'retain.pdf'))$$,
  '42501', 'Attachment is not available',
  'a reader below the retained evidence classification cannot authorize a download'
);
set local role postgres;
select is((select current_revision from public.daily_reports where report_date = current_date), 2, 'two submissions advance the current revision twice');
select is((select count(*) from public.daily_okr_blocks where report_id = (select id from public.daily_reports where report_date = current_date)), 2::bigint, 'both immutable block revisions remain stored');
select is((select count(*) from public.report_attachment_revisions), 3::bigint, 'revision two adds only the retained association without duplicating revision one');
select is(
  (select display_name from public.report_attachment_revisions rar join public.daily_report_revisions rr on rr.id = rar.revision_id where rr.revision_number = 2),
  'Retained new label',
  'revision two stores the edited evidence label'
);
select is(
  (select rar.classification::text from public.report_attachment_revisions rar join public.daily_report_revisions rr on rr.id = rar.revision_id where rr.revision_number = 2),
  'confidential',
  'revision two stores the edited evidence classification'
);
select is(
  (select count(*) from public.report_attachment_revisions rar join public.daily_report_revisions rr on rr.id = rar.revision_id join public.report_attachments a on a.id = rar.attachment_id where rr.revision_number = 2 and a.original_name = 'remove.pdf'),
  0::bigint,
  'removed evidence is not resurrected in revision two'
);
select throws_ok(
  $$update public.report_attachment_revisions set display_name = 'mutated history' where display_name = 'Retain old label'$$,
  'Daily report revisions are immutable',
  'revision-scoped attachment history cannot be mutated'
);

select * from finish();
rollback;
