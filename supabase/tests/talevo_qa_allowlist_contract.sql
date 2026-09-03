-- TALEVO live QA allowlist contract.
-- Replace only QA_USER_A_UUID / QA_USER_B_UUID and run the whole file after
-- deploying 20260902130000_talevo_migration_qa_allowlist.sql.
-- All changes are discarded by the final ROLLBACK.

begin;

do $$
#variable_conflict error
declare
  qa_user_a_text constant text := 'QA_USER_A_UUID';
  qa_user_b_text constant text := 'QA_USER_B_UUID';
  qa_user_a_uuid uuid;
  qa_user_b_uuid uuid;
  qa_row_count integer;
begin
  qa_user_a_uuid := qa_user_a_text::uuid;
  qa_user_b_uuid := qa_user_b_text::uuid;
  if qa_user_a_uuid = qa_user_b_uuid then raise exception 'QA users must be different'; end if;
  select count(*) into qa_row_count from auth.users as auth_user where auth_user.id in (qa_user_a_uuid, qa_user_b_uuid);
  if qa_row_count <> 2 then raise exception 'Both QA users must exist before this test'; end if;
  if coalesce((select control_row.import_enabled from private.talevo_migration_control as control_row where control_row.control_key = 'local_v8_import'), false) then
    raise exception 'ASSERTION FAILED: global import gate must remain false';
  end if;
  if exists (select 1 from private.talevo_migration_qa_allowlist as allowlist_row where allowlist_row.user_id in (qa_user_a_uuid, qa_user_b_uuid)) then
    raise exception 'QA users already exist in the allowlist; use clean QA users for this contract';
  end if;
  perform set_config('talevo.qa.user_a', qa_user_a_uuid::text, true);
  perform set_config('talevo.qa.user_b', qa_user_b_uuid::text, true);
end
$$;

create function pg_temp.talevo_qa_payload(qa_owner uuid)
returns jsonb
language sql
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'schema_version', 8,
    'import_id', 'local-v8-' || pg_catalog.left(pg_catalog.replace(qa_owner::text, '-', ''), 16),
    'local_owner_id', qa_owner::text,
    'local_saved_at', '2026-09-02T00:00:00.000Z',
    'local_writer_id', 'qa-allowlist-contract',
    'tables', pg_catalog.jsonb_build_object(
      'profiles', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('display_name', 'QA Allowlist', 'major', 'QA', 'university', 'TALEVO')),
      'academic_terms', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('level', '2', 'term', '1', 'academic_year', '2569', 'label', null)),
      'class_schedules', '[]'::jsonb,
      'tasks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', 'qa-allowlist-task-' || pg_catalog.replace(qa_owner::text, '-', ''), 'title', 'QA task', 'course_id', null, 'description', '', 'due_label', '', 'due_date', '2026-09-30T03:00:00.000Z', 'estimate', '1 ชั่วโมง', 'status', 'todo', 'color', '#7656F6', 'attachment_label', null, 'completed_at', null)),
      'task_subtasks', '[]'::jsonb,
      'task_attachments', '[]'::jsonb,
      'task_completion_history', '[]'::jsonb,
      'exams', '[]'::jsonb,
      'exam_topics', '[]'::jsonb,
      'grade_plans', '[]'::jsonb,
      'grade_components', '[]'::jsonb,
      'grade_thresholds', '[]'::jsonb,
      'course_notes', '[]'::jsonb,
      'attendance_records', '[]'::jsonb,
      'finance_categories', '[]'::jsonb,
      'finance_transactions', '[]'::jsonb,
      'saving_goals', '[]'::jsonb,
      'finance_settings', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_budget', 0, 'selected_month', '2026-09')),
      'learning_goals', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekly_study_hours', 0, 'early_submission_days', 0, 'exam_preparation_days', 0, 'personal_goal', 'QA')),
      'notifications', '[]'::jsonb,
      'dismissed_notification_events', '[]'::jsonb,
      'app_settings', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('timezone', 'Asia/Bangkok', 'date_format', 'วัน/เดือน/ปี', 'year_system', 'พ.ศ.', 'alerts_enabled', true, 'task_24h', true, 'task_12h', true, 'deadline_risk', true, 'morning_0600', true, 'daily_0700', true, 'class_30m', true, 'class_end_10m', true, 'exam_7d', true, 'exam_3d', true, 'exam_1d', true, 'exam_morning', true, 'weekly_radar', true)),
      'chat_messages', '[]'::jsonb
    )
  )
$$;

set local role anon;
do $$
begin
  -- ASSERT: anon cannot probe QA access.
  begin
    perform public.get_talevo_migration_qa_access();
    raise exception 'ASSERTION FAILED: anon probed QA access';
  exception when insufficient_privilege then null; end;
  -- ASSERT: anon cannot execute import.
  begin
    perform public.import_talevo_v8('{}'::jsonb);
    raise exception 'ASSERTION FAILED: anon executed import';
  exception when insufficient_privilege then null; end;
