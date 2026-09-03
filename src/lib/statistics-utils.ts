import { addScheduleDays, createScheduleDate, mondayIndex, startOfScheduleWeek } from "@/lib/schedule-date";
import { getClassDurationMinutes, timeToMinutes } from "@/lib/schedule-utils";
import { parseLocalTaskDate } from "@/lib/task-utils";
import { calculateDeadlineRisk } from "@/lib/alerts/deadline-risk";
import { getExamDate } from "@/lib/academic-utils";
import type { ClassSchedule, Exam, Task, TaskCompletionHistory } from "@/types";

export type StatisticsPeriod = "day" | "week" | "month";

export function startOfDay(date: Date) { return createScheduleDate(date.getFullYear(), date.getMonth(), date.getDate()); }
export function endOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); }
export function isInRange(date: Date, start: Date, end: Date) { return date >= startOfDay(start) && date <= endOfDay(end); }
export function getPeriodDates(mode: StatisticsPeriod, anchor: Date) {
  if (mode === "day") return { start: startOfDay(anchor), end: startOfDay(anchor) };
  if (mode === "week") { const start = startOfScheduleWeek(anchor); return { start, end: addScheduleDays(start, 6) }; }
  return { start: createScheduleDate(anchor.getFullYear(), anchor.getMonth(), 1), end: createScheduleDate(anchor.getFullYear(), anchor.getMonth() + 1, 0) };
}
export function getScheduleOccurrences(schedules: ClassSchedule[], start: Date, end: Date) {
  const dates: { schedule: ClassSchedule; date: Date }[] = [];
  for (let date = startOfDay(start); date <= endOfDay(end); date = addScheduleDays(date, 1)) schedules.filter((item) => item.day === mondayIndex(date)).forEach((schedule) => dates.push({ schedule, date }));
  return dates;
}
export function getScheduleDurationForRange(schedules: ClassSchedule[], start: Date, end: Date) { return getScheduleOccurrences(schedules, start, end).reduce((total, item) => total + getClassDurationMinutes(item.schedule), 0); }
export function getTasksDueInRange(tasks: Task[], start: Date, end: Date) { return tasks.filter((task) => { const date = parseLocalTaskDate(task.dueDate); return date && isInRange(date, start, end); }); }
export function getCompletedTasksInRange(tasks: Task[], history: TaskCompletionHistory[], start: Date, end: Date) {
  const completedTasks = tasks.filter((task) => { const date = task.completedAt ? parseLocalTaskDate(task.completedAt) ?? new Date(task.completedAt) : null; return date && !Number.isNaN(date.getTime()) && isInRange(date, start, end); });
  const historicalTasks = history.filter((item) => { const date = new Date(item.completedAt); return !Number.isNaN(date.getTime()) && isInRange(date, start, end); });
  return [...completedTasks, ...historicalTasks];
}
export function getSubjectDurationBreakdown(schedules: ClassSchedule[], start: Date, end: Date) { const totals = new Map<string, { name: string; minutes: number; color: ClassSchedule["color"] }>(); getScheduleOccurrences(schedules, start, end).forEach(({ schedule }) => { const current = totals.get(schedule.courseId) ?? { name: schedule.name, minutes: 0, color: schedule.color }; current.minutes += getClassDurationMinutes(schedule); totals.set(schedule.courseId, current); }); return [...totals].map(([courseId, value]) => ({ courseId, subject: value.name, minutes: value.minutes, color: value.color })).sort((a, b) => b.minutes - a.minutes); }

export interface DailyStudyCourse {
  courseId: string;
  subject: string;
  minutes: number;
  color: ClassSchedule["color"];
}

export interface DailyStudyBreakdown {
  date: Date;
  minutes: number;
  courses: DailyStudyCourse[];
}

