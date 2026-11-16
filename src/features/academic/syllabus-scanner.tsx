"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, CircleStop, FileText, LoaderCircle, Pencil, ScanText, ShieldCheck, Trash2, Upload } from "lucide-react";
import { BottomSheet, Input, Select, Textarea } from "@/components/ui";
import { AcademicEndTimeInput } from "@/components/academic-end-time-input";
import { buildSyllabusImportPayload, getScheduleReviewFields, getSyllabusImportReadiness, setAllSyllabusPreviewSelected, updateSyllabusScheduleDraft, validateSyllabusPreview, type SyllabusExamItem, type SyllabusPreview, type SyllabusScheduleItem, type SyllabusTaskItem } from "@/lib/syllabus-import";
import { hasLocalSyllabusFileMagic } from "@/lib/syllabus-local-file";
import { prepareUniversityTimetablePages } from "@/lib/university-timetable-pages";


import { useAppState } from "@/providers/app-state-provider";
import { useUiText } from "@/providers/ui-language";


const MAX_FILE_BYTES = 6 * 1024 * 1024;
const acceptedMime = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const acceptedExtensionsByMime: Record<string, RegExp> = {
  "application/pdf": /\.pdf$/i,
  "image/jpeg": /\.jpe?g$/i,
  "image/png": /\.png$/i,
  "image/webp": /\.webp$/i,
};
const dayLabels = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const examTypeLabels = { quiz: "Quiz", midterm: "Midterm", final: "Final", practical: "ปฏิบัติ", presentation: "นำเสนอ", other: "อื่น ๆ" } as const;

function fileError(file: File) {
  if (!acceptedMime.has(file.type)) return "รองรับเฉพาะ PDF, JPG, JPEG, PNG และ WEBP";
  if (!acceptedExtensionsByMime[file.type]?.test(file.name) || file.name.length > 180 || /[\u0000-\u001f\u007f]/.test(file.name)) return "ชื่อนามสกุลไฟล์ไม่ตรงกับชนิดเอกสารที่รองรับ";
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return "ไฟล์ต้องมีขนาดไม่เกิน 6 MB";
  return null;
}

