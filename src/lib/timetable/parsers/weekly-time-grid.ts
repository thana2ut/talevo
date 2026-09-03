import { findAcademicTimeRange, timeToAcademicMinutes } from "@/lib/academic-time";
import type { SyllabusPreview, SyllabusScheduleItem } from "@/lib/syllabus-import";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";
import { classifySemanticCell, isLikelyCourseToken, isMetadataLine } from "@/lib/timetable/cell-parser";
import { extractDocumentEvidence, findEvidenceForCode } from "@/lib/timetable/evidence";
import { adaptOcrLines, reconstructColumns, reconstructRows } from "@/lib/timetable/geometry";
import { isBreakLabel, normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import type { PhysicalCell, TimetableCourseTrace, TimetableLayoutType, TimetableTextEvidence } from "@/lib/timetable/types";
import { parseWeekday } from "@/lib/timetable/weekday-parser";

type DayAnchor = { day: number; centerY: number; y: number; height: number };
type TimeAnchor = { x: number; startTime: string; endTime: string };
type PhysicalRowSlot = {
  day: number;
  centerY: number;
  top: number;
  bottom: number;
  hasExplicitAnchor: boolean;
};

function timeRange(value: string) {
  const range = findAcademicTimeRange(normalizeTimetableText(value).replace(/[()]/g, " "));
  return range ? { startTime: range.startTime, endTime: range.endTime } : null;
}

function isHeaderLine(text: string) {
  const normalized = normalizeTimetableText(text);
  if (/(?:Day\/Time|วัน\/เวลา)/iu.test(normalized)) return true;
  if (/^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*$/u.test(normalized)) return true;
  return false;
}

function detectWeekdayAnchors(
  evidence: TimetableTextEvidence[],
  leftColMaxX: number,
  headerBottom: number
): DayAnchor[] {
  const rawAnchors = evidence
    .filter((l) => l.x <= leftColMaxX && l.centerY > headerBottom && parseWeekday(l.normalizedText) !== null)
    .map((l) => ({ day: parseWeekday(l.normalizedText)!, centerY: l.centerY, y: l.y, height: l.height }));

  const anchors: DayAnchor[] = [];
  for (const a of rawAnchors.sort((first, second) => first.centerY - second.centerY)) {
    if (!anchors.some((existing) => existing.day === a.day)) anchors.push(a);
  }
  return anchors;
}

function reconstructPhysicalRowSlots(
  evidence: TimetableTextEvidence[],
  anchors: DayAnchor[],
  headerBottom: number,
  tableBottom: number
): PhysicalRowSlot[] {
  const sortedAnchors = [...anchors].sort((a, b) => a.centerY - b.centerY);
  const maxDay = Math.max(4, ...anchors.map((a) => a.day));
  let rowHeight = 100;

  if (sortedAnchors.length >= 2) {
    const adjGaps: number[] = [];
    for (let i = 0; i < sortedAnchors.length - 1; i++) {
      const a1 = sortedAnchors[i];
      const a2 = sortedAnchors[i + 1];
      const dy = a2.centerY - a1.centerY;
      const dDay = a2.day - a1.day;
      if (dDay === 1 && dy > 40) adjGaps.push(dy);
      else if (dDay > 1 && dy > 40) adjGaps.push(dy / dDay);
    }
    if (adjGaps.length) {
      adjGaps.sort((a, b) => a - b);
      rowHeight = adjGaps[Math.floor(adjGaps.length / 2)];
    }
  } else if (sortedAnchors.length === 1) {
    const surviving = sortedAnchors[0];
    const courseTokens = evidence.filter((l) => (isLikelyCourseToken(l.normalizedText) || isMetadataLine(l.normalizedText)) && l.centerY > headerBottom);
    const tokenYCenters = courseTokens.map((l) => l.centerY).sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const y of tokenYCenters) {
      const latest = clusters.at(-1);
      if (latest && Math.abs(y - latest.reduce((sum, item) => sum + item, 0) / latest.length) <= 30) latest.push(y);
      else clusters.push([y]);
    }
    const clusterCenters = clusters.filter((c) => c.length >= 1).map((c) => c.reduce((sum, item) => sum + item, 0) / c.length);
    const gaps = clusterCenters.slice(1).map((c, i) => c - clusterCenters[i]).filter((g) => g >= 50 && g <= 200).sort((a, b) => a - b);
    rowHeight = gaps[Math.floor(gaps.length / 2)] || Math.max(60, (tableBottom - headerBottom) / Math.max(5, surviving.day + 1));
  }

  const slotCenters = new Map<number, number>();
  for (const a of sortedAnchors) {
    slotCenters.set(a.day, a.centerY);
  }

  if (sortedAnchors.length >= 1) {
    for (let d = 0; d <= maxDay; d++) {
      if (slotCenters.has(d)) continue;
      let prevAnchor: DayAnchor | null = null;
      let nextAnchor: DayAnchor | null = null;
      for (const a of sortedAnchors) {
        if (a.day < d) prevAnchor = a;
        if (a.day > d && !nextAnchor) nextAnchor = a;
      }
      if (prevAnchor && nextAnchor) {
        const ratio = (d - prevAnchor.day) / (nextAnchor.day - prevAnchor.day);
        slotCenters.set(d, prevAnchor.centerY + ratio * (nextAnchor.centerY - prevAnchor.centerY));
      } else if (prevAnchor) {
        slotCenters.set(d, prevAnchor.centerY + (d - prevAnchor.day) * rowHeight);
      } else if (nextAnchor) {
        slotCenters.set(d, nextAnchor.centerY - (nextAnchor.day - d) * rowHeight);
      }
    }
  } else {
    const courseTokens = evidence.filter((l) => (isLikelyCourseToken(l.normalizedText) || isMetadataLine(l.normalizedText)) && l.centerY > headerBottom);
    const tokenYCenters = courseTokens.map((l) => l.centerY).sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const y of tokenYCenters) {
      const latest = clusters.at(-1);
      if (latest && Math.abs(y - latest.reduce((sum, item) => sum + item, 0) / latest.length) <= 30) latest.push(y);
      else clusters.push([y]);
    }
    const clusterCenters = clusters.map((c) => c.reduce((sum, item) => sum + item, 0) / c.length);
    const gaps = clusterCenters.slice(1).map((c, i) => c - clusterCenters[i]).filter((g) => g >= 50 && g <= 200).sort((a, b) => a - b);
    rowHeight = gaps[Math.floor(gaps.length / 2)] || (tableBottom - headerBottom) / 5;
    let baseMondayY: number;
    if (clusterCenters.length) {
      const offsetRows = Math.max(0, Math.min(4, Math.round((clusterCenters[0] - (headerBottom + rowHeight)) / rowHeight)));
      baseMondayY = clusterCenters[0] - offsetRows * rowHeight;
    } else {
      baseMondayY = headerBottom + 0.5 * rowHeight;
    }
    for (let d = 0; d <= maxDay; d++) {
      slotCenters.set(d, baseMondayY + d * rowHeight);
    }
  }

  const days = Array.from(slotCenters.keys()).sort((a, b) => a - b);
  const slots: PhysicalRowSlot[] = [];
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const cY = slotCenters.get(d)!;
    const prevY = i > 0 ? slotCenters.get(days[i - 1])! : null;
    const nextY = i < days.length - 1 ? slotCenters.get(days[i + 1])! : null;
    const top = prevY !== null ? (prevY + cY) / 2 : Math.min(headerBottom, cY - 0.5 * rowHeight);
    const bottom = nextY !== null ? (cY + nextY) / 2 : Math.max(tableBottom, cY + 0.5 * rowHeight);
    slots.push({
      day: d,
      centerY: cY,
      top,
      bottom,
      hasExplicitAnchor: sortedAnchors.some((a) => a.day === d),
    });
  }
  return slots;
}

