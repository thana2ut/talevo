import type { AppLanguage } from "@/lib/i18n";
import type { AcademicTerm, AppNotification, ClassSchedule, Exam, NotificationPreferences, Task, UserProfile } from "@/types";
import { getAcademicWeather } from "@/lib/academic-planning";
import { getExamDate, getExamReadiness } from "@/lib/academic-utils";
import { calculateDeadlineRisk } from "@/lib/alerts/deadline-risk";
import {
  calendarDayDifference,
  getClassesForDate,
  getClassOccurrences,
  getIsoWeekKey,
  isWithinMinuteWindow,
  isWithinScheduledWindow,
  localDateKey,
  MINUTE_MS,
  addLocalDays,
} from "@/lib/alerts/date-time";
import { buildWeeklyRadar } from "@/lib/alerts/weekly-radar";
import { isSameLocalDate, parseLocalTaskDate } from "@/lib/task-utils";

type AlertContext = {
  now: Date;
  tasks: Task[];
  schedules: ClassSchedule[];
  exams: Exam[];
  profile: UserProfile;
  academicTerm: AcademicTerm;
  preferences: NotificationPreferences;
  language: AppLanguage;
  existingEventKeys: ReadonlySet<string>;
  dismissedEventKeys?: ReadonlySet<string>;
};

type NewAlert = Omit<AppNotification, "id" | "createdAt">;

const pad = (value: number) => String(value).padStart(2, "0");
const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const formatRange = (start: Date, end?: Date | null) => end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);

function formatDuration(minutes: number, language: AppLanguage) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (language === "en") return [hours ? `${hours} hr` : "", remaining ? `${remaining} min` : ""].filter(Boolean).join(" ") || "0 min";
  return [hours ? `${hours} ชม.` : "", remaining ? `${remaining} นาที` : ""].filter(Boolean).join(" ") || "0 นาที";
}

function formatExamDate(date: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short" }).format(date);
}

function getCourseName(courseId: string, schedules: ClassSchedule[]) {
  return schedules.find((item) => item.courseId === courseId)?.name;
}

function createAlert(now: Date, alert: NewAlert): AppNotification {
  return { ...alert, id: `notification:${alert.eventKey}`, createdAt: now.toISOString() };
}

function hasHandledEventKey(context: AlertContext, eventKey: string) {
  return context.existingEventKeys.has(eventKey) || context.dismissedEventKeys?.has(eventKey) === true;
}

function appendIfNew(alerts: AppNotification[], context: AlertContext, alert: NewAlert) {
  if (!hasHandledEventKey(context, alert.eventKey) && !alerts.some((item) => item.eventKey === alert.eventKey)) alerts.push(createAlert(context.now, alert));
}

function unfinishedSubtaskText(task: Task, language: AppLanguage) {
  const total = task.subtasks?.length ?? 0;
  if (!total) return "";
  const unfinished = task.subtasks?.filter((item) => !item.completed).length ?? 0;
  return language === "th" ? ` · เหลือ ${unfinished} จาก ${total} ขั้นตอน` : ` · ${unfinished} of ${total} steps remaining`;
}

