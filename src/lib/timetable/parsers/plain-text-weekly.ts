import { findAcademicTimeRange } from "@/lib/academic-time";
import type { SyllabusPreview, SyllabusScheduleItem } from "@/lib/syllabus-import";
import { extractCourseCodes } from "@/lib/timetable/cell-parser";
import { normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import type { TimetableLayoutType } from "@/lib/timetable/types";
import { parseWeekday } from "@/lib/timetable/weekday-parser";

const EMBEDDED_RANGE = /\d{1,2}(?:\s*[:.]\s*\d{1,2}(?:\s*[:.]\s*\d{1,2})?)?\s*(?:am|pm)?\s*(?:-|–|—|ถึง|to|~)\s*\d{1,2}(?:\s*[:.]\s*\d{1,2}(?:\s*[:.]\s*\d{1,2})?)?\s*(?:am|pm)?/iu;

export function parsePlainTextWeekly(text: string, layout: TimetableLayoutType): SyllabusPreview {
  const lines = text.split(/\r?\n/).map(normalizeTimetableText).filter(Boolean);
  const schedules: SyllabusScheduleItem[] = [];
  let currentDay: number | null = null;
  for (const line of lines) {
    const day = parseWeekday(line);
    if (day !== null) { currentDay = day; continue; }
    if (currentDay === null) continue;
    const courseCode = extractCourseCodes(line).find((code) => /^\d{6,8}$|^[ก-ฮ]\d{4,6}$/u.test(code)) ?? null;
    const range = findAcademicTimeRange(line);
    if (!courseCode || !range) continue;
    const section = line.match(/\bsection\s*[:#-]?\s*([\p{L}\p{N}-]+)/iu)?.[1] ?? null;
    const locationText = normalizeTimetableText(line.replace(courseCode, " ").replace(EMBEDDED_RANGE, " ").replace(/\bsection\s*[:#-]?\s*[\p{L}\p{N}-]+/iu, " "));
    const draftId = `timetable-text-${schedules.length + 1}`;
    schedules.push({
      id: draftId,
      draftId,
      day: currentDay,
      startTime: range.startTime,
      endTime: range.endTime,
      room: locationText || null,
      courseCode,
      courseName: null,
      credits: null,
      section,
      extraLabel: null,
      teacher: null,
      confidence: "confident",
      selected: true,
      evidence: ["weekday heading", "same-line course code", "same-line explicit time"],
    });
  }
  const warnings = schedules.length ? ["ข้อมูลชุดนี้ไม่มี bounding boxes จึงใช้ plain-text fallback กรุณาตรวจ Preview ก่อนนำเข้า"] : ["ยังจับคู่วัน รหัสวิชา และเวลาในข้อความนี้ไม่ได้อย่างปลอดภัย"];
  return {
    course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null },
    schedules, tasks: [], exams: [], warnings, sourceKind: "document", documentLayout: layout,
    debug: { ocrBlocks: 0, dayAnchors: new Set(schedules.map((item) => item.day)).size, courseBlocks: schedules.length, parsedSchedules: schedules.length, warnings: warnings.length, tableCount: schedules.length ? 1 : 0, candidateCells: schedules.length, parsed: schedules.length, review: 0 },
  };
}
