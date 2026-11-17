-- Owner approved reviewed SQL on 2026-11-17. No user rows are deleted.
create or replace function public.is_support_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.support_admins where user_id = (select auth.uid()))
    and (
      (select auth.jwt()->>'aal') = 'aal2'
      or not exists(select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified')
    )
$$;
revoke all on function public.is_support_admin() from public, anon;
grant execute on function public.is_support_admin() to authenticated;

create or replace function private.is_talevo_admin(candidate_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select candidate_user_id is not null
    and candidate_user_id = (select auth.uid())
    and exists(select 1 from private.talevo_admin_users a where a.user_id = candidate_user_id)
    and (
      (select auth.jwt()->>'aal') = 'aal2'
      or not exists(select 1 from auth.mfa_factors f
        where f.user_id = candidate_user_id and f.status = 'verified')
    )
$$;
revoke all on function private.is_talevo_admin(uuid) from public, anon, authenticated;