export function evaluateTaskDeadlineAlerts(context: AlertContext) {
  const alerts: AppNotification[] = [];
  context.tasks.filter((task) => task.status !== "completed").forEach((task) => {
    const due = parseLocalTaskDate(task.dueDate);
    if (!due || due <= context.now) return;
    const remainingMinutes = (due.getTime() - context.now.getTime()) / MINUTE_MS;
    const dueKey = `${localDateKey(due)}T${formatTime(due)}`;
    if (context.preferences.task24h && isWithinMinuteWindow(remainingMinutes, 24 * 60, 60)) {
      appendIfNew(alerts, context, {
        type: "task_deadline",
        priority: "medium",
        title: context.language === "th" ? "งานใกล้ถึงกำหนด" : "Task deadline approaching",
        message: context.language === "th" ? `${task.title} · เหลืออีกประมาณ 1 วัน · ส่ง ${formatTime(due)}${unfinishedSubtaskText(task, context.language)}` : `${task.title} · About 1 day left · Due ${formatTime(due)}${unfinishedSubtaskText(task, context.language)}`,
        href: `/tasks/${task.id}`,
        eventKey: `task-24h:${task.id}:${dueKey}`,
        sourceId: task.id,
      });
    }
    if (context.preferences.task12h && isWithinMinuteWindow(remainingMinutes, 12 * 60, 60)) {
      appendIfNew(alerts, context, {
        type: "task_deadline",
        priority: "high",
        title: context.language === "th" ? "งานใกล้ถึงกำหนด" : "Task deadline approaching",
        message: context.language === "th" ? `${task.title} · เหลือประมาณ 12 ชั่วโมง${unfinishedSubtaskText(task, context.language)}` : `${task.title} · About 12 hours left${unfinishedSubtaskText(task, context.language)}`,
        href: `/tasks/${task.id}`,
        eventKey: `task-12h:${task.id}:${dueKey}`,
        sourceId: task.id,
      });
    }
  });
  return alerts;
}

export function evaluateDeadlineRiskAlerts(context: AlertContext) {
  if (!context.preferences.deadlineRisk) return [];
  const risks = context.tasks
    .map((task) => ({ task, assessment: calculateDeadlineRisk(task, context.schedules, context.now) }))
    .filter((item) => item.assessment?.level === "at_risk")
    .sort((first, second) => (first.assessment?.availableFreeMinutes ?? 0) - (second.assessment?.availableFreeMinutes ?? 0));
  const mostUrgent = risks[0];
  if (!mostUrgent?.assessment) return [];
  const { task, assessment } = mostUrgent;
  const eventKey = `task-risk:${task.id}:at_risk:${localDateKey(assessment.dueAt)}`;
  if (hasHandledEventKey(context, eventKey)) return [];
  return [createAlert(context.now, {
    type: "deadline_risk",
    priority: "high",
    title: context.language === "th" ? "เสี่ยงส่งไม่ทัน" : "Deadline risk",
    message: context.language === "th"
      ? `${task.title} · เหลืองานประมาณ ${formatDuration(assessment.remainingEstimatedMinutes, context.language)} แต่มีเวลาว่างก่อนส่งประมาณ ${formatDuration(assessment.availableFreeMinutes, context.language)}`
      : `${task.title} · About ${formatDuration(assessment.remainingEstimatedMinutes, context.language)} of work remains, with about ${formatDuration(assessment.availableFreeMinutes, context.language)} free before the deadline.`,
    href: `/tasks/${task.id}`,
    eventKey,
    sourceId: task.id,
    metadata: { remainingEstimatedMinutes: assessment.remainingEstimatedMinutes, availableFreeMinutes: assessment.availableFreeMinutes },
  })];
}

function getTodayState(context: AlertContext) {
  const classes = getClassesForDate(context.schedules, context.now);
  const dueTasks = context.tasks.filter((task) => { const due = parseLocalTaskDate(task.dueDate); return task.status !== "completed" && due !== null && isSameLocalDate(due, context.now); });
  const exams = context.exams.filter((exam) => { const date = getExamDate(exam); return !exam.completedAt && date !== null && isSameLocalDate(date, context.now); });
  return { classes, dueTasks, exams };
}

