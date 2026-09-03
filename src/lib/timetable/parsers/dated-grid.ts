import type { SyllabusPreview } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { countExplicitDates } from "@/lib/timetable/date-parser";

export function parseDatedGrid(lines: SpatialOcrLine[]): SyllabusPreview {
  const dates = countExplicitDates(lines.map((line) => line.text));
  const warnings = ["ตารางนี้อ้างอิงวันที่จริง จึงไม่แปลงเป็นคาบเรียนรายสัปดาห์อัตโนมัติ เพื่อป้องกันวันผิด", `พบวันที่ที่ยืนยันปีได้ ${dates} รายการ`];
  return { course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null }, schedules: [], tasks: [], exams: [], warnings, sourceKind: "document", documentLayout: "DATED_SCHEDULE_GRID", debug: { ocrBlocks: lines.length, dayAnchors: 0, courseBlocks: 0, parsedSchedules: 0, warnings: warnings.length, candidateCells: dates, parsed: 0, review: dates } };
}
