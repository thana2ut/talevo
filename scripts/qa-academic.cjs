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
const { getWeekEventPosition, getWeekTimeRange } = require("../src/lib/schedule-utils.ts");
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
console.log(`Academic QA passed: ${checks} checks`);
