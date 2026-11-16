-- REVIEW BEFORE DEPLOYMENT. Additive Grade Lab storage. No legacy grades are
-- changed. A course is linked by source_course_id, never a fabricated class.
begin;
create table public.grade_lab_courses (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 source_course_id text,
 name text not null,
 code text not null default '',
 term text not null,
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=300000),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(user_id,id)
);
create unique index grade_lab_source_term on public.grade_lab_courses(user_id,source_course_id,lower(btrim(term))) where source_course_id is not null and deleted_at is null;
create unique index grade_lab_code_term on public.grade_lab_courses(user_id,lower(btrim(code)),lower(btrim(term))) where code<>'' and deleted_at is null;
create table public.grade_lab_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=10000),
 revision bigint not null default 1
);
create table public.grade_lab_history (
 user_id uuid not null references auth.users(id) on delete cascade,
 id bigint generated always as identity primary key,
 course_id uuid,
 action text not null check(action in ('save','delete','settings')),
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index grade_lab_history_owner_time on public.grade_lab_history(user_id,created_at desc);
alter table public.grade_lab_courses enable row level security;
alter table public.grade_lab_settings enable row level security;
alter table public.grade_lab_history enable row level security;
create policy grade_lab_course_owner on public.grade_lab_courses for select to authenticated using((select auth.uid())=user_id);
create policy grade_lab_settings_owner on public.grade_lab_settings for select to authenticated using((select auth.uid())=user_id);
create policy grade_lab_history_owner on public.grade_lab_history for select to authenticated using((select auth.uid())=user_id);
revoke all on public.grade_lab_courses,public.grade_lab_settings,public.grade_lab_history from public,anon,authenticated;
grant select on public.grade_lab_courses,public.grade_lab_settings,public.grade_lab_history to authenticated;

create function public.validate_grade_lab_payload(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare c jsonb; u jsonb; b jsonb; prev_max numeric:=0; max_value numeric; score_value numeric; step_value numeric; grade_labels text[]:=array[]::text[];
begin
 if p is null or jsonb_typeof(p)<>'object' or not(p ?& array['name','term','code','credits','scaleMax','grading','criteriaConfirmed','includeInGpa','alertsEnabled','components','thresholds','scenarios','sourceCourseId','targetGrade','finalGrade']) or coalesce(length(btrim(p->>'name')),0) not between 1 and 200 or coalesce(length(btrim(p->>'term')),0) not between 1 and 100 or length(coalesce(p->>'code',''))>100 then return false; end if;
 if jsonb_typeof(p->'name')<>'string' or jsonb_typeof(p->'term')<>'string' or jsonb_typeof(p->'code')<>'string' or jsonb_typeof(p->'credits')<>'string' or jsonb_typeof(p->'scaleMax')<>'string' or jsonb_typeof(p->'targetGrade')<>'string' or jsonb_typeof(p->'finalGrade')<>'string' then return false; end if;
 if p->>'grading' not in ('criterion','relative') or jsonb_typeof(p->'criteriaConfirmed')<>'boolean' or jsonb_typeof(p->'includeInGpa')<>'boolean' or jsonb_typeof(p->'alertsEnabled')<>'boolean' then return false; end if;
 if coalesce(p->>'credits','')<>'' and (p->>'credits')!~ '^\d{1,8}(\.\d{1,4})?$' then return false; end if;
 if coalesce(p->>'scaleMax','')<>'' and ((p->>'scaleMax')!~ '^\d{1,8}(\.\d{1,4})?$' or (p->>'scaleMax')::numeric<=0) then return false; end if;
 if jsonb_typeof(p->'components')<>'array' or jsonb_array_length(p->'components')>50 or jsonb_typeof(p->'thresholds')<>'array' or jsonb_array_length(p->'thresholds')>30 or jsonb_typeof(p->'scenarios')<>'array' or jsonb_array_length(p->'scenarios')>20 then return false; end if;
 for c in select value from jsonb_array_elements(p->'components') loop
   if not(c ?& array['id','name','weight','parts']) or jsonb_typeof(c->'weight')<>'string' then return false; end if;
   if coalesce(length(btrim(c->>'name')),0) not between 1 and 200 or (c->>'weight')!~ '^\d{1,8}(\.\d{1,4})?$' or (c->>'weight')::numeric>100 or jsonb_typeof(c->'parts')<>'array' or jsonb_array_length(c->'parts')>100 then return false; end if;
   for u in select value from jsonb_array_elements(case when jsonb_array_length(c->'parts')>0 then c->'parts' else jsonb_build_array(c) end) loop
     if not(u ?& array['id','name','max','step','earned','released']) or jsonb_typeof(u->'max')<>'string' or jsonb_typeof(u->'step')<>'string' or jsonb_typeof(u->'earned') not in ('string','null') then return false; end if;
     if coalesce(length(btrim(u->>'name')),0) not between 1 and 200 or (u->>'max')!~ '^\d{1,8}(\.\d{1,4})?$' or (u->>'step')!~ '^\d{1,8}(\.\d{1,4})?$' or jsonb_typeof(u->'released')<>'boolean' then return false; end if;
     max_value:=(u->>'max')::numeric; step_value:=(u->>'step')::numeric;
     if max_value<=0 or step_value<=0 or step_value>max_value or mod(max_value,step_value)<>0 then return false; end if;
     if u->>'earned' is not null then
       if (u->>'earned')!~ '^\d{1,8}(\.\d{1,4})?$' then return false; end if;
       score_value:=(u->>'earned')::numeric;
       if score_value>max_value then return false; end if;
     elsif (u->>'released')::boolean then return false;
     end if;
   end loop;
 end loop;
 for b in select value from jsonb_array_elements(p->'thresholds') loop
   if not(b ?& array['id','label','min','max','points']) or jsonb_typeof(b->'min')<>'string' or jsonb_typeof(b->'max')<>'string' or jsonb_typeof(b->'points')<>'string' then return false; end if;
   if coalesce(length(btrim(b->>'label')),0) not between 1 and 30 or btrim(b->>'label')=any(grade_labels) then return false; end if;
   grade_labels:=array_append(grade_labels,btrim(b->>'label'));
   if coalesce(b->>'points','')<>'' and ((b->>'points')!~ '^\d{1,8}(\.\d{1,4})?$' or coalesce(p->>'scaleMax','')='' or (b->>'points')::numeric>(p->>'scaleMax')::numeric) then return false; end if;
 end loop;
 if (p->>'criteriaConfirmed')::boolean and p->>'grading'='criterion' then
   if jsonb_array_length(p->'thresholds')=0 then return false; end if;
   for b in select value from jsonb_array_elements(p->'thresholds') order by (value->>'min')::numeric loop
     if (b->>'min')!~ '^\d{1,8}(\.\d{1,4})?$' or (b->>'max')!~ '^\d{1,8}(\.\d{1,4})?$' or (b->>'min')::numeric<>prev_max or (b->>'max')::numeric<=(b->>'min')::numeric or (b->>'max')::numeric>100 then return false; end if;
     prev_max:=(b->>'max')::numeric;
   end loop;
   if prev_max<>100 then return false; end if;
 end if;
 return true;
exception when others then return false;
end $$;

create function public.save_grade_lab(course_id uuid,expected_revision bigint,course_payload jsonb,operation text default 'save',risk jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); old_row public.grade_lab_courses; next_revision bigint; alert_key text;
begin
 if owner_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 if expected_revision is null or expected_revision<0 or course_id is null then raise exception 'รหัสรุ่นข้อมูลไม่ถูกต้อง'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,31413));
 select * into old_row from public.grade_lab_courses where user_id=owner_id and id=save_grade_lab.course_id for update;
 if (old_row.id is null and expected_revision<>0) or (old_row.id is not null and old_row.revision<>expected_revision) or old_row.deleted_at is not null then raise exception 'ข้อมูลถูกเปลี่ยนจากอุปกรณ์อื่น กรุณาโหลดข้อมูลล่าสุด'; end if;
 if operation='delete' then
   if old_row.id is null then raise exception 'ไม่พบรายวิชา'; end if;
   update public.grade_lab_courses set deleted_at=now(),revision=revision+1,updated_at=now() where user_id=owner_id and id=save_grade_lab.course_id;
   insert into public.grade_lab_history(user_id,course_id,action,before_data) values(owner_id,save_grade_lab.course_id,'delete',old_row.payload);
   return jsonb_build_object('deleted',true);
 end if;
 if operation is null or operation<>'save' or not public.validate_grade_lab_payload(course_payload) then raise exception 'กรุณาตรวจข้อมูลรายวิชา คะแนน และเกณฑ์เกรด'; end if;
 if nullif(course_payload->>'sourceCourseId','') is not null and not exists(select 1 from public.class_schedules s where s.user_id=owner_id and s.course_id=course_payload->>'sourceCourseId') then raise exception 'ไม่พบรายวิชาที่เชื่อมในบัญชีของคุณ'; end if;
 if old_row.id is not null and old_row.payload=course_payload then return jsonb_build_object('revision',old_row.revision,'payload',old_row.payload); end if;
 next_revision:=coalesce(old_row.revision,0)+1;
 insert into public.grade_lab_courses(user_id,id,source_course_id,name,code,term,payload,revision)
 values(owner_id,save_grade_lab.course_id,nullif(course_payload->>'sourceCourseId',''),course_payload->>'name',coalesce(course_payload->>'code',''),course_payload->>'term',course_payload,next_revision)
 on conflict(user_id,id) do update set source_course_id=excluded.source_course_id,name=excluded.name,code=excluded.code,term=excluded.term,payload=excluded.payload,revision=excluded.revision,updated_at=now();
 insert into public.grade_lab_history(user_id,course_id,action,before_data,after_data) values(owner_id,save_grade_lab.course_id,'save',old_row.payload,course_payload);
 if (course_payload->>'alertsEnabled')::boolean and risk is not null and length(risk->>'message') between 1 and 1000 and length(risk->>'key') between 1 and 300 then
   alert_key:='grade-lab:'||save_grade_lab.course_id::text||':'||md5(risk->>'key');
   insert into public.notifications(user_id,id,type,priority,title,message,created_at,href,event_key,source_id,metadata)
   values(owner_id,alert_key,'system',case when (risk->>'key') like 'impossible:%' then 'high' else 'normal' end,'Talevo Grade Lab',risk->>'message',now(),'/grade-lab',alert_key,save_grade_lab.course_id::text,jsonb_build_object('category','grade_risk')) on conflict(user_id,event_key) do nothing;
 end if;
 return jsonb_build_object('revision',next_revision,'payload',course_payload);
