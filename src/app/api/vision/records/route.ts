import { secureApi } from "@/lib/security/api-guard";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
async function handlerGET(){
  const db=await createClient();const {data:auth}=await db.auth.getUser();
  if(!auth.user)return NextResponse.json({message:"กรุณาเข้าสู่ระบบ"},{status:401});
  const records=await db.from("vision_records").select("id,kind,title,course_id,payload,target_id,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false}).limit(300);
  if(records.error)return NextResponse.json({message:"Talevo Vision ยังไม่ได้ติดตั้งตารางฐานข้อมูล"},{status:503});
  return NextResponse.json({records:records.data},{headers:{"Cache-Control":"no-store"}});
}

export const GET = secureApi(handlerGET, "/api/vision/records", "GET");
