-- Additive security setup for TALEVO. Review before running in Supabase SQL Editor.
-- Creates a private, bounded request limiter. Does not touch existing user rows.
begin;
create schema if not exists private;

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
      'retry_after', greatest(1, pg_catalog.ceil(extract(epoch from saved.window_started_at + interval '1 minute' - now_at)))
    );
  end if;
  return pg_catalog.jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function public.consume_talevo_api_limit(text) from public, anon;
grant execute on function public.consume_talevo_api_limit(text) to authenticated;


commit;
