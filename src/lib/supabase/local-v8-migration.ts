import type { PersistedAppState } from "@/lib/persistence/app-state-storage";
import type { LocalMigrationOwnership } from "@/lib/persistence/local-account-storage";
import { isValidAcademicTimeRange } from "@/lib/academic-time";

type MigrationRow = Record<string, unknown>;

export const LOCAL_V8_CLOUD_MIGRATION_STATUS = "blocked_pending_sql_deploy" as const;
export const CLOUD_IMPORT_RELEASE_ENABLED = false as const;

export const LOCAL_V8_TABLE_ORDER = [
  "profiles", "academic_terms", "class_schedules", "tasks", "task_subtasks",
  "task_attachments", "task_completion_history", "exams", "exam_topics",
  "grade_plans", "grade_components", "grade_thresholds", "course_notes",
  "finance_categories", "finance_transactions",
  "saving_goals", "finance_settings", "learning_goals", "notifications",
  "dismissed_notification_events", "app_settings", "chat_messages",
] as const;

export type LocalV8TableName = (typeof LOCAL_V8_TABLE_ORDER)[number];
export type MigrationIssue = { code: string; path: string; message: string; severity: "error" | "warning" };
export type LocalV8MigrationPayload = {
  schema_version: 8;
  import_id: string;
  local_owner_id: string;
  local_saved_at: string | null;
  local_writer_id: string | null;
  tables: Record<LocalV8TableName, MigrationRow[]>;
};

export interface LocalV8MigrationPlan {
  sourceVersion: 8;
  userId: string;
  /** Runtime upload stays locked until the additive SQL and live QA are deployed. */
  readyForUpload: false;
  eligibleForUploadAfterDeployment: boolean;
  status: typeof LOCAL_V8_CLOUD_MIGRATION_STATUS;
  blockingReasons: string[];
  issues: MigrationIssue[];
  counts: Record<LocalV8TableName, number>;
  financeTotals: { income: number; expense: number; saving: number; remaining: number };
  previewFingerprint: string;
  payload: LocalV8MigrationPayload;
}

const REMOVED_TOP_LEVEL_FIELDS = ["studyBlocks", "academicRoute"] as const;
const REMOVED_TASK_FIELDS = ["requiresSubmission", "submittedAt", "submissionNote", "submissionEvidenceAttachmentIds", "submissionReminders"] as const;
const LOCAL_BANGKOK_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FINANCE_LIMIT = 999_999_999_999.99;
const SUPABASE_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const own = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
const normalizedCategoryName = (value: string) => value.trim().toLocaleLowerCase("th-TH");

function toCloudTimestamp(value: string) {
  const source = LOCAL_BANGKOK_DATETIME.test(value) ? `${value}+07:00` : value;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function previewHash(value: unknown) {
  const input = stableJson(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function addIssue(issues: MigrationIssue[], code: string, path: string, message: string, severity: MigrationIssue["severity"] = "error") {
  issues.push({ code, path, message, severity });
}

function validateIds(issues: MigrationIssue[], path: string, values: string[]) {
  values.forEach((value, index) => {
    if (!value.trim()) addIssue(issues, "invalid_id", `${path}[${index}].id`, "รหัสข้อมูลต้องไม่เป็นค่าว่าง");
  });
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) addIssue(issues, "duplicate_cloud_key_detected", `${path}[${index}].id`, `พบ ID ซ้ำ: ${value}`);
    seen.add(value);
  });
}

function validTimestamp(value: string | undefined, required = false) {
  if (!value) return !required;
  return !Number.isNaN(new Date(LOCAL_BANGKOK_DATETIME.test(value) ? `${value}+07:00` : value).getTime());
}

