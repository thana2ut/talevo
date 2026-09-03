-- TALEVO AI rolling 24-hour successful-response quota.
-- Additive corrective migration. Review and run manually after 20260902160000.
-- Chat history is intentionally untouched and remains independent from usage quota.

alter table private.talevo_ai_rate_limits
  add column if not exists cycle_started_at timestamptz,
  add column if not exists reset_at timestamptz,
  add column if not exists successful_count integer not null default 0;

alter table private.talevo_ai_rate_limits
  drop constraint if exists talevo_ai_successful_count_range;

alter table private.talevo_ai_rate_limits
  add constraint talevo_ai_successful_count_range
  check (successful_count between 0 and 40);

alter table private.talevo_ai_rate_limits
  drop constraint if exists talevo_ai_cycle_consistency;

alter table private.talevo_ai_rate_limits
  add constraint talevo_ai_cycle_consistency
  check (
    (cycle_started_at is null and reset_at is null and successful_count = 0)
    or
    (cycle_started_at is not null
      and reset_at = cycle_started_at + interval '24 hours'
      and successful_count between 1 and 40)
  );

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

  if rate_row.reset_at is not null and rate_row.reset_at <= request_now then
    rate_row.cycle_started_at := null;
    rate_row.reset_at := null;
    rate_row.successful_count := 0;
  end if;

  if rate_row.short_window_started_at <= request_now - pg_catalog.make_interval(secs => 60) then
    rate_row.short_window_started_at := request_now;
    rate_row.short_window_request_count := 0;
  end if;

  update private.talevo_ai_rate_limits as limits
  set cycle_started_at = rate_row.cycle_started_at,
      reset_at = rate_row.reset_at,
      successful_count = rate_row.successful_count,
      short_window_started_at = rate_row.short_window_started_at,
      short_window_request_count = rate_row.short_window_request_count,
      updated_at = request_now
  where limits.user_id = request_user_id;

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

  if rate_row.successful_count >= 40 then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch', rate_row.reset_at - request_now))::integer
    );
    return query select false, 'rolling_quota'::text, calculated_retry_seconds, null::uuid;
    return;
  end if;

  new_request_id := pg_catalog.gen_random_uuid();
  update private.talevo_ai_rate_limits as limits
  set short_window_request_count = rate_row.short_window_request_count + 1,
      active_request_id = new_request_id,
      active_request_expires_at = request_now + pg_catalog.make_interval(secs => 40),
      updated_at = request_now
  where limits.user_id = request_user_id;

  return query select true, 'allowed'::text, 0, new_request_id;
end;
$$;

create or replace function public.complete_talevo_ai_request(
  completed_request_id uuid,
  was_successful boolean
)
returns table (
  accepted boolean,
  limit_count integer,
  used_count integer,
  remaining_count integer,
  cycle_started_at timestamptz,
  reset_at timestamptz,
  retry_after_seconds integer,
  minute_remaining integer,
  request_in_progress boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
  request_now timestamptz := pg_catalog.now();
  rate_row private.talevo_ai_rate_limits%rowtype;
  calculated_retry_seconds integer := 0;
begin
  if request_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select limits.*
  into rate_row
  from private.talevo_ai_rate_limits as limits
  where limits.user_id = request_user_id
  for update;

  if not found or rate_row.active_request_id is distinct from completed_request_id then
    return query select false, 40, 0, 40, null::timestamptz, null::timestamptz, 0, 4, false;
    return;
  end if;

  if was_successful then
    if rate_row.reset_at is null or rate_row.reset_at <= request_now then
      rate_row.cycle_started_at := request_now;
      rate_row.reset_at := request_now + interval '24 hours';
      rate_row.successful_count := 1;
    elsif rate_row.successful_count < 40 then
      rate_row.successful_count := rate_row.successful_count + 1;
    else
      was_successful := false;
    end if;
  end if;

  update private.talevo_ai_rate_limits as limits
  set cycle_started_at = rate_row.cycle_started_at,
      reset_at = rate_row.reset_at,
      successful_count = rate_row.successful_count,
      active_request_id = null,
      active_request_expires_at = null,
      updated_at = request_now
  where limits.user_id = request_user_id;

  if rate_row.reset_at is not null and rate_row.reset_at > request_now then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch', rate_row.reset_at - request_now))::integer
    );
  end if;

  return query select
    true,
    40,
    rate_row.successful_count,
    greatest(0, 40 - rate_row.successful_count),
    rate_row.cycle_started_at,
    rate_row.reset_at,
    calculated_retry_seconds,
    greatest(0, 4 - rate_row.short_window_request_count),
    false;
end;
$$;

create or replace function public.get_talevo_ai_usage_status()
returns table (
  limit_count integer,
  used_count integer,
  remaining_count integer,
  cycle_started_at timestamptz,
  reset_at timestamptz,
  retry_after_seconds integer,
  minute_remaining integer,
  request_in_progress boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  request_user_id uuid := auth.uid();
  request_now timestamptz := pg_catalog.now();
  rate_row private.talevo_ai_rate_limits%rowtype;
  calculated_retry_seconds integer := 0;
  calculated_minute_remaining integer := 4;
  active_in_progress boolean := false;
begin
  if request_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select limits.*
  into rate_row
  from private.talevo_ai_rate_limits as limits
  where limits.user_id = request_user_id
  for update;

  if not found then
    return query select 40, 0, 40, null::timestamptz, null::timestamptz, 0, 4, false;
    return;
  end if;

  if rate_row.reset_at is not null and rate_row.reset_at <= request_now then
    update private.talevo_ai_rate_limits as limits
    set cycle_started_at = null,
        reset_at = null,
        successful_count = 0,
        updated_at = request_now
    where limits.user_id = request_user_id;
    rate_row.cycle_started_at := null;
    rate_row.reset_at := null;
    rate_row.successful_count := 0;
  end if;

  if rate_row.short_window_started_at > request_now - pg_catalog.make_interval(secs => 60) then
    calculated_minute_remaining := greatest(0, 4 - rate_row.short_window_request_count);
  end if;

  active_in_progress := rate_row.active_request_id is not null
    and rate_row.active_request_expires_at > request_now;

  if rate_row.reset_at is not null and rate_row.reset_at > request_now then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch', rate_row.reset_at - request_now))::integer
    );
  elsif active_in_progress then
    calculated_retry_seconds := greatest(
      1,
      pg_catalog.ceil(pg_catalog.date_part('epoch', rate_row.active_request_expires_at - request_now))::integer
    );
  end if;

  return query select
    40,
    rate_row.successful_count,
    greatest(0, 40 - rate_row.successful_count),
    rate_row.cycle_started_at,
    rate_row.reset_at,
    calculated_retry_seconds,
    calculated_minute_remaining,
    active_in_progress;
end;
$$;

-- Keep the original failure-release RPC available for older app instances.
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
revoke all on function public.complete_talevo_ai_request(uuid, boolean) from public;
revoke all on function public.complete_talevo_ai_request(uuid, boolean) from anon;
revoke all on function public.get_talevo_ai_usage_status() from public;
revoke all on function public.get_talevo_ai_usage_status() from anon;
revoke all on function public.finish_talevo_ai_request(uuid) from public;
revoke all on function public.finish_talevo_ai_request(uuid) from anon;
grant execute on function public.begin_talevo_ai_request() to authenticated;
grant execute on function public.complete_talevo_ai_request(uuid, boolean) to authenticated;
grant execute on function public.get_talevo_ai_usage_status() to authenticated;
grant execute on function public.finish_talevo_ai_request(uuid) to authenticated;
