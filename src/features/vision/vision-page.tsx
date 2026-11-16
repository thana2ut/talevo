"use client";
/* eslint-disable @next/next/no-img-element -- private local blobs are never public image URLs */
import { AppLoadingIndicator } from "@/components/startup-screen";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import { ScanLine,Sparkles,Images,ClipboardList,FileText,Plus,Trash2,LoaderCircle,Check,AlertTriangle,Pencil,GraduationCap,ChevronLeft,Pause,RotateCcw,History,CalendarDays,Info } from "lucide-react";
import { BottomSheet } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
import { useAuth } from "@/providers/auth-provider";
import { confirmedDate,fieldLabels,kindLabels,mergeItems,normalizeText,readiness,statusLabels,VISION_FIELDS,type VisionItem,type VisionKind,type VisionStatus } from "@/lib/vision";
import { clearVisionSession,loadVisionSession,prepareVisionImage,saveVisionSession,type VisionImage,type VisionSession } from "@/lib/vision-storage";
import "./vision.css";
import { useUiText } from "@/providers/ui-language";


function LocalPicture({blob,alt,onClick}:{blob:Blob;alt:string;onClick?:()=>void}){
  const ref=useRef<HTMLImageElement>(null);useEffect(()=>{const u=URL.createObjectURL(blob);if(ref.current)ref.current.src=u;return()=>URL.revokeObjectURL(u);},[blob]);
  return <img ref={ref} alt={alt} loading="lazy" onClick={onClick}/>;
}
type Archive={id:string;kind:VisionKind;title:string;payload:VisionItem;created_at:string};
export function VisionPage(){
  const uiText = useUiText();

  const {user}=useAuth();
  return user ? <VisionWorkspace key={user.id} owner={user.id}/> : <p role="status">{uiText("กรุณาเข้าสู่ระบบเพื่อใช้ Talevo Vision")}</p>;
}
function VisionWorkspace({owner}:{owner:string}){
  const uiText = useUiText();

  const {schedules,tasks,exams}=useAppState();
  const [session,setSession]=useState<VisionSession|null>(null);const current=useRef<VisionSession|null>(null);
  const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const lock=useRef(false);
  const [message,setMessage]=useState("");const [error,setError]=useState("");const [processing,setProcessing]=useState(false);
  const [step,setStep]=useState(1);const [editId,setEditId]=useState<string|null>(null);const [sourceId,setSourceId]=useState<string|null>(null);
  const [archive,setArchive]=useState<Archive[]>([]);const [showArchive,setShowArchive]=useState(false);
  const [confirmSave,setConfirmSave]=useState(false);const [result,setResult]=useState<{imported:number;skipped:number}|null>(null);
  const [filter,setFilter]=useState("all");const controller=useRef<AbortController|null>(null);const input=useRef<HTMLInputElement>(null);const alive=useRef(true);
  const [confirmedYear,setConfirmedYear]=useState("");
  useEffect(()=>{alive.current=true;current.current=null;
    void loadVisionSession(owner).then(saved=>{
      if(!alive.current)return;
      const next=saved??{schemaVersion:1 as const,owner,expires:Date.now()+86400000,images:[],items:[],savedIds:[]};
      next.images=next.images.map(image=>image.state==="reading"?{...image,state:"queued"}:image);
      current.current=next;setSession(next);setStep(next.items.length?3:1);setReady(true);
    }).catch(e=>{if(alive.current){setError(e.message);setReady(true);const next={schemaVersion:1 as const,owner,expires:Date.now()+86400000,images:[],items:[],savedIds:[]};current.current=next;setSession(next);}});
    return()=>{alive.current=false;controller.current?.abort();};
  },[owner]);
  useEffect(()=>{
    if(!session?.expires)return;
    const timer=setTimeout(()=>{
      controller.current?.abort();
      void clearVisionSession(owner).catch(()=>{});
      const empty:VisionSession={schemaVersion:1,owner,expires:Date.now()+86400000,images:[],items:[],savedIds:[]};
      current.current=empty;setSession(empty);setEditId(null);setSourceId(null);setResult(null);setStep(1);
      setMessage("ภาพชั่วคราวครบ 24 ชั่วโมงและถูกลบจากคิวแล้ว ประวัติที่ยืนยันบันทึกยังอยู่ในบัญชี");
    },Math.max(0,session.expires-Date.now()));
    return()=>clearTimeout(timer);
  },[owner,session?.expires]);
  const commit=async(next:VisionSession)=>{if(!alive.current)return;current.current=next;setSession(next);try{await saveVisionSession(next);}catch(e){setError(e instanceof Error?e.message:"เก็บคิวไม่สำเร็จ");}};
  const loadArchive=async()=>{try{const response=await fetch("/api/vision/records",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message);setArchive(data.records);}catch(e){setError(e instanceof Error?e.message:"อ่านประวัติไม่สำเร็จ");}};
  const choose=async(files:FileList|null)=>{
    if(!files||lock.current||!current.current)return;lock.current=true;setBusy(true);setError("");setResult(null);
    const failures:string[]=[];
    try{for(const file of Array.from(files)){
      try{
        const next=current.current!;if(next.images.reduce((sum,image)=>sum+image.blob.size,0)>256*1024*1024)throw new Error("ภาพในคิวรวมเกิน 256 MB กรุณาจบและล้างชุดนี้ก่อนเพิ่มต่อ");
        const blob=await prepareVisionImage(file);if(!alive.current)return;const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
        if(next.images.some(image=>image.digest===digest)){failures.push(`${file.name}: รูปนี้อยู่ในคิวแล้ว`);continue;}
        const image:VisionImage={id:crypto.randomUUID(),number:Math.max(0,...next.images.map(image=>image.number))+1,name:file.name,blob,digest,state:"queued",items:[]};
        await commit({...next,images:[...next.images,image]});
      }catch(e){failures.push(e instanceof Error?e.message:"เพิ่มรูปไม่สำเร็จ");}
    }}finally{lock.current=false;setBusy(false);if(input.current)input.current.value="";setError(failures.join("\n"));}
  };
  const run=async()=>{
    if(lock.current||!current.current)return;lock.current=true;setProcessing(true);setError("");setResult(null);setStep(2);
    const abort=new AbortController();controller.current=abort;
    try{
      const ids=current.current.images.filter(image=>image.state==="queued"||image.state==="error").map(image=>image.id);
      for(let offset=0;offset<ids.length;){
        if(abort.signal.aborted||!alive.current)break;
        const batch:VisionImage[]=[];let bytes=0;
        while(offset<ids.length&&batch.length<4){
          const image=current.current!.images.find(i=>i.id===ids[offset]);
          if(!image){offset++;continue;}
          if(batch.length&&bytes+image.blob.size>3*1024*1024)break;
          batch.push(image);bytes+=image.blob.size;offset++;
        }
        if(!batch.length)continue;
        const batchIds=new Set(batch.map(image=>image.id));
        await commit({...current.current!,images:current.current!.images.map(i=>batchIds.has(i.id)?{...i,state:"reading",error:undefined}:i)});
        const form=new FormData();for(const image of batch)form.append("images",image.blob,`${image.id}.jpg`);
        form.append("metadata",JSON.stringify(batch.map(image=>({id:image.id,number:image.number}))));
        try{
          const response=await fetch("/api/vision/analyze",{method:"POST",body:form,signal:abort.signal});const data=await response.json();
          if(abort.signal.aborted||!alive.current)break;
          if(!response.ok){if(response.status===429){await commit({...current.current!,images:current.current!.images.map(i=>batchIds.has(i.id)?{...i,state:"queued"}:i)});setError(data.message+` (รอประมาณ ${data.retryAfter??60} วินาที)`);break;}throw new Error(data.message||"วิเคราะห์ไม่สำเร็จ");}
          const extracted=data.items as VisionItem[];
          const nextImages=current.current!.images.map(i=>batchIds.has(i.id)?{...i,state:"done" as const,items:extracted.filter(item=>item.sources[0]===i.id)}:i);
          const previous=new Map(current.current!.items.map(item=>[item.id,item]));
          const merged=mergeItems(nextImages.flatMap(i=>i.items)).map(item=>{
            const old=previous.get(item.id);
            // Retain edits only when no new evidence has been added to this item.
            if(old&&VISION_FIELDS.every(key=>JSON.stringify(old.facts[key].evidence)===JSON.stringify(item.facts[key].evidence)))return old;
            const course=schedules.filter(s=>item.facts.courseCode.value?s.courseCode&&normalizeText(s.courseCode)===normalizeText(item.facts.courseCode.value):item.facts.courseName.value&&normalizeText(s.name)===normalizeText(item.facts.courseName.value));
            const ids=[...new Set(course.map(s=>s.courseId))];return {...item,courseId:ids.length===1?ids[0]:""};
          });
          await commit({...current.current!,images:nextImages,items:merged});
        }catch(e){if(abort.signal.aborted)break;await commit({...current.current!,images:current.current!.images.map(i=>batchIds.has(i.id)?{...i,state:"error",error:e instanceof Error?e.message:"อ่านภาพไม่สำเร็จ"}:i)});}
      }
    }finally{
      if(alive.current&&current.current){await commit({...current.current,images:current.current.images.map(i=>i.state==="reading"?{...i,state:"queued"}:i)});setProcessing(false);setStep(3);}
      lock.current=false;
    }
  };
  const update=(id:string,change:Partial<VisionItem>)=>{if(!current.current||lock.current)return;void commit({...current.current,items:current.current.items.map(item=>item.id===id?{...item,...change}:item)});};
  const editFact=(item:VisionItem,key:typeof VISION_FIELDS[number],value:string)=>update(item.id,{facts:{...item.facts,[key]:{...item.facts[key],value:value||null}},reviewed:false});
  const remove=(id:string)=>{if(!current.current||lock.current)return;const next=current.current;const affected=new Set(next.images.flatMap(i=>i.items).filter(item=>item.sources.includes(id)).flatMap(item=>item.sources));const remaining=next.images.filter(i=>i.id!==id).map(i=>affected.has(i.id)?{...i,state:"queued" as const,items:[]}:i);void commit({...next,images:remaining,items:mergeItems(remaining.flatMap(i=>i.items))});};
  const duplicateCandidates=(item:VisionItem)=>{
    const list=item.kind==="task"?tasks:item.kind==="exam"?exams:[];
    return list.filter(row=>row.courseId===item.courseId&&normalizeText(row.title)===normalizeText(item.facts.title.value??""));
  };
  const selected=(session?.items??[]).filter(item=>item.selected&&item.choice!=="skip"&&!session?.savedIds.includes(item.id));
  const issues=selected.flatMap(item=>readiness(item).map(issue=>`${item.facts.title.value??"รายการ"}: ${issue}`));
  const save=async()=>{
    if(lock.current||!selected.length||issues.length||!current.current)return;lock.current=true;setBusy(true);setConfirmSave(false);setError("");setStep(4);
    let imported=0,skipped=0;
    try{
      for(let i=0;i<selected.length;i+=25){
        const batch=selected.slice(i,i+25);const response=await fetch("/api/vision/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:batch,confirmUpdates:true})});const data=await response.json();
        if(!response.ok)throw new Error(data.message??"บันทึกไม่สำเร็จ");imported+=data.imported;skipped+=data.skipped;
        await commit({...current.current!,savedIds:[...new Set([...current.current!.savedIds,...batch.map(item=>item.id)])]});
      }
      setResult({imported,skipped});setMessage("บันทึกเฉพาะรายการที่ยืนยันเรียบร้อยแล้ว");
      // A full navigation rehydrates the existing app state and its Smart Alerts.
    }catch(e){setError(`${e instanceof Error?e.message:"บันทึกไม่สำเร็จ"}${imported?` · ชุดก่อนหน้าบันทึกสำเร็จ ${imported} รายการแล้ว`:""}`);setStep(3);}
    finally{lock.current=false;setBusy(false);}
  };
  const editing=session?.items.find(item=>item.id===editId);const source=session?.images.find(image=>image.id===sourceId);
  const courses=[...new Map(schedules.map(s=>[s.courseId,s])).values()];
  const visible=(session?.items??[]).filter(item=>filter==="all"||item.kind===filter).sort((a,b)=>`${confirmedDate(a.facts.dueDate.value)??"9999"} ${a.facts.dueTime.value??""}`.localeCompare(`${confirmedDate(b.facts.dueDate.value)??"9999"} ${b.facts.dueTime.value??""}`));
  const groups=Object.groupBy(visible,item=>schedules.find(course=>course.courseId===item.courseId)?.name||item.facts.courseCode.value||item.facts.courseName.value||"ยังไม่ทราบรายวิชา");
  const finished=session?.images.filter(i=>i.state==="done").length??0;
  const renderEditorField=(key:typeof VISION_FIELDS[number])=>editing?<label key={key}>{uiText(fieldLabels[key])}{editing.conflicts.includes(key)&&<span className="needs-review">{uiText("ข้อมูลขัดแย้ง กรุณาเลือกค่าที่ถูก")}</span>}{key==="status"?<select className="input" value={editing.facts.status.value??"unknown"} onChange={e=>editFact(editing,key,e.target.value)}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{uiText(l)}</option>)}</select>:key==="description"||key==="attachments"?<textarea className="input" rows={3} maxLength={8000} value={editing.facts[key].value??""} onChange={e=>editFact(editing,key,e.target.value)}/>:<input className="input" maxLength={key==="title"?200:2000} value={editing.facts[key].value??""} onChange={e=>editFact(editing,key,e.target.value)} placeholder={key==="dueDate"?uiText("เช่น 2026-09-23 (ต้องยืนยันปี)"):key==="dueTime"?"23:59":uiText("ไม่พบข้อมูลในภาพ")}/>}{editing.facts[key].evidence.length>0&&<details><summary>{uiText("หลักฐาน")}{editing.facts[key].evidence.length} {uiText("จุด")}</summary>{editing.facts[key].evidence.map((source,index)=><button className="vision-evidence" type="button" key={index} onClick={()=>{setEditId(null);setSourceId(source.imageId);}}>{uiText("รูปที่")}{source.imageNumber}: “{source.text}”</button>)}</details>}</label>:null;
  if(!ready)return <AppLoadingIndicator />;
  return <div className="page vision-page">
    <header className="vision-header"><Link href="/today" className="icon-button" aria-label={uiText("กลับหน้าหลัก")}><ChevronLeft/></Link><div><h1>{uiText("นำงานเข้าจากภาพ")}</h1><p><Sparkles size={14} aria-hidden="true"/>Talevo Vision</p></div><button type="button" className="secondary-button" onClick={()=>{setShowArchive(true);void loadArchive();}}><History size={18} aria-hidden="true"/><span>{uiText("ประวัติ")}</span></button></header>
    <section className="vision-heading"><span className="vision-heading-icon"><ScanLine/></span><div><h2>{step===1?uiText("เริ่มจากรูปภาพของคุณ"):step===2?uiText("กำลังวิเคราะห์ภาพ"):step===4?uiText("บันทึกรายการ"):uiText("ตรวจสอบงานที่พบ")}</h2><p>{uiText("อ่านหลายภาพ รวมงานซ้ำ แยกวิชาและเรียงวันส่ง")}</p></div></section>
    <ol className="vision-steps" aria-label={uiText("ขั้นตอนนำเข้า")}>{[uiText("เลือกรูป"),uiText("วิเคราะห์"),uiText("ตรวจสอบ"),uiText("บันทึก")].map((label,index)=><li key={label} className={step===index+1?"active":step>index+1?"complete":""} aria-current={step===index+1?"step":undefined}><b>{step>index+1?<Check size={17}/>:index+1}</b><span>{uiText(label)}</span></li>)}</ol>
    {error&&<p role="alert" className="vision-warning">{uiText(error)}</p>}{message&&<p role="status" className="vision-notice">{uiText(message)}</p>}
    <div className="vision-stats">{[[Images,session?.images.length??0,uiText("ภาพ")],[ClipboardList,session?.items.filter(i=>i.kind==="task").length??0,uiText("งาน")],[Check,session?.items.filter(i=>i.facts.status.value==="submitted").length??0,uiText("ส่งแล้ว")],[AlertTriangle,session?.items.filter(i=>["pending","overdue"].includes(i.facts.status.value??"")).length??0,uiText("ยังไม่ส่ง")],[FileText,session?.items.filter(i=>i.kind==="material").length??0,uiText("เอกสาร")],[Pencil,session?.items.filter(i=>readiness(i).length>0).length??0,uiText("ต้องตรวจสอบ")]].map(([Icon,count,label])=>{const I=Icon as typeof Images;return <div key={String(label)}><I aria-hidden="true"/><strong>{String(count)}</strong><span>{String(label)}</span></div>;})}</div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" multiple className="visually-hidden" onChange={e=>void choose(e.target.files)}/>
    <div className={`vision-workspace ${session?.items.length?"has-items":""}`}>
      <aside className="vision-sources"><h3><Images size={21} aria-hidden="true"/>{uiText("รูปภาพของคุณ")}<span className="vision-count">{session?.images.length}</span></h3><button className="vision-upload" type="button" disabled={busy||processing} onClick={()=>input.current?.click()}><span className="vision-upload-title"><Plus size={21} aria-hidden="true"/>{uiText("เพิ่มรูปภาพ")}</span><small>{uiText("เลือกหลายรูปได้ · ไม่เกิน 20 MB / รูป")}</small></button>
        <div className="vision-image-list">{session?.images.map(image=><article className={`vision-image-card state-${image.state}`} key={image.id}>
          <button type="button" className="vision-image-open" onClick={()=>setSourceId(image.id)} aria-label={uiText("ดูรูปที่ {0}", [image.number])}><LocalPicture blob={image.blob} alt={uiText("รูปที่ {0}: {1}", [image.number, image.name])}/></button>
          <div className="vision-image-caption"><b>{uiText("รูปที่")}{image.number}</b><button type="button" className="icon-button" aria-label={uiText("ลบรูปที่ {0}", [image.number])} disabled={busy||processing||Boolean(session.savedIds.length)} onClick={()=>remove(image.id)}><Trash2 size={16} aria-hidden="true"/></button><span className="vision-image-state">{image.state==="done"?<Check size={13}/>:image.state==="reading"?<LoaderCircle className="voice-spin" size={13}/>:image.state==="error"?<AlertTriangle size={13}/>:null}{image.state==="done"?uiText("อ่านแล้ว"):image.state==="reading"?uiText("กำลังอ่าน"):image.state==="error"?uiText("ลองใหม่"):uiText("รอวิเคราะห์")}</span></div>
          {image.error&&<p role="status" className="form-error">{uiText(image.error)}</p>}
        </article>)}</div>
        {(session?.images.length??0)>0&&<button type="button" className="primary-button button-block vision-analyze" disabled={busy||processing||!session?.images.some(i=>i.state!=="done")} onClick={()=>void run()}>{processing?<LoaderCircle className="voice-spin"/>:<Sparkles/>}<span>{processing?uiText("กำลังวิเคราะห์…"):finished===(session?.images.length??0)?uiText("วิเคราะห์ครบแล้ว"):finished?uiText("วิเคราะห์ภาพที่เหลือ"):uiText("เริ่มวิเคราะห์ภาพ")}</span></button>}
        {processing&&<div className="vision-progress" role="status"><div className="vision-progress-heading"><span>{uiText("กำลังอ่าน")}{Math.min(finished+1,session?.images.length??0)} / {session?.images.length} {uiText("ภาพ")}</span><button type="button" onClick={()=>controller.current?.abort()}><Pause size={14}/>{uiText("พักคิว")}</button></div><progress aria-label={uiText("ความคืบหน้าการวิเคราะห์")} max={session?.images.length||1} value={finished}/></div>}
        <details className="vision-privacy"><summary><Info size={15} aria-hidden="true"/>{uiText("เกี่ยวกับรูปภาพ")}</summary><p>{uiText("อ่านร่วมกันครั้งละไม่เกิน 4 ภาพตามขนาดไฟล์ เก็บภาพในเบราว์เซอร์ 24 ชม. พักคิวและทำต่อได้ กรุณาตรวจวิชา วันส่ง และปีก่อนบันทึก")}</p></details>
      </aside>
      <section className="vision-results"><header><h3><ClipboardList size={21} aria-hidden="true"/>{uiText("รายการที่พบ")}</h3>{Boolean(session?.items.length)&&<label className="vision-check"><input type="checkbox" disabled={processing||busy} checked={Boolean(session?.items.length)&&session!.items.every(i=>i.selected||session!.savedIds.includes(i.id))} onChange={e=>{if(current.current)void commit({...current.current,items:current.current.items.map(i=>({...i,selected:e.target.checked}))});}}/>{uiText("เลือกทั้งหมด")}</label>}</header>
        {session?.items.some(item=>!session.savedIds.includes(item.id)&&item.facts.dueDate.value&&!confirmedDate(item.facts.dueDate.value))&&<div className="vision-year"><label htmlFor="vision-confirmed-year">{uiText("เติมปีให้รายการที่เลือก")}</label><div><input id="vision-confirmed-year" className="input" inputMode="numeric" maxLength={4} placeholder={uiText("พ.ศ. / ค.ศ.")} value={confirmedYear} onChange={e=>setConfirmedYear(e.target.value)}/><button type="button" className="secondary-button" disabled={busy||processing||!/^\d{4}$/.test(confirmedYear)} onClick={()=>{if(!current.current)return;void commit({...current.current,items:current.current.items.map(item=>{if(!item.selected||session!.savedIds.includes(item.id)||confirmedDate(item.facts.dueDate.value))return item;const date=confirmedDate(item.facts.dueDate.value,confirmedYear);return date?{...item,reviewed:false,facts:{...item.facts,dueDate:{...item.facts.dueDate,value:date}}}:item;})});}}>{uiText("ใช้ปีนี้")}</button></div><small>{uiText("เฉพาะวันที่ยังไม่มีปี · ตรวจรายการก่อนบันทึก")}</small></div>}
        {Boolean(session?.items.length)&&<div className="vision-filters">{[["all",uiText("ทั้งหมด")],...Object.entries(kindLabels)].map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{uiText(label)}</button>)}</div>}
        {!visible.length&&<div className="vision-empty"><ScanLine size={46}/><h3>{processing?uiText("AI กำลังจัดรายการให้คุณ"):finished?uiText("ยังไม่พบรายการในหมวดนี้"):uiText("เพิ่มรูปภาพเพื่อเริ่มต้น")}</h3><p>{processing?uiText("อ่านครบแล้วตรวจแก้ข้อมูลได้ที่นี่"):finished?uiText("ลองเลือกหมวดอื่น หรือเพิ่มภาพที่ชัดขึ้น"):uiText("ใช้ภาพหน้ารายการหรือรายละเอียดงานจาก Classroom")}</p></div>}
        {Object.entries(groups).map(([course,items])=><section className="vision-course" key={course}><h4><GraduationCap size={20} aria-hidden="true"/><span>{course}</span><small>{items?.length} {uiText("รายการ")}</small></h4>{items?.map(item=>{const saved=session!.savedIds.includes(item.id);const candidates=duplicateCandidates(item);return <article key={item.id} className={`vision-item ${item.selected?"selected":""}`}><input aria-label={uiText("เลือก {0}", [item.facts.title.value??"รายการ"])} type="checkbox" disabled={saved||busy||processing} checked={item.selected} onChange={e=>update(item.id,{selected:e.target.checked})}/><div className="vision-item-body"><strong>{item.facts.title.value??uiText("อ่านชื่อไม่ชัดเจน")}</strong><p className="vision-item-kind">{uiText(kindLabels[item.kind])}</p><p className="vision-item-date"><CalendarDays size={14} aria-hidden="true"/><span>{item.facts.dueDate.value??uiText("ยังไม่ระบุวัน")}{item.facts.dueTime.value?uiText(" · {0} น.", [item.facts.dueTime.value]):""}</span></p><div className="vision-item-tags"><span className={item.facts.status.value==="submitted"?"submitted":""}>{statusLabels[item.facts.status.value as VisionStatus]??uiText("ไม่ทราบสถานะ")}</span>{candidates.length>0&&<span className="duplicate">{uiText("พบชื่อคล้ายรายการเดิม")}</span>}{saved?<span className="submitted">{uiText("บันทึกแล้ว")}</span>:readiness(item).length>0?<span className="needs-review">{uiText("ต้องตรวจสอบ")}</span>:<span>{uiText("ตรวจแล้ว")}</span>}</div><div className="vision-source-links">{item.sources.map(id=>{const image=session!.images.find(i=>i.id===id);return <button type="button" key={id} onClick={()=>setSourceId(id)}><Images size={12} aria-hidden="true"/>{uiText("รูปที่")}{image?.number??"?"}</button>;})}</div></div><button type="button" className="vision-edit-button" aria-label={uiText("ตรวจแก้ {0}", [item.facts.title.value??"รายการ"])} disabled={saved||busy||processing} onClick={()=>setEditId(item.id)}><Pencil size={15} aria-hidden="true"/><span>{uiText("แก้ไข")}</span></button></article>;})}</section>)}
      </section>
      {Boolean(session?.items.length||result)&&<aside className="vision-summary">
        <h3><Check size={21} aria-hidden="true"/>{uiText("พร้อมบันทึก")}</h3><div className="vision-selection-total"><span>{uiText("รายการที่เลือก")}</span><strong>{selected.length}<small> {uiText("รายการ")}</small></strong></div>
        <p className="vision-summary-hint">{uiText("กด “แก้ไข” เพื่อตรวจชื่อวิชา วันส่ง และสถานะ")}</p>
        {issues.length>0&&<div className="vision-warning"><AlertTriangle size={18}/><span>{uiText("ยังมีข้อมูลต้องตรวจสอบ")}{selected.filter(item=>readiness(item).length>0).length} {uiText("รายการ")}</span></div>}
        {issues.length>0&&<details className="vision-issue-details"><summary>{uiText("ดูข้อมูลที่ต้องแก้ไข")}</summary>{issues.slice(0,5).map((issue,i)=><p className="form-error" key={i}>{uiText(issue)}</p>)}</details>}
        {selected.some(i=>i.choice==="update")&&<p className="vision-warning"><AlertTriangle size={18}/>{uiText("มีการอัปเดตงานเดิม กรุณาตรวจเป้าหมายก่อนยืนยัน")}</p>}
        <button type="button" className="primary-button button-block" disabled={!selected.length||issues.length>0||busy||processing} onClick={()=>setConfirmSave(true)}>{busy?<LoaderCircle className="voice-spin"/>:<Check/>}<span>{uiText("บันทึก")}{selected.length?uiText(" {0} รายการ", [selected.length]):uiText("รายการที่เลือก")}</span></button>
        <p className="vision-summary-note"><Info size={14} aria-hidden="true"/><span>{uiText("งานส่งแล้วและเอกสารจะไม่แจ้งเตือนงานค้าง")}</span></p>
        {result&&<div role="status" className="vision-notice">{uiText("บันทึก")}{result.imported} {uiText("· ข้ามซ้ำ")}{result.skipped}<Link href="/tasks" className="primary-button button-block" onClick={e=>{e.preventDefault();window.location.href = new URL("/tasks", window.location.origin).href;}}>{uiText("ดูงานของฉัน")}</Link></div>}
        <button type="button" className="vision-reset" disabled={busy||processing} onClick={async()=>{await clearVisionSession(owner);const next:VisionSession={schemaVersion:1,owner,expires:Date.now()+86400000,images:[],items:[],savedIds:[]};current.current=next;setSession(next);setResult(null);setMessage("");setStep(1);}}><RotateCcw size={15}/>{uiText("เริ่มชุดใหม่")}</button>
      </aside>}

    </div>
    <BottomSheet open={Boolean(editing)} title={uiText("ตรวจสอบและแก้ไขรายการ")} onClose={()=>setEditId(null)} className="vision-edit-sheet">{editing&&<div className="vision-editor">{editing.issues.map((issue,index)=><p className="vision-warning" key={index}>{uiText(issue)}</p>)}<label>{uiText("ประเภท")}<select className="input" value={editing.kind} onChange={e=>update(editing.id,{kind:e.target.value as VisionKind,reviewed:false})}>{Object.entries(kindLabels).map(([v,l])=><option key={v} value={v}>{uiText(l)}</option>)}</select></label><label>{uiText("เชื่อมรายวิชา")}<select className="input" value={editing.courseId} onChange={e=>update(editing.id,{courseId:e.target.value,reviewed:false})}><option value="">{uiText("เลือกวิชาใน Talevo")}</option>{courses.map(course=><option key={course.courseId} value={course.courseId}>{course.name} {course.courseCode}</option>)}</select></label>{VISION_FIELDS.filter(key=>["title","dueDate","dueTime","status"].includes(key)).map(renderEditorField)}<details className="vision-extra-fields" open={editing.conflicts.some(key=>!["title","dueDate","dueTime","status"].includes(key))}><summary>{uiText("รายละเอียดเพิ่มเติม")}</summary><div>{VISION_FIELDS.filter(key=>!["title","dueDate","dueTime","status"].includes(key)).map(renderEditorField)}</div></details><label>{uiText("เลือกปีที่ยืนยันแล้ว (พ.ศ. หรือ ค.ศ.)")}<input className="input" inputMode="numeric" maxLength={4} placeholder={uiText("ไม่เลือกปีให้อัตโนมัติ")} onChange={e=>{const date=confirmedDate(editing.facts.dueDate.value,e.target.value);if(date)editFact(editing,"dueDate",date);}}/></label><label>{uiText("เมื่อพบรายการเดิม")}<select className="input" value={editing.choice} onChange={e=>update(editing.id,{choice:e.target.value as VisionItem["choice"],reviewed:false})}><option value="create">{uiText("สร้างรายการใหม่")}</option><option value="skip">{uiText("ข้ามรายการนี้")}</option>{(editing.kind==="task"||editing.kind==="exam")&&<option value="update">{uiText("อัปเดตรายการเดิม (ต้องยืนยันอีกครั้ง)")}</option>}</select></label>{editing.choice==="update"&&<label>{uiText("รายการเป้าหมาย")}<select className="input" value={editing.targetId} onChange={e=>update(editing.id,{targetId:e.target.value,reviewed:false})}><option value="">{uiText("เลือกรายการเดิม")}</option>{(editing.kind==="task"?tasks:exams).map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select></label>}<label className="vision-check"><input type="checkbox" checked={editing.reviewed} onChange={e=>update(editing.id,{reviewed:e.target.checked})}/>{uiText("ตรวจเทียบภาพและยืนยันข้อมูลแล้ว")}</label><button type="button" className="primary-button button-block" onClick={()=>setEditId(null)}>{uiText("เสร็จสิ้น")}</button></div>}</BottomSheet>
    <BottomSheet open={Boolean(source)} title={uiText("ภาพอ้างอิง {0}", [source?.number??""])} onClose={()=>setSourceId(null)} className="vision-source-sheet">{source&&<LocalPicture blob={source.blob} alt={uiText("ภาพต้นทาง {0}", [source.number])}/>}</BottomSheet>
    <BottomSheet open={confirmSave} title={uiText("ยืนยันบันทึกรายการที่เลือก")} onClose={()=>setConfirmSave(false)}><p>{uiText("นำเข้า")}{selected.length} {uiText("รายการที่ตรวจแล้วเท่านั้น เอกสารและประกาศจะเก็บแยกจากงาน")}</p>{selected.filter(i=>i.choice==="update").map(item=><p className="vision-warning" key={item.id}>{uiText("อัปเดต “")}{item.facts.title.value}{uiText("” → รายการเดิม")}{tasks.find(t=>t.id===item.targetId)?.title??exams.find(e=>e.id===item.targetId)?.title} {uiText("· สถานะ")}{uiText(statusLabels[item.facts.status.value as VisionStatus])}</p>)}<button type="button" className="primary-button button-block" onClick={()=>void save()}>{uiText("ยืนยันบันทึก")}</button></BottomSheet>
    <BottomSheet open={showArchive} title={uiText("ประวัติการนำเข้า Talevo Vision")} onClose={()=>setShowArchive(false)}>{!archive.length?<p>{uiText("ยังไม่มีประวัติที่บันทึก")}</p>:archive.map(record=><article className="vision-action-card" key={record.id}><strong>{record.title}</strong><p>{uiText(kindLabels[record.kind])} · {record.payload.facts.courseName.value??record.payload.facts.courseCode.value}</p><p>{record.payload.facts.description.value}</p><details><summary>{uiText("ข้อมูลและหลักฐาน")}</summary>{VISION_FIELDS.map(key=><p key={key}>{uiText(fieldLabels[key])}: {record.payload.facts[key].value??uiText("ไม่ทราบ")}</p>)}</details></article>)}</BottomSheet>
  </div>;
}