function validDate(value: string | undefined) {
  if (!value || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validMoney(value: number, allowZero: boolean) {
  return Number.isFinite(value) && value <= FINANCE_LIMIT && (allowZero ? value >= 0 : value > 0);
}

function collectSafetyIssues(snapshot: PersistedAppState, ownership: LocalMigrationOwnership): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  const rawSnapshot = snapshot as unknown as Record<string, unknown>;
  if (snapshot.version !== 8) addIssue(issues, "local_schema_version_is_not_v8", "version", "รองรับเฉพาะ AppState v8");
  if (ownership.status === "needs-adoption") addIssue(issues, "legacy_owner_confirmation_required", "ownership", "กรุณายืนยันก่อนว่าข้อมูลเดิมเป็นของบัญชีนี้");
  if (ownership.status === "owner-mismatch") addIssue(issues, "local_owner_mismatch", "ownership", "ข้อมูลในอุปกรณ์ผูกกับบัญชีอื่นอยู่");
  if (ownership.status === "no-local-state") addIssue(issues, "no_local_state", "ownership", "ไม่พบ AppState ของบัญชีนี้", "warning");

  if ([snapshot.profile.displayName, snapshot.profile.major, snapshot.profile.university].some((value) => value.length > 80)) addIssue(issues, "profile_field_exceeds_cloud_limit", "profile", "ข้อมูลโปรไฟล์ยาวเกินข้อกำหนด Cloud");
  if ([snapshot.academicTerm.level, snapshot.academicTerm.term, snapshot.academicTerm.label ?? ""].some((value) => value.length > 60)
      || (snapshot.academicTerm.academicYear !== "" && !/^\d{4}$/.test(snapshot.academicTerm.academicYear))) addIssue(issues, "academic_term_is_invalid", "academicTerm", "ข้อมูลภาคเรียนไม่ตรงกับ schema");
  for (const field of REMOVED_TOP_LEVEL_FIELDS) if (own(rawSnapshot, field)) addIssue(issues, "removed_top_level_feature_data_detected", field, `พบข้อมูลฟีเจอร์ที่ยกเลิกแล้ว: ${field}`);
  snapshot.tasks.forEach((task, taskIndex) => {
    for (const field of REMOVED_TASK_FIELDS) if (own(task, field)) addIssue(issues, "removed_task_submission_data_detected", `tasks[${taskIndex}].${field}`, `พบข้อมูล Did I Submit ที่ยกเลิกแล้ว: ${field}`);
  });

  const idCollections: Array<[string, string[]]> = [
    ["schedules", snapshot.schedules.map((item) => item.id)], ["tasks", snapshot.tasks.map((item) => item.id)],
    ["taskCompletionHistory", snapshot.taskCompletionHistory.map((item) => item.id)], ["exams", snapshot.exams.map((item) => item.id)],
    ["gradePlans", snapshot.gradePlans.map((item) => item.id)], ["courseNotes", snapshot.courseNotes.map((item) => item.id)],
    ["financeCategories", snapshot.financeCategories.map((item) => item.id)],
    ["financeTransactions", snapshot.financeTransactions.map((item) => item.id)], ["savingGoals", snapshot.savingGoals.map((item) => item.id)],
    ["notifications", snapshot.notifications.map((item) => item.id)], ["chat", snapshot.chat.map((item) => item.id)],
  ];
  idCollections.forEach(([path, ids]) => validateIds(issues, path, ids));
  snapshot.tasks.forEach((task, taskIndex) => {
    validateIds(issues, `tasks[${taskIndex}].subtasks`, (task.subtasks ?? []).map((item) => item.id));
    validateIds(issues, `tasks[${taskIndex}].attachments`, (task.attachments ?? []).map((item) => item.id));
    (task.attachments ?? []).forEach((attachment, attachmentIndex) => {
      if (attachment.taskId !== task.id) addIssue(issues, "orphan_task_attachment", `tasks[${taskIndex}].attachments[${attachmentIndex}].taskId`, "ไฟล์แนบอ้าง Task ไม่ตรงกับ parent");
      if (!Number.isSafeInteger(attachment.size) || attachment.size < 0) addIssue(issues, "invalid_attachment_size", `tasks[${taskIndex}].attachments[${attachmentIndex}].size`, "ขนาดไฟล์แนบไม่ถูกต้อง");
      if (!validTimestamp(attachment.createdAt, true)) addIssue(issues, "invalid_timestamp", `tasks[${taskIndex}].attachments[${attachmentIndex}].createdAt`, "เวลาไฟล์แนบไม่ถูกต้อง");
    });
    (task.subtasks ?? []).forEach((subtask, subtaskIndex) => {
      if (!validTimestamp(subtask.completedAt)) addIssue(issues, "invalid_timestamp", `tasks[${taskIndex}].subtasks[${subtaskIndex}].completedAt`, "เวลาทำงานย่อยเสร็จไม่ถูกต้อง");
    });
  });
  snapshot.exams.forEach((exam, examIndex) => validateIds(issues, `exams[${examIndex}].topics`, exam.topics.map((item) => item.id)));
  snapshot.gradePlans.forEach((plan, planIndex) => {
    validateIds(issues, `gradePlans[${planIndex}].components`, plan.components.map((item) => item.id));
    const labels = plan.thresholds.map((item) => item.label.trim().toLocaleLowerCase("th-TH"));
    if (new Set(labels).size !== labels.length) addIssue(issues, "duplicate_grade_threshold_label", `gradePlans[${planIndex}].thresholds`, "ชื่อเกณฑ์คะแนนซ้ำในแผนเดียวกัน");
    plan.components.forEach((component, componentIndex) => {
      if (!Number.isFinite(component.weight) || component.weight < 0 || component.weight > 100 || !Number.isFinite(component.maxScore) || component.maxScore <= 0
          || component.earnedScore !== undefined && (!Number.isFinite(component.earnedScore) || component.earnedScore < 0 || component.earnedScore > component.maxScore)) addIssue(issues, "invalid_grade_component", `gradePlans[${planIndex}].components[${componentIndex}]`, "ค่าน้ำหนักหรือคะแนนไม่ถูกต้อง");
    });
  });

  const uniqueSets: Array<[string, string, string[]]> = [
    ["duplicate_task_history_source", "taskCompletionHistory", snapshot.taskCompletionHistory.map((item) => item.originalTaskId)],
    ["duplicate_grade_course", "gradePlans", snapshot.gradePlans.map((item) => item.courseId)],
    ["duplicate_notification_event", "notifications", snapshot.notifications.map((item) => item.eventKey)],
    ["duplicate_dismissed_event", "dismissedNotificationEventKeys", snapshot.dismissedNotificationEventKeys],
  ];
  uniqueSets.forEach(([code, path, values]) => { if (new Set(values).size !== values.length) addIssue(issues, code, path, "พบค่าที่ต้องไม่ซ้ำกันมากกว่าหนึ่งรายการ"); });

  snapshot.schedules.forEach((schedule, index) => { if (!isValidAcademicTimeRange(schedule.startTime, schedule.endTime)) addIssue(issues, "invalid_schedule_time", `schedules[${index}]`, "เวลาเริ่ม/สิ้นสุดของตารางเรียนไม่ถูกต้อง"); });
  snapshot.tasks.forEach((task, index) => { if (!validTimestamp(task.dueDate, true) || !validTimestamp(task.completedAt)) addIssue(issues, "invalid_timestamp", `tasks[${index}]`, "วันกำหนดส่งหรือเวลาทำเสร็จไม่ถูกต้อง"); });
  snapshot.taskCompletionHistory.forEach((item, index) => { if (!validTimestamp(item.completedAt, true) || !validTimestamp(item.dueDate) || !Number.isInteger(item.subtaskCount) || item.subtaskCount < 0) addIssue(issues, "invalid_task_history", `taskCompletionHistory[${index}]`, "ประวัติ Task มีเวลาหรือจำนวนงานย่อยไม่ถูกต้อง"); });
  snapshot.exams.forEach((exam, index) => {
    if (!validTimestamp(exam.startAt, true) || !validTimestamp(exam.endAt) || !validTimestamp(exam.completedAt) || !validTimestamp(exam.createdAt, true) || !validTimestamp(exam.updatedAt, true)) addIssue(issues, "invalid_timestamp", `exams[${index}]`, "วันเวลาการสอบไม่ถูกต้อง");
    if (exam.endAt && new Date(toCloudTimestamp(exam.startAt)) >= new Date(toCloudTimestamp(exam.endAt))) addIssue(issues, "invalid_exam_range", `exams[${index}]`, "เวลาสิ้นสุดสอบต้องอยู่หลังเวลาเริ่ม");
    exam.topics.forEach((topic, topicIndex) => { if (!validTimestamp(topic.completedAt)) addIssue(issues, "invalid_timestamp", `exams[${index}].topics[${topicIndex}].completedAt`, "เวลาทำหัวข้อสอบเสร็จไม่ถูกต้อง"); });
  });
  snapshot.courseNotes.forEach((note, index) => { if (!validTimestamp(note.createdAt, true) || !validTimestamp(note.updatedAt, true) || note.classDate !== undefined && !validDate(note.classDate)) addIssue(issues, "invalid_note_date", `courseNotes[${index}]`, "วันที่ของโน้ตไม่ถูกต้อง"); });
  snapshot.financeTransactions.forEach((transaction, index) => {
    if (!validMoney(transaction.amount, false)) addIssue(issues, "invalid_money_value", `financeTransactions[${index}].amount`, "จำนวนเงินต้องมากกว่า 0 และอยู่ในช่วงที่ Cloud รองรับ");
    if (!validDate(transaction.date)) addIssue(issues, "invalid_finance_date", `financeTransactions[${index}].date`, "วันที่รายการเงินไม่ถูกต้อง");
  });
  snapshot.financeCategories.forEach((category, index) => {
    if (category.name.trim().length < 2) addIssue(issues, "invalid_finance_category_name", `financeCategories[${index}].name`, "ชื่อหมวดหมู่ต้องมีอย่างน้อย 2 ตัวอักษร");
    if (category.monthlyBudget !== undefined && !validMoney(category.monthlyBudget, true)) addIssue(issues, "invalid_money_value", `financeCategories[${index}].monthlyBudget`, "งบหมวดหมู่ไม่ถูกต้อง");
    if (!validTimestamp(category.createdAt)) addIssue(issues, "invalid_timestamp", `financeCategories[${index}].createdAt`, "เวลาสร้างหมวดหมู่ไม่ถูกต้อง");
  });
  snapshot.savingGoals.forEach((goal, index) => { if (!validMoney(goal.targetAmount, false) || !validMoney(goal.savedAmount, true) || goal.savedAmount > goal.targetAmount) addIssue(issues, "invalid_saving_goal", `savingGoals[${index}]`, "เป้าหมายหรือยอดออมไม่ถูกต้อง"); });
  snapshot.notifications.forEach((notification, index) => { if (!validTimestamp(notification.createdAt, true) || !validTimestamp(notification.readAt)) addIssue(issues, "invalid_timestamp", `notifications[${index}]`, "เวลาของการแจ้งเตือนไม่ถูกต้อง"); });
  if ([snapshot.goals.weeklyStudyHours, snapshot.goals.earlySubmissionDays, snapshot.goals.examPreparationDays].some((value) => !Number.isFinite(value) || value < 0)) addIssue(issues, "invalid_learning_goal", "goals", "ค่าเป้าหมายการเรียนต้องเป็นเลขไม่ติดลบ");
  if (snapshot.savedAt && !validTimestamp(snapshot.savedAt, true)) addIssue(issues, "invalid_timestamp", "savedAt", "เวลา snapshot ไม่ถูกต้อง");
  if (!validMoney(snapshot.financeSettings.dailyBudget, true)) addIssue(issues, "invalid_money_value", "financeSettings.dailyBudget", "งบรายวันไม่ถูกต้อง");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.selectedFinanceMonth)) addIssue(issues, "selected_finance_month_is_invalid", "selectedFinanceMonth", "เดือนที่เลือกต้องอยู่ในรูป YYYY-MM");

  const categoryNames = snapshot.financeCategories.map((category) => normalizedCategoryName(category.name));
  if (new Set(categoryNames).size !== categoryNames.length) addIssue(issues, "finance_category_name_is_duplicated", "financeCategories", "ชื่อหมวดหมู่การเงินซ้ำกัน");
  const categoryTypeByName = new Map(snapshot.financeCategories.map((category) => [normalizedCategoryName(category.name), category.type]));
  snapshot.financeTransactions.forEach((transaction, index) => {
    const categoryType = categoryTypeByName.get(normalizedCategoryName(transaction.category));
    if (!categoryType) addIssue(issues, "finance_transaction_category_is_missing", `financeTransactions[${index}].category`, "ไม่พบหมวดหมู่ที่รายการเงินอ้างถึง");
    else if (categoryType !== transaction.type) addIssue(issues, "finance_transaction_category_type_mismatch", `financeTransactions[${index}].type`, "ประเภทรายการเงินไม่ตรงกับประเภทหมวดหมู่");
  });
  if (snapshot.projects.length) addIssue(issues, "local_only_projects_not_uploaded", "projects", "Projects เป็นข้อมูล compatibility ในอุปกรณ์และจะไม่ถูกอัปโหลด", "warning");
  return issues;
}

