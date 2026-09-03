-- TALEVO live Supabase RLS test using two existing QA users.
--
-- SAFETY:
-- - Replace only USER_A_UUID and USER_B_UUID before running.
-- - Run the whole file in one Supabase SQL Editor execution.
-- - The test impersonates authenticated/anon database roles; postgres results
--   are used only for prerequisite validation, never as RLS evidence.
-- - Every write is enclosed in this transaction and is discarded by ROLLBACK.
-- - This file must never contain email, password, service_role, or real AppState.

begin;

-- Prerequisite validation runs before impersonation. These checks only confirm
-- that the supplied QA UUIDs exist and have trigger-created rows.
do $$
#variable_conflict error
declare
  qa_user_a_text constant text := 'USER_A_UUID';
  qa_user_b_text constant text := 'USER_B_UUID';
  qa_user_a_uuid uuid;
  qa_user_b_uuid uuid;
  qa_matched_row_count integer;
begin
  begin
    qa_user_a_uuid := qa_user_a_text::uuid;
    qa_user_b_uuid := qa_user_b_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Both QA user placeholders must be valid UUIDs';
  end;

  if qa_user_a_uuid = qa_user_b_uuid then
    raise exception 'User A and User B must be different QA users';
  end if;

  select count(*) into qa_matched_row_count
    from auth.users as auth_user
    where auth_user.id in (qa_user_a_uuid, qa_user_b_uuid);
  if qa_matched_row_count <> 2 then
    raise exception 'Both QA UUIDs must already exist in auth.users';
  end if;

  select count(*) into qa_matched_row_count
    from public.profiles as profile_row
    where profile_row.user_id in (qa_user_a_uuid, qa_user_b_uuid);
  if qa_matched_row_count <> 2 then
    raise exception 'Both QA users must already have profile rows';
  end if;

  select count(*) into qa_matched_row_count
    from public.academic_terms as academic_term_row
    where academic_term_row.user_id in (qa_user_a_uuid, qa_user_b_uuid);
  if qa_matched_row_count <> 2 then
    raise exception 'Both QA users must already have academic_terms rows';
  end if;

  perform set_config('talevo.test.user_a', qa_user_a_uuid::text, true);
  perform set_config('talevo.test.user_b', qa_user_b_uuid::text, true);
  perform set_config('talevo.test.suffix', txid_current()::text, true);
end
$$;

set local role authenticated;

do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := current_setting('talevo.test.user_a')::uuid;
  qa_user_b_uuid constant uuid := current_setting('talevo.test.user_b')::uuid;
  qa_suffix constant text := current_setting('talevo.test.suffix');
  qa_task_id constant text := 'qa-rls-task-a-' || qa_suffix;
  qa_delete_task_id constant text := 'qa-rls-task-delete-a-' || qa_suffix;
  qa_subtask_id constant text := 'qa-rls-subtask-a-' || qa_suffix;
  qa_schedule_id constant text := 'qa-rls-schedule-a-' || qa_suffix;
  qa_exam_id constant text := 'qa-rls-exam-a-' || qa_suffix;
  qa_category_id constant text := 'qa-rls-category-a-' || qa_suffix;
  qa_transaction_id constant text := 'qa-rls-transaction-a-' || qa_suffix;
  qa_notification_id constant text := 'qa-rls-notification-a-' || qa_suffix;
  qa_event_key constant text := 'qa-rls-event-a-' || qa_suffix;
  qa_affected_row_count integer;