export function SyllabusScanner() {
  const uiText = useUiText();

  const { schedules, tasks, exams, importSyllabus } = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const analysingLockRef = useRef(false);
  const importingLockRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [supportFiles, setSupportFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<SyllabusPreview | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<string | null>(null);
  const [readerSummary, setReaderSummary] = useState<string | null>(null);
  const [documentDebug, setDocumentDebug] = useState<SyllabusPreview["debug"] | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ schedules: number; tasks: number; exams: number; skipped: number; skippedUnready?: number } | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const reset = () => {
    abortControllerRef.current?.abort();
    setFile(null); setSupportFiles([]);
    setPreview(null);
    setError(null);
    setSuccess(null);
    setReaderSummary(null);
    setDocumentDebug(null);
    setEditingDraftId(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    const issue = fileError(next);
    if (issue) {
      setError(issue);
      return;
    }
    setFile(next);
    setPreview(null);
    setSuccess(null);
    setError(null);
    setDocumentDebug(null);
    setEditingDraftId(null);
  };

  const chooseFiles = (files: File[]) => {
    if (!files.length) return;
    const issue = files.map(fileError).find(Boolean);
    if (issue) { setError(issue); return; }
    if (files.length > 12 || files.reduce((sum,item)=>sum+item.size,0)>24*1024*1024) { setError("เลือกได้ไม่เกิน 12 ไฟล์ รวม 24 MB"); return; }
    chooseFile(files[0]); setSupportFiles(files.slice(1));
  };
  const analyze = async () => {
    if (!file || analysingLockRef.current) return;
    analysingLockRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setAnalysing(true);
    setAnalysisStage("กำลังเตรียมตัวอ่านข้อความ…");
    setError(null);
    setPreview(null);
    setSuccess(null);
    setReaderSummary(null);

    try {
      if (!(await hasLocalSyllabusFileMagic(file))) {
        throw new Error("ไฟล์ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาเลือกไฟล์ต้นฉบับที่ถูกต้อง");
      }
      if (!mountedRef.current || controller.signal.aborted) return;
            const pages = await prepareUniversityTimetablePages([file,...supportFiles],controller.signal,page=>setAnalysisStage(uiText("กำลังเตรียมภาพหน้า {0}",[page])));
      if (!mountedRef.current || controller.signal.aborted) return;
      setAnalysisStage(uiText("AI กำลังอ่านตารางและจับคู่รายวิชา…"));
      const body = new FormData();
      pages.forEach((page,index)=>body.append("pages",page,`page-${index+1}.jpg`));
      body.append("language",uiText.language);
      const response = await fetch("/api/ai/syllabus/analyze",{method:"POST",body,signal:controller.signal});
      const result = await response.json();
      if(!response.ok)throw new Error(result.message||"อ่านตารางไม่สำเร็จ");
      const nextPreview = result.preview as SyllabusPreview;
      if(!nextPreview || !Array.isArray(nextPreview.schedules))throw new Error("ข้อมูลตารางไม่สมบูรณ์ กรุณาลองใหม่");
      if (!mountedRef.current || controller.signal.aborted) return;
      setAnalysisStage(uiText("เสร็จแล้ว"));
      setReaderSummary(uiText("อ่านตารางแล้ว {0} คาบ",[nextPreview.schedules.length]));
setPreview(nextPreview);
    } catch (cause) {
      if (!mountedRef.current) return;
      if (controller.signal.aborted) {
        setError("หยุดการอ่านเอกสารแล้ว คุณสามารถลองใหม่ได้เมื่อพร้อม");
      } else {
        setError(cause instanceof Error && cause.message ? cause.message : "อ่านเอกสารนี้ไม่ได้ โปรดลองอีกครั้ง");
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      analysingLockRef.current = false;
      if (mountedRef.current) {
        setAnalysing(false);
        setAnalysisStage(null);
      }
    }
  };

  const updateSchedule = (draftId: string, update: Partial<Omit<SyllabusScheduleItem, "draftId">>) =>
    setPreview((current) => current ? updateSyllabusScheduleDraft(current, draftId, update) : current);

  const updateTask = (draftId: string, update: Partial<Omit<SyllabusTaskItem, "draftId">>) =>
    setPreview((current) => (current ? { ...current, tasks: current.tasks.map((item) => (item.draftId === draftId ? { ...item, ...update, draftId: item.draftId } : item)) } : current));

  const updateExam = (draftId: string, update: Partial<Omit<SyllabusExamItem, "draftId">>) =>
    setPreview((current) => (current ? { ...current, exams: current.exams.map((item) => (item.draftId === draftId ? { ...item, ...update, draftId: item.draftId } : item)) } : current));

  const importPreview = () => {
    if (!preview || importingLockRef.current || readiness.importableCount === 0) return;
    importingLockRef.current = true;
    setImporting(true);
    setError(null);
    try {
      const payload = buildSyllabusImportPayload(preview, { schedules, tasks, exams });
      if (process.env.NODE_ENV === "development") {
        console.info("[TALEVO Import Payload Diagnostic]", {
          origin: "current-import-payload",
          payloadRecords: payload.schedules.length,
          skippedDuplicates: payload.skippedDuplicates,
          records: payload.schedules.map((s) => ({
            courseCode: s.courseCode ?? null,
            day: s.day,
            time: `${s.startTime}–${s.endTime}`,
            room: s.room,
          })),
        });
      }
      const result = importSyllabus(payload);
      if (process.env.NODE_ENV === "development") {
        console.info("[TALEVO AppState Inserted Diagnostic]", {
          origin: "appstate-inserted-records",
          insertedRecords: result.schedules,
          skippedDuplicates: payload.skippedDuplicates,
        });
      }
      const skippedUnready = Math.max(0, selectedCount - readiness.readyCount);
      setSuccess({ ...result, skipped: payload.skippedDuplicates, skippedUnready });
    } catch {
      setError("เพิ่มตารางเรียนไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      importingLockRef.current = false;
      setImporting(false);
    }
  };

  const isTimetablePreview = preview !== null && preview.documentLayout !== undefined && preview.documentLayout !== "SYLLABUS_TEXT";
  const timetableDayCounts = isTimetablePreview
    ? dayLabels.map((label, day) => ({ label, count: preview!.schedules.filter((item) => item.day === day).length })).filter((item) => item.count > 0)
    : [];
  const hasInferredDayDrafts = isTimetablePreview && (preview?.debug?.courseBlocks ?? 0) > 0 && (preview?.debug?.dayAnchors ?? 0) === 0;
  const readiness = preview ? getSyllabusImportReadiness(preview, { schedules, tasks, exams }) : { readyCount: 0, duplicateCount: 0, importableCount: 0 };
  const selectedCount = preview ? preview.schedules.filter((item) => item.selected).length + preview.tasks.filter((item) => item.selected).length + preview.exams.filter((item) => item.selected).length : 0;
  const unreadyCount = Math.max(0, selectedCount - readiness.readyCount);
  const confidenceCounts = preview ? (["confident", "review", "missing", "conflict"] as const).map((confidence) => ({ confidence, count: preview.schedules.filter((item) => item.confidence === confidence).length })) : [];
  const hasSelectedOverlap = preview ? validateSyllabusPreview(preview).some((warning) => warning.includes("เวลาซ้อนทับ")) : false;
  const step = success ? 4 : preview ? 3 : analysing ? 2 : 1;
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    chooseFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <>
      <button type="button" className="secondary-button schedule-import-button" onClick={() => setOpen(true)}>
        <ScanText /> {uiText("เพิ่มรายวิชาจากเอกสาร")}</button>
      <BottomSheet open={open} title={uiText("นำเข้าตารางเรียนจากเอกสาร")} onClose={close} className="syllabus-import-sheet">
        <div className="syllabus-import">
          <header className="syllabus-import-header">
            <p className="syllabus-intro">{uiText("อ่านตารางเรียน พร้อมจับคู่ชื่อวิชาและสถานที่จากเอกสารประกอบ")}</p>
            <ol className="syllabus-steps" aria-label={uiText("ขั้นตอนการนำเข้า")}>
              <li className={step > 1 ? "complete" : step === 1 ? "active" : ""}>
                <span>1</span>
                <b>{uiText("เอกสาร")}</b>
              </li>
              <li className={step > 2 ? "complete" : step === 2 ? "active" : ""}>
                <span>2</span>
                <b>{uiText("อ่านข้อความ")}</b>
              </li>
              <li className={step > 3 ? "complete" : step === 3 ? "active" : ""}>
                <span>3</span>
                <b>{uiText("ตรวจสอบ")}</b>
              </li>
              <li className={step === 4 ? "complete" : ""}>
                <span>4</span>
                <b>{uiText("เพิ่มข้อมูล")}</b>
              </li>
            </ol>
          </header>
          <div className="syllabus-import-body">
            {!preview && !success && (
              <section className="syllabus-upload-step">
              <div className="syllabus-privacy">
                <ShieldCheck />
                <div>
                  <strong>{uiText("AI อ่านตารางเรียนและหน้าประกอบร่วมกัน")}</strong>
                  <span>{uiText("ส่งเฉพาะหน้าที่เลือกให้ AI อ่าน ตรวจและแก้ไขก่อนยืนยันบันทึก")}</span>
                </div>
              </div>
              <label className="syllabus-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
                <Upload />
                <strong>{file ? file.name : uiText("เลือกภาพตารางเรียนหรือ PDF")}</strong>
                <span>
                  {file
                    ? uiText("{0} KB · {1} · พร้อมให้วิเคราะห์", [Math.ceil(file.size / 1024), file.type.replace("application/", "").replace("image/", "").toUpperCase()])
                    : uiText("ลากไฟล์มาวางที่นี่ หรือกดเลือกเอกสาร · PDF, JPG, JPEG, PNG หรือ WEBP · ไม่เกิน 6 MB")}
                </span>
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  multiple onChange={(event) => chooseFiles(Array.from(event.target.files??[]))}
                />
              </label>
              {file && (
                <div className="syllabus-file-row">
                  <FileText />
                  <span>
                    <b>{file.name}</b>
                    <small>{uiText("{0} ไฟล์ · รวมหน้าตาราง รายชื่อวิชา และรหัสอาคาร",[1+supportFiles.length])}</small>
                  </span>
                  <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>
                    {uiText("เปลี่ยนไฟล์")}</button>
                  <button type="button" className="icon-button" onClick={reset} aria-label={uiText("เอาไฟล์ออก")}>
                    <Trash2 />
                  </button>
                </div>
              )}
              <button
                type="button"
                className="primary-button button-block syllabus-analyze-button"
                disabled={!file}
                onClick={() => (analysing ? abortControllerRef.current?.abort() : void analyze())}
              >
                {analysing ? <CircleStop /> : <ScanText />}
                {analysing ? uiText("หยุด") : uiText("ให้ AI จัดตารางเรียน")}
              </button>
              {analysing && analysisStage && (
                <p className="syllabus-analysis-stage" role="status" aria-live="polite" aria-busy="true">
                  <LoaderCircle className="syllabus-progress-spinner" aria-hidden="true" />
                  {uiText(analysisStage)}
                </p>
              )}
              <p className="syllabus-helper">{uiText("เลือกหน้าตาราง รายชื่อวิชา และรหัสอาคารร่วมกันได้ · AI จะอ่านเฉพาะเอกสารที่เลือก")}</p>
            </section>
          )}
          {error && (
            <p className="form-error syllabus-form-error" role="alert">
              <AlertCircle />
              {uiText(error)}
            </p>
          )}
          {preview && !success && (
            <section className="syllabus-preview-step">
              <header className="syllabus-preview-heading">
                <div>
                  <span className="eyebrow">
                    <ScanText /> LOCAL PREVIEW
                  </span>
                  <h3>{uiText("ตรวจทานก่อนเพิ่มลงตารางของคุณ")}</h3>
                  <p>{uiText("เลือกเฉพาะรายการที่แน่ใจได้ คุณแก้ไขข้อมูลทั้งหมดก่อนกดเพิ่ม")}</p>
                  {readerSummary && <p className="syllabus-reader-summary"><CheckCircle2 /> {uiText(readerSummary)}</p>}
                  {process.env.NODE_ENV === "development" && documentDebug && <p className="syllabus-debug" aria-label={uiText("ข้อมูลตรวจสอบ timetable")}>Document type: {preview.documentLayout ?? "SYLLABUS_TEXT"} · OCR blocks: {documentDebug.ocrBlocks} · Day anchors: {documentDebug.dayAnchors} · Course blocks: {documentDebug.courseBlocks} · Parsed schedules: {documentDebug.parsedSchedules}</p>}
                </div>
                <button type="button" className="secondary-button" onClick={reset}>
                  {uiText("เลือกไฟล์ใหม่")}</button>
              </header>
              {isTimetablePreview && (
                <section className="syllabus-timetable-summary" aria-label={uiText("สรุปตารางเรียนที่ตรวจพบ")}>
                  <strong>{uiText("พบตารางเรียน")}{preview.schedules.length} {uiText("รายการ")}</strong>
                  <span>{timetableDayCounts.map((item) => `${item.label} ${item.count}`).join(" · ")}</span>
                </section>
              )}
              {hasInferredDayDrafts && (
                <section className="syllabus-structure-notice" role="status">
                  <AlertCircle aria-hidden="true" />
                  <div>
                    <strong>{uiText("พบโครงสร้างตาราง แต่ยังมีบางรายการต้องตรวจสอบ")}</strong>
                    <span>{uiText("ระบบอ่านคอลัมน์วันได้ไม่ครบ จึงอนุมานวันจากตำแหน่งแถว รายการเหล่านี้ยังไม่ถูกเลือกนำเข้าและสามารถแก้วัน เวลา ห้อง Section และหน่วยกิตได้")}</span>
                  </div>
                </section>
              )}
              {!isTimetablePreview && <div className="syllabus-course-card">
                <div>
                  <span>{uiText("วิชา")}</span>
                  <Input
                    aria-label={uiText("ชื่อวิชา")}
                    value={preview.course.courseName ?? ""}
                    placeholder={uiText("ชื่อวิชา *")}
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, courseName: event.target.value } })}
                  />
                </div>
                <div>
                  <span>{uiText("รหัสวิชา")}</span>
                  <Input
                    aria-label={uiText("รหัสวิชา")}
                    value={preview.course.courseCode ?? ""}
                    placeholder={uiText("เช่น TLE101")}
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, courseCode: event.target.value } })}
                  />
                </div>
                <div>
                  <span>{uiText("ผู้สอน")}</span>
                  <Input
                    aria-label={uiText("ผู้สอน")}
                    value={preview.course.instructor ?? ""}
                    placeholder={uiText("ไม่ระบุ")}
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, instructor: event.target.value } })}
                  />
                </div>
                <div>
                  <span>{uiText("ห้องหลัก")}</span>
                  <Input
                    aria-label={uiText("ห้องเรียนหลัก")}
                    value={preview.course.room ?? ""}
                    placeholder={uiText("ไม่ระบุ")}
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, room: event.target.value } })}
                  />
                </div>
              </div>}
              {preview.warnings.length > 0 && (
                <div className="syllabus-warning">
                  <AlertCircle />
                  <div>
                    <strong>{uiText("มีข้อมูลที่ควรตรวจสอบ")}</strong>
                    {preview.warnings.slice(0, 4).map((warning) => (
                      <span key={uiText(warning)}>{uiText(warning)}</span>
                    ))}
                  </div>
                </div>
              )}
              <section className="syllabus-preview-stats" aria-label={uiText("สถานะรายการที่อ่านได้")}>
                {confidenceCounts.map(({ confidence, count }) => <span key={confidence}>{uiText(confidenceLabel(confidence))} <strong>{count}</strong></span>)}
                <span>{uiText("ต้องตรวจสอบ")}<strong>{preview.schedules.reduce((sum,item)=>sum+getScheduleReviewFields(item).length,0)}</strong></span><span>{uiText("รายการซ้ำ")}<strong>{readiness.duplicateCount}</strong></span>
                <span>{uiText("เวลาซ้อนทับ")}<strong>{hasSelectedOverlap ? 1 : 0}</strong></span>
              </section>
              {preview.schedules.length + preview.tasks.length + preview.exams.length > 0 && (
                <div className="syllabus-bulk-actions">
                  <button type="button" className="text-button" onClick={() => setPreview(setAllSyllabusPreviewSelected(preview, true))}>{uiText("เลือกทั้งหมด")}</button>
                  <button type="button" className="text-button" onClick={() => setPreview(setAllSyllabusPreviewSelected(preview, false))}>{uiText("ยกเลิกทั้งหมด")}</button>
                </div>
              )}
              <PreviewSection title={uiText("ตารางเรียน")} count={preview.schedules.length}>
                {preview.schedules.length === 0 ? (
                  <p className="syllabus-empty">{uiText("ไม่พบตารางเรียนที่ระบุชัดเจน")}</p>
                ) : (
                  preview.schedules.map((item) => {
                    const expanded = editingDraftId === item.draftId;
                    const reviewFields = getScheduleReviewFields(item);
                    const identity = item.courseCode || item.courseName || uiText("รายการที่ยังไม่ทราบวิชา");
                    return <article key={item.draftId} className={`syllabus-schedule-card ${expanded ? "is-editing" : ""} ${reviewFields.length ? "needs-review" : "is-ready"}`}>
                      <header>
                        <input type="checkbox" aria-label={uiText("เลือกรายการ {0}", [identity])} checked={item.selected} onChange={(event) => updateSchedule(item.draftId, { selected: event.target.checked })} />
                        <button type="button" className="syllabus-schedule-summary" aria-expanded={expanded} onClick={() => setEditingDraftId(expanded ? null : item.draftId)}>
                          <span className={`syllabus-confidence is-${reviewFields.length?"review":"confident"}`}>{reviewFields.length?uiText("ต้องตรวจ {0} จุด",[reviewFields.length]):uiText("พร้อมบันทึก")}</span>
                          <strong>{identity}</strong>
                          <span>{item.day === null ? uiText("ยังไม่ระบุวัน") : uiText(dayLabels[item.day])} · {item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : uiText("ยังไม่ระบุเวลา")}</span>
                          <small>{item.room || uiText("ยังไม่ระบุห้อง")}{item.section ? ` · Section ${item.section}` : ""}</small>
                        </button>
                        <button type="button" className="icon-button syllabus-edit-toggle" aria-label={`${expanded ? uiText("ย่อ") : uiText("แก้ไข")} ${identity}`} onClick={() => setEditingDraftId(expanded ? null : item.draftId)}>{expanded ? <ChevronDown /> : <Pencil />}</button>
                      </header>
                      {expanded && <div className="syllabus-schedule-fields">
                        {isTimetablePreview && <FieldLabel text={uiText("ชื่อวิชา")} review={reviewFields.includes("courseName")} reviewed={item.reviewedFields?.includes("courseName")}><Input value={item.courseName ?? ""} placeholder={uiText("ชื่อวิชาตามเอกสาร")} onChange={(event) => updateSchedule(item.draftId, { courseName: event.target.value })} /></FieldLabel>}
                        {isTimetablePreview && <FieldLabel text={uiText("รหัสวิชา")} review={reviewFields.includes("courseCode")} reviewed={item.reviewedFields?.includes("courseCode")}><Input inputMode="numeric" value={item.courseCode ?? ""} placeholder={uiText("รหัสวิชาตามเอกสาร")} onChange={(event) => updateSchedule(item.draftId, { courseCode: event.target.value || null })} /></FieldLabel>}
                        <FieldLabel text={uiText("วันเรียน")} review={reviewFields.includes("day")} reviewed={item.reviewedFields?.includes("day")}><Select value={item.day ?? ""} onChange={(event) => updateSchedule(item.draftId, { day: event.target.value === "" ? null : Number(event.target.value) })}><option value="">{uiText("ยังไม่ระบุ")}</option>{dayLabels.map((day, index) => <option key={uiText(day)} value={index}>{uiText(day)}</option>)}</Select></FieldLabel>
                        <FieldLabel text={uiText("เวลาเริ่ม")} review={reviewFields.includes("startTime")} reviewed={item.reviewedFields?.includes("startTime")}><Input type="time" value={item.startTime ?? ""} onChange={(event) => updateSchedule(item.draftId, { startTime: event.target.value || null })} /></FieldLabel>
                        <div className={`syllabus-field ${reviewFields.includes("endTime")?"has-review":item.reviewedFields?.includes("endTime")?"is-verified":""}`}><span>{uiText("เวลาสิ้นสุด")}</span><AcademicEndTimeInput ariaLabel={uiText("เวลาสิ้นสุด")} value={item.endTime ?? ""} onChange={(endTime) => updateSchedule(item.draftId, { endTime: endTime || null })} /></div>
                        <FieldLabel text={uiText("ห้องเรียน")} review={reviewFields.includes("room")} reviewed={item.reviewedFields?.includes("room")}><Input value={item.room ?? ""} onChange={(event) => updateSchedule(item.draftId, { room: event.target.value || null })} /></FieldLabel>
                        {isTimetablePreview && <FieldLabel text={uiText("หน่วยกิต")} review={reviewFields.includes("credits")} reviewed={item.reviewedFields?.includes("credits")}><Input type="number" min="0" value={item.credits ?? ""} onChange={(event) => updateSchedule(item.draftId, { credits: event.target.value === "" ? null : Number(event.target.value) })} /></FieldLabel>}
                        {isTimetablePreview && <FieldLabel text="Section" review={reviewFields.includes("section")} reviewed={item.reviewedFields?.includes("section")}><Input value={item.section ?? ""} onChange={(event) => updateSchedule(item.draftId, { section: event.target.value || null })} /></FieldLabel>}
                        <FieldLabel text={uiText("ผู้สอน")}><Input value={item.teacher ?? ""} onChange={(event) => updateSchedule(item.draftId, { teacher: event.target.value || null })} /></FieldLabel>
                        <button type="button" className="secondary-button syllabus-confirm-fields" onClick={()=>updateSchedule(item.draftId,{courseCode:item.courseCode,courseName:item.courseName,day:item.day,startTime:item.startTime,endTime:item.endTime,room:item.room,credits:item.credits,section:item.section})}>{uiText("ยืนยันค่าที่ตรวจแล้ว")}</button>
                        {item.extraLabel && <p className="syllabus-building">{item.extraLabel}</p>}
                        {item.evidence?.length ? <details className="syllabus-evidence"><summary>{uiText("ดูหลักฐานจากเอกสาร")}</summary>{item.evidence.map((line, index) => <p key={`${item.draftId}-evidence-${index}`}>{line}</p>)}</details> : null}
                      </div>}
                    </article>;
                  })
                )}
              </PreviewSection>
              {preview.tasks.length>0&&(<PreviewSection title={uiText("งานและกำหนดส่ง")} count={preview.tasks.length}>
                {preview.tasks.length === 0 ? (
                  <p className="syllabus-empty">{uiText("ไม่พบงานที่มีวันส่งชัดเจน")}</p>
                ) : (
                  preview.tasks.map((item) => (
                    <label key={item.draftId} className="syllabus-row syllabus-row-tall">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => updateTask(item.draftId, { selected: event.target.checked })}
                      />
                      <div>
                        <span>{uiText(confidenceLabel(item.confidence))}</span>
                        <Input
                          aria-label={uiText("ชื่องาน")}
                          value={item.title}
                          placeholder={uiText("ชื่องาน")}
                          onChange={(event) => updateTask(item.draftId, { title: event.target.value })}
                        />
                        <Input
                          aria-label={uiText("วันส่ง")}
                          type="date"
                          value={item.dueDate ?? ""}
                          onChange={(event) => updateTask(item.draftId, { dueDate: event.target.value || null })}
                        />
                        <Input
                          aria-label={uiText("เวลาส่ง")}
                          type="time"
                          value={item.dueTime ?? ""}
                          onChange={(event) => updateTask(item.draftId, { dueTime: event.target.value || null })}
                        />
                        <Textarea
                          aria-label={uiText("รายละเอียดงาน")}
                          value={item.description ?? ""}
                          placeholder={uiText("รายละเอียดเพิ่มเติม")}
                          onChange={(event) => updateTask(item.draftId, { description: event.target.value || null })}
                        />
                      </div>
                    </label>
                  ))
                )}
              </PreviewSection>)}
              {preview.exams.length>0&&(<PreviewSection title={uiText("การสอบ")} count={preview.exams.length}>
                {preview.exams.length === 0 ? (
                  <p className="syllabus-empty">{uiText("ไม่พบการสอบที่มีวันและเวลาเริ่มชัดเจน")}</p>
                ) : (
                  preview.exams.map((item) => (
                    <label key={item.draftId} className="syllabus-row syllabus-row-tall">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => updateExam(item.draftId, { selected: event.target.checked })}
                      />
                      <div>
                        <span>{uiText(confidenceLabel(item.confidence))}</span>
                        <Input
                          aria-label={uiText("ชื่อการสอบ")}
                          value={item.title}
                          placeholder={uiText("ชื่อการสอบ")}
                          onChange={(event) => updateExam(item.draftId, { title: event.target.value })}
                        />
                        <Select
                          aria-label={uiText("ประเภทการสอบ")}
                          value={item.type}
                          onChange={(event) => updateExam(item.draftId, { type: event.target.value as SyllabusExamItem["type"] })}
                        >
                          {Object.entries(examTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {uiText(label)}
                            </option>
                          ))}
                        </Select>
                        <Input
                          aria-label={uiText("วันสอบ")}
                          type="date"
                          value={item.date ?? ""}
                          onChange={(event) => updateExam(item.draftId, { date: event.target.value || null })}
                        />
                        <Input
                          aria-label={uiText("เวลาเริ่มสอบ")}
                          type="time"
                          value={item.startTime ?? ""}
                          onChange={(event) => updateExam(item.draftId, { startTime: event.target.value || null })}
                        />
                        <Input
                          aria-label={uiText("เวลาสิ้นสุดสอบ")}
                          type="time"
                          value={item.endTime ?? ""}
                          onChange={(event) => updateExam(item.draftId, { endTime: event.target.value || null })}
                        />
                        <Input
                          aria-label={uiText("ห้องสอบ")}
                          value={item.room ?? ""}
                          placeholder={uiText("ห้องสอบ")}
                          onChange={(event) => updateExam(item.draftId, { room: event.target.value || null })}
                        />
                      </div>
                    </label>
                  ))
                )}
              </PreviewSection>)}
            </section>
          )}
          {success && (
            <section className="syllabus-success" aria-live="polite">
              <CheckCircle2 />
              <h3>{uiText("เพิ่มรายวิชาเข้าตารางแล้ว")}</h3>
              <p>
                {success.schedules > 0 && success.tasks === 0 && success.exams === 0
                  ? uiText("เพิ่มตารางเรียนแล้ว {0} รายการ", [success.schedules])
                  : uiText("เพิ่มตารางเรียน {0} รายการ · งาน {1} รายการ · การสอบ {2} รายการ", [success.schedules, success.tasks, success.exams])}
                {success.skippedUnready ? uiText(" · ข้าม {0} รายการที่ต้องตรวจสอบ", [success.skippedUnready]) : ""}
                {success.skipped ? uiText(" · ข้ามรายการซ้ำ {0} รายการ", [success.skipped]) : ""}
              </p>
              <div>
                <Link className="secondary-button" href="/schedule">
                  {uiText("ดูตารางเรียน")}</Link>
                <Link className="secondary-button" href="/tasks">
                  {uiText("ดูงาน")}</Link>
                <button type="button" className="primary-button" onClick={close}>
                  {uiText("เสร็จสิ้น")}<ChevronRight />
                </button>
              </div>
            </section>
          )}
          </div>
          {preview && !success && (
            <footer className="syllabus-import-action">
              <div>
                <strong>{readiness.importableCount === 0 ? uiText("ยังไม่มีรายการที่พร้อมเพิ่ม") : uiText("พร้อมเพิ่ม {0} รายการ", [readiness.importableCount])}</strong>
                <span>
                  {unreadyCount > 0
                    ? uiText("จะเพิ่ม {0} รายการ และข้าม {1} รายการที่ยังไม่พร้อม{2}", [readiness.importableCount, unreadyCount, readiness.duplicateCount > 0 ? ` (ซ้ำ ${readiness.duplicateCount})` : ""])
                    : uiText("เลือกแล้วและข้อมูลครบ {0}{1}", [readiness.readyCount, readiness.duplicateCount > 0 ? ` · ซ้ำ ${readiness.duplicateCount}` : ""])}
                </span>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={readiness.importableCount === 0 || importing}
                onClick={importPreview}
              >
                {importing ? <LoaderCircle className="spin" /> : <CheckCircle2 />}
                {readiness.importableCount === 0 ? uiText("ยังไม่มีรายการที่พร้อมเพิ่ม") : (importing ? uiText("กำลังเพิ่ม…") : uiText("ยืนยันและเพิ่ม {0} รายการ", [readiness.importableCount]))}
              </button>
            </footer>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

function PreviewSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const uiText = useUiText();

  return (
    <section className="syllabus-preview-section">
      <header>
        <h4>{uiText(title)}</h4>
        <span>{count} {uiText("รายการ")}</span>
      </header>
      {children}
    </section>
  );
}

function FieldLabel({ text, children, review, reviewed }: { text: string; children: ReactNode; review?: boolean; reviewed?: boolean }) {
  const uiText = useUiText();

  return <label className={`syllabus-field ${review?"has-review":reviewed?"is-verified":""}`}><span>{uiText(text)}{review&&<small className="syllabus-field-state"> · {uiText("ต้องตรวจสอบ")}</small>}{!review&&reviewed&&<small className="syllabus-field-state"> · {uiText("ตรวจแล้ว")}</small>}</span>{children}</label>;
}

function confidenceLabel(value: "confident" | "review" | "conflict" | "missing") {
  return value === "confident" ? "ตรวจพบชัดเจน" : value === "review" ? "ควรตรวจทาน" : value === "conflict" ? "ข้อมูลขัดแย้ง" : "ข้อมูลไม่ครบ";
}
