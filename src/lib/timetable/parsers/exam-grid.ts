import type { SyllabusExamItem, SyllabusPreview } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { parseCourseCell } from "@/lib/timetable/cell-parser";
import { parseAcademicDate } from "@/lib/timetable/date-parser";
import { adaptOcrLines, reconstructRows } from "@/lib/timetable/geometry";

export function parseExamGrid(lines: SpatialOcrLine[]): SyllabusPreview {
  const nodes = adaptOcrLines(lines); const rows = reconstructRows(nodes); const exams: SyllabusExamItem[] = [];
  const dateAnchors = nodes.flatMap((node) => { const date = parseAcademicDate(node.normalizedText); return date ? [{ node, date }] : []; }).sort((a, b) => a.node.centerY - b.node.centerY);
  for (const [index, anchor] of dateAnchors.entries()) {
    const previousY = dateAnchors[index - 1]?.node.centerY; const nextY = dateAnchors[index + 1]?.node.centerY;
    const top = previousY === undefined ? Number.NEGATIVE_INFINITY : (previousY + anchor.node.centerY) / 2;
    const bottom = nextY === undefined ? Number.POSITIVE_INFINITY : (anchor.node.centerY + nextY) / 2;
    const cell = parseCourseCell(nodes.filter((node) => node.centerY >= top && node.centerY < bottom).map((node) => node.normalizedText));
    const draftId = `timetable-exam-${exams.length + 1}`;
    exams.push({ id: draftId, draftId, title: cell.courseCode ?? cell.courseName ?? "", type: "other", date: anchor.date, startTime: cell.time?.startTime ?? null, endTime: cell.time?.endTime ?? null, room: cell.room, weight: null, confidence: cell.time && (cell.courseName || cell.courseCode) ? "review" : "missing", selected: false });
  }
  const warnings = exams.length ? ["ข้อมูลสอบจากตารางวันที่ถูกปิดการเลือกไว้ก่อน กรุณาตรวจสอบทุกช่องก่อนนำเข้า"] : ["พบตารางสอบ แต่ยังจับคู่วันที่ เวลา และรายวิชาไม่ได้อย่างปลอดภัย"];
  return { course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null }, schedules: [], tasks: [], exams, warnings, sourceKind: "document", documentLayout: "EXAM_GRID", debug: { ocrBlocks: lines.length, dayAnchors: 0, courseBlocks: exams.length, parsedSchedules: 0, warnings: warnings.length, rowAnchors: rows.length, candidateCells: exams.length, parsed: exams.length, review: exams.length } };
}
