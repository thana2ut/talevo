import type { ClassSchedule, Exam, Task } from "@/types";
import { calculateDeadlineRisk } from "@/lib/alerts/deadline-risk";
import { getClassesForDate, localDateKey } from "@/lib/alerts/date-time";
import { getExamDate } from "@/lib/academic-utils";
import { timeToMinutes } from "@/lib/schedule-utils";
import { parseLocalTaskDate } from "@/lib/task-utils";

export type AcademicReason = { type: "class_load" | "task_due" | "exam" | "deadline_risk"; label: string; value?: string };
export type AcademicWeatherState = "clear" | "light" | "moderate" | "heavy" | "storm";

export interface DailyStudyLoad {
  date: Date;
  totalMinutes: number;
  classCount: number;
  severity: AcademicWeatherState;
}

export type AcademicWeatherDay = {
  date: Date;
  score: number;
  state: AcademicWeatherState;
  reasons: AcademicReason[];
  classMinutes: number;
  dueTasks: Task[];
  dailyLoad: DailyStudyLoad;
};

/**
 * Calculate total non-overlapping scheduled class minutes for a given date.
 * Excludes deleted/invalid records where endTime <= startTime.
 * Merges overlapping intervals to prevent double-counting.
 */
export function calculateScheduledClassMinutes(schedules: ClassSchedule[], date: Date): number {
  const classes = getClassesForDate(schedules, date);
  const intervals: [number, number][] = [];

  for (const item of classes) {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      intervals.push([start, end]);
    }
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    if (merged.length === 0 || start > merged[merged.length - 1][1]) {
      merged.push([start, end]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    }
  }

  return merged.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/**
 * Canonical study load classification:
 * 0 - 3 hours (<= 180 min) -> เบา ("light")
 * > 3 - 6 hours (181 - 360 min) -> ปานกลาง ("moderate")
 * > 6 - 8 hours (361 - 480 min) -> หนัก ("heavy")
 * > 8 hours (> 480 min) -> หนักมาก ("storm")
 */
export function classifyStudyLoad(classMinutes: number): AcademicWeatherState {
  const hours = classMinutes / 60;
  if (hours <= 3) return "light";
  if (hours <= 6) return "moderate";
  if (hours <= 8) return "heavy";
  return "storm";
}

/**
 * Single canonical calculator for daily study load.
 * Returns date, union totalMinutes, actual classCount, and severity.
 * All study-load UI surfaces must consume this single source of truth.
 */
export function getDailyStudyLoad(date: Date, schedules: ClassSchedule[]): DailyStudyLoad {
  const classes = getClassesForDate(schedules, date);
  const validClasses = classes.filter((item) => {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  });

  const totalMinutes = calculateScheduledClassMinutes(schedules, date);
  const severity = classifyStudyLoad(totalMinutes);

  return {
    date,
    totalMinutes,
    classCount: validClasses.length,
    severity,
  };
}

export const STUDY_LOAD_SUPPORTIVE_COPY: Record<AcademicWeatherState, string> = {
  clear: "วันนี้สบาย ๆ ใช้เวลาว่างให้เต็มที่นะ",
  light: "วันนี้สบาย ๆ ใช้เวลาว่างให้เต็มที่นะ",
  moderate: "วันนี้กำลังพอดี ค่อย ๆ ทำไปทีละอย่างนะ",
  heavy: "วันนี้ค่อนข้างแน่น อย่าลืมหาเวลาพักด้วยนะ",
  storm: "วันนี้หนักเป็นพิเศษ ดูแลตัวเองและพักเป็นช่วง ๆ นะ",
};

/**
 * Get supportive Thai copy for a specific study load severity.
 * Strictly uses "วันนี้" only when the target date is actually today.
 */
export function getStudyLoadSupportiveCopy(severity: AcademicWeatherState, isToday: boolean): string {
  if (isToday) {
    switch (severity) {
      case "clear":
      case "light":
        return "วันนี้สบาย ๆ ใช้เวลาว่างให้เต็มที่นะ";
      case "moderate":
        return "วันนี้กำลังพอดี ค่อย ๆ ทำไปทีละอย่างนะ";
      case "heavy":
        return "วันนี้ค่อนข้างแน่น อย่าลืมหาเวลาพักด้วยนะ";
      case "storm":
        return "วันนี้หนักเป็นพิเศษ ดูแลตัวเองและพักเป็นช่วง ๆ นะ";
    }
  }

  // Not today: use date-aware neutral copy without "วันนี้"
  switch (severity) {
    case "clear":
    case "light":
      return "วันนั้นตารางค่อนข้างเบา ใช้เวลาว่างพักหรือเตรียมตัวล่วงหน้าได้นะ";
    case "moderate":
      return "วันนั้นตารางกำลังพอดี ค่อย ๆ จัดการไปทีละอย่างนะ";
    case "heavy":
      return "วันนั้นตารางค่อนข้างแน่น อย่าลืมเผื่อเวลาพักด้วยนะ";
    case "storm":
      return "วันนั้นตารางหนักเป็นพิเศษ วางแผนล่วงหน้าและพักผ่อนให้เพียงพอนะ";
  }
}

export const EMPTY_STUDY_LOAD_COPY = "ช่วงนี้ตารางค่อนข้างสบาย ใช้เวลาพักหรือเตรียมตัวล่วงหน้าได้นะ";

export const STUDY_LOAD_SEVERITY_RANK: Record<AcademicWeatherState, number> = {
  storm: 4,
  heavy: 3,
  moderate: 2,
  light: 1,
  clear: 1,
};

/**
 * Format minutes into canonical readable Thai duration string:
 * e.g. "เรียน 2 ชั่วโมง", "เรียน 4 ชั่วโมง", "เรียน 8 ชั่วโมง", "เรียน 4 ชม. 30 นาที"
 */
export function formatStudyDuration(minutes: number, prefix = true): string {
  if (minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const lead = prefix ? "เรียน " : "";
  if (mins === 0) {
    return `${lead}${hours} ชั่วโมง`;
  }
  if (hours === 0) {
    return `${lead}${mins} นาที`;
  }
  return `${lead}${hours} ชม. ${mins} นาที`;
}

/**
 * Find the most demanding upcoming day within the visible 7-day window.
 * Priority: storm (หนักมาก) > heavy (หนัก) > moderate (ปานกลาง) > light (เบา).
 * Ties choose the nearest upcoming day.
 * If there are no scheduled classes in the 7-day period, returns null.
 */
export function getMostDemandingDay(forecast: AcademicWeatherDay[]): AcademicWeatherDay | null {
  const withClasses = forecast.filter((item) => item.classMinutes > 0);
  if (withClasses.length === 0) {
    return null;
  }

  let best = withClasses[0];
  let bestRank = STUDY_LOAD_SEVERITY_RANK[best.state];

  for (let i = 1; i < withClasses.length; i++) {
    const current = withClasses[i];
    const rank = STUDY_LOAD_SEVERITY_RANK[current.state];
    if (rank > bestRank) {
      best = current;
      bestRank = rank;
    }
  }

  return best;
}

export function getAcademicWeather(
  schedules: ClassSchedule[],
  tasks: Task[],
  exams: Exam[],
  date: Date
): AcademicWeatherDay {
  const key = localDateKey(date);
  const reasons: AcademicReason[] = [];

  const dailyLoad = getDailyStudyLoad(date, schedules);

  if (dailyLoad.totalMinutes > 0) {
    reasons.push({
      type: "class_load",
      label: formatStudyDuration(dailyLoad.totalMinutes),
      value: `${dailyLoad.classCount} คาบ`,
    });
  }

  const dueTasks = tasks.filter(
    (task) =>
      task.status !== "completed" &&
      parseLocalTaskDate(task.dueDate) &&
      localDateKey(parseLocalTaskDate(task.dueDate)!) === key
  );
  dueTasks.forEach((task) => {
    reasons.push({ type: "task_due", label: `ส่งงาน: ${task.title}`, value: task.estimate || undefined });
  });

  exams
    .filter((exam) => {
      const examDate = getExamDate(exam);
      return examDate !== null && localDateKey(examDate) === key;
    })
    .forEach((exam) => {
      reasons.push({ type: "exam", label: `สอบ: ${exam.title}` });
    });

  tasks.forEach((task) => {
    const risk = calculateDeadlineRisk(task, schedules, date);
    if (risk?.level === "at_risk" && localDateKey(risk.dueAt) === key) {
      reasons.push({ type: "deadline_risk", label: `${task.title} เสี่ยงส่งไม่ทัน` });
    }
  });

  return {
    date,
    score: dailyLoad.totalMinutes / 60,
    state: dailyLoad.severity,
    reasons,
    classMinutes: dailyLoad.totalMinutes,
    dueTasks,
    dailyLoad,
  };
}
