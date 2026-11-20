/* eslint-disable @typescript-eslint/no-require-imports */
process.env.TZ = "Asia/Bangkok";

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

const { evaluateClassAlerts, evaluateSmartAlerts } = require("../src/lib/alerts/alert-engine.ts");
const { buildPushSchedule } = require("../src/lib/push/schedule-plan.ts");
const { qualifiesForBrowserDelivery } = require("../src/lib/alerts/notification-delivery.ts");
const { calculateDeadlineRisk } = require("../src/lib/alerts/deadline-risk.ts");
const { getUnreadNotificationCount, groupNotifications } = require("../src/lib/alerts/notification-utils.ts");

const defaultPreferences = {
  enabled: true,
  task24h: true,
  task12h: true,
  deadlineRisk: true,
  morning0600: true,
  daily0700: true,
  class30m: true,
  classEnd10m: true,
  exam7d: true,
  exam3d: true,
  exam1d: true,
  examMorning: true,
  weeklyRadar: true,
  weeklySummaryDay: 1,
  weeklySummaryTime: "07:00",
};
const profile = { displayName: "ผู้ทดสอบ", email: "qa@example.com", major: "QA", university: "TALEVO" };
const academicTerm = { level: "ชั้นปีที่ 2", term: "ภาคเรียนที่ 1", academicYear: "2569" };
const baseSchedule = [
  { id: "class-a", courseId: "course-a", name: "Database", teacher: "Teacher", room: "A1", color: "purple", day: 0, startTime: "08:30", endTime: "10:00" },
  { id: "class-b", courseId: "course-b", name: "English", teacher: "Teacher", room: "B1", color: "blue", day: 0, startTime: "10:30", endTime: "11:30" },
];

const dateTime = (day, time) => new Date(`${day}T${time}:00`);
const task = (id, dueDate, estimate = "2 ชั่วโมง", status = "todo") => ({ id, title: id, description: "QA", dueLabel: "QA", dueDate, estimate, status, color: "purple", subtasks: [] });
const context = (now, overrides = {}) => ({ now, tasks: [], schedules: baseSchedule, exams: [], profile, academicTerm, preferences: defaultPreferences, language: "th", existingEventKeys: new Set(), ...overrides });
const types = (alerts) => alerts.map((alert) => alert.type);

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const now24 = dateTime("2026-09-07", "08:00");
const due24 = "2026-09-08T08:00";
const alerts24 = evaluateSmartAlerts(context(now24, { tasks: [task("task-24", due24)] }));
const deadline24 = alerts24.find((alert) => alert.eventKey.startsWith("task-24h:"));
check(Boolean(deadline24), "24-hour task alert should be created");
const duplicate24 = evaluateSmartAlerts(context(now24, { tasks: [task("task-24", due24)], existingEventKeys: new Set([deadline24.eventKey]) }));
check(!duplicate24.some((alert) => alert.eventKey === deadline24.eventKey), "eventKey should prevent duplicate task alerts");
const dismissed24 = evaluateSmartAlerts(context(now24, { tasks: [task("task-24", due24)], dismissedEventKeys: new Set([deadline24.eventKey]) }));
check(!dismissed24.some((alert) => alert.eventKey === deadline24.eventKey), "a deleted alert event key should not be regenerated");

const now12 = dateTime("2026-09-07", "20:00");
const alerts12 = evaluateSmartAlerts(context(now12, { tasks: [task("task-12", due24)] }));
check(alerts12.some((alert) => alert.eventKey.startsWith("task-12h:")), "12-hour task alert should be created");
const distinct12 = evaluateSmartAlerts(context(now12, { tasks: [task("task-24", due24)], dismissedEventKeys: new Set([deadline24.eventKey]) }));
check(distinct12.some((alert) => alert.eventKey.startsWith("task-12h:task-24:")), "dismissing one event key must not block a later alert window");
const completedAlerts = evaluateSmartAlerts(context(now12, { tasks: [task("task-done", due24, "2 ชั่วโมง", "completed")] }));
check(!types(completedAlerts).includes("task_deadline"), "completed task should not create deadline alerts");

const riskTask = task("task-risk", "2026-09-07T11:40", "3 ชั่วโมง");
const risk = calculateDeadlineRisk(riskTask, baseSchedule, now24);
check(risk?.level === "at_risk" && risk.availableFreeMinutes < risk.remainingEstimatedMinutes, "deadline risk should compare remaining work with real free time");
check(types(evaluateSmartAlerts(context(now24, { tasks: [riskTask] }))).includes("deadline_risk"), "at-risk task should create one risk alert");

const morning = evaluateSmartAlerts(context(dateTime("2026-09-07", "06:00")));
check(types(morning).includes("morning_summary"), "06:00 morning summary should be created");
const daily = evaluateSmartAlerts(context(dateTime("2026-09-07", "07:00")));
check(types(daily).includes("daily_brief"), "07:00 daily brief should be created");

const classUpcoming = evaluateSmartAlerts(context(dateTime("2026-09-07", "08:00")));
check(types(classUpcoming).includes("class_upcoming"), "30-minute class alert should be created");
const classEnding = evaluateSmartAlerts(context(dateTime("2026-09-07", "10:00")));
const endingAlert = classEnding.find((alert) => alert.type === "class_ending");
check(endingAlert?.message.includes("10:30") && endingAlert.message.includes("พัก 30 นาที"), "class-ending alert should include same-day next class and gap");