end
$$;

reset role;
set local role authenticated;
do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := current_setting('talevo.qa.user_a')::uuid;
begin
  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);
  -- ASSERT: an authenticated user cannot add itself to the private allowlist.
  begin
    insert into private.talevo_migration_qa_allowlist (user_id) values (qa_user_a_uuid);
    raise exception 'ASSERTION FAILED: authenticated user self-allowlisted';
  exception when insufficient_privilege then null; end;
  -- ASSERT: non-allowlisted User A sees a false capability.
  if public.get_talevo_migration_qa_access() then raise exception 'ASSERTION FAILED: non-allowlisted user got QA access'; end if;
  -- ASSERT: global false plus no allowlist denies User A import.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_qa_payload(qa_user_a_uuid));
    raise exception 'ASSERTION FAILED: non-allowlisted user imported';
  exception when insufficient_privilege then null; end;
end
$$;

reset role;
insert into private.talevo_migration_qa_allowlist (user_id, enabled)
values (current_setting('talevo.qa.user_a')::uuid, true), (current_setting('talevo.qa.user_b')::uuid, false);

set local role authenticated;
do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := current_setting('talevo.qa.user_a')::uuid;
  qa_user_b_uuid constant uuid := current_setting('talevo.qa.user_b')::uuid;
  qa_result jsonb;
  qa_row_count integer;
begin
  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);
  -- ASSERT: enabled allowlisted User A sees a true capability.
  if not public.get_talevo_migration_qa_access() then raise exception 'ASSERTION FAILED: allowlisted User A was denied'; end if;
  -- ASSERT: enabled allowlisted User A imports while global gate remains false.
  qa_result := public.import_talevo_v8(pg_temp.talevo_qa_payload(qa_user_a_uuid));
  if qa_result ->> 'status' <> 'imported' then raise exception 'ASSERTION FAILED: allowlisted User A import failed'; end if;
  -- ASSERT: the import created only User A's expected Task.
  select count(*) into qa_row_count from public.tasks as task_row where task_row.user_id = qa_user_a_uuid and task_row.id = 'qa-allowlist-task-' || pg_catalog.replace(qa_user_a_uuid::text, '-', '');
  if qa_row_count <> 1 then raise exception 'ASSERTION FAILED: User A imported Task missing'; end if;

  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);
  -- ASSERT: a disabled allowlist row is not sufficient.
  if public.get_talevo_migration_qa_access() then raise exception 'ASSERTION FAILED: disabled User B got QA access'; end if;
  -- ASSERT: disabled User B cannot import while global gate is false.
  begin
    perform public.import_talevo_v8(pg_temp.talevo_qa_payload(qa_user_b_uuid));
    raise exception 'ASSERTION FAILED: disabled User B imported';
  exception when insufficient_privilege then null; end;
  -- ASSERT: User B cannot see User A imported rows through RLS.
  select count(*) into qa_row_count from public.tasks as task_row where task_row.id = 'qa-allowlist-task-' || pg_catalog.replace(qa_user_a_uuid::text, '-', '');
  if qa_row_count <> 0 then raise exception 'ASSERTION FAILED: User B saw User A Task'; end if;
  -- ASSERT: an authenticated user cannot enable its private allowlist row.
  begin
    update private.talevo_migration_qa_allowlist as allowlist_row set enabled = true where allowlist_row.user_id = qa_user_b_uuid;
    raise exception 'ASSERTION FAILED: User B enabled its own allowlist row';
  exception when insufficient_privilege then null; end;
  -- ASSERT: an authenticated user cannot delete a private allowlist row.
  begin
    delete from private.talevo_migration_qa_allowlist as allowlist_row where allowlist_row.user_id = qa_user_a_uuid;
    raise exception 'ASSERTION FAILED: User B deleted an allowlist row';
  exception when insufficient_privilege then null; end;
end
$$;

reset role;
-- ASSERT: original global-gate rollout remains compatible when explicitly enabled.
update private.talevo_migration_control as control_row
set import_enabled = true, updated_at = pg_catalog.now()
where control_row.control_key = 'local_v8_import';

set local role authenticated;
do $$
#variable_conflict error
declare
  qa_user_b_uuid constant uuid := current_setting('talevo.qa.user_b')::uuid;
  qa_result jsonb;
begin
  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);
  qa_result := public.import_talevo_v8(pg_temp.talevo_qa_payload(qa_user_b_uuid));
  if qa_result ->> 'status' <> 'imported' then raise exception 'ASSERTION FAILED: global gate compatibility failed'; end if;
end
$$;

reset role;
select 'TALEVO QA ALLOWLIST CONTRACT PASSED';
rollback;
