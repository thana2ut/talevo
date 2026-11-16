import { secureApi } from "@/lib/security/api-guard";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {isTrustedMutationOrigin} from "@/lib/security/request-origin";
import {blankSettings,calculateCourse,decimal,gradeAlert,validateCourse,type GradeLabCourse,type GradeLabSettings} from "@/lib/grade-lab";
export const dynamic="force-dynamic";
const fail=(message:string,status=400)=>NextResponse.json({message},{status,headers:{"Cache-Control":"no-store"}});
async function handlerGET(){
 const db=await createClient();const {data:auth}=await db.auth.getUser();if(!auth.user)return fail("กรุณาเข้าสู่ระบบ",401);
 const [courses,settings,history]=await Promise.all([db.from("grade_lab_courses").select("id,payload,revision,updated_at").eq("user_id",auth.user.id).is("deleted_at",null).order("term"),db.from("grade_lab_settings").select("payload,revision").eq("user_id",auth.user.id).maybeSingle(),db.from("grade_lab_history").select("id,course_id,action,before_data,after_data,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false}).limit(100)]);
 if(courses.error||settings.error||history.error)return fail("ยังโหลดข้อมูลคำนวณคะแนนไม่สำเร็จ กรุณาลองใหม่",503);
 return NextResponse.json({courses:courses.data.map(row=>({...row.payload,id:row.id,revision:Number(row.revision)})),settings:settings.data?.payload??blankSettings,settingsRevision:Number(settings.data?.revision??0),history:history.data},{headers:{"Cache-Control":"no-store"}});
}
async function handlerPOST(request:NextRequest){
 if(!isTrustedMutationOrigin(request))return fail("คำขอไม่ได้มาจาก Talevo",403);
 const db=await createClient();const {data:auth}=await db.auth.getUser();if(!auth.user)return fail("กรุณาเข้าสู่ระบบ",401);
 const raw=await request.text();if(raw.length>300000)return fail("ข้อมูลใหญ่เกินไป",413);
 try{
  const body=JSON.parse(raw);
  if(body.operation==="settings"){
   const settings={} as GradeLabSettings;
   for(const key of Object.keys(blankSettings) as (keyof GradeLabSettings)[]){const value=body.settings?.[key];if(typeof value!=="string")return fail("รูปแบบการตั้งค่าไม่ถูกต้อง");if(value)decimal(value);settings[key]=value;}
   if(!Number.isSafeInteger(body.revision)||body.revision<0)return fail("รหัสรุ่นข้อมูลไม่ถูกต้อง");
   const result=await db.rpc("save_grade_lab_settings",{expected_revision:body.revision,settings_payload:settings});
   if(result.error)return fail(/อุปกรณ์อื่น/.test(result.error.message)?result.error.message:"บันทึกการตั้งค่าไม่สำเร็จ",409);
   return NextResponse.json(result.data,{headers:{"Cache-Control":"no-store"}});
  }
  if(!["save","delete"].includes(body.operation))return fail("คำสั่งไม่ถูกต้อง");
  const course=body.course as GradeLabCourse;
  if(!course||!/^[-a-f\d]{36}$/i.test(course.id)||!Number.isSafeInteger(course.revision)||course.revision<0)return fail("รหัสรายวิชาไม่ถูกต้อง");
  let payload:Record<string,unknown>|null=null,risk:ReturnType<typeof gradeAlert>=null;
  if(body.operation==="save"){
   if(!Array.isArray(course.components)||!Array.isArray(course.thresholds)||!Array.isArray(course.scenarios))return fail("รูปแบบคะแนนไม่ถูกต้อง");
   const validation=validateCourse(course);if(validation.errors.length)return fail(validation.errors.join(" · "));
   if(course.criteriaConfirmed&&course.grading==="criterion"&&validation.warnings.some(w=>/เกณฑ์ต้อง|ชื่อเกรด/.test(w)))return fail("กรุณาแก้ช่วงเกรดซ้อนทับหรือช่องว่างก่อนยืนยันเกณฑ์");
   for(const scenario of course.scenarios){if(!scenario.name?.trim()||!scenario.scores||Object.keys(scenario.scores).length>500)return fail("สถานการณ์จำลองไม่ถูกต้อง");if(validation.canScore)calculateCourse(course,scenario.scores);}
   payload={...course};delete payload.id;delete payload.revision;
   risk=gradeAlert(course);
  }
  const result=await db.rpc("save_grade_lab",{course_id:course.id,expected_revision:course.revision,course_payload:payload,operation:body.operation,risk});
  if(result.error){const msg=/อุปกรณ์อื่น|ไม่พบรายวิชา|กรุณา/.test(result.error.message)?result.error.message:result.error.code==="23505"?"รายวิชานี้มีในภาคเรียนนี้แล้ว กรุณาเลือกรายการเดิม":"บันทึกไม่สำเร็จ กรุณาลองใหม่";return fail(msg,409);}
  return NextResponse.json(result.data,{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("รูปแบบคะแนนไม่ถูกต้อง กรุณาตรวจตัวเลขและรายละเอียด");}
}

export const GET = secureApi(handlerGET, "/api/grade-lab", "GET");
export const POST = secureApi(handlerPOST, "/api/grade-lab", "POST");
