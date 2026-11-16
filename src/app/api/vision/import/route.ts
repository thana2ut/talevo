import { secureApi } from "@/lib/security/api-guard";
import { NextRequest,NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { dueTimestamp,normalizeText,readiness,VISION_FIELDS,type VisionItem } from "@/lib/vision";
export const dynamic="force-dynamic";
const fail=(message:string,status=400)=>NextResponse.json({message},{status,headers:{"Cache-Control":"no-store"}});
async function handlerPOST(request:NextRequest) {
  if(!isTrustedMutationOrigin(request))return fail("คำขอไม่ถูกต้อง",403);
  const db=await createClient();const {data:auth}=await db.auth.getUser();
  if(!auth.user)return fail("กรุณาเข้าสู่ระบบ",401);
  const raw=await request.text();if(raw.length>1500000)return fail("กรุณาแบ่งบันทึกเป็นชุดย่อย",413);
  try{
    const body=JSON.parse(raw);
    if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)return fail("เลือก 1–100 รายการต่อการบันทึกหนึ่งชุด");
    const entries=body.items.map((item:VisionItem)=>{
      if(!item||!item.facts||!item.selected||item.choice==="skip")throw new Error("รายการที่เลือกไม่ถูกต้อง");
      for(const key of VISION_FIELDS){const fact=item.facts[key];if(!fact||!Array.isArray(fact.evidence)||(fact.value!==null&&typeof fact.value!=="string")||String(fact.value??"").length>16000)throw new Error("รายละเอียดไม่ถูกต้อง");}
      if(!Array.isArray(item.conflicts)||!Array.isArray(item.sources)||item.sources.length>1000)throw new Error("ข้อมูลอ้างอิงไม่ถูกต้อง");
      const issues=readiness(item);if(issues.length)throw new Error(issues[0]);
      if(item.choice==="update"&&body.confirmUpdates!==true)throw new Error("กรุณายืนยันรายการที่จะอัปเดต");
      const identity=[item.kind,item.courseId||normalizeText(item.facts.courseCode.value||item.facts.courseName.value||""),normalizeText(item.facts.title.value!),normalizeText(item.facts.lesson.value??""),dueTimestamp(item),item.facts.url.value??""];
      return {item,fingerprint:createHash("sha256").update(JSON.stringify(identity)).digest("hex"),dueAt:dueTimestamp(item),confirmedUpdate:body.confirmUpdates===true};
    });
    const result=await db.rpc("import_talevo_vision",{entries});
    if(result.error){
      if(result.error.code==="PGRST202")return fail("ส่วนบันทึก Talevo Vision ยังไม่ได้ติดตั้งฐานข้อมูล",503);
      const safe=/กรุณา|พบรายการเดิม|ต้องยืนยัน|ไม่พบรายการเดิม|ไม่พบวิชา/.test(result.error.message)?result.error.message:"บันทึกไม่สำเร็จ ไม่มีรายการในชุดนี้ถูกเปลี่ยน กรุณาลองใหม่";
      return fail(safe,409);
    }
    return NextResponse.json(result.data,{headers:{"Cache-Control":"no-store"}});
  }catch(error){return fail(error instanceof Error&&!(error instanceof SyntaxError)?error.message:"รูปแบบข้อมูลไม่ถูกต้อง");}
}

export const POST = secureApi(handlerPOST, "/api/vision/import", "POST");
