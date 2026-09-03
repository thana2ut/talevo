-- TALEVO AI Phase 1: privacy-minimized, per-user Free Tier rate limiting.
-- Additive migration. Review and run manually after all earlier migrations.
-- This table stores counters and a short request lease only; it never stores prompts or responses.

create schema if not exists private;

create table if not exists private.talevo_ai_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  short_window_started_at timestamptz not null default pg_catalog.now(),
  short_window_request_count integer not null default 0 check (short_window_request_count >= 0),
  daily_window_started_at date not null default ((pg_catalog.now() at time zone 'UTC')::date),
  daily_request_count integer not null default 0 check (daily_request_count >= 0),
  active_request_id uuid,
  active_request_expires_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check ((active_request_id is null) = (active_request_expires_at is null))
);

alter table private.talevo_ai_rate_limits enable row level security;
alter table private.talevo_ai_rate_limits force row level security;
revoke all on table private.talevo_ai_rate_limits from public;
revoke all on table private.talevo_ai_rate_limits from anon;
revoke all on table private.talevo_ai_rate_limits from authenticated;

create or replace function public.begin_talevo_ai_request()
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer,
  request_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
  request_now timestamptz := pg_catalog.now();
  request_utc_date date := (pg_catalog.now() at time zone 'UTC')::date;
  rate_row private.talevo_ai_rate_limits%rowtype;
  new_request_id uuid;
  calculated_retry_seconds integer;
begin
  if request_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into private.talevo_ai_rate_limits (user_id)
  values (request_user_id)
  on conflict (user_id) do nothing;

  select limits.*
  into rate_row
  from private.talevo_ai_rate_limits as limits
  where limits.user_id = request_user_id
  for update;

  if rate_row.short_window_started_at <= request_now - pg_catalog.make_interval(secs => 60) then
    rate_row.short_window_started_at := request_now;
    rate_row.short_window_request_count := 0;
  end if;

  if rate_row.daily_window_started_at <> request_utc_date then
    rate_row.daily_window_started_at := request_utc_date;
    rate_row.daily_request_count := 0;
  end if;

  if rate_row.active_request_id is not null and rate_row.active_request_expires_at > request_now then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch', rate_row.active_request_expires_at - request_now))::integer
    );
    return query select false, 'concurrent'::text, calculated_retry_seconds, null::uuid;
    return;
  end if;

  if rate_row.short_window_request_count >= 4 then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch',
        rate_row.short_window_started_at + pg_catalog.make_interval(secs => 60) - request_now
      ))::integer
    );
    return query select false, 'short_window'::text, calculated_retry_seconds, null::uuid;
    return;
  end if;

  if rate_row.daily_request_count >= 40 then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch',
        ((request_utc_date + 1)::timestamp at time zone 'UTC') - request_now
      ))::integer
    );
    return query select false, 'daily'::text, calculated_retry_seconds, null::uuid;
    return;
  end if;

  new_request_id := pg_catalog.gen_random_uuid();
  update private.talevo_ai_rate_limits as limits
  set short_window_started_at = rate_row.short_window_started_at,
      short_window_request_count = rate_row.short_window_request_count + 1,
      daily_window_started_at = rate_row.daily_window_started_at,
      daily_request_count = rate_row.daily_request_count + 1,
      active_request_id = new_request_id,
      active_request_expires_at = request_now + pg_catalog.make_interval(secs => 40),
      updated_at = request_now
  where limits.user_id = request_user_id;

  return query select true, 'allowed'::text, 0, new_request_id;
end;
$$;

create or replace function public.finish_talevo_ai_request(completed_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if request_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update private.talevo_ai_rate_limits as limits
  set active_request_id = null,
      active_request_expires_at = null,
      updated_at = pg_catalog.now()
  where limits.user_id = request_user_id
    and limits.active_request_id = completed_request_id;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.begin_talevo_ai_request() from public;
revoke all on function public.begin_talevo_ai_request() from anon;
revoke all on function public.finish_talevo_ai_request(uuid) from public;
revoke all on function public.finish_talevo_ai_request(uuid) from anon;
grant execute on function public.begin_talevo_ai_request() to authenticated;
grant execute on function public.finish_talevo_ai_request(uuid) to authenticated;
