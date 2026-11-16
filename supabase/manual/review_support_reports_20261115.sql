-- REVIEW REQUIRED. Creates a private support inbox; no existing app records are changed.
-- Grants support-admin access ONLY to the existing verified account named below.
begin;
create table public.support_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.support_admins enable row level security;
revoke all on public.support_admins from public, anon, authenticated;
insert into public.support_admins(user_id) select id from auth.users where lower(email) = 'tarthanawutk@gmail.com' and email_confirmed_at is not null;
do $$ begin if (select count(*) from public.support_admins) <> 1 then raise exception 'Expected exactly one verified admin account'; end if; end $$;
create function public.is_support_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.support_admins where user_id = (select auth.uid())) $$;
revoke all on function public.is_support_admin() from public, anon;
grant execute on function public.is_support_admin() to authenticated;
create table public.support_reports(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, message text not null check (char_length(trim(message)) between 10 and 2000), created_at timestamptz not null default now(), read_at timestamptz);
alter table public.support_reports enable row level security;
revoke all on public.support_reports from public, anon, authenticated;
grant insert(user_id,message), select on public.support_reports to authenticated;
grant update(read_at) on public.support_reports to authenticated;
create policy submit_report on public.support_reports for insert to authenticated with check(user_id = (select auth.uid()));
create policy admin_read on public.support_reports for select to authenticated using((select public.is_support_admin()));
create policy admin_mark_read on public.support_reports for update to authenticated using((select public.is_support_admin())) with check((select public.is_support_admin()));
create index support_reports_created on public.support_reports(created_at desc);
commit;
