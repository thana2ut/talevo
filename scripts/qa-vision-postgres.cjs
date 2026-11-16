/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL/WASM tests only. Never connects to Supabase or reads .env.
// Usage: node scripts/qa-vision-postgres.cjs <absolute-path-to-pglite-package>
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {PGlite}=require(process.argv[2]||"@electric-sql/pglite");
const root=path.resolve(__dirname,"..");
(async()=>{
 const db=new PGlite();let passed=0;
 const exec=sql=>db.exec(sql);const query=(sql,params)=>db.query(sql,params);
 await exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
 for(const filename of ["20260901110000_talevo_v8_schema.sql","20260901111000_talevo_v8_rls.sql","20261114100000_talevo_vision.sql"])await exec(fs.readFileSync(path.join(root,"supabase/migrations",filename),"utf8"));
 const alice="11111111-1111-4111-8111-111111111111",bob="22222222-2222-4222-8222-222222222222";
 await exec(`insert into auth.users values('${alice}'),('${bob}'); insert into public.class_schedules(user_id,id,course_id,name,color,day,start_time,end_time) values('${alice}','class-a','course-a','นวัตกรรม','#7656F6',0,'09:00','10:00'),('${bob}','class-b','course-b','วิชาของคนอื่น','#7656F6',1,'09:00','10:00');`);
 await exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
 const entry=(title,kind="task",status="submitted",courseId="course-a")=>({fingerprint:crypto.createHash("sha256").update(`${title}-${kind}`).digest("hex"),dueAt:"2026-09-23T23:59:00+07:00",confirmedUpdate:false,item:{kind,reviewed:true,choice:"create",courseId,facts:{title:{value:title,evidence:[]},description:{value:"ข้อความทดสอบ",evidence:[]},status:{value:status,evidence:[]}}}});
 const call=async entries=>(await query("select public.import_talevo_vision($1::jsonb) as result",[JSON.stringify(entries)])).rows[0].result;
 const count=async table=>Number((await query(`select count(*) as count from public.${table}`)).rows[0].count);
 const check=async(name,run)=>{await run();passed++;console.log(`PASS PostgreSQL ${name}`);};
 await check("migration compiles; confirmed task persists completed at Bangkok time",async()=>{const result=await call([entry("ใบงานท้ายบทที่ 9")]);assert.equal(result.imported,1);const row=(await query("select title,status,completed_at,due_date from public.tasks")).rows[0];assert.equal(row.status,"completed");assert.ok(row.completed_at);assert.equal(new Date(row.due_date).toISOString(),"2026-09-23T16:59:00.000Z");});
 await check("idempotent repeat has no duplicate rows",async()=>{assert.equal((await call([entry("ใบงานท้ายบทที่ 9")])).skipped,1);assert.equal(await count("tasks"),1);});
 await check("material is archived without a task or exam",async()=>{await call([entry("เอกสารบทที่ 9","material")]);assert.equal(await count("tasks"),1);assert.equal(await count("exams"),0);assert.equal(await count("vision_records"),2);});
 await check("announcement is archived without an alertable task",async()=>{await call([entry("ประกาศจากอาจารย์","announcement")]);assert.equal(await count("tasks"),1);});
 await check("pending work persists todo",async()=>{await call([entry("ใบงานบทที่ 8","task","pending")]);assert.equal((await query("select status from public.tasks where title='ใบงานบทที่ 8'")).rows[0].status,"todo");});
 await check("submitted exam persists completed",async()=>{await call([entry("สอบบทที่ 9","exam")]);assert.ok((await query("select completed_at from public.exams")).rows[0].completed_at);});
 await check("failure rolls back the entire batch",async()=>{const before=await count("tasks");await assert.rejects(call([entry("ต้องย้อนกลับ"),entry("สิทธิ์ไม่ถูกต้อง","task","pending","course-b")]),/ไม่พบวิชา/);assert.equal(await count("tasks"),before);});
 await check("unknown status and missing year cannot create alertable work",async()=>{await assert.rejects(call([entry("สถานะไม่ทราบ","task","unknown")]),/ยืนยันสถานะ/);const e=entry("ปีไม่ทราบ");e.dueAt=null;await assert.rejects(call([e]),/วัน ปี และเวลา/);});
 await check("update requires explicit confirmation",async()=>{const e=entry("เปลี่ยนงานเดิม");e.item.choice="update";e.item.targetId=(await query("select id from public.tasks limit 1")).rows[0].id;await assert.rejects(call([e]),/ต้องยืนยัน/);});
 await check("confirmed update affects only selected owned target",async()=>{const e=entry("แก้ไขงานที่เลือก");e.item.choice="update";e.confirmedUpdate=true;e.item.targetId=(await query("select id from public.tasks where title='ใบงานบทที่ 8'")).rows[0].id;await call([e]);assert.equal((await query("select title from public.tasks where id=$1",[e.item.targetId])).rows[0].title,"แก้ไขงานที่เลือก");});
 await check("second user cannot read first user's records or tasks",async()=>{await exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);assert.equal(await count("vision_records"),0);assert.equal(await count("tasks"),0);});
 await check("cross-account update is rejected",async()=>{const e=entry("โจมตีข้ามบัญชี","task","pending","course-b");e.item.choice="update";e.item.targetId="vision-"+entry("ใบงานท้ายบทที่ 9").fingerprint;e.confirmedUpdate=true;await assert.rejects(call([e]),/ไม่พบรายการเดิม/);});
 await check("RLS blocks inserting cache for another user",async()=>{await assert.rejects(query("insert into public.vision_analyses(user_id,digest,result) values($1,$2,'{}')",[alice,"a".repeat(64)]),/row-level security/);});
 await check("anonymous role cannot invoke imports",async()=>{await exec("reset role; set role anon;");await assert.rejects(call([entry("anonymous")]),/permission denied/);});
 console.log(`Talevo Vision PostgreSQL: ${passed} isolated checks passed. No live database was changed.`);await db.close();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
