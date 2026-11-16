-- Add configurable summary times; existing notification data is preserved.
alter table public.app_settings
 add column if not exists daily_summary_time text not null default '06:00' check (daily_summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 add column if not exists weekly_summary_time text not null default '06:00' check (weekly_summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 add column if not exists weekly_summary_day integer not null default 6 check (weekly_summary_day between 0 and 6);
