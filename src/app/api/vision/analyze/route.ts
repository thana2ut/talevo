import { secureApi } from "@/lib/security/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { matchesSyllabusDocumentMagic } from "@/lib/ai/syllabus-upload";
import { analyzeClassroomImages } from "@/lib/vision-provider";
import { normalizeBatchExtraction } from "@/lib/vision";
import { completeTalevoAIRequest, releaseTalevoAIRequest } from "@/lib/ai/usage-repository";
export const runtime="nodejs";
export const maxDuration=60;
const fail=(message:string,status=400,retryAfter?:number)=>NextResponse.json({message,retryAfter},{status,headers:{"Cache-Control":"no-store",...(retryAfter?{"Retry-After":String(retryAfter)}:{})}});
async function handlerPOST(request:NextRequest) {
  if(!isTrustedMutationOrigin(request))return fail("คำขอไม่ได้มาจาก Talevo",403);
  const db=await createClient();const {data:auth}=await db.auth.getUser();
  if(!auth.user)return fail("กรุณาเข้าสู่ระบบใหม่",401);
  const length=Number(request.headers.get("content-length"));
  if(!Number.isFinite(length)||length<=0||length>3500000)return fail("ภาพที่ส่งต้องไม่เกิน 3 MB",413);
  let leaseId:string|null=null;
  try {
    const form=await request.formData();
    const files=form.getAll("images");
    const metadata=JSON.parse(String(form.get("metadata")??"[]")) as {id:string;number:number}[];
    // Accept an older client while the new bundle is being installed.
    if(!files.length&&form.get("image")){files.push(form.get("image")!);metadata.push({id:String(form.get("imageId")??""),number:Number(form.get("imageNumber"))});}
    if(!Array.isArray(metadata)||!files.length||files.length>4||files.length!==metadata.length||new Set(metadata.map(s=>s.id)).size!==files.length)return fail("กรุณาเลือก 1–4 ภาพต่อชุด");
    const images: {bytes:Buffer;mimeType:string;id:string}[]=[];
    for(let index=0;index<files.length;index++){
      const file=files[index],source=metadata[index];
      if(!(file instanceof File)||!file.size||!source||!/^[-\w]{1,100}$/.test(source.id)||!Number.isInteger(source.number)||source.number<1)return fail("ข้อมูลภาพไม่ถูกต้อง");
      if(!["image/png","image/jpeg","image/webp"].includes(file.type))return fail("กรุณาแปลงภาพเป็น PNG หรือ JPG ก่อน");
      const bytes=Buffer.from(await file.arrayBuffer());
      if(!matchesSyllabusDocumentMagic(file.type,bytes))return fail("ชนิดไฟล์ไม่ตรงกับภาพจริง");
      images.push({bytes,mimeType:file.type,id:source.id});
    }
    if(images.reduce((sum,image)=>sum+image.bytes.length,0)>3*1024*1024)return fail("ภาพในชุดรวมต้องไม่เกิน 3 MB",413);
    const digest=createHash("sha256").update("vision-batch-v2").update(JSON.stringify(images.map(image=>[image.id,createHash("sha256").update(image.bytes).digest("hex")]))).digest("hex");
    // Only the account owner can read this short-lived OCR cache (RLS).
    const cached=await db.from("vision_analyses").select("result").eq("user_id",auth.user.id).eq("digest",digest).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(cached.error)return fail("Talevo Vision ยังไม่ได้ติดตั้งส่วนฐานข้อมูล กรุณาติดต่อผู้ดูแล",503);
    if(cached.data)return NextResponse.json({items:normalizeBatchExtraction(cached.data.result,metadata),cached:true},{headers:{"Cache-Control":"no-store"}});
    await db.from("vision_analyses").delete().eq("user_id",auth.user.id).lt("expires_at",new Date().toISOString());
    const lease=await db.rpc("begin_talevo_ai_request");const row=Array.isArray(lease.data)?lease.data[0]:lease.data;
    if(lease.error)return fail("ระบบโควตา AI ไม่พร้อมใช้งาน",503);
    if(!row?.allowed||!row.request_id)return fail("AI ถึงขีดจำกัดชั่วคราว คิวที่เหลือยังอยู่ กรุณาลองต่อภายหลัง",429,Math.max(1,row?.retry_after_seconds??60));
    leaseId=row.request_id;
    const result=await analyzeClassroomImages(images,AbortSignal.any([request.signal,AbortSignal.timeout(45000)]));
    const items=normalizeBatchExtraction(result,metadata);
    const save=await db.from("vision_analyses").upsert({user_id:auth.user.id,digest,result,expires_at:new Date(Date.now()+86400000).toISOString()});
    if(save.error)throw new Error("บันทึกผลวิเคราะห์ไม่สำเร็จ");
    await completeTalevoAIRequest(db,leaseId!,true);leaseId=null;
    return NextResponse.json({items},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(leaseId)await releaseTalevoAIRequest(db,leaseId);
    const status=typeof error==="object"&&error&&"status"in error?Number(error.status):0;
    if(status===429)return fail("บริการ AI จำกัดการใช้ชั่วคราว กรุณารอสักครู่แล้วทำคิวต่อ",429,60);
    if(error instanceof Error&&/อ่านตัวอักษร|ภาพมีรายการ/.test(error.message))return fail(error.message,422);
    return fail("วิเคราะห์ภาพไม่สำเร็จ กรุณาลองใหม่ ภาพนี้ยังไม่ได้ถูกบันทึกเป็นงาน",502);
  }
}

export const POST = secureApi(handlerPOST, "/api/vision/analyze", "POST");
