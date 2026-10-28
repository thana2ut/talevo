-- Table privileges for the two Web Push tables.
--
-- 20261029000000_talevo_push_notifications.sql created them and set row-level
-- security, but never granted the privileges RLS sits on top of. A policy only
-- narrows what a role may already touch; with no grant there is nothing to
-- narrow, so every access was refused:
--
--   * /api/push/dispatch could not read the queue. It answered the minute cron
--     with 500 push_read_failed on every run since the table was created, so no
--     reminder was ever delivered.
--   * /api/push/subscribe could not write a row, so a device that turned
--     notifications on was never registered to receive any.
--   * the browser could not write the queue it plans, so the queue stayed empty
--     even if the other two had worked.
--
-- The grants follow the v8 convention in 20260901111000_talevo_v8_rls.sql:
-- anon gets nothing, authenticated gets DML and is confined to its own rows by
-- the existing policies.

-- The browser plans its own reminders and rewrites the queue on every visit.
revoke all on table public.talevo_scheduled_notifications from anon;
grant select, insert, update, delete
  on table public.talevo_scheduled_notifications
  to authenticated;

-- Endpoints are written and read only by the server routes, which hold the
-- secret key. No browser code touches this table, so authenticated is left
-- without privileges; talevo_scheduled_notifications_own and
-- push_subscriptions_own stay in place as the second line of defence if that
-- ever changes.
revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_subscriptions from authenticated;

-- service_role already bypasses RLS; what it lacked was the privilege itself.
grant select, insert, update, delete
  on table public.push_subscriptions,
     public.talevo_scheduled_notifications
  to service_role;
