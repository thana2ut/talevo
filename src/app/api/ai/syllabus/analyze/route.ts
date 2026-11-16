import { secureApi } from "@/lib/security/api-guard";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { completeTalevoAIRequest, releaseTalevoAIRequest } from "@/lib/ai/usage-repository";
import { analyzeUniversityTimetable } from "@/lib/ai/university-timetable";
import { isAIProviderConfigured, getTalevoAIProviderId } from "@/lib/ai/config";
import { hasAllowedSyllabusFileExtension, MAX_SYLLABUS_MULTIPART_BYTES, matchesSyllabusDocumentMagic } from "@/lib/ai/syllabus-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const fail=(message:string,status:number)=>NextResponse.json({message},{status,headers:{"Cache-Control":"no-store"}});

async function handlerPOST(request:NextRequest){
  if(!isTrustedMutationOrigin(request,{allowMissingOrigin:true}))return fail("คำขอนี้ไม่ได้มาจาก TALEVO",403);
  const supabase=await createClient();
  const {data:auth,error:authError}=await supabase.auth.getUser();
  if(authError||!auth.user)return fail("กรุณาเข้าสู่ระบบก่อนอ่านตาราง",401);
  if(!isAIProviderConfigured(getTalevoAIProviderId()))return fail("ยังไม่ได้ตั้งค่าบริการ AI สำหรับอ่านตาราง",503);
  if(Number(request.headers.get("content-length"))>Math.min(4_000_000, MAX_SYLLABUS_MULTIPART_BYTES))return fail("เอกสารรวมมีขนาดใหญ่เกินไป กรุณาแยกชุดตาราง",413);
  let form:FormData;try{form=await request.formData();}catch{return fail("รูปแบบเอกสารไม่ถูกต้อง",400);}
  if([...form.keys()].some(key=>key!=="pages"&&key!=="language"))return fail("รูปแบบเอกสารไม่ถูกต้อง",400);
  const uploaded=form.getAll("pages");
  if(!uploaded.length||uploaded.length>12)return fail("เลือกภาพตารางและหน้าประกอบได้รวมไม่เกิน 12 หน้า",422);
  const language=form.get("language")==="en"?"en":"th";
  const pages:{mimeType:string;base64:string}[]=[];let total=0;
  for(const file of uploaded){
    if(!(file instanceof File)||!["image/jpeg","image/png","image/webp"].includes(file.type)||!file.size||!hasAllowedSyllabusFileExtension(file.name,file.type))return fail("ไฟล์ภาพตารางไม่ถูกต้อง",422);
    total+=file.size;if(total>3_500_000)return fail("ภาพรวมมีขนาดใหญ่เกินไป กรุณาลดจำนวนหน้า",413);
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!matchesSyllabusDocumentMagic(file.type,bytes))return fail("ชนิดไฟล์ไม่ตรงกับข้อมูลภาพ",422);
    pages.push({mimeType:file.type,base64:Buffer.from(bytes).toString("base64")});
  }
  const {data,error}=await supabase.rpc("begin_talevo_ai_request");
  const lease=(Array.isArray(data)?data[0]:data) as {allowed:boolean;request_id:string|null;reason:string}|null;
  if(error||!lease)return fail("ระบบโควตา AI ยังไม่พร้อม กรุณาลองใหม่",503);
  if(!lease.allowed||!lease.request_id)return fail(lease.reason==="concurrent"?"กำลังวิเคราะห์เอกสารอื่นอยู่ กรุณารอสักครู่":"ใช้ AI ครบโควตาในรอบนี้แล้ว",429);
  try{
    const preview=await analyzeUniversityTimetable(pages,request.signal,language);
    if(request.signal.aborted){await releaseTalevoAIRequest(supabase,lease.request_id);return fail("หยุดอ่านตารางแล้ว",499);}
    const usage=await completeTalevoAIRequest(supabase,lease.request_id,true);
    return NextResponse.json({preview,usage},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    await releaseTalevoAIRequest(supabase,lease.request_id);
    if(process.env.NODE_ENV==="development")console.error("[Talevo timetable]",error);
    return fail(request.signal.aborted?"หยุดอ่านตารางแล้ว":"AI อ่านตารางไม่สำเร็จ กรุณาลองใหม่ด้วยภาพที่ชัดขึ้น",request.signal.aborted?499:502);
  }
}

export const POST = secureApi(handlerPOST, "/api/ai/syllabus/analyze", "POST");
