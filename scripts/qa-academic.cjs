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
const {
  getAcademicWeather,
  calculateScheduledClassMinutes,
  classifyStudyLoad,
  formatStudyDuration,
  getMostDemandingDay,
  STUDY_LOAD_SUPPORTIVE_COPY,
  EMPTY_STUDY_LOAD_COPY,
} = require("../src/lib/academic-planning.ts");
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
const schedules = [{ id: "class", courseId: "course", name: "Design", teacher: "T", room: "1", color: "purple", day: 0, startTime: "08:00", endTime: "15:00" }];
const task = { id: "task", title: "Project", courseId: "course", description: "", dueLabel: "", dueDate: "2026-09-07T23:59", estimate: "90 นาที", status: "todo", color: "#6633ff", subtasks: [] };
const weather = getAcademicWeather(schedules, [task], [], now);
check(weather.state === "heavy" || weather.state === "storm", "real class duration (7h) must drive heavy study load");
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

const tasksSource = fs.readFileSync(path.join(projectRoot, "src/features/tasks/task-pages.tsx"), "utf8");
check(!tasksSource.includes("GradesOverviewView") && !tasksSource.includes("view=grades"), "TasksPage must not expose retired Grade Planning");

const gradesRouteSource = fs.readFileSync(path.join(projectRoot, "src/app/grades/page.tsx"), "utf8");
const gradesDetailRouteSource = fs.readFileSync(path.join(projectRoot, "src/app/grades/[courseId]/page.tsx"), "utf8");
check(gradesRouteSource.includes('redirect("/tasks")') && gradesDetailRouteSource.includes('redirect("/tasks")'), "Retired Grade Planning routes must redirect to /tasks");

