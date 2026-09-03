-- TALEVO AppState v8 row-level security.
-- Run only after 20260901110000_talevo_v8_schema.sql has been reviewed and applied.

do $$
declare
  table_name text;
  user_content_tables constant text[] := array[
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
    'chat_messages'
  ];
begin
  foreach table_name in array user_content_tables loop
    execute format('alter table public.%I enable row level security', table_name);

    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      table_name
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_select_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_insert_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id) with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_update_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      table_name || '_delete_own',
      table_name
    );
  end loop;
end
$$;

-- app_state_sync is migration control metadata, not user-editable app content.
-- A future atomic import RPC will be the only writer; authenticated clients may
-- only inspect their own migration status.
alter table public.app_state_sync enable row level security;
revoke all on table public.app_state_sync from anon;
revoke all on table public.app_state_sync from authenticated;
grant select on table public.app_state_sync to authenticated;

create policy app_state_sync_select_own
  on public.app_state_sync
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
