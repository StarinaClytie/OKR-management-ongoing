create extension if not exists pgcrypto;

create type public.app_role as enum (
  'administrator', 'management', 'project_leader', 'employee', 'hr'
);

create type public.classification as enum (
  'public', 'internal', 'confidential', 'restricted'
);

create type public.report_status as enum (
  'draft', 'submitted', 'returned', 'confirmed'
);

create type public.kr_measurement_type as enum (
  'percentage', 'number', 'currency', 'boolean'
);

create type public.risk_level as enum (
  'low', 'medium', 'high', 'critical'
);

create type public.attachment_state as enum (
  'pending', 'uploaded', 'replaced', 'deleted', 'failed'
);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create function public.reject_daily_report_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  raise exception 'Daily report revisions are immutable';
end;
$$;

create function public.assert_daily_report_revision_pointer()
returns trigger
language plpgsql
as $$
declare
  checked_report_id uuid;
  stored_revision integer;
  latest_revision integer;
begin
  if tg_table_name = 'daily_reports' then
    checked_report_id = new.id;
  elsif tg_op = 'DELETE' then
    checked_report_id = old.report_id;
  else
    checked_report_id = new.report_id;
  end if;

  select current_revision into stored_revision
  from public.daily_reports
  where id = checked_report_id;

  if not found then
    return null;
  end if;

  select coalesce(max(revision_number), 0) into latest_revision
  from public.daily_report_revisions
  where report_id = checked_report_id;

  if stored_revision <> latest_revision then
    raise exception 'Daily report current revision must match its latest revision'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add constraint profiles_organization_id_id_key unique (organization_id, id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, profile_id)
);

create table public.reporting_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  subordinate_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (manager_id <> subordinate_id),
  unique (organization_id, manager_id, subordinate_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  leader_id uuid not null references public.profiles(id) on delete restrict,
  classification public.classification not null default 'internal',
  start_date date not null,
  due_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (due_date >= start_date)
);

alter table public.projects add constraint projects_organization_id_id_key unique (organization_id, id);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, profile_id)
);

create table public.collaboration_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  grantor_id uuid not null references public.profiles(id) on delete restrict,
  grantee_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (grantor_id <> grantee_id)
);

create table public.objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  classification public.classification not null default 'internal',
  start_date date not null,
  due_date date not null,
  progress numeric(5, 2) not null default 0 constraint objectives_progress_in_range check (progress between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (due_date >= start_date)
);

alter table public.objectives add constraint objectives_organization_id_id_key unique (organization_id, id);

create table public.key_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  measurement_type public.kr_measurement_type not null,
  target_value numeric,
  current_value numeric,
  progress numeric(5, 2) not null default 0 constraint key_results_progress_in_range check (progress between 0 and 100),
  classification public.classification not null default 'internal',
  start_date date not null,
  due_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (due_date >= start_date)
);

alter table public.key_results add constraint key_results_organization_id_id_key unique (organization_id, id);

create table public.progress_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key_result_id uuid not null references public.key_results(id) on delete cascade,
  planned_for date not null,
  planned_value numeric(5, 2) not null constraint progress_baselines_value_in_range check (planned_value between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (key_result_id, planned_for)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  key_result_id uuid references public.key_results(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  planned_date date not null,
  actual_date date,
  is_complete boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  mitigation text not null check (length(trim(mitigation)) > 0),
  probability smallint not null constraint risks_probability_in_range check (probability between 1 and 3),
  impact smallint not null constraint risks_impact_in_range check (impact between 1 and 3),
  level public.risk_level not null,
  classification public.classification not null default 'internal',
  last_reviewed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  objective_id uuid not null references public.objectives(id) on delete restrict,
  report_date date not null,
  status public.report_status not null default 'draft',
  classification public.classification not null default 'internal',
  total_hours numeric(5, 2) not null default 0 check (total_hours between 0 and 24),
  current_revision integer not null default 0 check (current_revision >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, author_id, report_date)
);

alter table public.daily_reports add constraint daily_reports_organization_id_id_key unique (organization_id, id);

create table public.daily_report_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  editor_id uuid not null references public.profiles(id) on delete restrict,
  daily_objective text not null check (length(trim(daily_objective)) > 0),
  objective_progress numeric(5, 2) not null constraint daily_report_revisions_objective_progress_in_range check (objective_progress between 0 and 100),
  classification public.classification not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, revision_number)
);

