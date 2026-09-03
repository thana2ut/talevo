import { findAcademicTimeRange, isValidAcademicTimeRange } from "@/lib/academic-time";
import type { SyllabusPreview, SyllabusScheduleItem } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { classifySemanticCell, isMetadataLine, isSourceLabel, isTimeLine } from "@/lib/timetable/cell-parser";
import { extractDocumentEvidence, findEvidenceForCode } from "@/lib/timetable/evidence";
import { adaptOcrLines, reconstructColumns, reconstructRows, rectangularGeometryScore } from "@/lib/timetable/geometry";
import { isBreakLabel, isNonCourseActivityLabel, normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import type {
  CellSemanticType,
  DocumentRegions,
  GridPhysicalCell,
  PhysicalCell,
  TimeColumn,
  TimetableCourseTrace,
  TimetableLayoutType,
  TimetableTextEvidence,
  WeekdayRow,
} from "@/lib/timetable/types";
import { parseWeekday } from "@/lib/timetable/weekday-parser";

export { adaptOcrLines, reconstructColumns, reconstructRows, rectangularGeometryScore };

function isHeaderOrTimeLine(text: string): boolean {
  const normalized = normalizeTimetableText(text);
  if (/(?:Day\/Time|วัน\/เวลา)/iu.test(normalized)) return true;
  if (/^\s*\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2}\s*$/u.test(normalized)) return true;
  if (/^(?:คาบ|period)\s*\d{1,2}/iu.test(normalized)) return true;
  if (findAcademicTimeRange(normalized) !== null) return true;
  return false;
}

/**
 * Stage 2: Detect Document Regions.
 * Classifies evidence into document title, time headers, weekday column,
 * timetable body, and footer.
 */
export function detectDocumentRegions(evidence: TimetableTextEvidence[]): DocumentRegions {
  const weekdayTokens = evidence.filter((e) => parseWeekday(e.normalizedText) !== null || /(?:Day\/Time|วัน\/เวลา)/iu.test(e.normalizedText));
  const timeTokens = evidence.filter((e) => {
    if (isTimeLine(e.normalizedText) && /(?:เวลา\s*เรียน|study\s*time)/iu.test(e.normalizedText)) return false;
    return isHeaderOrTimeLine(e.normalizedText) || findAcademicTimeRange(e.normalizedText) !== null;
  });

  const timeHeaderTop = timeTokens.length ? Math.min(...timeTokens.map((e) => e.y)) : 40;
  const timeHeaderBottom = timeTokens.length ? Math.max(...timeTokens.map((e) => e.y + e.height)) : 70;
  const leftColMaxX = weekdayTokens.length ? Math.max(...weekdayTokens.map((e) => e.x + e.width)) + 10 : 100;

  const documentTitle: TimetableTextEvidence[] = [];
  const timeHeaders: TimetableTextEvidence[] = [];
  const weekdayHeaders: TimetableTextEvidence[] = [];
  const bodyEvidence: TimetableTextEvidence[] = [];
  const footerEvidence: TimetableTextEvidence[] = [];

  for (const token of evidence) {
    // 1. Document title/header strictly above time headers
    if (token.y + token.height <= timeHeaderTop + 4) {
      documentTitle.push(token);
      continue;
    }

    // 2. Weekday headers (on left column)
    if (token.x < leftColMaxX && parseWeekday(token.normalizedText) !== null) {
      weekdayHeaders.push(token);
      continue;
    }

    // 3. Time headers (in header horizontal band)
    if (token.centerY <= timeHeaderBottom + 10 && token.x >= leftColMaxX - 5 && isHeaderOrTimeLine(token.normalizedText)) {
      timeHeaders.push(token);
      continue;
    }

    // 4. Footer notes/legend (far below the timetable body)
    if (/(?:หมายเหตุ|อาจารย์ที่ปรึกษา|ลงชื่อ|หัวหน้าแผนก)/iu.test(token.normalizedText)) {
      footerEvidence.push(token);
      continue;
    }

    // 5. Timetable body
    bodyEvidence.push(token);
  }

  const gridLeft = leftColMaxX;
  const gridTop = timeHeaderBottom;
  const gridRight = evidence.length ? Math.max(...evidence.map((e) => e.x + Math.max(e.width, e.layoutWidth ?? 0))) : 1200;
  const gridBottom = evidence.length ? Math.max(...evidence.map((e) => e.y + e.height)) : 800;

  return {
    documentTitle,
    timeHeaders,
    weekdayHeaders,
    bodyEvidence,
    footerEvidence,
    gridBounds: { left: gridLeft, top: gridTop, right: gridRight, bottom: gridBottom },
  };
}