function timeAnchors(evidence: TimetableTextEvidence[], firstDayY: number) {
  return evidence
    .filter((line) => line.centerY < firstDayY)
    .flatMap((line) => {
      const range = timeRange(line.rawText);
      return range ? [{ x: line.centerX, ...range }] : [];
    })
    .sort((a, b) => a.x - b.x);
}

function medianGap(anchors: TimeAnchor[]) {
  const gaps = anchors.slice(1).map((anchor, index) => anchor.x - anchors[index].x).filter((gap) => gap > 0).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 160;
}

function positionalTime(cell: { minX: number; maxX: number; layoutWidth?: number }, anchors: TimeAnchor[]) {
  if (anchors.length < 2) return null;
  const gap = medianGap(anchors);
  const nearest = (x: number) => anchors.reduce((best, anchor) => Math.abs(anchor.x - x) < Math.abs(best.x - x) ? anchor : best);
  const spanWidth = cell.layoutWidth && cell.layoutWidth > (cell.maxX - cell.minX) ? cell.layoutWidth : (cell.maxX - cell.minX);
  const start = nearest(cell.minX);
  const end = nearest(cell.minX + spanWidth);
  return Math.abs(start.x - cell.minX) <= gap * 0.75 && Math.abs(end.x - (cell.minX + spanWidth)) <= gap * 0.75 && timeToAcademicMinutes(start.startTime, "start") < timeToAcademicMinutes(end.startTime, "end")
    ? { startTime: start.startTime, endTime: end.startTime }
    : null;
}

