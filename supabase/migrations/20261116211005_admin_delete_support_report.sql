-- Admin-only deletion for a support inbox entry.
-- Deleting the report also cascades its replies and removes its linked bell / push queue entries.
create function public.support_admin_delete_report(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_support_admin(), false) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.support_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Support report not found' using errcode = 'P0002';
  end if;

  delete from public.notifications
  where event_key = 'support-report-' || target_report_id::text;

  delete from public.talevo_scheduled_notifications
  where event_key = 'support-report-' || target_report_id::text;

  delete from public.support_reports
  where id = target_report_id;
end;
$$;

revoke all on function public.support_admin_delete_report(uuid) from public, anon;
grant execute on function public.support_admin_delete_report(uuid) to authenticated;