/**
 * Stage 5: Time Axis Model.
 * Reconstructs column boundaries and explicit [startTime, endTime] for each column.
 */
export function reconstructTimeColumns(
  timeHeaders: TimetableTextEvidence[],
  bodyLeft: number,
  gridRight: number
): TimeColumn[] {
  const sorted = [...timeHeaders]
    .map((token) => {
      const range = findAcademicTimeRange(token.normalizedText);
      return { token, range };
    })
    .filter((item): item is { token: TimetableTextEvidence; range: NonNullable<ReturnType<typeof findAcademicTimeRange>> } => item.range !== null)
    .sort((a, b) => a.token.x - b.token.x);

  if (sorted.length === 0) return [];

  const columns: TimeColumn[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = sorted[i - 1];
    const next = sorted[i + 1];

    const left = i === 0 ? bodyLeft : (prev.token.x + prev.token.width + curr.token.x) / 2;
    const right = i === sorted.length - 1 ? Math.max(gridRight, curr.token.x + curr.token.width + 30) : (curr.token.x + curr.token.width + next.token.x) / 2;

    columns.push({
      colIndex: i,
      startTime: curr.range.startTime,
      endTime: curr.range.endTime,
      left,
      right,
      centerX: (left + right) / 2,
      rawHeader: curr.token.rawText,
    });
  }

  return columns;
}

/**
 * Stage 6: Weekday Row Model.
 * Reconstructs weekday row bands (0 = Monday .. 6 = Sunday).
 */
export function reconstructWeekdayRows(
  weekdayHeaders: TimetableTextEvidence[],
  bodyTop: number,
  gridBottom: number,
  bodyEvidence: TimetableTextEvidence[]
): WeekdayRow[] {
  const rawRows = weekdayHeaders
    .map((token) => ({ day: parseWeekday(token.normalizedText)!, token }))
    .filter((item) => item.day !== null)
    .sort((a, b) => a.token.centerY - b.token.centerY);

  // Deduplicate if multiple tokens indicate the same day
  const uniqueDays: Array<{ day: number; token: TimetableTextEvidence }> = [];
  for (const item of rawRows) {
    if (!uniqueDays.some((existing) => existing.day === item.day)) {
      uniqueDays.push(item);
    }
  }

  if (uniqueDays.length >= 1) {
    const rows: WeekdayRow[] = [];
    for (let r = 0; r < uniqueDays.length; r++) {
      const curr = uniqueDays[r];
      const prev = uniqueDays[r - 1];
      const next = uniqueDays[r + 1];

      const top = r === 0 ? bodyTop : (prev.token.y + prev.token.height + curr.token.y) / 2;
      const bottom = r === uniqueDays.length - 1 ? Math.max(gridBottom, curr.token.y + curr.token.height + 60) : (curr.token.y + curr.token.height + next.token.y) / 2;

      rows.push({
        rowIndex: r,
        day: curr.day,
        top,
        bottom,
        centerY: (top + bottom) / 2,
        hasExplicitAnchor: true,
      });
    }
    return rows;
  }

  // 0 explicit weekday anchors: cluster body evidence centers into 5 weekday bands (Mon=0 .. Fri=4)
  const cellYCenters = bodyEvidence.map((e) => e.centerY).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const y of cellYCenters) {
    const latest = clusters.at(-1);
    if (latest && Math.abs(y - latest.reduce((s, v) => s + v, 0) / latest.length) <= 50) {
      latest.push(y);
    } else {
      clusters.push([y]);
    }
  }
  const rowBands = clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
  const gaps = rowBands.slice(1).map((b, i) => b - rowBands[i]).filter((g) => g >= 80 && g <= 300).sort((a, b) => a - b);
  const rowHeight = gaps[Math.floor(gaps.length / 2)] || (gridBottom - bodyTop) / 5;
  const baseMondayY = rowBands[0] ?? (bodyTop + rowHeight * 0.5);

  const fallbackRows: WeekdayRow[] = [];
  for (let d = 0; d < 5; d++) {
    const top = baseMondayY + (d - 0.5) * rowHeight;
    const bottom = baseMondayY + (d + 0.5) * rowHeight;
    fallbackRows.push({
      rowIndex: d,
      day: d,
      top,
      bottom,
      centerY: (top + bottom) / 2,
      hasExplicitAnchor: false,
    });
  }
  return fallbackRows;
}