begin
  -- Authenticated User A claims. request.jwt.claims models PostgREST; the
  -- individual claim settings keep the direct SQL test compatible with the
  -- auth.uid() helper installed on different Supabase Postgres versions.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', qa_user_a_uuid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- ASSERT: auth.uid() resolves User A under the authenticated role.
  if auth.uid() is distinct from qa_user_a_uuid then
    raise exception 'RLS ASSERTION FAILED: auth.uid() did not resolve User A';
  end if;

  -- A. profiles -------------------------------------------------------------
  -- ASSERT: User A sees exactly one profile in a project with QA A and QA B.
  select count(*) into qa_affected_row_count
    from public.profiles as profile_row;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A expected one visible profile, got %', qa_affected_row_count;
  end if;

  -- ASSERT: User A sees its own profile.
  select count(*) into qa_affected_row_count
    from public.profiles as profile_row
    where profile_row.user_id = qa_user_a_uuid;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot see its own profile';
  end if;

  -- ASSERT: User A cannot see User B profile.
  select count(*) into qa_affected_row_count
    from public.profiles as profile_row
    where profile_row.user_id = qa_user_b_uuid;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User A can see User B profile';
  end if;

  -- ASSERT: User A updates its own profile.
  update public.profiles as profile_row
    set display_name = left('QA RLS User A ' || qa_suffix, 80),
        updated_at = now()
    where profile_row.user_id = qa_user_a_uuid;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A could not update its own profile';
  end if;

  -- ASSERT: User A cannot update User B profile.
  update public.profiles as profile_row
    set display_name = left('ILLEGAL CROSS USER UPDATE ' || qa_suffix, 80),
        updated_at = now()
    where profile_row.user_id = qa_user_b_uuid;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User A updated User B profile';
  end if;

  -- B. tasks ----------------------------------------------------------------
  -- ASSERT: User A inserts its own task.
  insert into public.tasks (
    user_id, id, title, course_id, description, due_label, due_date,
    estimate, status, color
  ) values (
    qa_user_a_uuid, qa_task_id, 'QA RLS task A', 'qa-course',
    'temporary RLS row', 'QA', now() + interval '1 day', '15 นาที',
    'todo', '#7C3AED'
  );

  -- ASSERT: User A reads its own task.
  select count(*) into qa_affected_row_count
    from public.tasks as task_row
    where task_row.user_id = qa_user_a_uuid
      and task_row.id = qa_task_id;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot read its own task';
  end if;

  -- ASSERT: User A updates its own task.
  update public.tasks as task_row
    set status = 'doing'
    where task_row.user_id = qa_user_a_uuid
      and task_row.id = qa_task_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A could not update its own task';
  end if;

  -- ASSERT: User A can delete its own task (separate disposable row).
  insert into public.tasks (
    user_id, id, title, description, due_label, due_date, estimate, status, color
  ) values (
    qa_user_a_uuid, qa_delete_task_id, 'QA RLS delete task', '', 'QA',
    now() + interval '2 days', '', 'todo', '#7C3AED'
  );
  delete from public.tasks as task_row
    where task_row.user_id = qa_user_a_uuid
      and task_row.id = qa_delete_task_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A could not delete its own task';
  end if;

  -- Switch to User B without leaving the authenticated role.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', qa_user_b_uuid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);

  -- ASSERT: auth.uid() resolves User B.
  if auth.uid() is distinct from qa_user_b_uuid then
    raise exception 'RLS ASSERTION FAILED: auth.uid() did not resolve User B';
  end if;

  -- ASSERT: User B cannot read User A task.
  select count(*) into qa_affected_row_count
    from public.tasks as task_row
    where task_row.user_id = qa_user_a_uuid
      and task_row.id = qa_task_id;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B can read User A task';
  end if;

  -- ASSERT: User B cannot update User A task.
  update public.tasks as task_row
    set title = 'ILLEGAL B UPDATE'
    where task_row.user_id = qa_user_a_uuid
      and task_row.id = qa_task_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B updated User A task';
  end if;

  -- ASSERT: User B cannot delete User A task.
  delete from public.tasks as task_row
    where task_row.user_id = qa_user_a_uuid
      and task_row.id = qa_task_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B deleted User A task';
  end if;

  -- ASSERT: User B cannot spoof user_id=A during INSERT.
  begin
    insert into public.tasks (
      user_id, id, title, description, due_label, due_date, estimate, status, color
    ) values (
      qa_user_a_uuid, 'qa-rls-spoof-task-' || qa_suffix, 'ILLEGAL SPOOF', '',
      'QA', now() + interval '1 day', '', 'todo', '#7C3AED'
    );
    raise exception 'RLS ASSERTION FAILED: User B inserted a task as User A';
  exception
    when insufficient_privilege then null;
  end;

  -- Return to User A.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', qa_user_a_uuid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);

  -- H. owner spoofing -------------------------------------------------------
  -- ASSERT: User A cannot move its task row to User B.
  begin
    update public.tasks as task_row
      set user_id = qa_user_b_uuid
      where task_row.user_id = qa_user_a_uuid
        and task_row.id = qa_task_id;
    raise exception 'RLS ASSERTION FAILED: User A changed task owner to User B';
  exception
    when insufficient_privilege then null;
  end;

  -- G. child relation -------------------------------------------------------
  -- ASSERT: User A creates a subtask referencing User A task.
  insert into public.task_subtasks (
    user_id, task_id, id, title, completed, position
  ) values (
    qa_user_a_uuid, qa_task_id, qa_subtask_id, 'QA RLS subtask', false, 0
  );

  -- ASSERT: User A reads the child row.
  select count(*) into qa_affected_row_count
    from public.task_subtasks as child_row
    where child_row.user_id = qa_user_a_uuid
      and child_row.task_id = qa_task_id
      and child_row.id = qa_subtask_id;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot read its own task child';
  end if;

  -- Switch to User B for the cross-owner child FK test.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', qa_user_b_uuid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);

  -- ASSERT: User B cannot create a B-owned child referencing User A task.
  begin
    insert into public.task_subtasks (
      user_id, task_id, id, title, completed, position
    ) values (
      qa_user_b_uuid, qa_task_id, 'qa-rls-illegal-child-' || qa_suffix,
      'ILLEGAL CROSS OWNER CHILD', false, 0
    );
    raise exception 'RLS ASSERTION FAILED: User B referenced User A task from a child row';
  exception
    when foreign_key_violation then null;
  end;

  -- Return to User A for owner CRUD setup.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', qa_user_a_uuid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);

  -- C. class_schedules ------------------------------------------------------
  -- ASSERT: User A inserts its own schedule.
  insert into public.class_schedules (
    user_id, id, course_id, name, teacher, room, color, day,
    start_time, end_time, note
  ) values (
    qa_user_a_uuid, qa_schedule_id, 'qa-course', 'QA RLS class', 'QA teacher',
    'QA room', '#7C3AED', 1, time '09:00', time '10:00', 'temporary'
  );

  -- ASSERT: User A reads its schedule.
  select count(*) into qa_affected_row_count
    from public.class_schedules as schedule_row
    where schedule_row.user_id = qa_user_a_uuid
      and schedule_row.id = qa_schedule_id;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot read its schedule';
  end if;

  -- ASSERT: User A updates its schedule.
  update public.class_schedules as schedule_row
    set room = 'QA room updated'
    where schedule_row.user_id = qa_user_a_uuid
      and schedule_row.id = qa_schedule_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot update its schedule';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);

  -- ASSERT: User B cannot read User A schedule.
  select count(*) into qa_affected_row_count
    from public.class_schedules as schedule_row
    where schedule_row.user_id = qa_user_a_uuid
      and schedule_row.id = qa_schedule_id;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B can read User A schedule';
  end if;

  -- ASSERT: User B cannot update User A schedule.
  update public.class_schedules as schedule_row
    set room = 'ILLEGAL B ROOM'
    where schedule_row.user_id = qa_user_a_uuid
      and schedule_row.id = qa_schedule_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B updated User A schedule';
  end if;

  -- ASSERT: User B cannot delete User A schedule.
  delete from public.class_schedules as schedule_row
    where schedule_row.user_id = qa_user_a_uuid
      and schedule_row.id = qa_schedule_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B deleted User A schedule';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);

  -- ASSERT: User A deletes its schedule.
  delete from public.class_schedules as schedule_row
    where schedule_row.user_id = qa_user_a_uuid
      and schedule_row.id = qa_schedule_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot delete its schedule';
  end if;

  -- D. exams ----------------------------------------------------------------
  -- ASSERT: User A inserts its own exam.
  insert into public.exams (
    user_id, id, course_id, title, type, start_at, end_at,
    room, note, created_at, updated_at
  ) values (
    qa_user_a_uuid, qa_exam_id, 'qa-course', 'QA RLS exam', 'quiz',
    now() + interval '3 days', now() + interval '3 days 1 hour',
    'QA room', 'temporary', now(), now()
  );

  -- ASSERT: User A reads its exam.
  select count(*) into qa_affected_row_count
    from public.exams as exam_row
    where exam_row.user_id = qa_user_a_uuid
      and exam_row.id = qa_exam_id;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot read its exam';
  end if;

  -- ASSERT: User A updates its exam.
  update public.exams as exam_row
    set room = 'QA exam room updated', updated_at = now()
    where exam_row.user_id = qa_user_a_uuid
      and exam_row.id = qa_exam_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot update its exam';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);

  -- ASSERT: User B cannot read User A exam.
  select count(*) into qa_affected_row_count
    from public.exams as exam_row
    where exam_row.user_id = qa_user_a_uuid
      and exam_row.id = qa_exam_id;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B can read User A exam';
  end if;

  -- ASSERT: User B cannot update User A exam.
  update public.exams as exam_row
    set room = 'ILLEGAL B EXAM ROOM'
    where exam_row.user_id = qa_user_a_uuid
      and exam_row.id = qa_exam_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B updated User A exam';
  end if;

  -- ASSERT: User B cannot delete User A exam.
  delete from public.exams as exam_row
    where exam_row.user_id = qa_user_a_uuid
      and exam_row.id = qa_exam_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B deleted User A exam';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);

  -- ASSERT: User A deletes its exam.
  delete from public.exams as exam_row
    where exam_row.user_id = qa_user_a_uuid
      and exam_row.id = qa_exam_id;
  get diagnostics qa_affected_row_count = row_count;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot delete its exam';
  end if;

  -- E. finance --------------------------------------------------------------
  -- ASSERT: User A inserts an expense category.
  insert into public.finance_categories (
    user_id, id, name, type, icon, color, monthly_budget, created_at, is_default
  ) values (
    qa_user_a_uuid, qa_category_id, 'QA RLS expense ' || qa_suffix, 'expense',
    'Wallet', 'purple', 1000, now(), false
  );

  -- ASSERT: User A inserts a transaction in User A category.
  insert into public.finance_transactions (
    user_id, id, type, title, amount, category_id, date, note
  ) values (
    qa_user_a_uuid, qa_transaction_id, 'expense', 'QA RLS transaction',
    10.00, qa_category_id, current_date, 'temporary'
  );

  -- ASSERT: User A reads its transaction.
  select count(*) into qa_affected_row_count
    from public.finance_transactions as transaction_row
    where transaction_row.user_id = qa_user_a_uuid
      and transaction_row.id = qa_transaction_id;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot read its finance transaction';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);

  -- ASSERT: User B cannot see User A category.
  select count(*) into qa_affected_row_count
    from public.finance_categories as category_row
    where category_row.user_id = qa_user_a_uuid
      and category_row.id = qa_category_id;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B can read User A finance category';
  end if;

  -- ASSERT: User B cannot see User A transaction.
  select count(*) into qa_affected_row_count
    from public.finance_transactions as transaction_row
    where transaction_row.user_id = qa_user_a_uuid
      and transaction_row.id = qa_transaction_id;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B can read User A finance transaction';
  end if;

  -- ASSERT: User B cannot use User A category from a B-owned transaction.
  begin
    insert into public.finance_transactions (
      user_id, id, type, title, amount, category_id, date
    ) values (
      qa_user_b_uuid, 'qa-rls-illegal-cross-category-' || qa_suffix, 'expense',
      'ILLEGAL CROSS CATEGORY', 10.00, qa_category_id, current_date
    );
    raise exception 'RLS ASSERTION FAILED: User B used User A finance category';
  exception
    when foreign_key_violation then null;
  end;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);

  -- ASSERT: Transaction type must match the referenced category type.
  begin
    insert into public.finance_transactions (
      user_id, id, type, title, amount, category_id, date
    ) values (
      qa_user_a_uuid, 'qa-rls-illegal-type-' || qa_suffix, 'income',
      'ILLEGAL TYPE MISMATCH', 10.00, qa_category_id, current_date
    );
    raise exception 'RLS ASSERTION FAILED: finance transaction/category type mismatch was accepted';
  exception
    when foreign_key_violation then null;
  end;

  -- F. notifications --------------------------------------------------------
  -- ASSERT: User A inserts its own notification.
  insert into public.notifications (
    user_id, id, type, priority, title, message, created_at,
    event_key, metadata
  ) values (
    qa_user_a_uuid, qa_notification_id, 'system', 'normal',
    'QA RLS notification', 'temporary notification', now(), qa_event_key,
    '{"qa": true}'::jsonb
  );

  -- ASSERT: User A reads its notification.
  select count(*) into qa_affected_row_count
    from public.notifications as notification_row
    where notification_row.user_id = qa_user_a_uuid
      and notification_row.id = qa_notification_id;
  if qa_affected_row_count <> 1 then
    raise exception 'RLS ASSERTION FAILED: User A cannot read its notification';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_b_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_b_uuid::text, true);

  -- ASSERT: User B cannot read User A notification.
  select count(*) into qa_affected_row_count
    from public.notifications as notification_row
    where notification_row.user_id = qa_user_a_uuid
      and notification_row.id = qa_notification_id;
  if qa_affected_row_count <> 0 then
    raise exception 'RLS ASSERTION FAILED: User B can read User A notification';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', qa_user_a_uuid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', qa_user_a_uuid::text, true);

  -- ASSERT: event_key uniqueness remains enforced for one owner.
  begin
    insert into public.notifications (
      user_id, id, type, priority, title, message, created_at, event_key
    ) values (
      qa_user_a_uuid, 'qa-rls-duplicate-event-' || qa_suffix, 'system',
      'normal', 'QA duplicate event', 'must fail', now(), qa_event_key
    );
    raise exception 'RLS ASSERTION FAILED: duplicate notification event_key was accepted';
  exception
    when unique_violation then null;
  end;

  perform set_config('talevo.test.authenticated_passed', 'true', true);
