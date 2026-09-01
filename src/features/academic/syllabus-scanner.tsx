"use client";

import { useState } from "react";
import { FileSearch, ScanText, Upload } from "lucide-react";
import { BottomSheet } from "@/components/ui";
import { extractDocumentPages, extractSyllabusDraftFromDocument, supportedSyllabusTypes, type SyllabusDraft } from "@/lib/syllabus-scanner";

export function SyllabusScanner() {
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false); const [draft, setDraft] = useState<SyllabusDraft | null>(null); const [error, setError] = useState<string | null>(null);
  const scan = async (file: File | undefined) => {
    if (!file) return; setError(null); setDraft(null);
    if (!supportedSyllabusTypes.includes(file.type as (typeof supportedSyllabusTypes)[number])) { setError("รองรับ PDF, JPG, JPEG, PNG และ WEBP เท่านั้น (DOCX ยังไม่รองรับ)"); return; }
    setLoading(true); try { setDraft(extractSyllabusDraftFromDocument(await extractDocumentPages(file))); } catch { setError("อ่านเอกสารนี้ไม่ได้ โปรดลองเลือกไฟล์ที่ชัดเจนขึ้น หรือกรอกข้อมูลด้วยตนเอง"); } finally { setLoading(false); }
  };
  return <><button type="button" className="secondary-button schedule-import-button" onClick={() => setOpen(true)}><ScanText /> เพิ่มรายวิชาจากเอกสาร</button><BottomSheet open={open} title="นำเข้าจาก Course Syllabus" onClose={() => setOpen(false)}><div className="academic-sheet"><p>PDF, JPG, JPEG, PNG และ WEBP จะถูกอ่านในเบราว์เซอร์ด้วย text layer หรือ OCR ภาษาไทย/อังกฤษตามความเหมาะสม ข้อมูลจะไม่ถูกนำเข้าอัตโนมัติ</p><label className="primary-button button-block"><Upload /> เลือกเอกสาร<input className="sr-only" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => void scan(event.target.files?.[0])} /></label>{loading && <p role="status">กำลังอ่านข้อความจากเอกสาร…</p>}{error && <p className="form-error" role="alert">{error}</p>}{draft && <><div className="academic-detail-state"><FileSearch /><strong>ตรวจพบข้อมูลจากเอกสาร</strong></div><ul><li><strong>ชื่อวิชา: {draft.courseName.value ?? "ต้องตรวจสอบ"}</strong><span>{draft.courseName.sources[0] ? `หน้า ${draft.courseName.sources[0].page}: ${draft.courseName.sources[0].excerpt}` : "ไม่พบข้อมูลที่ยืนยันได้"}</span></li><li><strong>รหัสวิชา: {draft.courseCode.value ?? "ต้องตรวจสอบ"}</strong><span>{draft.courseCode.sources[0] ? `หน้า ${draft.courseCode.sources[0].page}: ${draft.courseCode.sources[0].excerpt}` : "ไม่พบข้อมูลที่ยืนยันได้"}</span></li>{draft.issues.map((issue) => <li key={issue}><strong>ต้องตรวจสอบ</strong><span>{issue}</span></li>)}</ul><p>โปรดตรวจและกรอกวัน/เวลาให้ครบก่อนนำเข้า ระบบจะไม่ตีความข้อความกำกวมเป็นกำหนดส่งหรือวันสอบเอง</p></>}</div></BottomSheet></>;
}