// 7-Day Study Encouragement QA Coverage
// 1. 0 hours -> เบา
check(classifyStudyLoad(0) === "light", "0 hours must classify as เบา (light)");
// 2. 3 hours -> เบา
check(classifyStudyLoad(180) === "light", "3 hours must classify as เบา (light)");
// 3. >3 to 6 hours -> ปานกลาง
check(classifyStudyLoad(181) === "moderate" && classifyStudyLoad(360) === "moderate" && classifyStudyLoad(300) === "moderate", ">3 to 6 hours must classify as ปานกลาง (moderate)");
// 4. >6 to 8 hours -> หนัก
check(classifyStudyLoad(361) === "heavy" && classifyStudyLoad(420) === "heavy", ">6 to 8 hours must classify as หนัก (heavy)");
// 5. exactly 8 hours -> หนัก
check(classifyStudyLoad(480) === "heavy", "exactly 8 hours must classify as หนัก (heavy)");
// 6. >8 hours -> หนักมาก
check(classifyStudyLoad(481) === "storm" && classifyStudyLoad(570) === "storm", ">8 hours must classify as หนักมาก (storm)");
// 7. overlapping classes are not double-counted
const overlapSchedules = [
  { id: "c1", startTime: "08:00", endTime: "12:00", day: 0 }, // 4h
  { id: "c2", startTime: "10:00", endTime: "14:00", day: 0 }, // 4h, overlaps 10-12
];
check(calculateScheduledClassMinutes(overlapSchedules, now) === 360, "overlapping classes must not double-count (08:00–14:00 is 6h = 360m)");
// 8. supportive message matches severity
check(STUDY_LOAD_SUPPORTIVE_COPY.light === "วันนี้สบาย ๆ ใช้เวลาว่างให้เต็มที่นะ", "light message must match exact supportive copy");
check(STUDY_LOAD_SUPPORTIVE_COPY.moderate === "วันนี้กำลังพอดี ค่อย ๆ ทำไปทีละอย่างนะ", "moderate message must match exact supportive copy");
check(STUDY_LOAD_SUPPORTIVE_COPY.heavy === "วันนี้ค่อนข้างแน่น อย่าลืมหาเวลาพักด้วยนะ", "heavy message must match exact supportive copy");
check(STUDY_LOAD_SUPPORTIVE_COPY.storm === "วันนี้หนักเป็นพิเศษ ดูแลตัวเองและพักเป็นช่วง ๆ นะ", "storm message must match exact supportive copy");
// 9. 8 hours uses "วันนี้ค่อนข้างแน่น อย่าลืมหาเวลาพักด้วยนะ"
check(STUDY_LOAD_SUPPORTIVE_COPY[classifyStudyLoad(480)] === "วันนี้ค่อนข้างแน่น อย่าลืมหาเวลาพักด้วยนะ", "8 hours must use exact heavy supportive copy");
// 10. duration displayed separately
check(formatStudyDuration(480) === "เรียน 8 ชั่วโมง", "480 minutes must format as 'เรียน 8 ชั่วโมง'");
check(formatStudyDuration(300) === "เรียน 5 ชั่วโมง", "300 minutes must format as 'เรียน 5 ชั่วโมง'");
check(formatStudyDuration(120) === "เรียน 2 ชั่วโมง", "120 minutes must format as 'เรียน 2 ชั่วโมง'");
check(formatStudyDuration(570) === "เรียน 9 ชม. 30 นาที", "570 minutes must format as 'เรียน 9 ชม. 30 นาที'");
// 11. highest upcoming severity selected
const mockForecast = [
  { date: new Date(2026, 8, 7), classMinutes: 120, state: "light", reasons: [], score: 2, dueTasks: [] },
  { date: new Date(2026, 8, 8), classMinutes: 300, state: "moderate", reasons: [], score: 5, dueTasks: [] },
  { date: new Date(2026, 8, 9), classMinutes: 480, state: "heavy", reasons: [], score: 8, dueTasks: [] },
  { date: new Date(2026, 8, 10), classMinutes: 570, state: "storm", reasons: [], score: 9.5, dueTasks: [] },
];
check(getMostDemandingDay(mockForecast)?.state === "storm", "highest upcoming severity must be selected");
// 12. nearest day selected on severity tie
const tieForecast = [
  { date: new Date(2026, 8, 7), classMinutes: 120, state: "light", reasons: [], score: 2, dueTasks: [] },
  { date: new Date(2026, 8, 8), classMinutes: 480, state: "heavy", reasons: [], score: 8, dueTasks: [] }, // Day 1
  { date: new Date(2026, 8, 9), classMinutes: 300, state: "moderate", reasons: [], score: 5, dueTasks: [] },
  { date: new Date(2026, 8, 10), classMinutes: 480, state: "heavy", reasons: [], score: 8, dueTasks: [] }, // Day 3
];
check(getMostDemandingDay(tieForecast)?.date.getDate() === 8, "nearest day must be selected on severity tie");
// 13. empty schedule uses positive empty message
const emptyForecast = [
  { date: new Date(2026, 8, 7), classMinutes: 0, state: "light", reasons: [], score: 0, dueTasks: [] },
  { date: new Date(2026, 8, 8), classMinutes: 0, state: "light", reasons: [], score: 0, dueTasks: [] },
];
check(getMostDemandingDay(emptyForecast) === null, "empty forecast returns null for positive empty message");
check(EMPTY_STUDY_LOAD_COPY === "ช่วงนี้ตารางค่อนข้างสบาย ใช้เวลาพักหรือเตรียมตัวล่วงหน้าได้นะ", "empty schedule must use exact positive message");
// 14. no warning-style 'วันที่ควรวางแผนล่วงหน้า' remains
const semesterWeatherSrc = fs.readFileSync(path.join(projectRoot, "src/features/academic/semester-weather.tsx"), "utf8");
check(!semesterWeatherSrc.includes("วันที่ควรวางแผนล่วงหน้า"), "warning-style 'วันที่ควรวางแผนล่วงหน้า' must be removed");
check(!semesterWeatherSrc.includes("TriangleAlert"), "TriangleAlert warning icon must be removed");
// 15. mobile no overflow
const todayCss = fs.readFileSync(path.join(projectRoot, "src/styles/today-composition.css"), "utf8");
check(todayCss.includes("overflow-wrap: break-word"), "supportive text must specify overflow-wrap: break-word for mobile wrapping");
// 16. existing schedule behavior unchanged
check(range.startMinutes === 480 && range.endMinutes === 1020, "existing timetable range grid remains unchanged");

// 17. getDailyStudyLoad canonical calculator
const { getDailyStudyLoad, getStudyLoadSupportiveCopy } = require(path.join(projectRoot, "src/lib/academic-planning.ts"));
const daily4h = getDailyStudyLoad(now, [
  { id: "s1", startTime: "08:00", endTime: "12:00", day: now.getDay() === 0 ? 6 : now.getDay() - 1 },
]);
check(daily4h.totalMinutes === 240, "daily load 08:00-12:00 must equal 240 minutes");
check(daily4h.classCount === 1, "daily load must count 1 class");
check(daily4h.severity === "moderate", "4 hours must classify as moderate");

const daily8h = getDailyStudyLoad(now, [
  { id: "s1", startTime: "08:00", endTime: "16:00", day: now.getDay() === 0 ? 6 : now.getDay() - 1 },
]);
check(daily8h.totalMinutes === 480, "daily load 08:00-16:00 must equal 480 minutes");
check(daily8h.severity === "heavy", "8 hours must classify as heavy");