function buildTables(snapshot: PersistedAppState): Record<LocalV8TableName, MigrationRow[]> {
  const preferences = snapshot.settings.notificationPreferences;
  const financeCategoryIdByName = new Map(snapshot.financeCategories.map((category) => [normalizedCategoryName(category.name), category.id]));
  return {
    profiles: [{ display_name: snapshot.profile.displayName, major: snapshot.profile.major, university: snapshot.profile.university }],
    academic_terms: [{ level: snapshot.academicTerm.level, term: snapshot.academicTerm.term, academic_year: snapshot.academicTerm.academicYear, label: snapshot.academicTerm.label ?? null }],
    class_schedules: snapshot.schedules.map((row) => ({ id: row.id, course_id: row.courseId, name: row.name, teacher: row.teacher, room: row.room, color: row.color, day: row.day, start_time: row.startTime, end_time: row.endTime, note: row.note ?? null })),
    tasks: snapshot.tasks.map((row) => ({ id: row.id, title: row.title, course_id: row.courseId ?? null, description: row.description, due_label: row.dueLabel, due_date: toCloudTimestamp(row.dueDate), estimate: row.estimate, status: row.status, color: row.color, attachment_label: row.attachment ?? null, completed_at: row.completedAt ? toCloudTimestamp(row.completedAt) : null })),
    task_subtasks: snapshot.tasks.flatMap((task) => (task.subtasks ?? []).map((row, position) => ({ task_id: task.id, id: row.id, title: row.title, completed: row.completed, completed_at: row.completedAt ? toCloudTimestamp(row.completedAt) : null, position }))),
    task_attachments: snapshot.tasks.flatMap((task) => (task.attachments ?? []).map((row) => ({ task_id: task.id, id: row.id, name: row.name, mime_type: row.mimeType, size_bytes: row.size, kind: row.kind, created_at: toCloudTimestamp(row.createdAt) }))),
    task_completion_history: snapshot.taskCompletionHistory.map((row) => ({ id: row.id, original_task_id: row.originalTaskId, course_id: row.courseId ?? null, completed_at: toCloudTimestamp(row.completedAt), due_date: row.dueDate ? toCloudTimestamp(row.dueDate) : null, estimate: row.estimate ?? null, subtask_count: row.subtaskCount })),
    exams: snapshot.exams.map((row) => ({ id: row.id, course_id: row.courseId, title: row.title, type: row.type, start_at: toCloudTimestamp(row.startAt), end_at: row.endAt ? toCloudTimestamp(row.endAt) : null, room: row.room ?? null, note: row.note ?? null, completed_at: row.completedAt ? toCloudTimestamp(row.completedAt) : null, created_at: toCloudTimestamp(row.createdAt), updated_at: toCloudTimestamp(row.updatedAt) })),
    exam_topics: snapshot.exams.flatMap((exam) => exam.topics.map((row, position) => ({ exam_id: exam.id, id: row.id, title: row.title, completed: row.completed, completed_at: row.completedAt ? toCloudTimestamp(row.completedAt) : null, position }))),
    grade_plans: snapshot.gradePlans.map((row) => ({ id: row.id, course_id: row.courseId, target_grade: row.targetGrade ?? null })),
    grade_components: snapshot.gradePlans.flatMap((plan) => plan.components.map((row, position) => ({ grade_plan_id: plan.id, id: row.id, name: row.name, weight: row.weight, max_score: row.maxScore, earned_score: row.earnedScore ?? null, note: row.note ?? null, position }))),
    grade_thresholds: snapshot.gradePlans.flatMap((plan) => plan.thresholds.map((row, position) => ({ grade_plan_id: plan.id, label: row.label, minimum_percent: row.minimumPercent, position }))),
    course_notes: snapshot.courseNotes.map((row) => ({ id: row.id, course_id: row.courseId, title: row.title, content: row.content, tags: row.tags, pinned: row.pinned, class_date: row.classDate ?? null, created_at: toCloudTimestamp(row.createdAt), updated_at: toCloudTimestamp(row.updatedAt) })),
    finance_categories: snapshot.financeCategories.map((row) => ({ id: row.id, name: row.name, type: row.type, icon: row.icon, color: row.color, monthly_budget: row.monthlyBudget ?? null, created_at: row.createdAt ? toCloudTimestamp(row.createdAt) : null, is_default: row.isDefault ?? false })),
    finance_transactions: snapshot.financeTransactions.map((row) => ({ id: row.id, type: row.type, title: row.title, amount: row.amount, category_id: financeCategoryIdByName.get(normalizedCategoryName(row.category)) ?? null, date: row.date, note: row.note ?? null })),
    saving_goals: snapshot.savingGoals.map((row) => ({ id: row.id, title: row.title, target_amount: row.targetAmount, saved_amount: row.savedAmount })),
    finance_settings: [{ daily_budget: snapshot.financeSettings.dailyBudget, selected_month: snapshot.selectedFinanceMonth }],
    learning_goals: [{ weekly_study_hours: snapshot.goals.weeklyStudyHours, early_submission_days: snapshot.goals.earlySubmissionDays, exam_preparation_days: snapshot.goals.examPreparationDays, personal_goal: snapshot.goals.personalGoal }],
    notifications: snapshot.notifications.map((row) => ({ id: row.id, type: row.type, priority: row.priority, title: row.title, message: row.message, created_at: toCloudTimestamp(row.createdAt), read_at: row.readAt ? toCloudTimestamp(row.readAt) : null, href: row.href ?? null, event_key: row.eventKey, source_id: row.sourceId ?? null, metadata: row.metadata ?? null })),
    dismissed_notification_events: snapshot.dismissedNotificationEventKeys.map((eventKey) => ({ event_key: eventKey })),
    app_settings: [{ timezone: snapshot.settings.timezone, date_format: snapshot.settings.dateFormat, year_system: snapshot.settings.yearSystem, alerts_enabled: preferences.enabled, task_24h: preferences.task24h, task_12h: preferences.task12h, deadline_risk: preferences.deadlineRisk, morning_0600: preferences.morning0600, daily_0700: preferences.daily0700, class_30m: preferences.class30m, class_end_10m: preferences.classEnd10m, exam_7d: preferences.exam7d, exam_3d: preferences.exam3d, exam_1d: preferences.exam1d, exam_morning: preferences.examMorning, weekly_radar: preferences.weeklyRadar }],
    chat_messages: snapshot.chat.map((row, position) => ({ id: row.id, role: row.role, content: row.content, kind: row.kind ?? null, position })),
  };
}

