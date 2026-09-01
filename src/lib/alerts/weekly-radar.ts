import type { AppLanguage } from "@/lib/i18n";
import type { ClassSchedule, Exam, Task } from "@/types";
import { getExamDate } from "@/lib/academic-utils";
import { calculateDeadlineRisk, type DeadlineRiskAssessment, type DeadlineRiskLevel } from "@/lib/alerts/deadline-risk";
import { addLocalDays, endOfLocalDay, getClassesForDate, localDateKey, startOfLocalDay } from "@/lib/alerts/date-time";
import { getClassDurationMinutes } from "@/lib/schedule-utils";
import { isSameLocalDate, parseLocalTaskDate } from "@/lib/task-utils";

export type RadarDayStatus = "classes" | "deadline" | "critical" | "light" | "neutral";

export type AcademicLoadReason = {
  type: "class" | "task_due" | "deadline_risk" | "exam" | "study_block";
  sourceId?: string;
  label: string;
  minutes?: number;
};

export type AcademicTaskLoad = {
  taskId: string;
  title: string;
  dueAt: Date;
  riskLevel?: DeadlineRiskLevel;
};

export type WeeklyRadarDay = {
  date: Date;
  dateKey: string;
  classCount: number;
  classMinutes: number;
  taskCount: number;
  taskDueCount: number;
  examCount: number;
  riskCount: number;
  taskRiskCount: number;
  scheduledStudyMinutes?: number;
  taskLoads: AcademicTaskLoad[];
  reasons: AcademicLoadReason[];
  workloadPoints: number;
  status: RadarDayStatus;
};

export type AcademicWeekLoad = {
  start: Date;
  end: Date;
  days: WeeklyRadarDay[];
  risks: Array<{ task: Task; assessment: DeadlineRiskAssessment }>;
};

export type WeeklyRadar = {
  start: Date;
  end: Date;
  days: WeeklyRadarDay[];
  classCount: number;
  classMinutes: number;
  taskCount: number;
  examCount: number;
  highestRiskTask?: Task;
  importantExam?: Exam;
  busiestDay: WeeklyRadarDay;
  lightestDay: WeeklyRadarDay;
  recommendation?: string;
};

function getCourseName(courseId: string, schedules: ClassSchedule[]) {
  return schedules.find((item) => item.courseId === courseId)?.name;
}

function classReason(item: ClassSchedule, minutes: number, language: AppLanguage): AcademicLoadReason {
  return { type: "class", sourceId: item.id, minutes, label: language === "th" ? `เรียน ${item.name} ${minutes} นาที` : `${item.name} class · ${minutes} min` };
}

function taskReason(task: Task, language: AppLanguage): AcademicLoadReason {
  return { type: "task_due", sourceId: task.id, label: language === "th" ? `งานส่ง ${task.title}` : `${task.title} is due` };
}

function riskReason(task: Task, language: AppLanguage): AcademicLoadReason {
  return { type: "deadline_risk", sourceId: task.id, label: language === "th" ? `${task.title} เสี่ยงส่งไม่ทัน` : `${task.title} is at deadline risk` };
}

function examReason(exam: Exam, schedules: ClassSchedule[], language: AppLanguage): AcademicLoadReason {
  const course = getCourseName(exam.courseId, schedules) ?? exam.title;
  return { type: "exam", sourceId: exam.id, label: language === "th" ? `สอบ ${course} · ${exam.title}` : `${course} · ${exam.title} exam` };
}

