import { evaluateSmartAlerts } from "@/lib/alerts/alert-engine";
import { addLocalDays, getClassOccurrences, MINUTE_MS } from "@/lib/alerts/date-time";
import type { AppLanguage } from "@/lib/i18n";
import { parseLocalTaskDate } from "@/lib/task-utils";
import type { AcademicTerm, ClassSchedule, Exam, NotificationPreferences, Task, UserProfile } from "@/types";

export type ScheduledPush = {
  eventKey: string;
  sendAt: string;
  title: string;
  body: string;
  href: string;
};

type PlanInput = {
  now: Date;
  tasks: Task[];
  exams?: Exam[];
  schedules: ClassSchedule[];
  profile: UserProfile;
  academicTerm: AcademicTerm;
  preferences: NotificationPreferences;
  language: AppLanguage;
};

// How far ahead to queue. The browser rewrites the plan whenever the data
// changes and on every visit, so a week is plenty and keeps the table small.
const HORIZON_DAYS = 7;

/**
 * Candidate instants, not alerts. Each one is a moment the alert engine might
 * have something to say at: a class about to start or end, a deadline coming
 * into range, the morning and daily summaries.
 *
 * Deriving the times here and asking the engine what it would say at each one
 * keeps a single definition of the wording and the rules. Re-implementing the
 * conditions for the server would mean two copies that drift apart.
 */
function candidateInstants(input: PlanInput): Date[] {
  const { now, preferences } = input;
  const horizon = addLocalDays(now, HORIZON_DAYS);
  const instants: Date[] = [];
  const push = (date: Date) => {
    if (date > now && date <= horizon) instants.push(date);
  };

  if (preferences.class30m || preferences.classEnd10m) {
    for (const occurrence of getClassOccurrences(input.schedules, now, horizon)) {
      if (preferences.class30m) push(new Date(occurrence.start.getTime() - 30 * MINUTE_MS));
      if (preferences.classEnd10m) push(new Date(occurrence.end.getTime() - 10 * MINUTE_MS));
    }
  }

  for (const exam of input.exams ?? []) {
    if (exam.completedAt) continue;
    const start = parseLocalTaskDate(exam.startAt);
    if (!start) continue;
    for (const days of [7, 3, 1]) push(new Date(start.getTime() - days * 1440 * MINUTE_MS));
    push(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 6));
  }
  for (const task of input.tasks) {
    if (task.status === "completed") continue;
    const due = parseLocalTaskDate(task.dueDate);
    if (!due) continue;
    if (preferences.task24h) push(new Date(due.getTime() - 24 * 60 * MINUTE_MS));
    if (preferences.task12h) push(new Date(due.getTime() - 12 * 60 * MINUTE_MS));
  }

  for (let day = 0; day <= HORIZON_DAYS; day += 1) {
    const date = addLocalDays(now, day);
    if (preferences.morning0600) push(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 6, 0, 0, 0));
    if (preferences.daily0700) push(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0, 0, 0));
    if (preferences.weeklyRadar) push(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 5, 0, 0));
  }

  return [...new Map(instants.map((date) => [date.getTime(), date])).values()]
    .sort((first, second) => first.getTime() - second.getTime());
}

export function buildPushSchedule(input: PlanInput): ScheduledPush[] {
  if (!input.preferences.enabled) return [];

  const planned = new Map<string, ScheduledPush>();

  for (const instant of candidateInstants(input)) {
    const alerts = evaluateSmartAlerts({
      now: instant,
      tasks: input.tasks,
      schedules: input.schedules,
      exams: input.exams ?? [],
      profile: input.profile,
      academicTerm: input.academicTerm,
      preferences: input.preferences,
      language: input.language,
      // Empty: this asks what the engine would say at that moment, not what is
      // still unseen now. Suppression of already-delivered reminders is the
      // event_key primary key's job.
      existingEventKeys: new Set<string>(),
    });

    for (const alert of alerts) {
      // The earliest instant that produces an alert is the one to send at. A
      // later candidate inside the same window would delay the reminder.
      if (planned.has(alert.eventKey)) continue;
      planned.set(alert.eventKey, {
        eventKey: alert.eventKey,
        sendAt: instant.toISOString(),
        title: alert.title,
        body: alert.message,
        href: alert.href ?? "/notifications",
      });
    }
  }

  return [...planned.values()];
}