alter table public.daily_report_revisions add constraint daily_report_revisions_organization_id_id_key unique (organization_id, id);
alter table public.daily_report_revisions add constraint daily_report_revisions_organization_report_id_id_key unique (organization_id, report_id, id);

create table public.daily_report_revision_krs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision_id uuid not null references public.daily_report_revisions(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null check (length(trim(title)) > 0),
  measurement_type public.kr_measurement_type not null,
  progress numeric(5, 2) not null constraint daily_report_revision_krs_progress_in_range check (progress between 0 and 100),
  hours numeric(5, 2) not null check (hours between 0 and 24),
  work_note text not null default '',
  linked_key_result_id uuid references public.key_results(id) on delete set null,
  measurement_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (revision_id, position)
);

alter table public.daily_report_revision_krs add constraint daily_report_revision_krs_organization_id_id_key unique (organization_id, id);
alter table public.daily_report_revision_krs add constraint daily_report_revision_krs_organization_revision_id_id_key unique (organization_id, revision_id, id);

create table public.daily_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_id uuid not null references public.daily_report_revisions(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  progress numeric(5, 2) not null constraint daily_objectives_progress_in_range check (progress between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (report_id, revision_id)
);

create table public.daily_key_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_id uuid not null references public.daily_report_revisions(id) on delete cascade,
  revision_kr_id uuid not null references public.daily_report_revision_krs(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (report_id, revision_kr_id)
);

create table public.report_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_id uuid not null references public.daily_report_revisions(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  label text not null check (length(trim(label)) > 0),
  classification public.classification not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_id uuid references public.daily_report_revisions(id) on delete set null,
  uploader_id uuid not null references public.profiles(id) on delete restrict,
  original_name text not null check (length(trim(original_name)) > 0),
  storage_path text not null check (length(trim(storage_path)) > 0),
  mime_type text not null check (length(trim(mime_type)) > 0),
  byte_size integer not null constraint report_attachments_byte_size_in_range check (byte_size between 1 and 10485760),
  checksum text,
  classification public.classification not null,
  state public.attachment_state not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (storage_path)
);

alter table public.user_roles
  add constraint user_roles_organization_profile_fkey
  foreign key (organization_id, profile_id) references public.profiles (organization_id, id);

alter table public.reporting_lines
  add constraint reporting_lines_organization_manager_fkey
  foreign key (organization_id, manager_id) references public.profiles (organization_id, id),
  add constraint reporting_lines_organization_subordinate_fkey
  foreign key (organization_id, subordinate_id) references public.profiles (organization_id, id);

alter table public.projects
  add constraint projects_organization_leader_fkey
  foreign key (organization_id, leader_id) references public.profiles (organization_id, id);

alter table public.project_members
  add constraint project_members_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  add constraint project_members_organization_profile_fkey
  foreign key (organization_id, profile_id) references public.profiles (organization_id, id);

alter table public.collaboration_links
  add constraint collaboration_links_organization_grantor_fkey
  foreign key (organization_id, grantor_id) references public.profiles (organization_id, id),
  add constraint collaboration_links_organization_grantee_fkey
  foreign key (organization_id, grantee_id) references public.profiles (organization_id, id),
  add constraint collaboration_links_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id);

alter table public.objectives
  add constraint objectives_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  add constraint objectives_organization_owner_fkey
  foreign key (organization_id, owner_id) references public.profiles (organization_id, id);

alter table public.key_results
  add constraint key_results_organization_objective_fkey
  foreign key (organization_id, objective_id) references public.objectives (organization_id, id),
  add constraint key_results_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  add constraint key_results_organization_owner_fkey
  foreign key (organization_id, owner_id) references public.profiles (organization_id, id);

alter table public.progress_baselines
  add constraint progress_baselines_organization_key_result_fkey
  foreign key (organization_id, key_result_id) references public.key_results (organization_id, id);

alter table public.milestones
  add constraint milestones_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  add constraint milestones_organization_key_result_fkey
  foreign key (organization_id, key_result_id) references public.key_results (organization_id, id);

alter table public.risks
  add constraint risks_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  add constraint risks_organization_owner_fkey
  foreign key (organization_id, owner_id) references public.profiles (organization_id, id);