function subjectToken(value: string) {
  return /^(?:ภาษาไทย|ภาษาอังกฤษ|คณิตศาสตร์|วิทยาศาสตร์|สังคมศึกษา|ประวัติศาสตร์|สุขศึกษา|พลศึกษา|ศิลปะ|ดนตรี|การงาน)/u.test(normalizeTimetableText(value));
}

/**
 * Stage B2: Physical Course Cell Grouping.
 * Clusters body text evidence into atomic physical cells based on geometric proximity.
 * Secondary lines (time, room, section, credits, label) are clustered into the course cell
 * and can NEVER independently become schedule records.
 */
export function buildPhysicalCells(
  bodyEvidence: TimetableTextEvidence[],
  layout: TimetableLayoutType
): PhysicalCell[] {
  const sorted = [...bodyEvidence].sort((a, b) => a.y - b.y || a.x - b.x);
  const cells: PhysicalCell[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const item = sorted[index];
    if (isBreakLabel(item.rawText) || isHeaderLine(item.rawText)) continue;
    const isNewCourseCode = isLikelyCourseToken(item.rawText) || (layout === "SCHOOL_SUBJECT_GRID" && subjectToken(item.rawText));

    let matchedCell: PhysicalCell | null = null;
    if (!isNewCourseCode) {
      let bestDist = Number.POSITIVE_INFINITY;
      for (const cell of cells) {
        const hAlign = Math.abs(item.x - cell.evidence[0].x) <= 70 ||
                       (item.x < cell.maxX + 45 && item.x + item.width > cell.minX - 45);
        const vClose = item.y >= cell.minY - 15 && item.y <= cell.maxY + 55;
        if (hAlign && vClose) {
          const dist = Math.abs(item.y - cell.maxY);
          if (dist < bestDist) {
            bestDist = dist;
            matchedCell = cell;
          }
        }
      }
    }

    if (matchedCell) {
      matchedCell.evidence.push(item);
      matchedCell.minX = Math.min(matchedCell.minX, item.x);
      matchedCell.maxX = Math.max(matchedCell.maxX, item.x + item.width);
      matchedCell.minY = Math.min(matchedCell.minY, item.y);
      matchedCell.maxY = Math.max(matchedCell.maxY, item.y + item.height);
      matchedCell.centerX = (matchedCell.minX + matchedCell.maxX) / 2;
      matchedCell.centerY = (matchedCell.minY + matchedCell.maxY) / 2;
    } else {
      cells.push({
        id: `cell-${cells.length + 1}`,
        minX: item.x,
        maxX: item.x + item.width,
        minY: item.y,
        maxY: item.y + item.height,
        centerX: item.centerX,
        centerY: item.centerY,
        evidence: [item],
      });
    }
  }

  // Merge stray secondary cells (cells without a course code that are adjacent to an existing course cell)
  const mergedCells: PhysicalCell[] = [];
  for (const cell of cells) {
    const hasCode = cell.evidence.some((l) => isLikelyCourseToken(l.rawText) || (layout === "SCHOOL_SUBJECT_GRID" && subjectToken(l.rawText)));
    if (!hasCode) {
      const parent = mergedCells.find((p) => {
        const hOverlap = cell.minX < p.maxX + 50 && cell.maxX > p.minX - 50;
        const vNear = Math.abs(cell.minY - p.maxY) <= 45 || Math.abs(cell.maxY - p.minY) <= 45;
        return hOverlap && vNear;
      });
      if (parent) {
        parent.evidence.push(...cell.evidence);
        parent.minX = Math.min(parent.minX, cell.minX);
        parent.maxX = Math.max(parent.maxX, cell.maxX);
        parent.minY = Math.min(parent.minY, cell.minY);
        parent.maxY = Math.max(parent.maxY, cell.maxY);
        parent.centerX = (parent.minX + parent.maxX) / 2;
        parent.centerY = (parent.minY + parent.maxY) / 2;
        continue;
      }
    }
    mergedCells.push(cell);
  }

  return mergedCells;
}

