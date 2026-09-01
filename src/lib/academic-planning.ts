import type { ClassSchedule, Exam, Task } from "@/types";
import { calculateDeadlineRisk } from "@/lib/alerts/deadline-risk";
import { getClassesForDate, localDateKey } from "@/lib/alerts/date-time";
import { getExamDate } from "@/lib/academic-utils";
import { timeToMinutes } from "@/lib/schedule-utils";
import { parseLocalTaskDate } from "@/lib/task-utils";

export type AcademicReason = { type: "class_load" | "task_due" | "exam" | "deadline_risk"; label: string; value?: string };
export type AcademicWeatherState = "clear" | "light" | "moderate" | "heavy" | "storm";
export function getAcademicWeather(schedules: ClassSchedule[], tasks: Task[], exams: Exam[], date: Date) {
  const key = localDateKey(date);
  const reasons: AcademicReason[] = [];
  let score = 0;
  const classes = getClassesForDate(schedules, date);
  const classMinutes = classes.reduce((sum, item) => sum + Math.max(0, timeToMinutes(item.endTime) - timeToMinutes(item.startTime)), 0);
  if (classMinutes) { score += classMinutes / 60; reasons.push({ type: "class_load", label: `เรียน ${Math.round(classMinutes / 30) / 2} ชั่วโมง`, value: `${classes.length} คาบ` }); }
  const dueTasks = tasks.filter((task) => task.status !== "completed" && parseLocalTaskDate(task.dueDate) && localDateKey(parseLocalTaskDate(task.dueDate)!) === key);
  dueTasks.forEach((task) => { score += 3; reasons.push({ type: "task_due", label: `ส่งงาน: ${task.title}`, value: task.estimate || undefined }); });
  exams.filter((exam) => { const examDate = getExamDate(exam); return examDate !== null && localDateKey(examDate) === key; }).forEach((exam) => { score += 5; reasons.push({ type: "exam", label: `สอบ: ${exam.title}` }); });
  tasks.forEach((task) => { const risk = calculateDeadlineRisk(task, schedules, date); if (risk?.level === "at_risk" && localDateKey(risk.dueAt) === key) { score += 2; reasons.push({ type: "deadline_risk", label: `${task.title} เสี่ยงส่งไม่ทัน` }); } });
  const state: AcademicWeatherState = score < 1 ? "clear" : score < 3 ? "light" : score < 6 ? "moderate" : score < 9 ? "heavy" : "storm";
  return { date, score, state, reasons, classMinutes, dueTasks };
}
