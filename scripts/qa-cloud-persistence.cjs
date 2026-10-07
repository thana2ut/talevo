/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTalevoAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/") ? path.join(projectRoot, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

let checks = 0;
const check = (value, message) => {
  assert.ok(value, message);
  checks += 1;
};

// 1. Cloud Mutations Module Contract
const cloudMutations = fs.readFileSync(path.join(projectRoot, "src/lib/supabase/cloud-mutations.ts"), "utf8");

const requiredFunctions = [
  "persistClassSchedule",
  "persistClassSchedulesBatch",
  "deleteClassSchedule",
  "persistTask",
  "deleteTask",
  "persistExam",
  "deleteExam",
  "persistGradePlan",
  "persistFinanceTransaction",
  "deleteFinanceTransaction",
  "persistProfile",
  "persistAcademicTerm",
  "persistDailyBudget",
];

for (const fn of requiredFunctions) {
  check(cloudMutations.includes(`export async function ${fn}`), `cloud-mutations.ts must export ${fn}`);
}

const requiredTables = [
  "class_schedules",
  "tasks",
  "task_subtasks",
  "exams",
  "exam_topics",
  "grade_plans",
  "grade_components",
  "grade_thresholds",
  "finance_transactions",
  "profiles",
  "academic_terms",
];

for (const tbl of requiredTables) {
  check(cloudMutations.includes(`"${tbl}"`), `cloud-mutations.ts must target table ${tbl}`);
}

// Ensure schedule columns match Supabase v8 schema
check(cloudMutations.includes("user_id: userId"), "class_schedules write must include user_id");
check(cloudMutations.includes("course_id: schedule.courseId"), "class_schedules write must include course_id");
check(cloudMutations.includes("start_time: schedule.startTime"), "class_schedules write must include start_time");
check(cloudMutations.includes("end_time: schedule.endTime"), "class_schedules write must include end_time");

// 2. AppStateProvider Integration Contract
const appStateProvider = fs.readFileSync(path.join(projectRoot, "src/providers/app-state-provider.tsx"), "utf8");

check(appStateProvider.includes("pendingCloudMutationsRef"), "AppStateProvider must track in-flight mutations");
check(appStateProvider.includes("runCloudMutation"), "AppStateProvider must define runCloudMutation helper");
check(appStateProvider.includes("persistClassSchedule(client, uid, sched)"), "addSchedule must call persistClassSchedule");
check(appStateProvider.includes("persistClassSchedulesBatch(client, uid, list)"), "updateSchedule must call persistClassSchedulesBatch");
check(appStateProvider.includes("deleteClassSchedule(client, uid, id)"), "deleteSchedule must call deleteClassSchedule");
check(appStateProvider.includes("persistTask(client, uid, newTask)"), "addTask must call persistTask");
check(appStateProvider.includes("deleteTaskFromCloud(client, uid, id)"), "deleteTask must call deleteTaskFromCloud");
check(appStateProvider.includes("persistExam(client, uid, newExam)"), "addExam must call persistExam");
check(appStateProvider.includes("deleteExamFromCloud(client, uid, id)"), "deleteExam must call deleteExamFromCloud");
check(appStateProvider.includes("persistGradePlan(client, uid, gp)"), "upsertGradePlan must call persistGradePlan");
check(appStateProvider.includes("persistFinanceTransaction(client, uid, newTx"), "addFinanceTransaction must call persistFinanceTransaction");
check(appStateProvider.includes("deleteFinanceTransactionFromCloud(client, uid, id)"), "deleteFinanceTransaction must call deleteFinanceTransactionFromCloud");

// 3. Logout Safety: pending mutations are flushed before signOut
check(
  appStateProvider.includes("pendingCloudMutationsRef.current.size > 0") &&
  appStateProvider.includes("Promise.race") &&
  appStateProvider.includes("setTimeout(resolve, 3000)"),
  "endSession must flush pending cloud mutations with a 3-second safety timeout before signOut"
);

// 4. Retired Grade Planning Information Architecture Contract
const tasksPageRoute = fs.readFileSync(path.join(projectRoot, "src/features/tasks/task-pages.tsx"), "utf8");
check(!tasksPageRoute.includes("GradesOverviewView") && !tasksPageRoute.includes("view=grades"), "TasksPage must not expose retired Grade Planning");

check(!fs.existsSync(path.join(projectRoot, "src/app/grades/page.tsx")) && !fs.existsSync(path.join(projectRoot, "src/app/grades/[courseId]/page.tsx")), "Retired Grade Planning routes must not exist");

// 5. App Shell Navigation Hierarchy
const appShell = fs.readFileSync(path.join(projectRoot, "src/components/app-shell.tsx"), "utf8");
check(!appShell.includes('key: "nav.grades"'), "Desktop sidebar must not have standalone Grades item");
check(!appShell.includes('label: "วางแผนคะแนน"'), "Mobile More options must not have standalone 'วางแผนคะแนน'");
check(!appShell.includes('href: "/exams"'), "Retired Exams must not appear in Mobile More");
check(!appShell.includes('pathname.startsWith("/grades")'), "App shell must not retain Grade Planning route behavior");
check(!appShell.includes('href: "/finance"'), "Desktop sidebar and More sheet must not have standalone Finance");
check(!appShell.includes('label: "การเงิน"'), "Mobile More options must not have 'การเงิน'");
check(!appShell.includes("addFinance"), "Quick Add must not have 'addFinance'");

