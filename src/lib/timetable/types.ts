import type { SpatialOcrLine } from "@/lib/syllabus-scanner";

export type TimetableLayoutType =
  | "WEEKLY_TIME_GRID"
  | "PERIOD_GRID"
  | "SCHOOL_SUBJECT_GRID"
  | "DATED_SCHEDULE_GRID"
  | "DATED_EVENT_GRID"
  | "EXAM_GRID"
  | "UNIVERSITY_BLOCK_GRID"
  | "SYLLABUS_TEXT"
  | "UNKNOWN";

export type LayoutDetection = {
  type: TimetableLayoutType;
  layout: TimetableLayoutType;
  score: number;
  evidence: string[];
  warnings: string[];
  weekdayCount: number;
  hourlyHeaderCount: number;
  courseCodeCount: number;
  hasStudyTimeLabel: boolean;
};

export type OcrNode = SpatialOcrLine & {
  id: string;
  normalizedText: string;
  centerX: number;
  centerY: number;
  page: number;
};

export type GeometryRow = { centerY: number; nodes: OcrNode[] };
export type GeometryColumn = { centerX: number; nodes: OcrNode[] };

/**
 * Stage A: Raw document evidence preserved with complete geometry and source metadata.
 * No premature interpretation as course records occurs at this stage.
 */
export type TimetableTextEvidence = {
  id: string;
  rawText: string;
  normalizedText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  page: number;
  confidence: number;
  layoutWidth?: number;
};

/**
 * Stage B: Physical course cell grouping.
 * A physical cell is the atomic record unit in a timetable grid.
 */
export type PhysicalCell = {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  evidence: TimetableTextEvidence[];
};

export type CellSemanticType =
  | "course"
  | "activity"
  | "break"
  | "header"
  | "empty"
  | "unknown";

export type TimeColumn = {
  colIndex: number;
  startTime: string;
  endTime: string;
  left: number;
  right: number;
  centerX: number;
  rawHeader?: string;
};

export type WeekdayRow = {
  rowIndex: number;
  day: number;
  top: number;
  bottom: number;
  centerY: number;
  hasExplicitAnchor: boolean;
};

export type DocumentRegions = {
  documentTitle: TimetableTextEvidence[];
  timeHeaders: TimetableTextEvidence[];
  weekdayHeaders: TimetableTextEvidence[];
  bodyEvidence: TimetableTextEvidence[];
  footerEvidence: TimetableTextEvidence[];
  gridBounds: { left: number; top: number; right: number; bottom: number };
};

export type GridPhysicalCell = PhysicalCell & {
  day: number;
  colStart: number;
  colEnd: number;
  startTime: string;
  endTime: string;
  cellType: CellSemanticType;
  row: number;
  colSpan: number;
  rowSpan?: number;
  ignoreReason?: "header" | "break" | "activity" | "empty" | "outside_timetable" | "unknown";
};

/**
 * Semantic classification of physical cell contents.
 * Extracted only after the physical cell boundary is established.
 */
export type SemanticCellFields = {
  courseCode: string | null;
  courseName: string | null;
  credits: number | null;
  section: string | null;
  room: string | null;
  sourceLabel: string | null;
  extraLabel: string | null;
  teacher: string | null;
  time: { startTime: string; endTime: string } | null;
};

/**
 * Debuggability trace for proving lifecycle of any course record.
 */
export type TimetableCourseTrace = {
  queryCode: string;
  rawEvidenceFound: boolean;
  assignedToCell: boolean;
  cellDay: number | null;
  classifiedAsCourseCode: boolean;
  finalRecordCreated: boolean;
  courseName: string | null;
  room: string | null;
  section: string | null;
  credits: number | null;
  sourceLabel: string | null;
  startTime: string | null;
  endTime: string | null;
};
