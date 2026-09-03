-- Manual Supabase SQL Editor step. Replace both placeholders before running.
-- This grants only the two named QA users access to the existing atomic RPC.
-- It does not enable the global migration gate and does not import AppState.

begin;

do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := 'QA_USER_A_UUID'::uuid;
  qa_user_b_uuid constant uuid := 'QA_USER_B_UUID'::uuid;
  qa_row_count integer;
begin
  if qa_user_a_uuid = qa_user_b_uuid then raise exception 'QA users must be different'; end if;
  if coalesce((select control_row.import_enabled from private.talevo_migration_control as control_row where control_row.control_key = 'local_v8_import'), false) then
    raise exception 'Global import gate is true. Set it false before QA allowlisting.';
  end if;
  select count(*) into qa_row_count from auth.users as auth_user where auth_user.id in (qa_user_a_uuid, qa_user_b_uuid);
  if qa_row_count <> 2 then raise exception 'Both QA users must already exist in auth.users'; end if;

  insert into private.talevo_migration_qa_allowlist (user_id, enabled)
  values (qa_user_a_uuid, true), (qa_user_b_uuid, true)
  on conflict (user_id) do update
  set enabled = excluded.enabled,
      updated_at = pg_catalog.now();
end
$$;

select
  (select count(*) from private.talevo_migration_qa_allowlist as allowlist_row where allowlist_row.enabled) as enabled_qa_accounts,
  coalesce((select control_row.import_enabled from private.talevo_migration_control as control_row where control_row.control_key = 'local_v8_import'), false) as global_import_enabled;

commit;
