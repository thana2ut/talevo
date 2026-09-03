import type { SyllabusPreview } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";

export function parseDatedEventGrid(lines: SpatialOcrLine[]): SyllabusPreview {
  const warnings = ["พบตารางกิจกรรมแบบระบุวันที่ แต่ AppState ปัจจุบันยังไม่มีโมเดลกิจกรรมลงวันที่ จึงไม่สร้างข้อมูลแทนแบบเดา"];
  return { course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null }, schedules: [], tasks: [], exams: [], warnings, sourceKind: "document", documentLayout: "DATED_EVENT_GRID", debug: { ocrBlocks: lines.length, dayAnchors: 0, courseBlocks: 0, parsedSchedules: 0, warnings: warnings.length, parsed: 0, review: lines.length } };
}