const backToBack = [{ ...baseSchedule[0] }, { ...baseSchedule[1], startTime: "10:00" }];
const backToBackAlert = evaluateSmartAlerts(context(dateTime("2026-09-07", "10:00"), { schedules: backToBack })).find((alert) => alert.type === "class_ending");
check(backToBackAlert?.title.includes("เปลี่ยนคาบ") && !backToBackAlert.message.includes("พัก"), "back-to-back classes should not invent a break");
const noNextAlert = evaluateSmartAlerts(context(dateTime("2026-09-07", "10:00"), { schedules: [baseSchedule[0]] })).find((alert) => alert.type === "class_ending");
check(noNextAlert?.message.includes("ไม่มีเรียนต่อแล้ว"), "last class should state that no later class exists today");
const weekendSchedules = [
  { ...baseSchedule[0], id: "saturday-late", day: 5, startTime: "23:00", endTime: "24:00" },
  { ...baseSchedule[1], id: "sunday-midnight", day: 6, startTime: "00:00", endTime: "01:00" },
];
check(types(evaluateSmartAlerts(context(dateTime("2026-09-13", "00:00"), { schedules: weekendSchedules }))).includes("class_ending"), "Saturday 23:00–24:00 must produce its end-of-class alert");
check(types(evaluateSmartAlerts(context(dateTime("2026-09-13", "00:30"), { schedules: weekendSchedules }))).includes("class_ending") === false, "Sunday midnight class must be active without an early end alert");

const classOnlyPreferences = {
  ...defaultPreferences,
  morning0600: false,
  daily0700: false,
  weeklyRadar: false,
};
const example = { ...baseSchedule[0], startTime: "13:00", endTime: "15:00" };
const exampleContext = (timestamp, overrides = {}) => context(new Date(timestamp), {
  schedules: [example],
  preferences: classOnlyPreferences,
  ...overrides,
});
const times = ["12:00", "12:30", "15:00"];
const keys = ["class-60m", "class-30m", "class-end"].map((kind) => `${kind}:class-a:2026-09-07`);
for (const [index, time] of times.entries()) {
  const at = `2026-09-07T${time}`;
  const alerts = evaluateClassAlerts(exampleContext(`${at}:00+07:00`));
  check(alerts.length === 1 && alerts[0].eventKey === keys[index], `One class alert is due at ${time}`);
  check(qualifiesForBrowserDelivery(alerts[0]), "All class rounds qualify for browser delivery");
  check(evaluateClassAlerts(exampleContext(`${at}:30+07:00`, {
    existingEventKeys: new Set([keys[index]]),
  })).length === 0, "The next tick must not duplicate a handled round");
  check(evaluateClassAlerts(exampleContext(`${at}:30+07:00`)).length === 1, "A tick within the due minute can deliver a new round");
}
check(evaluateClassAlerts(exampleContext("2026-09-07T14:50:00+07:00")).length === 0, "The old ten-minute reminder is gone");
const pushInput = exampleContext("2026-09-07T11:00:00+07:00", { language: "en", schedules: [example, example] });
const plan = buildPushSchedule(pushInput);
check(JSON.stringify(plan.map(({ eventKey, sendAt }) => [eventKey, sendAt])) === JSON.stringify(times.map((time, index) => [
  keys[index], new Date(`2026-09-07T${time}:00+07:00`).toISOString(),
])), "The seven-day plan must have exactly one row at each Bangkok reminder time");
check(plan.map(({ title }) => title).join("|") === "Class starts in 1 hour|Class starts in 30 minutes|Class has ended", "Web Push uses the English reminder titles");
const off = { ...classOnlyPreferences, class30m: false, classEnd10m: false };
check(buildPushSchedule({ ...pushInput, preferences: off }).length === 0, "The classes switch removes all class push rows");
check(evaluateClassAlerts(exampleContext("2026-09-07T15:00:00+07:00", { preferences: off })).length === 0, "The classes switch suppresses in-app and browser class alerts");
const horizonPlan = buildPushSchedule(exampleContext("2026-09-07T12:15:00+07:00"));
check(horizonPlan.some(({ sendAt }) => sendAt === "2026-09-14T05:00:00.000Z"), "Include reminders inside the horizon for classes starting just beyond it");
const competingCandidate = buildPushSchedule(exampleContext("2026-09-07T12:00:10+07:00", {
  tasks: [task("later-candidate", "2026-09-08T12:00:30+07:00")],
}));
check(!competingCandidate.some(({ eventKey }) => eventKey === keys[0]), "A future plan excludes class rounds whose exact time has passed");

const retiredFeatureAlerts = evaluateSmartAlerts(context(dateTime("2026-09-07", "06:00"), { exams: [{ id: "legacy-exam", courseId: "course-a", title: "Legacy", type: "midterm", startAt: "2026-09-07T09:00", room: "A1", topics: [], createdAt: "2026-09-01T00:00:00", updatedAt: "2026-09-01T00:00:00" }] }));
check(retiredFeatureAlerts.some((alert) => alert.type === "exam_today"), "active exam scheduling must retain its morning reminder");
check(!retiredFeatureAlerts.some((alert) => alert.type === "academic_weather"), "retired academic weather must not create notifications");

const weekly = evaluateSmartAlerts(context(dateTime("2026-09-07", "07:05")));
check(types(weekly).includes("weekly_radar"), "Monday 07:05 weekly radar should be created");

const readFixture = [
  { id: "a", type: "system", priority: "normal", title: "A", message: "A", createdAt: now24.toISOString(), eventKey: "a" },
  { id: "b", type: "system", priority: "normal", title: "B", message: "B", createdAt: now24.toISOString(), eventKey: "b", readAt: now24.toISOString() },
];
check(getUnreadNotificationCount(readFixture) === 1, "unread count should derive only from readAt");
check(groupNotifications(readFixture, now24).today.length === 2, "today notifications should group consistently");

console.log(`Smart Alerts QA passed: ${checks} checks`);
