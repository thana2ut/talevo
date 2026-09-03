-- TALEVO Admin Back Office authorization and privacy-minimized directory RPCs.
-- Additive migration. Review and run manually after all earlier migrations.
-- This migration creates no administrator membership rows.

create table if not exists private.talevo_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.talevo_admin_users enable row level security;
alter table private.talevo_admin_users force row level security;
revoke all on table private.talevo_admin_users from public;
revoke all on table private.talevo_admin_users from anon;
revoke all on table private.talevo_admin_users from authenticated;

create or replace function private.is_talevo_admin(candidate_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_user_id is not null
    and exists (
      select 1
      from private.talevo_admin_users as admin_membership
      where admin_membership.user_id = candidate_user_id
    )
$$;

revoke all on function private.is_talevo_admin(uuid) from public;
revoke all on function private.is_talevo_admin(uuid) from anon;
revoke all on function private.is_talevo_admin(uuid) from authenticated;

create or replace function public.get_talevo_admin_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_talevo_admin((select auth.uid()))
$$;

create or replace function public.get_talevo_admin_summary()
returns table (
  total_users bigint,
  new_users_today bigint,
  new_users_last_7_days bigint,
  recently_active_users bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
begin
  if not private.is_talevo_admin(request_user_id) then
    raise exception using errcode = '42501', message = 'talevo_admin_access_denied';
  end if;

  return query
  select
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where auth_user.created_at >= pg_catalog.date_trunc('day', pg_catalog.now()))::bigint,
    pg_catalog.count(*) filter (where auth_user.created_at >= pg_catalog.now() - interval '7 days')::bigint,
    pg_catalog.count(*) filter (where auth_user.last_sign_in_at >= pg_catalog.now() - interval '30 days')::bigint
  from auth.users as auth_user;
end
$$;

create or replace function public.list_talevo_admin_users(
  search_text text default '',
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  university text,
  major text,
  level text,
  term text,
  academic_year text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
  safe_search text := left(btrim(coalesce(search_text, '')), 120);
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_page_size integer := least(greatest(coalesce(page_size, 20), 1), 100);
begin
  if not private.is_talevo_admin(request_user_id) then
    raise exception using errcode = '42501', message = 'talevo_admin_access_denied';
  end if;

  return query
  select
    auth_user.id,
    coalesce(profile_row.display_name, ''),
    coalesce(auth_user.email, ''),
    coalesce(profile_row.university, ''),
    coalesce(profile_row.major, ''),
    coalesce(term_row.level, ''),
    coalesce(term_row.term, ''),
    coalesce(term_row.academic_year, ''),
    auth_user.created_at,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at,
    pg_catalog.count(*) over ()::bigint
  from auth.users as auth_user
  left join public.profiles as profile_row on profile_row.user_id = auth_user.id
  left join public.academic_terms as term_row on term_row.user_id = auth_user.id
  where safe_search = ''
     or coalesce(profile_row.display_name, '') ilike '%' || safe_search || '%'
     or coalesce(auth_user.email, '') ilike '%' || safe_search || '%'
     or coalesce(profile_row.university, '') ilike '%' || safe_search || '%'
     or coalesce(profile_row.major, '') ilike '%' || safe_search || '%'
  order by auth_user.created_at desc, auth_user.id
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end
$$;

create or replace function public.get_talevo_admin_user(target_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  university text,
  major text,
  level text,
  term text,
  academic_year text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
begin
  if not private.is_talevo_admin(request_user_id) then
    raise exception using errcode = '42501', message = 'talevo_admin_access_denied';
  end if;

  return query
  select
    auth_user.id,
    coalesce(profile_row.display_name, ''),
    coalesce(auth_user.email, ''),
    coalesce(profile_row.university, ''),
    coalesce(profile_row.major, ''),
    coalesce(term_row.level, ''),
    coalesce(term_row.term, ''),
    coalesce(term_row.academic_year, ''),
    auth_user.created_at,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at
  from auth.users as auth_user
  left join public.profiles as profile_row on profile_row.user_id = auth_user.id
  left join public.academic_terms as term_row on term_row.user_id = auth_user.id
  where auth_user.id = target_user_id;
end
$$;

revoke all on function public.get_talevo_admin_access() from public;
revoke all on function public.get_talevo_admin_access() from anon;
revoke all on function public.get_talevo_admin_summary() from public;
revoke all on function public.get_talevo_admin_summary() from anon;
revoke all on function public.list_talevo_admin_users(text, integer, integer) from public;
revoke all on function public.list_talevo_admin_users(text, integer, integer) from anon;
revoke all on function public.get_talevo_admin_user(uuid) from public;
revoke all on function public.get_talevo_admin_user(uuid) from anon;

grant execute on function public.get_talevo_admin_access() to authenticated;
grant execute on function public.get_talevo_admin_summary() to authenticated;
grant execute on function public.list_talevo_admin_users(text, integer, integer) to authenticated;
grant execute on function public.get_talevo_admin_user(uuid) to authenticated;