end
$$;

-- I. anon -------------------------------------------------------------------
set local role anon;

do $$
#variable_conflict error
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'anon', 'aud', 'anon')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
end
$$;

do $$
#variable_conflict error
declare
  qa_user_a_uuid constant uuid := current_setting('talevo.test.user_a')::uuid;
  qa_suffix constant text := current_setting('talevo.test.suffix');
  qa_task_id constant text := 'qa-rls-task-a-' || qa_suffix;
  qa_table_name text;
  qa_affected_row_count integer;
  qa_private_tables constant text[] := array[
    'profiles',
    'academic_terms',
    'class_schedules',
    'tasks',
    'task_subtasks',
    'task_attachments',
    'task_completion_history',
    'exams',
    'exam_topics',
    'grade_plans',
    'grade_components',
    'grade_thresholds',
    'course_notes',
    'attendance_records',
    'finance_categories',
    'finance_transactions',
    'saving_goals',
    'finance_settings',
    'learning_goals',
    'notifications',
    'dismissed_notification_events',
    'app_settings',
    'chat_messages',
    'app_state_sync'
  ];
begin
  -- ASSERT: anon auth.uid() is null.
  if auth.uid() is not null then
    raise exception 'RLS ASSERTION FAILED: anon auth.uid() must be null';
  end if;

  -- ASSERTS (24): every private table either denies anon SELECT at GRANT level
  -- or returns zero visible rows through RLS.
  foreach qa_table_name in array qa_private_tables loop
    begin
      execute format(
        'select count(*) from public.%I',
        qa_table_name
      ) into qa_affected_row_count;
      if qa_affected_row_count <> 0 then
        raise exception 'RLS ASSERTION FAILED: anon can read % row(s) from public.%',
          qa_affected_row_count,
          qa_table_name;
      end if;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  -- ASSERT: anon INSERT is rejected.
  begin
    insert into public.tasks (
      user_id, id, title, description, due_label, due_date, estimate, status, color
    ) values (
      qa_user_a_uuid, 'qa-rls-anon-insert-' || qa_suffix,
      'ILLEGAL ANON INSERT', '', 'QA', now() + interval '1 day', '',
      'todo', '#7C3AED'
    );
    raise exception 'RLS ASSERTION FAILED: anon inserted a private task';
  exception
    when insufficient_privilege then null;
  end;

  -- ASSERT: anon UPDATE is denied or affects zero rows.
  begin
    update public.tasks as task_row
      set title = 'ILLEGAL ANON UPDATE'
      where task_row.user_id = qa_user_a_uuid
        and task_row.id = qa_task_id;
    get diagnostics qa_affected_row_count = row_count;
    if qa_affected_row_count <> 0 then
      raise exception 'RLS ASSERTION FAILED: anon updated a private task';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  -- ASSERT: anon DELETE is denied or affects zero rows.
  begin
    delete from public.tasks as task_row
      where task_row.user_id = qa_user_a_uuid
        and task_row.id = qa_task_id;
    get diagnostics qa_affected_row_count = row_count;
    if qa_affected_row_count <> 0 then
      raise exception 'RLS ASSERTION FAILED: anon deleted a private task';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  if current_setting('talevo.test.authenticated_passed', true)
      is distinct from 'true' then
    raise exception 'RLS ASSERTION FAILED: authenticated test block did not complete';
  end if;

  perform set_config('talevo.test.anon_passed', 'true', true);
end
$$;

-- This is the final result-producing query. It returns one row only after both
-- assertion blocks completed without an exception.
select 'TALEVO LIVE TWO-USER RLS TEST PASSED' as result
where current_setting('talevo.test.authenticated_passed', true) = 'true'
  and current_setting('talevo.test.anon_passed', true) = 'true';

rollback;
