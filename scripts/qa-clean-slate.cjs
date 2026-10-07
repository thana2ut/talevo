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

const { createEmptyAccountAppState } = require("../src/lib/app-state-defaults.ts");
const { evaluateSmartAlerts } = require("../src/lib/alerts/alert-engine.ts");
const { registrationDataFromDraft } = require("../src/lib/registration-utils.ts");

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

const baseline = createEmptyAccountAppState();
const emptyCollections = [
  "schedules", "tasks", "taskCompletionHistory", "exams", "gradePlans",
  "courseNotes", "financeTransactions", "savingGoals",
  "financeCategories", "notifications", "dismissedNotificationEventKeys", "projects", "chat",
];
for (const field of emptyCollections) {
  check(Array.isArray(baseline[field]) && baseline[field].length === 0, `${field} must start empty`);
}
check(Object.values(baseline.profile).every((value) => value === ""), "anonymous production profile must not contain example identity data");
check(Object.values(baseline.academicTerm).every((value) => value === ""), "anonymous academic term must not contain example registration data");
check(baseline.financeSettings.dailyBudget === 0, "daily budget must start at zero");
check(baseline.goals.weeklyStudyHours === 0 && baseline.goals.earlySubmissionDays === 0 && baseline.goals.examPreparationDays === 0 && baseline.goals.personalGoal === "", "learning goals must start empty and at zero");

const registration = registrationDataFromDraft({
  displayName: "ผู้ใช้ QA", email: "qa-clean-slate@example.invalid", password: "not-persisted",
  confirmPassword: "not-persisted", major: "วิศวกรรมซอฟต์แวร์", university: "มหาวิทยาลัย QA",
  level: "ชั้นปีที่ 1", term: "ภาคเรียนที่ 1", academicYear: "2569",
});
const registeredBaseline = createEmptyAccountAppState(registration.profile, registration.academicTerm);
check(registeredBaseline.profile === registration.profile && registeredBaseline.academicTerm === registration.academicTerm, "registration may initialize only profile and academic term identity");
for (const field of emptyCollections) {
  check(registeredBaseline[field].length === 0, `${field} must remain empty after registration initialization`);
}

const alertContext = {
  now: new Date(2026, 8, 7, 7, 5),
  tasks: [], schedules: [], exams: [], profile: registration.profile,
  academicTerm: registration.academicTerm,
  preferences: baseline.settings.notificationPreferences,
  language: "th", existingEventKeys: new Set(), dismissedEventKeys: new Set(),
};
check(evaluateSmartAlerts(alertContext).length === 0, "an empty account must not generate a daily academic notification");
check(evaluateSmartAlerts({ ...alertContext, now: new Date(2026, 8, 7, 6, 0) }).length === 0, "an empty account must not generate a morning academic notification");

const trigger = read("supabase/migrations/20260901112000_talevo_auth_profile_trigger.sql");
const triggerInsertTables = [...trigger.matchAll(/insert\s+into\s+public\.([a-z_]+)/gi)].map((match) => match[1]);
check(JSON.stringify(triggerInsertTables) === JSON.stringify(["profiles", "academic_terms"]), "Auth trigger must insert only profile and academic term rows");

const appStateProvider = read("src/providers/app-state-provider.tsx");
const appShell = read("src/components/app-shell.tsx");
const todayPage = read("src/features/today/today-page.tsx");
const aiPage = read("src/features/ai/ai-page.tsx");
const migrationPlanner = read("src/lib/supabase/local-v8-migration.ts");
check(!appShell.includes("LocalOwnershipGate"), "app-shell.tsx must not block normal user startup with LocalOwnershipGate");
check(!appShell.includes("LOCAL → CLOUD"), "app-shell.tsx must not present Local -> Cloud in normal user navigation");
check(appStateProvider.includes('recordLocalOwnershipDecision(window.localStorage, userId, "fresh")'), "fresh choice must be remembered without deleting legacy state");
check(todayPage.includes("เพิ่มตารางเรียนแรก") && todayPage.includes("เพิ่มงานแรก"), "Today must expose real empty-state actions");
check(!fs.existsSync(path.join(projectRoot, "src/features/statistics-page.tsx")), "Statistics page component must be removed");
check(!fs.existsSync(path.join(projectRoot, "src/app/statistics/page.tsx")), "Statistics route must not exist");
check(!fs.existsSync(path.join(projectRoot, "src/features/finance/finance-pages.tsx")), "Finance page component must be removed");
check(!fs.existsSync(path.join(projectRoot, "src/app/finance/page.tsx")), "Finance route must not exist");
check(!todayPage.includes('t("today.finance")') && !todayPage.includes("วันนี้ใช้ไป") && !todayPage.includes("งบรายวัน"), "Today must keep the removed finance card out of the active UI");
check(aiPage.includes("ประวัติการสนทนายังว่างอยู่") && aiPage.includes("chat.length === 0"), "AI must show a non-persisted welcome state while chat history remains empty");
check(!/readyForUpload:\s*true/.test(migrationPlanner), "Local to Cloud upload must remain disabled");
check(!fs.existsSync(path.join(projectRoot, "src/lib/mock-data.ts")), "production mock data module must be removed");

const productionFiles = [];
function collectProductionFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectProductionFiles(target);
    else if (/\.(ts|tsx)$/.test(entry.name)) productionFiles.push(target);
  }
}
collectProductionFiles(path.join(projectRoot, "src"));
const forbiddenProductionData = /\b(mock|demo|sample|fixture|seed)\b/i;
const qaOnlyRelativeFiles = new Set([
  "src/app/qa/local-cloud-migration/page.tsx",
  "src/components/qa-local-cloud-migration-panel.tsx",
  "src/lib/ai/syllabus-probe.ts",
  "src/lib/supabase/qa-local-v8-fixture.ts",
  "src/lib/supabase/qa-cloud-hydration.ts",
]);
const activeProductionFiles = productionFiles.filter((file) => !qaOnlyRelativeFiles.has(path.relative(projectRoot, file).replaceAll("\\", "/")));
check(activeProductionFiles.every((file) => !forbiddenProductionData.test(fs.readFileSync(file, "utf8"))), "active production TypeScript must not contain demo-data injection markers");
const qaRoute = read("src/app/qa/local-cloud-migration/page.tsx");
check(qaRoute.includes('process.env.NODE_ENV !== "development"') && qaRoute.includes("notFound()"), "QA data route must return 404 outside development");
const proxySource = read("src/proxy.ts");
check(proxySource.includes('process.env.NODE_ENV !== "development"') && proxySource.includes('pathname.startsWith("/qa/")') && proxySource.includes("status: 404"), "Production Proxy must reject QA routes before session/page rendering");
check(productionFiles.filter((file) => fs.readFileSync(file, "utf8").includes("QaLocalCloudMigrationPanel")).length === 2, "QA panel must be referenced only by its own component and development-only route");

console.log(`TALEVO clean-slate QA passed: ${checks} checks`);
