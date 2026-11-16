-- REVIEW REQUIRED: additive tables and RPCs for Syllabus Scanner / Rescue Mode.
-- Does not alter or delete existing tables or user records. All import writes
-- run in one transaction; a conflict/error rolls the entire import back.
begin;
create table public.learning_syllabi (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 course_id text not null,
 course_key text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=350000),
 summary jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,id), unique(user_id,course_key)
);
create table public.learning_rescue_plans (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=150000),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
alter table public.learning_syllabi enable row level security;
alter table public.learning_rescue_plans enable row level security;
create policy syllabus_owner on public.learning_syllabi for select to authenticated using((select auth.uid())=user_id);
create policy rescue_owner on public.learning_rescue_plans for select to authenticated using((select auth.uid())=user_id);
revoke all on public.learning_syllabi,public.learning_rescue_plans from public,anon,authenticated;
grant select on public.learning_syllabi,public.learning_rescue_plans to authenticated;

create function public.import_learning_syllabus(p_id uuid,p_course text,p_document jsonb,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb; item jsonb; course_name text; v_code text; term text; key text; color text; grade jsonb; saved_grade jsonb; ns int:=0; nt int:=0; ne int:=0; skipped int:=0; week_count int:=0;
begin
 if owner_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 if p_id is null or p_course is null or length(p_course)>200 or jsonb_typeof(p_document)<>'object' or jsonb_typeof(p_entries)<>'object' or octet_length(p_document::text)>350000 or octet_length(p_entries::text)>350000 or p_document->>'reviewed' is distinct from 'true' then raise exception 'กรุณาตรวจสอบข้อมูลก่อนนำเข้า'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,31413));
 select summary into result from public.learning_syllabi where user_id=owner_id and id=p_id;
 if result is not null then return result||jsonb_build_object('alreadyImported',true); end if;
 course_name:=btrim(p_document#>>'{course,name,value}');v_code:=coalesce(btrim(p_document#>>'{course,code,value}'),'');term:=p_entries->>'term';color:=p_entries->>'color';
 if coalesce(length(course_name),0) not between 1 and 200 or length(v_code)>100 or coalesce(length(term),0) not between 1 and 100 or color is null or color!~'^#[0-9A-Fa-f]{6}$' then raise exception 'กรุณาตรวจชื่อวิชาและภาคเรียน'; end if;
 key:=md5(lower(coalesce(nullif(v_code,''),course_name))||'|'||lower(term));
 if exists(select 1 from public.learning_syllabi where user_id=owner_id and course_key=key) then raise exception 'รายวิชานี้นำเข้าแล้ว กรุณาตรวจประวัติ'; end if;
 if exists(select 1 from public.class_schedules s where s.user_id=owner_id and s.course_id=p_course and s.name<>course_name and coalesce(s.course_code,'')<>v_code) then raise exception 'กรุณาตรวจรายวิชาที่เชื่อม'; end if;
 if jsonb_typeof(p_entries->'classes') is distinct from 'array' or jsonb_array_length(p_entries->'classes')>30 or jsonb_typeof(p_entries->'work') is distinct from 'array' or jsonb_array_length(p_entries->'work')>100 or jsonb_typeof(p_document->'weeks') is distinct from 'array' or jsonb_array_length(p_document->'weeks')>60 then raise exception 'กรุณาตรวจจำนวนรายการ'; end if;
 for item in select value from jsonb_array_elements(p_entries->'classes') loop
   if (item->>'day') is null or (item->>'day')!~'^[0-6]$' or (item->>'start')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (item->>'end')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (item->>'start')::time >= (item->>'end')::time then raise exception 'กรุณาตรวจเวลาเรียน'; end if;
   if exists(select 1 from public.class_schedules s where s.user_id=owner_id and s.course_id=p_course and s.day=(item->>'day')::int and s.start_time=(item->>'start')::time and s.end_time=(item->>'end')::time) then skipped:=skipped+1;continue;end if;
   if exists(select 1 from public.class_schedules s where s.user_id=owner_id and s.day=(item->>'day')::int and s.start_time<(item->>'end')::time and s.end_time>(item->>'start')::time) then raise exception 'เวลาเรียนซ้อนกับตาราง กรุณาแก้ไขก่อนนำเข้า';end if;
   insert into public.class_schedules(user_id,id,course_id,name,course_code,teacher,room,color,day,start_time,end_time,note,credits)
   values(owner_id,item->>'id',p_course,course_name,nullif(v_code,''),coalesce(p_document#>>'{course,teacher,value}',''),coalesce(item->>'room',''),color,(item->>'day')::int,(item->>'start')::time,(item->>'end')::time,'นำเข้าจากแผนรายวิชา',nullif(p_document#>>'{course,credits,value}','')::numeric);ns:=ns+1;
 end loop;
 if jsonb_array_length(p_entries->'work')>0 and not exists(select 1 from public.class_schedules s where s.user_id=owner_id and s.course_id=p_course) then raise exception 'กรุณาเชื่อมวิชาในตารางก่อนนำเข้างาน';end if;
 for item in select value from jsonb_array_elements(p_entries->'work') loop
   if coalesce(length(btrim(item->>'title')),0) not between 1 and 200 or (item->>'at') is null or (item->>'at')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' or (item->>'type') not in ('task','midterm','final','other') then raise exception 'กรุณาตรวจงานและวันกำหนดส่ง';end if;
   if item->>'type'='task' then
     if exists(select 1 from public.tasks t where t.user_id=owner_id and t.course_id=p_course and lower(btrim(t.title))=lower(btrim(item->>'title')) and t.due_date=(item->>'at')::timestamptz) then skipped:=skipped+1;continue;end if;
     insert into public.tasks(user_id,id,title,course_id,description,due_label,due_date,estimate,status,color) values(owner_id,item->>'id',item->>'title',p_course,coalesce(item->>'description',''),'นำเข้าจากแผนรายวิชา',(item->>'at')::timestamptz,'','todo',color);nt:=nt+1;
   else
     if exists(select 1 from public.exams e where e.user_id=owner_id and e.course_id=p_course and lower(btrim(e.title))=lower(btrim(item->>'title')) and e.start_at=(item->>'at')::timestamptz) then skipped:=skipped+1;continue;end if;
     insert into public.exams(user_id,id,course_id,title,type,start_at,note,created_at,updated_at) values(owner_id,item->>'id',p_course,item->>'title',item->>'type',(item->>'at')::timestamptz,coalesce(item->>'description',''),now(),now());ne:=ne+1;
   end if;
 end loop;
 grade:=p_entries->'grade';
 if grade is not null and grade<>'null'::jsonb then
   if grade->>'name'<>course_name or grade->>'term'<>term or (grade->>'sourceCourseId' is not null and grade->>'sourceCourseId'<>p_course) then raise exception 'กรุณาตรวจข้อมูลคะแนนที่เชื่อม';end if;
   saved_grade:=public.save_grade_lab((grade->>'id')::uuid,0,grade-'id'-'revision','save',null);
 end if;
 select count(*) into week_count from jsonb_array_elements(p_document->'weeks') w where w->>'selected'='true';
 result:=jsonb_build_object('schedules',ns,'tasks',nt,'exams',ne,'weeks',week_count,'skipped',skipped,'grade',saved_grade is not null);
 insert into public.learning_syllabi(user_id,id,course_id,course_key,payload,summary) values(owner_id,p_id,p_course,key,p_document,result);
 insert into public.notifications(user_id,id,type,priority,title,message,created_at,href,event_key,metadata) values(owner_id,'syllabus:'||p_id,'system','normal','นำเข้าแผนรายวิชาแล้ว',course_name,now(),'/syllabus','syllabus:'||p_id,jsonb_build_object('category','syllabus')) on conflict(user_id,event_key) do nothing;
 return result;
end $$;

create function public.save_learning_rescue(p_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); current_revision bigint; next_revision bigint; v_slot jsonb;
begin
 if owner_id is null then raise exception 'กรุณาเข้าสู่ระบบ';end if;
 if p_revision is null or p_revision<0 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>150000 or jsonb_typeof(p_payload#>'{plan,slots}') is distinct from 'array' or jsonb_array_length(p_payload#>'{plan,slots}')>500 then raise exception 'กรุณาตรวจข้อมูลแผน';end if;
 if jsonb_typeof(p_payload#>'{preferences,windows}') is distinct from 'array' or jsonb_array_length(p_payload#>'{preferences,windows}')>60 or jsonb_typeof(p_payload#>'{preferences,minutes}') is distinct from 'object' or jsonb_typeof(p_payload#>'{preferences,importance}') is distinct from 'object' then raise exception 'กรุณาตรวจเวลาว่าง';end if;
 for v_slot in select value from jsonb_array_elements(p_payload#>'{plan,slots}') loop
   if coalesce(length(v_slot->>'title'),0) not between 1 and 200 or coalesce(length(v_slot->>'phase'),0) not between 1 and 300 or nullif(v_slot->>'start','') is null or nullif(v_slot->>'end','') is null or (v_slot->>'start')::timestamptz >= (v_slot->>'end')::timestamptz then raise exception 'กรุณาตรวจช่วงเวลาในแผน';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,31413));
 select revision into current_revision from public.learning_rescue_plans where user_id=owner_id for update;
 if coalesce(current_revision,0)<>p_revision then raise exception 'แผนเปลี่ยนจากอุปกรณ์อื่น กรุณาโหลดใหม่';end if;
 if exists(select 1 from jsonb_array_elements(p_payload#>'{plan,slots}') slot where not exists(select 1 from public.tasks t where t.user_id=owner_id and t.id=slot->>'taskId' and t.status<>'completed')) then raise exception 'ไม่พบงานค้างที่อ้างอิงในบัญชี';end if;
 next_revision:=coalesce(current_revision,0)+1;
 insert into public.learning_rescue_plans(user_id,payload,revision) values(owner_id,p_payload,next_revision) on conflict(user_id) do update set payload=excluded.payload,revision=excluded.revision,updated_at=now();
 insert into public.notifications(user_id,id,type,priority,title,message,created_at,href,event_key,metadata) values(owner_id,'rescue:'||next_revision,'system','normal','บันทึกแผนกู้สถานการณ์แล้ว','เปิดแผนและเริ่มงานแรกได้เมื่อพร้อม',now(),'/rescue','rescue:'||next_revision,jsonb_build_object('category','rescue')) on conflict(user_id,event_key) do nothing;
 return jsonb_build_object('revision',next_revision);
end $$;
revoke all on function public.import_learning_syllabus(uuid,text,jsonb,jsonb),public.save_learning_rescue(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.import_learning_syllabus(uuid,text,jsonb,jsonb),public.save_learning_rescue(bigint,jsonb) to authenticated;
commit;
