-- Approved integration check. Creates disposable identities only inside this
-- transaction; EVERY inserted account, task and Vision record is rolled back.
begin;
select set_config('vision.qa_owner',gen_random_uuid()::text,true);
select set_config('vision.qa_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role,created_at,updated_at)
select current_setting('vision.qa_owner')::uuid,'vision-qa-'||current_setting('vision.qa_owner')||'@example.invalid','{"display_name":"Vision QA"}'::jsonb,'{}'::jsonb,'authenticated','authenticated',now(),now()
union all
select current_setting('vision.qa_other')::uuid,'vision-qa-'||current_setting('vision.qa_other')||'@example.invalid','{"display_name":"Vision QA Other"}'::jsonb,'{}'::jsonb,'authenticated','authenticated',now(),now();
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('vision.qa_owner'),true);
insert into public.class_schedules(user_id,id,course_id,name,color,day,start_time,end_time)
values(auth.uid(),'vision-qa-class','vision-qa-course','Vision QA Course','#7656F6',0,'09:00','10:00');
do $$
declare e jsonb; r jsonb; before_count integer;
begin
  e:=jsonb_build_object('fingerprint',repeat('a',64),'dueAt','2026-09-23T23:59:00+07:00','confirmedUpdate',false,'item',jsonb_build_object('kind','task','reviewed',true,'choice','create','courseId','vision-qa-course','facts',jsonb_build_object('title',jsonb_build_object('value','Vision QA Submitted'),'status',jsonb_build_object('value','submitted'),'description',jsonb_build_object('value','Rollback test'))));
  r:=public.import_talevo_vision(jsonb_build_array(e));
  if (r->>'imported')::integer<>1 then raise exception 'QA expected insert'; end if;
  if not exists(select 1 from public.tasks where user_id=auth.uid() and id='vision-'||repeat('a',64) and status='completed' and completed_at is not null and due_date='2026-09-23T16:59:00Z'::timestamptz) then raise exception 'QA submitted/timezone failed'; end if;
  r:=public.import_talevo_vision(jsonb_build_array(e));
  if (r->>'skipped')::integer<>1 then raise exception 'QA idempotency failed'; end if;
  select count(*) into before_count from public.tasks where user_id=auth.uid();
  e:=jsonb_set(e,'{fingerprint}',to_jsonb(repeat('b',64)));
  e:=jsonb_set(e,'{item,kind}','"material"'::jsonb);
  e:=jsonb_set(e,'{item,facts,title,value}','"Vision QA Material"'::jsonb);
  perform public.import_talevo_vision(jsonb_build_array(e));
  if (select count(*) from public.tasks where user_id=auth.uid())<>before_count then raise exception 'QA material created a task'; end if;
  if (select count(*) from public.vision_records where user_id=auth.uid())<>2 then raise exception 'QA archive failed'; end if;
  begin
    e:=jsonb_set(e,'{fingerprint}',to_jsonb(repeat('c',64)));
    e:=jsonb_set(e,'{item,kind}','"task"'::jsonb);
    e:=jsonb_set(e,'{item,courseId}','"not-owned-course"'::jsonb);
    perform public.import_talevo_vision(jsonb_build_array(e));
    raise exception 'QA invalid course was accepted';
  exception when others then
    if sqlerrm='QA invalid course was accepted' then raise; end if;
    if position('ไม่พบวิชา' in sqlerrm)=0 then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('vision.qa_other'),true);
do $$ begin
  if exists(select 1 from public.vision_records where user_id=current_setting('vision.qa_owner')::uuid) then raise exception 'QA cross-account Vision read'; end if;
  if exists(select 1 from public.tasks where user_id=current_setting('vision.qa_owner')::uuid) then raise exception 'QA cross-account task read'; end if;
end $$;
reset role;
rollback;
