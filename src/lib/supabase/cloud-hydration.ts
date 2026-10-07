import { createEmptyAccountAppState } from "@/lib/app-state-defaults";
import {
  createAppStateSnapshot,
  type AppStateDefaults,
  type PersistedAppState,
} from "@/lib/persistence/app-state-storage";
import type { CloudRow, CloudTables } from "@/lib/supabase/cloud-v8-repository";
import type {
  AppNotification,
  ChatMessage,
  CourseGradePlan,
  Exam,
  ExamType,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransactionType,
  NotificationPriority,
  NotificationType,
  SubjectColor,
  Task,
} from "@/types";

const stringValue = (row: CloudRow | undefined, key: string, fallback = "") =>
  typeof row?.[key] === "string" ? (row[key] as string) : fallback;

const optionalString = (row: CloudRow | undefined, key: string) =>
  typeof row?.[key] === "string" && row[key] !== "" ? (row[key] as string) : undefined;

const numberValue = (row: CloudRow | undefined, key: string, fallback = 0) => {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

const booleanValue = (row: CloudRow | undefined, key: string, fallback = false) =>
  typeof row?.[key] === "boolean" ? (row[key] as boolean) : fallback;

const timeValue = (row: CloudRow | undefined, key: string, fallback = "00:00") => {
  const source = stringValue(row, key, fallback);
  return source.match(/^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/)?.[1] ?? source;
};

const position = (row: CloudRow) => numberValue(row, "position", 0);

/**
 * Robustly and safely converts CloudRows from Supabase into a valid device AppState v8 snapshot.
 * Never throws on missing singletons or unexpected relation gaps; falls back to account defaults.
 */
export function hydrateCloudAccountToAppState(
  tables: CloudTables,
  options: {
    email: string;
    defaults?: AppStateDefaults;
    writerId?: string;
    now?: Date;
  },
): PersistedAppState {
  const profileRow = tables.profiles?.[0];
  const academicRow = tables.academic_terms?.[0];
  const financeSettingsRow = tables.finance_settings?.[0];
  const learningGoalsRow = tables.learning_goals?.[0];
  const appSettingsRow = tables.app_settings?.[0];

  const fallbackDefaults = options.defaults ?? createEmptyAccountAppState();

  const profile = {
    displayName: stringValue(profileRow, "display_name", fallbackDefaults.profile.displayName),
    email: options.email.trim() || fallbackDefaults.profile.email,
    major: stringValue(profileRow, "major", fallbackDefaults.profile.major),
    university: stringValue(profileRow, "university", fallbackDefaults.profile.university),
  };

  const academicTerm = {
    level: stringValue(academicRow, "level", fallbackDefaults.academicTerm.level),
    term: stringValue(academicRow, "term", fallbackDefaults.academicTerm.term),
    academicYear: stringValue(academicRow, "academic_year", fallbackDefaults.academicTerm.academicYear),
    ...(optionalString(academicRow, "label")
      ? { label: optionalString(academicRow, "label") }
      : fallbackDefaults.academicTerm.label
        ? { label: fallbackDefaults.academicTerm.label }
        : {}),
  };

  const subtasksByTask = new Map<string, CloudRow[]>();
  for (const row of tables.task_subtasks ?? []) {
    const parentId = stringValue(row, "task_id");
    subtasksByTask.set(parentId, [...(subtasksByTask.get(parentId) ?? []), row]);
  }

  const attachmentsByTask = new Map<string, CloudRow[]>();
  for (const row of tables.task_attachments ?? []) {
    const parentId = stringValue(row, "task_id");
    attachmentsByTask.set(parentId, [...(attachmentsByTask.get(parentId) ?? []), row]);
  }

  const topicsByExam = new Map<string, CloudRow[]>();
  for (const row of tables.exam_topics ?? []) {
    const parentId = stringValue(row, "exam_id");
    topicsByExam.set(parentId, [...(topicsByExam.get(parentId) ?? []), row]);
  }

  const componentsByPlan = new Map<string, CloudRow[]>();
  for (const row of tables.grade_components ?? []) {
    const parentId = stringValue(row, "grade_plan_id");
    componentsByPlan.set(parentId, [...(componentsByPlan.get(parentId) ?? []), row]);
  }

  const thresholdsByPlan = new Map<string, CloudRow[]>();
  for (const row of tables.grade_thresholds ?? []) {
    const parentId = stringValue(row, "grade_plan_id");
    thresholdsByPlan.set(parentId, [...(thresholdsByPlan.get(parentId) ?? []), row]);
  }

  const categoryById = new Map((tables.finance_categories ?? []).map((row) => [stringValue(row, "id"), row]));

  const financeCategories: FinanceCategory[] = (tables.finance_categories ?? []).map((row) => ({
    id: stringValue(row, "id"),
    name: stringValue(row, "name"),
    type: (stringValue(row, "type") as FinanceTransactionType) || "expense",
    icon: stringValue(row, "icon", "WalletCards"),
    color: (stringValue(row, "color") as SubjectColor) || "purple",
    ...(row.monthly_budget !== null && row.monthly_budget !== undefined
      ? { monthlyBudget: numberValue(row, "monthly_budget") }
      : {}),
    ...(optionalString(row, "created_at") ? { createdAt: optionalString(row, "created_at") } : {}),
    isDefault: booleanValue(row, "is_default"),
  }));

  const financeTransactions: FinanceTransaction[] = (tables.finance_transactions ?? []).map((row) => {
    const category = categoryById.get(stringValue(row, "category_id"));
    const categoryName = category ? stringValue(category, "name") : stringValue(row, "title", "ทั่วไป");
    return {
      id: stringValue(row, "id"),
      type: (stringValue(row, "type") as FinanceTransactionType) || "expense",
      title: stringValue(row, "title"),
      amount: numberValue(row, "amount", 0),
      category: categoryName,
      date: stringValue(row, "date"),
      ...(optionalString(row, "note") ? { note: optionalString(row, "note") } : {}),
    };
  });

  const schedules = (tables.class_schedules ?? []).map((row) => ({
    id: stringValue(row, "id"),
    courseId: stringValue(row, "course_id"),
    name: stringValue(row, "name"),
    teacher: stringValue(row, "teacher"),
    room: stringValue(row, "room"),
    color: stringValue(row, "color", "purple"),
    day: numberValue(row, "day", 0),
    startTime: timeValue(row, "start_time", "09:00"),
    endTime: timeValue(row, "end_time", "10:00"),
    ...(optionalString(row, "note") ? { note: optionalString(row, "note") } : {}),
  }));

  const tasks: Task[] = (tables.tasks ?? []).map((row) => {
    const taskId = stringValue(row, "id");
    return {
      id: taskId,
      title: stringValue(row, "title"),
      ...(optionalString(row, "course_id") ? { courseId: optionalString(row, "course_id") } : {}),
      description: stringValue(row, "description"),
      dueLabel: stringValue(row, "due_label"),
      dueDate: stringValue(row, "due_date"),
      estimate: stringValue(row, "estimate"),
      status: (stringValue(row, "status") as "todo" | "doing" | "completed") || "todo",
      color: stringValue(row, "color", "purple"),
      ...(optionalString(row, "attachment_label") ? { attachment: optionalString(row, "attachment_label") } : {}),
      ...(optionalString(row, "completed_at") ? { completedAt: optionalString(row, "completed_at") } : {}),
      subtasks: (subtasksByTask.get(taskId) ?? [])
        .sort((a, b) => position(a) - position(b))
        .map((child) => ({
          id: stringValue(child, "id"),
          title: stringValue(child, "title"),
          completed: booleanValue(child, "completed"),
          ...(optionalString(child, "completed_at") ? { completedAt: optionalString(child, "completed_at") } : {}),
        })),
      attachments: (attachmentsByTask.get(taskId) ?? []).map((child) => ({
        id: stringValue(child, "id"),
        taskId,
        name: stringValue(child, "name"),
        mimeType: stringValue(child, "mime_type"),
        size: numberValue(child, "size_bytes"),
        kind: (stringValue(child, "kind") as "image" | "file") || "file",
        createdAt: stringValue(child, "created_at"),
      })),
    };
  });

  const taskCompletionHistory = (tables.task_completion_history ?? []).map((row) => ({
    id: stringValue(row, "id"),
    originalTaskId: stringValue(row, "original_task_id"),
    ...(optionalString(row, "course_id") ? { courseId: optionalString(row, "course_id") } : {}),
    completedAt: stringValue(row, "completed_at"),
    ...(optionalString(row, "due_date") ? { dueDate: optionalString(row, "due_date") } : {}),
    ...(optionalString(row, "estimate") ? { estimate: optionalString(row, "estimate") } : {}),
    subtaskCount: numberValue(row, "subtask_count"),
  }));

  const exams: Exam[] = (tables.exams ?? []).map((row) => {
    const examId = stringValue(row, "id");
    return {
      id: examId,
      courseId: stringValue(row, "course_id"),
      title: stringValue(row, "title"),
      type: (stringValue(row, "type") as ExamType) || "quiz",
      startAt: stringValue(row, "start_at"),
      ...(optionalString(row, "end_at") ? { endAt: optionalString(row, "end_at") } : {}),
      ...(optionalString(row, "room") ? { room: optionalString(row, "room") } : {}),
      ...(optionalString(row, "note") ? { note: optionalString(row, "note") } : {}),
      topics: (topicsByExam.get(examId) ?? [])
        .sort((a, b) => position(a) - position(b))
        .map((child) => ({
          id: stringValue(child, "id"),
          title: stringValue(child, "title"),
          completed: booleanValue(child, "completed"),
          ...(optionalString(child, "completed_at") ? { completedAt: optionalString(child, "completed_at") } : {}),
        })),
      ...(optionalString(row, "completed_at") ? { completedAt: optionalString(row, "completed_at") } : {}),
      createdAt: stringValue(row, "created_at"),
      updatedAt: stringValue(row, "updated_at"),
    };
  });

  const gradePlans: CourseGradePlan[] = (tables.grade_plans ?? []).map((row) => {
    const planId = stringValue(row, "id");
    return {
      id: planId,
      courseId: stringValue(row, "course_id"),
      ...(optionalString(row, "target_grade") ? { targetGrade: optionalString(row, "target_grade") } : {}),
      components: (componentsByPlan.get(planId) ?? [])
        .sort((a, b) => position(a) - position(b))
        .map((child) => ({
          id: stringValue(child, "id"),
          name: stringValue(child, "name"),
          weight: numberValue(child, "weight"),
          maxScore: numberValue(child, "max_score"),
          ...(child.earned_score !== null && child.earned_score !== undefined
            ? { earnedScore: numberValue(child, "earned_score") }
            : {}),
          ...(optionalString(child, "note") ? { note: optionalString(child, "note") } : {}),
        })),
      thresholds: (thresholdsByPlan.get(planId) ?? [])
        .sort((a, b) => position(a) - position(b))
        .map((child) => ({
          label: stringValue(child, "label"),
          minimumPercent: numberValue(child, "minimum_percent"),
        })),
    };
  });

  const courseNotes = (tables.course_notes ?? []).map((row) => ({
    id: stringValue(row, "id"),
    courseId: stringValue(row, "course_id"),
    title: stringValue(row, "title"),
    content: stringValue(row, "content"),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    pinned: booleanValue(row, "pinned"),
    ...(optionalString(row, "class_date") ? { classDate: optionalString(row, "class_date") } : {}),
    createdAt: stringValue(row, "created_at"),
    updatedAt: stringValue(row, "updated_at"),
  }));

  const savingGoals = (tables.saving_goals ?? []).map((row) => ({
    id: stringValue(row, "id"),
    title: stringValue(row, "title"),
    targetAmount: numberValue(row, "target_amount"),
    savedAmount: numberValue(row, "saved_amount"),
  }));

  const financeSettings = {
    dailyBudget: numberValue(financeSettingsRow, "daily_budget", fallbackDefaults.financeSettings.dailyBudget),
  };

  const selectedFinanceMonth = stringValue(
    financeSettingsRow,
    "selected_month",
    fallbackDefaults.selectedFinanceMonth,
  );

  const goals = {
    weeklyStudyHours: numberValue(learningGoalsRow, "weekly_study_hours", fallbackDefaults.goals.weeklyStudyHours),
    earlySubmissionDays: numberValue(
      learningGoalsRow,
      "early_submission_days",
      fallbackDefaults.goals.earlySubmissionDays,
    ),
    examPreparationDays: numberValue(
      learningGoalsRow,
      "exam_preparation_days",
      fallbackDefaults.goals.examPreparationDays,
    ),
    personalGoal: stringValue(learningGoalsRow, "personal_goal", fallbackDefaults.goals.personalGoal),
  };

  const notifications: AppNotification[] = (tables.notifications ?? []).map((row) => ({
    id: stringValue(row, "id"),
    type: (stringValue(row, "type") as NotificationType) || "generic",
    priority: (stringValue(row, "priority") as NotificationPriority) || "low",
    title: stringValue(row, "title"),
    message: stringValue(row, "message"),
    createdAt: stringValue(row, "created_at"),
    ...(optionalString(row, "read_at") ? { readAt: optionalString(row, "read_at") } : {}),
    ...(optionalString(row, "href") ? { href: optionalString(row, "href") } : {}),
    eventKey: stringValue(row, "event_key"),
    ...(optionalString(row, "source_id") ? { sourceId: optionalString(row, "source_id") } : {}),
    ...(row.metadata && typeof row.metadata === "object"
      ? { metadata: row.metadata as Record<string, string | number | boolean | null> }
      : {}),
  }));

  const dismissedNotificationEventKeys = (tables.dismissed_notification_events ?? []).map((row) =>
    stringValue(row, "event_key"),
  );

  const settings = {
    timezone: "Asia/Bangkok" as const,
    dateFormat:
      (stringValue(appSettingsRow, "date_format") as "วัน/เดือน/ปี" | "เดือน/วัน/ปี") ||
      fallbackDefaults.settings.dateFormat,
    yearSystem:
      (stringValue(appSettingsRow, "year_system") as "พ.ศ." | "ค.ศ.") ||
      fallbackDefaults.settings.yearSystem,
    notificationPreferences: {
      enabled: booleanValue(appSettingsRow, "alerts_enabled", true),
      task24h: booleanValue(appSettingsRow, "task_24h", true),
      task12h: booleanValue(appSettingsRow, "task_12h", true),
      deadlineRisk: booleanValue(appSettingsRow, "deadline_risk", true),
      morning0600: booleanValue(appSettingsRow, "morning_0600", true),
      daily0700: booleanValue(appSettingsRow, "daily0700", true),
      class30m: booleanValue(appSettingsRow, "class_30m", true),
      classEnd10m: booleanValue(appSettingsRow, "class_end_10m", true),
      exam7d: booleanValue(appSettingsRow, "exam_7d", true),
      exam3d: booleanValue(appSettingsRow, "exam_3d", true),
      exam1d: booleanValue(appSettingsRow, "exam_1d", true),
      examMorning: booleanValue(appSettingsRow, "exam_morning", true),
      weeklyRadar: booleanValue(appSettingsRow, "weekly_radar", true),
      browserNotifications: false,
    },
  };

  const chat = [...(tables.chat_messages ?? [])]
    .sort((a, b) => position(a) - position(b))
    .map((row) => ({
      id: stringValue(row, "id"),
      role: (stringValue(row, "role") as "assistant" | "user") || "user",
      content: stringValue(row, "content"),
      ...(optionalString(row, "kind") ? { kind: optionalString(row, "kind") as ChatMessage["kind"] } : {}),
    }));

  return createAppStateSnapshot(
    {
      profile,
      academicTerm,
      schedules,
      tasks,
      taskCompletionHistory,
      exams: [],
      gradePlans: [],
      courseNotes,
      financeCategories: [],
      financeTransactions: [],
      savingGoals: [],
      financeSettings: fallbackDefaults.financeSettings,
      selectedFinanceMonth,
      goals,
      notifications,
      dismissedNotificationEventKeys,
      settings,
      projects: [],
      chat,
    },
    options.writerId ?? "talevo-cloud-sync",
    options.now ?? new Date(),
  );
}