alter table public.daily_reports
  add constraint daily_reports_organization_author_fkey
  foreign key (organization_id, author_id) references public.profiles (organization_id, id),
  add constraint daily_reports_organization_project_fkey
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  add constraint daily_reports_organization_objective_fkey
  foreign key (organization_id, objective_id) references public.objectives (organization_id, id);

alter table public.daily_report_revisions
  add constraint daily_report_revisions_organization_report_fkey
  foreign key (organization_id, report_id) references public.daily_reports (organization_id, id),
  add constraint daily_report_revisions_organization_editor_fkey
  foreign key (organization_id, editor_id) references public.profiles (organization_id, id);

alter table public.daily_report_revision_krs
  add constraint daily_report_revision_krs_organization_revision_fkey
  foreign key (organization_id, revision_id) references public.daily_report_revisions (organization_id, id),
  add constraint daily_report_revision_krs_organization_linked_key_result_fkey
  foreign key (organization_id, linked_key_result_id) references public.key_results (organization_id, id);

alter table public.daily_objectives
  add constraint daily_objectives_organization_report_revision_fkey
  foreign key (organization_id, report_id, revision_id) references public.daily_report_revisions (organization_id, report_id, id);

alter table public.daily_key_results
  add constraint daily_key_results_organization_report_revision_fkey
  foreign key (organization_id, report_id, revision_id) references public.daily_report_revisions (organization_id, report_id, id),
  add constraint daily_key_results_organization_revision_kr_fkey
  foreign key (organization_id, revision_id, revision_kr_id) references public.daily_report_revision_krs (organization_id, revision_id, id);

alter table public.report_evidence_links
  add constraint report_evidence_links_organization_report_revision_fkey
  foreign key (organization_id, report_id, revision_id) references public.daily_report_revisions (organization_id, report_id, id);

alter table public.report_attachments
  add constraint report_attachments_organization_report_fkey
  foreign key (organization_id, report_id) references public.daily_reports (organization_id, id),
  add constraint report_attachments_organization_uploader_fkey
  foreign key (organization_id, uploader_id) references public.profiles (organization_id, id),
  add constraint report_attachments_organization_report_revision_fkey
  foreign key (organization_id, report_id, revision_id) references public.daily_report_revisions (organization_id, report_id, id);

create trigger set_organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger set_user_roles_updated_at before update on public.user_roles
for each row execute function public.set_updated_at();
create trigger set_reporting_lines_updated_at before update on public.reporting_lines
for each row execute function public.set_updated_at();
create trigger set_projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger set_project_members_updated_at before update on public.project_members
for each row execute function public.set_updated_at();
create trigger set_collaboration_links_updated_at before update on public.collaboration_links
for each row execute function public.set_updated_at();
create trigger set_objectives_updated_at before update on public.objectives
for each row execute function public.set_updated_at();
create trigger set_key_results_updated_at before update on public.key_results
for each row execute function public.set_updated_at();
create trigger set_progress_baselines_updated_at before update on public.progress_baselines
for each row execute function public.set_updated_at();
create trigger set_milestones_updated_at before update on public.milestones
for each row execute function public.set_updated_at();
create trigger set_risks_updated_at before update on public.risks
for each row execute function public.set_updated_at();
create trigger set_daily_reports_updated_at before update on public.daily_reports
for each row execute function public.set_updated_at();
create trigger set_daily_objectives_updated_at before update on public.daily_objectives
for each row execute function public.set_updated_at();
create trigger set_daily_key_results_updated_at before update on public.daily_key_results
for each row execute function public.set_updated_at();
create trigger set_report_evidence_links_updated_at before update on public.report_evidence_links
for each row execute function public.set_updated_at();
create trigger set_report_attachments_updated_at before update on public.report_attachments
for each row execute function public.set_updated_at();

create trigger prevent_daily_report_revision_mutation
before update or delete on public.daily_report_revisions
for each row execute function public.reject_daily_report_revision_mutation();

create trigger prevent_daily_report_revision_kr_mutation
before update or delete on public.daily_report_revision_krs
for each row execute function public.reject_daily_report_revision_mutation();

create constraint trigger enforce_daily_report_current_revision
after insert or update of current_revision on public.daily_reports
deferrable initially deferred
for each row execute function public.assert_daily_report_revision_pointer();

create constraint trigger enforce_daily_report_revision_pointer
after insert or update or delete on public.daily_report_revisions
deferrable initially deferred
for each row execute function public.assert_daily_report_revision_pointer();
