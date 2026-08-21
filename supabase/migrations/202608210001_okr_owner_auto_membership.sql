-- KR owners are selected from all approved, active employees/project leaders in
-- the organization. Project membership is a derived relationship and is
-- created atomically before the OWNER assignment is stored.

create or replace function private.is_eligible_kr_owner(
  target_profile_id uuid,
  target_org uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_project_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = target_profile_id
        and p.organization_id = target_org
        and p.is_active
        and p.approval_status = 'approved'
        and exists (
          select 1
          from public.user_roles ur
          where ur.profile_id = target_profile_id
            and ur.organization_id = target_org
            and ur.role in ('project_leader'::public.app_role, 'employee'::public.app_role)
            and ur.is_active
        )
    )
$$;

revoke all on function private.is_eligible_kr_owner(uuid, uuid, uuid) from public, anon;

create or replace function private.ensure_kr_owner_project_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  target_organization_id uuid;
begin
  select kr.project_id, kr.organization_id
  into target_project_id, target_organization_id
  from public.key_results kr
  where kr.id = new.kr_id;

  if target_project_id is null
    or target_organization_id is null
    or target_organization_id <> new.organization_id then
    raise exception 'Key Result assignment target is invalid' using errcode = '22023';
  end if;

  if not private.is_eligible_kr_owner(new.profile_id, target_organization_id, target_project_id) then
    raise exception 'Key Result owner is not an eligible organization member' using errcode = '22023';
  end if;

  insert into public.project_members (organization_id, project_id, profile_id)
  values (target_organization_id, target_project_id, new.profile_id)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.ensure_kr_owner_project_membership() from public, anon, authenticated;

drop trigger if exists ensure_kr_owner_project_membership on public.kr_assignments;
create trigger ensure_kr_owner_project_membership
before insert on public.kr_assignments
for each row
when (new.assignment_role = 'owner')
execute function private.ensure_kr_owner_project_membership();