/** Groups real schedule occurrences for a stacked day-by-day study chart. */
export function getDailyStudyBreakdown(schedules: ClassSchedule[], start: Date, end: Date): DailyStudyBreakdown[] {
  const byDay = new Map<string, DailyStudyBreakdown>();
  getScheduleOccurrences(schedules, start, end).forEach(({ schedule, date }) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const day = byDay.get(key) ?? { date, minutes: 0, courses: [] };
    const existing = day.courses.find((course) => course.courseId === schedule.courseId);
    const minutes = getClassDurationMinutes(schedule);
    if (existing) existing.minutes += minutes;
    else day.courses.push({ courseId: schedule.courseId, subject: schedule.name, minutes, color: schedule.color });
    day.minutes += minutes;
    byDay.set(key, day);
  });
  return Array.from({ length: Math.round((endOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000) + 1 }, (_, index) => {
    const date = addScheduleDays(start, index);
    return byDay.get(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`) ?? { date, minutes: 0, courses: [] };
  });
}

export interface UpcomingScheduleOccurrence {
  schedule: ClassSchedule;
  date: Date;
  startAt: Date;
}

/** Finds the next scheduled class from the current local time without UTC conversion. */
export function getNextScheduleOccurrence(schedules: ClassSchedule[], now: Date): UpcomingScheduleOccurrence | null {
  const candidates = getScheduleOccurrences(schedules, startOfDay(now), addScheduleDays(now, 7))
    .map(({ schedule, date }) => {
      const minutes = timeToMinutes(schedule.startTime);
      return { schedule, date, startAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes) };
    })
    .filter((occurrence) => occurrence.startAt >= now)
    .sort((first, second) => first.startAt.getTime() - second.startAt.getTime());
  return candidates[0] ?? null;
}

export function getPreviousPeriodDates(mode: StatisticsPeriod, anchor: Date) {
  if (mode === "day") return getPeriodDates(mode, addScheduleDays(anchor, -1));
  if (mode === "week") return getPeriodDates(mode, addScheduleDays(anchor, -7));
  return getPeriodDates(mode, createScheduleDate(anchor.getFullYear(), anchor.getMonth() - 1, 1));
}

export interface StudyTrendPoint { label: string; minutes: number; }

/** Produces only real schedule durations: daily for day/week, weekly buckets for month. */
export function getStudyTrend(schedules: ClassSchedule[], mode: StatisticsPeriod, anchor: Date): StudyTrendPoint[] {
  const { start, end } = getPeriodDates(mode, anchor);
  const daily = getDailyStudyBreakdown(schedules, start, end);
  if (mode !== "month") return daily.map((day) => ({ label: String(day.date.getDate()), minutes: day.minutes }));
  const weeks = new Map<string, { label: string; minutes: number }>();
  daily.forEach((day) => {
    const weekStart = startOfScheduleWeek(day.date);
    const key = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
    const current = weeks.get(key) ?? { label: `${weekStart.getDate()}`, minutes: 0 };
    current.minutes += day.minutes;
    weeks.set(key, current);
  });
  return [...weeks.values()];
}

export interface TaskPeriodSummary {
  total: number;
  completed: number;
  pending: number;
  dueSoon: number;
  overdueTask?: Task;
  atRiskTask?: Task;
}

/** Chooses the one real unfinished task that deserves attention now, independent of chart range. */
export function getPriorityTaskSummary(tasks: Task[], schedules: ClassSchedule[], now: Date) {
  const pending = tasks.filter((task) => task.completedAt == null);
  const overdueTask = pending
    .filter((task) => { const dueAt = parseLocalTaskDate(task.dueDate); return dueAt !== null && dueAt < now; })
    .sort((first, second) => parseLocalTaskDate(first.dueDate)!.getTime() - parseLocalTaskDate(second.dueDate)!.getTime())[0];
  const atRiskTask = pending
    .map((task) => ({ task, risk: calculateDeadlineRisk(task, schedules, now) }))
    .filter((item) => item.risk?.level === "at_risk" || item.risk?.level === "start_soon")
    .sort((first, second) => first.risk!.dueAt.getTime() - second.risk!.dueAt.getTime())[0]?.task;
  return { overdueTask, atRiskTask };
}

/** Uses completedAt as the completion authority; scope is the selected due-date range. */
export function getTaskPeriodSummary(tasks: Task[], schedules: ClassSchedule[], start: Date, end: Date, now: Date): TaskPeriodSummary {
  const scoped = getTasksDueInRange(tasks, start, end);
  const pending = scoped.filter((task) => task.completedAt == null);
  const overdueTask = pending.find((task) => { const dueAt = parseLocalTaskDate(task.dueDate); return dueAt !== null && dueAt < now; });
  const atRiskTask = pending.find((task) => {
    const risk = calculateDeadlineRisk(task, schedules, now);
    return risk?.level === "at_risk" || risk?.level === "start_soon";
  });
  return { total: scoped.length, completed: scoped.filter((task) => task.completedAt != null).length, pending: pending.length, dueSoon: pending.filter((task) => {
    const risk = calculateDeadlineRisk(task, schedules, now);
    return risk?.level === "at_risk" || risk?.level === "start_soon";
  }).length, overdueTask, atRiskTask };
}

export function getUpcomingExams(exams: Exam[], start: Date, end: Date, now: Date) {
  return exams.filter((exam) => {
    const date = getExamDate(exam);
    return exam.completedAt == null && date !== null && date >= now && isInRange(date, start, end);
  }).sort((first, second) => getExamDate(first)!.getTime() - getExamDate(second)!.getTime());
}

export function getNextUpcomingExam(exams: Exam[], now: Date) {
  return exams.filter((exam) => {
    const date = getExamDate(exam);
    return exam.completedAt == null && date !== null && date >= now;
  }).sort((first, second) => getExamDate(first)!.getTime() - getExamDate(second)!.getTime())[0];
}
