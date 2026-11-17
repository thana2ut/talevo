-- Review: fixes deadline validation and permits reimport when the linked task is missing.
-- Does not restore or delete existing account data automatically; reimport the images after approval.
begin;
create or replace function public.import_talevo_vision(entries jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid:=auth.uid(); entry jsonb; item jsonb; item_kind text;
  fingerprint_value text; title_value text; course_value text; due_value timestamptz;
  status_value text; target_value text; choice_value text; duplicate_id text;
  imported integer:=0; skipped integer:=0;
begin
  if owner_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries) not between 1 and 100 then raise exception 'จำนวนรายการต่อชุดไม่ถูกต้อง'; end if;
  -- Serialise all imports for this account, including concurrent tabs.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,23114));
  for entry in select value from jsonb_array_elements(entries) loop
    item:=entry->'item'; item_kind:=item->>'kind';
    if item_kind is null or item_kind not in ('task','exam','material','announcement') or coalesce((item->>'reviewed')::boolean,false)=false then raise exception 'กรุณาตรวจสอบทุกรายการก่อนบันทึก'; end if;
    fingerprint_value:=entry->>'fingerprint'; title_value:=btrim(item#>>'{facts,title,value}');
    course_value:=nullif(item->>'courseId',''); choice_value:=item->>'choice';
    if fingerprint_value is null or fingerprint_value !~ '^[a-f0-9]{64}$' or title_value is null or length(title_value) not between 1 and 200 then raise exception 'ข้อมูลรายการไม่ถูกต้อง'; end if;
    if choice_value='skip' then skipped:=skipped+1; continue; end if;
    if choice_value not in ('create','update') or choice_value is null then raise exception 'รูปแบบบันทึกไม่ถูกต้อง'; end if;
    if exists(select 1 from public.vision_records r where r.user_id=owner_id and r.fingerprint=fingerprint_value and
      (r.kind in ('material','announcement') or
       (r.kind='task' and exists(select 1 from public.tasks t where t.user_id=owner_id and t.id=r.target_id)) or
       (r.kind='exam' and exists(select 1 from public.exams e where e.user_id=owner_id and e.id=r.target_id))))
    then skipped:=skipped+1; continue; end if;
    if course_value is not null and not exists(select 1 from public.class_schedules where user_id=owner_id and course_id=course_value) then raise exception 'ไม่พบวิชาในบัญชีของคุณ'; end if;
    target_value:=null; due_value:=null;
    if item_kind in ('task','exam') then
      if course_value is null then raise exception 'กรุณาเชื่อมรายวิชา'; end if;
      if coalesce(entry->>'dueAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' then raise exception 'กรุณายืนยันวัน ปี และเวลา'; end if;
      due_value:=(entry->>'dueAt')::timestamptz;
      status_value:=item#>>'{facts,status,value}';
      if status_value is null or status_value not in ('pending','submitted','overdue') then raise exception 'กรุณายืนยันสถานะส่งงาน'; end if;
      if item_kind='task' then
        select id into duplicate_id from public.tasks where user_id=owner_id and course_id=course_value and lower(btrim(title))=lower(title_value) and due_date=due_value limit 1;
      else
        select id into duplicate_id from public.exams where user_id=owner_id and course_id=course_value and lower(btrim(title))=lower(title_value) and start_at=due_value limit 1;
      end if;
      if choice_value='create' and duplicate_id is not null then raise exception 'พบรายการเดิม กรุณาเลือกข้ามหรือยืนยันอัปเดต'; end if;
      if choice_value='update' then
        if coalesce((entry->>'confirmedUpdate')::boolean,false)=false then raise exception 'ต้องยืนยันการอัปเดตรายการเดิม'; end if;
        target_value:=nullif(item->>'targetId','');
        if target_value is null then raise exception 'กรุณาเลือกรายการเดิม'; end if;
        if item_kind='task' then
          update public.tasks set title=title_value,course_id=course_value,description=coalesce(item#>>'{facts,description,value}',''),due_date=due_value,status=case when status_value='submitted' then 'completed' else 'todo' end,completed_at=case when status_value='submitted' then coalesce(completed_at,now()) else null end where user_id=owner_id and id=target_value;
        else
          update public.exams set title=title_value,course_id=course_value,start_at=due_value,note=coalesce(item#>>'{facts,description,value}',''),completed_at=case when status_value='submitted' then coalesce(completed_at,now()) else null end,updated_at=now() where user_id=owner_id and id=target_value;
        end if;
        if not found then raise exception 'ไม่พบรายการเดิมหรือไม่มีสิทธิ์'; end if;
      else
        target_value:='vision-'||fingerprint_value;
        if item_kind='task' then
          insert into public.tasks(user_id,id,title,course_id,description,due_label,due_date,estimate,status,color,completed_at)
          values(owner_id,target_value,title_value,course_value,coalesce(item#>>'{facts,description,value}',''),'',due_value,'',case when status_value='submitted' then 'completed' else 'todo' end,'#7656F6',case when status_value='submitted' then now() else null end);
        else
          insert into public.exams(user_id,id,course_id,title,type,start_at,note,created_at,updated_at,completed_at)
          values(owner_id,target_value,course_value,title_value,'other',due_value,coalesce(item#>>'{facts,description,value}',''),now(),now(),case when status_value='submitted' then now() else null end);
        end if;
      end if;
    elsif choice_value='update' then raise exception 'เอกสารและประกาศนำเข้าเป็นรายการใหม่เท่านั้น';
    end if;
    insert into public.vision_records(user_id,fingerprint,kind,title,course_id,payload,target_id) values(owner_id,fingerprint_value,item_kind,title_value,course_value,item,target_value) on conflict(user_id,fingerprint) do nothing;
    imported:=imported+1;
  end loop;
  return jsonb_build_object('imported',imported,'skipped',skipped);
end $$;
revoke all on function public.import_talevo_vision(jsonb) from public,anon;
grant execute on function public.import_talevo_vision(jsonb) to authenticated;

commit;
