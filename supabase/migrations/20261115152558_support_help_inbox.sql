-- Separate help requests from problem reports while preserving existing rows as problem reports.
alter table public.support_reports
  add column category text not null default 'problem'
  check (category in ('problem', 'help'));

grant insert (user_id, message, category) on public.support_reports to authenticated;

create or replace function public.support_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_support_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'account_count', (select count(*) from auth.users where is_anonymous is not true),
    'unread_count', (select count(*) from public.support_reports where read_at is null),
    'unread_problem_count', (select count(*) from public.support_reports where category = 'problem' and read_at is null),
    'unread_help_count', (select count(*) from public.support_reports where category = 'help' and read_at is null),
    'reports', coalesce((
      select jsonb_agg(row_to_json(r)) from (
        select s.id, s.category, s.message, s.created_at, s.read_at,
               p.display_name, p.major, p.university, u.email, s.user_id
        from public.support_reports s
        left join auth.users u on u.id = s.user_id
        left join public.profiles p on p.user_id = s.user_id
        where s.category = 'problem'
        order by s.created_at desc
        limit 100
      ) r
    ), '[]'::jsonb),
    'help_requests', coalesce((
      select jsonb_agg(row_to_json(r)) from (
        select s.id, s.category, s.message, s.created_at, s.read_at,
               p.display_name, p.major, p.university, u.email, s.user_id
        from public.support_reports s
        left join auth.users u on u.id = s.user_id
        left join public.profiles p on p.user_id = s.user_id
        where s.category = 'help'
        order by s.created_at desc
        limit 100
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.support_admin_dashboard() from public, anon;
grant execute on function public.support_admin_dashboard() to authenticated;
