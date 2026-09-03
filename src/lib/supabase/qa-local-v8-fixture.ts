import { createEmptyAccountAppState } from "@/lib/app-state-defaults";
import {
  createAppStateSnapshot,
  writeAppStateSnapshot,
  type PersistedAppState,
  type StorageLike,
} from "@/lib/persistence/app-state-storage";
import {
  createAccountStateStorage,
  recordLocalOwnershipDecision,
} from "@/lib/persistence/local-account-storage";
import { saveAttachmentBlob } from "@/lib/task-attachment-storage";
import type { LocalV8MigrationPlan, LocalV8TableName } from "@/lib/supabase/local-v8-migration";

export const QA_MIGRATION_CONFIRMATION = "QA TEST DATA";
export const QA_FIXTURE_WRITER_ID = "talevo-qa-fixture-v1";
export const QA_ATTACHMENT_ID = "70000000-0000-4000-8000-000000000025";
export const QA_EXPECTED_TABLE_COUNTS: Record<LocalV8TableName, number> = {
  profiles: 1,
  academic_terms: 1,
  class_schedules: 2,
  tasks: 3,
  task_subtasks: 2,
  task_attachments: 1,
  task_completion_history: 1,
  exams: 2,
  exam_topics: 3,
  grade_plans: 1,
  grade_components: 2,
  grade_thresholds: 2,
  course_notes: 1,
  finance_categories: 3,
  finance_transactions: 3,
  saving_goals: 1,
  finance_settings: 1,
  learning_goals: 1,
  notifications: 1,
  dismissed_notification_events: 1,
  app_settings: 1,
  chat_messages: 2,
};
export const QA_EXPECTED_FINANCE_TOTALS = { income: 10_000, expense: 1_250, saving: 2_000, remaining: 6_750 } as const;
const QA_FIXED_TIME = new Date("2026-09-02T02:00:00.000Z");

const QA_EXPECTED_ROW_IDS: Partial<Record<LocalV8TableName, readonly string[]>> = {
  class_schedules: ["70000000-0000-4000-8000-000000000010", "70000000-0000-4000-8000-000000000011"],
  tasks: ["70000000-0000-4000-8000-000000000020", "70000000-0000-4000-8000-000000000021", "70000000-0000-4000-8000-000000000022"],
  task_subtasks: ["70000000-0000-4000-8000-000000000023", "70000000-0000-4000-8000-000000000024"],
  task_attachments: [QA_ATTACHMENT_ID],
  task_completion_history: ["70000000-0000-4000-8000-000000000026"],
  exams: ["70000000-0000-4000-8000-000000000030", "70000000-0000-4000-8000-000000000031"],
  exam_topics: ["70000000-0000-4000-8000-000000000032", "70000000-0000-4000-8000-000000000033", "70000000-0000-4000-8000-000000000034"],
  grade_plans: ["70000000-0000-4000-8000-000000000040"],
  grade_components: ["70000000-0000-4000-8000-000000000041", "70000000-0000-4000-8000-000000000042"],
  course_notes: ["70000000-0000-4000-8000-000000000050"],
  finance_categories: ["70000000-0000-4000-8000-000000000060", "70000000-0000-4000-8000-000000000061", "70000000-0000-4000-8000-000000000062"],
  finance_transactions: ["70000000-0000-4000-8000-000000000063", "70000000-0000-4000-8000-000000000064", "70000000-0000-4000-8000-000000000065"],
  saving_goals: ["70000000-0000-4000-8000-000000000066"],
  chat_messages: ["70000000-0000-4000-8000-000000000080", "70000000-0000-4000-8000-000000000081"],
};

const QA_NOTIFICATION_ID = "70000000-0000-4000-8000-000000000070";
const QA_NOTIFICATION_EVENT_KEY = "qa:migration:fixture:v1";
const SMART_ALERT_EVENT_PREFIXES = [
  "daily-0600:", "daily-0700:", "weekly-radar:", "task-risk:", "task-24h:", "task-12h:",
  "class-30m:", "class-end-10m:", "exam-7d:", "exam-3d:", "exam-1d:", "exam-morning:", "weather-storm:",
] as const;

