"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Calculator, Check, ChevronDown, CircleAlert, CircleCheck, GraduationCap, Pencil, Pin, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BottomSheet, Card, EmptyState, Field, Input, PageHeader, ProgressBar, Select, StatusPill, Textarea } from "@/components/ui";
import { calculateGradePlan, formatExamDateTime, getExamCountdown, getExamDate, getExamReadiness, getGradePlanSummary, hasEarnedScore, isGradeComponentUsed, validateGradePlan } from "@/lib/academic-utils";
import { getCourseById, getCurrentTermCourses } from "@/lib/course-utils";
import { toLocalDateKey } from "@/lib/finance-utils";
import { normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { CourseGradePlan, ExamType, GradeComponent, GradeThreshold, NewCourseNoteInput, NewExamInput } from "@/types";

const examTypes: ExamType[] = ["quiz", "midterm", "final", "practical", "presentation", "other"];
const thaiExamTypes: Record<ExamType, string> = { quiz: "สอบย่อย", midterm: "กลางภาค", final: "ปลายภาค", practical: "ปฏิบัติ", presentation: "นำเสนอ", other: "อื่น ๆ" };
const defaultThresholds: GradeThreshold[] = [{ label: "A", minimumPercent: 80 }, { label: "B+", minimumPercent: 75 }, { label: "B", minimumPercent: 70 }, { label: "C+", minimumPercent: 65 }, { label: "C", minimumPercent: 60 }, { label: "D+", minimumPercent: 55 }, { label: "D", minimumPercent: 50 }, { label: "F", minimumPercent: 0 }];
const dateNow = () => toLocalDateKey(new Date());

function CourseSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) { const { schedules } = useAppState(); const courses = getCurrentTermCourses(schedules); return <Select value={value} onChange={(event) => onChange(event.target.value)}><option value="">เลือกวิชา</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</Select>; }
function courseName(courseId: string, schedules: ReturnType<typeof useAppState>["schedules"]) { return getCourseById(schedules, courseId)?.name ?? "วิชาที่ถูกนำออกจากตารางเรียน"; }

