-- REVIEW ONLY: do not run until the project owner approves.
-- Removes direct execution permissions from browser/API roles on an internal
-- event-trigger function. Does not alter user rows, RLS policies or the trigger.
-- Inspected live: public.rls_auto_enable() RETURNS event_trigger, SECURITY DEFINER,
-- search_path=pg_catalog. It is intended for DDL events, not client RPC calls.
begin;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
commit;

-- Read-only verification after approval and execution:
select
  has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') as authenticated_can_execute;
