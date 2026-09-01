import type { ClassSchedule, NewClassInput } from "@/types";

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getClassDurationMinutes(item: Pick<ClassSchedule, "startTime" | "endTime">) {
  return timeToMinutes(item.endTime) - timeToMinutes(item.startTime);
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

export function formatScheduleDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours ? `${hours} ชม.` : ""}${hours && remainingMinutes ? " " : ""}${remainingMinutes ? `${remainingMinutes} นาที` : ""}` || "0 นาที";
}

export function findScheduleConflict(schedules: ClassSchedule[], input: Pick<NewClassInput, "day" | "startTime" | "endTime">, excludeId?: string) {
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);
  return schedules.find((item) => item.id !== excludeId && item.day === input.day && start < timeToMinutes(item.endTime) && end > timeToMinutes(item.startTime));
}

export function getFreeTimeGaps(schedules: ClassSchedule[]) {
  const ordered = [...schedules].sort((first, second) => first.startTime.localeCompare(second.startTime));
  return ordered.slice(1).flatMap((item, index) => {
    const previous = ordered[index];
    const duration = timeToMinutes(item.startTime) - timeToMinutes(previous.endTime);
    return duration >= 15 ? [{ afterId: previous.id, startTime: previous.endTime, endTime: item.startTime, duration }] : [];
  });
}
