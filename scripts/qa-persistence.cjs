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

const {
  APP_STATE_BACKUP_KEY,
  APP_STATE_CURRENT_VERSION,
  APP_STATE_STORAGE_KEY,
  LEGACY_KERNOVA_APP_STATE_BACKUP_KEY,
  LEGACY_KERNOVA_APP_STATE_KEY,
  LEGACY_KERNOVA_STORAGE_KEYS,
  TALEVO_APP_STATE_BACKUP_KEY,
  TALEVO_APP_STATE_KEY,
  createAppStateSnapshot,
  parseAppStateSnapshot,
  readAppStateSnapshot,
  writeAppStateSnapshot,
} = require("../src/lib/persistence/app-state-storage.ts");
const {
  LEGACY_KERNOVA_ALERT_LEADER_STORAGE_KEY,
  TALEVO_ALERT_LEADER_STORAGE_KEY,
} = require("../src/lib/talevo-storage-keys.ts");
const { buildAcademicWeekLoad } = require("../src/lib/alerts/weekly-radar.ts");
const { claimAlertDeliveryLeadership } = require("../src/lib/alerts/notification-delivery.ts");
const { isValidTalevoHex, talevoPresetColors, normalizeTalevoColor } = require("../src/lib/talevo-color-utils.ts");

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const preferences = {
  enabled: true, task24h: true, task12h: true, deadlineRisk: true,
  morning0600: true, daily0700: true, class30m: true, classEnd10m: true,
  exam7d: true, exam3d: true, exam1d: true, examMorning: true,
  weeklyRadar: true, browserNotifications: false,
};
const schedule = {
  id: "class-database", courseId: "course-database", name: "Database",
  teacher: "อ.เคน", room: "IT-301", color: "purple", day: 0,
  startTime: "09:00", endTime: "12:00", note: "Bring a laptop",
};
const exam = {
  id: "exam-database-midterm", courseId: "course-database", title: "Database Midterm",
  type: "midterm", startAt: "2026-09-15T09:00", endAt: "2026-09-15T12:00",
  room: "IT-302", note: "Closed book",
  topics: [{ id: "topic-normalization", title: "Normalization", completed: false }],
  createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z",
};
const task = {
  id: "task-database", courseId: "course-database", title: "Database lab",
  description: "QA", dueLabel: "วันนี้", dueDate: "2026-09-07T10:00",
  estimate: "5 ชั่วโมง", status: "todo", color: "#7656f6",
  subtasks: [{ id: "subtask-query", title: "Query", completed: false }],
  attachments: [{ id: "attachment-meta", taskId: "task-database", name: "schema.pdf", mimeType: "application/pdf", size: 1200, kind: "file", createdAt: "2026-08-31T00:00:00.000Z" }],
};
const notification = {
  id: "notification-1", type: "class_upcoming", priority: "medium", title: "Class",
  message: "Database starts soon", createdAt: "2026-08-31T00:00:00.000Z",
  eventKey: "class-30m:class-database:2026-09-07",
};
const defaults = {
  profile: { displayName: "QA", email: "qa@example.com", major: "CS", university: "TALEVO" },
  academicTerm: { level: "ชั้นปีที่ 2", term: "ภาคเรียนที่ 1", academicYear: "2569" },
  schedules: [schedule], tasks: [task], taskCompletionHistory: [], exams: [exam],
  gradePlans: [], courseNotes: [], attendanceRecords: [], financeTransactions: [], savingGoals: [],
  financeSettings: { dailyBudget: 200 }, financeCategories: [],
  goals: { weeklyStudyHours: 18, earlySubmissionDays: 2, examPreparationDays: 7, personalGoal: "Pass" },
  notifications: [notification],
  dismissedNotificationEventKeys: [],
  settings: { notificationPreferences: preferences, timezone: "Asia/Bangkok", dateFormat: "วัน/เดือน/ปี", yearSystem: "พ.ศ." },
  projects: [], chat: [], selectedFinanceMonth: "2026-09",
};

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const emptyRead = readAppStateSnapshot(new MemoryStorage(), defaults);
check(emptyRead.source === "defaults", "empty storage should use safe defaults");
check(emptyRead.state.version === APP_STATE_CURRENT_VERSION, "default snapshot should use current version");
check(APP_STATE_CURRENT_VERSION === 8, "storage-key rebranding must not change the v8 data schema");
check(APP_STATE_STORAGE_KEY === "talevo-app-state" && APP_STATE_BACKUP_KEY === "talevo-app-state-backup", "Talevo keys should be canonical");

