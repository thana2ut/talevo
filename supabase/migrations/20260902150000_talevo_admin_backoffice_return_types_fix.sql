-- TALEVO Admin Back Office corrective migration.
-- Fixes PostgreSQL 42804 caused by auth.users.email (character varying)
-- being returned from RPCs that declare the email column as text.
-- Additive only: review and run manually after 20260902140000.

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
    auth_user.id::uuid,
    coalesce(profile_row.display_name, '')::text,
    coalesce(auth_user.email, '')::text,
    coalesce(profile_row.university, '')::text,
    coalesce(profile_row.major, '')::text,
    coalesce(term_row.level, '')::text,
    coalesce(term_row.term, '')::text,
    coalesce(term_row.academic_year, '')::text,
    auth_user.created_at::timestamptz,
    auth_user.email_confirmed_at::timestamptz,
    auth_user.last_sign_in_at::timestamptz,
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
    auth_user.id::uuid,
    coalesce(profile_row.display_name, '')::text,
    coalesce(auth_user.email, '')::text,
    coalesce(profile_row.university, '')::text,
    coalesce(profile_row.major, '')::text,
    coalesce(term_row.level, '')::text,
    coalesce(term_row.term, '')::text,
    coalesce(term_row.academic_year, '')::text,
    auth_user.created_at::timestamptz,
    auth_user.email_confirmed_at::timestamptz,
    auth_user.last_sign_in_at::timestamptz
  from auth.users as auth_user
  left join public.profiles as profile_row on profile_row.user_id = auth_user.id
  left join public.academic_terms as term_row on term_row.user_id = auth_user.id
  where auth_user.id = target_user_id;
end
$$;

revoke all on function public.list_talevo_admin_users(text, integer, integer) from public;
revoke all on function public.list_talevo_admin_users(text, integer, integer) from anon;
revoke all on function public.get_talevo_admin_user(uuid) from public;
revoke all on function public.get_talevo_admin_user(uuid) from anon;

grant execute on function public.list_talevo_admin_users(text, integer, integer) to authenticated;
grant execute on function public.get_talevo_admin_user(uuid) to authenticated;
