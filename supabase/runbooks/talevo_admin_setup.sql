-- MANUAL RUNBOOK: replace ADMIN_USER_UUID with one existing auth.users UUID.
-- Run only after 20260902140000_talevo_admin_backoffice.sql has been deployed.
-- This script does not enable Local v8 import and does not read user domain data.

do $$
declare
  target_admin_user_id uuid := 'ADMIN_USER_UUID'::uuid;
begin
  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = target_admin_user_id
  ) then
    raise exception using errcode = '23503', message = 'talevo_admin_auth_user_not_found';
  end if;

  if coalesce((
    select control_row.import_enabled
    from private.talevo_migration_control as control_row
    where control_row.control_key = 'local_v8_import'
  ), false) then
    raise exception using errcode = '55000', message = 'talevo_global_import_gate_must_remain_disabled';
  end if;

  insert into private.talevo_admin_users (user_id, updated_at)
  values (target_admin_user_id, pg_catalog.now())
  on conflict (user_id) do update
  set updated_at = excluded.updated_at;
end
$$;

select 'TALEVO ADMIN MEMBERSHIP READY' as status;
