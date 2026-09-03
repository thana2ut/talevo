import type { SyllabusPreview } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";

export function parseGenericGrid(lines: SpatialOcrLine[], warning = "รูปแบบตารางยังคลุมเครือ ระบบจึงไม่เดาข้อมูลและไม่เลือกนำเข้าอัตโนมัติ"): SyllabusPreview {
  return { course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null }, schedules: [], tasks: [], exams: [], warnings: [warning], sourceKind: "document", documentLayout: "UNKNOWN", debug: { ocrBlocks: lines.length, dayAnchors: 0, courseBlocks: 0, parsedSchedules: 0, warnings: 1, parsed: 0, review: lines.length } };
}
