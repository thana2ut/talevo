import type { ClassSchedule } from "@/types";
import { mondayIndex } from "@/lib/schedule-date";
import { timeToMinutes } from "@/lib/schedule-utils";

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTime(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addLocalDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export function calendarDayDifference(later: Date, earlier: Date) {
  const laterUtc = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierUtc = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((laterUtc - earlierUtc) / DAY_MS);
}

export function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function isWithinMinuteWindow(remainingMinutes: number, targetMinutes: number, graceMinutes = 2) {
  return remainingMinutes <= targetMinutes && remainingMinutes > targetMinutes - graceMinutes;
}

export function isWithinScheduledWindow(now: Date, hour: number, minute: number, graceMinutes = 60) {
  const current = minutesSinceMidnight(now);
  const target = hour * 60 + minute;
  return current >= target && current < target + graceMinutes;
}

export type ClassOccurrence = {
  occurrenceId: string;
  dateKey: string;
  schedule: ClassSchedule;
  start: Date;
  end: Date;
};

export function getClassOccurrences(schedules: ClassSchedule[], from: Date, to: Date) {
  const occurrences: ClassOccurrence[] = [];
  for (let date = startOfLocalDay(from); date <= endOfLocalDay(to); date = addLocalDays(date, 1)) {
    const dateKey = localDateKey(date);
    schedules
      .filter((item) => item.day === mondayIndex(date))
      .forEach((schedule) => {
        const start = localDateTime(dateKey, schedule.startTime);
        const end = localDateTime(dateKey, schedule.endTime);
        if (end >= from && start <= to) {
          occurrences.push({ occurrenceId: `${schedule.id}:${dateKey}`, dateKey, schedule, start, end });
        }
      });
  }
  return occurrences.sort((first, second) => first.start.getTime() - second.start.getTime());
}

export function getClassesForDate(schedules: ClassSchedule[], date: Date) {
  return schedules
    .filter((item) => item.day === mondayIndex(date))
    .sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime));
}

export function getIsoWeekKey(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() + 4 - day);
  const yearStart = new Date(copy.getFullYear(), 0, 1);
  const week = Math.ceil((((copy.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
  return `${copy.getFullYear()}-W${pad(week)}`;
}
