-- Web Push: the two tables the dispatcher reads, plus the schedule that calls it.
--
-- The app already decides what to say and when; this only carries it. The
-- browser computes the upcoming alerts and writes them to
-- talevo_scheduled_notifications, and a cron job posts the due ones to the
-- /api/push/dispatch route, which signs and sends them.

create table if not exists public.push_subscriptions (
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  -- The endpoint is the browser's own address for this install, unique per
  -- device, so it is the key: re-subscribing on the same device replaces its
  -- row instead of adding another.
  primary key (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

create table if not exists public.talevo_scheduled_notifications (
  user_id uuid not null references auth.users on delete cascade,
  event_key text not null,
  send_at timestamptz not null,
  title text not null,
  body text not null,
  href text not null default '/notifications',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- event_key is the same identity the in-app notifications use, so a row
  -- rewritten after the user edits a class replaces the old reminder rather
  -- than queueing a second one.
  primary key (user_id, event_key)
);

-- The dispatcher's only query: everything due and not yet sent.
create index if not exists talevo_scheduled_notifications_due_idx
  on public.talevo_scheduled_notifications(send_at)
  where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.talevo_scheduled_notifications enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists talevo_scheduled_notifications_own on public.talevo_scheduled_notifications;
create policy talevo_scheduled_notifications_own on public.talevo_scheduled_notifications
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The dispatcher runs with the service key and bypasses RLS; nothing else
-- should read another person's endpoints or reminder text.
revoke all on public.push_subscriptions from anon;
revoke all on public.talevo_scheduled_notifications from anon;

-- The schedule that drains the queue.
--
-- pg_cron's finest granularity is a minute, and reminders are minute-accurate,
-- so it runs every minute. pg_net posts without blocking the transaction, and
-- the shared secret keeps the route from being an open trigger.
--
-- Replace <DISPATCH_URL> and <DISPATCH_SECRET> before running this block.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('talevo-push-dispatch')
where exists (select 1 from cron.job where jobname = 'talevo-push-dispatch');

select cron.schedule(
  'talevo-push-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := '<DISPATCH_URL>',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-talevo-push-secret', '<DISPATCH_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
