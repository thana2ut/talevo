import type { AppLanguage } from "@/lib/i18n";
import type { AcademicTerm, AppNotification, ClassSchedule, Exam, NotificationPreferences, Task, UserProfile } from "@/types";
import { calculateDeadlineRisk } from "@/lib/alerts/deadline-risk";
import {
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
  return { classes, dueTasks };
}

export function buildMorningSummary(context: AlertContext): AppNotification | null {
  if (!context.preferences.morning0600 || !isWithinScheduledWindow(context.now, 6, 0, 60)) return null;
  const eventKey = `daily-0600:${localDateKey(context.now)}`;
  if (hasHandledEventKey(context, eventKey)) return null;
  const { classes, dueTasks } = getTodayState(context);
  const classPart = context.language === "th" ? `วันนี้มีเรียน ${classes.length} คาบ${classes[0] ? ` เริ่ม ${classes[0].startTime}` : ""}` : `${classes.length} classes today${classes[0] ? `, starting at ${classes[0].startTime}` : ""}`;
  const taskPart = context.language === "th" ? `มีงานส่งวันนี้ ${dueTasks.length} งาน` : `${dueTasks.length} tasks due today`;
  return createAlert(context.now, {
    type: "morning_summary",
    priority: "normal",
    title: context.language === "th" ? `อรุณสวัสดิ์ ${context.profile.displayName}` : `Good morning, ${context.profile.displayName}`,
    message: [classPart, taskPart].filter(Boolean).join(" · "),
    href: "/today",
    eventKey,
    metadata: { academicTerm: `${context.academicTerm.term} ${context.academicTerm.academicYear}` },
  });
}

export function buildDailyBrief(context: AlertContext): AppNotification | null {
  if (!context.preferences.daily0700 || !isWithinScheduledWindow(context.now, 7, 0, 60)) return null;
  const eventKey = `daily-0700:${localDateKey(context.now)}`;
  if (hasHandledEventKey(context, eventKey)) return null;
  const { classes, dueTasks } = getTodayState(context);
  const risk = context.tasks.map((task) => ({ task, risk: calculateDeadlineRisk(task, context.schedules, context.now) })).find((item) => item.risk?.level === "at_risk");
  const parts = context.language === "th"
    ? [`วันนี้มี ${classes.length} คาบ`, classes[0] ? `คาบแรก ${classes[0].startTime} ${classes[0].name}` : "", dueTasks.length ? `มีงานส่ง ${dueTasks.length} งาน` : "", risk ? `${risk.task.title} เสี่ยงส่งไม่ทัน` : ""]
    : [`${classes.length} classes today`, classes[0] ? `First: ${classes[0].startTime} ${classes[0].name}` : "", dueTasks.length ? `${dueTasks.length} tasks due` : "", risk ? `${risk.task.title} is at risk` : ""];
  return createAlert(context.now, { type: "daily_brief", priority: "normal", title: context.language === "th" ? "วันนี้ของคุณ" : "Your day", message: parts.filter(Boolean).join(" · "), href: "/today", eventKey });
}

