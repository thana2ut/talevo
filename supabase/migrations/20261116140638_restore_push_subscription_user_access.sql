-- Correct authenticated server-route access; existing owner-only RLS remains enabled.
-- Adds table privileges only. Does not delete or modify notification records.
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
