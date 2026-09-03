-- TALEVO QA-only Local v8 import allowlist.
-- Additive migration: run after 20260902120000_talevo_v8_atomic_import.sql.
-- This file creates no allowlist rows and never enables the global gate.

do $$
begin
  if coalesce((
    select control_row.import_enabled
    from private.talevo_migration_control as control_row
    where control_row.control_key = 'local_v8_import'
  ), false) then
    raise exception using errcode = '55000', message = 'talevo_global_import_gate_must_remain_disabled';
  end if;
end
$$;

create table if not exists private.talevo_migration_qa_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.talevo_migration_qa_allowlist enable row level security;
revoke all on table private.talevo_migration_qa_allowlist from public;
revoke all on table private.talevo_migration_qa_allowlist from anon;
revoke all on table private.talevo_migration_qa_allowlist from authenticated;

create or replace function public.get_talevo_migration_qa_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.talevo_migration_qa_allowlist as allowlist_row
      where allowlist_row.user_id = (select auth.uid())
        and allowlist_row.enabled
    )
$$;

create or replace function public.import_talevo_v8(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  qa_uid uuid := auth.uid();
  qa_tables jsonb;
  qa_import_id text;
  qa_fingerprint text;
  qa_existing_hash text;
  qa_existing_status text;
  qa_existing_import_id text;
  qa_unknown_table text;
  qa_domain_data_exists boolean;
  qa_counts jsonb;
  qa_finance_totals jsonb;
begin
  if qa_uid is null then
    raise exception using errcode = '42501', message = 'talevo_authentication_required';
  end if;
  if not (
    coalesce((
      select control_row.import_enabled
      from private.talevo_migration_control as control_row
      where control_row.control_key = 'local_v8_import'
    ), false)
    or exists (
      select 1
      from private.talevo_migration_qa_allowlist as allowlist_row
      where allowlist_row.user_id = qa_uid
        and allowlist_row.enabled
    )
  ) then
    raise exception using errcode = '42501', message = 'talevo_import_release_disabled';
  end if;
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'talevo_payload_must_be_object';
  end if;
  if coalesce((payload ->> 'schema_version')::integer, 0) <> 8 then
    raise exception using errcode = '22023', message = 'talevo_schema_version_must_be_8';
  end if;
  if nullif(btrim(payload ->> 'local_owner_id'), '') is null
     or (payload ->> 'local_owner_id')::uuid <> qa_uid then
    raise exception using errcode = '42501', message = 'talevo_local_owner_mismatch';
  end if;

  qa_import_id := nullif(btrim(payload ->> 'import_id'), '');
  if qa_import_id is null or qa_import_id !~ '^local-v8-[0-9a-f]{16}$' then
    raise exception using errcode = '22023', message = 'talevo_import_id_invalid';
  end if;
  qa_tables := payload -> 'tables';
  if qa_tables is null or pg_catalog.jsonb_typeof(qa_tables) <> 'object' then
    raise exception using errcode = '22023', message = 'talevo_tables_must_be_object';
  end if;
  if pg_catalog.jsonb_path_exists(payload, '$.**.user_id') then
    raise exception using errcode = '42501', message = 'talevo_client_user_id_forbidden';
  end if;
  if pg_catalog.jsonb_path_exists(payload, '$.**.studyBlocks')
     or pg_catalog.jsonb_path_exists(payload, '$.**.academicRoute')
     or pg_catalog.jsonb_path_exists(payload, '$.**.requiresSubmission')
     or pg_catalog.jsonb_path_exists(payload, '$.**.submittedAt')
     or pg_catalog.jsonb_path_exists(payload, '$.**.submissionNote')
     or pg_catalog.jsonb_path_exists(payload, '$.**.submissionEvidenceAttachmentIds')
     or pg_catalog.jsonb_path_exists(payload, '$.**.submissionReminders') then
    raise exception using errcode = '22023', message = 'talevo_removed_feature_data_forbidden';
  end if;

  select table_entry.key
  into qa_unknown_table
  from pg_catalog.jsonb_each(qa_tables) as table_entry(key, value)
  where table_entry.key <> all (array[
    'profiles', 'academic_terms', 'class_schedules', 'tasks', 'task_subtasks',
    'task_attachments', 'task_completion_history', 'exams', 'exam_topics',
    'grade_plans', 'grade_components', 'grade_thresholds', 'course_notes',
    'attendance_records', 'finance_categories', 'finance_transactions',
    'saving_goals', 'finance_settings', 'learning_goals', 'notifications',
    'dismissed_notification_events', 'app_settings', 'chat_messages'
  ])
  limit 1;
  if qa_unknown_table is not null then
    raise exception using errcode = '22023', message = 'talevo_unknown_table', detail = qa_unknown_table;
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(array[
      'profiles', 'academic_terms', 'class_schedules', 'tasks', 'task_subtasks',
      'task_attachments', 'task_completion_history', 'exams', 'exam_topics',
      'grade_plans', 'grade_components', 'grade_thresholds', 'course_notes',
      'attendance_records', 'finance_categories', 'finance_transactions',
      'saving_goals', 'finance_settings', 'learning_goals', 'notifications',
      'dismissed_notification_events', 'app_settings', 'chat_messages'
    ]) as required_table(table_name)
    where qa_tables -> required_table.table_name is null
       or pg_catalog.jsonb_typeof(qa_tables -> required_table.table_name) <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'talevo_table_array_missing_or_invalid';
  end if;
  if pg_catalog.jsonb_array_length(qa_tables -> 'profiles') <> 1
     or pg_catalog.jsonb_array_length(qa_tables -> 'academic_terms') <> 1
     or pg_catalog.jsonb_array_length(qa_tables -> 'finance_settings') <> 1
     or pg_catalog.jsonb_array_length(qa_tables -> 'learning_goals') <> 1
     or pg_catalog.jsonb_array_length(qa_tables -> 'app_settings') <> 1 then
    raise exception using errcode = '22023', message = 'talevo_singleton_table_count_invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(qa_tables -> 'task_subtasks') as child_row(task_id text)
    left join pg_catalog.jsonb_to_recordset(qa_tables -> 'tasks') as parent_row(id text) on parent_row.id = child_row.task_id
    where parent_row.id is null
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(qa_tables -> 'task_attachments') as child_row(task_id text)
    left join pg_catalog.jsonb_to_recordset(qa_tables -> 'tasks') as parent_row(id text) on parent_row.id = child_row.task_id
    where parent_row.id is null
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(qa_tables -> 'exam_topics') as child_row(exam_id text)
    left join pg_catalog.jsonb_to_recordset(qa_tables -> 'exams') as parent_row(id text) on parent_row.id = child_row.exam_id
    where parent_row.id is null
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_components') as child_row(grade_plan_id text)
    left join pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_plans') as parent_row(id text) on parent_row.id = child_row.grade_plan_id
    where parent_row.id is null
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_thresholds') as child_row(grade_plan_id text)
    left join pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_plans') as parent_row(id text) on parent_row.id = child_row.grade_plan_id
    where parent_row.id is null
  ) then
    raise exception using errcode = '23503', message = 'talevo_orphan_child_relation';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(qa_tables -> 'finance_transactions') as transaction_row(category_id text, type text)
    left join pg_catalog.jsonb_to_recordset(qa_tables -> 'finance_categories') as category_row(id text, type text)
      on category_row.id = transaction_row.category_id and category_row.type = transaction_row.type
    where category_row.id is null
  ) then
    raise exception using errcode = '23503', message = 'talevo_finance_category_relation_invalid';
  end if;

  select pg_catalog.jsonb_object_agg(table_entry.key, pg_catalog.jsonb_array_length(table_entry.value))
  into qa_counts
  from pg_catalog.jsonb_each(qa_tables) as table_entry(key, value);

  select pg_catalog.jsonb_build_object(
    'income', coalesce(pg_catalog.sum(transaction_row.amount) filter (where transaction_row.type = 'income'), 0),
    'expense', coalesce(pg_catalog.sum(transaction_row.amount) filter (where transaction_row.type = 'expense'), 0),
    'saving', coalesce(pg_catalog.sum(transaction_row.amount) filter (where transaction_row.type = 'saving'), 0),
    'remaining',
      coalesce(pg_catalog.sum(transaction_row.amount) filter (where transaction_row.type = 'income'), 0)
      - coalesce(pg_catalog.sum(transaction_row.amount) filter (where transaction_row.type = 'expense'), 0)
      - coalesce(pg_catalog.sum(transaction_row.amount) filter (where transaction_row.type = 'saving'), 0)
  )
  into qa_finance_totals
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'finance_transactions') as transaction_row(type text, amount numeric);

  qa_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object('schema_version', 8, 'tables', qa_tables)::text, 'UTF8')),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(qa_uid::text, 8048));

  select sync_row.snapshot_hash, sync_row.migration_status, sync_row.import_id
  into qa_existing_hash, qa_existing_status, qa_existing_import_id
  from public.app_state_sync as sync_row
  where sync_row.user_id = qa_uid
  for update;

  if qa_existing_hash = qa_fingerprint and qa_existing_status in ('imported', 'verified', 'verification_failed') then
    return pg_catalog.jsonb_build_object(
      'status', 'already_imported',
      'import_id', qa_existing_import_id,
      'snapshot_hash', qa_existing_hash,
      'counts', qa_counts
    );
  end if;
  if qa_existing_hash is not null and qa_existing_hash <> qa_fingerprint then
    raise exception using errcode = '23505', message = 'talevo_different_import_already_recorded';
  end if;

  select
    exists(select 1 from public.class_schedules as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.tasks as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.task_subtasks as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.task_attachments as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.task_completion_history as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.exams as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.exam_topics as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.grade_plans as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.grade_components as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.grade_thresholds as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.course_notes as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.attendance_records as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.finance_categories as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.finance_transactions as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.saving_goals as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.finance_settings as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.learning_goals as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.notifications as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.dismissed_notification_events as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.app_settings as row_data where row_data.user_id = qa_uid)
    or exists(select 1 from public.chat_messages as row_data where row_data.user_id = qa_uid)
  into qa_domain_data_exists;
  if qa_domain_data_exists then
    raise exception using errcode = '23505', message = 'talevo_cloud_account_not_empty';
  end if;

  insert into public.profiles (user_id, display_name, major, university, updated_at)
  select qa_uid, source_row.display_name, source_row.major, source_row.university, pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'profiles') as source_row(display_name text, major text, university text)
  on conflict (user_id) do update set display_name = excluded.display_name, major = excluded.major, university = excluded.university, updated_at = excluded.updated_at;

  insert into public.academic_terms (user_id, level, term, academic_year, label, updated_at)
  select qa_uid, source_row.level, source_row.term, source_row.academic_year, source_row.label, pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'academic_terms') as source_row(level text, term text, academic_year text, label text)
  on conflict (user_id) do update set level = excluded.level, term = excluded.term, academic_year = excluded.academic_year, label = excluded.label, updated_at = excluded.updated_at;

  insert into public.class_schedules (user_id, id, course_id, name, teacher, room, color, day, start_time, end_time, note)
  select qa_uid, source_row.id, source_row.course_id, source_row.name, source_row.teacher, source_row.room, source_row.color, source_row.day, source_row.start_time, source_row.end_time, source_row.note
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'class_schedules') as source_row(id text, course_id text, name text, teacher text, room text, color text, day smallint, start_time time, end_time time, note text);

  insert into public.tasks (user_id, id, title, course_id, description, due_label, due_date, estimate, status, color, attachment_label, completed_at)
  select qa_uid, source_row.id, source_row.title, source_row.course_id, source_row.description, source_row.due_label, source_row.due_date, source_row.estimate, source_row.status, source_row.color, source_row.attachment_label, source_row.completed_at
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'tasks') as source_row(id text, title text, course_id text, description text, due_label text, due_date timestamptz, estimate text, status text, color text, attachment_label text, completed_at timestamptz);

  insert into public.task_subtasks (user_id, task_id, id, title, completed, completed_at, position)
  select qa_uid, source_row.task_id, source_row.id, source_row.title, source_row.completed, source_row.completed_at, source_row.position
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'task_subtasks') as source_row(task_id text, id text, title text, completed boolean, completed_at timestamptz, position integer);

  insert into public.task_attachments (user_id, task_id, id, name, mime_type, size_bytes, kind, created_at)
  select qa_uid, source_row.task_id, source_row.id, source_row.name, source_row.mime_type, source_row.size_bytes, source_row.kind, source_row.created_at
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'task_attachments') as source_row(task_id text, id text, name text, mime_type text, size_bytes bigint, kind text, created_at timestamptz);

  insert into public.task_completion_history (user_id, id, original_task_id, course_id, completed_at, due_date, estimate, subtask_count)
  select qa_uid, source_row.id, source_row.original_task_id, source_row.course_id, source_row.completed_at, source_row.due_date, source_row.estimate, source_row.subtask_count
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'task_completion_history') as source_row(id text, original_task_id text, course_id text, completed_at timestamptz, due_date timestamptz, estimate text, subtask_count integer);

  insert into public.exams (user_id, id, course_id, title, type, start_at, end_at, room, note, completed_at, created_at, updated_at)
  select qa_uid, source_row.id, source_row.course_id, source_row.title, source_row.type, source_row.start_at, source_row.end_at, source_row.room, source_row.note, source_row.completed_at, source_row.created_at, source_row.updated_at
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'exams') as source_row(id text, course_id text, title text, type text, start_at timestamptz, end_at timestamptz, room text, note text, completed_at timestamptz, created_at timestamptz, updated_at timestamptz);

  insert into public.exam_topics (user_id, exam_id, id, title, completed, completed_at, position)
  select qa_uid, source_row.exam_id, source_row.id, source_row.title, source_row.completed, source_row.completed_at, source_row.position
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'exam_topics') as source_row(exam_id text, id text, title text, completed boolean, completed_at timestamptz, position integer);

  insert into public.grade_plans (user_id, id, course_id, target_grade)
  select qa_uid, source_row.id, source_row.course_id, source_row.target_grade
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_plans') as source_row(id text, course_id text, target_grade text);

  insert into public.grade_components (user_id, grade_plan_id, id, name, weight, max_score, earned_score, note, position)
  select qa_uid, source_row.grade_plan_id, source_row.id, source_row.name, source_row.weight, source_row.max_score, source_row.earned_score, source_row.note, source_row.position
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_components') as source_row(grade_plan_id text, id text, name text, weight numeric, max_score numeric, earned_score numeric, note text, position integer);

  insert into public.grade_thresholds (user_id, grade_plan_id, label, minimum_percent, position)
  select qa_uid, source_row.grade_plan_id, source_row.label, source_row.minimum_percent, source_row.position
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'grade_thresholds') as source_row(grade_plan_id text, label text, minimum_percent numeric, position integer);

  insert into public.course_notes (user_id, id, course_id, title, content, tags, pinned, class_date, created_at, updated_at)
  select qa_uid, source_row.id, source_row.course_id, source_row.title, source_row.content, source_row.tags, source_row.pinned, source_row.class_date, source_row.created_at, source_row.updated_at
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'course_notes') as source_row(id text, course_id text, title text, content text, tags text[], pinned boolean, class_date date, created_at timestamptz, updated_at timestamptz);

  insert into public.attendance_records (user_id, id, course_id, date, start_time, status, note, created_at, updated_at)
  select qa_uid, source_row.id, source_row.course_id, source_row.date, source_row.start_time, source_row.status, source_row.note, source_row.created_at, source_row.updated_at
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'attendance_records') as source_row(id text, course_id text, date date, start_time time, status text, note text, created_at timestamptz, updated_at timestamptz);

  insert into public.finance_categories (user_id, id, name, type, icon, color, monthly_budget, created_at, is_default)
  select qa_uid, source_row.id, source_row.name, source_row.type, source_row.icon, source_row.color, source_row.monthly_budget, source_row.created_at, source_row.is_default
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'finance_categories') as source_row(id text, name text, type text, icon text, color text, monthly_budget numeric, created_at timestamptz, is_default boolean);

  insert into public.finance_transactions (user_id, id, type, title, amount, category_id, date, note)
  select qa_uid, source_row.id, source_row.type, source_row.title, source_row.amount, source_row.category_id, source_row.date, source_row.note
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'finance_transactions') as source_row(id text, type text, title text, amount numeric, category_id text, date date, note text);

  insert into public.saving_goals (user_id, id, title, target_amount, saved_amount)
  select qa_uid, source_row.id, source_row.title, source_row.target_amount, source_row.saved_amount
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'saving_goals') as source_row(id text, title text, target_amount numeric, saved_amount numeric);

  insert into public.finance_settings (user_id, daily_budget, selected_month, updated_at)
  select qa_uid, source_row.daily_budget, source_row.selected_month, pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'finance_settings') as source_row(daily_budget numeric, selected_month text);

  insert into public.learning_goals (user_id, weekly_study_hours, early_submission_days, exam_preparation_days, personal_goal, updated_at)
  select qa_uid, source_row.weekly_study_hours, source_row.early_submission_days, source_row.exam_preparation_days, source_row.personal_goal, pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'learning_goals') as source_row(weekly_study_hours numeric, early_submission_days integer, exam_preparation_days integer, personal_goal text);

  insert into public.notifications (user_id, id, type, priority, title, message, created_at, read_at, href, event_key, source_id, metadata)
  select qa_uid, source_row.id, source_row.type, source_row.priority, source_row.title, source_row.message, source_row.created_at, source_row.read_at, source_row.href, source_row.event_key, source_row.source_id, source_row.metadata
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'notifications') as source_row(id text, type text, priority text, title text, message text, created_at timestamptz, read_at timestamptz, href text, event_key text, source_id text, metadata jsonb);

  insert into public.dismissed_notification_events (user_id, event_key)
  select qa_uid, source_row.event_key
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'dismissed_notification_events') as source_row(event_key text);

  insert into public.app_settings (user_id, timezone, date_format, year_system, alerts_enabled, task_24h, task_12h, deadline_risk, morning_0600, daily_0700, class_30m, class_end_10m, exam_7d, exam_3d, exam_1d, exam_morning, weekly_radar, updated_at)
  select qa_uid, source_row.timezone, source_row.date_format, source_row.year_system, source_row.alerts_enabled, source_row.task_24h, source_row.task_12h, source_row.deadline_risk, source_row.morning_0600, source_row.daily_0700, source_row.class_30m, source_row.class_end_10m, source_row.exam_7d, source_row.exam_3d, source_row.exam_1d, source_row.exam_morning, source_row.weekly_radar, pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'app_settings') as source_row(timezone text, date_format text, year_system text, alerts_enabled boolean, task_24h boolean, task_12h boolean, deadline_risk boolean, morning_0600 boolean, daily_0700 boolean, class_30m boolean, class_end_10m boolean, exam_7d boolean, exam_3d boolean, exam_1d boolean, exam_morning boolean, weekly_radar boolean);

  insert into public.chat_messages (user_id, id, role, content, kind, position)
  select qa_uid, source_row.id, source_row.role, source_row.content, source_row.kind, source_row.position
  from pg_catalog.jsonb_to_recordset(qa_tables -> 'chat_messages') as source_row(id text, role text, content text, kind text, position bigint);

  insert into public.app_state_sync (user_id, local_schema_version, local_saved_at, local_writer_id, snapshot_hash, import_id, migration_status, expected_counts, expected_finance_totals, validated_at, imported_at, verified_at, updated_at)
  values (qa_uid, 8, nullif(payload ->> 'local_saved_at', '')::timestamptz, nullif(payload ->> 'local_writer_id', ''), qa_fingerprint, qa_import_id, 'imported', qa_counts, qa_finance_totals, pg_catalog.now(), pg_catalog.now(), null, pg_catalog.now())
  on conflict (user_id) do update set local_schema_version = excluded.local_schema_version, local_saved_at = excluded.local_saved_at, local_writer_id = excluded.local_writer_id, snapshot_hash = excluded.snapshot_hash, import_id = excluded.import_id, migration_status = excluded.migration_status, expected_counts = excluded.expected_counts, expected_finance_totals = excluded.expected_finance_totals, validated_at = excluded.validated_at, imported_at = excluded.imported_at, verified_at = null, updated_at = excluded.updated_at;

  return pg_catalog.jsonb_build_object('status', 'imported', 'import_id', qa_import_id, 'snapshot_hash', qa_fingerprint, 'counts', qa_counts);
end;
$$;

revoke all on function public.get_talevo_migration_qa_access() from public;
revoke all on function public.get_talevo_migration_qa_access() from anon;
revoke all on function public.import_talevo_v8(jsonb) from public;
revoke all on function public.import_talevo_v8(jsonb) from anon;
grant execute on function public.get_talevo_migration_qa_access() to authenticated;
grant execute on function public.import_talevo_v8(jsonb) to authenticated;
