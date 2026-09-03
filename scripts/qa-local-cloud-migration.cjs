/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  return originalResolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename });
  module._compile(output.outputText, filename);
};

const { createEmptyAccountAppState } = require("../src/lib/app-state-defaults.ts");
const { createAppStateSnapshot, APP_STATE_STORAGE_KEY } = require("../src/lib/persistence/app-state-storage.ts");
const { bindCanonicalStateToAccount, createAccountStateStorage, inspectLocalMigrationOwnership } = require("../src/lib/persistence/local-account-storage.ts");
const { createLocalV8MigrationPlan, LOCAL_V8_TABLE_ORDER } = require("../src/lib/supabase/local-v8-migration.ts");
const { importLocalV8Atomically, verifyCloudReadBack } = require("../src/lib/supabase/cloud-v8-repository.ts");

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const defaults = createEmptyAccountAppState({ displayName: "ต้า", email: "not-uploaded@example.test", major: "IT", university: "TALEVO" }, { level: "2", term: "1", academicYear: "2569" });
const populated = {
  ...defaults,
  schedules: [
    { id: "schedule-stable", courseId: "course-1", name: "Database", teacher: "QA", room: "A1", color: "#7656F6", day: 1, startTime: "09:00", endTime: "10:00" },
    { id: "schedule-saturday-end", courseId: "course-2", name: "Saturday", teacher: "QA", room: "A2", color: "#7656F6", day: 5, startTime: "23:00", endTime: "24:00" },
    { id: "schedule-sunday-midnight", courseId: "course-3", name: "Sunday", teacher: "QA", room: "A3", color: "#7656F6", day: 6, startTime: "00:00", endTime: "01:00" },
  ],
  tasks: [{ id: "task-stable", courseId: "course-1", title: "Atomic QA", description: "", dueLabel: "", dueDate: "2026-09-30T10:00", estimate: "1 ชั่วโมง", status: "todo", color: "#7656F6", subtasks: [{ id: "subtask-stable", title: "Child", completed: false }], attachments: [{ id: "attachment-stable", taskId: "task-stable", name: "qa.pdf", mimeType: "application/pdf", size: 42, kind: "file", createdAt: "2026-09-01T00:00:00.000Z" }] }],
  exams: [{ id: "exam-stable", courseId: "course-1", title: "Midterm", type: "midterm", startAt: "2026-10-01T09:00", topics: [{ id: "topic-stable", title: "SQL", completed: false }], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }],
  gradePlans: [{ id: "grade-stable", courseId: "course-1", targetGrade: "A", components: [{ id: "component-stable", name: "Midterm", weight: 40, maxScore: 100 }], thresholds: [{ label: "A", minimumPercent: 80 }] }],
  financeCategories: [{ id: "category-stable", name: "ค่าอาหาร", type: "expense", icon: "wallet", color: "purple", monthlyBudget: 3000 }],
  financeTransactions: [{ id: "transaction-stable", type: "expense", title: "ข้าว", amount: 50, category: "ค่าอาหาร", date: "2026-09-01" }],
  savingGoals: [{ id: "saving-stable", title: "Notebook", targetAmount: 1000, savedAmount: 100 }],
  financeSettings: { dailyBudget: 200 },
  selectedFinanceMonth: "2026-09",
};
const snapshot = createAppStateSnapshot(populated, "qa-writer", new Date("2026-09-01T00:00:00.000Z"));
const confirmed = { status: "confirmed", source: "account-namespace" };
const plan = createLocalV8MigrationPlan(snapshot, userA, confirmed);

check(plan.sourceVersion === 8 && plan.readyForUpload === false, "preview must remain release-locked");
check(plan.eligibleForUploadAfterDeployment, "valid owned v8 data should be eligible after deployment");
check(plan.issues.filter((issue) => issue.severity === "error").length === 0, "valid preview should have no validation errors");
check(plan.counts.tasks === 1 && plan.counts.task_subtasks === 1 && plan.counts.task_attachments === 1, "preview counts must include parent and child rows");
check(plan.payload.tables.tasks[0].id === "task-stable" && plan.payload.tables.task_subtasks[0].task_id === "task-stable", "stable Task identity must be preserved");
check(plan.payload.tables.finance_transactions[0].category_id === "category-stable", "Finance relation must use stable category ID");
check(plan.payload.tables.class_schedules.some((row) => row.day === 5 && row.end_time === "24:00") && plan.payload.tables.class_schedules.some((row) => row.day === 6 && row.start_time === "00:00"), "weekend and 24:00 schedules must survive the local-to-cloud payload unchanged");
check(plan.financeTotals.expense === 50 && plan.financeTotals.remaining === -50, "Finance totals must preserve income - expense - saving");
check(!JSON.stringify(plan.payload).includes("not-uploaded@example.test"), "Auth email must not be duplicated in migration payload");
check(!JSON.stringify(plan.payload).includes("user_id"), "client payload must never provide trusted user_id fields");
check(LOCAL_V8_TABLE_ORDER.every((table) => Array.isArray(plan.payload.tables[table])), "every active normalized table must have an array payload");
check(createLocalV8MigrationPlan({ ...snapshot, savedAt: "2026-09-02T00:00:00.000Z", writerId: "other-tab" }, userA, confirmed).previewFingerprint === plan.previewFingerprint, "retry fingerprint must ignore volatile snapshot metadata");