/**
 * Stage 8: Cell Semantic Classification.
 */
export function classifyCellSemanticType(evidence: TimetableTextEvidence[]): CellSemanticType {
  if (!evidence.length) return "empty";
  const texts = evidence.map((e) => normalizeTimetableText(e.rawText)).filter(Boolean);
  if (!texts.length) return "empty";

  if (texts.some(isBreakLabel)) return "break";
  if (texts.some(isNonCourseActivityLabel)) return "activity";
  if (texts.every((t) => parseWeekday(t) !== null || isHeaderOrTimeLine(t))) return "header";

  return "course";
}

/**
 * Stage 4 & 7: Reconstruct Merged Cells & Attach OCR Evidence.
 * Physical Grid Cells are reconstructed per weekday row, identifying horizontally
 * merged cells across multiple time columns, and attaching all intersecting OCR tokens.
 */
export function reconstructGridCells(
  regions: DocumentRegions,
  columns: TimeColumn[],
  rows: WeekdayRow[]
): GridPhysicalCell[] {
  const cells: GridPhysicalCell[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowEvidence = regions.bodyEvidence.filter((e) => e.centerY >= row.top && e.centerY < row.bottom);

    let c = 0;
    while (c < columns.length) {
      const col = columns[c];
      const tokensInCol = rowEvidence.filter((e) => e.centerX >= col.left && e.centerX < col.right);

      if (!tokensInCol.length) {
        c++;
        continue;
      }

      // Check if this cell merges across subsequent columns
      let endCol = c;

      // 1. Check token physical span (width or layoutWidth)
      const maxTokenRight = Math.max(...tokensInCol.map((e) => e.x + Math.max(e.width, e.layoutWidth ?? 0)));
      for (let k = c + 1; k < columns.length; k++) {
        const tokensInK = rowEvidence.filter((e) => e.centerX >= columns[k].left && e.centerX < columns[k].right);
        const kHasOwnSubject = tokensInK.some((e) => {
          const t = normalizeTimetableText(e.rawText);
          return (
            Boolean(t) &&
            !isTimeLine(t) &&
            !isMetadataLine(t) &&
            !isSourceLabel(t) &&
            !/^(?:ครู|อ\.|ผศ\.|รศ\.|ศ\.|ดร\.|teacher)\s*\S+/iu.test(t) &&
            !/^(?:ห้อง|อาคาร|ตึก|online|arr-arr|\d{3,4}|[A-Z]{1,4}[-\s]\d{2,4})$/iu.test(t)
          );
        });

        if (maxTokenRight > columns[k].centerX && !kHasOwnSubject) {
          endCol = Math.max(endCol, k);
        }
      }

      // 2. Check explicit time range inside the tokens
      for (const token of tokensInCol) {
        const timeRange = findAcademicTimeRange(token.normalizedText);
        if (timeRange && isValidAcademicTimeRange(timeRange.startTime, timeRange.endTime)) {
          const matchingEndCol = columns.findIndex((colItem) => colItem.endTime === timeRange.endTime);
          if (matchingEndCol >= c) {
            endCol = Math.max(endCol, matchingEndCol);
          }
        }
      }

      // Collect all tokens within this cell range [c .. endCol]
      const cellMinX = columns[c].left;
      const cellMaxX = columns[endCol].right;
      const cellEvidence = rowEvidence.filter((e) => e.centerX >= cellMinX - 5 && e.centerX < cellMaxX + 5);
      const cellType = classifyCellSemanticType(cellEvidence);

      cells.push({
        id: `cell-r${r}-c${c}`,
        day: row.day,
        row: r,
        colStart: c,
        colEnd: endCol,
        colSpan: endCol - c + 1,
        startTime: columns[c].startTime,
        endTime: columns[endCol].endTime,
        minX: cellMinX,
        maxX: cellMaxX,
        minY: row.top,
        maxY: row.bottom,
        centerX: (cellMinX + cellMaxX) / 2,
        centerY: (row.top + row.bottom) / 2,
        evidence: cellEvidence.sort((a, b) => a.y - b.y || a.x - b.x),
        cellType,
        ignoreReason: cellType !== "course" ? (cellType === "break" || cellType === "activity" || cellType === "header" || cellType === "empty" ? cellType : "unknown") : undefined,
      });

      c = endCol + 1;
    }
  }

  return cells;
}

