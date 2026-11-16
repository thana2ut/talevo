"use client";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {useUiText} from "@/providers/ui-language";
import "./learning.css";
export function LearningHeader({title,name,description,back}:{title:string;name:string;description:string;back:string}){
  const t=useUiText(),router=useRouter();return <header className="learning-header"><div><button type="button" className="learning-back learning-history-back" onClick={()=>{if(window.history.length > 1) router.back(); else router.push(back);}}><ArrowLeft size={18}/>{t("ย้อนกลับ")}</button><p>{name}</p><h1>{t(title)}</h1><span>{t(description)}</span></div><Image src="/brand/talevo-ai-logo.png" alt="" width={120} height={120} priority/></header>;
}
export async function learningRequest(url:string,body?:unknown,signal?:AbortSignal){const response=await fetch(url,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message??"ดำเนินการไม่สำเร็จ กรุณาลองใหม่");return data;}