const snapshot = createAppStateSnapshot(defaults, "tab-a", new Date("2026-08-31T01:00:00.000Z"));
const storage = new MemoryStorage();
writeAppStateSnapshot(storage, snapshot);
const persistedRead = readAppStateSnapshot(storage, defaults);
check(persistedRead.source === "primary", "written state should read from primary snapshot");
check(persistedRead.state.schedules[0].id === schedule.id, "schedule id should survive serialization");
check(persistedRead.state.schedules[0].room === "IT-301" && persistedRead.state.schedules[0].note === schedule.note, "all schedule fields should survive serialization");
check(persistedRead.state.schedules[0].color === "#7656F6", "legacy named course colors should normalize without changing their visible accent");
const deletedNotificationSnapshot = createAppStateSnapshot({ ...defaults, notifications: [], dismissedNotificationEventKeys: [notification.eventKey] }, "tab-delete", new Date("2026-08-31T01:10:00.000Z"));
const deletedNotificationStorage = new MemoryStorage();
writeAppStateSnapshot(deletedNotificationStorage, deletedNotificationSnapshot);
const refreshedDeletedNotifications = readAppStateSnapshot(deletedNotificationStorage, defaults);
check(refreshedDeletedNotifications.state.notifications.length === 0 && refreshedDeletedNotifications.state.dismissedNotificationEventKeys.includes(notification.eventKey), "deleted notifications and their tombstones must survive a refresh snapshot");
const synchronizedDeletedNotifications = parseAppStateSnapshot(deletedNotificationStorage.getItem(APP_STATE_STORAGE_KEY), defaults);
check(synchronizedDeletedNotifications?.notifications.length === 0 && synchronizedDeletedNotifications.dismissedNotificationEventKeys.includes(notification.eventKey), "cross-tab snapshot parsing must retain deleted notification state");
check(persistedRead.state.exams[0].id === exam.id, "exam id should survive serialization");
check(persistedRead.state.exams[0].endAt === exam.endAt && persistedRead.state.exams[0].room === exam.room && persistedRead.state.exams[0].note === exam.note, "optional exam fields should survive serialization");
check(persistedRead.state.exams[0].topics[0].id === "topic-normalization", "exam topics should survive serialization");
check(persistedRead.state.tasks[0].attachments[0].name === "schema.pdf", "attachment metadata should survive without storing a Blob");
check(!storage.getItem(APP_STATE_STORAGE_KEY).includes("avatarUrl"), "session-only object URLs should not be persisted");

const editedSnapshot = createAppStateSnapshot({ ...defaults, schedules: [{ ...schedule, room: "IT-401" }] }, "tab-a", new Date("2026-08-31T01:01:00.000Z"));
writeAppStateSnapshot(storage, editedSnapshot);
check(JSON.parse(storage.getItem(APP_STATE_BACKUP_KEY)).schedules[0].room === "IT-301", "write should retain one last-known-good backup");
check(readAppStateSnapshot(storage, defaults).state.schedules[0].room === "IT-401", "new primary should not resurrect old schedule state");

const customCourseSnapshot = createAppStateSnapshot({ ...defaults, schedules: [{ ...schedule, color: "#2a9d8f" }] }, "tab-a", new Date("2026-08-31T01:02:00.000Z"));
writeAppStateSnapshot(storage, customCourseSnapshot);
check(readAppStateSnapshot(storage, defaults).state.schedules[0].color === "#2A9D8F", "custom course HEX should persist in canonical form after refresh");
check(normalizeTalevoColor("#F90") === "#FF9900", "short HEX should normalize to canonical #RRGGBB");
check(talevoPresetColors.length === 18, "the shared visible recommendation palette should remain compact");
check(normalizeTalevoColor("#123abc") === "#123ABC", "saved custom HEX values outside recommendations must remain canonical and usable");
check(!isValidTalevoHex("#GGGGGG") && !isValidTalevoHex("7656") && !isValidTalevoHex("#12"), "invalid course HEX values should be rejected");

