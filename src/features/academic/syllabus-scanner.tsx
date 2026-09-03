"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, CircleStop, FileText, LoaderCircle, Pencil, ScanText, ShieldCheck, Trash2, Upload } from "lucide-react";
import { BottomSheet, Input, Select, Textarea } from "@/components/ui";
import { AcademicEndTimeInput } from "@/components/academic-end-time-input";
import { buildSyllabusImportPayload, getSyllabusImportReadiness, setAllSyllabusPreviewSelected, updateSyllabusScheduleDraft, validateSyllabusPreview, type SyllabusExamItem, type SyllabusPreview, type SyllabusScheduleItem, type SyllabusTaskItem } from "@/lib/syllabus-import";
import { hasLocalSyllabusFileMagic } from "@/lib/syllabus-local-file";
import { parseLocalSyllabus } from "@/lib/syllabus-parser";
import { extractDocumentPages } from "@/lib/syllabus-scanner";
import { detectDocumentLayout, parseTimetableDocument } from "@/lib/timetable-parser";
import { useAppState } from "@/providers/app-state-provider";

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
  const { schedules, tasks, exams, importSyllabus } = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const analysingLockRef = useRef(false);
  const importingLockRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
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
    setFile(null);
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
      const pages = await extractDocumentPages(file, {
        signal: controller.signal,
        onProgress: ({ stage, percent }) => {
          if (mountedRef.current && !controller.signal.aborted) {
            setAnalysisStage(
              stage === "prepare"
                ? "กำลังเตรียมตัวอ่านข้อความ…"
                : percent === undefined
                  ? "กำลังอ่านข้อความ…"
                  : `กำลังอ่านข้อความ… ${percent}%`
            );
          }
        },
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      setAnalysisStage("กำลังจัดข้อมูล…");
      const documentText = pages.map((page) => page.text).join("\n");
      const spatialLines = pages.flatMap((page) => (page.ocrLines ?? []).map((line) => ({ ...line, page: page.page })));
      const layout = detectDocumentLayout(documentText, spatialLines);
      const isSpatialTimetable = layout.layout !== "SYLLABUS_TEXT";
      const nextPreview = isSpatialTimetable ? parseTimetableDocument(spatialLines, documentText) : parseLocalSyllabus(documentText);
      if (!nextPreview || (!nextPreview.schedules.length && !nextPreview.tasks.length && !nextPreview.exams.length)) {
        if (!isSpatialTimetable) throw new Error("ยังไม่พบข้อมูลตารางเรียน งาน หรือการสอบในเอกสารนี้ คุณสามารถลองใช้ภาพที่ชัดขึ้น หรือกรอกข้อมูลเองได้");
      }
      setAnalysisStage("เสร็จแล้ว");
      if (process.env.NODE_ENV === "development") {
        setDocumentDebug(nextPreview.debug ?? null);
        console.info("[TALEVO Timetable Diagnostic]", {
          origin: "current-scanner-output",
          parserRecords: nextPreview.schedules.length,
          previewRecords: nextPreview.schedules.length,
          courseCandidates: nextPreview.debug?.courseBlocks ?? 0,
          physicalCells: nextPreview.debug?.candidateCells ?? 0,
          droppedCells: Math.max(0, (nextPreview.debug?.candidateCells ?? 0) - nextPreview.schedules.length),
          records: nextPreview.schedules.map((s) => ({
            courseCode: s.courseCode ?? null,
            day: s.day,
            time: `${s.startTime ?? ""}–${s.endTime ?? ""}`,
            room: s.room ?? null,
          })),
        });
      }
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
    chooseFile(event.dataTransfer.files[0]);
  };

  return (
    <>
      <button type="button" className="secondary-button schedule-import-button" onClick={() => setOpen(true)}>
        <ScanText /> เพิ่มรายวิชาจากเอกสาร
      </button>
      <BottomSheet open={open} title="นำเข้าตารางเรียนจากเอกสาร" onClose={close} className="syllabus-import-sheet">
        <div className="syllabus-import">
          <header className="syllabus-import-header">
            <p className="syllabus-intro">อ่านข้อความจาก Course Syllabus บนอุปกรณ์นี้เพื่อสร้างตารางเรียน งาน และการสอบให้คุณ</p>
            <ol className="syllabus-steps" aria-label="ขั้นตอนการนำเข้า">
              <li className={step > 1 ? "complete" : step === 1 ? "active" : ""}>
                <span>1</span>
                <b>เอกสาร</b>
              </li>
              <li className={step > 2 ? "complete" : step === 2 ? "active" : ""}>
                <span>2</span>
                <b>อ่านข้อความ</b>
              </li>
              <li className={step > 3 ? "complete" : step === 3 ? "active" : ""}>
                <span>3</span>
                <b>ตรวจสอบ</b>
              </li>
              <li className={step === 4 ? "complete" : ""}>
                <span>4</span>
                <b>เพิ่มข้อมูล</b>
              </li>
            </ol>
          </header>
          <div className="syllabus-import-body">
            {!preview && !success && (
              <section className="syllabus-upload-step">
              <div className="syllabus-privacy">
                <ShieldCheck />
                <div>
                  <strong>TALEVO จะอ่านข้อความจากเอกสารบนอุปกรณ์นี้</strong>
                  <span>ไฟล์ต้นฉบับจะไม่ถูกอัปโหลดไปยัง Gemini หรือ Cloud และจะไม่เพิ่มข้อมูลลงในบัญชีจนกว่าคุณจะตรวจสอบและยืนยัน</span>
                </div>
              </div>
              <label className="syllabus-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
                <Upload />
                <strong>{file ? file.name : "อัปโหลด Course Syllabus ของคุณ"}</strong>
                <span>
                  {file
                    ? `${Math.ceil(file.size / 1024)} KB · ${file.type.replace("application/", "").replace("image/", "").toUpperCase()} · พร้อมให้วิเคราะห์`
                    : "ลากไฟล์มาวางที่นี่ หรือกดเลือกเอกสาร · PDF, JPG, JPEG, PNG หรือ WEBP · ไม่เกิน 6 MB"}
                </span>
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
              </label>
              {file && (
                <div className="syllabus-file-row">
                  <FileText />
                  <span>
                    <b>{file.name}</b>
                    <small>ไฟล์นี้อยู่ในเบราว์เซอร์ของคุณชั่วคราว</small>
                  </span>
                  <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>
                    เปลี่ยนไฟล์
                  </button>
                  <button type="button" className="icon-button" onClick={reset} aria-label="เอาไฟล์ออก">
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
                {analysing ? "หยุด" : "อ่านข้อความจากเอกสาร"}
              </button>
              {analysisStage && (
                <p className="syllabus-analysis-stage" role="status">
                  <LoaderCircle className="spin" />
                  {analysisStage}
                </p>
              )}
              <p className="syllabus-helper">PDF ที่มีข้อความจะอ่านจาก text layer ในเครื่องก่อน ส่วนรูปภาพและ PDF scan ใช้ OCR ในเบราว์เซอร์ หากยังไม่มีชุดภาษา OCR อาจมีการดาวน์โหลดชุดภาษาแบบเปิด แต่ไฟล์เอกสารจะไม่ถูกส่งออก</p>
            </section>
          )}
          {error && (
            <p className="form-error syllabus-form-error" role="alert">
              <AlertCircle />
              {error}
            </p>
          )}
          {preview && !success && (
            <section className="syllabus-preview-step">
              <header className="syllabus-preview-heading">
                <div>
                  <span className="eyebrow">
                    <ScanText /> LOCAL PREVIEW
                  </span>
                  <h3>ตรวจทานก่อนเพิ่มลงตารางของคุณ</h3>
                  <p>เลือกเฉพาะรายการที่แน่ใจได้ คุณแก้ไขข้อมูลทั้งหมดก่อนกดเพิ่ม</p>
                  {readerSummary && <p className="syllabus-reader-summary"><CheckCircle2 /> {readerSummary}</p>}
                  {process.env.NODE_ENV === "development" && documentDebug && <p className="syllabus-debug" aria-label="ข้อมูลตรวจสอบ timetable">Document type: {preview.documentLayout ?? "SYLLABUS_TEXT"} · OCR blocks: {documentDebug.ocrBlocks} · Day anchors: {documentDebug.dayAnchors} · Course blocks: {documentDebug.courseBlocks} · Parsed schedules: {documentDebug.parsedSchedules}</p>}
                </div>
                <button type="button" className="secondary-button" onClick={reset}>
                  เลือกไฟล์ใหม่
                </button>
              </header>
              {isTimetablePreview && (
                <section className="syllabus-timetable-summary" aria-label="สรุปตารางเรียนที่ตรวจพบ">
                  <strong>พบตารางเรียน {preview.schedules.length} รายการ</strong>
                  <span>{timetableDayCounts.map((item) => `${item.label} ${item.count}`).join(" · ")}</span>
                </section>
              )}
              {hasInferredDayDrafts && (
                <section className="syllabus-structure-notice" role="status">
                  <AlertCircle aria-hidden="true" />
                  <div>
                    <strong>พบโครงสร้างตาราง แต่ยังมีบางรายการต้องตรวจสอบ</strong>
                    <span>ระบบอ่านคอลัมน์วันได้ไม่ครบ จึงอนุมานวันจากตำแหน่งแถว รายการเหล่านี้ยังไม่ถูกเลือกนำเข้าและสามารถแก้วัน เวลา ห้อง Section และหน่วยกิตได้</span>
                  </div>
                </section>
              )}
              {!isTimetablePreview && <div className="syllabus-course-card">
                <div>
                  <span>วิชา</span>
                  <Input
                    aria-label="ชื่อวิชา"
                    value={preview.course.courseName ?? ""}
                    placeholder="ชื่อวิชา *"
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, courseName: event.target.value } })}
                  />
                </div>
                <div>
                  <span>รหัสวิชา</span>
                  <Input
                    aria-label="รหัสวิชา"
                    value={preview.course.courseCode ?? ""}
                    placeholder="เช่น TLE101"
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, courseCode: event.target.value } })}
                  />
                </div>
                <div>
                  <span>ผู้สอน</span>
                  <Input
                    aria-label="ผู้สอน"
                    value={preview.course.instructor ?? ""}
                    placeholder="ไม่ระบุ"
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, instructor: event.target.value } })}
                  />
                </div>
                <div>
                  <span>ห้องหลัก</span>
                  <Input
                    aria-label="ห้องเรียนหลัก"
                    value={preview.course.room ?? ""}
                    placeholder="ไม่ระบุ"
                    onChange={(event) => setPreview({ ...preview, course: { ...preview.course, room: event.target.value } })}
                  />
                </div>
              </div>}
              {preview.warnings.length > 0 && (
                <div className="syllabus-warning">
                  <AlertCircle />
                  <div>
                    <strong>มีข้อมูลที่ควรตรวจสอบ</strong>
                    {preview.warnings.slice(0, 4).map((warning) => (
                      <span key={warning}>{warning}</span>
                    ))}
                  </div>
                </div>
              )}
              <section className="syllabus-preview-stats" aria-label="สถานะรายการที่อ่านได้">
                {confidenceCounts.map(({ confidence, count }) => <span key={confidence}>{confidenceLabel(confidence)} <strong>{count}</strong></span>)}
                <span>รายการซ้ำ <strong>{readiness.duplicateCount}</strong></span>
                <span>เวลาซ้อนทับ <strong>{hasSelectedOverlap ? 1 : 0}</strong></span>
              </section>
              {preview.schedules.length + preview.tasks.length + preview.exams.length > 0 && (
                <div className="syllabus-bulk-actions">
                  <button type="button" className="text-button" onClick={() => setPreview(setAllSyllabusPreviewSelected(preview, true))}>เลือกทั้งหมด</button>
                  <button type="button" className="text-button" onClick={() => setPreview(setAllSyllabusPreviewSelected(preview, false))}>ยกเลิกทั้งหมด</button>
                </div>
              )}
              <PreviewSection title="ตารางเรียน" count={preview.schedules.length}>
                {preview.schedules.length === 0 ? (
                  <p className="syllabus-empty">ไม่พบตารางเรียนที่ระบุชัดเจน</p>
                ) : (
                  preview.schedules.map((item) => {
                    const expanded = editingDraftId === item.draftId;
                    const identity = item.courseCode || item.courseName || "รายการที่ยังไม่ทราบวิชา";
                    return <article key={item.draftId} className={`syllabus-schedule-card ${expanded ? "is-editing" : ""}`}>
                      <header>
                        <input type="checkbox" aria-label={`เลือกรายการ ${identity}`} checked={item.selected} onChange={(event) => updateSchedule(item.draftId, { selected: event.target.checked })} />
                        <button type="button" className="syllabus-schedule-summary" aria-expanded={expanded} onClick={() => setEditingDraftId(expanded ? null : item.draftId)}>
                          <span className={`syllabus-confidence is-${item.confidence}`}>{confidenceLabel(item.confidence)}</span>
                          <strong>{identity}</strong>
                          <span>{item.day === null ? "ยังไม่ระบุวัน" : dayLabels[item.day]} · {item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : "ยังไม่ระบุเวลา"}</span>
                          <small>{item.room || "ยังไม่ระบุห้อง"}{item.section ? ` · Section ${item.section}` : ""}</small>
                        </button>
                        <button type="button" className="icon-button syllabus-edit-toggle" aria-label={`${expanded ? "ย่อ" : "แก้ไข"} ${identity}`} onClick={() => setEditingDraftId(expanded ? null : item.draftId)}>{expanded ? <ChevronDown /> : <Pencil />}</button>
                      </header>
                      {expanded && <div className="syllabus-schedule-fields">
                        {isTimetablePreview && <FieldLabel text="ชื่อวิชา"><Input value={item.courseName ?? (item.courseCode ?? "")} placeholder="ชื่อวิชา เช่น นวัตกรรมทางเทคโนโลยี" onChange={(event) => updateSchedule(item.draftId, { courseName: event.target.value })} /></FieldLabel>}
                        {isTimetablePreview && <FieldLabel text="รหัสวิชา"><Input inputMode="numeric" value={item.courseCode ?? ""} placeholder="รหัสวิชา เช่น 0537212" onChange={(event) => updateSchedule(item.draftId, { courseCode: event.target.value || null })} /></FieldLabel>}
                        <FieldLabel text="วันเรียน"><Select value={item.day ?? ""} onChange={(event) => updateSchedule(item.draftId, { day: event.target.value === "" ? null : Number(event.target.value) })}><option value="">ยังไม่ระบุ</option>{dayLabels.map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></FieldLabel>
                        <FieldLabel text="เวลาเริ่ม"><Input type="time" value={item.startTime ?? ""} onChange={(event) => updateSchedule(item.draftId, { startTime: event.target.value || null })} /></FieldLabel>
                        <div className="syllabus-field"><span>เวลาสิ้นสุด</span><AcademicEndTimeInput ariaLabel="เวลาสิ้นสุด" value={item.endTime ?? ""} onChange={(endTime) => updateSchedule(item.draftId, { endTime: endTime || null })} /></div>
                        <FieldLabel text="ห้องเรียน"><Input value={item.room ?? ""} onChange={(event) => updateSchedule(item.draftId, { room: event.target.value || null })} /></FieldLabel>
                        {isTimetablePreview && <FieldLabel text="หน่วยกิต"><Input type="number" min="0" value={item.credits ?? ""} onChange={(event) => updateSchedule(item.draftId, { credits: event.target.value === "" ? null : Number(event.target.value) })} /></FieldLabel>}
                        {isTimetablePreview && <FieldLabel text="Section"><Input value={item.section ?? ""} onChange={(event) => updateSchedule(item.draftId, { section: event.target.value || null })} /></FieldLabel>}
                        <FieldLabel text="ผู้สอน"><Input value={item.teacher ?? ""} onChange={(event) => updateSchedule(item.draftId, { teacher: event.target.value || null })} /></FieldLabel>
                        {item.evidence?.length ? <details className="syllabus-evidence"><summary>ดูหลักฐาน OCR</summary>{item.evidence.map((line, index) => <p key={`${item.draftId}-evidence-${index}`}>{line}</p>)}</details> : null}
                      </div>}
                    </article>;
                  })
                )}
              </PreviewSection>
              <PreviewSection title="งานและกำหนดส่ง" count={preview.tasks.length}>
                {preview.tasks.length === 0 ? (
                  <p className="syllabus-empty">ไม่พบงานที่มีวันส่งชัดเจน</p>
                ) : (
                  preview.tasks.map((item) => (
                    <label key={item.draftId} className="syllabus-row syllabus-row-tall">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => updateTask(item.draftId, { selected: event.target.checked })}
                      />
                      <div>
                        <span>{confidenceLabel(item.confidence)}</span>
                        <Input
                          aria-label="ชื่องาน"
                          value={item.title}
                          placeholder="ชื่องาน"
                          onChange={(event) => updateTask(item.draftId, { title: event.target.value })}
                        />
                        <Input
                          aria-label="วันส่ง"
                          type="date"
                          value={item.dueDate ?? ""}
                          onChange={(event) => updateTask(item.draftId, { dueDate: event.target.value || null })}
                        />
                        <Input
                          aria-label="เวลาส่ง"
                          type="time"
                          value={item.dueTime ?? ""}
                          onChange={(event) => updateTask(item.draftId, { dueTime: event.target.value || null })}
                        />
                        <Textarea
                          aria-label="รายละเอียดงาน"
                          value={item.description ?? ""}
                          placeholder="รายละเอียดเพิ่มเติม"
                          onChange={(event) => updateTask(item.draftId, { description: event.target.value || null })}
                        />
                      </div>
                    </label>
                  ))
                )}
              </PreviewSection>
              <PreviewSection title="การสอบ" count={preview.exams.length}>
                {preview.exams.length === 0 ? (
                  <p className="syllabus-empty">ไม่พบการสอบที่มีวันและเวลาเริ่มชัดเจน</p>
                ) : (
                  preview.exams.map((item) => (
                    <label key={item.draftId} className="syllabus-row syllabus-row-tall">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => updateExam(item.draftId, { selected: event.target.checked })}
                      />
                      <div>
                        <span>{confidenceLabel(item.confidence)}</span>
                        <Input
                          aria-label="ชื่อการสอบ"
                          value={item.title}
                          placeholder="ชื่อการสอบ"
                          onChange={(event) => updateExam(item.draftId, { title: event.target.value })}
                        />
                        <Select
                          aria-label="ประเภทการสอบ"
                          value={item.type}
                          onChange={(event) => updateExam(item.draftId, { type: event.target.value as SyllabusExamItem["type"] })}
                        >
                          {Object.entries(examTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                        <Input
                          aria-label="วันสอบ"
                          type="date"
                          value={item.date ?? ""}
                          onChange={(event) => updateExam(item.draftId, { date: event.target.value || null })}
                        />
                        <Input
                          aria-label="เวลาเริ่มสอบ"
                          type="time"
                          value={item.startTime ?? ""}
                          onChange={(event) => updateExam(item.draftId, { startTime: event.target.value || null })}
                        />
                        <Input
                          aria-label="เวลาสิ้นสุดสอบ"
                          type="time"
                          value={item.endTime ?? ""}
                          onChange={(event) => updateExam(item.draftId, { endTime: event.target.value || null })}
                        />
                        <Input
                          aria-label="ห้องสอบ"
                          value={item.room ?? ""}
                          placeholder="ห้องสอบ"
                          onChange={(event) => updateExam(item.draftId, { room: event.target.value || null })}
                        />
                      </div>
                    </label>
                  ))
                )}
              </PreviewSection>
            </section>
          )}
          {success && (
            <section className="syllabus-success" aria-live="polite">
              <CheckCircle2 />
              <h3>เพิ่ม Course Syllabus เรียบร้อย</h3>
              <p>
                {success.schedules > 0 && success.tasks === 0 && success.exams === 0
                  ? `เพิ่มตารางเรียนแล้ว ${success.schedules} รายการ`
                  : `เพิ่มตารางเรียน ${success.schedules} รายการ · งาน ${success.tasks} รายการ · การสอบ ${success.exams} รายการ`}
                {success.skippedUnready ? ` · ข้าม ${success.skippedUnready} รายการที่ต้องตรวจสอบ` : ""}
                {success.skipped ? ` · ข้ามรายการซ้ำ ${success.skipped} รายการ` : ""}
              </p>
              <div>
                <Link className="secondary-button" href="/schedule">
                  ดูตารางเรียน
                </Link>
                <Link className="secondary-button" href="/tasks">
                  ดูงาน
                </Link>
                <button type="button" className="primary-button" onClick={close}>
                  เสร็จสิ้น <ChevronRight />
                </button>
              </div>
            </section>
          )}
          </div>
          {preview && !success && (
            <footer className="syllabus-import-action">
              <div>
                <strong>{readiness.importableCount === 0 ? "ยังไม่มีรายการที่พร้อมเพิ่ม" : `พร้อมเพิ่ม ${readiness.importableCount} รายการ`}</strong>
                <span>
                  {unreadyCount > 0
                    ? `จะเพิ่ม ${readiness.importableCount} รายการ และข้าม ${unreadyCount} รายการที่ยังไม่พร้อม${readiness.duplicateCount > 0 ? ` (ซ้ำ ${readiness.duplicateCount})` : ""}`
                    : `เลือกแล้วและข้อมูลครบ ${readiness.readyCount}${readiness.duplicateCount > 0 ? ` · ซ้ำ ${readiness.duplicateCount}` : ""}`}
                </span>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={readiness.importableCount === 0 || importing}
                onClick={importPreview}
              >
                {importing ? <LoaderCircle className="spin" /> : <CheckCircle2 />}
                {readiness.importableCount === 0 ? "ยังไม่มีรายการที่พร้อมเพิ่ม" : (importing ? "กำลังเพิ่ม…" : `ยืนยันและเพิ่ม ${readiness.importableCount} รายการ`)}
              </button>
            </footer>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

function PreviewSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="syllabus-preview-section">
      <header>
        <h4>{title}</h4>
        <span>{count} รายการ</span>
      </header>
      {children}
    </section>
  );
}

function FieldLabel({ text, children }: { text: string; children: ReactNode }) {
  return <label className="syllabus-field"><span>{text}</span>{children}</label>;
}

function confidenceLabel(value: "confident" | "review" | "conflict" | "missing") {
  return value === "confident" ? "ตรวจพบชัดเจน" : value === "review" ? "ควรตรวจทาน" : value === "conflict" ? "ข้อมูลขัดแย้ง" : "ข้อมูลไม่ครบ";
}
