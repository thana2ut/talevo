/** Exact decimal/rational arithmetic; no institutional thresholds are assumed. */
export type Rational={n:bigint;d:bigint};
const gcd=(a:bigint,b:bigint):bigint=>b?gcd(b,a%b):a<BigInt(0)?-a:a;
function fraction(n:bigint,d=BigInt(1)):Rational {if(!d)throw new Error("คะแนนเต็มต้องมากกว่าศูนย์");const g=gcd(n,d)||BigInt(1);return {n:n/g*(d<BigInt(0)?-BigInt(1):BigInt(1)),d:(d<BigInt(0)?-d:d)/g};}
export function decimal(value:string):Rational {if(!/^\d{1,8}(?:\.\d{1,4})?$/.test(value))throw new Error("กรุณากรอกตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 4 ตำแหน่ง");const [a,b=""]=value.split(".");return fraction(BigInt(a+b),BigInt(10)**BigInt(b.length));}
const add=(a:Rational,b:Rational)=>fraction(a.n*b.d+b.n*a.d,a.d*b.d);
const sub=(a:Rational,b:Rational)=>fraction(a.n*b.d-b.n*a.d,a.d*b.d);
const mul=(a:Rational,b:Rational)=>fraction(a.n*b.n,a.d*b.d);
const div=(a:Rational,b:Rational)=>fraction(a.n*b.d,a.d*b.n);
const cmp=(a:Rational,b:Rational)=>a.n*b.d-b.n*a.d;
const zero=fraction(BigInt(0)),hundred=fraction(BigInt(100));
const num=(a:Rational)=>Number(a.n)/Number(a.d);
const sum=(values:Rational[])=>values.reduce(add,zero);
const ceilUnit=(value:Rational,unit:Rational)=>{const q=div(value,unit);return mul(fraction((q.n+q.d-BigInt(1))/q.d),unit);};
export type GradeBand={id:string;label:string;min:string;max:string;points:string};
export type GradePart={id:string;name:string;max:string;earned:string|null;released:boolean;step:string};
export type GradeCategory=GradePart&{weight:string;note:string;parts:GradePart[]};
export type GradeScenario={id:string;name:string;scores:Record<string,string>};
export type GradeLabCourse={id:string;sourceCourseId:string|null;name:string;code:string;term:string;credits:string;includeInGpa:boolean;scaleMax:string;grading:"criterion"|"relative";criteriaConfirmed:boolean;thresholds:GradeBand[];targetGrade:string;finalGrade:string;components:GradeCategory[];alertsEnabled:boolean;scenarios:GradeScenario[];revision:number};
export type GradeLabSettings={priorCredits:string;priorQualityPoints:string;targetGpa:string;futureCredits:string;scaleMax:string};
export const blankSettings:GradeLabSettings={priorCredits:"",priorQualityPoints:"",targetGpa:"",futureCredits:"",scaleMax:""};
export const blankCourse=(id:string):GradeLabCourse=>({id,sourceCourseId:null,name:"",code:"",term:"",credits:"",includeInGpa:true,scaleMax:"",grading:"criterion",criteriaConfirmed:false,thresholds:[],targetGrade:"",finalGrade:"",components:[],alertsEnabled:false,scenarios:[],revision:0});
export const blankCategory=(id:string):GradeCategory=>({id,name:"",max:"",earned:null,released:false,step:"1",weight:"",note:"",parts:[]});
export type ScoreUnit={key:string;name:string;max:Rational;earned:Rational|null;step:Rational;weight:Rational};
export function scoreUnits(course:Pick<GradeLabCourse,"components">):ScoreUnit[]{
  return course.components.flatMap(category=>{
    const parts=category.parts.length?category.parts:[category];
    const totalMax=sum(parts.map(p=>decimal(p.max)));
    if(!totalMax.n)throw new Error("คะแนนเต็มต้องมากกว่าศูนย์");
    return parts.map(part=>({key:`${category.id}:${part.id}`,name:category.parts.length?`${category.name} / ${part.name}`:category.name,max:decimal(part.max),earned:part.released&&part.earned!==null?decimal(part.earned):null,step:decimal(part.step),weight:mul(decimal(category.weight),div(decimal(part.max),totalMax))}));
  });
}
export function validateCourse(course:GradeLabCourse){
  const errors:string[]=[],warnings:string[]=[];
  if(!course.name.trim())errors.push("กรุณาระบุชื่อวิชา");
  if(!course.term.trim()||course.term.length>100)errors.push("กรุณาระบุภาคเรียน");
  if(course.code.length>100)errors.push("รหัสวิชายาวเกินไป");
  const optional=(value:string,label:string)=>{if(value)try{decimal(value);}catch{errors.push(`${label}: ตัวเลขไม่ถูกต้อง`);}};
  optional(course.credits,"หน่วยกิต");optional(course.scaleMax,"แต้มสูงสุด");
  if(course.scaleMax&&/^\d+(?:\.\d+)?$/.test(course.scaleMax)&&Number(course.scaleMax)===0)errors.push("แต้มสูงสุดต้องมากกว่าศูนย์");
  if(course.components.length>50||course.thresholds.length>30||course.scenarios.length>20)errors.push("จำนวนหมวด เกณฑ์ หรือสถานการณ์มากเกินไป");
  const ids=new Set<string>();
  for(const category of course.components){
    if(ids.has(category.id))errors.push("รหัสหมวดซ้ำ");ids.add(category.id);
    if(!category.name.trim())errors.push("กรุณาระบุชื่อหมวดคะแนน");
    try{if(cmp(decimal(category.weight),hundred)>0)throw new Error();}catch{errors.push(`${category.name}: น้ำหนักต้องอยู่ระหว่าง 0–100`);}
    const partIds=new Set<string>();
    if(category.parts.length>100)errors.push("งานย่อยมากเกินไป");
    for(const part of category.parts.length?category.parts:[category]){
      if(partIds.has(part.id))errors.push("รหัสงานย่อยซ้ำ");partIds.add(part.id);
      if(!part.name.trim())errors.push("กรุณาระบุชื่องานย่อย");
      try{
        const max=decimal(part.max),step=decimal(part.step);
        if(max.n<=BigInt(0)||step.n<=BigInt(0)||cmp(step,max)>0||div(max,step).d!==BigInt(1))throw new Error();
        if(part.earned!==null&&cmp(decimal(part.earned),max)>0)throw new Error();
        if(part.released&&part.earned===null)throw new Error();
      }catch{errors.push(`${part.name}: ตรวจคะแนนเต็ม คะแนนที่ได้ และหน่วยคะแนน (ต้องหารคะแนนเต็มลงตัว)`);}
    }
  }
  let weight:Rational|null=null;
  try{weight=sum(course.components.map(c=>decimal(c.weight)));}catch{/* field errors above */}
  if(!weight||cmp(weight,hundred)!==BigInt(0))warnings.push("น้ำหนักรวมต้องเท่ากับ 100% ก่อนคำนวณผลรวมและเป้าหมาย");
  const labels=new Set<string>();let bandsValid=course.thresholds.length>0;
  for(const band of course.thresholds){
    if(!band.label.trim()||labels.has(band.label.trim())){bandsValid=false;errors.push("ชื่อเกรดว่างหรือซ้ำกัน");}labels.add(band.label.trim());
    try{if(cmp(decimal(band.min),decimal(band.max))>=BigInt(0)||cmp(decimal(band.max),hundred)>0)bandsValid=false;}catch{bandsValid=false;}
    if(band.points){try{const points=decimal(band.points);if(!course.scaleMax||cmp(points,decimal(course.scaleMax))>0)throw new Error();}catch{errors.push(`${band.label}: แต้มเกรดต้องไม่เกินแต้มสูงสุดที่กำหนด`);}}
  }
  if(bandsValid){const sorted=[...course.thresholds].sort((a,b)=>num(decimal(a.min))-num(decimal(b.min)));
    if(decimal(sorted[0].min).n!==BigInt(0)||cmp(decimal(sorted.at(-1)!.max),hundred)!==BigInt(0))bandsValid=false;
    for(let i=1;i<sorted.length;i++)if(cmp(decimal(sorted[i-1].max),decimal(sorted[i].min))!==BigInt(0))bandsValid=false;
  }
  if(!bandsValid)warnings.push("เกณฑ์ต้องครอบคลุม 0–100 โดยไม่มีช่วงซ้อนหรือช่องว่าง");
  if(!course.criteriaConfirmed)warnings.push("ยังไม่ได้ยืนยันเกณฑ์จริงของรายวิชา");
  if(course.grading==="relative")warnings.push("รายวิชาอิงกลุ่ม: ไม่สามารถระบุเกรดจากคะแนนอย่างแม่นยำได้");
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],weight:weight?num(weight):null,canScore:!errors.length&&Boolean(weight)&&cmp(weight!,hundred)===BigInt(0),canGrade:!errors.length&&Boolean(weight)&&cmp(weight!,hundred)===BigInt(0)&&bandsValid&&course.criteriaConfirmed&&course.grading==="criterion"};
}
function resolveBand(score:Rational,course:GradeLabCourse){return course.thresholds.find(b=>cmp(score,decimal(b.min))>=BigInt(0)&&(cmp(score,decimal(b.max))<BigInt(0)||(cmp(score,hundred)===BigInt(0)&&cmp(decimal(b.max),hundred)===BigInt(0))))?.label??null;}
export function calculateCourse(course:GradeLabCourse,simulation?:Record<string,string>){
  const validation=validateCourse(course);
  if(!validation.canScore)return {validation,current:null,remaining:null,maximum:null,total:null,grade:null,target:null,needed:null,requiredPercent:null,requiredRaw:null,targetState:"insufficient" as const,pending:[] as {key:string;name:string;max:number;step:number;weight:number}[]};
  const units=scoreUnits(course);const pending=units.filter(u=>u.earned===null&&u.weight.n>BigInt(0));
  if(simulation&&Object.keys(simulation).some(key=>!pending.some(unit=>unit.key===key)))throw new Error("หมวดคะแนนเปลี่ยนหรือประกาศคะแนนแล้ว กรุณาตรวจสถานการณ์จำลองใหม่");
  const current=sum(units.filter(u=>u.earned!==null).map(u=>mul(div(u.earned!,u.max),u.weight)));
  const remaining=sum(pending.map(u=>u.weight));const maximum=add(current,remaining);
  let total=current;
  if(simulation)for(const unit of pending){const value=simulation[unit.key];if(value!==undefined){const score=decimal(value);if(cmp(score,unit.max)>0)throw new Error("คะแนนจำลองเกินคะแนนเต็ม");total=add(total,mul(div(score,unit.max),unit.weight));}}
  const target=validation.canGrade?course.thresholds.find(b=>b.label===course.targetGrade):undefined;
  const threshold=target?decimal(target.min):null;const needed=threshold&&cmp(threshold,current)>BigInt(0)?sub(threshold,current):zero;
  const state=!threshold?"insufficient":cmp(current,threshold)>=BigInt(0)?"reached":cmp(maximum,threshold)<BigInt(0)?"impossible":"possible";
  const single=state==="possible"&&pending.length===1?ceilUnit(mul(div(needed,pending[0].weight),pending[0].max),pending[0].step):null;
  return {validation,current:num(current),remaining:num(remaining),maximum:num(maximum),total:num(total),grade:validation.canGrade?resolveBand(total,course):null,target:threshold?num(threshold):null,needed:threshold?num(needed):null,requiredPercent:state==="possible"&&remaining.n?num(mul(div(needed,remaining),hundred)):null,requiredRaw:single?num(single):null,targetState:state,pending:pending.map(u=>({key:u.key,name:u.name,max:num(u.max),step:num(u.step),weight:num(u.weight)}))};
}
export function calculateGpa(courses:GradeLabCourse[],overrides:Record<string,string>={}){
  const missing:string[]=[];let credits=zero,quality=zero;const scales=new Set<string>();
  for(const course of courses.filter(c=>c.includeInGpa)){
    try{
      const credit=decimal(course.credits);if(!credit.n)throw new Error();
      const summary=calculateCourse(course);const label=overrides[course.id]||course.finalGrade||(summary.remaining===0?summary.grade:null);
      const band=course.thresholds.find(b=>b.label===label);
      if(!band||!band.points||!course.scaleMax)throw new Error();
      const points=decimal(band.points),scale=decimal(course.scaleMax);if(cmp(points,scale)>0)throw new Error();
      scales.add(String(num(scale)));credits=add(credits,credit);quality=add(quality,mul(credit,points));
    }catch{missing.push(course.name||"วิชาที่ยังไม่มีชื่อ");}
  }
  if(scales.size>1)missing.push("รายวิชาใช้ระบบแต้มสูงสุดต่างกัน");
  return {gpa:missing.length||!credits.n?null:num(div(quality,credits)),credits:num(credits),qualityPoints:num(quality),exactCredits:{n:String(credits.n),d:String(credits.d)},exactQuality:{n:String(quality.n),d:String(quality.d)},missing,scaleMax:scales.size===1?Number([...scales][0]):null};
}
export function calculateCumulative(courses:GradeLabCourse[],settings:GradeLabSettings,overrides:Record<string,string>={}){
  const base=calculateGpa(courses,overrides);let error:string|null=null,gpax:number|null=null,requiredAverage:number|null=null,impossible=false;
  try{
    if(base.missing.length)throw new Error("ข้อมูลรายวิชาไม่ครบ");
    const priorCredits=decimal(settings.priorCredits),priorQuality=decimal(settings.priorQualityPoints),scale=decimal(settings.scaleMax);
    if(!scale.n||cmp(priorQuality,mul(priorCredits,scale))>0||(!priorCredits.n&&priorQuality.n)||(base.scaleMax!==null&&base.scaleMax!==num(scale)))throw new Error("ตรวจแต้มสะสมและระบบแต้มสูงสุดให้ตรงกัน");
    const totalCredits=add(priorCredits,fraction(BigInt(base.exactCredits.n),BigInt(base.exactCredits.d))),totalQuality=add(priorQuality,fraction(BigInt(base.exactQuality.n),BigInt(base.exactQuality.d)));
    if(totalCredits.n)gpax=num(div(totalQuality,totalCredits));
    if(settings.targetGpa&&settings.futureCredits){const future=decimal(settings.futureCredits),target=decimal(settings.targetGpa);if(!future.n)throw new Error("หน่วยกิตที่เหลือต้องมากกว่าศูนย์");const deficit=sub(mul(target,add(totalCredits,future)),totalQuality);const average=deficit.n>BigInt(0)?div(deficit,future):zero;impossible=cmp(average,scale)>BigInt(0);requiredAverage=impossible?null:num(ceilUnit(average,decimal("0.0001")));}
  }catch(e){error=e instanceof Error?e.message:"ข้อมูล GPAX ไม่ครบ";}
  return {gpax,requiredAverage,impossible,error};
}
export function gradeAlert(course:GradeLabCourse){
  const result=calculateCourse(course);
  if(!course.alertsEnabled)return null;
  if(!result.validation.canScore||!result.validation.canGrade)return {key:"incomplete",message:`${course.name}: ${result.validation.errors[0]||result.validation.warnings[0]||"กรุณาตรวจเกณฑ์คะแนน"}`};
  if(result.targetState==="impossible")return {key:`impossible:${course.targetGrade}:${result.maximum}`,message:`${course.name}: คะแนนสูงสุดที่เป็นไปได้ ${formatGradeNumber(result.maximum)} ยังไม่ถึงเป้าหมาย ${course.targetGrade}`};
  if(result.targetState==="possible")return {key:`needed:${course.targetGrade}:${result.needed}:${result.maximum}`,message:result.requiredRaw!==null?`${course.name}: ต้องได้ ${result.pending[0].name} อย่างน้อย ${formatGradeNumber(result.requiredRaw,4)} / ${formatGradeNumber(result.pending[0].max,4)} เพื่อถึง ${course.targetGrade}`:`${course.name}: ต้องเพิ่ม ${formatGradeNumber(result.needed)} คะแนนถ่วงน้ำหนักจาก ${result.pending.length} ส่วน เพื่อถึง ${course.targetGrade}`};
  return null;
}
export function formatGradeNumber(value:number|null,digits=2){return value===null?"—":value.toLocaleString("th-TH",{minimumFractionDigits:0,maximumFractionDigits:digits});}

/** Thresholds explicitly supplied in the user's reference image; GPA points were not supplied. */
export function uploadedScoreCriteria():GradeBand[] {
 return [["A","80","100"],["B+","75","80"],["B","70","75"],["C+","65","70"],["C","60","65"],["D+","55","60"],["D","50","55"],["F","0","50"]].map(([label,min,max])=>({id:crypto.randomUUID(),label,min,max,points:""}));
}
/** A category's earned contribution on the course's 100-point scale. */
export function calculateCategoryScore(category:GradeCategory):number|null {
 try {
  const weight=decimal(category.weight);if(cmp(weight,hundred)>BigInt(0))return null;
  const units=scoreUnits({components:[category]});
  if(units.some(u=>u.earned!==null&&cmp(u.earned,u.max)>BigInt(0)))return null;
  return num(sum(units.filter(u=>u.earned!==null).map(u=>mul(div(u.earned!,u.max),u.weight))));
 }catch{return null;}
}