export function buildMorningSummary(context: AlertContext): AppNotification | null {
  if (!context.preferences.morning0600 || !isWithinScheduledWindow(context.now, 6, 0, 60)) return null;
  const eventKey = `daily-0600:${localDateKey(context.now)}`;
  if (hasHandledEventKey(context, eventKey)) return null;
  const { classes, dueTasks, exams } = getTodayState(context);
  const classPart = context.language === "th" ? `วันนี้มีเรียน ${classes.length} คาบ${classes[0] ? ` เริ่ม ${classes[0].startTime}` : ""}` : `${classes.length} classes today${classes[0] ? `, starting at ${classes[0].startTime}` : ""}`;
  const taskPart = context.language === "th" ? `มีงานส่งวันนี้ ${dueTasks.length} งาน` : `${dueTasks.length} tasks due today`;
  const examPart = exams.length ? (context.language === "th" ? `วันนี้มีสอบ ${exams.length} วิชา${exams[0] ? ` · ${getCourseName(exams[0].courseId, context.schedules) ?? exams[0].title} ${formatTime(getExamDate(exams[0])!)}` : ""}` : `${exams.length} exams today${exams[0] ? ` · ${getCourseName(exams[0].courseId, context.schedules) ?? exams[0].title} ${formatTime(getExamDate(exams[0])!)}` : ""}`) : "";
  return createAlert(context.now, {
    type: "morning_summary",
    priority: exams.length ? "high" : "normal",
    title: context.language === "th" ? `อรุณสวัสดิ์ ${context.profile.displayName}` : `Good morning, ${context.profile.displayName}`,
    message: [examPart, classPart, taskPart].filter(Boolean).join(" · "),
    href: "/today",
    eventKey,
    metadata: { includesExamToday: exams.length > 0, academicTerm: `${context.academicTerm.term} ${context.academicTerm.academicYear}` },
  });
}

export function buildDailyBrief(context: AlertContext): AppNotification | null {
  if (!context.preferences.daily0700 || !isWithinScheduledWindow(context.now, 7, 0, 60)) return null;
  const eventKey = `daily-0700:${localDateKey(context.now)}`;
  if (hasHandledEventKey(context, eventKey)) return null;
  const { classes, dueTasks, exams } = getTodayState(context);
  const risk = context.tasks.map((task) => ({ task, risk: calculateDeadlineRisk(task, context.schedules, context.now) })).find((item) => item.risk?.level === "at_risk");
  const parts = context.language === "th"
    ? [`วันนี้มี ${classes.length} คาบ`, classes[0] ? `คาบแรก ${classes[0].startTime} ${classes[0].name}` : "", dueTasks.length ? `มีงานส่ง ${dueTasks.length} งาน` : "", exams.length ? `มีสอบ ${exams.length} วิชา` : "", risk ? `${risk.task.title} เสี่ยงส่งไม่ทัน` : ""]
    : [`${classes.length} classes today`, classes[0] ? `First: ${classes[0].startTime} ${classes[0].name}` : "", dueTasks.length ? `${dueTasks.length} tasks due` : "", exams.length ? `${exams.length} exams today` : "", risk ? `${risk.task.title} is at risk` : ""];
  return createAlert(context.now, { type: "daily_brief", priority: "normal", title: context.language === "th" ? "วันนี้ของคุณ" : "Your day", message: parts.filter(Boolean).join(" · "), href: "/today", eventKey });
}

