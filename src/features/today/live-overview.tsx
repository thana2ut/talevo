"use client";
import { useUiText } from "@/providers/ui-language";
import Link from "next/link";
import {CalendarDays,Clock3,ClipboardCheck} from "lucide-react";
import {useEffect,useState} from "react";
import {useAppState} from "@/providers/app-state-provider";
import {getScheduleDisplayName,timeToMinutes} from "@/lib/schedule-utils";
import "./live-overview.css";
export function LiveOverview({kind}:{kind:"lesson"|"tasks"}){
 const uiText=useUiText();
 const {schedules,tasks,academicTerm}=useAppState();
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer)},[]);
 const pending=tasks.filter(t=>t.status!=="completed"&&!t.completedAt).sort((a,b)=>Date.parse(a.dueDate)-Date.parse(b.dueDate));
 if(kind==="tasks")return <section className={`live-overview live-tasks ${pending.length?"has-pending":""}`}><ClipboardCheck aria-hidden="true"/><div><strong>{pending.length?uiText("งานค้าง {0} รายการ",[pending.length]):uiText("ไม่มีงานค้าง")}</strong>{pending.length?<ul>{pending.map((t,i)=><li key={t.id}><Link href={`/tasks/${t.id}`}>{t.title}</Link><small>{Date.parse(t.dueDate)<now.getTime()?uiText("เลยกำหนดส่ง"):`${i===0?uiText("ใกล้ส่งที่สุด · "):""}${new Date(t.dueDate).toLocaleString(uiText.locale,{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}`}</small></li>)}</ul>:<p>{uiText("พักให้เต็มที่ แล้วค่อยก้าวต่อไป 🌱")}</p>}</div></section>;
 const scoped=schedules.filter(s=>(!s.academicTerm||s.academicTerm===academicTerm.term)&&(!s.academicYear||s.academicYear===academicTerm.academicYear)&&(!s.academicLevel||s.academicLevel===academicTerm.level));
 const bangkok=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Bangkok"}));
 const minute=bangkok.getHours()*60+bangkok.getMinutes();
 const candidates=Array.from({length:8},(_,offset)=>scoped.filter(s=>s.day===(bangkok.getDay()+6+offset)%7).map(s=>({s,offset,start:offset*1440+timeToMinutes(s.startTime)-minute,end:offset*1440+timeToMinutes(s.endTime)-minute}))).flat().filter(x=>x.end>0).sort((a,b)=>a.start-b.start);
 const active=candidates.find(x=>x.start<=0);const next=active??candidates[0];
 const remaining=next?Math.max(0,active?next.end:next.start):0;
 const seconds=Math.max(0,Math.floor(remaining*60-bangkok.getSeconds()));
 const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;
 const countdown=[d?`${d} ${uiText.language==="en"?"d":"วัน"}`:"",h?`${h} ${uiText.language==="en"?"h":"ชม."}`:"",`${m} ${uiText.language==="en"?"m":"นาที"}`,`${String(sec).padStart(2,"0")} ${uiText.language==="en"?"s":"วินาที"}`].filter(Boolean).join(" ");
 const date=new Date(bangkok);if(next)date.setDate(date.getDate()+next.offset);
 const scheduleDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
 return <Link href={next ? `/schedule?date=${scheduleDate}` : "/schedule"} className={`live-overview live-lesson ${active?"is-learning":""}`}><CalendarDays aria-hidden="true"/><div><small>{active?uiText("กำลังเรียน"):next?`${uiText("คาบต่อไป")} · ${next.offset===0?uiText("วันนี้"):date.toLocaleDateString(uiText.locale,{weekday:"long",day:"numeric",month:"short"})}`:uiText("คาบเรียนถัดไป")}</small><strong>{next?getScheduleDisplayName(next.s):uiText("ยังไม่มีตารางเรียน")}</strong>{next&&<><p>{next.s.room||uiText("ยังไม่ระบุห้อง / ตึก")} · {next.s.startTime}–{next.s.endTime}</p><span className="live-countdown"><Clock3 size={16}/>{active?uiText("หมดคาบใน"):uiText("เริ่มใน")} {countdown}</span>{active&&candidates.find(x=>x.start>0)&&<small>{uiText("คาบต่อไป:")}{getScheduleDisplayName(candidates.find(x=>x.start>0)!.s)}</small>}</>}</div></Link>;
}
