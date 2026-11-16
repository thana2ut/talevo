/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {PGlite}=require(process.argv[2]||"@electric-sql/pglite");
(async()=>{const db=new PGlite(),root=path.resolve(__dirname,".."),alice="11111111-1111-4111-8111-111111111111",bob="22222222-2222-4222-8222-222222222222";let count=0;
const check=async(name,run)=>{await run();count++;console.log("PASS SQL "+name);};
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
for(const file of ["20260901110000_talevo_v8_schema.sql","20260901111000_talevo_v8_rls.sql","20261114130000_talevo_grade_lab.sql"])await db.exec(fs.readFileSync(path.join(root,"supabase/migrations",file),"utf8"));
await db.exec("alter table public.class_schedules add column course_code text,add column credits numeric(4,1);");
await db.exec(fs.readFileSync(path.join(root,"supabase/migrations/20261114144443_learning_tools.sql"),"utf8"));
await db.exec(fs.readFileSync(path.join(root,"supabase/manual/remove-course-syllabus-import.sql"),"utf8"));
await db.exec(`insert into auth.users values('${alice}'),('${bob}');set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false);`);
await db.exec(`insert into public.tasks(user_id,id,title,due_date,status,color) values('${alice}','task-a','Report','2026-12-01T12:00:00+07:00','todo','#7656F6');`);
const rescue=async(revision,payload={plan:{slots:[{taskId:"task-a",title:"Report",phase:"Draft",start:"2026-12-01T09:00:00+07:00",end:"2026-12-01T10:00:00+07:00"}]},preferences:{windows:[],minutes:{},importance:{}}})=>(await db.query("select public.save_learning_rescue($1,$2::jsonb) result",[revision,JSON.stringify(payload)])).rows[0].result;
await check("saved plan uses optimistic revisions and never submits tasks",async()=>{assert.equal((await rescue(0)).revision,1);await assert.rejects(rescue(0),/อุปกรณ์อื่น/);assert.equal((await db.query("select status from public.tasks")).rows[0].status,"todo");});
await check("RLS hides rescue plans from another user",async()=>{await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);assert.equal(Number((await db.query("select count(*) n from public.learning_rescue_plans")).rows[0].n),0);await assert.rejects(rescue(0),/ไม่พบงาน/);});
await check("direct table writes and anonymous RPC are rejected",async()=>{await assert.rejects(db.exec(`insert into public.learning_rescue_plans(user_id,payload)values('${bob}','{}');`),/permission denied/);await db.exec("reset role;set role anon;");await assert.rejects(rescue(0),/permission denied/);});
await db.close();console.log(`${count} PostgreSQL learning tests passed`);
})().catch(error=>{console.error(error);process.exit(1);});
