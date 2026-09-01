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

const { formatExamDateTime } = require("../src/lib/academic-utils.ts");
let checks = 0;
const check = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const thaiFullRange = { startAt: "2026-09-05T09:00", endAt: "2026-09-05T12:00", room: "320" };
check(formatExamDateTime(thaiFullRange, "th"), "วันเสาร์ที่ 5 กันยายน 2569 · 09:00–12:00 น. · ห้อง 320", "Thai metadata must include local Buddhist date, time range, and room");
check(formatExamDateTime({ ...thaiFullRange, room: "ห้อง 320" }, "th"), "วันเสาร์ที่ 5 กันยายน 2569 · 09:00–12:00 น. · ห้อง 320", "an already-labelled Thai room must not be prefixed twice");
check(formatExamDateTime({ startAt: "2026-09-05T13:00", endAt: "2026-09-05T16:30" }, "th"), "วันเสาร์ที่ 5 กันยายน 2569 · 13:00–16:30 น.", "missing room must not leave a dangling separator");
check(formatExamDateTime({ startAt: "2026-09-05T09:00" }, "th"), "วันเสาร์ที่ 5 กันยายน 2569 · 09:00 น.", "missing end time must not invent a range");
check(formatExamDateTime({ startAt: "2026-09-05" }, "th"), "วันเสาร์ที่ 5 กันยายน 2569", "date-only legacy records must omit time cleanly");
check(formatExamDateTime(thaiFullRange, "en"), "Saturday, 5 September 2026 · 09:00–12:00 · Room 320", "English metadata must use Gregorian date and 24-hour time");
check(formatExamDateTime({ startAt: "2026-01-01T00:15" }, "th"), "วันพฤหัสบดีที่ 1 มกราคม 2569 · 00:15 น.", "local parsing must retain the stored calendar date around midnight");

const dateSensitiveSources = [
  "src/features/academic/academic-pages.tsx",
  "src/features/today/today-page.tsx",
  "src/lib/academic-planning.ts",
];
dateSensitiveSources.forEach((sourcePath) => {
  const source = fs.readFileSync(path.join(projectRoot, sourcePath), "utf8");
  check(!source.includes("new Date(exam.startAt)"), true, `${sourcePath} must use the shared local exam-date parser for legacy date-only records`);
});

console.log(`Exam date/time QA passed: ${checks} checks`);
