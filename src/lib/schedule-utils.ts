import type { ClassSchedule, NewClassInput } from "@/types";
import { academicRangesOverlap, calculateAcademicDuration, timeToAcademicMinutes } from "@/lib/academic-time";

export function timeToMinutes(time: string) {
  return timeToAcademicMinutes(time);
}

export function getClassDurationMinutes(item: Pick<ClassSchedule, "startTime" | "endTime">) {
  return calculateAcademicDuration(item.startTime, item.endTime);
}

export interface WeekTimeRange {
  startMinutes: number;
  endMinutes: number;
}

export interface ScheduleEventPosition {
  top: number;
  height: number;
}

/**
 * Builds the compact, hour-aligned vertical range for the visible week.
 * The empty-state range is deliberately small so a week without classes does
 * not render a large, misleading timetable.
 */
export function getWeekTimeRange(items: Pick<ClassSchedule, "startTime" | "endTime">[]): WeekTimeRange {
  const validItems = items
    .map((item) => ({ start: timeToMinutes(item.startTime), end: timeToMinutes(item.endTime) }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);

  if (!validItems.length) return { startMinutes: 8 * 60, endMinutes: 10 * 60 };

  const earliestStart = Math.min(...validItems.map((item) => item.start));
  const latestEnd = Math.max(...validItems.map((item) => item.end));
  const startMinutes = Math.floor(earliestStart / 60) * 60;
  const roundedEnd = Math.ceil(latestEnd / 60) * 60;

  return { startMinutes, endMinutes: Math.max(roundedEnd, startMinutes + 60) };
}

/** Returns the minute-accurate offset and height for a class in a week grid. */
export function getWeekEventPosition(item: Pick<ClassSchedule, "startTime" | "endTime">, range: WeekTimeRange, pixelsPerMinute: number): ScheduleEventPosition {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  return {
    top: Math.max(0, (start - range.startMinutes) * pixelsPerMinute),
    height: Math.max(0, (end - start) * pixelsPerMinute),
  };
}

export interface HorizontalSchedulePosition {
  left: string;
  width: string;
  leftPercent: number;
  widthPercent: number;
}

export interface DayRowLayoutItem {
  item: ClassSchedule;
  lane: number;
  lanes: number;
}

/**
 * Builds the horizontal academic timetable time range.
 * Preserves at least 08:00 (480) through 24:00 (1440), expanding earlier
 * if any class starts before 08:00.
 */
export function getHorizontalTimetableRange(items: Pick<ClassSchedule, "startTime" | "endTime">[]): WeekTimeRange {
  const baseRange = getWeekTimeRange(items);
  const startMinutes = Math.min(8 * 60, baseRange.startMinutes);
  const endMinutes = Math.max(24 * 60, baseRange.endMinutes);
  return { startMinutes, endMinutes };
}

/**
 * Converts an academic minute boundary to the shared horizontal timeline scale.
 * The inclusive end boundary is important for a valid 24:00 end time.
 */
export function getHorizontalTimelinePercent(minute: number, range: WeekTimeRange) {
  const total = Math.max(60, range.endMinutes - range.startMinutes);
  return Math.max(0, Math.min(100, ((minute - range.startMinutes) / total) * 100));
}

/**
 * Returns percentage-accurate horizontal coordinates (left and width) for a class
 * in the academic timetable row track.
 */
export function getHorizontalEventPosition(
  item: Pick<ClassSchedule, "startTime" | "endTime">,
  range: WeekTimeRange
): HorizontalSchedulePosition {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  const leftPercent = getHorizontalTimelinePercent(start, range);
  const widthPercent = Math.max(0, getHorizontalTimelinePercent(end, range) - leftPercent);
  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    leftPercent,
    widthPercent,
  };
}

/**
 * Groups and stacks overlapping classes for a single weekday row.
 * Uses half-open [start, end) intervals: adjacent classes do not overlap.
 */
export function layoutHorizontalDay(events: ClassSchedule[]): DayRowLayoutItem[] {
  const groups: ClassSchedule[][] = [];
  let group: ClassSchedule[] = [];
  let groupEnd = -1;
  [...events].sort((a, b) => a.startTime.localeCompare(b.startTime)).forEach((event) => {
    const start = timeToMinutes(event.startTime);
    if (group.length && start >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -1;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, timeToMinutes(event.endTime));
  });
  if (group.length) groups.push(group);

  return groups.flatMap((items) => {
    const active: Array<{ end: number; lane: number }> = [];
    const assigned = items.map((item) => {
      const start = timeToMinutes(item.startTime);
      active.splice(0, active.length, ...active.filter((entry) => entry.end > start));
      const used = new Set(active.map((entry) => entry.lane));
      let lane = 0;
      while (used.has(lane)) lane += 1;
      active.push({ end: timeToMinutes(item.endTime), lane });
      return { item, lane };
    });
    const lanes = Math.max(...assigned.map((entry) => entry.lane)) + 1;
    return assigned.map((entry) => ({ ...entry, lanes }));
  });
}

