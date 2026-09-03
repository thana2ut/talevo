-- Manual cleanup after QA completes. Replace placeholders before running.
-- This removes only QA capability rows; it does not delete user/AppState rows.

begin;

delete from private.talevo_migration_qa_allowlist as allowlist_row
where allowlist_row.user_id in ('QA_USER_A_UUID'::uuid, 'QA_USER_B_UUID'::uuid);

select
  (select count(*) from private.talevo_migration_qa_allowlist as allowlist_row where allowlist_row.enabled) as enabled_qa_accounts,
  coalesce((select control_row.import_enabled from private.talevo_migration_control as control_row where control_row.control_key = 'local_v8_import'), false) as global_import_enabled;

commit;