/**
 * Stage 9: Extract Course Schedule Record from a Physical Course Cell.
 */
export function extractCourseRecordFromCell(
  cell: GridPhysicalCell,
  index: number
): SyllabusScheduleItem | null {
  if (cell.cellType !== "course" || cell.evidence.length === 0) return null;

  const parsed = classifySemanticCell(cell.evidence);
  const explicitTime = parsed.time;
  const startTime = explicitTime?.startTime ?? cell.startTime;
  const endTime = explicitTime?.endTime ?? cell.endTime;

  // Derive courseName:
  // If courseCode is present, courseName is parsed.courseName (or null if absent).
  // If courseCode is null, collect primary subject lines (excluding teacher, room, time, metadata).
  let courseName = parsed.courseName;
  if (!courseName && !parsed.courseCode) {
    const subjectCandidates = cell.evidence
      .map((e) => normalizeTimetableText(e.rawText))
      .filter((t) => (
        Boolean(t) &&
        !isTimeLine(t) &&
        !isMetadataLine(t) &&
        !isSourceLabel(t) &&
        !isNonCourseActivityLabel(t) &&
        !isBreakLabel(t) &&
        !/^(?:ครู|อ\.|ผศ\.|รศ\.|ศ\.|ดร\.|teacher)\s*\S+/iu.test(t) &&
        !/^(?:ห้อง|อาคาร|ตึก|online|arr-arr|\d{3,4}|[A-Z]{1,4}[-\s]\d{2,4})$/iu.test(t)
      ));
    if (subjectCandidates.length > 0) {
      courseName = subjectCandidates.join(" ");
    }
  }

  const hasIdentity = Boolean((courseName && courseName.trim()) || (parsed.courseCode && parsed.courseCode.trim()));
  if (!hasIdentity || cell.day === null || !startTime || !endTime) {
    return null;
  }

  const hasExplicitTime = Boolean(explicitTime);
  const confidence = (parsed.courseCode && hasExplicitTime) ? "confident" : "review";
  const draftId = `timetable-schedule-${index + 1}`;

  return {
    id: draftId,
    draftId,
    courseCode: parsed.courseCode ?? null,
    courseName: courseName ?? null,
    day: cell.day,
    startTime,
    endTime,
    room: parsed.room ?? null,
    teacher: parsed.teacher ?? null,
    section: parsed.section ?? null,
    credits: parsed.credits ?? null,
    extraLabel: parsed.extraLabel ?? null,
    confidence,
    selected: true,
  };
}