export function formatScheduleDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours ? `${hours} ชม.` : ""}${hours && remainingMinutes ? " " : ""}${remainingMinutes ? `${remainingMinutes} นาที` : ""}` || "0 นาที";
}

export function findScheduleConflict(schedules: ClassSchedule[], input: Pick<NewClassInput, "day" | "startTime" | "endTime">, excludeId?: string) {
  return schedules.find((item) => item.id !== excludeId && item.day === input.day && academicRangesOverlap(input.startTime, input.endTime, item.startTime, item.endTime));
}

export function getFreeTimeGaps(schedules: ClassSchedule[]) {
  const ordered = [...schedules].sort((first, second) => first.startTime.localeCompare(second.startTime));
  return ordered.slice(1).flatMap((item, index) => {
    const previous = ordered[index];
    const duration = timeToMinutes(item.startTime) - timeToMinutes(previous.endTime);
    return duration >= 15 ? [{ afterId: previous.id, startTime: previous.endTime, endTime: item.startTime, duration }] : [];
  });
}

export function isCorruptedScheduleTitle(name: string | null | undefined): boolean {
  if (!name) return true;
  const cleanName = name.trim();
  if (!cleanName) return true;

  // Time-related strings
  if (/เวลา/iu.test(cleanName)) return true;
  if (/\d{1,2}[:.]\d{2}/.test(cleanName)) return true;

  // Metadata / Section patterns (e.g. "(2) 15, EDU-3402", "15, EDU-3402", "(3) 10", "Sec 15")
  if (/^\(?\d{1,2}\)?\s*,\s*/.test(cleanName)) return true;
  if (/^\(\s*\d+\s*\)/.test(cleanName)) return true;
  if (/^(?:sec|section|กลุ่ม|ตอนเรียน|คาบ|คาบที่)\s*\d+/iu.test(cleanName)) return true;

  // Isolated short numbers (e.g. "15", "2", "10", "414", "5701" - 6-8 digit course codes like "0560201" are preserved)
  if (/^\d{1,4}$/.test(cleanName)) return true;

  // Room / Building patterns (e.g. "EDU-3402", "RN1-805", "B-409", "IT-508", "SCI-300", "ห้อง 320", "อาคาร 4")
  if (/^(?:ห้อง|อาคาร|ตึก|room|building)\b/iu.test(cleanName)) return true;
  if (/^[A-Z0-9]{1,6}[-\s]\d{3,4}[A-Z]?$/i.test(cleanName)) return true;
  if (cleanName === "ไม่ระบุ1" || /^ไม่ระบุ/iu.test(cleanName)) return true;

  // Faculty / Building / Source labels
  if (/^(?:N\/A|EDU|FAC\s*IT|SC[1I]|SCI|RN|B|IT|online|arr-arr)$/iu.test(cleanName)) return true;

  // Generic placeholders
  if (/^(?:ยังไม่ระบุ|รายการเรียน|ยังไม่พบ|placeholder)$/iu.test(cleanName)) return true;

  // Pure punctuation or symbols
  if (!/[a-zA-Zก-๙0-9]/.test(cleanName)) return true;

  return false;
}

/**
 * Resolves the presentation display title for a class schedule.
 * Strict semantic rule:
 * - If schedule.name is valid and clean, use it.
 * - Filters out corrupted values (e.g. "N/A", "15:00:00", time fragments, "เวลาเรียน...", "(2) 15, EDU-3402").
 * - If no clean name, safely falls back to courseCode (or extracted from syllabus courseId).
 * - Never returns garbage OCR or time strings.
 */
export function getScheduleDisplayName(item: Pick<ClassSchedule, "name" | "courseId"> & { courseCode?: string | null }): string {
  const cleanName = item.name?.trim() ?? "";
  if (!isCorruptedScheduleTitle(cleanName)) return cleanName;
  if (item.courseCode?.trim()) return item.courseCode.trim();
  if (item.courseId?.startsWith("syllabus-")) {
    const raw = item.courseId.replace(/^syllabus-/, "").replace(/-/g, "");
    if (raw && raw !== "course" && !isCorruptedScheduleTitle(raw) && /^[A-Z0-9]{4,10}$/i.test(raw)) {
      return raw;
    }
  }
  return "รายการเรียน";
}