export function evaluateClassAlerts(context: AlertContext) {
  const alerts: AppNotification[] = [];
  const occurrences = getClassOccurrences(context.schedules, context.now, addLocalDays(context.now, 1));
  occurrences.forEach((occurrence) => {
    const minutesUntilStart = (occurrence.start.getTime() - context.now.getTime()) / MINUTE_MS;
    if (context.preferences.class30m && isWithinMinuteWindow(minutesUntilStart, 30, 3)) {
      appendIfNew(alerts, context, {
        type: "class_upcoming",
        priority: "medium",
        title: context.language === "th" ? "อีก 30 นาทีมีเรียน" : "Class in 30 minutes",
        message: `${occurrence.schedule.name} · ${formatRange(occurrence.start, occurrence.end)}${occurrence.schedule.room ? ` · ${occurrence.schedule.room}` : ""}`,
        href: `/schedule?date=${occurrence.dateKey}`,
        eventKey: `class-30m:${occurrence.occurrenceId}`,
        sourceId: occurrence.schedule.id,
      });
    }
    const minutesUntilEnd = (occurrence.end.getTime() - context.now.getTime()) / MINUTE_MS;
    if (context.preferences.classEnd10m && occurrence.start <= context.now && isWithinMinuteWindow(minutesUntilEnd, 10, 3)) {
      const sameDay = occurrences.filter((item) => item.dateKey === occurrence.dateKey && item.start >= occurrence.end);
      const next = sameDay[0];
      const gap = next ? Math.round((next.start.getTime() - occurrence.end.getTime()) / MINUTE_MS) : null;
      const title = gap === 0 ? (context.language === "th" ? "อีก 10 นาทีเปลี่ยนคาบ" : "Switch classes in 10 minutes") : (context.language === "th" ? "อีก 10 นาทีจะหมดคาบ" : "Class ends in 10 minutes");
      const message = next
        ? (context.language === "th" ? `${occurrence.schedule.name} จบ ${formatTime(occurrence.end)} · คาบถัดไป ${next.schedule.name} ${formatTime(next.start)}${next.schedule.room ? ` · ${next.schedule.room}` : ""}${gap && gap > 0 ? ` · พัก ${gap} นาที` : ""}` : `${occurrence.schedule.name} ends ${formatTime(occurrence.end)} · Next: ${next.schedule.name} ${formatTime(next.start)}${next.schedule.room ? ` · ${next.schedule.room}` : ""}${gap && gap > 0 ? ` · ${gap}-minute break` : ""}`)
        : (context.language === "th" ? `คาบนี้จะจบเวลา ${formatTime(occurrence.end)} · หลังจากนี้วันนี้ไม่มีเรียนต่อแล้ว` : `This class ends at ${formatTime(occurrence.end)} · No more classes today.`);
      appendIfNew(alerts, context, { type: "class_ending", priority: "normal", title, message, href: `/schedule?date=${occurrence.dateKey}`, eventKey: `class-end-10m:${occurrence.occurrenceId}`, sourceId: occurrence.schedule.id, metadata: { gapMinutes: gap } });
    }
  });
  return alerts;
}

export function evaluateExamAlerts(context: AlertContext, morningSummaryExists: boolean) {
  const alerts: AppNotification[] = [];
  const todayExams: Exam[] = [];
  context.exams.filter((exam) => !exam.completedAt).forEach((exam) => {
    const date = getExamDate(exam);
    if (!date) return;
    const days = calendarDayDifference(date, context.now);
    if (days === 0) { todayExams.push(exam); return; }
    const config = days === 7 && context.preferences.exam7d ? { labelTh: "อีก 7 วันมีสอบ", labelEn: "Exam in 7 days", priority: "normal" as const, key: "7d" } : days === 3 && context.preferences.exam3d ? { labelTh: "อีก 3 วันมีสอบ", labelEn: "Exam in 3 days", priority: "medium" as const, key: "3d" } : days === 1 && context.preferences.exam1d ? { labelTh: "พรุ่งนี้มีสอบ", labelEn: "Exam tomorrow", priority: "high" as const, key: "1d" } : null;
    if (!config) return;
    const readiness = getExamReadiness(exam);
    const course = getCourseName(exam.courseId, context.schedules) ?? exam.title;
    const message = `${course} · ${exam.title} · ${formatExamDate(date, context.language)} · ${formatRange(date, exam.endAt ? parseLocalTaskDate(exam.endAt) : null)}${exam.room ? ` · ${exam.room}` : ""}${readiness ? (context.language === "th" ? ` · เตรียมแล้ว ${readiness.completed}/${readiness.total} หัวข้อ` : ` · ${readiness.completed}/${readiness.total} topics ready`) : ""}`;
    appendIfNew(alerts, context, { type: "exam_upcoming", priority: config.priority, title: context.language === "th" ? config.labelTh : config.labelEn, message, href: `/exams/${exam.id}`, eventKey: `exam-${config.key}:${exam.id}:${localDateKey(date)}`, sourceId: exam.id });
  });
  if (context.preferences.examMorning && todayExams.length && !morningSummaryExists && context.now.getHours() < 12) {
    const eventKey = `exam-morning:${localDateKey(context.now)}`;
    const details = todayExams.slice(0, 3).map((exam) => { const date = getExamDate(exam)!; return `${getCourseName(exam.courseId, context.schedules) ?? exam.title} ${formatTime(date)}${exam.room ? ` · ${exam.room}` : ""}`; }).join(" · ");
    appendIfNew(alerts, context, { type: "exam_today", priority: "high", title: context.language === "th" ? (todayExams.length > 1 ? `วันนี้มีสอบ ${todayExams.length} วิชา` : "วันนี้มีสอบ") : (todayExams.length > 1 ? `${todayExams.length} exams today` : "Exam today"), message: details, href: todayExams.length === 1 ? `/exams/${todayExams[0].id}` : "/exams", eventKey, metadata: { examCount: todayExams.length } });
  }
  return alerts;
}

