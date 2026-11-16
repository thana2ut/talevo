-- Awaiting owner approval. Adds replies and queues notifications; no existing reports are removed.
create table public.support_replies (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.support_reports(id) on delete cascade,
 admin_id uuid not null references auth.users(id),
 message text not null check (char_length(message) between 1 and 2000),
 created_at timestamptz not null default now()
);
alter table public.support_replies enable row level security;
revoke all on public.support_replies from public, anon, authenticated;
grant select on public.support_replies to authenticated;
create policy support_reply_read on public.support_replies for select to authenticated using (
 public.is_support_admin() or exists(select 1 from public.support_reports s where s.id=report_id and s.user_id=(select auth.uid()))
);
create index support_replies_report_idx on public.support_replies(report_id,created_at);
create function public.support_admin_reply(report_id uuid,reply_message text) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid; reply_id uuid; reply_text text := btrim(reply_message);
begin
 if not public.is_support_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 if reply_text is null or char_length(reply_text) not between 1 and 2000 then raise exception 'Invalid reply' using errcode='22023'; end if;
 select s.user_id into recipient from public.support_reports s where s.id=report_id;
 if recipient is null then raise exception 'Report not found'; end if;
 insert into public.support_replies(report_id,admin_id,message) values(report_id,auth.uid(),reply_text) returning id into reply_id;
 insert into public.notifications(user_id,id,type,priority,title,message,created_at,href,event_key,source_id,metadata)
 values(recipient,'support-reply-'||reply_id,'system','normal','แอดมินตอบกลับ',reply_text,now(),'/notifications','support-reply-'||reply_id,report_id::text,jsonb_build_object('report_id',report_id));
 insert into public.talevo_scheduled_notifications(user_id,event_key,send_at,title,body,href)
 values(recipient,'support-reply-'||reply_id,now(),'แอดมินตอบกลับ',left(reply_text,180),'/notifications');
end $$;
revoke all on function public.support_admin_reply(uuid,text) from public,anon;
grant execute on function public.support_admin_reply(uuid,text) to authenticated;
create function public.support_report_notify_admin() returns trigger
language plpgsql security definer set search_path='' as $$
declare admin_user uuid; heading text;
begin
 heading := case when new.category='help' then 'คำขอความช่วยเหลือใหม่' else 'รายงานปัญหาใหม่' end;
 for admin_user in select user_id from public.support_admins loop
 insert into public.notifications(user_id,id,type,priority,title,message,created_at,href,event_key,source_id,metadata)
 values(admin_user,'support-report-'||new.id,'system','normal',heading,new.message,now(),'/settings','support-report-'||new.id,new.id::text,jsonb_build_object('report_id',new.id));
 insert into public.talevo_scheduled_notifications(user_id,event_key,send_at,title,body,href)
 values(admin_user,'support-report-'||new.id,now(),heading,'มีข้อความใหม่จากผู้ใช้งาน','/settings');
 end loop;
 return new;
end $$;
revoke all on function public.support_report_notify_admin() from public,anon,authenticated;
create trigger support_report_notify_admin after insert on public.support_reports for each row execute function public.support_report_notify_admin();
