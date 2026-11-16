import type { Task, ClassSchedule, Exam } from "@/types";

export type FreeWindow = { date:string; start:string; end:string };
export type RescuePreferences = { windows:FreeWindow[]; importance:Record<string,number>; minutes:Record<string,number> };
export type RescueSlot = { taskId:string; title:string; start:string; end:string; phase:string };
export type RescuePlan = { slots:RescueSlot[]; warnings:string[]; unplanned:{taskId:string;minutes:number}[]; fingerprint:string; createdAt:string };
export const localDate = (date:Date) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
export const atBangkok = (date:string,time:string) => Date.parse(`${date}T${time}:00+07:00`);
const stamp = (time:number) => new Date(time).toISOString();
export function estimateMinutes(value:string) {
  const normalized=value.replace(/[๐-๙]/g,n=>String(n.charCodeAt(0)-3664));
  const hours=normalized.match(/(\d+(?:\.\d+)?)\s*(?:ชั่วโมง|ชม\.?|hours?|hrs?|h)/i);
  const minutes=normalized.match(/(\d+)\s*(?:นาที|minutes?|mins?|m)(?:\s|$)/i);
  if(!hours&&!minutes)return null;
  const result=Number(hours?.[1]??0)*60+Number(minutes?.[1]??0);
  return result>0&&result<=10080?Math.ceil(result):null;
}
export function rescueFingerprint(tasks:Task[],schedules:ClassSchedule[],exams:Exam[],preferences:RescuePreferences) {
  return JSON.stringify({tasks:tasks.filter(t=>t.status!=="completed").map(t=>[t.id,t.title,new Date(t.dueDate).toISOString(),t.status,t.estimate,(t.subtasks??[]).map(s=>[s.id,s.title,s.completed])]).sort(),schedules:schedules.map(s=>[s.id,s.day,s.startTime,s.endTime]).sort(),exams:exams.map(e=>[e.id,new Date(e.startAt).toISOString(),e.endAt?new Date(e.endAt).toISOString():null,Boolean(e.completedAt)]).sort(),preferences});
}
export function rankRescueTasks(tasks:Task[],preferences:RescuePreferences,now:number) {
  return tasks.filter(t=>t.status!=="completed").map(task=>{
    const estimate=preferences.minutes[task.id]||estimateMinutes(task.estimate);
    const progress=task.subtasks?.length?task.subtasks.filter(s=>s.completed).length/task.subtasks.length:0;
    const remaining=Math.max(5,Math.ceil((estimate??60)*(1-progress)));
    const hours=(Date.parse(task.dueDate)-now)/3600000;
    const priority=preferences.importance[task.id]??1;
    const reasons=[hours<0?"เลยกำหนดส่ง":hours<=24?"ครบกำหนดภายใน 24 ชั่วโมง":hours<=72?"ครบกำหนดภายใน 3 วัน":"เรียงตามกำหนดส่ง"];
    if(priority===3)reasons.push("คุณระบุว่าสำคัญสูง");
    if(!estimate)reasons.push("ยังไม่ทราบระยะเวลา ใช้ประมาณการ 60 นาทีเพื่อรอตรวจ");
    if(progress>0)reasons.push("หักส่วนงานย่อยที่ทำเสร็จแล้ว");
    const score=(hours<0?10000:hours<=24?5000:hours<=72?2000:500)+priority*250+Math.max(-500,500-hours)-remaining/10;
    return {task,remaining,estimated:estimate===null,priority,reasons,score};
  }).sort((a,b)=>b.score-a.score||a.task.dueDate.localeCompare(b.task.dueDate)||a.task.id.localeCompare(b.task.id));
}
export function validateWindows(windows:FreeWindow[],now:number) {
  if(!Array.isArray(windows)||windows.length>60)throw new Error("กำหนดเวลาว่างได้ไม่เกิน 60 ช่วง");
  const normalized=windows.map(w=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(w.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end)||localDate(new Date(atBangkok(w.date,"12:00")))!==w.date)throw new Error("กรุณาตรวจวันและเวลา");
    const start=atBangkok(w.date,w.start),end=atBangkok(w.date,w.end);
    if(start>=end||end<=now||end>now+31*86400000)throw new Error("เลือกเวลาว่างภายใน 31 วัน และเวลาเลิกหลังเวลาเริ่ม");
    return {start:Math.max(start,Math.ceil(now/60000)*60000),end};
  }).sort((a,b)=>a.start-b.start);
  for(let i=1;i<normalized.length;i++)if(normalized[i].start<normalized[i-1].end)throw new Error("เวลาว่างซ้อนกัน กรุณาแก้ไขก่อนสร้างแผน");
  return normalized;
}
export function buildRescuePlan(tasks:Task[],schedules:ClassSchedule[],exams:Exam[],preferences:RescuePreferences,now:number):RescuePlan {
  let free=validateWindows(preferences.windows,now);
  const occupied:{start:number;end:number}[]=[];
  for(const window of preferences.windows){
    const day=(new Date(atBangkok(window.date,"12:00")).getUTCDay()+6)%7;
    for(const item of schedules.filter(s=>s.day===day))occupied.push({start:atBangkok(window.date,item.startTime),end:atBangkok(window.date,item.endTime)});
  }
  for(const exam of exams.filter(e=>!e.completedAt))occupied.push({start:Date.parse(exam.startAt),end:exam.endAt?Date.parse(exam.endAt):Date.parse(exam.startAt)+2*3600000});
  for(const busy of occupied)free=free.flatMap(w=>busy.end<=w.start||busy.start>=w.end?[w]:[{start:w.start,end:Math.min(w.end,busy.start)},{start:Math.max(w.start,busy.end),end:w.end}].filter(part=>part.end>part.start));
  const slots:RescueSlot[]=[],unplanned:RescuePlan["unplanned"]=[],warnings:string[]=[];
  for(const ranked of rankRescueTasks(tasks,preferences,now)){
    let remaining=ranked.remaining;const deadline=Date.parse(ranked.task.dueDate);
    if(!Number.isFinite(deadline)){unplanned.push({taskId:ranked.task.id,minutes:remaining});continue;}
    if(ranked.estimated)warnings.push(`“${ranked.task.title}” ยังใช้เวลาประมาณการ กรุณายืนยัน`);
    if(deadline<=now)warnings.push(`“${ranked.task.title}” เลยกำหนดแล้ว แผนนี้เป็นแผนตามเก็บงาน`);
    const parts=ranked.task.subtasks?.filter(s=>!s.completed)??[];
    let phase=0;
    for(const w of free){
      const limit=deadline>now?Math.min(w.end,deadline):w.end;
      while(remaining>0&&limit-w.start>=5*60000){
        const duration=Math.min(remaining,50,Math.floor((limit-w.start)/60000));
        slots.push({taskId:ranked.task.id,title:ranked.task.title,start:stamp(w.start),end:stamp(w.start+duration*60000),phase:parts[phase]?.title??(phase===0?"อ่านโจทย์และเริ่มลงมือ":"ทำงานต่อและตรวจความเรียบร้อย")});
        w.start+=duration*60000+10*60000;remaining-=duration;phase++;
      }
      if(!remaining)break;
    }
    if(remaining>0)unplanned.push({taskId:ranked.task.id,minutes:remaining});
  }
  if(unplanned.length)warnings.push("เวลาว่างไม่พอสำหรับงานทั้งหมด กรุณาเพิ่มเวลา หรือตรวจแผนและลำดับงานใหม่");
  if(exams.some(e=>!e.endAt&&!e.completedAt))warnings.push("การสอบที่ไม่มีเวลาเลิกกันเวลาไว้ 2 ชั่วโมง กรุณาตรวจเวลาสอบจริง");
  return {slots:slots.sort((a,b)=>a.start.localeCompare(b.start)),warnings,unplanned,fingerprint:rescueFingerprint(tasks,schedules,exams,preferences),createdAt:stamp(now)};
}
