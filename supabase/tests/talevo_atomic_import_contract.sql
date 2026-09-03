-- TALEVO live atomic import contract.
-- Replace only USER_A_UUID / USER_B_UUID, then run the whole file after the
-- additive atomic-import migration. All QA writes are discarded by ROLLBACK.

begin;

do $$
#variable_conflict error
declare
  qa_user_a_text constant text := 'USER_A_UUID';
  qa_user_b_text constant text := 'USER_B_UUID';
  qa_user_a_uuid uuid;
  qa_user_b_uuid uuid;
  qa_row_count integer;
begin
  qa_user_a_uuid := qa_user_a_text::uuid;
  qa_user_b_uuid := qa_user_b_text::uuid;
  if qa_user_a_uuid = qa_user_b_uuid then raise exception 'QA users must be different'; end if;
  select count(*) into qa_row_count from auth.users as auth_user where auth_user.id in (qa_user_a_uuid, qa_user_b_uuid);
  if qa_row_count <> 2 then raise exception 'Both QA users must exist before this test'; end if;
  perform set_config('talevo.import.user_a', qa_user_a_uuid::text, true);
  perform set_config('talevo.import.user_b', qa_user_b_uuid::text, true);
end
$$;

create function pg_temp.talevo_import_payload(qa_owner uuid, qa_variant text default 'valid')
returns jsonb
language plpgsql
set search_path = ''
as $$
#variable_conflict error
declare
  qa_suffix text := pg_catalog.replace(qa_owner::text, '-', '');
  qa_tables jsonb;
  qa_payload jsonb;