const corruptStorage = new MemoryStorage({
  [APP_STATE_STORAGE_KEY]: "{broken",
  [APP_STATE_BACKUP_KEY]: JSON.stringify(snapshot),
});
const recovered = readAppStateSnapshot(corruptStorage, defaults);
check(recovered.source === "backup" && recovered.state.exams[0].id === exam.id, "corrupt primary should recover from backup");
check(recovered.warnings.includes("primary_snapshot_invalid"), "backup recovery should expose a developer warning");
check(parseAppStateSnapshot("not-json", defaults) === null, "malformed storage should parse safely");

const legacyTask = { ...task, id: "legacy-task" };
const legacyStorage = new MemoryStorage({
  [LEGACY_KERNOVA_STORAGE_KEYS.tasks]: JSON.stringify([legacyTask]),
  [LEGACY_KERNOVA_STORAGE_KEYS.notifications]: JSON.stringify([notification]),
  [LEGACY_KERNOVA_STORAGE_KEYS.settings]: JSON.stringify(defaults.settings),
});
const legacyRead = readAppStateSnapshot(legacyStorage, defaults);
check(legacyRead.source === "legacy-fragments" && legacyRead.state.tasks[0].id === "legacy-task", "fragmented legacy task keys should migrate without data loss");
check(legacyRead.state.schedules[0].id === schedule.id && legacyRead.state.exams[0].id === exam.id, "legacy import should preserve safe defaults for previously unpersisted sections");
check(Boolean(legacyStorage.getItem(TALEVO_APP_STATE_KEY)) && Boolean(legacyStorage.getItem(TALEVO_APP_STATE_BACKUP_KEY)), "fragmented legacy import should establish both Talevo snapshots");

const migrationState = createAppStateSnapshot({
  ...defaults,
  profile: { ...defaults.profile, displayName: "Legacy QA" },
  gradePlans: [{ id: "grade-plan-legacy", courseId: schedule.courseId, components: [], thresholds: [], targetGrade: "A" }],
  financeTransactions: [{ id: "finance-legacy", type: "expense", title: "Legacy lunch", amount: 321, category: "ค่าอาหาร", date: "2026-08-31" }],
  settings: { ...defaults.settings, dateFormat: "เดือน/วัน/ปี" },
}, "legacy-tab", new Date("2026-08-31T02:00:00.000Z"));
const legacyPrimaryStorage = new MemoryStorage({ [LEGACY_KERNOVA_APP_STATE_KEY]: JSON.stringify(migrationState) });
const legacyPrimaryRead = readAppStateSnapshot(legacyPrimaryStorage, defaults);
check(legacyPrimaryRead.source === "legacy-primary", "legacy Kernova primary should be identified as the migration source");
check(legacyPrimaryRead.state.profile.displayName === "Legacy QA" && legacyPrimaryRead.state.tasks.length === 1 && legacyPrimaryRead.state.schedules.length === 1 && legacyPrimaryRead.state.exams.length === 1, "legacy primary migration must retain profile, tasks, schedule and exams");
check(legacyPrimaryRead.state.gradePlans[0].id === "grade-plan-legacy" && legacyPrimaryRead.state.financeTransactions[0].id === "finance-legacy" && legacyPrimaryRead.state.notifications[0].id === notification.id, "legacy primary migration must retain grades, finance and notifications");
check(legacyPrimaryRead.state.settings.dateFormat === "เดือน/วัน/ปี", "legacy primary migration must retain settings");
check(legacyPrimaryStorage.getItem(TALEVO_APP_STATE_KEY) === legacyPrimaryStorage.getItem(TALEVO_APP_STATE_BACKUP_KEY), "legacy primary migration should write matching Talevo primary and backup snapshots");
check(legacyPrimaryStorage.getItem(LEGACY_KERNOVA_APP_STATE_KEY) !== null, "legacy primary should remain during the compatibility period");
const refreshes = [1, 2, 3].map(() => readAppStateSnapshot(legacyPrimaryStorage, defaults));
check(refreshes.every((result) => result.source === "primary" && result.state.tasks.length === 1 && result.state.financeTransactions.length === 1), "three refreshes must use Talevo primary without duplicates or resets");

