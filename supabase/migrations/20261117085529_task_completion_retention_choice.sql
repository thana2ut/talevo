-- Store a user's choice to keep a completed task beyond the 7-day auto-delete window.
alter table public.tasks
  add column if not exists keep_completed boolean not null default false;
