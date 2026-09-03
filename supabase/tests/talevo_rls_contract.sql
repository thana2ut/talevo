-- TALEVO static schema/RLS catalog contract.
-- Run only after the three reviewed migrations, in the same Supabase project.
-- This is a read-only catalog test. It does not replace authenticated User A/B tests.

do $$
declare
  table_name text;
  content_tables constant text[] := array[
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
  rls_enabled boolean;
  policy_count integer;
  total_policy_count integer;
  owner_fk_count integer;
  select_qual text;
  insert_check text;
  update_qual text;
  update_check text;
  delete_qual text;
begin
  foreach table_name in array content_tables loop
    select c.relrowsecurity
      into rls_enabled
      from pg_catalog.pg_class c
      where c.oid = format('public.%I', table_name)::regclass;

    if rls_enabled is not true then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;

    select count(*)
      into owner_fk_count
      from pg_catalog.pg_constraint constraint_row
      join lateral unnest(constraint_row.conkey) with ordinality as child_key(attnum, position)
        on true
      join lateral unnest(constraint_row.confkey) with ordinality as parent_key(attnum, position)
        on parent_key.position = child_key.position
      join pg_catalog.pg_attribute child_column
        on child_column.attrelid = constraint_row.conrelid
       and child_column.attnum = child_key.attnum
      join pg_catalog.pg_attribute parent_column
        on parent_column.attrelid = constraint_row.confrelid
       and parent_column.attnum = parent_key.attnum
      where constraint_row.contype = 'f'
        and constraint_row.conrelid = format('public.%I', table_name)::regclass
        and constraint_row.confrelid = 'auth.users'::regclass
        and cardinality(constraint_row.conkey) = 1
        and child_column.attname = 'user_id'
        and parent_column.attname = 'id';

    if owner_fk_count <> 1 then
      raise exception 'Expected one user_id -> auth.users(id) FK on public.%, found %', table_name, owner_fk_count;
    end if;

    select count(*)
      into total_policy_count
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = table_name;

    select
      count(*),
      max(qual) filter (where cmd = 'SELECT'),
      max(with_check) filter (where cmd = 'INSERT'),
      max(qual) filter (where cmd = 'UPDATE'),
      max(with_check) filter (where cmd = 'UPDATE'),
      max(qual) filter (where cmd = 'DELETE')
      into policy_count, select_qual, insert_check, update_qual, update_check, delete_qual
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and roles = array['authenticated'::name]
        and permissive = 'PERMISSIVE';

    if total_policy_count <> 4 or policy_count <> 4 then
      raise exception 'Expected exactly four authenticated owner policies on public.% (total %, matching %)', table_name, total_policy_count, policy_count;
    end if;

    if lower(coalesce(select_qual, '')) not like '%auth.uid()%'
       or lower(select_qual) not like '%is not null%'
       or lower(select_qual) not like '%user_id%' then
      raise exception 'SELECT owner predicate is incomplete on public.%: %', table_name, select_qual;
    end if;

    if lower(coalesce(insert_check, '')) not like '%auth.uid()%'
       or lower(insert_check) not like '%is not null%'
       or lower(insert_check) not like '%user_id%' then
      raise exception 'INSERT owner check is incomplete on public.%: %', table_name, insert_check;
    end if;

    if lower(coalesce(update_qual, '')) not like '%auth.uid()%'
       or lower(update_qual) not like '%is not null%'
       or lower(update_qual) not like '%user_id%'
       or lower(coalesce(update_check, '')) not like '%auth.uid()%'
       or lower(update_check) not like '%is not null%'
       or lower(update_check) not like '%user_id%' then
      raise exception 'UPDATE owner USING/WITH CHECK is incomplete on public.%', table_name;
    end if;

    if lower(coalesce(delete_qual, '')) not like '%auth.uid()%'
       or lower(delete_qual) not like '%is not null%'
       or lower(delete_qual) not like '%user_id%' then
      raise exception 'DELETE owner predicate is incomplete on public.%: %', table_name, delete_qual;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', table_name), 'DELETE') then
      raise exception 'anon still has a private CRUD privilege on public.%', table_name;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       or not has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       or not has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       or not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'authenticated CRUD grants are incomplete on public.%', table_name;
    end if;

    if has_table_privilege('authenticated', format('public.%I', table_name), 'TRUNCATE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'REFERENCES')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'TRIGGER') then
      raise exception 'authenticated has an excessive privilege on public.%', table_name;
    end if;
  end loop;

  select c.relrowsecurity
    into rls_enabled
    from pg_catalog.pg_class c
    where c.oid = 'public.app_state_sync'::regclass;

  if rls_enabled is not true then
    raise exception 'RLS is not enabled on public.app_state_sync';
  end if;

  select count(*)
    into owner_fk_count
    from pg_catalog.pg_constraint constraint_row
    join lateral unnest(constraint_row.conkey) with ordinality as child_key(attnum, position)
      on true
    join lateral unnest(constraint_row.confkey) with ordinality as parent_key(attnum, position)
      on parent_key.position = child_key.position
    join pg_catalog.pg_attribute child_column
      on child_column.attrelid = constraint_row.conrelid
     and child_column.attnum = child_key.attnum
    join pg_catalog.pg_attribute parent_column
      on parent_column.attrelid = constraint_row.confrelid
     and parent_column.attnum = parent_key.attnum
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.app_state_sync'::regclass
      and constraint_row.confrelid = 'auth.users'::regclass
      and cardinality(constraint_row.conkey) = 1
      and child_column.attname = 'user_id'
      and parent_column.attname = 'id';

  if owner_fk_count <> 1 then
    raise exception 'Expected one user_id -> auth.users(id) FK on public.app_state_sync, found %', owner_fk_count;
  end if;

  select count(*)
    into total_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'app_state_sync';

  select count(*), max(qual) filter (where cmd = 'SELECT')
    into policy_count, select_qual
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'app_state_sync'
      and roles = array['authenticated'::name]
      and permissive = 'PERMISSIVE';

  if total_policy_count <> 1
     or policy_count <> 1
     or lower(coalesce(select_qual, '')) not like '%auth.uid()%'
     or lower(select_qual) not like '%is not null%'
     or lower(select_qual) not like '%user_id%' then
    raise exception 'app_state_sync must have one authenticated owner SELECT policy';
  end if;

  if has_table_privilege('anon', 'public.app_state_sync', 'SELECT')
     or has_table_privilege('anon', 'public.app_state_sync', 'INSERT')
     or has_table_privilege('anon', 'public.app_state_sync', 'UPDATE')
     or has_table_privilege('anon', 'public.app_state_sync', 'DELETE') then
    raise exception 'anon still has a privilege on public.app_state_sync';
  end if;

  if not has_table_privilege('authenticated', 'public.app_state_sync', 'SELECT')
     or has_table_privilege('authenticated', 'public.app_state_sync', 'INSERT')
     or has_table_privilege('authenticated', 'public.app_state_sync', 'UPDATE')
     or has_table_privilege('authenticated', 'public.app_state_sync', 'DELETE') then
    raise exception 'app_state_sync must be authenticated SELECT-only';
  end if;

  if to_regclass('public.projects') is not null then
    raise exception 'Unused public.projects table must not be deployed';
  end if;
end
$$;

do $$
declare
  relation record;
  constraint_oid oid;
  child_columns text[];
  parent_columns text[];
  delete_action "char";
begin
  for relation in
    select *
      from (values
        ('task_subtasks', 'tasks', array['user_id', 'task_id']::text[], array['user_id', 'id']::text[], 'c'::"char"),
        ('task_attachments', 'tasks', array['user_id', 'task_id']::text[], array['user_id', 'id']::text[], 'c'::"char"),
        ('exam_topics', 'exams', array['user_id', 'exam_id']::text[], array['user_id', 'id']::text[], 'c'::"char"),
        ('grade_components', 'grade_plans', array['user_id', 'grade_plan_id']::text[], array['user_id', 'id']::text[], 'c'::"char"),
        ('grade_thresholds', 'grade_plans', array['user_id', 'grade_plan_id']::text[], array['user_id', 'id']::text[], 'c'::"char"),
        ('finance_transactions', 'finance_categories', array['user_id', 'category_id', 'type']::text[], array['user_id', 'id', 'type']::text[], 'r'::"char")
      ) as expected(child_table, parent_table, expected_child_columns, expected_parent_columns, expected_delete_action)
  loop
    select c.oid, c.confdeltype
      into constraint_oid, delete_action
      from pg_catalog.pg_constraint c
      where c.contype = 'f'
        and c.conrelid = format('public.%I', relation.child_table)::regclass
        and c.confrelid = format('public.%I', relation.parent_table)::regclass;

    if constraint_oid is null then
      raise exception 'Missing owner-preserving FK: public.% -> public.%', relation.child_table, relation.parent_table;
    end if;

    select array_agg(a.attname::text order by key_part.position)
      into child_columns
      from pg_catalog.pg_constraint c
      join lateral unnest(c.conkey) with ordinality as key_part(attnum, position) on true
      join pg_catalog.pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = key_part.attnum
      where c.oid = constraint_oid;

    select array_agg(a.attname::text order by key_part.position)
      into parent_columns
      from pg_catalog.pg_constraint c
      join lateral unnest(c.confkey) with ordinality as key_part(attnum, position) on true
      join pg_catalog.pg_attribute a
        on a.attrelid = c.confrelid
       and a.attnum = key_part.attnum
      where c.oid = constraint_oid;

    if child_columns <> relation.expected_child_columns
       or parent_columns <> relation.expected_parent_columns
       or delete_action <> relation.expected_delete_action then
      raise exception 'Unsafe FK definition for public.% -> public.% (child %, parent %, delete action %)',
        relation.child_table, relation.parent_table, child_columns, parent_columns, delete_action;
    end if;
  end loop;
end
$$;

select 'TALEVO static schema/RLS catalog contract passed' as result;