const legacyBackupStorage = new MemoryStorage({
  [LEGACY_KERNOVA_APP_STATE_KEY]: "{broken",
  [LEGACY_KERNOVA_APP_STATE_BACKUP_KEY]: JSON.stringify(migrationState),
});
const legacyBackupRead = readAppStateSnapshot(legacyBackupStorage, defaults);
check(legacyBackupRead.source === "legacy-backup" && legacyBackupRead.state.tasks[0].id === task.id, "corrupt legacy primary should recover from a valid legacy backup");
check(legacyBackupRead.warnings.includes("legacy_primary_snapshot_invalid"), "legacy backup recovery should report the corrupt legacy primary");
check(Boolean(legacyBackupStorage.getItem(TALEVO_APP_STATE_KEY)) && Boolean(legacyBackupStorage.getItem(TALEVO_APP_STATE_BACKUP_KEY)), "legacy backup recovery should establish both Talevo snapshots");

const currentSnapshot = createAppStateSnapshot({ ...defaults, tasks: [{ ...task, id: "current-task" }] }, "current-tab", new Date("2026-08-31T03:00:00.000Z"));
const staleLegacySnapshot = createAppStateSnapshot({ ...defaults, tasks: [{ ...task, id: "stale-legacy-task" }] }, "legacy-tab", new Date("2026-08-31T01:00:00.000Z"));
const priorityStorage = new MemoryStorage({
  [TALEVO_APP_STATE_KEY]: JSON.stringify(currentSnapshot),
  [LEGACY_KERNOVA_APP_STATE_KEY]: JSON.stringify(staleLegacySnapshot),
});
const priorityRead = readAppStateSnapshot(priorityStorage, defaults);
check(priorityRead.source === "primary" && priorityRead.state.tasks[0].id === "current-task", "Talevo primary must take priority and legacy state must never overwrite it");

const v1Storage = new MemoryStorage({
  [APP_STATE_STORAGE_KEY]: JSON.stringify({ ...defaults, version: 1, settings: { timezone: "Asia/Bangkok", dateFormat: "วัน/เดือน/ปี", yearSystem: "พ.ศ." }, notificationPreferences: { ...preferences, weeklyRadar: false } }),
});
const migrated = readAppStateSnapshot(v1Storage, defaults);
check(migrated.state.version === APP_STATE_CURRENT_VERSION && migrated.state.settings.notificationPreferences.weeklyRadar === false, "v1 preferences should migrate through every current schema version");