begin
  qa_tables := pg_catalog.jsonb_build_object(
    'profiles', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('display_name', 'Atomic QA', 'major', 'QA', 'university', 'TALEVO')),
    'academic_terms', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('level', '2', 'term', '1', 'academic_year', '2569', 'label', null)),
    'class_schedules', '[]'::jsonb,
    'tasks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', 'qa-import-task-' || qa_suffix, 'title', 'Atomic task', 'course_id', null, 'description', '', 'due_label', '', 'due_date', '2026-09-30T03:00:00.000Z', 'estimate', '1 ชั่วโมง', 'status', 'todo', 'color', '#7656F6', 'attachment_label', null, 'completed_at', null)),
    'task_subtasks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id', 'qa-import-task-' || qa_suffix, 'id', 'qa-import-subtask-' || qa_suffix, 'title', 'Atomic child', 'completed', false, 'completed_at', null, 'position', 0)),
    'task_attachments', '[]'::jsonb,
    'task_completion_history', '[]'::jsonb,
    'exams', '[]'::jsonb,
    'exam_topics', '[]'::jsonb,
    'grade_plans', '[]'::jsonb,
    'grade_components', '[]'::jsonb,
    'grade_thresholds', '[]'::jsonb,
    'course_notes', '[]'::jsonb,
    'attendance_records', '[]'::jsonb,
    'finance_categories', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', 'qa-import-category-' || qa_suffix, 'name', 'QA Expense ' || pg_catalog.left(qa_suffix, 8), 'type', 'expense', 'icon', 'wallet', 'color', 'purple', 'monthly_budget', 500, 'created_at', '2026-09-01T00:00:00.000Z', 'is_default', false)),
    'finance_transactions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', 'qa-import-transaction-' || qa_suffix, 'type', 'expense', 'title', 'QA lunch', 'amount', 125.50, 'category_id', 'qa-import-category-' || qa_suffix, 'date', '2026-09-01', 'note', null)),
    'saving_goals', '[]'::jsonb,
    'finance_settings', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_budget', 250, 'selected_month', '2026-09')),
    'learning_goals', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekly_study_hours', 10, 'early_submission_days', 2, 'exam_preparation_days', 7, 'personal_goal', 'QA')),
    'notifications', '[]'::jsonb,
    'dismissed_notification_events', '[]'::jsonb,
    'app_settings', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('timezone', 'Asia/Bangkok', 'date_format', 'วัน/เดือน/ปี', 'year_system', 'พ.ศ.', 'alerts_enabled', true, 'task_24h', true, 'task_12h', true, 'deadline_risk', true, 'morning_0600', true, 'daily_0700', true, 'class_30m', true, 'class_end_10m', true, 'exam_7d', true, 'exam_3d', true, 'exam_1d', true, 'exam_morning', true, 'weekly_radar', true)),
    'chat_messages', '[]'::jsonb
  );
  qa_payload := pg_catalog.jsonb_build_object('schema_version', 8, 'import_id', 'local-v8-' || pg_catalog.left(qa_suffix, 16), 'local_owner_id', qa_owner::text, 'local_saved_at', '2026-09-01T00:00:00.000Z', 'local_writer_id', 'qa-contract', 'tables', qa_tables);
  if qa_variant = 'wrong_version' then return pg_catalog.jsonb_set(qa_payload, '{schema_version}', '7'::jsonb); end if;
  if qa_variant = 'malformed' then return pg_catalog.jsonb_set(qa_payload, '{tables,tasks}', '{}'::jsonb); end if;
  if qa_variant = 'partial_failure' then
    return pg_catalog.jsonb_set(qa_payload, '{tables,notifications}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', 'qa-invalid-notification', 'type', 'removed_type', 'priority', 'normal', 'title', 'Invalid', 'message', 'Must roll back', 'created_at', '2026-09-01T00:00:00.000Z', 'event_key', 'qa-invalid-event')));
  end if;
  if qa_variant = 'cross_owner_child' then
    qa_payload := pg_catalog.jsonb_set(qa_payload, '{tables,tasks}', '[]'::jsonb);
    return pg_catalog.jsonb_set(qa_payload, '{tables,task_subtasks}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id', 'qa-import-task-' || pg_catalog.replace(current_setting('talevo.import.user_a'), '-', ''), 'id', 'qa-cross-owner-child', 'title', 'Forbidden child', 'completed', false, 'position', 0)));
  end if;
  if qa_variant = 'orphan_child' then
    qa_payload := pg_catalog.jsonb_set(qa_payload, '{tables,tasks}', '[]'::jsonb);
    return pg_catalog.jsonb_set(qa_payload, '{tables,task_subtasks}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('task_id', 'qa-missing-task', 'id', 'qa-orphan-child', 'title', 'Orphan child', 'completed', false, 'position', 0)));
  end if;
  if qa_variant = 'invalid_finance_relation' then
    return pg_catalog.jsonb_set(qa_payload, '{tables,finance_categories}', '[]'::jsonb);
  end if;
  return qa_payload;
end;
$$;

set local role authenticated;
do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := current_setting('talevo.import.user_a')::uuid;
begin
  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);
  -- ASSERT: the database-side release gate denies direct authenticated RPC calls by default.
  begin
    perform public.import_talevo_v8('{}'::jsonb);
    raise exception 'ASSERTION FAILED: disabled database release gate allowed import';
  exception when insufficient_privilege then null; end;
end
$$;

reset role;
update private.talevo_migration_control as control_row
set import_enabled = true, updated_at = pg_catalog.now()
where control_row.control_key = 'local_v8_import';

set local role anon;
do $$
begin
  -- ASSERT: anon cannot execute the import RPC.
  begin
    perform public.import_talevo_v8('{}'::jsonb);
    raise exception 'ASSERTION FAILED: anon executed import RPC';
  exception when insufficient_privilege then null; end;
end
$$;

reset role;
set local role authenticated;
do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := current_setting('talevo.import.user_a')::uuid;
  qa_user_b_uuid constant uuid := current_setting('talevo.import.user_b')::uuid;
  qa_result jsonb;
  qa_hash text;
  qa_row_count integer;
