"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Pencil, Plus } from "lucide-react";

import { useAppState } from "@/providers/app-state-provider";
import { getCourseById } from "@/lib/course-utils";
import type { ExamType } from "@/types";
import { useUiText } from "@/providers/ui-language";

const types: Record<ExamType,string> = {quiz:"สอบย่อย",midterm:"กลางภาค",final:"ปลายภาค",practical:"ปฏิบัติ",presentation:"นำเสนอ",other:"อื่น ๆ"};
const key = (d:Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export function ExamDashboard() {
  const uiText = useUiText();

 const { exams, schedules, academicTerm, now } = useAppState();
 const termNumber = academicTerm.term.replace(/^(?:ภาคการศึกษา|ภาคเรียน)(?:ที่)?\s*/, "").trim();
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
 const dateText=(d:Date)=>d.toLocaleDateString(uiText.locale,{day:"numeric",month:"short",year:"2-digit"});
 const timeText=(d:string)=>new Date(d).toLocaleTimeString(uiText.locale,{hour:"2-digit",minute:"2-digit"});
 return <div className="page exam-dashboard"><header className="exam-header"><div><h1>{uiText("การสอบ")}</h1><p className="exam-motto">{uiText("ตั้งเป้าให้ชัด เรียนให้สนุก")}<span>{uiText("สอบได้แน่นอน")}<span aria-hidden="true">♡</span></span></p></div><div className="exam-header-actions"><span className="exam-term"><CalendarDays/>{termNumber ? uiText("ภาคการศึกษาที่ {0}", [termNumber]) : uiText("ยังไม่ระบุภาคเรียน")}{academicTerm.academicYear ? `/${academicTerm.academicYear}` : ""}</span></div></header>
 <div className="exam-top"><section className="exam-panel exam-calendar" aria-label={uiText("ปฏิทินสอบ")}><header><button onClick={()=>shift(-1)} aria-label={uiText("เดือนก่อน")}><ChevronLeft/></button><h2>{month.toLocaleDateString(uiText.locale,{month:"long",year:"numeric"})}</h2><button onClick={()=>shift(1)} aria-label={uiText("เดือนถัดไป")}><ChevronRight/></button></header><div className="exam-week">{[uiText("อา."),uiText("จ."),uiText("อ."),uiText("พ."),uiText("พฤ."),uiText("ศ."),uiText("ส.")].map(d=><span key={uiText(d)}>{uiText(d)}</span>)}</div><div className="exam-days">{cells.map(d=>{const items=monthly.filter(e=>key(new Date(e.startAt))===key(d));return <button key={key(d)} className={`${d.getMonth()!==month.getMonth()?"outside":""} ${items.length?tone(d):""} ${selected===key(d)?"selected":""}`} aria-pressed={selected===key(d)} aria-label={uiText("{0} มีสอบ {1} รายการ", [dateText(d), items.length])} onClick={()=>setSelected(selected===key(d)?null:key(d))}><span className={key(d) === key(now) ? "exam-date-today" : undefined}>{d.getDate()}</span>{items.length>0&&<i/>}</button>;})}</div></section>
 <section className="exam-panel exam-summary"><div className="exam-stats"><div><FileText/><span>{uiText("สอบทั้งหมด")}<strong>{monthly.length} {uiText("วิชา")}</strong></span></div><div><Clock3/><span>{uiText("ใกล้สอบที่สุด")}<strong className="exam-countdown">{days===null?uiText("ยังไม่มีสอบ"):days===0?uiText("วันนี้"):uiText("อีก {0} วัน", [days])}</strong><small>{next?`(${dateText(new Date(next.startAt))})`:uiText("เพิ่มรายการสอบ")}</small></span></div></div><div className="exam-legend">{[["past",uiText("มีสอบ / สอบที่ผ่านมา")],["soon",uiText("ใกล้สอบ (ภายใน 7 วัน)")],["today",uiText("สอบวันนี้")],["future",uiText("วันอื่น ๆ")]].map(([color,label])=><div key={color}><i className={color}/>{uiText(label)}</div>)}</div></section></div>
 <section className="exam-panel exam-list"><header><h2><FileText/>{uiText("รายการสอบ")}</h2><div><Link className="exam-add" href="/exams/new"><Plus/>{uiText("เพิ่มการสอบ")}</Link></div></header><div className="exam-table-wrap"><table><thead><tr><th>{uiText("วันที่")}</th><th>{uiText("วิชา")}</th><th>{uiText("เวลา")}</th><th>{uiText("ห้อง")}</th><th>{uiText("ประเภท")}</th></tr></thead><tbody>{rows.map(e=><tr key={e.id}><td><i className={`exam-dot ${tone(new Date(e.startAt))}`}/>{dateText(new Date(e.startAt))}</td><td><Link href={`/exams/${e.id}`}>{getCourseById(schedules,e.courseId)?.name??e.title}<small>{e.title}</small></Link></td><td>{timeText(e.startAt)}{e.endAt?` – ${timeText(e.endAt)}`:""}</td><td>{e.room||uiText("ยังไม่ระบุ")}</td><td><div className="exam-row-actions"><span className={`exam-type ${e.type}`}>{uiText(types[e.type])}</span><Link className="exam-row-edit" href={`/exams/new?edit=${encodeURIComponent(e.id)}`} aria-label={uiText("แก้ไขการสอบ {0}", [getCourseById(schedules,e.courseId)?.name??e.title])} title={uiText("แก้ไขการสอบ")}><Pencil aria-hidden="true"/></Link></div></td></tr>)}</tbody></table></div>{!rows.length&&<div className="exam-empty">{selected?uiText("ไม่มีการสอบในวันที่เลือก"):uiText("ยังไม่มีการสอบในเดือนนี้")}<Link href="/exams/new">{uiText("เพิ่มวันสอบและตั้งการแจ้งเตือน →")}</Link></div>}</section></div>;
}