export function evaluateClassAlerts(context: AlertContext) {
  const alerts: AppNotification[] = [];
  const occurrences = getClassOccurrences(context.schedules, context.now, addLocalDays(context.now, 1));
  occurrences.forEach((occurrence) => {
    const minutesUntilStart = (occurrence.start.getTime() - context.now.getTime()) / MINUTE_MS;
    if (context.preferences.class30m && isWithinMinuteWindow(minutesUntilStart, 30, 10)) {
      appendIfNew(alerts, context, {
        type: "class_upcoming",
        priority: "medium",
        title: context.language === "th" ? "ใกล้ถึงเวลาเรียน" : "Class starts soon",
        message: `${occurrence.schedule.name} · ${formatRange(occurrence.start, occurrence.end)}${occurrence.schedule.room ? ` · ${occurrence.schedule.room}` : ""}`,
        href: `/schedule?date=${occurrence.dateKey}`,
        eventKey: `class-30m:${occurrence.occurrenceId}`,
        sourceId: occurrence.schedule.id,
      });
    }
    const minutesUntilEnd = (occurrence.end.getTime() - context.now.getTime()) / MINUTE_MS;
    if (context.preferences.classEnd10m && occurrence.start <= context.now && isWithinMinuteWindow(minutesUntilEnd, 10, 5)) {
      const sameDay = occurrences.filter((item) => item.dateKey === occurrence.dateKey && item.start >= occurrence.end);
      const next = sameDay[0];
      const gap = next ? Math.round((next.start.getTime() - occurrence.end.getTime()) / MINUTE_MS) : null;
      const title = gap === 0 ? (context.language === "th" ? "ใกล้เปลี่ยนคาบ" : "Time to switch classes soon") : (context.language === "th" ? "ใกล้หมดคาบ" : "Class ends soon");
      const message = next
        ? (context.language === "th" ? `${occurrence.schedule.name} จบ ${formatTime(occurrence.end)} · คาบถัดไป ${next.schedule.name} ${formatTime(next.start)}${next.schedule.room ? ` · ${next.schedule.room}` : ""}${gap && gap > 0 ? ` · พัก ${gap} นาที` : ""}` : `${occurrence.schedule.name} ends ${formatTime(occurrence.end)} · Next: ${next.schedule.name} ${formatTime(next.start)}${next.schedule.room ? ` · ${next.schedule.room}` : ""}${gap && gap > 0 ? ` · ${gap}-minute break` : ""}`)
        : (context.language === "th" ? `คาบนี้จะจบเวลา ${formatTime(occurrence.end)} · หลังจากนี้วันนี้ไม่มีเรียนต่อแล้ว` : `This class ends at ${formatTime(occurrence.end)} · No more classes today.`);
      appendIfNew(alerts, context, { type: "class_ending", priority: "normal", title, message, href: `/schedule?date=${occurrence.dateKey}`, eventKey: `class-end-10m:${occurrence.occurrenceId}`, sourceId: occurrence.schedule.id, metadata: { gapMinutes: gap } });
    }
  });
  return alerts;
}

export function buildWeeklyRadarAlert(context: AlertContext): AppNotification | null {
  if (!context.preferences.weeklyRadar || context.now.getDay() !== 1 || !isWithinScheduledWindow(context.now, 7, 5, 60)) return null;
  const eventKey = `weekly-radar:${getIsoWeekKey(context.now)}`;
  if (hasHandledEventKey(context, eventKey)) return null;
  const radar = buildWeeklyRadar({ now: context.now, schedules: context.schedules, tasks: context.tasks, exams: [], language: context.language });
  const busiest = new Intl.DateTimeFormat(context.language === "th" ? "th-TH" : "en-GB", { weekday: "long" }).format(radar.busiestDay.date);
  const message = context.language === "th" ? `${context.academicTerm.term} · เรียน ${radar.classCount} คาบ · งานส่ง ${radar.taskCount} งาน · ${busiest}ภาระมากที่สุด${radar.recommendation ? ` · ${radar.recommendation}` : ""}` : `${context.academicTerm.term} · ${radar.classCount} classes · ${radar.taskCount} deadlines · ${busiest} is busiest${radar.recommendation ? ` · ${radar.recommendation}` : ""}`;
  return createAlert(context.now, { type: "weekly_radar", priority: "normal", title: context.language === "th" ? "สัปดาห์นี้ของคุณ" : "Your week", message, href: "/today", eventKey, metadata: { academicYear: context.academicTerm.academicYear } });
}

export function evaluateSmartAlerts(context: AlertContext) {
  if (!context.preferences.enabled) return [];
  if (context.schedules.length === 0 && context.tasks.length === 0) return [];
  const alerts: AppNotification[] = [];
  const morning = buildMorningSummary(context);
  if (morning) alerts.push(morning);
  const daily = buildDailyBrief(context);
  if (daily) alerts.push(daily);
  const weekly = buildWeeklyRadarAlert(context);
  if (weekly) alerts.push(weekly);
  alerts.push(...evaluateDeadlineRiskAlerts(context));
  alerts.push(...evaluateTaskDeadlineAlerts(context));
  alerts.push(...evaluateClassAlerts(context));
  return alerts.sort((first, second) => ({ high: 0, medium: 1, normal: 2 })[first.priority] - ({ high: 0, medium: 1, normal: 2 })[second.priority]);
}
