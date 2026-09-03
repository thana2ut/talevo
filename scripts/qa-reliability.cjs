/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  const target = request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, target, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { getMonthlyFinanceSummaryForMonth, getMonthlyRemaining, monthKeyToDate } = require("../src/lib/finance-utils.ts");
const { validateGradePlan } = require("../src/lib/academic-utils.ts");
const { createEmptyAccountAppState } = require("../src/lib/app-state-defaults.ts");
const { APP_STATE_CURRENT_VERSION, normalizePersistedState } = require("../src/lib/persistence/app-state-storage.ts");
const { createAccountStateStorage, getAccountStateKeys } = require("../src/lib/persistence/local-account-storage.ts");
const { MAX_TASK_ATTACHMENT_BYTES, MAX_TASK_ATTACHMENTS_TOTAL_BYTES } = require("../src/lib/task-attachment-validation.ts");

check(getMonthlyRemaining(10000, 1250, 2000) === 6750, "Finance remaining formula regressed");
const finance = getMonthlyFinanceSummaryForMonth([
  { id: "i", type: "income", amount: 10000, date: "2026-09-01" },
  { id: "e", type: "expense", amount: 1250, date: "2026-09-02" },
  { id: "s", type: "saving", amount: 2000, date: "2026-09-03" },
], "2026-09");
check(finance.income === 10000 && finance.expenses === 1250 && finance.savingsTransfers === 2000 && finance.remaining === 6750, "Finance summary is not internally consistent");
check(Number.isFinite(finance.remaining), "Finance summary must remain finite for normalized input");
check(monthKeyToDate("2024-02").getMonth() === 1, "Leap-month key parsing failed");
check(MAX_TASK_ATTACHMENT_BYTES === 10 * 1024 * 1024 && MAX_TASK_ATTACHMENTS_TOTAL_BYTES === 50 * 1024 * 1024, "Local attachment size budgets regressed");

const invalidGrade = {
  id: "grade", courseId: "course", targetGrade: "A", thresholds: [{ label: "A", minimumPercent: Number.NaN }],
  components: [{ id: "component", name: "Final", weight: Number.POSITIVE_INFINITY, maxScore: 100 }],
};
check(validateGradePlan(invalidGrade).isValid === false, "Non-finite grade values must be rejected");

const defaults = createEmptyAccountAppState();
const normalized = normalizePersistedState({
  version: 8,
  savedAt: "2026-09-02T00:00:00.000Z",
  ...defaults,
  unknownFutureField: { ignored: true },
  schedules: [{ id: "bad-day", courseId: "c", name: "QA", day: 9, startTime: "09:00", endTime: "10:00" }],
  tasks: [
    { id: "valid", title: "งานทดสอบ", dueDate: "2026-09-02T23:59", status: "todo", subtasks: null, attachments: null },
    { id: "invalid", title: 42, dueDate: "bad", status: "todo" },
  ],
  financeTransactions: [
    { id: "finite", type: "income", amount: 100, date: "2026-09-02" },
    { id: "nan", type: "expense", amount: Number.NaN, date: "2026-09-02" },
  ],
  financeSettings: { dailyBudget: Number.POSITIVE_INFINITY },
  selectedFinanceMonth: null,
}, defaults);
check(normalized?.version === APP_STATE_CURRENT_VERSION, "Normalized AppState must remain v8");
check(normalized?.schedules.length === 0, "Invalid schedule day must be discarded safely");
check(normalized?.tasks.length === 1 && normalized.tasks[0].subtasks.length === 0 && normalized.tasks[0].attachments.length === 0, "Corrupted task optional fields must normalize safely");
check(normalized?.financeTransactions.length === 1 && normalized.financeTransactions[0].amount === 100, "Non-finite finance records must be discarded");
check(normalized?.financeSettings.dailyBudget === 0, "Non-finite finance settings must fall back safely");
check(normalized?.selectedFinanceMonth === defaults.selectedFinanceMonth, "Invalid selected month must use the current safe default");
check(normalizePersistedState({ version: 999 }, defaults) === null, "Unknown future schema must fail closed");

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const memory = new MemoryStorage();
const a = createAccountStateStorage(memory, "A");
const b = createAccountStateStorage(memory, "B");
a.setItem("talevo-app-state", "state-a");
b.setItem("talevo-app-state", "state-b");
check(a.getItem("talevo-app-state") === "state-a" && b.getItem("talevo-app-state") === "state-b", "Account switching must preserve isolated local state");
check(getAccountStateKeys("A").primary !== getAccountStateKeys("B").primary, "Account namespace keys must differ");

