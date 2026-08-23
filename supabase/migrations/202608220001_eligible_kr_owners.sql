create or replace function public.list_eligible_kr_owners(p_objective_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org uuid := private.current_organization_id();
  result jsonb;
begin
  if caller_org is null or not exists (
    select 1
    from public.objectives o
    join public.projects pr on pr.id = o.project_id and pr.organization_id = o.organization_id
    where o.id = p_objective_id
      and o.organization_id = caller_org
      and o.owner_id = auth.uid()
      and private.has_role('project_leader')
  ) then
    raise exception 'Objective is not available for KR assignment' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(candidate order by candidate->>'display_name'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'email', coalesce(p.email, ''),
      'department', coalesce(p.department, ''),
      'job_title', coalesce(p.job_title, ''),
      'is_active', p.is_active,
      'approval_status', p.approval_status,
      'created_at', p.created_at,
      'preferred_locale', p.preferred_locale,
      'organizations', jsonb_build_object('name', org.name),
      'user_roles', jsonb_build_array(jsonb_build_object('role', ur.role)),
      'project_members', coalesce((
        select jsonb_agg(jsonb_build_object('project_id', pm.project_id))
        from public.project_members pm
        where pm.organization_id = caller_org and pm.profile_id = p.id
      ), '[]'::jsonb)
    ) candidate
    from public.profiles p
    join public.organizations org on org.id = p.organization_id
    join public.user_roles ur on ur.profile_id = p.id and ur.organization_id = p.organization_id
    where p.organization_id = caller_org
      and p.is_active
      and p.approval_status = 'approved'
      and ur.is_active
      and ur.role in ('project_leader'::public.app_role, 'employee'::public.app_role)
  ) eligible;
  return result;
end;
$$;

revoke all on function public.list_eligible_kr_owners(uuid) from public, anon;
grant execute on function public.list_eligible_kr_owners(uuid) to authenticated;
