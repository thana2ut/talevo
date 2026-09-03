import { createEmptyAccountAppState } from "@/lib/app-state-defaults";
import {
  createAppStateSnapshot,
  writeAppStateSnapshot,
  type PersistedAppState,
  type StorageLike,
} from "@/lib/persistence/app-state-storage";
import { createAccountStateStorage, recordLocalOwnershipDecision } from "@/lib/persistence/local-account-storage";
import { isQaDomainEmpty } from "@/lib/supabase/qa-local-v8-fixture";
import type { CloudRow, CloudTables } from "@/lib/supabase/cloud-v8-repository";
import type {
  AppNotification,
  ChatMessage,
  ExamType,
  FinanceTransactionType,
  NotificationPriority,
  NotificationType,
  SubjectColor,
} from "@/types";

export const QA_HYDRATION_CONFIRMATION = "เขียน Cloud QA ลงอุปกรณ์นี้";

const stringValue = (row: CloudRow, key: string) => typeof row[key] === "string" ? row[key] as string : "";
const optionalString = (row: CloudRow, key: string) => typeof row[key] === "string" && row[key] !== "" ? row[key] as string : undefined;
const numberValue = (row: CloudRow, key: string) => {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`qa_cloud_invalid_number:${key}`);
  return value;
};
const booleanValue = (row: CloudRow, key: string) => row[key] === true;
const timeValue = (row: CloudRow, key: string) => {
  const source = stringValue(row, key);
  return source.match(/^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/)?.[1] ?? source;
};
const position = (row: CloudRow) => numberValue(row, "position");

function singleton(tables: CloudTables, table: "profiles" | "academic_terms" | "finance_settings" | "learning_goals" | "app_settings") {
  if (tables[table].length !== 1) throw new Error(`qa_cloud_singleton_invalid:${table}`);
  return tables[table][0];
}

