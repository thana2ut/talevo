"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {LifeBuoy,CalendarClock,Clock3,Check,LoaderCircle,Play,Plus,Trash2,AlertTriangle} from "lucide-react";
import {BottomSheet,Card} from "@/components/ui";
import {useAppState} from "@/providers/app-state-provider";
import {useUiText} from "@/providers/ui-language";
import {localDate,rankRescueTasks,rescueFingerprint,type RescuePreferences,type RescuePlan} from "@/lib/rescue";
import {LearningHeader,learningRequest} from "./learning-ui";
const initialPreferences:RescuePreferences={windows:[],importance:{},minutes:{}};
export function RescuePage(){
  const t=useUiText(),{tasks,schedules,exams,now,isHydrated,setTaskStatus}=useAppState();
  const [preferences,setPreferences]=useState<RescuePreferences>(initialPreferences),[plan,setPlan]=useState<RescuePlan|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[saved,setSaved]=useState(false),[review,setReview]=useState(false),[editTime,setEditTime]=useState(false),[analysis,setAnalysis]=useState(false);
  const controller=useRef<AbortController|null>(null),lock=useRef(false);
  useEffect(()=>{const abort=new AbortController();void learningRequest("/api/learning/rescue",undefined,abort.signal).then(data=>{setRevision(data.revision);if(data.payload){setPreferences(data.payload.preferences);setPlan(data.payload.plan);setSaved(true);}}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>{abort.abort();controller.current?.abort();};},[]);
  const ranked=useMemo(()=>rankRescueTasks(tasks,preferences,now.getTime()),[tasks,preferences,now]);
  const fingerprint=isHydrated?rescueFingerprint(tasks,schedules,exams,preferences):"";
  const stale=Boolean(plan&&fingerprint&&plan.fingerprint!==fingerprint);
  const change=(next:RescuePreferences)=>{setPreferences(next);setSaved(false);};
  const create=async()=>{if(lock.current)return;if(!preferences.windows.length){setEditTime(true);return;}lock.current=true;setBusy(true);setError("");setSaved(false);const abort=new AbortController();controller.current=abort;try{const data=await learningRequest("/api/learning/rescue",{operation:"plan",preferences},abort.signal);setPlan(data.plan);setPreferences(data.preferences);setAnalysis(true);}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:"สร้างแผนไม่สำเร็จ");}finally{lock.current=false;setBusy(false);}};
  const save=async()=>{if(lock.current||!plan)return;lock.current=true;setBusy(true);setError("");try{const data=await learningRequest("/api/learning/rescue",{operation:"save",preferences,plan,revision});setRevision(data.revision);setSaved(true);setReview(false);}catch(e){setError(e instanceof Error?e.message:"บันทึกไม่สำเร็จ");}finally{lock.current=false;setBusy(false);}};
  const format=(value:string)=>new Intl.DateTimeFormat(t.locale,{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
  return <div className="page learning-page rescue-dashboard"><LearningHeader title="โหมดกู้สถานการณ์" name="TALEVO RESCUE MODE" description="ค่อย ๆ จัดงานค้าง วางแผนตามเวลาที่มี" back="/tasks"/>
    {error&&<p className="learning-warning" role="alert">{t(error)} <button type="button" className="text-button" onClick={()=>void create()} disabled={busy}>{t("ลองใหม่")}</button></p>}
    {loading||!isHydrated?null:<>
    <section className="learning-stats rescue-stats" aria-label={t("ภาพรวมงาน")}>
      {[[LifeBuoy,ranked.length,"งานค้าง"],[CalendarClock,ranked.filter(r=>Date.parse(r.task.dueDate)<now.getTime()).length,"เลยกำหนด"],[Clock3,ranked.filter(r=>Date.parse(r.task.dueDate)>=now.getTime()&&Date.parse(r.task.dueDate)-now.getTime()<7*86400000).length,"ใกล้กำหนด"]].map(([Icon,count,label])=>{const I=Icon as typeof LifeBuoy;return <Card key={String(label)} className="rescue-stat"><I/><strong>{String(count)}</strong><span>{t(String(label))}</span></Card>;})}
    </section>
    {!ranked.length?<Card className="learning-empty"><Check size={38}/><h2>{t("ไม่มีงานค้างแล้ว")}</h2><Link className="secondary-button" href="/tasks">{t("กลับไปหน้างาน")}</Link></Card>:<>
    <div className="learning-toolbar rescue-toolbar"><button className="secondary-button" type="button" onClick={()=>setAnalysis(v=>!v)}>{t("วิเคราะห์งานทั้งหมด")}</button><button className="secondary-button" type="button" onClick={()=>setEditTime(true)}>{t("แก้ไขเวลาว่าง")}</button><button className="primary-button" type="button" disabled={busy} onClick={()=>void create()}>{busy?<LoaderCircle className="voice-spin"/>:<LifeBuoy/>}{t(plan?"ปรับแผนใหม่":"สร้างแผนกู้สถานการณ์")}</button></div>
    <div className="learning-columns rescue-columns">
    <Card className="learning-panel rescue-task-panel"><h2><LifeBuoy aria-hidden="true"/>{t("เริ่มจากงานนี้ก่อน")}</h2><p className="learning-muted">{t("จัดลำดับจากกำหนดส่ง ความสำคัญ และงานที่เหลือ")}</p><div className="rescue-task-list">{ranked.map((row,index)=><article key={row.task.id} className={`rescue-task ${index===0?"first":""}`}><header><span className="learning-step-number">{index+1}</span><Link href={`/tasks/${row.task.id}`}><strong>{row.task.title}</strong><small>{format(row.task.dueDate)}</small></Link></header><p><Clock3 size={15}/>{row.remaining} {t("นาที")}{row.estimated&&` · ${t("เวลาประมาณการ")}`}</p>
      {analysis&&<details><summary>{t("เหตุผลและปรับความสำคัญ")}</summary><ul>{row.reasons.map(r=><li key={r}>{t(r)}</li>)}</ul><div className="learning-form-two"><label>{t("ความสำคัญ")}<select className="input" value={preferences.importance[row.task.id]??1} onChange={e=>change({...preferences,importance:{...preferences.importance,[row.task.id]:Number(e.target.value)}})}><option value={1}>{t("ปกติ")}</option><option value={2}>{t("สำคัญ")}</option><option value={3}>{t("สำคัญสูง")}</option></select></label><label>{t("เวลาทั้งงาน (นาที)")}<input className="input" type="number" min={5} max={10080} step={5} value={preferences.minutes[row.task.id]??""} onChange={e=>{const minutes={...preferences.minutes};if(e.target.value)minutes[row.task.id]=Number(e.target.value);else delete minutes[row.task.id];change({...preferences,minutes});}}/></label></div></details>}
      {index===0&&<Link className="primary-button button-block" href={`/tasks/${row.task.id}`} onClick={()=>setTaskStatus(row.task.id,"doing")}><Play size={18}/>{t("เริ่มงานแรก")}</Link>}
    </article>)}</div></Card>
    <Card className="learning-panel rescue-plan"><h2>{t("แผนที่ AI แนะนำ")}</h2><p className="learning-muted">{t("กันเวลาเรียนและสอบ พร้อมพักระหว่างช่วงงาน")}</p>
      {stale&&<p className="learning-warning" role="status">{t("ข้อมูลงานหรือเวลาว่างเปลี่ยนแล้ว กรุณาปรับแผนใหม่")}</p>}
      {!plan?<div className="learning-empty"><CalendarClock size={36}/><p>{t("เลือกเวลาว่าง แล้วสร้างแผนเพื่อดูที่นี่")}</p></div>:<>
        <ol className="rescue-timeline">{plan.slots.map((slot,index)=><li key={`${slot.taskId}-${index}`}><time>{format(slot.start)}–{new Intl.DateTimeFormat(t.locale,{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit"}).format(new Date(slot.end))}</time><strong>{slot.phase}</strong><Link href={`/tasks/${slot.taskId}`}>{slot.title}</Link></li>)}</ol>
        {plan.warnings.map(message=><p key={message} className="learning-warning"><AlertTriangle size={17}/>{t(message)}</p>)}
        {plan.unplanned.length>0&&<details><summary>{t("เวลาที่ยังจัดลงแผนไม่ได้")}</summary>{plan.unplanned.map(p=><p key={p.taskId}>{tasks.find(task=>task.id===p.taskId)?.title} · {p.minutes} {t("นาที")}</p>)}</details>}
        <p className="learning-muted">{t("แผนนี้เป็นคำแนะนำ โปรดตรวจสอบก่อนบันทึก")}</p>
        {saved&&!stale?<p role="status" className="learning-success"><Check/>{t("บันทึกแผนแล้ว")}</p>:<button type="button" className="primary-button button-block" disabled={busy||stale||!plan.slots.length} onClick={()=>setReview(true)}>{t("ตรวจสอบและบันทึกแผน")}</button>}
      </>}
    </Card></div></>}
    </>}
    <BottomSheet open={editTime} title={t("เวลาว่างของฉัน")} onClose={()=>setEditTime(false)}><p className="learning-muted">{t("เลือกวันและเวลาที่พร้อมทำงาน ระบบจะหักเวลาเรียนและสอบให้")}</p>{preferences.windows.map((window,index)=><div className="learning-time-row" key={index}><label>{t("วันที่")}<input className="input" aria-label={t("วันที่")} type="date" value={window.date} onChange={e=>change({...preferences,windows:preferences.windows.map((w,i)=>i===index?{...w,date:e.target.value}:w)})}/></label><label>{t("เริ่ม")}<input className="input" type="time" value={window.start} onChange={e=>change({...preferences,windows:preferences.windows.map((w,i)=>i===index?{...w,start:e.target.value}:w)})}/></label><label>{t("สิ้นสุด")}<input className="input" type="time" value={window.end} onChange={e=>change({...preferences,windows:preferences.windows.map((w,i)=>i===index?{...w,end:e.target.value}:w)})}/></label><button className="icon-button" type="button" aria-label={t("ลบช่วงเวลา")} onClick={()=>change({...preferences,windows:preferences.windows.filter((_,i)=>i!==index)})}><Trash2 size={18}/></button></div>)}<button className="secondary-button" type="button" disabled={preferences.windows.length>=60} onClick={()=>change({...preferences,windows:[...preferences.windows,{date:localDate(now),start:"",end:""}]})}><Plus/>{t("เพิ่มช่วงเวลา")}</button><button className="primary-button button-block" type="button" onClick={()=>setEditTime(false)}>{t("เสร็จสิ้น")}</button></BottomSheet>
    <BottomSheet open={review} title={t("ยืนยันบันทึกแผน")} onClose={()=>setReview(false)}><p>{t("บันทึกเฉพาะแผนทำงาน โดยไม่เปลี่ยนกำหนดส่งหรือสถานะส่งงาน")}</p><p>{plan?.slots.length} {t("ช่วงเวลา")}</p><button className="primary-button button-block" type="button" disabled={busy||stale} onClick={()=>void save()}>{busy?<LoaderCircle className="voice-spin"/>:<Check/>}{t("บันทึกแผน")}</button></BottomSheet>
  </div>;
}