export function ExamsPage() {
  const { exams, schedules } = useAppState();
  const { t, language } = useLanguage();
  const now = new Date();

  const sorted = [...exams].sort((first, second) => (getExamDate(first)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (getExamDate(second)?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const upcoming = sorted.filter((exam) => { const examDate = getExamDate(exam); return !exam.completedAt && examDate !== null && examDate >= now; });
  const completed = sorted.filter((exam) => { const examDate = getExamDate(exam); return examDate === null || examDate < now || Boolean(exam.completedAt); });
  const next = upcoming[0];

  return (
    <div className="page academic-page">
      <header className="academic-page-header">
        <div>
          <h1>{t("nav.exams")}</h1>
          <p>จัดการวันสอบและแผนอ่านหนังสือ</p>
        </div>
        <Link className="primary-button" href="/exams/new"><Plus />เพิ่มการสอบ</Link>
      </header>
      {next && (
        <Card className="academic-highlight">
          <small>สอบครั้งถัดไป</small>
          <h2>{courseName(next.courseId, schedules)}</h2>
          <strong>{thaiExamTypes[next.type]} · {next.title}</strong>
          <p>{formatExamDateTime(next, language)}</p>
          <b>{getExamCountdown(next, now, language)}</b>
        </Card>
      )}
      <section className="academic-list-section">
        <h2>กำลังจะมาถึง</h2>
        {upcoming.length ? upcoming.map((exam) => <ExamRow key={exam.id} exam={exam} />) : (
          <>
            <EmptyState title="ยังไม่มีการสอบ" description="เพิ่มวันสอบเพื่อวางแผนอ่านหนังสือ" />
            <Link className="primary-button" href="/exams/new"><Plus />เพิ่มการสอบ</Link>
          </>
        )}
      </section>
      {completed.length > 0 && (
        <section className="academic-list-section">
          <h2>สอบแล้ว</h2>
          {completed.map((exam) => <ExamRow key={exam.id} exam={exam} />)}
        </section>
      )}
    </div>
  );
}

export function GradesOverviewView() {
  const { schedules, gradePlans } = useAppState();
  const { t } = useLanguage();
  const courses = getCurrentTermCourses(schedules);

  return (
    <div className="grades-overview-section">
      <header className="academic-page-header">
        <div>
          <h1>{t("grades.title")}</h1>
          <p>{t("grades.intro")}</p>
        </div>
      </header>
      {courses.length ? (
        <div className="academic-card-grid">
          {courses.map((course) => {
            const plan = gradePlans.find((item) => item.courseId === course.id);
            const summary = plan ? calculateGradePlan(plan) : null;
            return (
              <Link className="academic-summary-card grade-overview-card" href={`/grades/${course.id}`} key={course.id}>
                <span className="grade-overview-accent" aria-hidden="true" style={{ backgroundColor: normalizeTalevoColor(course.color) }} />
                <strong>{course.name}</strong>
                {summary ? (
                  <>
                    <span>{t("grades.currentScore")} {formatScore(summary.earnedPoints)} / {formatScore(summary.totalMax, 0)}</span>
                    <b>{t("grades.target")}: {plan?.targetGrade ?? "—"}</b>
                    <small>{summary.targetReached ? t("grades.targetReached") : summary.canReachTarget && summary.pointsNeeded !== null ? `${t("grades.needed")} ${formatScore(summary.pointsNeeded)} ${t("grades.points")}` : t("grades.targetImpossible")}</small>
                  </>
                ) : (
                  <>
                    <span>{t("grades.noPlan")}</span>
                    <b>{t("grades.startPlan")}</b>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <>
          <EmptyState title="ยังไม่มีรายวิชาสำหรับวางแผนเกรด" description="เพิ่มตารางเรียนก่อน แล้วคุณจะเริ่มสร้างแผนคะแนนรายวิชาได้" />
          <Link className="primary-button" href="/schedule/new"><Plus />เพิ่มตารางเรียน</Link>
        </>
      )}
    </div>
  );
}
function ExamRow({ exam }: { exam: ReturnType<typeof useAppState>["exams"][number] }) { const { schedules } = useAppState(); const { language } = useLanguage(); const readiness = getExamReadiness(exam); return <Link href={`/exams/${exam.id}`} className="academic-row"><span className="academic-row-icon"><GraduationCap /></span><div><strong>{courseName(exam.courseId,schedules)}</strong><span>{thaiExamTypes[exam.type]} · {exam.title}</span><small>{formatExamDateTime(exam, language)}</small><small>{getExamCountdown(exam,new Date(),language)}{readiness ? ` · พร้อม ${readiness.completed}/${readiness.total}` : ""}</small></div></Link>; }
export function ExamFormPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { exams, addExam, updateExam } = useAppState();
  const editId = params.get("edit");
  const source = editId ? exams.find((exam) => exam.id === editId) : undefined;
  const [form,setForm] = useState<NewExamInput>(() => source ? { courseId: source.courseId, title: source.title, type: source.type, startAt: source.startAt, endAt: source.endAt ?? "", room: source.room ?? "", note: source.note ?? "", topics: source.topics.map((topic) => ({ ...topic })) } : {courseId:"",title:"",type:"quiz",startAt:`${dateNow()}T09:00`,endAt:"",room:"",note:"",topics:[]});
  const [topic,setTopic] = useState("");
  const [error,setError] = useState("");
  if (editId && !source) return <div className="page"><PageHeader title="แก้ไขการสอบ" backHref="/exams"/><EmptyState title="ไม่พบการสอบ" description="รายการอาจถูกลบแล้ว"/></div>;
  const save=(event:FormEvent)=>{event.preventDefault();if(!form.courseId){setError("กรุณาเลือกวิชาสำหรับการสอบ");return;}if(!form.title.trim()){setError("กรุณากรอกชื่อการสอบ");return;}if(!form.startAt || !getExamDate({ startAt: form.startAt })){setError("กรุณาระบุวันที่และเวลาเริ่มให้ถูกต้อง");return;}if(form.endAt && (!getExamDate({ startAt: form.endAt }) || new Date(form.endAt) <= new Date(form.startAt))){setError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");return;}const input={...form,title:form.title.trim(),room:form.room?.trim(),note:form.note?.trim(),topics:form.topics};if(editId){updateExam(editId,input);router.push(`/exams/${editId}`);}else{const id=addExam(input);router.push(`/exams/${id}`);}};
  const editing = Boolean(editId);
  return <div className="page form-page"><PageHeader title={editing ? "แก้ไขการสอบ" : "เพิ่มการสอบ"} backHref={editing ? `/exams/${editId}` : "/exams"} /><Card className="form-card"><form className="form-grid" onSubmit={save}><Field label="วิชา"><CourseSelect value={form.courseId} onChange={(courseId)=>{setForm({...form,courseId});setError("");}}/></Field><Field label="ประเภทการสอบ"><Select value={form.type} onChange={(event)=>setForm({...form,type:event.target.value as ExamType})}>{examTypes.map((type)=><option key={type} value={type}>{thaiExamTypes[type]}</option>)}</Select></Field><Field label="ชื่อการสอบ"><Input required value={form.title} onChange={(event)=>{setForm({...form,title:event.target.value});setError("");}}/></Field><Field label="วันที่และเวลาเริ่ม"><Input required type="datetime-local" value={form.startAt} onChange={(event)=>{setForm({...form,startAt:event.target.value});setError("");}}/></Field><Field label="เวลาสิ้นสุด (ไม่บังคับ)"><Input type="datetime-local" value={form.endAt} onChange={(event)=>{setForm({...form,endAt:event.target.value});setError("");}}/></Field><Field label="ห้องสอบ"><Input value={form.room} onChange={(event)=>setForm({...form,room:event.target.value})}/></Field><Field label="หมายเหตุ"><Textarea value={form.note} onChange={(event)=>setForm({...form,note:event.target.value})}/></Field><Field label="หัวข้อที่ต้องอ่าน"><div className="inline-input"><Input value={topic} onChange={(event)=>setTopic(event.target.value)} /><button type="button" className="secondary-button" disabled={!topic.trim()} onClick={()=>{if(topic.trim()){setForm({...form,topics:[...form.topics,{id:`topic-${Date.now()}`,title:topic.trim(),completed:false}]});setTopic("");}}}>เพิ่ม</button></div>{form.topics.map((item)=><div className="draft-chip" key={item.id}>{item.title}<button type="button" aria-label={`ลบหัวข้อ ${item.title}`} onClick={()=>setForm({...form,topics:form.topics.filter((topicItem)=>topicItem.id!==item.id)})}>×</button></div>)}</Field>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button button-block" type="submit">{editing ? "บันทึกการแก้ไข" : "บันทึกการสอบ"}</button></form></Card></div>;
}
export function ExamDetailPage() { const { id } = useParams<{id:string}>(); const router=useRouter(); const {exams,schedules,toggleExamTopic,deleteExam}=useAppState(); const { language } = useLanguage(); const [deleteOpen,setDeleteOpen]=useState(false); const exam=exams.find((item)=>item.id===id); if(!exam)return <div className="page"><PageHeader title="การสอบ" backHref="/exams"/><EmptyState title="ไม่พบการสอบ" description="รายการอาจถูกลบแล้ว"/></div>; const readiness=getExamReadiness(exam); return <div className="page academic-page"><PageHeader title="รายละเอียดการสอบ" backHref="/exams"/><Card className="academic-detail"><span>{courseName(exam.courseId,schedules)}</span><h1>{exam.title}</h1><p>{thaiExamTypes[exam.type]} · {formatExamDateTime(exam, language)}</p>{exam.note&&<p>{exam.note}</p>}<strong>{getExamCountdown(exam, new Date(), language)}</strong></Card><section className="academic-list-section"><h2>หัวข้อที่ต้องอ่าน</h2>{readiness&&<ProgressBar value={readiness.percent} color="purple"/>}{exam.topics.length?exam.topics.map((topic)=><button className={`check-row ${topic.completed?"done":""}`} key={topic.id} type="button" onClick={()=>toggleExamTopic(exam.id,topic.id)}><Check/>{topic.title}</button>):<p>ยังไม่มีหัวข้อที่ต้องอ่าน</p>}</section><div className="dialog-actions"><Link className="secondary-button" href={`/exams/new?edit=${exam.id}`}><Pencil/>แก้ไขการสอบ</Link><button className="text-danger-button" type="button" onClick={()=>setDeleteOpen(true)}><Trash2/>ลบการสอบ</button></div><BottomSheet open={deleteOpen} title="ลบการสอบ" onClose={()=>setDeleteOpen(false)}><div className="task-delete-dialog"><p>ต้องการลบ “{exam.title}” ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={()=>setDeleteOpen(false)}>ยกเลิก</button><button className="danger-button" type="button" onClick={()=>{deleteExam(exam.id);router.push("/exams");}}><Trash2/>ลบการสอบ</button></div></div></BottomSheet></div>; }

export function NotesPage() { const {courseNotes,schedules,toggleNotePinned}=useAppState(); const [query,setQuery]=useState(""); const courses=getCurrentTermCourses(schedules); const notes=courseNotes.filter((note)=>`${note.title} ${note.content} ${note.tags.join(" ")} ${courseName(note.courseId,schedules)}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)); return <div className="page academic-page"><header className="academic-page-header"><div><h1>โน้ตการเรียน</h1><p>เก็บสรุปและประเด็นสำคัญรายวิชา</p></div><Link className="primary-button" href="/notes/new"><Plus/>เพิ่มโน้ต</Link></header><label className="search-field"><Search/><Input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="ค้นหาโน้ต"/></label>{courses.map((course)=>{const group=notes.filter((note)=>note.courseId===course.id);return group.length?<section className="academic-list-section" key={course.id}><h2>{course.name} <small>{group.length} โน้ต</small></h2>{group.map((note)=><article className="note-row" key={note.id}><Link href={`/notes/${note.id}`}><strong>{note.title}</strong><p>{note.content.slice(0,120)}</p><small>{note.tags.join(" · ")}</small></Link><button type="button" aria-label="ปักหมุด" className={note.pinned?"active":""} onClick={()=>toggleNotePinned(note.id)}><Pin/></button></article>)}</section>:null;})}{!notes.length&&<><EmptyState title="ยังไม่มีโน้ต" description="เริ่มบันทึกสรุปจากรายวิชาของคุณ"/><Link className="primary-button" href="/notes/new"><Plus/>เพิ่มโน้ต</Link></>}</div>; }
export function NoteFormPage() { const router=useRouter();const params=useSearchParams();const {addCourseNote}=useAppState();const [form,setForm]=useState<NewCourseNoteInput>({courseId:params.get("courseId")??"",title:"",content:"",tags:[],pinned:false,classDate:params.get("date")??undefined});const [tags,setTags]=useState("");const [error,setError]=useState("");const save=(event:FormEvent)=>{event.preventDefault();if(!form.courseId){setError("กรุณาเลือกวิชาสำหรับโน้ตนี้");return;}if(!form.title.trim()||!form.content.trim()){setError("กรุณากรอกชื่อและเนื้อหาโน้ต");return;}const id=addCourseNote({...form,title:form.title.trim(),content:form.content.trim(),tags:tags.split(",").map((tag)=>tag.trim()).filter(Boolean)});router.push(`/notes/${id}`);};return <div className="page form-page"><PageHeader title="เพิ่มโน้ต" backHref="/notes"/><Card className="form-card"><form className="form-grid" onSubmit={save}><Field label="วิชา"><CourseSelect value={form.courseId} onChange={(courseId)=>{setForm({...form,courseId});setError("");}}/></Field><Field label="ชื่อโน้ต"><Input required value={form.title} onChange={(event)=>{setForm({...form,title:event.target.value});setError("");}}/></Field><Field label="เนื้อหา"><Textarea required value={form.content} onChange={(event)=>{setForm({...form,content:event.target.value});setError("");}}/></Field><Field label="แท็ก (คั่นด้วย ,)"><Input value={tags} onChange={(event)=>setTags(event.target.value)} placeholder="Lecture, สรุป, สอบ"/></Field><label className="checkbox-row"><Input type="checkbox" checked={form.pinned} onChange={(event)=>setForm({...form,pinned:event.target.checked})}/>ปักหมุดโน้ตนี้</label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button button-block" type="submit">บันทึกโน้ต</button></form></Card></div>; }
export function NoteDetailPage() { const {id}=useParams<{id:string}>();const router=useRouter();const {courseNotes,schedules,deleteCourseNote,toggleNotePinned}=useAppState();const note=courseNotes.find((item)=>item.id===id);if(!note)return <div className="page"><PageHeader title="โน้ต" backHref="/notes"/><EmptyState title="ไม่พบโน้ต" description="รายการอาจถูกลบแล้ว"/></div>;return <div className="page academic-page"><PageHeader title="รายละเอียดโน้ต" backHref="/notes"/><Card className="academic-detail"><span>{courseName(note.courseId,schedules)}</span><h1>{note.title}</h1><p>{note.content}</p><small>{note.tags.join(" · ")}</small></Card><button className="secondary-button" type="button" onClick={()=>toggleNotePinned(note.id)}><Pin/>{note.pinned?"เลิกปักหมุด":"ปักหมุด"}</button><button className="text-danger-button" type="button" onClick={()=>{if(window.confirm("ต้องการลบโน้ตนี้หรือไม่?")){deleteCourseNote(note.id);router.push("/notes");}}}><Trash2/>ลบโน้ต</button></div>; }


function blankPlan(): Omit<CourseGradePlan, "id" | "courseId"> {
  return { targetGrade: "A", thresholds: defaultThresholds.map((threshold) => ({ ...threshold })), components: [{ id: "component-1", name: "คะแนนเก็บ", weight: 20, maxScore: 20 }, { id: "component-2", name: "กลางภาค", weight: 30, maxScore: 30 }, { id: "component-3", name: "ปลายภาค", weight: 50, maxScore: 50 }] };
}

function formatScore(value: number | null | undefined, digits = 1) {
  return typeof value !== "number" || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function inputNumber(value: string) {
  return value === "" ? 0 : Number(value);
}

export function GradesPage() {
  return <ExamsPage />;
}

export function GradeDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { schedules, gradePlans, upsertGradePlan } = useAppState();
  const { t } = useLanguage();
  const course = getCourseById(schedules, courseId);
  const existing = gradePlans.find((plan) => plan.courseId === courseId);
  const baseline = existing ? { targetGrade: existing.targetGrade, thresholds: existing.thresholds, components: existing.components } : blankPlan();
  const [plan, setPlan] = useState<Omit<CourseGradePlan, "id" | "courseId">>(baseline);
  const [saved, setSaved] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [whatIfScores, setWhatIfScores] = useState<Record<string, number | undefined>>({});

  if (!course) return <div className="page"><PageHeader title={t("grades.title")} backHref="/tasks?view=grades" /><EmptyState title="ไม่พบวิชา" description="วิชานี้อาจถูกนำออกจากตาราง" /></div>;

  const previewPlan: CourseGradePlan = { ...plan, id: "preview", courseId };
  const summary = getGradePlanSummary(previewPlan);
  const validation = validateGradePlan(previewPlan);
  const isDirty = JSON.stringify(plan) !== JSON.stringify(baseline);
  const componentError = (id: string) => validation.componentErrors[id]?.map((key) => t(`grades.${key}`)).join(" ");
  const thresholdError = (index: number) => validation.thresholdErrors[index]?.map((key) => t(`grades.${key}`)).join(" ");
  const changePlan = (next: Omit<CourseGradePlan, "id" | "courseId">) => { setSaved(false); setPlan(next); };
  const changeComponent = (id: string, next: Partial<GradeComponent>) => changePlan({ ...plan, components: plan.components.map((component) => component.id === id ? { ...component, ...next } : component) });
  const addComponent = () => {
    const id = `component-${Date.now()}`;
    changePlan({ ...plan, components: [...plan.components, { id, name: "", weight: 0, maxScore: 0 }] });
    window.requestAnimationFrame(() => document.getElementById(`grade-name-${id}`)?.focus());
  };
  const removeComponent = (component: GradeComponent) => {
    if (isGradeComponentUsed(component) && !window.confirm(`${t("grades.confirmDeleteComponent")} “${component.name || t("grades.component")}”?`)) return;
    changePlan({ ...plan, components: plan.components.filter((item) => item.id !== component.id) });
    setWhatIfScores((current) => { const rest = { ...current }; delete rest[component.id]; return rest; });
  };
  const save = () => {
    setAttemptedSave(true);
    if (!validation.isValid) return;
    upsertGradePlan(courseId, plan);
    setSaved(true);
  };
  const leave = () => {
    if (!isDirty || window.confirm(t("grades.unsavedChanges"))) router.push("/tasks?view=grades");
  };
  const simulatedComponents = plan.components.map((component) => !hasEarnedScore(component) && whatIfScores[component.id] !== undefined ? { ...component, earnedScore: whatIfScores[component.id] } : component);
  const invalidSimulation = plan.components.some((component) => {
    const score = whatIfScores[component.id];
    return score !== undefined && (score < 0 || score > component.maxScore || component.maxScore <= 0);
  });
  const simulatedSummary = Object.values(whatIfScores).some((value) => value !== undefined) && !invalidSimulation ? getGradePlanSummary({ ...previewPlan, components: simulatedComponents }) : null;
  const targetTone = summary.targetReached ? "green" : summary.possible ? "orange" : "red";

  return <div className="page grade-planner-page">
    <PageHeader title={course.name} backHref="/tasks?view=grades" onBack={leave} action={t("common.save")} onAction={save} />
    <p className="grade-course-context">{t("grades.currentTermCourse")}</p>
    {saved && <p className="grade-save-toast" role="status"><CircleCheck />{t("grades.planSaved")}</p>}
    {attemptedSave && !validation.isValid && <p className="grade-save-error" role="alert"><CircleAlert />{t("grades.saveBlocked")}</p>}

    <Card className="grade-summary-card"><div className="grade-card-heading"><div><h2>{t("grades.summary")}</h2><p>{summary.remainingWeight === 0 ? t("grades.finalRecorded") : t("grades.estimateOnly")}</p></div><StatusPill tone={targetTone}>{plan.targetGrade ?? "—"}</StatusPill></div><div className="grade-summary-metrics"><div className="primary"><strong>{formatScore(summary.current)}</strong><span>{t("grades.currentScore")}</span><small>/ 100</small></div><div><strong>{formatScore(summary.gradedWeight, 0)}%</strong><span>{t("grades.gradedWeight")}</span></div><div><strong>{formatScore(summary.remainingWeight, 0)}</strong><span>{t("grades.remaining")}</span><small>{t("grades.points")}</small></div><div><strong>{plan.targetGrade ?? "—"}</strong><span>{t("grades.target")}</span></div></div><div className="grade-summary-secondary"><span>{t("grades.gradedAverage")} <strong>{formatScore(summary.gradedAverage)}%</strong></span><span>{t("grades.estimatedCurrentGrade")} <strong>{summary.currentGrade ?? "—"}</strong></span></div><div className="grade-progress-wrap"><div className="progress-label"><span>{t("grades.currentScore")}</span><strong>{formatScore(summary.current)} / 100</strong></div><div className="grade-progress-track" role="progressbar" aria-label={t("grades.currentScore")} aria-valuenow={Math.min(100, Math.max(0, summary.current))} aria-valuemin={0} aria-valuemax={100}><span className="grade-progress-current" style={{ width: `${Math.min(100, Math.max(0, summary.current))}%` }} /><i style={{ left: `${Math.min(100, Math.max(0, summary.target ?? 0))}%` }} aria-label={`${t("grades.target")} ${plan.targetGrade ?? ""}`} /></div><div className="grade-progress-legend"><span>● {t("grades.currentScore")}</span><span>▲ {t("grades.target")} {plan.targetGrade ?? "—"} = {formatScore(summary.target)}</span></div></div></Card>

    <section className="grade-section"><div className="section-header"><h2>{t("grades.targetGrade")}</h2></div><Card className={`grade-target-card tone-${targetTone}`}><Field label={t("grades.targetGrade")}><Select value={plan.targetGrade ?? ""} onChange={(event) => changePlan({ ...plan, targetGrade: event.target.value })}>{plan.thresholds.map((threshold) => <option key={threshold.label} value={threshold.label}>{threshold.label}</option>)}</Select></Field><div className="grade-target-copy"><p>{t("grades.threshold")}: <strong>{formatScore(summary.target)} {t("grades.pointsOrMore")}</strong></p>{summary.targetReached ? <><h3>{t("grades.targetReached")}</h3><p>{t("grades.targetReachedDescription")}</p></> : !summary.possible ? <><h3>{t("grades.targetImpossible")}</h3><p>{t("grades.targetImpossibleDescription")} <strong>{formatScore(summary.maximumPossible)}</strong></p></> : summary.remainingWeight > 0 ? <><h3>{t("grades.needPoints")} <strong>{formatScore(summary.requiredPoints)} {t("grades.points")}</strong></h3><p>{t("grades.requiredAverage")} <strong>{formatScore(summary.requiredAverage)}%</strong> {t("grades.remainingScore")}</p>{summary.requiredRawScore !== null && summary.ungradedComponents[0] ? <div className="grade-exact-required"><strong>{summary.ungradedComponents[0].name || t("grades.component")} {t("grades.exactRequired")}</strong><b>{formatScore(summary.requiredRawScore)} / {formatScore(summary.ungradedComponents[0].maxScore)} {t("grades.points")}</b><span>{formatScore(summary.requiredAverage)}%</span></div> : <div className="grade-remaining-list"><strong>{t("grades.remainingComponents")}</strong>{summary.ungradedComponents.map((component) => <span key={component.id}>{component.name || t("grades.component")} · {formatScore(component.weight, 0)}%</span>)}</div>}</> : null}</div></Card></section>

    <section className="grade-section"><div className="section-header"><h2>{t("grades.components")}</h2><span>{t("grades.totalWeight")}: {formatScore(summary.weight, 0)}%</span></div><Card className="grade-components-card"><div className="grade-component-header" aria-hidden="true"><span>{t("grades.component")}</span><span>{t("grades.weight")}</span><span>{t("grades.maxScore")}</span><span>{t("grades.earnedScore")}</span><span>{t("grades.status")}</span><span>{t("grades.delete")}</span></div>{plan.components.length ? plan.components.map((component) => { const error = componentError(component.id); const isGraded = hasEarnedScore(component); return <div className="grade-component-row" key={component.id}><label><span>{t("grades.componentName")}</span><Input id={`grade-name-${component.id}`} value={component.name} onChange={(event) => changeComponent(component.id, { name: event.target.value })} /></label><label><span>{t("grades.weight")} (%)</span><Input type="number" min="0" max="100" step="0.01" value={component.weight || ""} onChange={(event) => changeComponent(component.id, { weight: inputNumber(event.target.value) })} /></label><label><span>{t("grades.maxScore")}</span><Input type="number" min="0" step="0.01" value={component.maxScore || ""} onChange={(event) => changeComponent(component.id, { maxScore: inputNumber(event.target.value) })} /></label><label><span>{t("grades.earnedScore")}</span><Input type="number" min="0" step="0.01" placeholder="—" value={component.earnedScore ?? ""} onChange={(event) => changeComponent(component.id, { earnedScore: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><span className={`grade-component-status ${isGraded ? "graded" : "waiting"}`}><i />{isGraded ? t("grades.graded") : t("grades.waitingScore")}</span><button className="text-danger-button grade-delete-component" type="button" onClick={() => removeComponent(component)} aria-label={`${t("grades.delete")} ${component.name || t("grades.component")}`}><Trash2 /></button>{(attemptedSave || error) && error && <p className="grade-component-error" role="alert">{error}</p>}</div>; }) : <div className="grade-empty-components"><Calculator /><strong>{t("grades.noComponents")}</strong><p>{t("grades.noComponentsDescription")}</p></div>}<div className={`grade-weight-status ${summary.weight > 100 ? "invalid" : summary.weight === 100 ? "complete" : "warning"}`}><strong>{t("grades.totalWeight")} {formatScore(summary.weight, 0)}%</strong><span>{summary.weight > 100 ? `${t("grades.weightOver")} ${formatScore(summary.weight - 100, 0)}%` : summary.weight === 100 ? t("grades.weightComplete") : `${t("grades.weightRemaining")} ${formatScore(100 - summary.weight, 0)}%`}</span></div><button className="secondary-button grade-add-component" type="button" onClick={addComponent}><Plus />{t("grades.addComponent")}</button></Card></section>

    <section className="grade-section"><div className="section-header"><h2>{t("grades.projected")}</h2></div><Card className="grade-projection-card"><div><span>{t("grades.minimumPossible")}</span><strong>{formatScore(summary.current)}</strong></div><div><span>{t("grades.maximumPossible")}</span><strong>{formatScore(summary.maximumPossible)}</strong></div><div><span>{t("grades.projectedScore")}</span><strong>{formatScore(summary.projectedFinal)}</strong><small>{summary.projectedGrade ? `${t("grades.projectedGrade")}: ${summary.projectedGrade}` : "—"}</small></div><p><TrendingUp />{t("grades.estimateOnly")}</p></Card></section>

    {summary.ungradedComponents.length > 0 && <section className="grade-section"><div className="section-header"><h2>{t("grades.whatIf")}</h2></div><Card className="grade-what-if-card"><p>{t("grades.whatIfDescription")}</p><div className="grade-what-if-fields">{summary.ungradedComponents.map((component) => <Field key={component.id} label={`${component.name || t("grades.component")} — ${t("grades.ifScore")} / ${formatScore(component.maxScore)}`}><Input type="number" min="0" max={component.maxScore} step="0.01" placeholder="—" value={whatIfScores[component.id] ?? ""} onChange={(event) => setWhatIfScores((current) => ({ ...current, [component.id]: event.target.value === "" ? undefined : Number(event.target.value) }))} />{whatIfScores[component.id] !== undefined && (whatIfScores[component.id]! < 0 || whatIfScores[component.id]! > component.maxScore) && <small className="field-error">{t("grades.componentEarnedMax")}</small>}</Field>)}</div>{simulatedSummary && <div className="grade-simulation-result"><span>{t("grades.simulatedTotal")}</span><strong>{formatScore(simulatedSummary.current)}</strong><b>{t("grades.projectedGrade")}: {simulatedSummary.currentGrade ?? "—"}</b></div>}{Object.values(whatIfScores).some((value) => value !== undefined) && <button className="text-button" type="button" onClick={() => setWhatIfScores({})}>{t("grades.clearSimulation")}</button>}</Card></section>}

    <section className="grade-section"><details className="grade-criteria-card"><summary><span>{t("grades.criteria")}</span><ChevronDown /></summary><p>{t("grades.criteriaDefault")}</p><div className="grade-threshold-list">{plan.thresholds.map((threshold, index) => <div key={`${threshold.label}-${index}`}><Field label={t("grades.thresholdLabel")}><Input value={threshold.label} onChange={(event) => changePlan({ ...plan, thresholds: plan.thresholds.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></Field><Field label={t("grades.thresholdMinimum")} error={thresholdError(index)}><Input type="number" min="0" max="100" step="0.01" value={Number.isFinite(threshold.minimumPercent) ? threshold.minimumPercent : ""} onChange={(event) => changePlan({ ...plan, thresholds: plan.thresholds.map((item, itemIndex) => itemIndex === index ? { ...item, minimumPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) } : item) })} /></Field></div>)}</div><p className="grade-criteria-notice">{t("grades.criteriaNotice")}</p></details></section>
    <button className="primary-button button-block grade-save-button" type="button" onClick={save} disabled={!isDirty || !validation.isValid}>{t("grades.savePlan")}</button>
  </div>;
}

/** A focused workflow for score entry; calculation and persistence remain in academic-utils/AppState. */
export function SimplifiedGradeDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { schedules, gradePlans, upsertGradePlan } = useAppState();
  const { t } = useLanguage();
  const course = getCourseById(schedules, courseId);
  const existing = gradePlans.find((item) => item.courseId === courseId);
  const baseline = existing ? { targetGrade: existing.targetGrade, thresholds: existing.thresholds, components: existing.components } : blankPlan();
  const [plan, setPlan] = useState<Omit<CourseGradePlan, "id" | "courseId">>(baseline);
  const [saved, setSaved] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfScores, setWhatIfScores] = useState<Record<string, number | undefined>>({});

  if (!course) return <div className="page"><PageHeader title={t("grades.title")} backHref="/tasks?view=grades" /><EmptyState title="ไม่พบวิชา" description="วิชานี้อาจถูกนำออกจากตาราง" /></div>;

  const previewPlan: CourseGradePlan = { ...plan, id: "preview", courseId };
  const summary = getGradePlanSummary(previewPlan);
  const validation = validateGradePlan(previewPlan);
  const isDirty = JSON.stringify(plan) !== JSON.stringify(baseline);
  const hasScores = summary.gradedWeight > 0;
  const componentError = (id: string) => validation.componentErrors[id]?.map((key) => t(`grades.${key}`)).join(" ");
  const thresholdError = (index: number) => validation.thresholdErrors[index]?.map((key) => t(`grades.${key}`)).join(" ");
  const changePlan = (next: Omit<CourseGradePlan, "id" | "courseId">) => { setSaved(false); setPlan(next); };
  const changeComponent = (id: string, next: Partial<GradeComponent>) => changePlan({ ...plan, components: plan.components.map((item) => item.id === id ? { ...item, ...next } : item) });
  const addComponent = () => { const id = `component-${Date.now()}`; changePlan({ ...plan, components: [...plan.components, { id, name: "", weight: 0, maxScore: 0 }] }); window.requestAnimationFrame(() => document.getElementById(`grade-name-${id}`)?.focus()); };
  const removeComponent = (component: GradeComponent) => { if (isGradeComponentUsed(component) && !window.confirm(`${t("grades.confirmDeleteComponent")} “${component.name || t("grades.component")}?`)) return; changePlan({ ...plan, components: plan.components.filter((item) => item.id !== component.id) }); setWhatIfScores((current) => { const next = { ...current }; delete next[component.id]; return next; }); };
  const save = () => { setAttemptedSave(true); if (!validation.isValid) return; upsertGradePlan(courseId, plan); setSaved(true); };
  const leave = () => { if (!isDirty || window.confirm(t("grades.unsavedChanges"))) router.push("/tasks?view=grades"); };
  const simulatedComponents = plan.components.map((component) => !hasEarnedScore(component) && whatIfScores[component.id] !== undefined ? { ...component, earnedScore: whatIfScores[component.id] } : component);
  const invalidSimulation = plan.components.some((component) => { const score = whatIfScores[component.id]; return score !== undefined && (score < 0 || score > component.maxScore || component.maxScore <= 0); });
  const simulatedSummary = Object.values(whatIfScores).some((value) => value !== undefined) && !invalidSimulation ? getGradePlanSummary({ ...previewPlan, components: simulatedComponents }) : null;
  const recommendation = summary.targetReached ? t("grades.targetReachedCompact") : !summary.possible ? t("grades.targetImpossibleCompact") : summary.remainingWeight === 0 ? t("grades.finalRecorded") : summary.requiredRawScore !== null && summary.ungradedComponents[0] ? `${summary.ungradedComponents[0].name || t("grades.component")} ${t("grades.exactRequired")} ${formatScore(summary.requiredRawScore)} / ${formatScore(summary.ungradedComponents[0].maxScore)} ${t("grades.points")} (${formatScore(summary.requiredAverage)}%)` : `${t("grades.requiredAverage")} ${formatScore(summary.requiredAverage)}% ${t("grades.remainingScore")}`;
  const neededMetric = summary.targetReached ? t("grades.targetReachedShort") : !summary.possible ? t("grades.targetImpossibleShort") : formatScore(summary.requiredPoints);

  return <div className="page grade-planner-page grade-planner-simplified">
    <PageHeader title={course.name} backHref="/tasks?view=grades" onBack={leave} action={t("common.save")} onAction={save} />
    {saved && <p className="grade-save-toast" role="status"><CircleCheck />{t("grades.planSaved")}</p>}
    {attemptedSave && !validation.isValid && <p className="grade-save-error" role="alert"><CircleAlert />{t("grades.saveBlocked")}</p>}

    <Card className="grade-summary-card grade-summary-compact"><div className="grade-card-heading"><div><h2>{t("grades.summary")}</h2><p>{hasScores ? `${t("grades.gradedWeight")} ${formatScore(summary.gradedWeight, 0)}%` : t("grades.noScoresYet")}</p></div></div><div className="grade-summary-metrics"><div className="primary"><strong>{formatScore(summary.current)}</strong><span>{t("grades.earnedShort")}</span><small>{t("grades.currentScore")}</small></div><div><strong>{formatScore(summary.remainingWeight, 0)}</strong><span>{t("grades.remainingShort")}</span><small>{t("grades.remaining")}</small></div><div className={summary.targetReached ? "success" : !summary.possible ? "warning" : ""}><strong>{neededMetric}</strong><span>{t("grades.neededShort")}</span><small>{summary.targetReached ? t("grades.targetReached") : !summary.possible ? t("grades.targetImpossible") : t("grades.points")}</small></div><div><strong>{plan.targetGrade ?? "—"}</strong><span>{t("grades.targetShort")}</span><small>{formatScore(summary.target)} {t("grades.pointsOrMore")}</small></div></div><div className="grade-progress-wrap"><div className="grade-progress-track" role="progressbar" aria-label={t("grades.currentScore")} aria-valuenow={Math.min(100, Math.max(0, summary.current))} aria-valuemin={0} aria-valuemax={100}><span className="grade-progress-current" style={{ width: `${Math.min(100, Math.max(0, summary.current))}%` }} /><i style={{ left: `${Math.min(100, Math.max(0, summary.target ?? 0))}%` }} aria-label={`${t("grades.target")} ${plan.targetGrade ?? ""}`} /></div><div className="grade-progress-legend"><span>{formatScore(summary.current)} / 100</span><span>▲ {plan.targetGrade ?? "—"} {formatScore(summary.target)}</span></div><p className={`grade-summary-recommendation ${summary.targetReached ? "success" : !summary.possible ? "danger" : ""}`}>{recommendation}</p></div></Card>

    <section className="grade-section grade-components-section"><div className="section-header"><h2>{t("grades.components")}</h2><span>{t("grades.totalWeight")} {formatScore(summary.weight, 0)}%</span></div><Card className="grade-components-card"><div className="grade-component-header" aria-hidden="true"><span>{t("grades.component")}</span><span>{t("grades.weight")}</span><span>{t("grades.maxScore")}</span><span>{t("grades.earnedScore")}</span><span>{t("grades.status")}</span><span>{t("grades.delete")}</span></div>{plan.components.length ? plan.components.map((component) => { const error = componentError(component.id); const isGraded = hasEarnedScore(component); return <div className="grade-component-row" key={component.id}><label><span>{t("grades.componentName")}</span><Input id={`grade-name-${component.id}`} value={component.name} onChange={(event) => changeComponent(component.id, { name: event.target.value })} /></label><label><span>{t("grades.weight")} (%)</span><Input type="number" min="0" max="100" step="0.01" value={component.weight || ""} onChange={(event) => changeComponent(component.id, { weight: inputNumber(event.target.value) })} /></label><label><span>{t("grades.maxScore")}</span><Input type="number" min="0" step="0.01" value={component.maxScore || ""} onChange={(event) => changeComponent(component.id, { maxScore: inputNumber(event.target.value) })} /></label><label><span>{t("grades.earnedScore")}</span><Input type="number" min="0" step="0.01" placeholder="—" value={component.earnedScore ?? ""} onChange={(event) => changeComponent(component.id, { earnedScore: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><span className={`grade-component-status ${isGraded ? "graded" : "waiting"}`}><i />{isGraded ? t("grades.scored") : t("grades.waitingScore")}</span><button className="text-danger-button grade-delete-component" type="button" onClick={() => removeComponent(component)} aria-label={`${t("grades.delete")} ${component.name || t("grades.component")}`}><Trash2 /></button>{(attemptedSave || error) && error && <p className="grade-component-error" role="alert">{error}</p>}</div>; }) : <div className="grade-empty-components"><Calculator /><strong>{t("grades.noComponents")}</strong><p>{t("grades.noComponentsDescription")}</p></div>}<div className={`grade-weight-status ${summary.weight > 100 ? "invalid" : summary.weight === 100 ? "complete" : "warning"}`}><strong>{t("grades.totalWeight")} {formatScore(summary.weight, 0)}%</strong><span>{summary.weight > 100 ? `${t("grades.weightOver")} ${formatScore(summary.weight - 100, 0)}%` : summary.weight === 100 ? t("grades.weightComplete") : `${t("grades.weightRemaining")} ${formatScore(100 - summary.weight, 0)}%`}</span></div><button className="secondary-button grade-add-component" type="button" onClick={addComponent}><Plus />{t("grades.addComponent")}</button></Card></section>

    <section className="grade-section"><div className="section-header"><h2>{t("grades.targetRecommendation")}</h2></div><Card className={`grade-target-card grade-target-compact ${summary.targetReached ? "tone-green" : summary.possible ? "tone-orange" : "tone-red"}`}><Field label={t("grades.targetShort")}><Select value={plan.targetGrade ?? ""} onChange={(event) => changePlan({ ...plan, targetGrade: event.target.value })}>{plan.thresholds.map((threshold) => <option key={threshold.label} value={threshold.label}>{threshold.label}</option>)}</Select></Field><div className="grade-target-copy"><p>{formatScore(summary.target)} {t("grades.pointsOrMore")}</p><h3>{recommendation}</h3>{!summary.targetReached && !summary.possible ? <p>{t("grades.maximumPossible")} <strong>{formatScore(summary.maximumPossible)}</strong></p> : summary.ungradedComponents.length > 1 ? <div className="grade-remaining-list">{summary.ungradedComponents.map((component) => <span key={component.id}>{component.name || t("grades.component")} · {formatScore(component.weight, 0)}%</span>)}</div> : null}</div></Card>{summary.ungradedComponents.length > 0 && <button className="text-button grade-what-if-trigger" type="button" onClick={() => setWhatIfOpen(true)}>{t("grades.whatIf")}</button>}</section>

    <section className="grade-section"><details className="grade-criteria-card"><summary><span>{t("grades.criteria")}</span><ChevronDown /></summary><p>{t("grades.criteriaDefault")}</p><div className="grade-threshold-list">{plan.thresholds.map((threshold, index) => <div key={`${threshold.label}-${index}`}><Field label={t("grades.thresholdLabel")}><Input value={threshold.label} onChange={(event) => changePlan({ ...plan, thresholds: plan.thresholds.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></Field><Field label={t("grades.thresholdMinimum")} error={thresholdError(index)}><Input type="number" min="0" max="100" step="0.01" value={Number.isFinite(threshold.minimumPercent) ? threshold.minimumPercent : ""} onChange={(event) => changePlan({ ...plan, thresholds: plan.thresholds.map((item, itemIndex) => itemIndex === index ? { ...item, minimumPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) } : item) })} /></Field></div>)}</div><p className="grade-criteria-notice">{t("grades.criteriaNotice")}</p></details></section>
    <BottomSheet open={whatIfOpen} title={t("grades.whatIf")} onClose={() => setWhatIfOpen(false)} closeLabel={t("common.close")}><div className="grade-what-if-dialog"><p>{t("grades.whatIfDescription")}</p><div className="grade-what-if-fields">{summary.ungradedComponents.map((component) => <Field key={component.id} label={`${component.name || t("grades.component")} — ${t("grades.ifScore")} / ${formatScore(component.maxScore)}`}><Input type="number" min="0" max={component.maxScore} step="0.01" placeholder="—" value={whatIfScores[component.id] ?? ""} onChange={(event) => setWhatIfScores((current) => ({ ...current, [component.id]: event.target.value === "" ? undefined : Number(event.target.value) }))} />{whatIfScores[component.id] !== undefined && (whatIfScores[component.id]! < 0 || whatIfScores[component.id]! > component.maxScore) && <small className="field-error">{t("grades.componentEarnedMax")}</small>}</Field>)}</div>{simulatedSummary && <div className="grade-simulation-result"><span>{t("grades.simulatedTotal")}</span><strong>{formatScore(simulatedSummary.current)}</strong><b>{simulatedSummary.currentGrade ?? "—"}</b></div>}{Object.values(whatIfScores).some((value) => value !== undefined) && <button className="text-button" type="button" onClick={() => setWhatIfScores({})}>{t("grades.clearSimulation")}</button>}</div></BottomSheet>
  </div>;
}
