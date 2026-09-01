/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTalevoAlias(request, parent, isMain, options) {
  return originalResolveFilename.call(this, request.startsWith("@/") ? path.join(projectRoot, "src", request.slice(2)) : request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename });
  module._compile(output.outputText, filename);
};

const {
  getDailyStudyBreakdown,
  getNextScheduleOccurrence,
  getNextUpcomingExam,
  getPeriodDates,
  getPriorityTaskSummary,
  getPreviousPeriodDates,
  getStudyTrend,
  getSubjectDurationBreakdown,
  getTaskPeriodSummary,
  getUpcomingExams,
} = require("../src/lib/statistics-utils.ts");
const { translate } = require("../src/lib/i18n.ts");
const { getCurrentTermCourses } = require("../src/lib/course-utils.ts");
const { hexToRgba, normalizeTalevoColor } = require("../src/lib/talevo-color-utils.ts");
const monday = new Date(2026, 7, 31, 12);
const sunday = new Date(2026, 8, 6, 12);
const schedules = [
  { id: "math-mon", courseId: "math", name: "คณิตศาสตร์", color: "#7656F6", day: 0, startTime: "09:00", endTime: "10:30" },
  { id: "science-mon", courseId: "science", name: "วิทยาศาสตร์", color: "#159BA5", day: 0, startTime: "13:00", endTime: "14:00" },
  { id: "math-fri", courseId: "math", name: "คณิตศาสตร์", color: "#7656F6", day: 4, startTime: "08:00", endTime: "09:00" },
];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

const daily = getDailyStudyBreakdown(schedules, monday, sunday);
check(daily.length === 7, "weekly breakdown must always include Monday through Sunday");
check(daily[0].minutes === 150 && daily[0].courses.length === 2, "same-day classes must be stacked with their real durations");
check(daily[0].courses.find((course) => course.courseId === "science").color === "#159BA5", "daily stack must retain the schedule course color");
check(daily[4].minutes === 60 && daily[6].minutes === 0, "days without classes must remain visible as zero-value days");

const emptyDaily = getDailyStudyBreakdown([], monday, sunday);
check(emptyDaily.length === 7 && emptyDaily.every((day) => day.minutes === 0 && day.courses.length === 0), "empty schedules must produce a safe seven-day empty chart state");

const subjects = getSubjectDurationBreakdown(schedules, monday, sunday);
check(subjects[0].courseId === "math" && subjects[0].minutes === 150 && subjects[0].color === "#7656F6", "subject summary must total recurring classes and retain its canonical color");
check(getSubjectDurationBreakdown([], monday, sunday).length === 0, "empty schedules must produce an empty subject list");
const customSchedules = [{ id: "custom", courseId: "custom", name: "Custom", color: "#18a36f", day: 0, startTime: "09:00", endTime: "10:00" }];
const customCourse = getCurrentTermCourses(customSchedules)[0];
check(normalizeTalevoColor(customCourse.color) === "#18A36F" && getSubjectDurationBreakdown(customSchedules, monday, sunday)[0].color === "#18a36f", "Statistics can retain a valid custom course color without mapping it to a preset");
check(hexToRgba("#18A36F", 0.07) === "rgba(24, 163, 111, 0.07)", "course overview tint is derived from the exact course color");

const next = getNextScheduleOccurrence(schedules, new Date(2026, 7, 31, 8, 15));
check(next && next.schedule.id === "math-mon" && next.startAt.getHours() === 9, "next class must be selected using local schedule time");

const now = new Date(2026, 8, 2, 12);
const week = getPeriodDates("week", now);
const previousWeek = getPreviousPeriodDates("week", now);
check(week.start.getDate() === 31 && week.end.getDate() === 6, "week range must start on Monday and end on Sunday");
check(previousWeek.start.getDate() === 24 && previousWeek.end.getDate() === 30, "previous week must be an adjacent non-overlapping range");
check(getPeriodDates("month", now).start.getDate() === 1 && getPeriodDates("month", now).end.getDate() === 30, "month range must cover the local calendar month");

const tasks = [
  { id: "overdue", title: "Overdue", courseId: "math", description: "", dueLabel: "", dueDate: "2026-09-01T10:00", estimate: "1 ชั่วโมง", status: "todo", color: "#7656F6" },
  { id: "done", title: "Done", courseId: "math", description: "", dueLabel: "", dueDate: "2026-09-03T10:00", estimate: "1 ชั่วโมง", status: "todo", color: "#7656F6", completedAt: "2026-09-02T08:00:00" },
  { id: "later", title: "Later", courseId: "science", description: "", dueLabel: "", dueDate: "2026-09-05T10:00", estimate: "2 ชั่วโมง", status: "todo", color: "#159BA5" },
];
const taskSummary = getTaskPeriodSummary(tasks, schedules, week.start, week.end, now);
check(taskSummary.total === 3 && taskSummary.completed === 1 && taskSummary.pending === 2, "task summaries must use completedAt as the single completion source");
check(taskSummary.overdueTask && taskSummary.overdueTask.id === "overdue", "overdue pending tasks must be prioritized for the insight");
check(getPriorityTaskSummary(tasks, schedules, now).overdueTask.id === "overdue", "primary insight must keep an overdue task visible outside a selected chart range");

const exams = [
  { id: "later-exam", courseId: "science", title: "Science", type: "quiz", startAt: "2026-09-05T09:00", topics: [], createdAt: "", updatedAt: "" },
  { id: "next-exam", courseId: "math", title: "Math", type: "midterm", startAt: "2026-09-03T09:00", topics: [], createdAt: "", updatedAt: "" },
  { id: "completed-exam", courseId: "math", title: "Completed", type: "quiz", startAt: "2026-09-04T09:00", topics: [], completedAt: "2026-09-04T10:00:00", createdAt: "", updatedAt: "" },
  { id: "past-exam", courseId: "math", title: "Past", type: "quiz", startAt: "2026-09-01T09:00", topics: [], createdAt: "", updatedAt: "" },
];
const upcoming = getUpcomingExams(exams, week.start, week.end, now);
check(upcoming.length === 2 && upcoming[0].id === "next-exam", "upcoming exams must exclude completed and past records and sort by real date");
check(getNextUpcomingExam(exams, now).id === "next-exam", "next exam must choose the earliest unfinished future exam");

const weeklyTrend = getStudyTrend(schedules, "week", new Date(2026, 8, 2, 12));
const monthlyTrend = getStudyTrend(schedules, "month", new Date(2026, 8, 2, 12));
check(weeklyTrend.length === 7 && weeklyTrend.reduce((sum, point) => sum + point.minutes, 0) === 210, "weekly trend must retain seven real daily totals");
check(monthlyTrend.length >= 4 && monthlyTrend.reduce((sum, point) => sum + point.minutes, 0) > 0, "monthly trend must aggregate real schedules into weekly buckets");
check(translate("th", "statistics.title") === "สรุปการเรียน" && translate("en", "statistics.title") === "Learning Summary", "statistics dashboard must provide Thai and English labels");

console.log(`Statistics QA passed: ${checks} checks`);