export type QaFixtureContractCheck = {
  key: string;
  label: string;
  expected: string | number;
  actual: string | number;
  passed: boolean;
};

function sortedRowIds(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => typeof row.id === "string" ? row.id : "<missing>").sort();
}

function arraysEqual(first: readonly string[], second: readonly string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function isRecognizedSmartAlertRow(row: Record<string, unknown>) {
  if (typeof row.id !== "string" || typeof row.event_key !== "string") return false;
  const eventKey = row.event_key;
  return row.id === `notification:${eventKey}`
    && SMART_ALERT_EVENT_PREFIXES.some((prefix) => eventKey.startsWith(prefix));
}

function notificationContractMatches(rows: Array<Record<string, unknown>>) {
  const fixtureRows = rows.filter((row) => row.id === QA_NOTIFICATION_ID);
  if (fixtureRows.length !== 1) return false;
  const fixture = fixtureRows[0];
  const metadata = fixture.metadata && typeof fixture.metadata === "object"
    ? fixture.metadata as Record<string, unknown>
    : null;
  if (fixture.event_key !== QA_NOTIFICATION_EVENT_KEY || fixture.source_id !== "qa-fixture" || metadata?.fixture !== true) return false;
  return rows.every((row) => row.id === QA_NOTIFICATION_ID || isRecognizedSmartAlertRow(row));
}

function describeIds(ids: readonly string[]) {
  return ids.map((id) => id.slice(-3)).join(", ");
}

export function getQaFixtureContractChecks(plan: LocalV8MigrationPlan): QaFixtureContractCheck[] {
  const checks: QaFixtureContractCheck[] = [];
  for (const [table, expectedCount] of Object.entries(QA_EXPECTED_TABLE_COUNTS) as Array<[LocalV8TableName, number]>) {
    if (table === "notifications") {
      const rows = plan.payload.tables.notifications;
      checks.push({
        key: "count:notifications",
        label: "Notifications",
        expected: "1 fixture + recognized Smart Alerts",
        actual: rows.length,
        passed: notificationContractMatches(rows),
      });
      continue;
    }
    checks.push({ key: `count:${table}`, label: table, expected: expectedCount, actual: plan.counts[table], passed: plan.counts[table] === expectedCount });
  }

  for (const [table, expectedIds] of Object.entries(QA_EXPECTED_ROW_IDS) as Array<[LocalV8TableName, readonly string[]]>) {
    const actualIds = sortedRowIds(plan.payload.tables[table]);
    const sortedExpectedIds = [...expectedIds].sort();
    checks.push({
      key: `ids:${table}`,
      label: `${table} stable IDs`,
      expected: describeIds(sortedExpectedIds),
      actual: describeIds(actualIds),
      passed: arraysEqual(actualIds, sortedExpectedIds),
    });
  }

  for (const [key, expectedAmount] of Object.entries(QA_EXPECTED_FINANCE_TOTALS) as Array<[keyof typeof QA_EXPECTED_FINANCE_TOTALS, number]>) {
    checks.push({ key: `finance:${key}`, label: `Finance ${key}`, expected: expectedAmount, actual: plan.financeTotals[key], passed: plan.financeTotals[key] === expectedAmount });
  }

  const tasks = plan.payload.tables.tasks;
  const completedTasks = tasks.filter((row) => row.status === "completed").length;
  const unfinishedTasks = tasks.length - completedTasks;
  checks.push({ key: "tasks:completed", label: "Completed tasks", expected: 1, actual: completedTasks, passed: completedTasks === 1 });
  checks.push({ key: "tasks:unfinished", label: "Unfinished tasks", expected: 2, actual: unfinishedTasks, passed: unfinishedTasks === 2 });

  const categoryTypeById = new Map(plan.payload.tables.finance_categories.map((row) => [row.id, row.type]));
  const categoryTypes = [...categoryTypeById.values()].filter((value): value is string => typeof value === "string").sort();
  const expectedCategoryTypes = ["expense", "income", "saving"];
  checks.push({ key: "finance:category-types", label: "Finance category types", expected: expectedCategoryTypes.join(", "), actual: categoryTypes.join(", "), passed: arraysEqual(categoryTypes, expectedCategoryTypes) });
  const transactionRelationsValid = plan.payload.tables.finance_transactions.every((row) => typeof row.category_id === "string" && categoryTypeById.get(row.category_id) === row.type);
  checks.push({ key: "finance:relations", label: "Transaction → category relation", expected: "all types match", actual: transactionRelationsValid ? "all types match" : "mismatch", passed: transactionRelationsValid });

  const settings = plan.payload.tables.app_settings[0];
  const settingsValid = settings?.timezone === "Asia/Bangkok"
    && settings.date_format === "วัน/เดือน/ปี"
    && settings.year_system === "พ.ศ."
    && ["alerts_enabled", "task_24h", "task_12h", "deadline_risk", "morning_0600", "daily_0700", "class_30m", "class_end_10m", "exam_7d", "exam_3d", "exam_1d", "exam_morning", "weekly_radar"].every((key) => settings[key] === true);
  checks.push({ key: "settings:fixture", label: "App settings", expected: "QA defaults", actual: settingsValid ? "QA defaults" : "changed", passed: settingsValid });

  const dismissedEvents = plan.payload.tables.dismissed_notification_events.map((row) => row.event_key);
  const dismissedValid = dismissedEvents.length === 1 && dismissedEvents[0] === "qa:dismissed:event:v1";
  checks.push({ key: "notifications:dismissed", label: "Dismissed events", expected: "qa:dismissed:event:v1", actual: dismissedEvents.join(", "), passed: dismissedValid });
  const errorCount = plan.issues.filter((issue) => issue.severity === "error").length;
  checks.push({ key: "validation:errors", label: "Validation errors", expected: 0, actual: errorCount, passed: errorCount === 0 });
  return checks;
}

export function isExactQaFixturePlan(plan: LocalV8MigrationPlan) {
  return getQaFixtureContractChecks(plan).every((check) => check.passed);
}

export function createQaLocalV8Fixture(email: string): PersistedAppState {
  const defaults = createEmptyAccountAppState({
    displayName: "TALEVO QA",
    email: email.trim(),
    major: "เทคโนโลยีสารสนเทศ",
    university: "มหาวิทยาลัย QA",
  }, {
    level: "2",
    term: "1",
    academicYear: "2569",
    label: "ภาคเรียน QA",
  });

  return createAppStateSnapshot({
    ...defaults,
    schedules: [
      { id: "70000000-0000-4000-8000-000000000010", courseId: "70000000-0000-4000-8000-000000000001", name: "ระบบฐานข้อมูล", teacher: "อาจารย์ QA", room: "IT-401", color: "#7656F6", day: 1, startTime: "09:00", endTime: "11:00", note: "QA schedule A" },
      { id: "70000000-0000-4000-8000-000000000011", courseId: "70000000-0000-4000-8000-000000000002", name: "เครือข่ายคอมพิวเตอร์", teacher: "อาจารย์ Test", room: "IT-305", color: "#2F80ED", day: 3, startTime: "13:00", endTime: "15:00", note: "QA schedule B" },
    ],
    tasks: [
      {
        id: "70000000-0000-4000-8000-000000000020", title: "ตรวจ Atomic Migration", courseId: "70000000-0000-4000-8000-000000000001",
        description: "ข้อมูลทดสอบเท่านั้น", dueLabel: "พรุ่งนี้", dueDate: "2026-09-10T10:00",
        estimate: "1 ชั่วโมง", status: "doing", color: "#7656F6",
        subtasks: [
          { id: "70000000-0000-4000-8000-000000000023", title: "ตรวจ Preview", completed: true, completedAt: "2026-09-02T02:05:00.000Z" },
          { id: "70000000-0000-4000-8000-000000000024", title: "ตรวจ Read-back", completed: false },
        ],
        attachment: "qa-pocket.txt",
        attachments: [{ id: QA_ATTACHMENT_ID, taskId: "70000000-0000-4000-8000-000000000020", name: "qa-pocket.txt", mimeType: "text/plain", size: 26, kind: "file", createdAt: "2026-09-02T02:10:00.000Z" }],
      },
      { id: "70000000-0000-4000-8000-000000000021", title: "อ่านบท SQL", courseId: "70000000-0000-4000-8000-000000000001", description: "ทบทวน JOIN และ RLS", dueLabel: "สัปดาห์นี้", dueDate: "2026-09-12T18:00", estimate: "2 ชั่วโมง", status: "todo", color: "#2F80ED", subtasks: [], attachments: [] },
      { id: "70000000-0000-4000-8000-000000000022", title: "สรุปบทเรียน", courseId: "70000000-0000-4000-8000-000000000002", description: "QA completed task", dueLabel: "เสร็จแล้ว", dueDate: "2026-09-01T17:00", estimate: "30 นาที", status: "completed", color: "#27AE60", completedAt: "2026-09-02T01:00:00.000Z", subtasks: [], attachments: [] },
    ],
    taskCompletionHistory: [{ id: "70000000-0000-4000-8000-000000000026", originalTaskId: "70000000-0000-4000-8000-000000000027", courseId: "70000000-0000-4000-8000-000000000002", completedAt: "2026-08-25T08:00:00.000Z", dueDate: "2026-08-25T10:00:00.000Z", estimate: "45 นาที", subtaskCount: 1 }],
    exams: [
      { id: "70000000-0000-4000-8000-000000000030", courseId: "70000000-0000-4000-8000-000000000001", title: "สอบกลางภาคฐานข้อมูล", type: "midterm", startAt: "2026-10-01T09:00", endAt: "2026-10-01T11:00", room: "IT-501", note: "QA exam", topics: [{ id: "70000000-0000-4000-8000-000000000032", title: "SQL", completed: true, completedAt: "2026-09-02T02:20:00.000Z" }, { id: "70000000-0000-4000-8000-000000000033", title: "RLS", completed: false }], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T02:20:00.000Z" },
      { id: "70000000-0000-4000-8000-000000000031", courseId: "70000000-0000-4000-8000-000000000002", title: "สอบปลายภาคเครือข่าย", type: "final", startAt: "2026-11-20T13:00", endAt: "2026-11-20T16:00", topics: [{ id: "70000000-0000-4000-8000-000000000034", title: "Routing", completed: false }], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
    ],
    gradePlans: [{ id: "70000000-0000-4000-8000-000000000040", courseId: "70000000-0000-4000-8000-000000000001", targetGrade: "A", components: [{ id: "70000000-0000-4000-8000-000000000041", name: "กลางภาค", weight: 40, maxScore: 100, earnedScore: 82, note: "QA score" }, { id: "70000000-0000-4000-8000-000000000042", name: "ปลายภาค", weight: 60, maxScore: 100 }], thresholds: [{ label: "A", minimumPercent: 80 }, { label: "B+", minimumPercent: 75 }] }],
    courseNotes: [{ id: "70000000-0000-4000-8000-000000000050", courseId: "70000000-0000-4000-8000-000000000001", title: "สรุป RLS", content: "Policy ต้องผูกกับ auth.uid()", tags: ["QA", "Supabase"], pinned: true, classDate: "2026-09-02", createdAt: "2026-09-02T02:30:00.000Z", updatedAt: "2026-09-02T02:30:00.000Z" }],
    financeCategories: [
      { id: "70000000-0000-4000-8000-000000000060", name: "รายรับ QA", type: "income", icon: "wallet", color: "green", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "70000000-0000-4000-8000-000000000061", name: "ค่าอาหาร QA", type: "expense", icon: "utensils", color: "orange", monthlyBudget: 3000, createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "70000000-0000-4000-8000-000000000062", name: "เงินออม QA", type: "saving", icon: "piggy-bank", color: "purple", createdAt: "2026-09-01T00:00:00.000Z" },
    ],
    financeTransactions: [
      { id: "70000000-0000-4000-8000-000000000063", type: "income", title: "รายรับทดสอบ", amount: 10000, category: "รายรับ QA", date: "2026-09-02", note: "QA only" },
      { id: "70000000-0000-4000-8000-000000000064", type: "expense", title: "รายจ่ายทดสอบ", amount: 1250, category: "ค่าอาหาร QA", date: "2026-09-02", note: "QA only" },
      { id: "70000000-0000-4000-8000-000000000065", type: "saving", title: "เงินออมทดสอบ", amount: 2000, category: "เงินออม QA", date: "2026-09-02", note: "QA only" },
    ],
    savingGoals: [{ id: "70000000-0000-4000-8000-000000000066", title: "อุปกรณ์เรียน QA", targetAmount: 20000, savedAmount: 2000 }],
    financeSettings: { dailyBudget: 500 },
    selectedFinanceMonth: "2026-09",
    goals: { weeklyStudyHours: 12, earlySubmissionDays: 2, examPreparationDays: 14, personalGoal: "ทดสอบ Local → Cloud อย่างปลอดภัย" },
    notifications: [{ id: "70000000-0000-4000-8000-000000000070", type: "system", priority: "normal", title: "QA Migration พร้อมทดสอบ", message: "ข้อมูลนี้เป็น QA TEST DATA", createdAt: "2026-09-02T02:40:00.000Z", eventKey: "qa:migration:fixture:v1", sourceId: "qa-fixture", metadata: { fixture: true } }],
    dismissedNotificationEventKeys: ["qa:dismissed:event:v1"],
    chat: [{ id: "70000000-0000-4000-8000-000000000080", role: "user", content: "ตรวจข้อมูล QA" }, { id: "70000000-0000-4000-8000-000000000081", role: "assistant", content: "พร้อมตรวจแบบ atomic", kind: "text" }],
  }, QA_FIXTURE_WRITER_ID, QA_FIXED_TIME);
}

export function isQaDomainEmpty(snapshot: PersistedAppState) {
  return [
    snapshot.schedules, snapshot.tasks, snapshot.taskCompletionHistory, snapshot.exams,
    snapshot.gradePlans, snapshot.courseNotes,
    snapshot.financeTransactions, snapshot.financeCategories, snapshot.savingGoals,
    snapshot.notifications, snapshot.dismissedNotificationEventKeys, snapshot.projects, snapshot.chat,
  ].every((rows) => rows.length === 0);
}

type QaSeedDependencies = {
  saveBinary?: (id: string, blob: Blob) => Promise<unknown>;
  qaAccessAllowed?: boolean;
};

/** Writes only the current account namespace and one deterministic QA attachment. */
export async function seedQaLocalV8Fixture(
  storage: StorageLike,
  userId: string,
  email: string,
  currentSnapshot: PersistedAppState,
  confirmation: string,
  dependencies: QaSeedDependencies = {},
) {
  if (process.env.NODE_ENV !== "development") throw new Error("qa_fixture_development_only");
  if (confirmation !== QA_MIGRATION_CONFIRMATION) throw new Error("qa_fixture_confirmation_required");
  if (dependencies.qaAccessAllowed !== true) throw new Error("qa_account_not_allowlisted");
  if (!isQaDomainEmpty(currentSnapshot)) throw new Error("qa_fixture_requires_empty_local_domain");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw new Error("qa_fixture_user_invalid");

  const fixture = createQaLocalV8Fixture(email);
  const saveBinary = dependencies.saveBinary ?? saveAttachmentBlob;
  await saveBinary(QA_ATTACHMENT_ID, new Blob(["TALEVO QA attachment only.\n"], { type: "text/plain" }));
  writeAppStateSnapshot(createAccountStateStorage(storage, userId), fixture);
  recordLocalOwnershipDecision(storage, userId, "fresh");
  return fixture;
}
