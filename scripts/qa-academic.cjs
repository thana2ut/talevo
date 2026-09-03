/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const projectRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTalevoAlias(request, parent, isMain, options) { return originalResolveFilename.call(this, request.startsWith("@/") ? path.join(projectRoot, "src", request.slice(2)) : request, parent, isMain, options); };
require.extensions[".ts"] = function compileTypeScript(module, filename) { const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }); module._compile(output.outputText, filename); };
const { needsOcrForPdfPage, extractSyllabusDraft } = require("../src/lib/syllabus-scanner.ts");
const { getAcademicWeather } = require("../src/lib/academic-planning.ts");
const { findScheduleConflict, getClassDurationMinutes, getHorizontalEventPosition, getHorizontalTimelinePercent, getHorizontalTimetableRange, getScheduleDisplayName, getWeekEventPosition, getWeekTimeRange, layoutHorizontalDay } = require("../src/lib/schedule-utils.ts");
const { createScheduleDate, getScheduleWeekDates, mondayIndex } = require("../src/lib/schedule-date.ts");
let checks = 0; const check = (value, message) => { assert.ok(value, message); checks += 1; };
check(!needsOcrForPdfPage("Course code: ED123\nCourse name: Learning Design\nAssignment due 12 September 2026"), "usable text PDF page must skip OCR");
check(needsOcrForPdfPage(""), "empty PDF page must request OCR");
const draft = extractSyllabusDraft(["รหัสวิชา: ED123\nชื่อวิชา: การออกแบบการเรียนรู้\nงาน Project ส่ง: 12 Sep"]);
check(draft.courseCode.value === "ED123" && draft.courseName.value === "การออกแบบการเรียนรู้", "Thai course data must retain traceable extraction");
check(draft.assignments[0]?.issue === undefined, "explicit assignment deadline candidate must not be marked missing");
const unreadableDraft = extractSyllabusDraft([""]);
check(unreadableDraft.issues.some((issue) => issue.includes("แม้ลองอ่านข้อความและ OCR แล้ว")), "unreadable documents must truthfully describe the OCR attempt");
const now = new Date(2026, 8, 7, 8, 0);
const schedules = [{ id: "class", courseId: "course", name: "Design", teacher: "T", room: "1", color: "purple", day: 0, startTime: "08:00", endTime: "13:00" }];
const task = { id: "task", title: "Project", courseId: "course", description: "", dueLabel: "", dueDate: "2026-09-07T23:59", estimate: "90 นาที", status: "todo", color: "#6633ff", subtasks: [] };
const weather = getAcademicWeather(schedules, [task], [], now);
check(weather.state === "heavy" || weather.state === "storm", "real class duration and deadline must drive heavy weather");
check(weather.reasons.length >= 2, "weather must expose inspectable reasons");
const timetable = [
  { startTime: "08:30", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:30" },
  { startTime: "13:00", endTime: "14:30" },
  { startTime: "14:30", endTime: "16:30" },
];
const range = getWeekTimeRange(timetable);
check(range.startMinutes === 480 && range.endMinutes === 1020, "week range must round 08:30–16:30 to a compact 08:00–17:00 grid");
const halfHourPosition = getWeekEventPosition(timetable[0], range, 1);
check(halfHourPosition.top === 30 && halfHourPosition.height === 90, "08:30–10:00 must retain a minute-accurate half-hour offset and 90-minute height");
const oddMinutePosition = getWeekEventPosition({ startTime: "09:10", endTime: "09:55" }, range, 1);
check(oddMinutePosition.top === 70 && oddMinutePosition.height === 45, "odd-minute class times must not snap to an hour");
const emptyRange = getWeekTimeRange([]);
check(emptyRange.startMinutes === 480 && emptyRange.endMinutes === 600, "an empty week must use only a compact fallback grid");
const endOfDay = { id: "late", courseId: "late", name: "Late class", teacher: "T", room: "1", color: "purple", day: 5, startTime: "23:00", endTime: "24:00" };
check(getClassDurationMinutes(endOfDay) === 60 && getWeekTimeRange([endOfDay]).endMinutes === 1440, "23:00–24:00 must retain a 60-minute duration and render through the end of day");
check(!findScheduleConflict([endOfDay], { day: 5, startTime: "22:00", endTime: "23:00" }) && findScheduleConflict([endOfDay], { day: 5, startTime: "23:30", endTime: "24:00" })?.id === "late", "touching boundaries must not overlap while true end-of-day intersections must conflict");

const universityFixture = [
  ["0560201", 0, "09:00", "12:00", "EDU-3402", "15", 2], ["1204441", 0, "13:00", "17:00", "IT-405", "2", 3],
  ["0560202", 1, "13:00", "17:00", "EDU-3404", "10", 3],
  ["0537212", 2, "08:00", "12:00", "ไม่ระบุ1", "2", 3], ["0042008", 2, "13:00", "15:00", "SCI-300", "6", 2], ["0045003", 2, "17:00", "19:00", "RN1-805", "2", 2],
  ["1204442", 3, "08:00", "12:00", "IT-508", "1", 3], ["0537338", 3, "13:00", "17:00", "B-409", "1", 3],
  ["0537211", 4, "08:00", "12:00", "5701", "1", 3],
].map(([courseCode, day, startTime, endTime, room, section, credits], index) => ({ id: `fixture-${index}`, courseId: `syllabus-${courseCode}`, name: "", courseCode, day, startTime, endTime, room, section, credits, teacher: "QA", color: "#6d28d9", note: "" }));
const fixtureWeek = getScheduleWeekDates(createScheduleDate(2026, 8, 9));
check(JSON.stringify(fixtureWeek.map(mondayIndex)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]), "Week rows must use canonical Monday-through-Sunday order, independent of Date.getDay");
check(fixtureWeek[0].getDate() === 7 && fixtureWeek[6].getDate() === 13, "Week navigation dates must resolve Monday 7 through Sunday 13 for the selected week");
check(JSON.stringify(universityFixture.map((item) => item.day)) === JSON.stringify([0, 0, 1, 2, 2, 2, 3, 3, 4]), "The nine-record imported fixture must keep its canonical weekday values");
check(universityFixture.filter((item) => item.day === 0).map((item) => item.courseCode).join(",") === "0560201,1204441" && universityFixture.filter((item) => item.day === 0).every((item) => getScheduleDisplayName(item) === item.courseCode), "Monday must visibly retain both source course codes when course names are unavailable");
check(universityFixture.filter((item) => item.day === 1)[0]?.courseCode === "0560202" && universityFixture.filter((item) => item.day === 2).length === 3, "Tuesday and Wednesday fixture rows must remain distinct");
const horizontalRange = getHorizontalTimetableRange(universityFixture);
const mondayMorningPosition = getHorizontalEventPosition(universityFixture[0], horizontalRange);
const mondayAfternoonPosition = getHorizontalEventPosition(universityFixture[1], horizontalRange);
check(horizontalRange.startMinutes === 480 && horizontalRange.endMinutes === 1440 && getHorizontalTimelinePercent(480, horizontalRange) === 0 && getHorizontalTimelinePercent(1440, horizontalRange) === 100, "Horizontal timetable must retain the 08:00–24:00 time boundaries");
check(mondayMorningPosition.leftPercent === 6.25 && mondayMorningPosition.widthPercent === 18.75 && mondayAfternoonPosition.leftPercent === 31.25 && mondayAfternoonPosition.widthPercent === 25, "Course block positions and widths must be proportional to real 09:00–12:00 and 13:00–17:00 durations");
const latePosition = getHorizontalEventPosition(endOfDay, horizontalRange);
check(latePosition.leftPercent === 93.75 && latePosition.widthPercent === 6.25, "23:00–24:00 must render through the right end boundary");
const adjacent = [
  { ...universityFixture[0], id: "adjacent-a", startTime: "09:00", endTime: "12:00" },
  { ...universityFixture[0], id: "adjacent-b", startTime: "12:00", endTime: "13:00" },
];
check(layoutHorizontalDay(adjacent).every((item) => item.lanes === 1), "Adjacent half-open [start,end) classes must share one lane");
const overlaps = [
  { ...universityFixture[0], id: "overlap-a", startTime: "09:00", endTime: "12:00" },
  { ...universityFixture[0], id: "overlap-b", startTime: "10:00", endTime: "13:00" },
];
check(layoutHorizontalDay(overlaps).every((item) => item.lanes === 2) && new Set(layoutHorizontalDay(overlaps).map((item) => item.lane)).size === 2, "Actual overlapping classes must remain visible in separate lanes");
check(universityFixture.every((item) => item.day >= 0 && item.day <= 6) && [5, 6].every((day) => universityFixture.filter((item) => item.day === day).length === 0), "Saturday and Sunday remain valid canonical rows when the source fixture has no weekend courses");
const manualWeekendSchedules = [
  { ...universityFixture[0], id: "manual-saturday", name: "Manual Saturday", courseCode: "", day: 5, startTime: "23:00", endTime: "24:00" },
  { ...universityFixture[0], id: "manual-sunday", name: "Manual Sunday", courseCode: "", day: 6, startTime: "08:30", endTime: "10:00" },
];
check(manualWeekendSchedules.map((item) => item.day).join(",") === "5,6" && manualWeekendSchedules.every((item) => getScheduleDisplayName(item) === item.name), "Manual Saturday and Sunday schedules must retain their canonical rows and valid course names");
check(getHorizontalEventPosition(manualWeekendSchedules[0], horizontalRange).widthPercent === 6.25 && getHorizontalEventPosition(manualWeekendSchedules[1], horizontalRange).leftPercent === 3.125, "Manual schedule times must use the same horizontal time geometry as imported schedules");
console.log(`Academic QA passed: ${checks} checks`);