end $$;

create function public.save_grade_lab_settings(expected_revision bigint,settings_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); old_row public.grade_lab_settings; v text; k text; next_revision bigint;
begin
 if owner_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 if expected_revision is null or expected_revision<0 then raise exception 'รหัสรุ่นข้อมูลไม่ถูกต้อง'; end if;
 if jsonb_typeof(settings_payload)<>'object' or octet_length(settings_payload::text)>10000 then raise exception 'ตั้งค่าไม่ถูกต้อง'; end if;
 foreach k in array array['priorCredits','priorQualityPoints','targetGpa','futureCredits','scaleMax'] loop
   v:=settings_payload->>k; if v is null or (v<>'' and v!~'^\d{1,8}(\.\d{1,4})?$') then raise exception 'ตัวเลขตั้งค่าไม่ถูกต้อง'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,31413));
 select * into old_row from public.grade_lab_settings where user_id=owner_id for update;
 if (old_row.user_id is null and expected_revision<>0) or (old_row.user_id is not null and old_row.revision<>expected_revision) then raise exception 'การตั้งค่าถูกเปลี่ยนจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่'; end if;
 next_revision:=coalesce(old_row.revision,0)+1;
 insert into public.grade_lab_settings(user_id,payload,revision) values(owner_id,settings_payload,next_revision) on conflict(user_id) do update set payload=excluded.payload,revision=excluded.revision;
 insert into public.grade_lab_history(user_id,action,before_data,after_data) values(owner_id,'settings',old_row.payload,settings_payload);
 return jsonb_build_object('revision',next_revision,'payload',settings_payload);
end $$;
revoke all on function public.validate_grade_lab_payload(jsonb),public.save_grade_lab(uuid,bigint,jsonb,text,jsonb),public.save_grade_lab_settings(bigint,jsonb) from public,anon;
grant execute on function public.validate_grade_lab_payload(jsonb),public.save_grade_lab(uuid,bigint,jsonb,text,jsonb),public.save_grade_lab_settings(bigint,jsonb) to authenticated;
commit;
