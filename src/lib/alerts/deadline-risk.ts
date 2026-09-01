import type { ClassSchedule, Task } from "@/types";
import { parseLocalTaskDate } from "@/lib/task-utils";
import { addLocalDays, getClassesForDate, localDateKey, localDateTime, startOfLocalDay } from "@/lib/alerts/date-time";
import { timeToMinutes } from "@/lib/schedule-utils";

export type DeadlineRiskLevel = "safe" | "start_soon" | "at_risk";

export type DeadlineRiskAssessment = {
  taskId: string;
  level: DeadlineRiskLevel;
  remainingEstimatedMinutes: number;
  availableFreeMinutes: number;
  dueAt: Date;
};

export function parseEstimatedMinutes(value: string) {
  const normalized = value.trim().toLowerCase();
  const hourMatch = normalized.match(/([\d.]+)\s*(?:ชั่วโมง|ชม\.?|hours?|hrs?)/);
  const minuteMatch = normalized.match(/([\d.]+)\s*(?:นาที|minutes?|mins?)/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  if (Number.isFinite(hours) && Number.isFinite(minutes) && (hours > 0 || minutes > 0)) return Math.round(hours * 60 + minutes);
  const plain = Number.parseFloat(normalized);
  return Number.isFinite(plain) && plain > 0 ? Math.round(plain) : 0;
}

export function getRemainingEstimatedMinutes(task: Task) {
  const estimate = parseEstimatedMinutes(task.estimate);
  if (!estimate || task.status === "completed") return 0;
  const total = task.subtasks?.length ?? 0;
  if (!total) return estimate;
  const unfinished = task.subtasks?.filter((item) => !item.completed).length ?? total;
  return Math.ceil(estimate * (unfinished / total));
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  return intervals
    .sort((first, second) => first.start - second.start)
    .reduce<Array<{ start: number; end: number }>>((merged, interval) => {
      const previous = merged.at(-1);
      if (!previous || interval.start > previous.end) merged.push({ ...interval });
      else previous.end = Math.max(previous.end, interval.end);
      return merged;
    }, []);
}

/**
 * Risk planning intentionally counts only 07:00–22:00 local time and subtracts
 * recurring class blocks. It does not assume overnight hours are study time.
 */
export function calculateAvailableStudyMinutes(schedules: ClassSchedule[], now: Date, dueAt: Date) {
  if (dueAt <= now) return 0;
  let available = 0;
  for (let date = startOfLocalDay(now); date <= startOfLocalDay(dueAt); date = addLocalDays(date, 1)) {
    const key = localDateKey(date);
    const windowStart = localDateTime(key, "07:00");
    const windowEnd = localDateTime(key, "22:00");
    const start = new Date(Math.max(windowStart.getTime(), now.getTime()));
    const end = new Date(Math.min(windowEnd.getTime(), dueAt.getTime()));
    if (end <= start) continue;

    const windowStartMinutes = start.getHours() * 60 + start.getMinutes();
    const windowEndMinutes = end.getHours() * 60 + end.getMinutes() + (end.getSeconds() > 0 ? 1 : 0);
    const busy = mergeIntervals(getClassesForDate(schedules, date).map((item) => ({
      start: Math.max(windowStartMinutes, timeToMinutes(item.startTime)),
      end: Math.min(windowEndMinutes, timeToMinutes(item.endTime)),
    })).filter((interval) => interval.end > interval.start));
    const busyMinutes = busy.reduce((sum, interval) => sum + interval.end - interval.start, 0);
    available += Math.max(0, windowEndMinutes - windowStartMinutes - busyMinutes);
  }
  return Math.round(available);
}

export function calculateDeadlineRisk(task: Task, schedules: ClassSchedule[], now: Date): DeadlineRiskAssessment | null {
  const dueAt = parseLocalTaskDate(task.dueDate);
  const remainingEstimatedMinutes = getRemainingEstimatedMinutes(task);
  if (!dueAt || dueAt <= now || !remainingEstimatedMinutes || task.status === "completed") return null;
  const availableFreeMinutes = calculateAvailableStudyMinutes(schedules, now, dueAt);
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3_600_000;
  let level: DeadlineRiskLevel = availableFreeMinutes >= remainingEstimatedMinutes * 1.5 ? "safe" : availableFreeMinutes >= remainingEstimatedMinutes ? "start_soon" : "at_risk";
  if (hoursUntilDue <= 6 && level === "safe") level = "start_soon";
  if (hoursUntilDue <= 3 && availableFreeMinutes < remainingEstimatedMinutes * 1.25) level = "at_risk";
  return { taskId: task.id, level, remainingEstimatedMinutes, availableFreeMinutes, dueAt };
}
