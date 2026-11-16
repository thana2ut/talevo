-- REVIEW: admin-only aggregate and report sender lookup. No account data is changed.
begin;
create function public.support_admin_dashboard() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_support_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object(
  'account_count', (select count(*) from auth.users where is_anonymous is not true),
  'unread_count', (select count(*) from public.support_reports where read_at is null),
  'reports', coalesce((select jsonb_agg(row_to_json(r)) from (
   select s.id,s.message,s.created_at,s.read_at,p.display_name,p.major,p.university,u.email,s.user_id
   from public.support_reports s left join auth.users u on u.id=s.user_id left join public.profiles p on p.user_id=s.user_id
   order by s.created_at desc limit 100
  ) r),'[]'::jsonb));
end $$;
revoke all on function public.support_admin_dashboard() from public,anon;
grant execute on function public.support_admin_dashboard() to authenticated;
commit;
