"use client";
import Link from "next/link";
import {LiveOverview} from "./live-overview";
import {CalendarDays,ClipboardCheck,ClipboardList,ClipboardX} from "lucide-react";
import {useEffect,useState,type ReactNode} from "react";
import {NotificationBell} from "@/components/ui";
import {timeToMinutes,getScheduleDisplayName} from "@/lib/schedule-utils";
import type {ClassSchedule,Task} from "@/types";
import "./mobile-home.css";
import {ThailandClock} from "@/components/thailand-clock";
import { useUiText } from "@/providers/ui-language";

export function MobileHome({greeting,now,classes,tasks,children}:{greeting:string;now:Date;classes:ClassSchedule[];tasks:Task[];pending:Task[];children:ReactNode}){
  const uiText = useUiText();

 const [liveTime,setLiveTime]=useState(now);
 useEffect(()=>{const timer=window.setInterval(()=>setLiveTime(new Date()),1000);return ()=>window.clearInterval(timer);},[]);
 const clock=liveTime>now?liveTime:now;
 const minutes=clock.getHours()*60+clock.getMinutes()+clock.getSeconds()/60;
 const progress=classes.length ? classes.reduce((total,c)=>{ const start=timeToMinutes(c.startTime); const duration=timeToMinutes(c.endTime)-start; return total+(duration>0?Math.min(1,Math.max(0,(minutes-start)/duration)):minutes>=start?1:0); },0)/classes.length : 0;
 const completed=classes.filter(c=>timeToMinutes(c.endTime)<=minutes).length;
 const current=classes.find(c=>timeToMinutes(c.startTime)<=minutes&&timeToMinutes(c.endTime)>minutes);
 const next=classes.find(c=>timeToMinutes(c.startTime)>minutes);
 const lesson=current??next;
 const pending=tasks.filter(task=>task.status!=="completed"&&!task.completedAt);
 const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
 const days=Array.from({length:7},(_,i)=>new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i));
 const month=new Intl.DateTimeFormat(uiText.locale,{month:"long",year:"numeric"}).format(now);
 return <div className="mobile-home">
  <header className="mh-header"><div><span>TALEVO</span><h1>{greeting} 👋</h1><p>{uiText("ทุกเรื่องเรียนของคุณ จัดการได้ง่าย ๆ ในที่เดียว")}</p></div><NotificationBell glass/></header>
  <section className="mh-hero"><span className="mh-ai"><span className="mh-asset-icon mh-sparkle-icon" aria-hidden="true"/>{uiText("Talevo AI แนะนำ")}</span><h2>{lesson?getScheduleDisplayName(lesson):classes.length?uiText("เรียนครบทุกคาบแล้ว"):uiText("วันนี้ไม่มีคาบเรียน")}</h2><p>{lesson?`${current?uiText("กำลังเรียน"):uiText("คาบถัดไป")} · ${lesson.startTime}–${lesson.endTime}`:classes.length?uiText("พักผ่อนแล้วเตรียมพร้อมสำหรับวันต่อไป"):uiText("วางแผนล่วงหน้าหรือพักผ่อนได้เต็มที่")}</p><ThailandClock/></section>
  <section className="mh-today"><h2>{uiText("วันนี้ของคุณ")}</h2><div className="mh-stats"><Link href="/schedule" className="mh-lessons"><div className="mh-ring" role="img" aria-label={uiText("เรียนแล้ว {0} จาก {1} คาบ", [completed, classes.length])}><svg className="mh-ring-progress" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${progress * 100} 100`}/></svg><div><strong>{completed}<small>/{classes.length}</small></strong><span className="mh-ring-unit">{uiText("คาบ")}</span></div></div><div className="mh-progress-copy"><span>{uiText("วันนี้เรียนไปแล้ว")}</span><strong>{completed} {uiText("คาบ")}</strong><small>{uiText("เหลืออีก")}{classes.length - completed} {uiText("คาบ")}</small></div></Link><div className="mh-task-stats"><Link href="/tasks?filter=all" className={`mh-pending ${pending.length ? "has-pending" : "is-clear"}`}><span className="mh-pending-icon" aria-hidden="true">{pending.length ? <ClipboardList/> : <ClipboardCheck/>}</span><span className="mh-pending-copy"><strong>{pending.length}</strong><small>{uiText("งานค้าง")}</small></span><span className="mh-pending-art" aria-hidden="true">{pending.length ? <ClipboardX/> : <ClipboardCheck/>}</span></Link><Link href="/tasks?filter=dueSoon" className="mh-due"><span className="mh-asset-icon mh-clock-icon" aria-hidden="true"/><span><strong>{pending.length}</strong><small>{uiText("กำลังดำเนินการ")}</small></span><CalendarDays className="mh-calendar-art" aria-hidden="true"/></Link></div></div></section>
  <section className="mh-week"><header><h2>{uiText("สัปดาห์นี้")}</h2><span>{month}</span></header><div className="mh-days">{days.map((day,i)=><Link href="/schedule" key={i} aria-label={uiText("ดูตารางเรียน {0}", [day.toLocaleDateString(uiText.locale)])} aria-current={day.getDate()===now.getDate()?"date":undefined}><small>{[uiText("จ"),uiText("อ"),uiText("พ"),uiText("พฤ"),uiText("ศ"),uiText("ส"),uiText("อา")][i]}</small><strong>{day.getDate()}</strong></Link>)}</div></section>
  <section className="mh-work"><header><h2>{uiText("สิ่งที่ต้องทำ")}</h2></header><LiveOverview kind="tasks"/><LiveOverview kind="lesson"/></section>
  {classes.length>0&&<section className="mh-class-list">{children}</section>}
 </div>;
}
