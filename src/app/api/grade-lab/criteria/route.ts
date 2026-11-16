import { NextRequest, NextResponse } from "next/server";
import { secureApi } from "@/lib/security/api-guard";
import { createClient } from "@/lib/supabase/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { learningJSON } from "@/lib/ai/learning-tools";
import { matchesSyllabusDocumentMagic } from "@/lib/ai/syllabus-upload";
import { completeTalevoAIRequest, releaseTalevoAIRequest } from "@/lib/ai/usage-repository";
export const maxDuration=60;
const reply=(message:string,status=400)=>NextResponse.json({message},{status,headers:{"Cache-Control":"no-store"}});
async function handler(request:NextRequest){
 if(!isTrustedMutationOrigin(request))return reply("คำขอไม่ถูกต้อง",403);
 const db=await createClient();const {data:auth}=await db.auth.getUser();if(!auth.user)return reply("กรุณาเข้าสู่ระบบ",401);
 if(Number(request.headers.get("content-length"))>4400000)return reply("ภาพต้องไม่เกิน 4 MB",413);
 let leaseId:string|null=null;
 try{
 const form=await request.formData();const file=form.get("image");
 if(!(file instanceof File)||!file.size||file.size>4*1024*1024||file.type!=="image/jpeg")return reply("กรุณาเลือกรูป JPG ขนาดไม่เกิน 4 MB");
 const bytes=Buffer.from(await file.arrayBuffer());if(!matchesSyllabusDocumentMagic(file.type,bytes))return reply("ไฟล์ภาพไม่ถูกต้อง");
 const lease=await db.rpc("begin_talevo_ai_request");const row=Array.isArray(lease.data)?lease.data[0]:lease.data;
 if(lease.error)return reply("ระบบ AI ยังไม่พร้อม กรุณาลองใหม่",503);
 if(!row?.allowed||!row.request_id)return reply("โควตา AI เต็มชั่วคราว กรุณาลองภายหลัง",429);leaseId=row.request_id;
 const result=await learningJSON('Extract ONLY visible grading criteria. JSON {components:[{name:string,weight:number}],thresholds:[{label:string,min:number,max:number}]}. Weights are percentages. Never invent missing categories or cutoffs. Convert integer-inclusive upper cutoffs e.g. 75-79 into exclusive 80. Highest max=100. Empty arrays if unreadable. Do not extract earned scores.',"อ่านสัดส่วนคะแนนและตารางตัดเกรดจากภาพ",[`data:image/jpeg;base64,${bytes.toString("base64")}`],AbortSignal.timeout(50000)) as {components?:{name:string;weight:number}[];thresholds?:{label:string;min:number;max:number}[]};
 if(!Array.isArray(result.components)||!result.components.length||result.components.length>30||result.components.some(c=>typeof c.name!=="string"||!c.name.trim()||c.name.length>200||!Number.isFinite(c.weight)||c.weight<=0||c.weight>100)||Math.abs(result.components.reduce((s,c)=>s+c.weight,0)-100)>0.001)return reply("อ่านสัดส่วนรวม 100% ไม่ครบ กรุณาถ่ายเฉพาะเกณฑ์ให้ชัดแล้วลองใหม่");
 const thresholds=result.thresholds;
 if(!Array.isArray(thresholds)||thresholds.length>30||thresholds.some(b=>typeof b.label!=="string"||!b.label.trim()||b.label.length>30||!Number.isFinite(b.min)||!Number.isFinite(b.max)||b.min<0||b.max>100||b.min>=b.max))return reply("อ่านตารางเกรดไม่ชัด กรุณาลองภาพใหม่");
 await completeTalevoAIRequest(db,leaseId!,true);leaseId=null;
 return NextResponse.json({components:result.components,thresholds},{headers:{"Cache-Control":"no-store"}});
 }catch{return reply("อ่านภาพไม่สำเร็จ กรุณาลองใหม่หรือกรอกเกณฑ์เอง",503);}finally{if(leaseId)await releaseTalevoAIRequest(db,leaseId);}
}
export const POST=secureApi(handler,"/api/grade-lab/criteria","POST");