/** Single source of truth for today + the next six local calendar days. */
export function buildAcademicWeekLoad({ now, schedules, tasks, exams, language }: { now: Date; schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[]; language: AppLanguage }): AcademicWeekLoad {
  const start = startOfLocalDay(now);
  const end = endOfLocalDay(addLocalDays(start, 6));
  const activeTasks = tasks.filter((task) => task.status !== "completed");
  const risks = activeTasks.map((task) => ({ task, assessment: calculateDeadlineRisk(task, schedules, now) })).filter((item): item is { task: Task; assessment: DeadlineRiskAssessment } => item.assessment !== null);
  const riskByTaskId = new Map(risks.map((item) => [item.task.id, item.assessment]));
  const days = Array.from({ length: 7 }, (_, index): WeeklyRadarDay => {
    const date = addLocalDays(start, index);
    const classes = getClassesForDate(schedules, date);
    const dayTasks = activeTasks.filter((task) => { const due = parseLocalTaskDate(task.dueDate); return due ? isSameLocalDate(due, date) : false; });
    const dayExams = exams.filter((exam) => { const examDate = getExamDate(exam); return !exam.completedAt && examDate ? isSameLocalDate(examDate, date) : false; });
    const taskLoads = dayTasks.flatMap((task): AcademicTaskLoad[] => { const dueAt = parseLocalTaskDate(task.dueDate); return dueAt ? [{ taskId: task.id, title: task.title, dueAt, riskLevel: riskByTaskId.get(task.id)?.level }] : []; });
    const atRiskTasks = dayTasks.filter((task) => riskByTaskId.get(task.id)?.level === "at_risk");
    const classDurations = classes.map((item) => ({ item, minutes: Math.max(0, getClassDurationMinutes(item)) }));
    const classMinutes = classDurations.reduce((total, item) => total + item.minutes, 0);
    const workloadPoints = classMinutes + dayTasks.length * 90 + dayExams.length * 180 + atRiskTasks.length * 120;
    const status: RadarDayStatus = dayExams.length || atRiskTasks.length ? "critical" : dayTasks.length ? "deadline" : classes.length ? "classes" : "light";
    const reasons: AcademicLoadReason[] = [...classDurations.map(({ item, minutes }) => classReason(item, minutes, language)), ...dayTasks.map((task) => taskReason(task, language)), ...atRiskTasks.map((task) => riskReason(task, language)), ...dayExams.map((exam) => examReason(exam, schedules, language))];
    return { date, dateKey: localDateKey(date), classCount: classes.length, classMinutes, taskCount: dayTasks.length, taskDueCount: dayTasks.length, examCount: dayExams.length, riskCount: atRiskTasks.length, taskRiskCount: atRiskTasks.length, taskLoads, reasons, workloadPoints, status };
  });
  return { start, end, days, risks };
}

function makeRecommendation(language: AppLanguage, radar: Omit<WeeklyRadar, "recommendation">, schedules: ClassSchedule[]) {
  if (radar.highestRiskTask) return language === "th" ? `เริ่ม ${radar.highestRiskTask.title} ในช่วงว่างถัดไป เพื่อลดความเสี่ยงก่อนกำหนดส่ง` : `Start ${radar.highestRiskTask.title} in your next free window to reduce deadline risk.`;
  const exam = radar.importantExam;
  if (!exam || !exam.topics.some((topic) => !topic.completed)) return undefined;
  const examDate = getExamDate(exam);
  if (!examDate) return undefined;
  const bestDay = [...radar.days.filter((day) => day.date < startOfLocalDay(examDate))].sort((first, second) => first.workloadPoints - second.workloadPoints)[0];
  if (!bestDay) return undefined;
  const course = getCourseName(exam.courseId, schedules) ?? exam.title;
  const dateLabel = new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { weekday: "long" }).format(bestDay.date);
  return language === "th" ? `เริ่มอ่าน ${course} ภายใน${dateLabel} เพราะเป็นวันที่ภาระเบากว่าก่อนสอบ` : `Start reviewing ${course} by ${dateLabel}, the lighter day before the exam.`;
}

export function buildWeeklyRadar(input: { now: Date; schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[]; language: AppLanguage }): WeeklyRadar {
  const load = buildAcademicWeekLoad(input);
  const tasksInRange = new Set(load.days.flatMap((day) => day.taskLoads.map((task) => task.taskId)));
  const examsInRange = input.exams.filter((exam) => { const date = getExamDate(exam); return !exam.completedAt && date !== null && date >= load.start && date <= load.end; });
  const busiestDay = [...load.days].sort((first, second) => second.workloadPoints - first.workloadPoints)[0];
  const lightestDay = [...load.days].sort((first, second) => first.workloadPoints - second.workloadPoints)[0];
  const highestRiskTask = load.risks.find(({ assessment }) => assessment.level === "at_risk")?.task;
  const importantExam = [...examsInRange].sort((first, second) => first.startAt.localeCompare(second.startAt))[0];
  const base = { start: load.start, end: load.end, days: load.days, classCount: load.days.reduce((total, day) => total + day.classCount, 0), classMinutes: load.days.reduce((total, day) => total + day.classMinutes, 0), taskCount: tasksInRange.size, examCount: examsInRange.length, highestRiskTask, importantExam, busiestDay, lightestDay };
  return { ...base, recommendation: makeRecommendation(input.language, base, input.schedules) };
}