/** Converts normalized Cloud rows back to a valid device-local AppState v8 snapshot. */
export function hydrateCloudTablesToAppState(
  tables: CloudTables,
  options: { email: string; writerId?: string; now?: Date },
): PersistedAppState {
  const profile = singleton(tables, "profiles");
  const academic = singleton(tables, "academic_terms");
  const financeSettings = singleton(tables, "finance_settings");
  const learningGoals = singleton(tables, "learning_goals");
  const appSettings = singleton(tables, "app_settings");
  const defaults = createEmptyAccountAppState({
    displayName: stringValue(profile, "display_name"),
    email: options.email.trim(),
    major: stringValue(profile, "major"),
    university: stringValue(profile, "university"),
  }, {
    level: stringValue(academic, "level"),
    term: stringValue(academic, "term"),
    academicYear: stringValue(academic, "academic_year"),
    ...(optionalString(academic, "label") ? { label: optionalString(academic, "label") } : {}),
  });

  const subtasksByTask = new Map<string, CloudRow[]>();
  for (const row of tables.task_subtasks) {
    const parentId = stringValue(row, "task_id");
    subtasksByTask.set(parentId, [...(subtasksByTask.get(parentId) ?? []), row]);
  }
  const attachmentsByTask = new Map<string, CloudRow[]>();
  for (const row of tables.task_attachments) {
    const parentId = stringValue(row, "task_id");
    attachmentsByTask.set(parentId, [...(attachmentsByTask.get(parentId) ?? []), row]);
  }
  const topicsByExam = new Map<string, CloudRow[]>();
  for (const row of tables.exam_topics) {
    const parentId = stringValue(row, "exam_id");
    topicsByExam.set(parentId, [...(topicsByExam.get(parentId) ?? []), row]);
  }
  const componentsByPlan = new Map<string, CloudRow[]>();
  for (const row of tables.grade_components) {
    const parentId = stringValue(row, "grade_plan_id");
    componentsByPlan.set(parentId, [...(componentsByPlan.get(parentId) ?? []), row]);
  }
  const thresholdsByPlan = new Map<string, CloudRow[]>();
  for (const row of tables.grade_thresholds) {
    const parentId = stringValue(row, "grade_plan_id");
    thresholdsByPlan.set(parentId, [...(thresholdsByPlan.get(parentId) ?? []), row]);
  }
  const categoryById = new Map(tables.finance_categories.map((row) => [stringValue(row, "id"), row]));

  const snapshot = createAppStateSnapshot({
    ...defaults,
    schedules: tables.class_schedules.map((row) => ({ id: stringValue(row, "id"), courseId: stringValue(row, "course_id"), name: stringValue(row, "name"), teacher: stringValue(row, "teacher"), room: stringValue(row, "room"), color: stringValue(row, "color"), day: numberValue(row, "day"), startTime: timeValue(row, "start_time"), endTime: timeValue(row, "end_time"), ...(optionalString(row, "note") ? { note: optionalString(row, "note") } : {}) })),
    tasks: tables.tasks.map((row) => {
      const taskId = stringValue(row, "id");
      return {
        id: taskId, title: stringValue(row, "title"), ...(optionalString(row, "course_id") ? { courseId: optionalString(row, "course_id") } : {}),
        description: stringValue(row, "description"), dueLabel: stringValue(row, "due_label"), dueDate: stringValue(row, "due_date"), estimate: stringValue(row, "estimate"),
        status: stringValue(row, "status") as "todo" | "doing" | "completed", color: stringValue(row, "color"),
        ...(optionalString(row, "attachment_label") ? { attachment: optionalString(row, "attachment_label") } : {}),
        ...(optionalString(row, "completed_at") ? { completedAt: optionalString(row, "completed_at") } : {}),
        subtasks: (subtasksByTask.get(taskId) ?? []).sort((a, b) => position(a) - position(b)).map((child) => ({ id: stringValue(child, "id"), title: stringValue(child, "title"), completed: booleanValue(child, "completed"), ...(optionalString(child, "completed_at") ? { completedAt: optionalString(child, "completed_at") } : {}) })),
        attachments: (attachmentsByTask.get(taskId) ?? []).map((child) => ({ id: stringValue(child, "id"), taskId, name: stringValue(child, "name"), mimeType: stringValue(child, "mime_type"), size: numberValue(child, "size_bytes"), kind: stringValue(child, "kind") as "image" | "file", createdAt: stringValue(child, "created_at") })),
      };
    }),
    taskCompletionHistory: tables.task_completion_history.map((row) => ({ id: stringValue(row, "id"), originalTaskId: stringValue(row, "original_task_id"), ...(optionalString(row, "course_id") ? { courseId: optionalString(row, "course_id") } : {}), completedAt: stringValue(row, "completed_at"), ...(optionalString(row, "due_date") ? { dueDate: optionalString(row, "due_date") } : {}), ...(optionalString(row, "estimate") ? { estimate: optionalString(row, "estimate") } : {}), subtaskCount: numberValue(row, "subtask_count") })),
    exams: tables.exams.map((row) => {
      const examId = stringValue(row, "id");
      return { id: examId, courseId: stringValue(row, "course_id"), title: stringValue(row, "title"), type: stringValue(row, "type") as ExamType, startAt: stringValue(row, "start_at"), ...(optionalString(row, "end_at") ? { endAt: optionalString(row, "end_at") } : {}), ...(optionalString(row, "room") ? { room: optionalString(row, "room") } : {}), ...(optionalString(row, "note") ? { note: optionalString(row, "note") } : {}), topics: (topicsByExam.get(examId) ?? []).sort((a, b) => position(a) - position(b)).map((child) => ({ id: stringValue(child, "id"), title: stringValue(child, "title"), completed: booleanValue(child, "completed"), ...(optionalString(child, "completed_at") ? { completedAt: optionalString(child, "completed_at") } : {}) })), ...(optionalString(row, "completed_at") ? { completedAt: optionalString(row, "completed_at") } : {}), createdAt: stringValue(row, "created_at"), updatedAt: stringValue(row, "updated_at") };
    }),
    gradePlans: tables.grade_plans.map((row) => {
      const planId = stringValue(row, "id");
      return { id: planId, courseId: stringValue(row, "course_id"), ...(optionalString(row, "target_grade") ? { targetGrade: optionalString(row, "target_grade") } : {}), components: (componentsByPlan.get(planId) ?? []).sort((a, b) => position(a) - position(b)).map((child) => ({ id: stringValue(child, "id"), name: stringValue(child, "name"), weight: numberValue(child, "weight"), maxScore: numberValue(child, "max_score"), ...(child.earned_score !== null && child.earned_score !== undefined ? { earnedScore: numberValue(child, "earned_score") } : {}), ...(optionalString(child, "note") ? { note: optionalString(child, "note") } : {}) })), thresholds: (thresholdsByPlan.get(planId) ?? []).sort((a, b) => position(a) - position(b)).map((child) => ({ label: stringValue(child, "label"), minimumPercent: numberValue(child, "minimum_percent") })) };
    }),
    courseNotes: tables.course_notes.map((row) => ({ id: stringValue(row, "id"), courseId: stringValue(row, "course_id"), title: stringValue(row, "title"), content: stringValue(row, "content"), tags: Array.isArray(row.tags) ? row.tags.map(String) : [], pinned: booleanValue(row, "pinned"), ...(optionalString(row, "class_date") ? { classDate: optionalString(row, "class_date") } : {}), createdAt: stringValue(row, "created_at"), updatedAt: stringValue(row, "updated_at") })),
    financeCategories: tables.finance_categories.map((row) => ({ id: stringValue(row, "id"), name: stringValue(row, "name"), type: stringValue(row, "type") as FinanceTransactionType, icon: stringValue(row, "icon"), color: stringValue(row, "color") as SubjectColor, ...(row.monthly_budget !== null && row.monthly_budget !== undefined ? { monthlyBudget: numberValue(row, "monthly_budget") } : {}), ...(optionalString(row, "created_at") ? { createdAt: optionalString(row, "created_at") } : {}), isDefault: booleanValue(row, "is_default") })),
    financeTransactions: tables.finance_transactions.map((row) => {
      const category = categoryById.get(stringValue(row, "category_id"));
      if (!category || stringValue(category, "type") !== stringValue(row, "type")) throw new Error("qa_cloud_finance_relation_invalid");
      return { id: stringValue(row, "id"), type: stringValue(row, "type") as FinanceTransactionType, title: stringValue(row, "title"), amount: numberValue(row, "amount"), category: stringValue(category, "name"), date: stringValue(row, "date"), ...(optionalString(row, "note") ? { note: optionalString(row, "note") } : {}) };
    }),
    savingGoals: tables.saving_goals.map((row) => ({ id: stringValue(row, "id"), title: stringValue(row, "title"), targetAmount: numberValue(row, "target_amount"), savedAmount: numberValue(row, "saved_amount") })),
    financeSettings: { dailyBudget: numberValue(financeSettings, "daily_budget") },
    selectedFinanceMonth: stringValue(financeSettings, "selected_month"),
    goals: { weeklyStudyHours: numberValue(learningGoals, "weekly_study_hours"), earlySubmissionDays: numberValue(learningGoals, "early_submission_days"), examPreparationDays: numberValue(learningGoals, "exam_preparation_days"), personalGoal: stringValue(learningGoals, "personal_goal") },
    notifications: tables.notifications.map((row) => ({ id: stringValue(row, "id"), type: stringValue(row, "type") as NotificationType, priority: stringValue(row, "priority") as NotificationPriority, title: stringValue(row, "title"), message: stringValue(row, "message"), createdAt: stringValue(row, "created_at"), ...(optionalString(row, "read_at") ? { readAt: optionalString(row, "read_at") } : {}), ...(optionalString(row, "href") ? { href: optionalString(row, "href") } : {}), eventKey: stringValue(row, "event_key"), ...(optionalString(row, "source_id") ? { sourceId: optionalString(row, "source_id") } : {}), ...(row.metadata && typeof row.metadata === "object" ? { metadata: row.metadata as Record<string, string | number | boolean | null> } : {}) })) as AppNotification[],
    dismissedNotificationEventKeys: tables.dismissed_notification_events.map((row) => stringValue(row, "event_key")),
    settings: { timezone: "Asia/Bangkok", dateFormat: stringValue(appSettings, "date_format") as "วัน/เดือน/ปี" | "เดือน/วัน/ปี", yearSystem: stringValue(appSettings, "year_system") as "พ.ศ." | "ค.ศ.", notificationPreferences: { enabled: booleanValue(appSettings, "alerts_enabled"), task24h: booleanValue(appSettings, "task_24h"), task12h: booleanValue(appSettings, "task_12h"), deadlineRisk: booleanValue(appSettings, "deadline_risk"), morning0600: booleanValue(appSettings, "morning_0600"), daily0700: booleanValue(appSettings, "daily_0700"), class30m: booleanValue(appSettings, "class_30m"), classEnd10m: booleanValue(appSettings, "class_end_10m"), exam7d: booleanValue(appSettings, "exam_7d"), exam3d: booleanValue(appSettings, "exam_3d"), exam1d: booleanValue(appSettings, "exam_1d"), examMorning: booleanValue(appSettings, "exam_morning"), weeklyRadar: booleanValue(appSettings, "weekly_radar"), browserNotifications: false } },
    chat: [...tables.chat_messages].sort((a, b) => position(a) - position(b)).map((row) => ({ id: stringValue(row, "id"), role: stringValue(row, "role") as "assistant" | "user", content: stringValue(row, "content"), ...(optionalString(row, "kind") ? { kind: optionalString(row, "kind") as ChatMessage["kind"] } : {}) })),
    projects: [],
  }, options.writerId ?? "talevo-qa-cloud-hydration", options.now ?? new Date());

  if (snapshot.version !== 8) throw new Error("qa_hydration_version_invalid");
  return snapshot;
}

export function persistQaHydratedState(
  storage: StorageLike,
  userId: string,
  currentSnapshot: PersistedAppState,
  hydratedSnapshot: PersistedAppState,
  confirmation: string,
) {
  if (process.env.NODE_ENV !== "development") throw new Error("qa_hydration_development_only");
  if (confirmation !== QA_HYDRATION_CONFIRMATION) throw new Error("qa_hydration_confirmation_required");
  if (!isQaDomainEmpty(currentSnapshot)) throw new Error("qa_hydration_requires_empty_local_domain");
  if (hydratedSnapshot.version !== 8) throw new Error("qa_hydration_version_invalid");
  writeAppStateSnapshot(createAccountStateStorage(storage, userId), hydratedSnapshot);
  recordLocalOwnershipDecision(storage, userId, "fresh");
}