const accountActions = read("src/components/account-actions.tsx");
const publicPages = read("src/features/public/public-pages.tsx");
const syllabusUi = read("src/features/academic/syllabus-scanner.tsx");
const aiUi = read("src/features/ai/ai-page.tsx");
const authProvider = read("src/providers/auth-provider.tsx");
const appStateStorage = read("src/lib/persistence/app-state-storage.ts");
const migration = read("src/lib/supabase/local-v8-migration.ts");
const hydration = read("src/lib/supabase/qa-cloud-hydration.ts");
const cloudRepository = read("src/lib/supabase/cloud-v8-repository.ts");
const globals = read("src/app/globals.css");
const schedulePages = read("src/features/schedule/schedule-pages.tsx");
const taskCreate = read("src/features/tasks/task-create-page.tsx");
const examForm = read("src/features/academic/academic-pages.tsx");

check((accountActions.match(/useRef\(false\)/g) ?? []).length >= 2, "Logout/account delete require synchronous duplicate locks");
check((publicPages.match(/useRef\(false\)/g) ?? []).length >= 3, "Auth forms require synchronous submit/resend locks");
check(syllabusUi.includes("analysingLockRef") && syllabusUi.includes("importingLockRef"), "Syllabus analyze/import require duplicate locks");
check(aiUi.includes("requestInFlightRef") || aiUi.includes("inFlight"), "AI send requires a concurrent-request lock");
check(syllabusUi.includes("AbortController") && syllabusUi.includes("abort()") && syllabusUi.includes("useEffect"), "Syllabus requests must abort on cancellation/unmount");
check(aiUi.includes("AbortController") && aiUi.includes("abort()"), "AI requests must support cancellation");
check(authProvider.includes(".catch(() =>") && authProvider.includes("setIsLoading(false)"), "Session restore failure must stop loading");
check(appStateStorage.indexOf("TALEVO_APP_STATE_BACKUP_KEY") < appStateStorage.indexOf("TALEVO_APP_STATE_KEY", appStateStorage.indexOf("function persistLegacySnapshotAsTalevo")), "Recovery backup must be written before canonical primary");
check(migration.includes("createLocalV8MigrationPlan") && migration.includes("Number.isFinite"), "Cloud migration must validate snapshot integrity and finite numbers");
check(hydration.includes("numberValue") && hydration.includes("createAppStateSnapshot") && cloudRepository.includes("qa_read_back_not_verified"), "Cloud hydration must normalize and verify its read-back contract");
check(globals.includes("overflow-wrap: anywhere") && globals.includes("min-width: 0"), "Long-content wrapping/min-width protection is missing");
check(globals.includes("100svh") && globals.includes("100dvh"), "Mobile viewport needs stable and dynamic viewport units");
check(fs.existsSync(path.join(root, "src/app/error.tsx")) && fs.existsSync(path.join(root, "src/app/global-error.tsx")) && fs.existsSync(path.join(root, "src/app/not-found.tsx")), "Error/not-found recovery pages are incomplete");
check(schedulePages.includes("endTime") && schedulePages.includes("startTime") && /end.*start|start.*end/s.test(schedulePages), "Schedule form must validate its time relation");
check(taskCreate.includes("parseLocalTaskDate") && taskCreate.includes("กำหนดส่งให้ถูกต้อง"), "Task form must reject an invalid due date");
check(examForm.includes("validateExamDateTimeInput") || examForm.includes("startAt"), "Exam form lacks date/time validation contract");
check(!/localStorage\.clear\s*\(|indexedDB\.deleteDatabase\s*\(/.test([accountActions, publicPages, syllabusUi, aiUi].join("\n")), "Failure handling must not clear global local data");
check(read("docs/talevo-final-live-qa.md").includes("390x844") && read("docs/talevo-final-live-qa.md").includes("1366x768"), "Final authenticated QA checklist is incomplete");

console.log(`TALEVO Reliability contract: ${checks} checks passed`);
