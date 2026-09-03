import type { SyllabusPreview } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { classifyTimetableLayout } from "@/lib/timetable/layout-detector";
import { parseDatedEventGrid } from "@/lib/timetable/parsers/dated-event-grid";
import { parseDatedGrid } from "@/lib/timetable/parsers/dated-grid";
import { parseExamGrid } from "@/lib/timetable/parsers/exam-grid";
import { parseGenericGrid } from "@/lib/timetable/parsers/generic-grid";
import { parsePlainTextWeekly } from "@/lib/timetable/parsers/plain-text-weekly";
import { parseSchoolSubjectGrid } from "@/lib/timetable/parsers/school-subject-grid";
import { parseWeeklyTimeGrid } from "@/lib/timetable/parsers/weekly-time-grid";

function parseSingleTimetable(lines: SpatialOcrLine[], text: string): SyllabusPreview {
  const detection = classifyTimetableLayout(text, lines);
  let preview: SyllabusPreview;
  switch (detection.type) {
    case "SCHOOL_SUBJECT_GRID": preview = lines.length ? parseSchoolSubjectGrid(lines, text, detection.type) : parsePlainTextWeekly(text, detection.type); break;
    case "WEEKLY_TIME_GRID": case "PERIOD_GRID": case "UNIVERSITY_BLOCK_GRID": preview = lines.length ? parseWeeklyTimeGrid(lines, text, detection.type) : parsePlainTextWeekly(text, detection.type); break;
    case "EXAM_GRID": preview = parseExamGrid(lines); break;
    case "DATED_SCHEDULE_GRID": preview = parseDatedGrid(lines); break;
    case "DATED_EVENT_GRID": preview = parseDatedEventGrid(lines); break;
    default: preview = parseGenericGrid(lines); break;
  }
  preview.warnings = [...detection.warnings, ...preview.warnings];
  if (preview.debug) { preview.debug.layoutScore = detection.score; preview.debug.evidence = detection.evidence; preview.debug.warnings = preview.warnings.length; }
  return preview;
}

export function parseTimetableDocument(lines: SpatialOcrLine[], text: string): SyllabusPreview {
  const pageGroups = new Map<number, SpatialOcrLine[]>();
  for (const line of lines) pageGroups.set(line.page ?? 1, [...(pageGroups.get(line.page ?? 1) ?? []), line]);
  if (pageGroups.size <= 1) return parseSingleTimetable(lines, text);
  const previews = [...pageGroups.entries()].sort(([a], [b]) => a - b).map(([, pageLines]) => parseSingleTimetable(pageLines, pageLines.map((line) => line.text).join("\n")));
  const layouts = new Set(previews.map((preview) => preview.documentLayout));
  const warnings = previews.flatMap((preview, index) => preview.warnings.map((warning) => `หน้า ${index + 1}: ${warning}`));
  return {
    course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null },
    schedules: previews.flatMap((preview, pageIndex) => preview.schedules.map((item, index) => { const draftId = `timetable-p${pageIndex + 1}-${index + 1}`; return { ...item, id: draftId, draftId }; })),
    tasks: previews.flatMap((preview) => preview.tasks),
    exams: previews.flatMap((preview, page) => preview.exams.map((item, index) => { const draftId = `timetable-exam-p${page + 1}-${index + 1}`; return { ...item, id: draftId, draftId }; })),
    warnings,
    sourceKind: "document",
    documentLayout: layouts.size === 1 ? previews[0].documentLayout : "UNKNOWN",
    debug: {
      ocrBlocks: lines.length,
      dayAnchors: previews.reduce((sum, preview) => sum + (preview.debug?.dayAnchors ?? 0), 0),
      courseBlocks: previews.reduce((sum, preview) => sum + (preview.debug?.courseBlocks ?? 0), 0),
      parsedSchedules: previews.reduce((sum, preview) => sum + preview.schedules.length, 0),
      warnings: warnings.length,
      tableCount: previews.reduce((sum, preview) => sum + (preview.debug?.tableCount ?? 1), 0),
      parsed: previews.reduce((sum, preview) => sum + (preview.debug?.parsed ?? 0), 0),
      review: previews.reduce((sum, preview) => sum + (preview.debug?.review ?? 0), 0),
    },
  };
}