const v4FeatureState = {
  ...defaults,
  version: 4,
  studyBlocks: [{ id: "qa-study-block", title: "QA study block", startAt: "2026-09-07T13:00:00.000Z", endAt: "2026-09-07T14:00:00.000Z", sourceType: "task", sourceId: task.id, createdAt: "2026-09-01T00:00:00.000Z" }],
  academicRoute: { id: "qa-route", destination: { type: "task", sourceId: task.id }, status: "on_track", version: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", steps: [] },
};
const v4Read = readAppStateSnapshot(new MemoryStorage({ [APP_STATE_STORAGE_KEY]: JSON.stringify(v4FeatureState) }), defaults);
check(v4Read.state.version === APP_STATE_CURRENT_VERSION && !("studyBlocks" in v4Read.state) && !("academicRoute" in v4Read.state), "v4 migration must strip only removed GPS and Life Rescue fields");
check(v4Read.state.tasks[0].id === task.id && v4Read.state.schedules[0].id === schedule.id && v4Read.state.exams[0].id === exam.id && v4Read.state.notifications[0].id === notification.id, "v4 migration must preserve unrelated user data");
check(v4Read.state.dismissedNotificationEventKeys.length === 0, "older snapshots must safely default dismissed event history during v7 migration");
const backupV4Read = readAppStateSnapshot(new MemoryStorage({ [APP_STATE_STORAGE_KEY]: "{broken", [APP_STATE_BACKUP_KEY]: JSON.stringify(v4FeatureState) }), defaults);
check(backupV4Read.source === "backup" && !("studyBlocks" in backupV4Read.state) && !("academicRoute" in backupV4Read.state), "backup normalization must not resurrect removed feature data");

const v6NotificationState = { ...defaults, version: 6, dismissedNotificationEventKeys: ["task-24h:task-database:2026-09-08T08:00", "task-24h:task-database:2026-09-08T08:00", 7] };
const v6Read = readAppStateSnapshot(new MemoryStorage({ [APP_STATE_STORAGE_KEY]: JSON.stringify(v6NotificationState) }), defaults);
check(v6Read.state.version === APP_STATE_CURRENT_VERSION && v6Read.state.dismissedNotificationEventKeys.length === 1, "v6 migration must retain only valid unique dismissed event keys");

const v7SubmissionState = { ...defaults, version: 7, tasks: [{ ...task, completedAt: "2026-09-07T08:00:00.000Z", requiresSubmission: true, submittedAt: "2026-09-07T08:15:00.000Z", submissionNote: "legacy", submissionEvidenceAttachmentIds: [] }], settings: { ...defaults.settings, notificationPreferences: { ...defaults.settings.notificationPreferences, submissionReminders: true } }, notifications: [{ ...notification, type: "task_submission_pending", eventKey: "task-submission-2h:legacy" }] };
const v7Read = readAppStateSnapshot(new MemoryStorage({ [APP_STATE_STORAGE_KEY]: JSON.stringify(v7SubmissionState) }), defaults);
check(v7Read.state.tasks[0].completedAt === "2026-09-07T08:00:00.000Z" && !("requiresSubmission" in v7Read.state.tasks[0]) && v7Read.state.notifications.length === 0 && !("submissionReminders" in v7Read.state.settings.notificationPreferences), "v7 migration must retain completed tasks while stripping retired submission data");

const now = new Date(2026, 8, 7, 8, 0, 0);
const twoClasses = [
  { ...schedule, id: "class-one", day: 0, startTime: "08:00", endTime: "09:00" },
  { ...schedule, id: "class-two", day: 0, startTime: "13:00", endTime: "16:00" },
];
const week = buildAcademicWeekLoad({ now, schedules: twoClasses, tasks: [task], exams: [], language: "th" });
const monday = week.days[0];
check(week.days.length === 7 && week.days[6].dateKey === "2026-09-13", "weekly range should use today plus six local dates");
check(monday.classCount === 2 && monday.classMinutes === 240, "class load should total real class minutes");
check(monday.taskDueCount === 1 && monday.taskRiskCount === 1 && monday.taskLoads.length === 1, "one at-risk due task should remain one source entity");
check(monday.reasons.filter((reason) => reason.sourceId === task.id).length === 2, "due and risk explanations should share the same task source id");

const leaseStorage = new MemoryStorage();
check(claimAlertDeliveryLeadership(leaseStorage, "tab-a", 1_000), "first tab should acquire delivery leadership");
check(leaseStorage.getItem(TALEVO_ALERT_LEADER_STORAGE_KEY) !== null, "notification leadership should use the Talevo canonical key");
check(!claimAlertDeliveryLeadership(leaseStorage, "tab-b", 1_001), "second tab should not deliver during an active lease");
check(claimAlertDeliveryLeadership(leaseStorage, "tab-b", 100_001), "another tab should take over after lease expiry");

const legacyLeaseStorage = new MemoryStorage({
  [LEGACY_KERNOVA_ALERT_LEADER_STORAGE_KEY]: JSON.stringify({ tabId: "legacy-tab", expiresAt: 50_000 }),
});
check(!claimAlertDeliveryLeadership(legacyLeaseStorage, "talevo-tab", 1_000), "an active legacy leader lease should prevent duplicate notification delivery during rollout");
check(claimAlertDeliveryLeadership(legacyLeaseStorage, "talevo-tab", 60_000), "Talevo should claim canonical notification leadership after the legacy lease expires");
check(JSON.parse(legacyLeaseStorage.getItem(TALEVO_ALERT_LEADER_STORAGE_KEY)).tabId === "talevo-tab", "notification leader migration should write only the Talevo canonical key");

console.log(`Persistence and shared radar QA passed: ${checks} checks`);