export function buildWeeklyRadarAlert(context: AlertContext): AppNotification | null {
  if (!context.preferences.weeklyRadar || context.now.getDay() !== 1 || !isWithinScheduledWindow(context.now, 7, 5, 60)) return null;
  const eventKey = `weekly-radar:${getIsoWeekKey(context.now)}`;
  if (hasHandledEventKey(context, eventKey)) return null;
  const radar = buildWeeklyRadar({ now: context.now, schedules: context.schedules, tasks: context.tasks, exams: context.exams, language: context.language });
  const busiest = new Intl.DateTimeFormat(context.language === "th" ? "th-TH" : "en-GB", { weekday: "long" }).format(radar.busiestDay.date);
  const message = context.language === "th" ? `${context.academicTerm.term} · เรียน ${radar.classCount} คาบ · งานส่ง ${radar.taskCount} งาน · สอบ ${radar.examCount} วิชา · ${busiest}ภาระมากที่สุด${radar.recommendation ? ` · ${radar.recommendation}` : ""}` : `${context.academicTerm.term} · ${radar.classCount} classes · ${radar.taskCount} deadlines · ${radar.examCount} exams · ${busiest} is busiest${radar.recommendation ? ` · ${radar.recommendation}` : ""}`;
  return createAlert(context.now, { type: "weekly_radar", priority: "normal", title: context.language === "th" ? "สัปดาห์นี้ของคุณ" : "Your week", message, href: "/today#weekly-radar", eventKey, metadata: { academicYear: context.academicTerm.academicYear } });
}

export function evaluateAcademicWeatherAlerts(context: AlertContext) {
  const date = addLocalDays(context.now, 2);
  const forecast = getAcademicWeather(context.schedules, context.tasks, context.exams, date);
  if (forecast.state !== "storm") return [];
  const eventKey = `weather-storm:${localDateKey(date)}:${Math.round(forecast.score)}`;
  if (hasHandledEventKey(context, eventKey)) return [];
  return [createAlert(context.now, { type: "academic_weather", priority: "medium", title: context.language === "th" ? "ภาระหนักกำลังมา" : "Heavy workload ahead", message: context.language === "th" ? `${new Intl.DateTimeFormat("th-TH", { weekday: "long" }).format(date)}: ${forecast.reasons.slice(0, 3).map((reason) => reason.label).join(" · ")}` : `${new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(date)}: ${forecast.reasons.slice(0, 3).map((reason) => reason.label).join(" · ")}`, href: "/today#semester-weather", eventKey })];
}

export function evaluateSmartAlerts(context: AlertContext) {
  if (!context.preferences.enabled) return [];
  const alerts: AppNotification[] = [];
  const morning = buildMorningSummary(context);
  if (morning) alerts.push(morning);
  const morningEventKey = `daily-0600:${localDateKey(context.now)}`;
  const morningExists = Boolean(morning) || hasHandledEventKey(context, morningEventKey);
  const daily = buildDailyBrief(context);
  if (daily) alerts.push(daily);
  const weekly = buildWeeklyRadarAlert(context);
  if (weekly) alerts.push(weekly);
  alerts.push(...evaluateDeadlineRiskAlerts(context));
  alerts.push(...evaluateTaskDeadlineAlerts(context));
  alerts.push(...evaluateClassAlerts(context));
  alerts.push(...evaluateExamAlerts(context, morningExists));
  alerts.push(...evaluateAcademicWeatherAlerts(context));
  return alerts.sort((first, second) => ({ high: 0, medium: 1, normal: 2 })[first.priority] - ({ high: 0, medium: 1, normal: 2 })[second.priority]);
}