const mismatch = createLocalV8MigrationPlan(snapshot, userA, { status: "owner-mismatch", source: "legacy-owner", ownerUserId: userB });
check(!mismatch.eligibleForUploadAfterDeployment && mismatch.blockingReasons.includes("local_owner_mismatch"), "cross-account local ownership must block migration");
const unowned = createLocalV8MigrationPlan(snapshot, userA, { status: "needs-adoption", source: "legacy-unowned" });
check(!unowned.eligibleForUploadAfterDeployment && unowned.blockingReasons.includes("legacy_owner_confirmation_required"), "legacy data must require explicit adoption");
const duplicate = createLocalV8MigrationPlan({ ...snapshot, tasks: [snapshot.tasks[0], { ...snapshot.tasks[0] }] }, userA, confirmed);
check(duplicate.blockingReasons.includes("duplicate_cloud_key_detected"), "duplicate stable IDs must be rejected");
const orphan = createLocalV8MigrationPlan({ ...snapshot, tasks: [{ ...snapshot.tasks[0], attachments: [{ ...snapshot.tasks[0].attachments[0], taskId: "missing-task" }] }] }, userA, confirmed);
check(orphan.blockingReasons.includes("orphan_task_attachment"), "orphan attachment relation must be rejected");
const invalidFinance = createLocalV8MigrationPlan({ ...snapshot, financeTransactions: [{ ...snapshot.financeTransactions[0], amount: -1 }] }, userA, confirmed);
check(invalidFinance.blockingReasons.includes("invalid_money_value"), "invalid money must block upload");
const missingCategory = createLocalV8MigrationPlan({ ...snapshot, financeTransactions: [{ ...snapshot.financeTransactions[0], category: "ไม่มี" }] }, userA, confirmed);
check(missingCategory.blockingReasons.includes("finance_transaction_category_is_missing"), "missing Finance category must block upload");
const removed = createLocalV8MigrationPlan({ ...snapshot, studyBlocks: [{ id: "removed" }] }, userA, confirmed);
check(removed.blockingReasons.includes("removed_top_level_feature_data_detected"), "removed feature data must never become active cloud data");

const legacyStorage = new MemoryStorage({ [APP_STATE_STORAGE_KEY]: JSON.stringify(snapshot) });
check(inspectLocalMigrationOwnership(legacyStorage, userA).status === "needs-adoption", "unowned canonical snapshot must wait for explicit adoption");
bindCanonicalStateToAccount(legacyStorage, userA);
check(inspectLocalMigrationOwnership(legacyStorage, userA).status === "confirmed", "explicit adoption must create migration ownership evidence");
check(inspectLocalMigrationOwnership(legacyStorage, userB).status === "owner-mismatch", "another account must not adopt an owned canonical snapshot");
const namespacedStorage = new MemoryStorage();
createAccountStateStorage(namespacedStorage, userA).setItem(APP_STATE_STORAGE_KEY, JSON.stringify(snapshot));
check(inspectLocalMigrationOwnership(namespacedStorage, userA).status === "confirmed", "account namespace must be owner-safe by construction");

function cloudRowsFromPlan(sourcePlan) {
  return Object.fromEntries(LOCAL_V8_TABLE_ORDER.map((table) => [table, sourcePlan.payload.tables[table].map((row) => ({ user_id: userA, ...row }))]));
}
function mockClient(tables) {
  return { from(table) { return { async select() { return { data: tables[table], error: null }; } }; }, async rpc() { throw new Error("RPC must stay locked"); } };
}

(async () => {
  const cloudRows = cloudRowsFromPlan(plan);
  const verified = await verifyCloudReadBack(mockClient(cloudRows), plan);
  check(verified.verified && verified.errors.length === 0, "read-back must verify counts, IDs, relations and Finance totals");
  const changed = cloudRowsFromPlan(plan);
  changed.finance_transactions[0].amount = 999;
  const mismatchReadBack = await verifyCloudReadBack(mockClient(changed), plan);
  check(!mismatchReadBack.verified && mismatchReadBack.errors.includes("finance_total_mismatch:expense"), "read-back must reject Finance mismatches");
  const changedChildren = cloudRowsFromPlan(plan);
  changedChildren.exam_topics[0].completed = true;
  changedChildren.grade_components[0].earned_score = 10;
  const childMismatch = await verifyCloudReadBack(mockClient(changedChildren), plan);
  check(!childMismatch.verified && childMismatch.errors.includes("field_mismatch:exam_topics.completed") && childMismatch.errors.includes("field_mismatch:grade_components.earned_score"), "read-back must compare Exam topic and Grade component values, not only IDs");
  const normalizedTimestamps = cloudRowsFromPlan(plan);
  normalizedTimestamps.tasks[0].due_date = "2026-09-30T03:00:00+00:00";
  const timestampEquivalent = await verifyCloudReadBack(mockClient(normalizedTimestamps), plan);
  check(timestampEquivalent.verified, "read-back must treat equivalent Postgres and ISO timestamp formats as equal");
  await assert.rejects(() => importLocalV8Atomically(mockClient(cloudRows), plan), /cloud_import_release_not_enabled/, "production RPC must remain release-locked");
  checks += 1;
  console.log(`TALEVO Local to Cloud migration QA passed: ${checks} checks`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
