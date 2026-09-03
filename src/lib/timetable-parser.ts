import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { classifyTimetableLayout } from "@/lib/timetable/layout-detector";
import { parseTimetableDocument } from "@/lib/timetable/parse-document";
import { parseWeeklyTimeGrid } from "@/lib/timetable/parsers/weekly-time-grid";

import {
  parseGridFirstTimetable,
  detectDocumentRegions,
  reconstructTimeColumns,
  reconstructWeekdayRows,
  reconstructGridCells,
  traceGridCourse,
  classifyCellSemanticType,
} from "@/lib/timetable/grid-reconstructor";

export type { LayoutDetection, TimetableLayoutType as DocumentLayout } from "@/lib/timetable/types";
export const detectDocumentLayout = classifyTimetableLayout;

/** Compatibility facade retained for the original weekly-grid integration. */
export function parseTimetableGrid(lines: SpatialOcrLine[], text: string) {
  const detection = classifyTimetableLayout(text, lines);
  const layout = detection.type === "PERIOD_GRID" || detection.type === "SCHOOL_SUBJECT_GRID" || detection.type === "UNIVERSITY_BLOCK_GRID" ? detection.type : "WEEKLY_TIME_GRID";
  const preview = layout === "SCHOOL_SUBJECT_GRID" ? parseGridFirstTimetable(lines, text, layout) : parseWeeklyTimeGrid(lines, text, layout);
  if (preview.debug) { preview.debug.layoutScore = detection.score; preview.debug.evidence = detection.evidence; }
  return preview;
}

export { parseTimetableDocument };
export { extractDocumentEvidence } from "@/lib/timetable/evidence";
export { buildPhysicalCells, traceTimetableCourse } from "@/lib/timetable/parsers/weekly-time-grid";
export { classifySemanticCell } from "@/lib/timetable/cell-parser";
export {
  parseGridFirstTimetable,
  detectDocumentRegions,
  reconstructTimeColumns,
  reconstructWeekdayRows,
  reconstructGridCells,
  traceGridCourse,
  classifyCellSemanticType,
};
export type {
  TimetableTextEvidence,
  PhysicalCell,
  SemanticCellFields,
  TimetableCourseTrace,
  TimeColumn,
  WeekdayRow,
  CellSemanticType,
  GridPhysicalCell,
  DocumentRegions,
} from "@/lib/timetable/types";

