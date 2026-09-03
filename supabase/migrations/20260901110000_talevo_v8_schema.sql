-- TALEVO AppState v8 normalized schema.
-- Review this file and the RLS migration before running either file.
-- This migration intentionally contains no legacy Academic GPS, Life Rescue,
-- or Did I Submit fields.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  major text not null default '' check (char_length(major) <= 80),
  university text not null default '' check (char_length(university) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_terms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level text not null default '' check (char_length(level) <= 60),
  term text not null default '' check (char_length(term) <= 60),
  academic_year text not null default '' check (academic_year = '' or academic_year ~ '^\d{4}$'),
  label text check (label is null or char_length(label) <= 60),
  updated_at timestamptz not null default now()
);

create table public.class_schedules (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  course_id text not null,
  name text not null,
  teacher text not null default '',
  room text not null default '',
  color text not null,
  day smallint not null check (day between 0 and 6),
  start_time time not null,
  end_time time not null,
  note text,
  primary key (user_id, id),
  check (start_time < end_time)
);

create table public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  course_id text,
  description text not null default '',
  due_label text not null default '',
  due_date timestamptz not null,
  estimate text not null default '',
  status text not null check (status in ('todo', 'doing', 'completed')),
  color text not null,
  attachment_label text,
  completed_at timestamptz,
  primary key (user_id, id)
);

create table public.task_subtasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  id text not null,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  position integer not null default 0 check (position >= 0),
  primary key (user_id, task_id, id),
  foreign key (user_id, task_id) references public.tasks(user_id, id) on delete cascade
);

create table public.task_attachments (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  id text not null,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  kind text not null check (kind in ('image', 'file')),
  created_at timestamptz not null,
  primary key (user_id, task_id, id),
  foreign key (user_id, task_id) references public.tasks(user_id, id) on delete cascade
);

create table public.task_completion_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  original_task_id text not null,
  course_id text,
  completed_at timestamptz not null,
  due_date timestamptz,
  estimate text,
  subtask_count integer not null default 0 check (subtask_count >= 0),
  primary key (user_id, id),
  unique (user_id, original_task_id)
);

create table public.exams (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  course_id text not null,
  title text not null,
  type text not null check (type in ('quiz', 'midterm', 'final', 'practical', 'presentation', 'other')),
  start_at timestamptz not null,
  end_at timestamptz,
  room text,
  note text,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id),
  check (end_at is null or start_at < end_at)
);

create table public.exam_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id text not null,
  id text not null,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  position integer not null default 0 check (position >= 0),
  primary key (user_id, exam_id, id),
  foreign key (user_id, exam_id) references public.exams(user_id, id) on delete cascade
);

create table public.grade_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  course_id text not null,
  target_grade text,
  primary key (user_id, id),
  unique (user_id, course_id)
);

create table public.grade_components (
  user_id uuid not null references auth.users(id) on delete cascade,
  grade_plan_id text not null,
  id text not null,
  name text not null,
  weight numeric(7,2) not null check (weight >= 0 and weight <= 100),
  max_score numeric(12,2) not null check (max_score > 0),
  earned_score numeric(12,2) check (earned_score >= 0 and earned_score <= max_score),
  note text,
  position integer not null default 0 check (position >= 0),
  primary key (user_id, grade_plan_id, id),
  foreign key (user_id, grade_plan_id) references public.grade_plans(user_id, id) on delete cascade
);

create table public.grade_thresholds (
  user_id uuid not null references auth.users(id) on delete cascade,
  grade_plan_id text not null,
  label text not null,
  minimum_percent numeric(7,2) not null check (minimum_percent between 0 and 100),
  position integer not null default 0 check (position >= 0),
  primary key (user_id, grade_plan_id, position),
  unique (user_id, grade_plan_id, label),
  foreign key (user_id, grade_plan_id) references public.grade_plans(user_id, id) on delete cascade
);

create table public.course_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  course_id text not null,
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  class_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table public.attendance_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  course_id text not null,
  date date not null,
  start_time time,
  status text not null check (status in ('present', 'late', 'leave', 'absent', 'cancelled')),
  note text,
  created_at timestamptz not null,
  updated_at timestamptz,
  primary key (user_id, id),
  unique nulls not distinct (user_id, course_id, date, start_time)
);