/**
 * Universal Grid-First Timetable Parser.
 */
export function parseGridFirstTimetable(
  lines: SpatialOcrLine[],
  text: string,
  layout: TimetableLayoutType = "WEEKLY_TIME_GRID"
): SyllabusPreview {
  const warnings: string[] = [];
  const evidence = extractDocumentEvidence(lines);

  // Stage 2: Document Region Detection
  const regions = detectDocumentRegions(evidence);

  // Stage 5 & 6: Time Columns & Weekday Rows
  const columns = reconstructTimeColumns(regions.timeHeaders, regions.gridBounds.left, regions.gridBounds.right);
  const rows = reconstructWeekdayRows(regions.weekdayHeaders, regions.gridBounds.top, regions.gridBounds.bottom, regions.bodyEvidence);

  // Stage 4 & 7: Reconstruct Merged Physical Grid Cells
  const gridCells = reconstructGridCells(regions, columns, rows);

  // Stage 8 & 9: Semantic Extraction into Course Schedules
  const schedules: SyllabusScheduleItem[] = [];
  for (let i = 0; i < gridCells.length; i++) {
    const record = extractCourseRecordFromCell(gridCells[i], schedules.length);
    if (record) schedules.push(record);
  }

  if (rows.length === 0 || !rows.some((r) => r.hasExplicitAnchor)) {
    warnings.push("พบโครงสร้างตาราง แต่ยังมีบางรายการต้องตรวจสอบ กรุณายืนยันวันและเวลาเรียนก่อนนำเข้า");
  }

  return {
    course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null },
    schedules,
    tasks: [],
    exams: [],
    warnings,
    sourceKind: "document",
    documentLayout: layout,
    debug: {
      ocrBlocks: lines.length,
      dayAnchors: rows.filter((r) => r.hasExplicitAnchor).length,
      courseBlocks: schedules.length,
      parsedSchedules: schedules.length,
      warnings: warnings.length,
      tableCount: 1,
      parsed: schedules.length,
      review: schedules.filter((s) => s.confidence === "review").length,
    },
  };
}

/**
 * Debuggability & Tracing for Grid-First Course Records.
 */
export function traceGridCourse(
  preview: SyllabusPreview,
  evidence: TimetableTextEvidence[],
  cells: PhysicalCell[],
  query: string
): TimetableCourseTrace {
  const q = query.trim();
  const rawMatches = findEvidenceForCode(evidence, q);
  const rawEvidenceFound = rawMatches.length > 0;

  const assignedCell = cells.find((cell) =>
    cell.evidence.some((e) => e.normalizedText.includes(q) || e.rawText.includes(q))
  );
  const assignedToCell = Boolean(assignedCell);

  let cellDay: number | null = null;
  let classifiedAsCourseCode = false;
  let semantic: ReturnType<typeof classifySemanticCell> | null = null;
  if (assignedCell) {
    semantic = classifySemanticCell(assignedCell.evidence);
    classifiedAsCourseCode = semantic.courseCode === q;
  }

  const finalRecord = preview.schedules.find((s) => s.courseCode === q || s.courseName === q);
  const finalRecordCreated = Boolean(finalRecord);
  if (finalRecord) {
    cellDay = finalRecord.day;
  }

  return {
    queryCode: q,
    rawEvidenceFound,
    assignedToCell,
    cellDay,
    classifiedAsCourseCode,
    finalRecordCreated,
    courseName: finalRecord?.courseName ?? semantic?.courseName ?? null,
    room: finalRecord?.room ?? semantic?.room ?? null,
    section: finalRecord?.section ?? semantic?.section ?? null,
    credits: finalRecord?.credits ?? semantic?.credits ?? null,
    sourceLabel: finalRecord?.extraLabel ?? semantic?.sourceLabel ?? null,
    startTime: finalRecord?.startTime ?? semantic?.time?.startTime ?? null,
    endTime: finalRecord?.endTime ?? semantic?.time?.endTime ?? null,
  };
}