/**
 * Stage B6: Debuggability & Tracing.
 * Proves whether a query course code was extracted, grouped into a cell, assigned a weekday,
 * classified semantically, and finalized into a schedule record.
 */
export function traceTimetableCourse(
  preview: SyllabusPreview,
  evidence: TimetableTextEvidence[],
  cells: PhysicalCell[],
  queryCode: string
): TimetableCourseTrace {
  const code = queryCode.trim();
  const rawMatches = findEvidenceForCode(evidence, code);
  const rawEvidenceFound = rawMatches.length > 0;

  const assignedCell = cells.find((cell) =>
    cell.evidence.some((e) => e.normalizedText.includes(code) || e.rawText.includes(code))
  );
  const assignedToCell = Boolean(assignedCell);

  let cellDay: number | null = null;
  let classifiedAsCourseCode = false;
  let semantic: ReturnType<typeof classifySemanticCell> | null = null;
  if (assignedCell) {
    semantic = classifySemanticCell(assignedCell.evidence);
    classifiedAsCourseCode = semantic.courseCode === code;
  }

  const finalRecord = preview.schedules.find((s) => s.courseCode === code);
  const finalRecordCreated = Boolean(finalRecord);
  if (finalRecord) {
    cellDay = finalRecord.day;
  }

  return {
    queryCode: code,
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

/**
 * Strict Two-Stage Timetable Grid Parser.
 * STAGE A: Raw Document Evidence Extraction (no premature classification).
 * STAGE B: Structural Analysis, Physical Cell Grouping, Semantic Classification, and Record Construction.
 */
export function parseWeeklyTimeGrid(
  lines: SpatialOcrLine[],
  text: string,
  layout: TimetableLayoutType = "WEEKLY_TIME_GRID"
): SyllabusPreview {
  const warnings: string[] = [];

  // -------------------------------------------------------------
  // STAGE A: Extract All Document Evidence
  // -------------------------------------------------------------
  const evidence = extractDocumentEvidence(lines);

  // -------------------------------------------------------------
  // STAGE B1: Structural Analysis (Detect Headers & Grid)
  // -------------------------------------------------------------
  const headerEvidence = evidence.filter((e) => isHeaderLine(e.normalizedText));
  const headerBottom = headerEvidence.length ? Math.max(...headerEvidence.map((l) => l.y + l.height)) : 70;
  const bodyEvidence = evidence.filter((l) => l.centerY > headerBottom);
  const tableBottom = bodyEvidence.length ? Math.max(...bodyEvidence.map((l) => l.y + l.height)) : headerBottom + 500;
  const tableLeft = evidence.length ? Math.min(...evidence.map((l) => l.x)) : 0;

  // Weekday column boundary: left of the first time column header or right of detected weekday lines
  const weekdayAnchorEvidence = evidence.filter((l) => parseWeekday(l.normalizedText) !== null || /(?:Day\/Time|วัน\/เวลา)/iu.test(l.normalizedText));
  const timeHeaderEvidence = evidence.filter((l) => /^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*$/u.test(l.normalizedText));
  const leftColMaxX = weekdayAnchorEvidence.length
    ? Math.max(...weekdayAnchorEvidence.map((l) => l.x + l.width)) + 5
    : timeHeaderEvidence.length
      ? Math.min(...timeHeaderEvidence.map((l) => l.x)) - 2
      : tableLeft;

  const anchors = detectWeekdayAnchors(evidence, leftColMaxX, headerBottom);
  const candidateBodyEvidence = bodyEvidence.filter((l) => l.x >= leftColMaxX - 2 && !weekdayAnchorEvidence.includes(l));

  // -------------------------------------------------------------
  // STAGE B2: Physical Course Cell Grouping
  // -------------------------------------------------------------
  const physicalCells = buildPhysicalCells(candidateBodyEvidence, layout);

  // -------------------------------------------------------------
  // STAGE B4 Helper: Canonical Day Resolver (0 = Monday .. 6 = Sunday)
  // -------------------------------------------------------------
  let getCellDay: (cell: PhysicalCell) => { day: number; hasExplicitAnchor: boolean };
  if (anchors.length >= 1) {
    const slots = reconstructPhysicalRowSlots(evidence, anchors, headerBottom, tableBottom);
    getCellDay = (cell) => {
      const exactSlot = slots.find((s) => cell.centerY >= s.top && cell.centerY < s.bottom);
      if (exactSlot) return { day: exactSlot.day, hasExplicitAnchor: exactSlot.hasExplicitAnchor };
      let closest = slots[0];
      let minDiff = Math.abs(cell.centerY - slots[0].centerY);
      for (const s of slots.slice(1)) {
        const diff = Math.abs(cell.centerY - s.centerY);
        if (diff < minDiff) {
          minDiff = diff;
          closest = s;
        }
      }
      return { day: closest.day, hasExplicitAnchor: closest.hasExplicitAnchor };
    };
  } else {
    // 0 anchors: cluster cell centers into row bands (anchored at Monday = day 0)
    const cellCentersY = physicalCells.map((c) => c.centerY).sort((a, b) => a - b);
    const rowClusters: number[][] = [];
    for (const y of cellCentersY) {
      const latest = rowClusters.at(-1);
      if (latest && Math.abs(y - latest.reduce((s, v) => s + v, 0) / latest.length) <= 50) {
        latest.push(y);
      } else {
        rowClusters.push([y]);
      }
    }
    const rowBands = rowClusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
    const gaps = rowBands.slice(1).map((b, i) => b - rowBands[i]).filter((g) => g >= 80 && g <= 300).sort((a, b) => a - b);
    const rowHeight = gaps[Math.floor(gaps.length / 2)] || (tableBottom - headerBottom) / 5;
    const baseMondayY = rowBands[0] ?? (headerBottom + rowHeight * 0.5);

    getCellDay = (cell) => {
      const day = Math.max(0, Math.min(6, Math.round((cell.centerY - baseMondayY) / rowHeight)));
      return { day, hasExplicitAnchor: false };
    };
  }

  const firstBodyY = anchors[0]?.centerY ?? (physicalCells[0]?.centerY ?? Number.POSITIVE_INFINITY);
  const headers = timeAnchors(evidence, firstBodyY);

  // -------------------------------------------------------------
  // STAGE B3 & B4: Semantic Cell Classification & Time/Day Assignment
  // -------------------------------------------------------------
  const rawSchedules: SyllabusScheduleItem[] = [];

  for (let i = 0; i < physicalCells.length; i++) {
    const cell = physicalCells[i];
    const { day, hasExplicitAnchor } = getCellDay(cell);
    const parsed = classifySemanticCell(cell.evidence);
    const explicitTime = parsed.time;
    const codeEvidence = cell.evidence.find((l) => isLikelyCourseToken(l.rawText)) ?? cell.evidence[0];
    const spanWidth = Math.max(
      cell.maxX - cell.minX,
      codeEvidence?.layoutWidth ?? 0,
      ...cell.evidence.map((l) => l.layoutWidth ?? 0)
    );
    const fallbackTime = explicitTime
      ? null
      : positionalTime({ minX: codeEvidence?.x ?? cell.minX, maxX: (codeEvidence?.x ?? cell.minX) + spanWidth, layoutWidth: spanWidth }, headers);
    const startTime = explicitTime?.startTime ?? fallbackTime?.startTime ?? null;
    const endTime = explicitTime?.endTime ?? fallbackTime?.endTime ?? null;

    const hasCourseCode = Boolean(parsed.courseCode);
    const hasValidTime = Boolean(startTime && endTime);

    // Review policy:
    // If anchors are missing, mark review to request user confirmation.
    // If candidate cell has courseCode and explicit time with anchors present, mark confident.
    let confidence: "confident" | "review" | "missing" = "missing";
    if (anchors.length === 0) {
      confidence = (hasCourseCode && hasValidTime) ? "review" : "missing";
    } else if (hasCourseCode && explicitTime && hasValidTime) {
      confidence = "confident";
    } else if (hasValidTime) {
      confidence = "review";
    } else {
      confidence = "missing";
    }

    const draftId = `timetable-schedule-${i + 1}`;
    rawSchedules.push({
      id: draftId,
      draftId,
      day,
      startTime,
      endTime,
      room: parsed.room,
      courseCode: parsed.courseCode,
      courseName: parsed.courseName,
      credits: parsed.credits,
      section: parsed.section,
      teacher: parsed.teacher,
      extraLabel: parsed.extraLabel,
      confidence,
      selected: anchors.length > 0 && confidence === "confident" && hasCourseCode,
      evidence: [
        explicitTime ? "explicit time" : fallbackTime ? "column span" : "missing time",
        hasExplicitAnchor ? `weekday ${day}` : `inferred weekday row ${day}`,
        hasCourseCode ? `course identity OCR: ${parsed.courseCode}` : "missing course code OCR",
      ],
    });
  }

  // -------------------------------------------------------------
  // STAGE B5: Course Record Construction & Deduplication
  // -------------------------------------------------------------
  const seenSignatures = new Set<string>();
  const deduped: SyllabusScheduleItem[] = [];
  for (const item of rawSchedules) {
    const key = [
      item.day,
      item.startTime ?? "",
      item.endTime ?? "",
      item.courseCode ?? item.courseName ?? "",
      (item.room ?? "").replace(/\s+/g, "").toLowerCase(),
      item.section ?? "",
    ].join("|");
    if (seenSignatures.has(key)) continue;
    seenSignatures.add(key);
    deduped.push(item);
  }

  // Filter out stray orphan entries without course codes that overlap with a confident entry that has a course code
  const confidentWithCode = deduped.filter((s) => s.courseCode && s.startTime && s.endTime);
  const finalSchedules = deduped.filter((s) => {
    if (s.courseCode) return true;
    const overlaps = confidentWithCode.some((c) => c.day === s.day && c.startTime === s.startTime && c.endTime === s.endTime);
    return !overlaps;
  });

  // Reassign stable draft IDs and sort canonically by day then start time
  finalSchedules.sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const schedules: SyllabusScheduleItem[] = finalSchedules.map((item, idx) => ({
    ...item,
    id: `timetable-schedule-${idx + 1}`,
    draftId: `timetable-schedule-${idx + 1}`,
  }));

  if (!text.trim()) warnings.push("ไม่พบข้อความ OCR ที่อ่านได้จากตารางเรียนนี้");
  if (physicalCells.length && anchors.length === 0) warnings.push("พบโครงสร้างตาราง แต่ยังมีบางรายการต้องตรวจสอบ ระบบอนุมานวันจากตำแหน่งแถว กรุณายืนยันวันก่อนนำเข้า");
  if (!schedules.length) warnings.push("พบโครงสร้างตาราง แต่ยังไม่มีรายการที่อ่านได้อย่างปลอดภัย กรุณาตรวจสอบภาพหรือกรอกข้อมูลใน Preview");
  const review = schedules.filter((item) => item.confidence !== "confident").length;
  if (review) warnings.push(`ตารางเรียน ${review} รายการต้องตรวจสอบวันหรือเวลาเพิ่มเติม`);
  const nodes = adaptOcrLines(lines);

  // -------------------------------------------------------------
  // STAGE B6: Debuggability & Tracing Metadata
  // -------------------------------------------------------------
  const preview: SyllabusPreview = {
    course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null },
    schedules,
    tasks: [],
    exams: [],
    warnings,
    sourceKind: "document",
    documentLayout: layout,
    debug: {
      ocrBlocks: lines.length,
      dayAnchors: anchors.length,
      courseBlocks: physicalCells.length,
      parsedSchedules: schedules.length,
      warnings: warnings.length,
      tableCount: schedules.length ? 1 : 0,
      rowAnchors: reconstructRows(nodes).length,
      columnAnchors: reconstructColumns(nodes).length,
      candidateCells: physicalCells.length,
      parsed: schedules.filter((item) => item.selected).length,
      review,
      rawEvidenceCount: evidence.length,
      physicalCellsCount: physicalCells.length,
      classifiedCourseCellsCount: rawSchedules.filter((s) => Boolean(s.courseCode)).length,
      finalRecordsCount: schedules.length,
      droppedCells: Math.max(0, physicalCells.length - schedules.length),
    },
  };

  return preview;
}
