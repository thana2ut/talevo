import { secureApi } from "@/lib/security/api-guard";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {isTrustedMutationOrigin} from "@/lib/security/request-origin";
import {learningContext} from "@/lib/learning-data";
import {buildRescuePlan,rescueFingerprint,type RescuePreferences,type RescuePlan} from "@/lib/rescue";
import {learningJSON} from "@/lib/ai/learning-tools";
import {completeTalevoAIRequest,releaseTalevoAIRequest} from "@/lib/ai/usage-repository";
export const maxDuration=60;
const fail=(message:string,status=400)=>NextResponse.json({message},{status,headers:{"Cache-Control":"no-store"}});
async function handlerGET(){const db=await createClient(),{data:auth}=await db.auth.getUser();if(!auth.user)return fail("กรุณาเข้าสู่ระบบ",401);const result=await db.from("learning_rescue_plans").select("payload,revision").eq("user_id",auth.user.id).maybeSingle();if(result.error)return fail("ส่วนเก็บแผนยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล",503);return NextResponse.json({payload:result.data?.payload??null,revision:result.data?.revision??0},{headers:{"Cache-Control":"no-store"}});}
async function handlerPOST(request:NextRequest){
  if(!isTrustedMutationOrigin(request))return fail("คำขอไม่ถูกต้อง",403);const db=await createClient(),{data:auth}=await db.auth.getUser();if(!auth.user)return fail("กรุณาเข้าสู่ระบบ",401);
  let lease:string|null=null;
  try{
    const raw=await request.text();if(Buffer.byteLength(raw)>150000)return fail("ข้อมูลแผนใหญ่เกินไป",413);const body=JSON.parse(raw),preferences=body.preferences as RescuePreferences;
    if(!preferences||!Array.isArray(preferences.windows)||!preferences.minutes||!preferences.importance)return fail("กรุณากำหนดเวลาว่าง");
    const context=await learningContext(db,auth.user.id),taskIds=new Set(context.tasks.map(t=>t.id));
    if(body.operation==="plan"){
      preferences.minutes=Object.fromEntries(Object.entries(preferences.minutes).filter(([key])=>taskIds.has(key)));
      preferences.importance=Object.fromEntries(Object.entries(preferences.importance).filter(([key])=>taskIds.has(key)));
    }
    for(const [key,val] of Object.entries(preferences.minutes))if(!taskIds.has(key)||!Number.isInteger(val)||Number(val)<5||Number(val)>10080)return fail("ระยะเวลางานไม่ถูกต้อง");
    for(const [key,val] of Object.entries(preferences.importance))if(!taskIds.has(key)||![1,2,3].includes(Number(val)))return fail("ความสำคัญงานไม่ถูกต้อง");
    const now=Date.now();
    if(body.operation==="save"){
      const plan=body.plan as RescuePlan;
      if(!plan||!Array.isArray(plan.slots)||plan.slots.length>500||!Number.isSafeInteger(body.revision)||body.revision<0)return fail("รูปแบบแผนไม่ถูกต้อง");
      const created=Date.parse(plan.createdAt);if(!Number.isFinite(created)||created>now+6*60000||created<now-86400000)return fail("แผนหมดอายุ กรุณาสร้างแผนใหม่",409);
      if(plan.fingerprint!==rescueFingerprint(context.tasks,context.schedules,context.exams,preferences))return fail("ข้อมูลเปลี่ยนแล้ว กรุณาปรับแผนก่อนบันทึก",409);
      const expected=buildRescuePlan(context.tasks,context.schedules,context.exams,preferences,created);
      if(JSON.stringify(expected.slots.map(s=>[s.taskId,s.start,s.end]))!==JSON.stringify(plan.slots.map(s=>[s.taskId,s.start,s.end]))||plan.slots.some(s=>Date.parse(s.start)<now||typeof s.phase!=="string"||s.phase.length>300))return fail("ช่วงเวลาไม่พร้อมใช้หรือชนกับข้อมูลล่าสุด กรุณาปรับแผน",409);
      const result=await db.rpc("save_learning_rescue",{p_revision:body.revision,p_payload:{preferences,plan:{...expected,slots:plan.slots}}});if(result.error)return fail(/อุปกรณ์อื่น/.test(result.error.message)?result.error.message:"บันทึกแผนไม่สำเร็จ กรุณาลองใหม่",409);
      return NextResponse.json(result.data,{headers:{"Cache-Control":"no-store"}});
    }
    if(body.operation!=="plan")return fail("คำสั่งไม่ถูกต้อง");
    // Validate feasibility before spending AI quota.
    const plan=buildRescuePlan(context.tasks,context.schedules,context.exams,preferences,now+5*60000);
    if(!context.tasks.some(t=>t.status!=="completed"))return fail("ไม่มีงานค้างให้วางแผน");
    const quota=await db.rpc("begin_talevo_ai_request"),row=Array.isArray(quota.data)?quota.data[0]:quota.data;
    if(quota.error||!row?.allowed||!row.request_id)return fail("AI ถึงขีดจำกัดชั่วคราว กรุณาลองใหม่",429);lease=row.request_id;
    const output=await learningJSON('Return {"steps":[{"taskId":"exact supplied id","titles":["short practical step", "next step"]}]}. Break each supplied task into 1–5 practical Thai steps. Respect supplied unfinished subtasks and their order. Do not invent task IDs, data, dates or new commitments. No guarantees of completion.',JSON.stringify(context.tasks.filter(t=>t.status!=="completed").slice(0,100).map(t=>({id:t.id,title:t.title,description:t.description.slice(0,1500),subtasks:t.subtasks?.filter(s=>!s.completed)}))),[],AbortSignal.any([request.signal,AbortSignal.timeout(50000)])) as {steps?:{taskId:string;titles:string[]}[]};
    if(!Array.isArray(output.steps)||output.steps.length>100||output.steps.some(s=>!s||!taskIds.has(s.taskId)||!Array.isArray(s.titles)||s.titles.length>5||s.titles.some(t=>typeof t!=="string"||!t.trim()||t.length>300)))throw new Error("AI output invalid");
    const counters=new Map<string,number>();plan.slots=plan.slots.map(slot=>{const index=counters.get(slot.taskId)??0;counters.set(slot.taskId,index+1);const titles=output.steps!.find(s=>s.taskId===slot.taskId)?.titles;return {...slot,phase:titles?.[Math.min(index,titles.length-1)]??slot.phase};});
    await completeTalevoAIRequest(db,lease!,true);lease=null;
    return NextResponse.json({plan,preferences},{headers:{"Cache-Control":"no-store"}});
  }catch(error){if(lease)await releaseTalevoAIRequest(db,lease);return fail(error instanceof Error&&/กรุณา|เวลาว่าง|กำหนดเวลา|เลือกเวลา/.test(error.message)?error.message:"สร้างแผนไม่สำเร็จ กรุณาลองใหม่",422);}
}

export const GET = secureApi(handlerGET, "/api/learning/rescue", "GET");
export const POST = secureApi(handlerPOST, "/api/learning/rescue", "POST");
