"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Plus } from "lucide-react";
import { NotificationBell } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
import { getCourseById } from "@/lib/course-utils";
import type { ExamType } from "@/types";
const types: Record<ExamType,string> = {quiz:"สอบย่อย",midterm:"กลางภาค",final:"ปลายภาค",practical:"ปฏิบัติ",presentation:"นำเสนอ",other:"อื่น ๆ"};
const key = (d:Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export function ExamDashboard() {
 const { exams, schedules, academicTerm, now } = useAppState();
 const [month,setMonth] = useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
 const [selected,setSelected] = useState<string|null>(null);
 const sorted = [...exams].filter(e=>Number.isFinite(new Date(e.startAt).getTime())).sort((a,b)=>new Date(a.startAt).getTime()-new Date(b.startAt).getTime());
 const monthly = sorted.filter(e=>{const d=new Date(e.startAt);return d.getMonth()===month.getMonth()&&d.getFullYear()===month.getFullYear();});
 const rows = selected ? monthly.filter(e=>key(new Date(e.startAt))===selected) : monthly;
 const next = sorted.find(e=>!e.completedAt&&new Date(e.endAt??e.startAt)>=now);
 const days = next ? Math.max(0,Math.ceil((new Date(new Date(next.startAt).toDateString()).getTime()-new Date(now.toDateString()).getTime())/86400000)) : null;
 const tone=(date:Date)=>key(date)===key(now)?"today":date<now?"past":(date.getTime()-now.getTime())/86400000<=7?"soon":"future";
 const first=new Date(month.getFullYear(),month.getMonth(),1); const count=Math.ceil((first.getDay()+new Date(month.getFullYear(),month.getMonth()+1,0).getDate())/7)*7;
 const cells=Array.from({length:count},(_,i)=>new Date(month.getFullYear(),month.getMonth(),1-first.getDay()+i));
 const shift=(n:number)=>{setMonth(new Date(month.getFullYear(),month.getMonth()+n,1));setSelected(null);};
 const dateText=(d:Date)=>d.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"});
 const timeText=(d:string)=>new Date(d).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
 return <div className="page exam-dashboard"><header className="exam-header"><div><h1>การสอบ</h1><p>ตารางสอบรายเดือน ดูง่าย ไม่ซับซ้อน</p></div><div className="exam-header-actions"><span className="exam-term"><CalendarDays/>ภาคการศึกษาที่ {academicTerm.term}/{academicTerm.academicYear}</span><NotificationBell/></div></header>
 <div className="exam-top"><section className="exam-panel exam-calendar" aria-label="ปฏิทินสอบ"><header><button onClick={()=>shift(-1)} aria-label="เดือนก่อน"><ChevronLeft/></button><h2>{month.toLocaleDateString("th-TH",{month:"long",year:"numeric"})}</h2><button onClick={()=>shift(1)} aria-label="เดือนถัดไป"><ChevronRight/></button></header><div className="exam-week">{["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."].map(d=><span key={d}>{d}</span>)}</div><div className="exam-days">{cells.map(d=>{const items=monthly.filter(e=>key(new Date(e.startAt))===key(d));return <button key={key(d)} className={`${d.getMonth()!==month.getMonth()?"outside":""} ${items.length?tone(d):""} ${selected===key(d)?"selected":""}`} aria-pressed={selected===key(d)} aria-label={`${dateText(d)} มีสอบ ${items.length} รายการ`} onClick={()=>setSelected(selected===key(d)?null:key(d))}><span>{d.getDate()}</span>{items.length>0&&<i/>}</button>;})}</div></section>
 <section className="exam-panel exam-summary"><div className="exam-stats"><div><FileText/><span>สอบทั้งหมด<strong>{monthly.length} วิชา</strong></span></div><div><Clock3/><span>ใกล้สอบที่สุด<strong className="exam-countdown">{days===null?"ยังไม่มีสอบ":days===0?"วันนี้":`อีก ${days} วัน`}</strong><small>{next?`(${dateText(new Date(next.startAt))})`:"เพิ่มรายการสอบเพื่อเริ่มวางแผน"}</small></span></div></div><div className="exam-legend">{[["past","มีสอบ / สอบที่ผ่านมา"],["soon","ใกล้สอบ (ภายใน 7 วัน)"],["today","สอบวันนี้"],["future","วันอื่น ๆ"]].map(([color,label])=><div key={color}><i className={color}/>{label}</div>)}</div></section></div>
 <section className="exam-panel exam-list"><header><h2><FileText/>รายการสอบ</h2><div><button className="exam-all" onClick={()=>setSelected(null)}>ดูทั้งหมด →</button><Link className="exam-add" href="/exams/new"><Plus/>เพิ่มการสอบ</Link></div></header><div className="exam-table-wrap"><table><thead><tr><th>วันที่</th><th>วิชา</th><th>เวลา</th><th>ห้อง</th><th>ประเภท</th></tr></thead><tbody>{rows.map(e=><tr key={e.id}><td><i className={`exam-dot ${tone(new Date(e.startAt))}`}/>{dateText(new Date(e.startAt))}</td><td><Link href={`/exams/${e.id}`}>{getCourseById(schedules,e.courseId)?.name??e.title}<small>{e.title}</small></Link></td><td>{timeText(e.startAt)}{e.endAt?` – ${timeText(e.endAt)}`:""}</td><td>{e.room||"ยังไม่ระบุ"}</td><td><span className={`exam-type ${e.type}`}>{types[e.type]}</span></td></tr>)}</tbody></table></div>{!rows.length&&<div className="exam-empty">{selected?"ไม่มีการสอบในวันที่เลือก":"ยังไม่มีการสอบในเดือนนี้"}<Link href="/exams/new">เพิ่มวันสอบและตั้งการแจ้งเตือน →</Link></div>}</section></div>;
}