// 18. date-aware supportive copy
check(getStudyLoadSupportiveCopy("moderate", true) === "วันนี้กำลังพอดี ค่อย ๆ ทำไปทีละอย่างนะ", "today copy must use วันนี้");
check(getStudyLoadSupportiveCopy("moderate", false) === "วันนั้นตารางกำลังพอดี ค่อย ๆ จัดการไปทีละอย่างนะ", "non-today copy must use วันนั้น");
check(getStudyLoadSupportiveCopy("heavy", false) === "วันนั้นตารางค่อนข้างแน่น อย่าลืมเผื่อเวลาพักด้วยนะ", "non-today heavy copy must use วันนั้น");

// 19. Preserved Grade Calculation data-compatibility regression checks
const { calculateGradePlan: calcGrade, hasEarnedScore: hasEarned } = require(path.join(projectRoot, "src/lib/academic-utils.ts"));
const sampleThresholds = [
  { label: "A", minimumPercent: 80 },
  { label: "B+", minimumPercent: 75 },
  { label: "B", minimumPercent: 70 },
  { label: "C+", minimumPercent: 65 },
  { label: "C", minimumPercent: 60 },
  { label: "D+", minimumPercent: 55 },
  { label: "D", minimumPercent: 50 },
  { label: "F", minimumPercent: 0 },
];

// Empty plan
const emptyCalc = calcGrade({ targetGrade: "A", thresholds: sampleThresholds, components: [] });
check(emptyCalc.totalMax === 0 && emptyCalc.earnedPoints === 0 && emptyCalc.targetPoints === null, "Empty plan must calculate 0 total points and null targetPoints");

// Scored + Pending
const activeCalc = calcGrade({
  targetGrade: "A",
  thresholds: sampleThresholds,
  components: [
    { id: "1", name: "งาน 1", maxScore: 20, earnedScore: 16, weight: 20 },
    { id: "2", name: "กลางภาค", maxScore: 30, earnedScore: 25, weight: 30 },
    { id: "3", name: "ปลายภาค", maxScore: 50, earnedScore: undefined, weight: 50 },
  ],
});
check(activeCalc.totalMax === 100, "Total max must equal 100");
check(activeCalc.earnedPoints === 41, "Earned points must equal 41 (16 + 25)");
check(activeCalc.gradedMax === 50, "Graded max must equal 50 (20 + 30)");
check(activeCalc.remainingPossible === 50, "Remaining possible must equal 50");
check(activeCalc.targetPoints === 80, "Target points for grade A (80%) must equal 80");
check(activeCalc.pointsNeeded === 39, "Points needed must equal 39 (80 - 41)");
check(activeCalc.canReachTarget === true, "Student can reach target (41 + 50 >= 80)");
check(activeCalc.targetReached === false, "Target is not reached yet (41 < 80)");

// Target Reached
const reachedCalc = calcGrade({
  targetGrade: "A",
  thresholds: sampleThresholds,
  components: [
    { id: "1", name: "งาน", maxScore: 50, earnedScore: 45, weight: 50 },
    { id: "2", name: "กลางภาค", maxScore: 50, earnedScore: 40, weight: 50 },
  ],
});
check(reachedCalc.targetReached === true && reachedCalc.pointsNeeded === 0, "85/100 must reach grade A target with 0 points needed");

// Impossible target
const impossibleCalc = calcGrade({
  targetGrade: "A",
  thresholds: sampleThresholds,
  components: [
    { id: "1", name: "งาน", maxScore: 50, earnedScore: 20, weight: 50 },
    { id: "2", name: "กลางภาค", maxScore: 20, earnedScore: undefined, weight: 20 },
  ],
});
check(impossibleCalc.canReachTarget === false, "20 earned + 20 remaining cannot reach 80% of 70 (56 points)");

// Unknown score predicate
check(!hasEarned({ id: "u1", name: "ปลายภาค", maxScore: 30 }), "Missing earnedScore must evaluate as not earned");
check(!hasEarned({ id: "u2", name: "ปลายภาค", maxScore: 30, earnedScore: undefined }), "Undefined earnedScore must evaluate as not earned");
check(hasEarned({ id: "u3", name: "กลางภาค", maxScore: 30, earnedScore: 0 }), "0 earned score must evaluate as earned");
check(hasEarned({ id: "u4", name: "งาน 1", maxScore: 20, earnedScore: 16 }), "16 earned score must evaluate as earned");

console.log(`Academic QA passed: ${checks} checks`);
