-- Additive security setup for TALEVO. Review before running in Supabase SQL Editor.
-- Creates a private, bounded request limiter. Does not touch existing user rows.
begin;

create table if not exists private.talevo_api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('read','write','sensitive','ai')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  primary key (user_id, scope)
);

alter table private.talevo_api_rate_limits enable row level security;
alter table private.talevo_api_rate_limits force row level security;
revoke all on table private.talevo_api_rate_limits from public, anon, authenticated;

create or replace function public.consume_talevo_api_limit(p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  now_at timestamptz := pg_catalog.clock_timestamp();
  max_requests integer;
  saved private.talevo_api_rate_limits%rowtype;
begin
  if owner_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  max_requests := case p_scope
    when 'read' then 180
    when 'write' then 60
    when 'sensitive' then 5
    when 'ai' then 30
    else null
  end;
  if max_requests is null then
    raise exception using errcode = '22023', message = 'invalid_scope';
  end if;

  insert into private.talevo_api_rate_limits(user_id, scope, window_started_at, request_count)
  values (owner_id, p_scope, now_at, 1)
  on conflict (user_id, scope) do update
  set window_started_at = case
        when private.talevo_api_rate_limits.window_started_at <= now_at - interval '1 minute' then now_at
        else private.talevo_api_rate_limits.window_started_at
      end,
      request_count = case
        when private.talevo_api_rate_limits.window_started_at <= now_at - interval '1 minute' then 1
        else private.talevo_api_rate_limits.request_count + 1
      end
  returning * into saved;

  if saved.request_count > max_requests then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retry_after', pg_catalog.greatest(1, pg_catalog.ceil(pg_catalog.extract(epoch from saved.window_started_at + interval '1 minute' - now_at)))
    );
  end if;
  return pg_catalog.jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function public.consume_talevo_api_limit(text) from public, anon;
grant execute on function public.consume_talevo_api_limit(text) to authenticated;

-- Repair the public developer avatar policy from manual/review_developer_avatar_20261115.sql.
-- Public read stays available to signed-in clients; only configured support admins can write.
drop policy if exists developer_read on public.developer_profile;
create policy developer_read on public.developer_profile
  for select to authenticated using ((select auth.uid()) is not null);

-- The old table has a public boolean primary key. Replace with an owner key
-- while preserving the existing single avatar row and its value.
alter table public.developer_profile add column if not exists owner_id uuid references auth.users(id) on delete cascade;
update public.developer_profile d
set owner_id = a.user_id
from public.support_admins a
where d.owner_id is null;
drop policy if exists developer_insert on public.developer_profile;
drop policy if exists developer_update on public.developer_profile;
create policy developer_insert on public.developer_profile for insert to authenticated
  with check ((select public.is_support_admin()) and owner_id = (select auth.uid()));
create policy developer_update on public.developer_profile for update to authenticated
  using ((select public.is_support_admin()) and owner_id = (select auth.uid()))
  with check ((select public.is_support_admin()) and owner_id = (select auth.uid()));

-- Inventory verification (must return zero rows):
select n.nspname, c.relname
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Owner policy audit for all existing public tables (review named exceptions separately):
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Storage bucket policy inventory:
select policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- Limiter configuration check (returns true for authenticated test accounts after deploy):
select p.proname, p.prosecdef, p.proconfig, p.proacl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'consume_talevo_api_limit';

-- Verify every user data table has RLS (must return zero rows):
select c.relname
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

commit;