export function getLocalFinanceTotals(snapshot: PersistedAppState) {
  const totals = snapshot.financeTransactions.reduce((result, transaction) => ({ ...result, [transaction.type]: result[transaction.type] + transaction.amount }), { income: 0, expense: 0, saving: 0 });
  return { ...totals, remaining: totals.income - totals.expense - totals.saving };
}

/** Builds a deterministic, side-effect-free preview. It never calls Supabase. */
export function createLocalV8MigrationPlan(snapshot: PersistedAppState, userId: string, ownership: LocalMigrationOwnership = { status: "needs-adoption", source: "legacy-unowned" }): LocalV8MigrationPlan {
  const normalizedUserId = userId.trim();
  if (!SUPABASE_USER_ID.test(normalizedUserId)) throw new Error("ต้องมี Supabase user id ก่อนสร้างแผนย้ายข้อมูล");
  const tables = buildTables(snapshot);
  const previewFingerprint = previewHash({ schema_version: 8, tables });
  const issues = collectSafetyIssues(snapshot, ownership);
  const errorCodes = [...new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.code))];
  const eligibleForUploadAfterDeployment = ownership.status === "confirmed" && errorCodes.length === 0;
  const payload: LocalV8MigrationPayload = { schema_version: 8, import_id: `local-v8-${previewFingerprint}`, local_owner_id: normalizedUserId, local_saved_at: validTimestamp(snapshot.savedAt) && snapshot.savedAt ? toCloudTimestamp(snapshot.savedAt) : null, local_writer_id: snapshot.writerId ?? null, tables };
  return {
    sourceVersion: 8,
    userId: normalizedUserId,
    readyForUpload: false,
    eligibleForUploadAfterDeployment,
    status: LOCAL_V8_CLOUD_MIGRATION_STATUS,
    blockingReasons: ["atomic_import_sql_not_deployed_and_live_verified", ...errorCodes],
    issues,
    counts: Object.fromEntries(LOCAL_V8_TABLE_ORDER.map((table) => [table, tables[table].length])) as Record<LocalV8TableName, number>,
    financeTotals: getLocalFinanceTotals(snapshot),
    previewFingerprint,
    payload,
  };
}
