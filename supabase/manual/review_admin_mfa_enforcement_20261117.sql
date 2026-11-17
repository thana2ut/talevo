-- REVIEW ONLY. Apply only after the owner approves and the MFA setup page is
-- deployed on every active host. No user records or MFA factors are changed.
-- Existing admin memberships remain. Once an admin enrolls a verified factor,
-- aal1 sessions can no longer use admin RPCs or support table policies.
-- Unenrolled admins retain the ability to enroll; this is not an enrollment
-- mandate. After enrolling, new password sessions must verify a second factor.
-- The support and legacy admin groups are distinct; protect both.
begin;
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
commit;

-- Read-only inspection; do not print MFA secrets or JWTs.
select p.proname, p.prosecdef, p.proconfig from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname='is_support_admin')
   or (n.nspname='private' and p.proname='is_talevo_admin');