begin
  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform set_config('request.jwt.claim.sub', null, true);
  -- ASSERT: authenticated role without a user session is denied.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_a_uuid));
    raise exception 'ASSERTION FAILED: unauthenticated import succeeded';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- ASSERT: User A imports its own normalized payload atomically.
  qa_result := public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_a_uuid));
  if qa_result ->> 'status' <> 'imported' then raise exception 'ASSERTION FAILED: User A import did not return imported'; end if;
  qa_hash := qa_result ->> 'snapshot_hash';

  -- ASSERT: stable Task and child IDs are present after import.
  select count(*) into qa_row_count from public.task_subtasks as child_row where child_row.user_id = qa_user_a_uuid and child_row.task_id = 'qa-import-task-' || pg_catalog.replace(qa_user_a_uuid::text, '-', '');
  if qa_row_count <> 1 then raise exception 'ASSERTION FAILED: stable Task child relation missing'; end if;
  -- ASSERT: Finance category_id/type relation accepted the valid transaction.
  select count(*) into qa_row_count from public.finance_transactions as transaction_row join public.finance_categories as category_row on category_row.user_id = transaction_row.user_id and category_row.id = transaction_row.category_id and category_row.type = transaction_row.type where transaction_row.user_id = qa_user_a_uuid;
  if qa_row_count <> 1 then raise exception 'ASSERTION FAILED: Finance relation missing'; end if;
  -- ASSERT: app_state_sync marker records schema/import/hash/imported state.
  select count(*) into qa_row_count from public.app_state_sync as sync_row where sync_row.user_id = qa_user_a_uuid and sync_row.local_schema_version = 8 and sync_row.import_id = qa_result ->> 'import_id' and sync_row.snapshot_hash = qa_hash and sync_row.migration_status = 'imported';
  if qa_row_count <> 1 then raise exception 'ASSERTION FAILED: import marker incorrect'; end if;
  -- ASSERT: the same payload is idempotent and creates no duplicates.
  qa_result := public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_a_uuid));
  if qa_result ->> 'status' <> 'already_imported' then raise exception 'ASSERTION FAILED: retry was not idempotent'; end if;
  select count(*) into qa_row_count from public.tasks as task_row where task_row.user_id = qa_user_a_uuid;
  if qa_row_count <> 1 then raise exception 'ASSERTION FAILED: retry duplicated Task rows'; end if;
  -- ASSERT: a different import_id with the same logical snapshot reuses the existing import.
  qa_result := public.import_talevo_v8(pg_catalog.jsonb_set(pg_temp.talevo_import_payload(qa_user_a_uuid), '{import_id}', '"local-v8-ffffffffffffffff"'::jsonb));
  if qa_result ->> 'status' <> 'already_imported' then raise exception 'ASSERTION FAILED: equivalent snapshot with another import_id duplicated data'; end if;
  -- ASSERT: the same import_id cannot be reused for a different logical snapshot.
  begin
    perform public.import_talevo_v8(pg_catalog.jsonb_set(pg_temp.talevo_import_payload(qa_user_a_uuid), '{tables,tasks,0,title}', '"Changed atomic task"'::jsonb));
    raise exception 'ASSERTION FAILED: changed snapshot reused an existing import_id';
  exception when unique_violation then null; end;
  perform set_config('talevo.import.user_a_import_id', qa_result ->> 'import_id', true);
  perform set_config('talevo.import.user_a_hash', qa_hash, true);

  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);
  -- ASSERT: User B cannot see User A rows through normal RLS.
  select count(*) into qa_row_count from public.tasks as task_row where task_row.id = 'qa-import-task-' || pg_catalog.replace(qa_user_a_uuid::text, '-', '');
  if qa_row_count <> 0 then raise exception 'ASSERTION FAILED: User B saw User A Task'; end if;
  -- ASSERT: User B cannot read User A import marker through normal RLS.
  select count(*) into qa_row_count from public.app_state_sync as sync_row where sync_row.user_id = qa_user_a_uuid;
  if qa_row_count <> 0 then raise exception 'ASSERTION FAILED: User B saw User A import marker'; end if;
  -- ASSERT: User B cannot mark User A import verified through the controlled RPC.
  if public.complete_talevo_v8_verification(current_setting('talevo.import.user_a_import_id'), current_setting('talevo.import.user_a_hash'), true) then
    raise exception 'ASSERTION FAILED: User B verified User A import';
  end if;
  -- ASSERT: User B cannot import a payload claiming User A ownership.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_a_uuid));
    raise exception 'ASSERTION FAILED: cross-owner import succeeded';
  exception when insufficient_privilege then null; end;
  -- ASSERT: version other than v8 is rejected before writes.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid, 'wrong_version'));
    raise exception 'ASSERTION FAILED: wrong version succeeded';
  exception when invalid_parameter_value then null; end;
  -- ASSERT: malformed table shape is rejected before writes.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid, 'malformed'));
    raise exception 'ASSERTION FAILED: malformed payload succeeded';
  exception when invalid_parameter_value then null; end;
  -- ASSERT: an orphan child relation is rejected before writes.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid, 'orphan_child'));
    raise exception 'ASSERTION FAILED: orphan child succeeded';
  exception when foreign_key_violation then null; end;
  -- ASSERT: a child cannot reference User A's parent from User B's import.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid, 'cross_owner_child'));
    raise exception 'ASSERTION FAILED: cross-owner child succeeded';
  exception when foreign_key_violation then null; end;
  -- ASSERT: Finance transactions require a category with matching ID and type.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid, 'invalid_finance_relation'));
    raise exception 'ASSERTION FAILED: invalid Finance relation succeeded';
  exception when foreign_key_violation then null; end;
  -- ASSERT: existing domain data blocks first import instead of silently merging.
  insert into public.tasks (user_id, id, title, description, due_label, due_date, estimate, status, color)
  values (qa_user_b_uuid, 'qa-existing-cloud-task', 'Existing Cloud row', '', '', '2026-09-30T03:00:00.000Z', '1 ชั่วโมง', 'todo', '#7656F6');
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid));
    raise exception 'ASSERTION FAILED: non-empty Cloud account was silently merged';
  exception when unique_violation then null; end;
  delete from public.tasks as task_row where task_row.user_id = qa_user_b_uuid and task_row.id = 'qa-existing-cloud-task';
  -- ASSERT: a late constraint failure rolls back earlier Task/Finance inserts.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_import_payload(qa_user_b_uuid, 'partial_failure'));
    raise exception 'ASSERTION FAILED: partial failure payload succeeded';
  exception when check_violation then null; end;
  select count(*) into qa_row_count from public.tasks as task_row where task_row.user_id = qa_user_b_uuid;
  if qa_row_count <> 0 then raise exception 'ASSERTION FAILED: partial import left Task rows'; end if;
  select count(*) into qa_row_count from public.app_state_sync as sync_row where sync_row.user_id = qa_user_b_uuid;
  if qa_row_count <> 0 then raise exception 'ASSERTION FAILED: failed import left marker'; end if;

  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);
  -- ASSERT: a true client flag cannot mark verified when server-side Finance totals differ.
  update public.finance_transactions as transaction_row
  set amount = 126
  where transaction_row.user_id = qa_user_a_uuid and transaction_row.id = 'qa-import-transaction-' || pg_catalog.replace(qa_user_a_uuid::text, '-', '');
  if public.complete_talevo_v8_verification(current_setting('talevo.import.user_a_import_id'), current_setting('talevo.import.user_a_hash'), true) then
    raise exception 'ASSERTION FAILED: server accepted mismatched Finance totals';
  end if;
  update public.finance_transactions as transaction_row
  set amount = 125.50
  where transaction_row.user_id = qa_user_a_uuid and transaction_row.id = 'qa-import-transaction-' || pg_catalog.replace(qa_user_a_uuid::text, '-', '');
  -- ASSERT: read-back completion marks only the matching own import/hash verified after server checks.
  if not public.complete_talevo_v8_verification(current_setting('talevo.import.user_a_import_id'), current_setting('talevo.import.user_a_hash'), true) then
    raise exception 'ASSERTION FAILED: verification marker rejected';
  end if;
end
$$;

reset role;
select 'TALEVO ATOMIC IMPORT CONTRACT PASSED';
rollback;