check(!fs.existsSync(path.join(projectRoot, "src/app/finance/page.tsx")) && !fs.existsSync(path.join(projectRoot, "src/app/finance/new/page.tsx")), "Retired Finance routes must not exist");

const todayPageRoute = fs.readFileSync(path.join(projectRoot, "src/features/today/today-page.tsx"), "utf8");
check(!todayPageRoute.includes('t("today.finance")') && !todayPageRoute.includes("openBudgetDialog"), "Today page must not expose retired Finance controls");



// 6. Cloud Hydration Persistence Simulation
const { hydrateCloudAccountToAppState } = require("../src/lib/supabase/cloud-hydration.ts");
const mockCloudTables = {
  profiles: [{ display_name: "Test User", major: "CS", university: "MSU" }],
  academic_terms: [{ level: "3", term: "1", academic_year: "2569" }],
  class_schedules: [
    { id: "sched-1", course_id: "course-1", name: "Algorithms", teacher: "Dr. Smith", room: "Lab 1", color: "#7656F6", day: 1, start_time: "09:00", end_time: "12:00", note: null },
    { id: "sched-2", course_id: "course-2", name: "Databases", teacher: "Dr. Jones", room: "Lab 2", color: "#159BA5", day: 3, start_time: "13:00", end_time: "16:00", note: null },
  ],
  tasks: [],
  task_subtasks: [],
  task_attachments: [],
  task_completion_history: [],
  exams: [],
  exam_topics: [],
  grade_plans: [],
  grade_components: [],
  grade_thresholds: [],
  finance_transactions: [],
  saving_goals: [],
  finance_settings: [{ daily_budget: 200, selected_month: "2026-09" }],
  finance_categories: [],
  learning_goals: [],
  app_settings: [],
  notification_records: [],
};

const hydrated = hydrateCloudAccountToAppState(mockCloudTables, {
  email: "test@talevo.app",
  writerId: "test-tab",
});

check(hydrated.schedules.length === 2, "Hydrated state must preserve cloud class_schedules across fresh login");
check(hydrated.schedules[0].name === "Algorithms", "Hydrated schedule[0] name must match");
check(hydrated.schedules[1].name === "Databases", "Hydrated schedule[1] name must match");
check(hydrated.financeSettings.dailyBudget === 0 && hydrated.financeTransactions.length === 0 && hydrated.financeCategories.length === 0 && hydrated.savingGoals.length === 0, "Hydrated state must discard retired finance data");
check(hydrated.exams.length === 0 && hydrated.gradePlans.length === 0, "Hydrated state must discard retired exam and grade-planning data");

// 7. Normal Account Flow & Absence of Blocking Gates
check(!appShell.includes("LocalOwnershipGate"), "app-shell.tsx must not block startup with LocalOwnershipGate");
check(!appShell.includes("LOCAL → CLOUD"), "app-shell.tsx must not contain LOCAL -> CLOUD navigation");
check(!appShell.includes("AppState v8"), "app-shell.tsx must not display AppState v8 badge");
check(!appShell.includes("IndexedDB"), "app-shell.tsx must not display IndexedDB text");

// 8. Settings Account Data & Optional Legacy Migration Contract
const settingsPanel = fs.readFileSync(path.join(projectRoot, "src/components/local-cloud-migration-panel.tsx"), "utf8");
check(settingsPanel.includes("ข้อมูลของบัญชี"), "Settings panel must feature 'ข้อมูลของบัญชี'");
check(settingsPanel.includes("บันทึกข้อมูลอัตโนมัติ"), "Settings panel must feature 'บันทึกข้อมูลอัตโนมัติ'");
check(settingsPanel.includes("ตารางเรียน งาน และข้อมูลอื่นของคุณจะบันทึกไว้ในบัญชี TALEVO อัตโนมัติ"), "Settings panel must explain automatic cloud persistence without retired features");
check(settingsPanel.includes("ข้อมูลเก่าในอุปกรณ์"), "Settings panel must feature 'ข้อมูลเก่าในอุปกรณ์' for legacy data");
check(settingsPanel.includes("ตรวจสอบข้อมูล"), "Settings panel must offer 'ตรวจสอบข้อมูล' action");
check(settingsPanel.includes("ย้ายข้อมูลเข้าบัญชี"), "Settings panel must offer 'ย้ายข้อมูลเข้าบัญชี' action");
check(settingsPanel.includes("บัญชีนี้มีข้อมูลอยู่แล้ว"), "Settings panel must detect conflict and show 'บัญชีนี้มีข้อมูลอยู่แล้ว'");
check(!settingsPanel.includes("AppState v8"), "Settings panel must not expose 'AppState v8'");
check(!settingsPanel.includes("IndexedDB"), "Settings panel must not expose 'IndexedDB'");
check(!settingsPanel.includes("LOCAL → CLOUD"), "Settings panel must not expose 'LOCAL → CLOUD'");

console.log(`Cloud Persistence QA passed: ${checks} checks`);