create table public.finance_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(btrim(name)) >= 2),
  type text not null check (type in ('income', 'expense', 'saving')),
  icon text not null,
  color text not null check (color in ('purple', 'blue', 'orange', 'yellow', 'green', 'cyan', 'pink', 'magenta')),
  monthly_budget numeric(14,2) check (monthly_budget >= 0),
  created_at timestamptz,
  is_default boolean not null default false,
  primary key (user_id, id),
  unique (user_id, id, type)
);

create table public.finance_transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('income', 'expense', 'saving')),
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  category_id text not null,
  date date not null,
  note text,
  primary key (user_id, id),
  foreign key (user_id, category_id, type) references public.finance_categories(user_id, id, type) on delete restrict
);

create table public.saving_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0 and saved_amount <= target_amount),
  primary key (user_id, id)
);

create table public.finance_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_budget numeric(14,2) not null default 0 check (daily_budget >= 0),
  selected_month text not null check (selected_month ~ '^\d{4}-\d{2}$'),
  updated_at timestamptz not null default now()
);

create table public.learning_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_study_hours numeric(7,2) not null default 0 check (weekly_study_hours >= 0),
  early_submission_days integer not null default 0 check (early_submission_days >= 0),
  exam_preparation_days integer not null default 0 check (exam_preparation_days >= 0),
  personal_goal text not null default '',
  updated_at timestamptz not null default now()
);

create table public.notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('task_deadline', 'deadline_risk', 'morning_summary', 'daily_brief', 'class_upcoming', 'class_ending', 'exam_upcoming', 'exam_today', 'weekly_radar', 'academic_weather', 'system')),
  priority text not null check (priority in ('high', 'medium', 'normal')),
  title text not null,
  message text not null,
  created_at timestamptz not null,
  read_at timestamptz,
  href text,
  event_key text not null,
  source_id text,
  metadata jsonb,
  primary key (user_id, id),
  unique (user_id, event_key),
  check (metadata is null or jsonb_typeof(metadata) = 'object')
);

create table public.dismissed_notification_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

create table public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Bangkok' check (timezone = 'Asia/Bangkok'),
  date_format text not null check (date_format in ('วัน/เดือน/ปี', 'เดือน/วัน/ปี')),
  year_system text not null check (year_system in ('พ.ศ.', 'ค.ศ.')),
  alerts_enabled boolean not null default true,
  task_24h boolean not null default true,
  task_12h boolean not null default true,
  deadline_risk boolean not null default true,
  morning_0600 boolean not null default true,
  daily_0700 boolean not null default true,
  class_30m boolean not null default true,
  class_end_10m boolean not null default true,
  exam_7d boolean not null default true,
  exam_3d boolean not null default true,
  exam_1d boolean not null default true,
  exam_morning boolean not null default true,
  weekly_radar boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  role text not null check (role in ('assistant', 'user')),
  content text not null,
  kind text check (kind in ('text', 'task-summary')),
  position bigint not null default 0 check (position >= 0),
  primary key (user_id, id)
);

create table public.app_state_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_schema_version integer not null check (local_schema_version = 8),
  local_saved_at timestamptz,
  local_writer_id text,
  snapshot_hash text,
  migration_status text not null default 'pending_review' check (migration_status in ('pending_review', 'validated', 'imported', 'failed')),
  validated_at timestamptz,
  imported_at timestamptz,
  updated_at timestamptz not null default now()
);

create index class_schedules_user_course_idx on public.class_schedules(user_id, course_id);
create index tasks_user_due_idx on public.tasks(user_id, due_date);
create index exams_user_start_idx on public.exams(user_id, start_at);
create index notes_user_course_idx on public.course_notes(user_id, course_id);
create index attendance_user_course_date_idx on public.attendance_records(user_id, course_id, date);
create unique index finance_categories_user_name_ci_idx on public.finance_categories(user_id, lower(btrim(name)));
create index finance_transactions_user_date_idx on public.finance_transactions(user_id, date desc);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
