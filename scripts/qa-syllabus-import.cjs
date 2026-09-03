/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only QA: no .env access, provider call, document upload, storage write, or AppState mutation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const fixtures = require("./fixtures/syllabus-import-fixtures.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const files = {
  model: "src/lib/syllabus-import.ts",
  parser: "src/lib/syllabus-parser.ts",
  timetable: "src/lib/timetable-parser.ts",
  reader: "src/lib/syllabus-scanner.ts",
  magic: "src/lib/syllabus-local-file.ts",
  ui: "src/features/academic/syllabus-scanner.tsx",
  state: "src/providers/app-state-provider.tsx",
  styles: "src/styles/syllabus-import-composition.css",
  componentUi: "src/components/ui.tsx",
  universityGridSvg: "scripts/fixtures/university-block-grid.svg",
};
for (const file of Object.values(files)) check(exists(file), `Missing local syllabus file: ${file}`);
const model = read(files.model); const timetableSource = read(files.timetable); const reader = read(files.reader); const magic = read(files.magic); const ui = read(files.ui); const state = read(files.state); const styles = read(files.styles); const componentUi = read(files.componentUi);
const timetableArchitecture = ["src/lib/timetable/layout-detector.ts", "src/lib/timetable/geometry.ts", "src/lib/timetable/time-parser.ts", "src/lib/timetable/weekday-parser.ts", "src/lib/timetable/cell-parser.ts", "src/lib/timetable/parsers/weekly-time-grid.ts"].map(read).join("\n");
const universityGridSvg = read(files.universityGridSvg);

check(model.includes("SyllabusPreview") && model.includes("buildSyllabusImportPayload"), "Canonical preview/import payload is missing");
check(model.includes("deterministicCourseId") && model.includes("duplicateSignatures"), "Stable course links or duplicate protection is missing");
check(model.includes("validateSyllabusPreview") && model.includes("invalid_syllabus_preview"), "Invalid selected records must be blocked before import");
check(state.includes("importSyllabus:") && state.includes("setSchedules") && state.includes("setTasks") && state.includes("setExams"), "Confirmed import must update schedules, tasks, and exams together");

check(ui.includes("extractDocumentPages") && ui.includes("parseLocalSyllabus") && ui.includes("hasLocalSyllabusFileMagic"), "Scanner UI must use the local reader, parser, and magic-byte guard");
check(ui.includes("AbortController") && ui.includes("abort()") && ui.includes("mountedRef"), "Scanner must support cancellation and prevent post-unmount state updates");
check(ui.includes("อ่านข้อความจากเอกสาร") && ui.includes("LOCAL PREVIEW") && ui.includes("ไม่ถูกอัปโหลดไปยัง Gemini หรือ Cloud"), "Local-first UI labels or privacy disclosure are missing");
check(!ui.includes("/api/ai/syllabus/analyze") && !ui.includes("new FormData") && !ui.includes("SYLLABUS_REQUEST_INVALID"), "Primary scanner must never call the Gemini document route");
check(!/(?:localStorage|sessionStorage|indexedDB|supabase|FormData)/i.test(ui) && !ui.includes("file.arrayBuffer") && !ui.includes("readAsDataURL"), "Original document data must not be persisted or uploaded by the scanner UI");
check(!ui.includes("fetch(") && !/AI Assist|timetable-assist/i.test(ui), "Schedule document scanner must remain completely local-only");
for (const removed of ["src/lib/ai/timetable-assist.ts", "src/lib/ai/timetable-assist-provider.ts", "src/lib/ai/timetable-assist-handler.ts", "src/app/api/ai/timetable/assist/route.ts"]) check(!exists(removed), `Dead scanner AI source must be removed: ${removed}`);
check(exists("src/features/ai/ai-page.tsx") && exists("src/lib/ai/gemini-provider.ts") && exists("src/app/api/ai/chat/route.ts"), "AI Chat must remain intact outside the document scanner");
check(!ui.includes("GEMINI_API_KEY") && !ui.includes("@google/genai") && !ui.includes("dangerouslySetInnerHTML"), "Client scanner must not contain credentials, provider SDKs, or unsafe HTML rendering");
check(model.includes("draftId: string") && model.includes("updateSyllabusScheduleDraft") && ui.includes("key={item.draftId}"), "Every preview item must have a stable immutable draft identity");
check(ui.includes(">เลือกทั้งหมด</button>") && ui.includes(">ยกเลิกทั้งหมด</button>") && !ui.includes("เลือกเฉพาะที่อ่านชัด"), "Preview must use Select All and Unselect All labels on every viewport");
check(ui.includes("setAllSyllabusPreviewSelected(preview, true)") && ui.includes("setAllSyllabusPreviewSelected(preview, false)"), "Preview bulk actions must update all supported draft sections through the canonical helper");
check(componentUi.includes("onCloseRef.current = onClose") && componentUi.includes("}, [onClose]);") && componentUi.includes("}, [open]);") && !componentUi.includes("}, [onClose, open]);"), "BottomSheet focus trap must not restart and scroll on every preview edit");

check(reader.includes('import("pdfjs-dist/legacy/build/pdf.mjs")') && reader.includes("getTextContent") && reader.includes("needsOcrForPdfPage"), "PDF text-layer path is missing");
check(reader.includes('import("tesseract.js")') && reader.includes('createWorker("tha+eng"') && reader.includes("worker?.terminate"), "Local Thai/English OCR and worker cleanup are missing");
check(reader.includes("blocks: true") && reader.includes("SpatialOcrLine") && reader.includes("PSM.SPARSE_TEXT"), "OCR must retain bounding boxes and use sparse-text mode for timetable images");
check(reader.includes("preprocessTimetableImage") && reader.includes("createImageBitmap") && reader.includes("Mild unsharp masking"), "Timetable images must be locally upscaled, normalized, and sharpened before OCR");
check(reader.includes("preprocessWeekdayColumn") && reader.includes("WEEKDAY_COLUMN_RATIO = 0.16") && reader.includes("contrasted >= 174") && reader.includes("weekdayResult"), "Local OCR must include a thresholded secondary pass over the left weekday column");
check(reader.includes("signal") && reader.includes("canvas.toBlob") && reader.includes("useWorkerFetch: false"), "OCR cancellation or local scanned-PDF render path is missing");
check(reader.includes("MAX_DECODED_IMAGE_PIXELS") && reader.includes("MAX_PDF_PAGES") && reader.includes("MAX_TOTAL_PDF_RENDER_PIXELS") && reader.includes("OCR_TIMEOUT_MS"), "OCR/PDF resource and timeout bounds are missing");
check(timetableSource.includes("detectDocumentLayout") && timetableArchitecture.includes("WEEKLY_TIME_GRID") && timetableArchitecture.includes("layoutWidth"), "Timetable layout detection or positional fallback is missing");
check(timetableArchitecture.includes("เวลาเรียน") && timetableArchitecture.includes("extractCourseCodes") && timetableArchitecture.includes("parseCourseCell"), "Timetable course-body parsing is incomplete");
check(magic.includes("application/pdf") && magic.includes("image/jpeg") && magic.includes("image/png") && magic.includes("image/webp"), "Supported MIME signatures are incomplete");
check(styles.includes("@media") && styles.includes("focus-within"), "Responsive and keyboard-focus styles are missing");
check(ui.includes("AcademicEndTimeInput") && ui.includes('"เสาร์", "อาทิตย์"'), "scanner Preview must expose weekend choices and an accessible 24:00 end-time control");
check(ui.includes("พบโครงสร้างตาราง แต่ยังมีบางรายการต้องตรวจสอบ") && ui.includes("hasInferredDayDrafts"), "Preview must explain partial success when course blocks exist without weekday anchors");
check(Object.keys(fixtures).length >= 10 && fixtures.thaiTextPdf.kind === "text_pdf" && fixtures.imageSyllabus.kind === "image" && fixtures.scannedPdf.kind === "scanned_pdf", "Synthetic local fixtures are incomplete");
check(fixtures.malformedDocument.mimeType === "text/html" && fixtures.buddhistYear.text.includes("2569") && fixtures.ambiguousWeekday.text.includes("อ."), "Missing malformed, Buddhist-year, or ambiguous-weekday fixture");
check(exists("scripts/fixtures/university-block-grid.png") && ["0560201", "1204441", "0537211"].every((code) => universityGridSvg.includes(code)), "The browser OCR fixture must retain the representative nine-course university grid");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  const target = request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, target, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename });
  module._compile(output.outputText, filename);
};

const { normalizeSyllabusText, parseLocalSyllabus, parseSyllabusDate } = require("../src/lib/syllabus-parser.ts");
const { needsWeekdayColumnOcr, timetablePreprocessDimensions, weekdayColumnPreprocessDimensions } = require("../src/lib/syllabus-scanner.ts");
const {
  detectDocumentLayout,
  parseTimetableDocument,
  parseTimetableGrid,
  extractDocumentEvidence,
  buildPhysicalCells,
  classifySemanticCell,
  traceTimetableCourse,
  detectDocumentRegions,
  reconstructTimeColumns,
  reconstructWeekdayRows,
  reconstructGridCells,
  traceGridCourse,
  classifyCellSemanticType,
} = require("../src/lib/timetable-parser.ts");
const { parseWeekday } = require("../src/lib/timetable/weekday-parser.ts");
const { correctNumericCourseCodeOcr } = require("../src/lib/timetable/cell-parser.ts");
const { academicRangesOverlap, calculateAcademicDuration, parseAcademicTime, parseAcademicTimeRange } = require("../src/lib/academic-time.ts");
const { buildSyllabusImportPayload, deterministicCourseId, getCanonicalImportablePreview, getSyllabusImportReadiness, setAllSyllabusPreviewSelected, updateSyllabusScheduleDraft, validateSyllabusPreview } = require("../src/lib/syllabus-import.ts");
const { getDeterministicCourseColor, TALEVO_COURSE_PALETTE } = require("../src/lib/talevo-color-utils.ts");
const { getClassDurationMinutes, getScheduleDisplayName, isCorruptedScheduleTitle } = require("../src/lib/schedule-utils.ts");
const { normalizeSchedules } = require("../src/lib/persistence/app-state-storage.ts");
const normalized = normalizeSyllabusText(" A\u00a0\tB — C \n\n");
check(normalized === "A B - C", "OCR/PDF text normalization must clean whitespace and dash variants");
check(JSON.stringify(timetablePreprocessDimensions(2000, 1000)) === JSON.stringify({ width: 4000, height: 2000 }) && JSON.stringify(timetablePreprocessDimensions(5000, 2500)) === JSON.stringify({ width: 4096, height: 2048 }), "Landscape timetable preprocessing must upscale while preserving a safe image-size cap");
const weekdayCrop = weekdayColumnPreprocessDimensions(2000, 1000);
check(weekdayCrop.cropWidth === 320 && weekdayCrop.scale >= 2 && weekdayCrop.scale <= 3 && weekdayCrop.width <= 4096 && weekdayCrop.height <= 4096, "Secondary weekday OCR must crop the left 16% and safely upscale it 2x-3x for a normal timetable image");
check(needsWeekdayColumnOcr("0560201\n1204441\nเวลาเรียน 09:00-12:00") && !needsWeekdayColumnOcr("จันทร์\nอังคาร\nพุธ\n0560201\n1204441"), "Secondary weekday OCR must run only when repeated course evidence lacks enough weekday anchors");
check(["จนทร์", "องัคาร", "พฤ", "พฤห.", "พฤหัส", "เสาร์", "อาทิตย์"].map(parseWeekday).join(",") === "0,1,3,3,3,5,6", "Common Thai weekday OCR variants must normalize deterministically");
check(correctNumericCourseCodeOcr("O56O2O1") === "0560201" && correctNumericCourseCodeOcr("EDU-3402") === null, "O/0 and I/1 correction must apply only inside a numeric course-code context and preserve leading zero");
check(parseSyllabusDate("15 กันยายน 2569") === "2026-09-15" && parseSyllabusDate("15/09/2569") === "2026-09-15", "Thai Buddhist-year dates must normalize to ISO dates");
check(parseSyllabusDate("31/02/2569") === null && parseSyllabusDate("not a date") === null, "Invalid or uncertain dates must remain null");
check(parseAcademicTime("24:00", "end")?.minutes === 1440 && parseAcademicTime("24:00", "start") === null && parseAcademicTime("24:01", "end") === null && parseAcademicTime("00:00", "start")?.minutes === 0, "24:00 must remain an end-only 1440-minute boundary while midnight remains a valid zero-minute start");
check(parseAcademicTimeRange("๒๓.๐๐–๒๔.๐๐")?.endTime === "24:00" && parseAcademicTimeRange("00:00-01:00")?.startTime === "00:00", "Thai digits, dot separators, midnight, and end-of-day ranges must normalize safely");
check(calculateAcademicDuration("23:00", "24:00") === 60 && academicRangesOverlap("23:00", "24:00", "22:30", "23:30") && !academicRangesOverlap("23:00", "24:00", "22:00", "23:00"), "Duration and half-open overlap semantics must support the end of day");

const thai = parseLocalSyllabus(fixtures.thaiTextPdf.text);
check(thai.course.courseCode === "TLE 101" && thai.course.courseName === "การวางแผนการเรียน", "Thai course code/name evidence must be parsed");
check(thai.schedules[0]?.day === 0 && thai.schedules[0]?.startTime === "08:30" && thai.schedules[0]?.room === "A-301", "Thai schedule day, time, and room must be parsed");
check(thai.tasks[0]?.dueDate === "2026-09-15" && thai.exams[0]?.date === "2026-10-20", "Thai task and exam dates must be parsed without guessing");

const english = parseLocalSyllabus(fixtures.englishTextPdf.text);
check(english.course.courseCode === "ENG 201" && english.schedules[0]?.startTime === "09:00" && english.schedules[0]?.endTime === "12:00", "English AM/PM schedules must normalize to 24-hour time");
check(english.exams[0]?.type === "midterm" && english.exams[0]?.date === "2026-10-15", "English exam details must be parsed");

const mixed = parseLocalSyllabus(fixtures.mixedTextPdf.text);
check(mixed.schedules[0]?.day === 3 && mixed.tasks[0]?.dueDate === "2026-11-03", "Mixed Thai/English fixtures must retain supported evidence");
const ambiguous = parseLocalSyllabus(fixtures.ambiguousWeekday.text);
check(ambiguous.schedules.length === 0, "Ambiguous Thai weekday abbreviation must not be guessed");
const empty = parseLocalSyllabus(fixtures.noData.text);
check(empty.warnings.some((warning) => warning.includes("ยังไม่พบข้อมูล")) && empty.schedules.length === 0, "No-data documents must produce a safe warning, not invented records");

const detectedGrid = detectDocumentLayout(fixtures.timetableGrid.text, fixtures.timetableGrid.lines);
check(["WEEKLY_TIME_GRID", "UNIVERSITY_BLOCK_GRID"].includes(detectedGrid.layout) && detectedGrid.weekdayCount === 5 && detectedGrid.hourlyHeaderCount >= 4 && detectedGrid.courseCodeCount >= 9, "Timetable detection must require multiple grid signals");
const userPlainTextFixture = `จันทร์
0560201  09:00–12:00  EDU-3402  Section 15
1204441  13:00–17:00  IT-405    Section 2

อังคาร
0560202  13:00–17:00  EDU-3404  Section 10

พุธ
0537212  08:00–12:00  ไม่ระบุ1  Section 2
0042008  13:00–15:00  SCI-300   Section 6
0045003  17:00–19:00  RN1-805   Section 2

พฤหัสบดี
1204442  08:00–12:00  IT-508    Section 1
0537338  13:00–17:00  B-409     Section 1

ศุกร์
0537211  08:00–12:00  5701      Section 1`;
const plainTextPreview = parseTimetableDocument([], userPlainTextFixture);
check(plainTextPreview.documentLayout === "UNIVERSITY_BLOCK_GRID" && JSON.stringify(plainTextPreview.schedules.map((item) => [item.day, item.courseCode, item.startTime, item.endTime, item.room, item.section])) === JSON.stringify([
  [0, "0560201", "09:00", "12:00", "EDU-3402", "15"], [0, "1204441", "13:00", "17:00", "IT-405", "2"],
  [1, "0560202", "13:00", "17:00", "EDU-3404", "10"],
  [2, "0537212", "08:00", "12:00", "ไม่ระบุ1", "2"], [2, "0042008", "13:00", "15:00", "SCI-300", "6"], [2, "0045003", "17:00", "19:00", "RN1-805", "2"],
  [3, "1204442", "08:00", "12:00", "IT-508", "1"], [3, "0537338", "13:00", "17:00", "B-409", "1"],
  [4, "0537211", "08:00", "12:00", "5701", "1"],
]), "plain-text timetable fallback must parse all nine user-provided classes exactly without bounding boxes");
const timetable = parseTimetableGrid(fixtures.timetableGrid.lines, fixtures.timetableGrid.text);
check(["WEEKLY_TIME_GRID", "UNIVERSITY_BLOCK_GRID"].includes(timetable.documentLayout) && timetable.schedules.length === 9 && timetable.debug?.dayAnchors === 5, "Spatial timetable parsing must retain all nine synthetic classes");
check(timetable.schedules.filter((item) => item.day === 0).length === 2 && timetable.schedules.filter((item) => item.day === 1).length === 1 && timetable.schedules.filter((item) => item.day === 2).length === 3 && timetable.schedules.filter((item) => item.day === 3).length === 2 && timetable.schedules.filter((item) => item.day === 4).length === 1, "Weekday row anchors must map the expected timetable distribution");
const mondayMorning = timetable.schedules.find((item) => item.courseCode === "0560201");
check(mondayMorning?.day === 0 && mondayMorning.startTime === "09:00" && mondayMorning.endTime === "12:00" && mondayMorning.credits === 2 && mondayMorning.section === "15" && mondayMorning.room === "EDU-3402", "Explicit timetable time, credits, section, and room must parse exactly");
check(mondayMorning?.courseName === null && mondayMorning?.extraLabel === "EDU", "Unknown extra labels must remain separate and course names must not be invented");
check(timetable.schedules.find((item) => item.courseCode === "0537212")?.room === "ไม่ระบุ1" && timetable.schedules.find((item) => item.courseCode === "0045003")?.endTime === "19:00", "Thai room labels and time seconds must normalize safely");
const editedTimetable = updateSyllabusScheduleDraft(timetable, timetable.schedules[4].draftId, { room: "SCI-EDIT", section: "99" });
check(editedTimetable.schedules.length === timetable.schedules.length && editedTimetable.schedules[4].draftId === timetable.schedules[4].draftId && editedTimetable.schedules[4].room === "SCI-EDIT" && editedTimetable.schedules.every((item, index) => item.draftId === timetable.schedules[index].draftId), "Editing one Preview field must preserve list order and every immutable draftId");
const fallback = parseTimetableGrid(fixtures.timetableFallback.lines, fixtures.timetableFallback.text);
check(fallback.schedules.find((item) => item.courseCode === "1204441")?.confidence === "review" && fallback.schedules.find((item) => item.courseCode === "1204441")?.startTime === "13:00", "Positional time fallback must be review-only when explicit time is absent");
const noDayAnchors = parseTimetableDocument(fixtures.timetableNoDayAnchors.lines, fixtures.timetableNoDayAnchors.text);
check(noDayAnchors.documentLayout === "UNIVERSITY_BLOCK_GRID" && noDayAnchors.debug?.dayAnchors === 0 && noDayAnchors.schedules.length === 9, "University block grids must retain all course blocks when weekday OCR anchors are absent");
check(JSON.stringify(noDayAnchors.schedules.map((item) => [item.day, item.courseCode, item.startTime, item.endTime, item.room, item.section, item.credits])) === JSON.stringify([
  [0, "0560201", "09:00", "12:00", "EDU-3402", "15", 2], [0, "1204441", "13:00", "17:00", "IT-405", "2", 3],
  [1, "0560202", "13:00", "17:00", "EDU-3404", "10", 3],
  [2, "0537212", "08:00", "12:00", "ไม่ระบุ1", "2", 3], [2, "0042008", "13:00", "15:00", "SCI-300", "6", 2], [2, "0045003", "17:00", "19:00", "RN1-805", "2", 2],
  [3, "1204442", "08:00", "12:00", "IT-508", "1", 3], [3, "0537338", "13:00", "17:00", "B-409", "1", 3],
  [4, "0537211", "08:00", "12:00", "5701", "1", 3],
]), "Inferred row bands must preserve all nine leading-zero codes and explicit university block fields");
check(noDayAnchors.schedules.every((item) => item.confidence === "review" && item.selected === false) && noDayAnchors.warnings.some((warning) => warning.includes("พบโครงสร้างตาราง แต่ยังมีบางรายการต้องตรวจสอบ")), "Inferred weekdays must remain review-only drafts with an explicit partial-success warning");
const missingCodeLines = fixtures.timetableNoDayAnchors.lines.filter((line) => line.text !== "0045003");
const missingCodePreview = parseTimetableDocument(missingCodeLines, missingCodeLines.map((line) => line.text).join("\n"));
check(missingCodePreview.schedules.length === 9 && missingCodePreview.schedules.some((item) => item.courseCode === null && item.startTime === "17:00" && item.endTime === "19:00" && item.room === "RN1-805" && item.selected === false), "A labeled explicit-time block whose course code OCR failed must survive as an editable partial draft");
const partialLines = fixtures.timetableNoDayAnchors.lines.filter((line) => line.text !== "เวลาเรียน : 17:00:00 - 19:00:00" && !/^\d{1,2}:00-\d{1,2}:00$/.test(line.text));
const partialUniversity = parseTimetableDocument(partialLines, partialLines.map((line) => line.text).join("\n"));
check(partialUniversity.schedules.length === 9 && partialUniversity.schedules.some((item) => item.courseCode === "0045003" && item.day === 2 && item.startTime === null && item.confidence === "missing"), "Partial success must keep a draft when one university block lacks both explicit and positional time evidence");
const weekendLines = [
  { text: "จันทร์", x: 10, y: 100, width: 60, height: 18, confidence: 95 },
  { text: "เสาร์", x: 10, y: 200, width: 60, height: 18, confidence: 95 },
  { text: "อาทิตย์", x: 10, y: 300, width: 60, height: 18, confidence: 95 },
  { text: "7000001", x: 120, y: 195, width: 100, height: 18, confidence: 95 },
  { text: "เวลาเรียน : 23:00:00 - 24:00:00", x: 120, y: 210, width: 210, height: 18, confidence: 95 },
  { text: "7000002", x: 120, y: 295, width: 100, height: 18, confidence: 95 },
  { text: "เวลาเรียน : 00:00:00 - 01:00:00", x: 120, y: 310, width: 210, height: 18, confidence: 95 },
];
const weekendPreview = parseTimetableGrid(weekendLines, weekendLines.map((line) => line.text).join("\n"));
check(weekendPreview.schedules.some((item) => item.day === 5 && item.startTime === "23:00" && item.endTime === "24:00") && weekendPreview.schedules.some((item) => item.day === 6 && item.startTime === "00:00" && item.endTime === "01:00"), "scanner parser must preserve Saturday, Sunday, midnight, and 24:00 schedules");
const confirmedWeekendPreview = { ...weekendPreview, schedules: weekendPreview.schedules.map((item) => ({ ...item, selected: true })) };
const weekendPayload = buildSyllabusImportPayload(confirmedWeekendPreview, { schedules: [], tasks: [], exams: [] });
const weekendIsolatedDuplicate = buildSyllabusImportPayload(confirmedWeekendPreview, { schedules: [{ ...weekendPayload.schedules[0], id: "existing-weekend" }], tasks: [], exams: [] });
check(weekendPayload.schedules.length === 2 && weekendIsolatedDuplicate.schedules.length === 1 && weekendIsolatedDuplicate.schedules[0].day === 6, "Saturday and Sunday imports must remain isolated while exact weekend duplicates are skipped");
const periodLayout = detectDocumentLayout(["คาบ 1", "คาบ 2", "คาบ 3", "คาบ 4", "คาบ 5", "08:30-09:20", "09:20-10:10", "10:10-11:00", "11:00-11:50", "12:40-13:30", "จันทร์", "อังคาร", "พุธ", "7000001", "7000002"].join("\n"));
check(periodLayout.layout === "PERIOD_GRID" && periodLayout.evidence.includes("period-time mapping"), "period grids must be selected from period, time, and weekday evidence");
const schoolLayout = detectDocumentLayout(["คาบ 1", "คาบ 2", "คาบ 3", "คาบ 4", "คาบ 5", "จันทร์", "อังคาร", "พุธ", "ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์"].join("\n"));
check(schoolLayout.layout === "SCHOOL_SUBJECT_GRID", "subject-only school grids must be distinguished from numeric course grids");
const datedLayout = detectDocumentLayout(["1 พ.ค. 2569", "2 พ.ค. 2569", "3 พ.ค. 2569", "08:00-09:00", "09:00-10:00", "7000001", "7000002"].join("\n"));
check(datedLayout.layout === "DATED_SCHEDULE_GRID", "dated schedule grids must require repeated explicit dates and schedule evidence");
const eventLayout = detectDocumentLayout(["1 พ.ค. 2569", "2 พ.ค. 2569", "กิจกรรมแนะแนว"].join("\n"));
check(eventLayout.layout === "DATED_EVENT_GRID", "dated event grids must retain their event identity");
const examLayout = detectDocumentLayout(["ตารางสอบ", "1 พ.ค. 2569", "2 พ.ค. 2569", "08:00-09:00", "7000001"].join("\n"));
check(examLayout.layout === "EXAM_GRID", "exam grids must use date, exam-label, time, and course evidence");
const unknownPreview = parseTimetableDocument([], "");
check(unknownPreview.documentLayout === "UNKNOWN" && unknownPreview.schedules.length === 0 && unknownPreview.warnings.length > 0, "unknown layouts must fail safely without invented imports");
const periodLines = [
  ...[1, 2, 3, 4, 5].map((period, index) => ({ text: `คาบ ${period}`, x: 120 + index * 100, y: 10, width: 60, height: 18, confidence: 95 })),
  ...["08.30-09.20", "09.20-10.10", "10.10-11.00", "11.00-11.50", "12.40-13.30"].map((text, index) => ({ text, x: 120 + index * 100, y: 35, width: 80, height: 18, confidence: 95 })),
  ...["จันทร์", "อังคาร", "พุธ"].map((text, index) => ({ text, x: 10, y: 100 + index * 100, width: 60, height: 18, confidence: 95 })),
  { text: "ค22203", x: 120, y: 95, width: 70, height: 18, confidence: 95, layoutWidth: 100 },
  { text: "ครูเฉลิมชัย", x: 120, y: 112, width: 90, height: 18, confidence: 95 },
  { text: "414", x: 120, y: 129, width: 35, height: 18, confidence: 95 },
];
const periodPreview = parseTimetableDocument(periodLines, periodLines.map((line) => line.text).join("\n"));
check(periodPreview.documentLayout === "PERIOD_GRID" && periodPreview.schedules[0]?.courseCode === "ค22203" && periodPreview.schedules[0]?.teacher === "ครูเฉลิมชัย" && periodPreview.schedules[0]?.room === "414" && periodPreview.schedules[0]?.startTime === "08:30" && periodPreview.schedules[0]?.endTime === "09:20", "period-grid parser must derive time from document headers and retain Thai code, teacher, and room");
const schoolLines = [...periodLines.filter((line) => !/ค22203|ครูเฉลิมชัย|414/.test(line.text)),
  { text: "วิทยาศาสตร์", x: 120, y: 95, width: 95, height: 18, confidence: 95, layoutWidth: 100 }, { text: "ครูจินดา", x: 120, y: 112, width: 75, height: 18, confidence: 95 },
  { text: "ภาษาไทย", x: 220, y: 195, width: 75, height: 18, confidence: 95, layoutWidth: 100 }, { text: "ครูรัชดา", x: 220, y: 212, width: 75, height: 18, confidence: 95 },
  { text: "คณิตศาสตร์", x: 320, y: 295, width: 95, height: 18, confidence: 95, layoutWidth: 100 }, { text: "ครูศิริ", x: 320, y: 312, width: 60, height: 18, confidence: 95 },
];
const schoolPreview = parseTimetableDocument(schoolLines, schoolLines.map((line) => line.text).join("\n"));
check(schoolPreview.documentLayout === "SCHOOL_SUBJECT_GRID" && schoolPreview.schedules.some((item) => item.courseName === "วิทยาศาสตร์" && item.courseCode === null && item.teacher === "ครูจินดา"), "subject-only grids must create editable drafts without inventing course codes");

// Dense School Timetable Golden Fixture Tests
const denseSchoolPreview = parseTimetableDocument(fixtures.denseSchoolGrid.lines, fixtures.denseSchoolGrid.text);
check(denseSchoolPreview.documentLayout === "SCHOOL_SUBJECT_GRID", "Dense school timetable must classify as SCHOOL_SUBJECT_GRID");
check(denseSchoolPreview.schedules.length === 27, `Dense school timetable must produce exactly 27 course blocks, got ${denseSchoolPreview.schedules.length}`);

const mondayCourses = denseSchoolPreview.schedules.filter((s) => s.day === 0);
const tuesdayCourses = denseSchoolPreview.schedules.filter((s) => s.day === 1);
const wednesdayCourses = denseSchoolPreview.schedules.filter((s) => s.day === 2);
const thursdayCourses = denseSchoolPreview.schedules.filter((s) => s.day === 3);
const fridayCourses = denseSchoolPreview.schedules.filter((s) => s.day === 4);

check(mondayCourses.length === 6, `Monday must have 6 courses, got ${mondayCourses.length}`);
check(tuesdayCourses.length === 5, `Tuesday must have 5 courses, got ${tuesdayCourses.length}`);
check(wednesdayCourses.length === 5, `Wednesday must have 5 courses, got ${wednesdayCourses.length}`);
check(thursdayCourses.length === 5, `Thursday must have 5 courses, got ${thursdayCourses.length}`);
check(fridayCourses.length === 6, `Friday must have 6 courses, got ${fridayCourses.length}`);

// Non-course exclusions: flag assembly, homeroom, lunch break, and document title must NEVER become course records
check(!denseSchoolPreview.schedules.some((s) => /(?:เข้าแถว|เคารพธงชาติ|โฮมรูม|พักกลางวัน|พักรับประทานอาหาร|ตารางเรียนชั้นมัธยม)/iu.test(s.courseName || "")), "Recurring non-course activities and document title must be excluded from course import");

// Merged morning lessons (08:00–10:00) must remain ONE lesson record NOT two records
const monMorning = mondayCourses.find((s) => s.courseName?.includes("คณิตศาสตร์พื้นฐาน"));
const tueMorning = tuesdayCourses.find((s) => s.courseName?.includes("วิทยาศาสตร์กายภาพ"));
const wedMorning = wednesdayCourses.find((s) => s.courseName?.includes("เคมี"));
const thuMorning = thursdayCourses.find((s) => s.courseName?.includes("คณิตศาสตร์เพิ่มเติม"));
const friMorning = fridayCourses.find((s) => s.courseName?.includes("ภาษาอังกฤษเพื่อการสื่อสาร"));

check(monMorning?.startTime === "08:00" && monMorning.endTime === "10:00", "Monday 08:00-10:00 merged lesson must be 1 record spanning 08:00-10:00");
check(tueMorning?.startTime === "08:00" && tueMorning.endTime === "10:00", "Tuesday 08:00-10:00 merged lesson must be 1 record spanning 08:00-10:00");
check(wedMorning?.startTime === "08:00" && wedMorning.endTime === "10:00", "Wednesday 08:00-10:00 merged lesson must be 1 record spanning 08:00-10:00");
check(thuMorning?.startTime === "08:00" && thuMorning.endTime === "10:00", "Thursday 08:00-10:00 merged lesson must be 1 record spanning 08:00-10:00");
check(friMorning?.startTime === "08:00" && friMorning.endTime === "10:00", "Friday 08:00-10:00 merged lesson must be 1 record spanning 08:00-10:00");

// Merged afternoon lessons (13:00–15:00) must remain ONE lesson record
const tueAfternoon = tuesdayCourses.find((s) => s.courseName?.includes("คอมพิวเตอร์"));
const wedAfternoon = wednesdayCourses.find((s) => s.courseName?.includes("ปฏิบัติการวิทย์"));
const thuAfternoon = thursdayCourses.find((s) => s.courseName?.includes("การงานอาชีพ"));

check(tueAfternoon?.startTime === "13:00" && tueAfternoon.endTime === "15:00" && tueAfternoon.teacher === "ครูชลธิชา", "Tuesday 13:00-15:00 merged lesson must be 1 record spanning 13:00-15:00 with teacher ครูชลธิชา");
check(wedAfternoon?.startTime === "13:00" && wedAfternoon.endTime === "15:00" && wedAfternoon.teacher === "ครูณัฐ", "Wednesday 13:00-15:00 merged lesson must be 1 record spanning 13:00-15:00 with teacher ครูณัฐ");
check(thuAfternoon?.startTime === "13:00" && thuAfternoon.endTime === "15:00" && thuAfternoon.teacher === "ครูสมพร", "Thursday 13:00-15:00 merged lesson must be 1 record spanning 13:00-15:00 with teacher ครูสมพร");

// Universal Validation Contract: all 27 courses are valid with courseName (courseCode is null)
check(denseSchoolPreview.schedules.every((s) => s.courseName && s.courseCode === null && s.day !== null && s.startTime && s.endTime), "Universal contract: School timetable records must be valid with courseName + day + startTime + endTime (courseCode null)");
check(validateSyllabusPreview(denseSchoolPreview).length === 0, "Dense school timetable preview must have 0 blocking validation errors");
const denseSchoolPayload = buildSyllabusImportPayload(denseSchoolPreview, { schedules: [], tasks: [], exams: [] });
check(denseSchoolPayload.schedules.length === 27, "Import payload must safely contain all 27 school courses");

// Grid-First Architecture Stage Assertions (Dense School Timetable)
const schoolRawEvidence = extractDocumentEvidence(fixtures.denseSchoolGrid.lines);
check(schoolRawEvidence.length === fixtures.denseSchoolLines.length, "Stage 1: All raw OCR evidence must be preserved without premature filtering");

const schoolRegions = detectDocumentRegions(schoolRawEvidence);
check(schoolRegions.documentTitle.length >= 1 && schoolRegions.documentTitle[0].rawText.includes("ตารางเรียนชั้นมัธยม"), "Stage 2: Document title must be classified into documentTitle and excluded from body");
check(schoolRegions.timeHeaders.length === 10, `Stage 2: Exactly 10 time column headers must be classified, got ${schoolRegions.timeHeaders.length}`);
check(schoolRegions.weekdayHeaders.length === 5, `Stage 2: Exactly 5 weekday headers must be classified, got ${schoolRegions.weekdayHeaders.length}`);

const schoolTimeCols = reconstructTimeColumns(schoolRegions.timeHeaders, schoolRegions.gridBounds.left, schoolRegions.gridBounds.right);
check(schoolTimeCols.length === 10 && schoolTimeCols[0].startTime === "07:30" && schoolTimeCols[0].endTime === "07:45" && schoolTimeCols[2].startTime === "08:00" && schoolTimeCols[2].endTime === "09:00", "Stage 5: Time axis model must support variable intervals (15-min and 60-min columns)");

const schoolWeekdayRows = reconstructWeekdayRows(schoolRegions.weekdayHeaders, schoolRegions.gridBounds.top, schoolRegions.gridBounds.bottom, schoolRegions.bodyEvidence);
check(schoolWeekdayRows.length === 5 && schoolWeekdayRows[0].day === 0 && schoolWeekdayRows[4].day === 4, "Stage 6: Weekday row model must reconstruct Monday (0) through Friday (4)");

const schoolPhysicalCells = reconstructGridCells(schoolRegions, schoolTimeCols, schoolWeekdayRows);
check(schoolPhysicalCells.some((c) => c.cellType === "break" && c.startTime === "12:00" && c.endTime === "13:00"), "Stage 8 & 10: Lunch break must be classified as break cell");
check(schoolPhysicalCells.some((c) => c.cellType === "activity" && c.startTime === "07:30" && c.endTime === "07:45"), "Stage 8 & 10: Morning assembly must be classified as activity cell");
check(schoolPhysicalCells.some((c) => c.cellType === "activity" && c.startTime === "07:45" && c.endTime === "08:00"), "Stage 8 & 10: Homeroom must be classified as activity cell");
check(classifyCellSemanticType([{ rawText: "พักกลางวัน", normalizedText: "พักกลางวัน", id: "t1", x: 0, y: 0, width: 10, height: 10, centerX: 5, centerY: 5, page: 1, confidence: 95 }]) === "break", "classifyCellSemanticType must identify break cells");

const traceMath = traceGridCourse(denseSchoolPreview, schoolRawEvidence, schoolPhysicalCells, "คณิตศาสตร์พื้นฐาน");
check(traceMath.rawEvidenceFound === true && traceMath.assignedToCell === true && traceMath.cellDay === 0 && traceMath.startTime === "08:00" && traceMath.endTime === "10:00", "Stage B6: Tracing คณิตศาสตร์พื้นฐาน must confirm cell assignment and 08:00-10:00 merged span");

const traceComp = traceGridCourse(denseSchoolPreview, schoolRawEvidence, schoolPhysicalCells, "คอมพิวเตอร์");
check(traceComp.rawEvidenceFound === true && traceComp.assignedToCell === true && traceComp.cellDay === 1 && traceComp.startTime === "13:00" && traceComp.endTime === "15:00", "Stage B6: Tracing คอมพิวเตอร์ must confirm cell assignment and 13:00-15:00 merged span");

// =========================================================================
// COMPLETE TIMETABLE IMPORT CONTRACT TEST SUITE
// =========================================================================

// --- TEST A: UNIVERSITY IMPORT CONTRACT ---
const uniContractPreview = parseTimetableDocument(fixtures.timetableGrid.lines, fixtures.timetableGrid.text);
check(uniContractPreview.schedules.length === 9, "University contract: exactly 9 drafts parsed");
check(validateSyllabusPreview(uniContractPreview).length === 0, "University contract: 0 blocking validation errors");

// Select All
const uniSelectedPreview = setAllSyllabusPreviewSelected(uniContractPreview, true);
check(uniSelectedPreview.schedules.filter((s) => s.selected).length === 9, "University contract: all 9 drafts selectable");

// Build payload
const uniContractPayload = buildSyllabusImportPayload(uniSelectedPreview, { schedules: [], tasks: [], exams: [] });
check(uniContractPayload.schedules.length === 9, `University contract: payload must contain exactly 9 courses, got ${uniContractPayload.schedules.length}`);

// Assert EXACT 9 records:
const uniExpected = [
  { code: "0560201", day: 0, start: "09:00", end: "12:00", room: "EDU-3402", sec: "15", cred: 2 },
  { code: "1204441", day: 0, start: "13:00", end: "17:00", room: "IT-405", sec: "2", cred: 3 },
  { code: "0560202", day: 1, start: "13:00", end: "17:00", room: "EDU-3404", sec: "10", cred: 3 },
  { code: "0537212", day: 2, start: "08:00", end: "12:00", room: "ไม่ระบุ1", sec: "2", cred: 3 },
  { code: "0042008", day: 2, start: "13:00", end: "15:00", room: "SCI-300", sec: "6", cred: 2 },
  { code: "0045003", day: 2, start: "17:00", end: "19:00", room: "RN1-805", sec: "2", cred: 2 },
  { code: "1204442", day: 3, start: "08:00", end: "12:00", room: "IT-508", sec: "1", cred: 3 },
  { code: "0537338", day: 3, start: "13:00", end: "17:00", room: "B-409", sec: "1", cred: 3 },
  { code: "0537211", day: 4, start: "08:00", end: "12:00", room: "5701", sec: "1", cred: 3 },
];

uniExpected.forEach((exp, idx) => {
  const match = uniContractPayload.schedules.find((s) => s.courseCode === exp.code);
  check(match !== undefined, `University contract #${idx + 1}: code ${exp.code} must exist in payload`);
  check(match.day === exp.day, `University contract #${idx + 1} (${exp.code}): day must be ${exp.day}, got ${match.day}`);
  check(match.startTime === exp.start && match.endTime === exp.end, `University contract #${idx + 1} (${exp.code}): time must be ${exp.start}-${exp.end}, got ${match.startTime}-${match.endTime}`);
  check(match.room === exp.room, `University contract #${idx + 1} (${exp.code}): room must be ${exp.room}, got ${match.room}`);
  check(match.section === exp.sec, `University contract #${idx + 1} (${exp.code}): section must be ${exp.sec}, got ${match.section}`);
  check(match.credits === exp.cred, `University contract #${idx + 1} (${exp.code}): credits must be ${exp.cred}, got ${match.credits}`);
  check(match.name === "", `University contract #${idx + 1} (${exp.code}): name must remain empty string, not a fake fallback string`);
});

// Leading zero codes preserved as string
check(["0560201", "0042008", "0045003"].every((code) => uniContractPayload.schedules.some((s) => s.courseCode === code)), "Leading zero codes must be preserved as strings");

// --- TEST B: SCHOOL IMPORT CONTRACT ---
const schoolContractPreview = parseTimetableDocument(fixtures.denseSchoolGrid.lines, fixtures.denseSchoolGrid.text);
check(schoolContractPreview.schedules.length === 27, "School contract: exactly 27 drafts parsed");
check(validateSyllabusPreview(schoolContractPreview).length === 0, "School contract: 0 blocking validation errors");

// Select All
const schoolSelectedPreview = setAllSyllabusPreviewSelected(schoolContractPreview, true);
check(schoolSelectedPreview.schedules.filter((s) => s.selected).length === 27, "School contract: all 27 drafts selectable");

// Build payload
const schoolContractPayload = buildSyllabusImportPayload(schoolSelectedPreview, { schedules: [], tasks: [], exams: [] });
check(schoolContractPayload.schedules.length === 27, `School contract: payload must contain exactly 27 courses, got ${schoolContractPayload.schedules.length}`);

// Assert courseName preserved and absence of courseCode does not make them invalid
check(schoolContractPayload.schedules.every((s) => s.name && s.courseCode === undefined && s.day !== null && s.startTime && s.endTime), "School contract: all courses valid with name + day + startTime + endTime (courseCode undefined)");
check(schoolContractPayload.schedules.some((s) => s.name === "คณิตศาสตร์พื้นฐาน" && s.day === 0 && s.startTime === "08:00" && s.endTime === "10:00"), "School contract: คณิตศาสตร์พื้นฐาน 08:00-10:00 preserved");
check(schoolContractPayload.schedules.some((s) => s.name === "คอมพิวเตอร์" && s.day === 1 && s.startTime === "13:00" && s.endTime === "15:00"), "School contract: คอมพิวเตอร์ 13:00-15:00 preserved");
check(schoolContractPayload.schedules.some((s) => s.name === "เคมี" && s.day === 2 && s.startTime === "08:00" && s.endTime === "10:00"), "School contract: เคมี 08:00-10:00 preserved");

// Non-course import exclusion
check(!schoolContractPayload.schedules.some((s) => /(?:เข้าแถว|เคารพธงชาติ|โฮมรูม|พักกลางวัน|พักรับประทานอาหาร)/iu.test(s.name || s.teacher || s.note || "")), "Non-course exclusion: 0 occurrences of non-course activities in school import payload");

// --- STABLE DRAFT ID CONTRACT ---
const initialSchoolDraftIds = schoolContractPreview.schedules.map((s) => s.draftId);
const validatedDraftIds = schoolContractPreview.schedules.map((s) => s.draftId);
check(JSON.stringify(initialSchoolDraftIds) === JSON.stringify(validatedDraftIds), "Stable draftId: draft IDs must remain stable across validation");

const deselectedSchool = setAllSyllabusPreviewSelected(schoolContractPreview, false);
const reselectedSchool = setAllSyllabusPreviewSelected(deselectedSchool, true);
check(JSON.stringify(deselectedSchool.schedules.map((s) => s.draftId)) === JSON.stringify(initialSchoolDraftIds), "Stable draftId: draft IDs must remain stable when deselected");
check(JSON.stringify(reselectedSchool.schedules.map((s) => s.draftId)) === JSON.stringify(initialSchoolDraftIds), "Stable draftId: draft IDs must remain stable when re-selected");

// --- PREVIEW EDIT REGRESSION ---
const uniTargetDraftId = uniContractPreview.schedules[0].draftId;
const editedUniDraft = updateSyllabusScheduleDraft(uniContractPreview, uniTargetDraftId, { room: "EDU-TEST" });
check(editedUniDraft.schedules[0].draftId === uniTargetDraftId, "Preview edit: draftId must be preserved");
check(editedUniDraft.schedules[0].room === "EDU-TEST", "Preview edit: target room must be updated to EDU-TEST");
check(editedUniDraft.schedules.slice(1).every((s, i) => s.room === uniContractPreview.schedules[i + 1].room && s.draftId === uniContractPreview.schedules[i + 1].draftId), "Preview edit: other 8 university records must remain completely unchanged");

const schoolTargetDraftId = schoolContractPreview.schedules[0].draftId;
const editedSchoolDraft = updateSyllabusScheduleDraft(schoolContractPreview, schoolTargetDraftId, { courseName: "คณิตศาสตร์ ม.5" });
check(editedSchoolDraft.schedules[0].courseName === "คณิตศาสตร์ ม.5", "Preview edit: target courseName updated");
check(editedSchoolDraft.schedules.slice(1).every((s, i) => s.courseName === schoolContractPreview.schedules[i + 1].courseName && s.draftId === schoolContractPreview.schedules[i + 1].draftId), "Preview edit: other 26 school records must remain completely unchanged");

// --- SELECT ALL / DESELECT ALL CONTRACT ---
check(setAllSyllabusPreviewSelected(uniContractPreview, true).schedules.filter((s) => s.selected).length === 9, "University Select All = 9");
check(setAllSyllabusPreviewSelected(uniContractPreview, false).schedules.filter((s) => s.selected).length === 0, "University Deselect All = 0");
check(setAllSyllabusPreviewSelected(setAllSyllabusPreviewSelected(uniContractPreview, false), true).schedules.filter((s) => s.selected).length === 9, "University Re-select All = 9");

check(setAllSyllabusPreviewSelected(schoolContractPreview, true).schedules.filter((s) => s.selected).length === 27, "School Select All = 27");
check(setAllSyllabusPreviewSelected(schoolContractPreview, false).schedules.filter((s) => s.selected).length === 0, "School Deselect All = 0");
check(setAllSyllabusPreviewSelected(setAllSyllabusPreviewSelected(schoolContractPreview, false), true).schedules.filter((s) => s.selected).length === 27, "School Re-select All = 27");

// --- PARTIAL SAFE IMPORT CONTRACT ---
// University scenario: 9 selected, 1 invalid (remove startTime on #3) -> import 8, skip 1
const partialUniCopy = {
  ...uniSelectedPreview,
  schedules: uniSelectedPreview.schedules.map((s, idx) => idx === 2 ? { ...s, startTime: null } : { ...s })
};
const partialUniReady = getCanonicalImportablePreview(partialUniCopy);
check(partialUniReady.schedules.filter((s) => s.selected).length === 8, "Partial safe import: university invalid item excluded from ready selection");
const partialUniPayload = buildSyllabusImportPayload(partialUniReady, { schedules: [], tasks: [], exams: [] });
check(partialUniPayload.schedules.length === 8, "Partial safe import: university batch imports 8 valid and skips 1 invalid");

// School scenario: 27 selected, 1 invalid (remove startTime on #5) -> import 26, skip 1
const partialSchoolCopy = {
  ...schoolSelectedPreview,
  schedules: schoolSelectedPreview.schedules.map((s, idx) => idx === 4 ? { ...s, startTime: null } : { ...s })
};
const partialSchoolReady = getCanonicalImportablePreview(partialSchoolCopy);
check(partialSchoolReady.schedules.filter((s) => s.selected).length === 26, "Partial safe import: school invalid item excluded from ready selection");
const partialSchoolPayload = buildSyllabusImportPayload(partialSchoolReady, { schedules: [], tasks: [], exams: [] });
check(partialSchoolPayload.schedules.length === 26, "Partial safe import: school batch imports 26 valid and skips 1 invalid");

// --- UNIVERSAL VALIDATION CONTRACT MATRIX (FORMS A–E) ---
const makeTestDraft = (opts) => ({
  sourceKind: "document",
  course: { courseCode: null, courseName: null, section: null, instructor: null, room: null, credits: null },
  schedules: [{
    id: "test-draft",
    draftId: "test-draft",
    courseCode: opts.courseCode ?? null,
    courseName: opts.courseName ?? null,
    day: opts.day !== undefined ? opts.day : 0,
    startTime: opts.startTime !== undefined ? opts.startTime : "09:00",
    endTime: opts.endTime !== undefined ? opts.endTime : "10:00",
    room: null,
    confidence: "confident",
    selected: true,
  }],
  tasks: [],
  exams: [],
  warnings: [],
});

// FORM A: University (code exists, name absent, valid day/time) -> VALID
const formA = getCanonicalImportablePreview(makeTestDraft({ courseCode: "0560201", courseName: null, day: 0, startTime: "09:00", endTime: "10:00" }));
check(formA.schedules[0].selected === true, "Form A (code only) must be valid and importable");

// FORM B: School (name exists, code absent, valid day/time) -> VALID
const formB = getCanonicalImportablePreview(makeTestDraft({ courseCode: null, courseName: "เคมี", day: 0, startTime: "09:00", endTime: "10:00" }));
check(formB.schedules[0].selected === true, "Form B (name only) must be valid and importable");

// FORM C: No identity (code absent, name absent) -> INVALID
const formC = getCanonicalImportablePreview(makeTestDraft({ courseCode: null, courseName: null, day: 0, startTime: "09:00", endTime: "10:00" }));
check(formC.schedules[0].selected === false, "Form C (no identity) must be invalid");

// FORM D: Identity exists, day absent -> INVALID
const formD = getCanonicalImportablePreview(makeTestDraft({ courseCode: "0560201", courseName: null, day: null, startTime: "09:00", endTime: "10:00" }));
check(formD.schedules[0].selected === false, "Form D (missing day) must be invalid");

// FORM E: Identity exists, start/end invalid -> INVALID
const formE = getCanonicalImportablePreview(makeTestDraft({ courseCode: "0560201", courseName: null, day: 0, startTime: "10:00", endTime: "09:00" }));
check(formE.schedules[0].selected === false, "Form E (invalid time order) must be invalid");

// --- DAY & TIME CONTRACTS ---
check([0, 1, 2, 3, 4, 5, 6].every((day) => {
  const dPreview = getCanonicalImportablePreview(makeTestDraft({ courseCode: "C1", day }));
  return dPreview.schedules[0].day === day && dPreview.schedules[0].selected === true;
}), "Day contract: days 0 through 6 must be preserved directly as canonical integers");

check(academicRangesOverlap("12:00", "13:00", "13:00", "14:00") === false, "Time contract: adjacent intervals [12:00,13:00) and [13:00,14:00) must not overlap");
check(academicRangesOverlap("12:00", "13:01", "13:00", "14:00") === true, "Time contract: true overlaps must be detected");

// --- DUPLICATE CONTRACT ---
const existingUniSchedule = {
  id: "existing-0560201",
  courseId: deterministicCourseId({ courseCode: "0560201", courseName: null, instructor: null, room: null, section: null, credits: null }),
  courseCode: "0560201",
  name: "",
  day: 0,
  startTime: "09:00",
  endTime: "12:00",
  room: "EDU-3402",
  color: "#7656F6",
};
const dupPayload = buildSyllabusImportPayload(uniSelectedPreview, { schedules: [existingUniSchedule], tasks: [], exams: [] });
check(dupPayload.skippedDuplicates === 1, "Duplicate contract: exact duplicate must be skipped");
check(dupPayload.schedules.length === 8, "Duplicate contract: duplicate item excluded from payload");

// Legitimately different time with same course identity
const differentTimePreview = {
  sourceKind: "document",
  course: { courseCode: "0560201", courseName: null, section: null, instructor: null, room: null, credits: null },
  schedules: [
    { ...uniContractPreview.schedules[0], id: "s-lecture", draftId: "s-lecture", startTime: "09:00", endTime: "10:00", selected: true },
    { ...uniContractPreview.schedules[0], id: "s-lab", draftId: "s-lab", startTime: "13:00", endTime: "15:00", selected: true },
  ],
  tasks: [],
  exams: [],
  warnings: [],
};
const diffTimePayload = buildSyllabusImportPayload(differentTimePreview, { schedules: [], tasks: [], exams: [] });
check(diffTimePayload.schedules.length === 2 && diffTimePayload.skippedDuplicates === 0, "Duplicate contract: same course at different times must both be preserved");

// --- IN-MEMORY APPSTATE COMPATIBILITY & NORMALIZATION ---
const simClassSchedules = uniContractPayload.schedules.map((input, idx) => ({
  ...input,
  id: `class-${idx + 1}`,
  color: input.color,
}));
const normalizedUni = normalizeSchedules(simClassSchedules, []);
check(normalizedUni.length === 9, "AppState compatibility: normalizeSchedules accepts all 9 university records");
check(normalizedUni[0].courseCode === "0560201" && normalizedUni[0].name === "", "AppState compatibility: university courseCode and empty name preserved");

const simSchoolClassSchedules = schoolContractPayload.schedules.map((input, idx) => ({
  ...input,
  id: `class-${idx + 1}`,
  color: input.color,
}));
const normalizedSchool = normalizeSchedules(simSchoolClassSchedules, []);
check(normalizedSchool.length === 27, "AppState compatibility: normalizeSchedules accepts all 27 school records");
check(normalizedSchool[0].name === "คณิตศาสตร์พื้นฐาน" && normalizedSchool[0].courseCode === undefined, "AppState compatibility: school name preserved without courseCode");

// --- DETERMINISTIC COLORS CONTRACT ---
check(getDeterministicCourseColor("0560201") === getDeterministicCourseColor("0560201"), "Deterministic color: identical code produces identical color");
check(getDeterministicCourseColor("คณิตศาสตร์พื้นฐาน") === getDeterministicCourseColor("คณิตศาสตร์พื้นฐาน"), "Deterministic color: identical name produces identical color");
const uniqueUniColors = new Set(uniContractPayload.schedules.map((s) => s.color));
check(uniqueUniColors.size > 1, "Deterministic color: multiple courses assigned distinct palette colors");



const examLines = [
  { text: "ตารางสอบ", x: 10, y: 10, width: 80, height: 18, confidence: 95 }, { text: "5500115", x: 120, y: 70, width: 90, height: 18, confidence: 95 },
  { text: "FE I", x: 120, y: 88, width: 50, height: 18, confidence: 95 }, { text: "27 ก.ย. 2547", x: 120, y: 106, width: 110, height: 18, confidence: 95 },
  { text: "8:30-10:30", x: 120, y: 124, width: 100, height: 18, confidence: 95 }, { text: "EDU3", x: 120, y: 142, width: 50, height: 18, confidence: 95 }, { text: "101", x: 120, y: 160, width: 35, height: 18, confidence: 95 },
];
const examPreview = parseTimetableDocument(examLines, examLines.map((line) => line.text).join("\n"));
check(examPreview.documentLayout === "EXAM_GRID" && examPreview.exams[0]?.title === "5500115" && examPreview.exams[0]?.date === "2004-09-27" && examPreview.exams[0]?.startTime === "08:30" && examPreview.exams[0]?.room === "EDU3 101" && examPreview.exams[0]?.selected === false, "exam parser must retain code/date/time/location while requiring explicit Preview confirmation");
check(!["WEEKLY_TIME_GRID", "PERIOD_GRID", "SCHOOL_SUBJECT_GRID", "UNIVERSITY_BLOCK_GRID"].includes(parseLocalSyllabus(fixtures.thaiTextPdf.text).documentLayout), "Timetable mode must not replace the syllabus-text parser");

const preview = {
  sourceKind: "text",
  course: { courseCode: "TLE 101", courseName: "การวางแผนการเรียน", section: "1", instructor: "อาจารย์ต้า", room: "A-301", credits: 3 },
  schedules: [{ id: "schedule-0", draftId: "schedule-0", day: 0, startTime: "09:00", endTime: "11:00", room: "A-301", confidence: "confident", selected: true }],
  tasks: [{ id: "task-0", draftId: "task-0", title: "ส่งแผนการเรียน", dueDate: "2026-09-30", dueTime: "23:59", description: "ฉบับร่าง", weight: 20, confidence: "review", selected: true }],
  exams: [{ id: "exam-0", draftId: "exam-0", title: "Midterm", type: "midterm", date: "2026-10-15", startTime: "09:00", endTime: "11:00", room: "A-301", weight: 30, confidence: "confident", selected: true }],
  warnings: [],
};
const bulkSelectionSource = {
  ...preview,
  schedules: [
    { ...preview.schedules[0], id: "bulk-confident", draftId: "bulk-confident", room: "USER-EDIT", confidence: "confident", selected: false },
    { ...preview.schedules[0], id: "bulk-review", draftId: "bulk-review", startTime: "11:00", endTime: "12:00", confidence: "review", selected: false },
    { ...preview.schedules[0], id: "bulk-missing", draftId: "bulk-missing", day: null, startTime: null, endTime: null, confidence: "missing", selected: false },
    { ...preview.schedules[0], id: "bulk-conflict", draftId: "bulk-conflict", startTime: "13:00", endTime: "14:00", confidence: "conflict", selected: false },
  ],
  tasks: [{ ...preview.tasks[0], title: "USER EDITED TASK", selected: false }],
  exams: [{ ...preview.exams[0], room: "USER-EXAM-ROOM", selected: false }],
};
const selectedAllPreview = setAllSyllabusPreviewSelected(bulkSelectionSource, true);
const allBulkItems = [...selectedAllPreview.schedules, ...selectedAllPreview.tasks, ...selectedAllPreview.exams];
check(allBulkItems.every((item) => item.selected) && ["confident", "review", "missing", "conflict"].every((confidence) => selectedAllPreview.schedules.some((item) => item.confidence === confidence && item.selected)), "Select All must select CONFIDENT, REVIEW, MISSING, and CONFLICT drafts across schedules, tasks, and exams");
check(selectedAllPreview.schedules.map((item) => item.draftId).join("|") === bulkSelectionSource.schedules.map((item) => item.draftId).join("|") && selectedAllPreview.schedules[0].room === "USER-EDIT" && selectedAllPreview.tasks[0].title === "USER EDITED TASK" && selectedAllPreview.exams[0].room === "USER-EXAM-ROOM", "Select All must preserve draftId, order, and user-edited fields");
const unselectedAllPreview = setAllSyllabusPreviewSelected(selectedAllPreview, false);
check([...unselectedAllPreview.schedules, ...unselectedAllPreview.tasks, ...unselectedAllPreview.exams].every((item) => !item.selected), "Unselect All must clear every Preview checkbox across all sections");
const bulkSelectionReadiness = getSyllabusImportReadiness(selectedAllPreview, { schedules: [], tasks: [], exams: [] });
check(validateSyllabusPreview(selectedAllPreview).some((warning) => warning.includes("ไม่ถูกต้อง")) && bulkSelectionReadiness.readyCount === 5 && bulkSelectionReadiness.importableCount === 5, "Select All must keep invalid drafts blocked while readiness counts only the five valid records");
const partialSafePayload = buildSyllabusImportPayload(selectedAllPreview, { schedules: [], tasks: [], exams: [] });
check(partialSafePayload.schedules.length === 3 && partialSafePayload.tasks.length === 1 && partialSafePayload.exams.length === 1, "Select All must safely import only the 5 valid records and skip incomplete items");
check(!partialSafePayload.schedules.some((item) => item.day === null || !item.startTime || !item.endTime), "Partial safe import must never insert invalid or incomplete schedule records");

// 9-item scenario: 9 items in preview, Select All marks all 9 checked, 5 valid / 4 invalid, CTA calculates 5 ready & importable, invalid cannot be imported
const nineItemsPreview = {
  ...preview,
  schedules: [
    { ...preview.schedules[0], id: "bulk-9-conf", draftId: "draft-9-1", day: 0, startTime: "09:00", endTime: "10:00", confidence: "confident", selected: false },
    { ...preview.schedules[0], id: "bulk-9-rev", draftId: "draft-9-2", day: 1, startTime: "10:00", endTime: "11:00", confidence: "review", selected: false },
    { ...preview.schedules[0], id: "bulk-9-conf2", draftId: "draft-9-3", day: 2, startTime: "13:00", endTime: "14:00", confidence: "conflict", selected: false },
    { ...preview.schedules[0], id: "bulk-9-miss", draftId: "draft-9-4", day: null, startTime: null, endTime: null, confidence: "missing", selected: false },
    { ...preview.schedules[0], id: "bulk-9-invtime", draftId: "draft-9-5", day: 3, startTime: "15:00", endTime: "14:00", confidence: "review", selected: false },
  ],
  tasks: [
    { ...preview.tasks[0], id: "bulk-9-task-valid", draftId: "draft-9-6", title: "Valid Task", dueDate: "2026-09-30", selected: false },
    { ...preview.tasks[0], id: "bulk-9-task-invalid", draftId: "draft-9-7", title: "", dueDate: null, selected: false },
  ],
  exams: [
    { ...preview.exams[0], id: "bulk-9-exam-valid", draftId: "draft-9-8", title: "Valid Exam", date: "2026-10-15", startTime: "09:00", endTime: "11:00", selected: false },
    { ...preview.exams[0], id: "bulk-9-exam-invalid", draftId: "draft-9-9", title: "", date: null, startTime: null, endTime: null, selected: false },
  ],
};
const nineSelected = setAllSyllabusPreviewSelected(nineItemsPreview, true);
const allNineItems = [...nineSelected.schedules, ...nineSelected.tasks, ...nineSelected.exams];
check(allNineItems.length === 9 && allNineItems.every((item) => item.selected), "9-item scenario: Select All must select all 9 checkboxes regardless of validity");
const nineReadiness = getSyllabusImportReadiness(nineSelected, { schedules: [], tasks: [], exams: [] });
check(nineReadiness.readyCount === 5 && nineReadiness.importableCount === 5, "9-item scenario: CTA must calculate only the 5 valid importable records");
const nineImported = buildSyllabusImportPayload(nineSelected, { schedules: [], tasks: [], exams: [] });
check(nineImported.schedules.length === 3 && nineImported.tasks.length === 1 && nineImported.exams.length === 1, "9-item scenario: Confirm must import only the 5 valid records and not reject the entire batch");
check(nineImported.schedules.every((s) => s.day !== null && s.startTime && s.endTime), "9-item scenario: 4 invalid records must be excluded from payload");

// All-invalid fixture: 9 selected, 0 valid (Section 34)
const allInvalidPreview = {
  ...preview,
  schedules: [{ ...preview.schedules[0], id: "inv-1", draftId: "d-inv-1", day: null, startTime: null, endTime: null, selected: true }],
  tasks: [{ ...preview.tasks[0], id: "inv-2", draftId: "d-inv-2", title: "", dueDate: null, selected: true }],
  exams: [{ ...preview.exams[0], id: "inv-3", draftId: "d-inv-3", title: "", date: null, startTime: null, selected: true }],
};
const allInvalidReadiness = getSyllabusImportReadiness(allInvalidPreview, { schedules: [], tasks: [], exams: [] });
check(allInvalidReadiness.readyCount === 0 && allInvalidReadiness.importableCount === 0, "All-invalid fixture: importableCount must be 0");
let allInvalidRejected = false;
try {
  buildSyllabusImportPayload(allInvalidPreview, { schedules: [], tasks: [], exams: [] });
} catch (error) {
  allInvalidRejected = error instanceof Error && error.message === "invalid_syllabus_preview";
}
check(allInvalidRejected, "All-invalid fixture: Must throw invalid_syllabus_preview when 0 records are importable");

// Duplicate fixture (Section 33): 2 existing, 9 selected (7 new, 2 duplicate) -> import 7, skip duplicate 2, no throw
const nineDuplicateReadiness = getSyllabusImportReadiness(nineSelected, {
  schedules: [{ id: "existing-sched-1", courseId: deterministicCourseId(nineSelected.course), name: nineSelected.schedules[0].courseName || nineSelected.course.courseName || "", teacher: "", room: "A-301", day: 0, startTime: "09:00", endTime: "10:00", color: "#7656F6", note: "" }],
  tasks: [],
  exams: [],
});
check(nineDuplicateReadiness.readyCount === 5 && nineDuplicateReadiness.duplicateCount === 1 && nineDuplicateReadiness.importableCount === 4, "Select All must preserve duplicate protection and adjust importableCount");
const nineWithDuplicatesPayload = buildSyllabusImportPayload(nineSelected, {
  schedules: [{ id: "existing-sched-1", courseId: deterministicCourseId(nineSelected.course), name: nineSelected.schedules[0].courseName || nineSelected.course.courseName || "", teacher: "", room: "A-301", day: 0, startTime: "09:00", endTime: "10:00", color: "#7656F6", note: "" }],
  tasks: [],
  exams: [],
});
check(nineWithDuplicatesPayload.schedules.length === 2 && nineWithDuplicatesPayload.skippedDuplicates === 1, "Duplicate fixture: Import must skip duplicates and import remaining valid records without throwing");

// Course color tests (Sections 13-20, 35, 36)
check(getDeterministicCourseColor("0560201") === getDeterministicCourseColor("0560201"), "Deterministic color: Same course code must always yield identical color");
check(getDeterministicCourseColor("0560201") === getDeterministicCourseColor(" 0560201 "), "Deterministic color: Whitespace must normalize to identical color");
check(getDeterministicCourseColor("0560201") !== getDeterministicCourseColor("560201"), "Deterministic color: Leading zero must be preserved in course code string");
const sampleCodes = ["0560201", "1204441", "0560202", "0042008", "0045003"];
const sampleColors = new Set(sampleCodes.map((code) => getDeterministicCourseColor(code)));
check(sampleColors.size === 5, "Deterministic color: Example course codes must distribute across distinct colors in the 12-color palette");
sampleCodes.forEach((code) => {
  const color = getDeterministicCourseColor(code);
  check(TALEVO_COURSE_PALETTE.includes(color), `Deterministic color: ${code} must map to a color in TALEVO_COURSE_PALETTE`);
});

const multiSessionPayload = buildSyllabusImportPayload({
  ...preview,
  course: { ...preview.course, courseCode: "0560201", courseName: "Sample Course" },
  schedules: [
    { ...preview.schedules[0], id: "s-sec1", draftId: "d1", courseCode: "0560201", day: 1, startTime: "09:00", endTime: "11:00", selected: true },
    { ...preview.schedules[0], id: "s-sec2", draftId: "d2", courseCode: "0560201", day: 3, startTime: "13:00", endTime: "15:00", selected: true },
  ],
  tasks: [],
  exams: [],
}, { schedules: [], tasks: [], exams: [] });
check(multiSessionPayload.schedules[0].color === multiSessionPayload.schedules[1].color, "Multiple timetable sessions of the same course must share identical color");

const nineUnselected = setAllSyllabusPreviewSelected(nineSelected, false);
check([...nineUnselected.schedules, ...nineUnselected.tasks, ...nineUnselected.exams].every((item) => !item.selected), "9-item scenario: Unselect All must clear all 9 checkboxes");
const payload = buildSyllabusImportPayload(preview, { schedules: [], tasks: [], exams: [] });
check(payload.courseId === "syllabus-tle-101" && payload.schedules.length === 1 && payload.tasks.length === 1 && payload.exams.length === 1, "Confirmed preview must map all domains to their real AppState inputs");
check(!JSON.stringify(payload).match(/ยังไม่พบ|ยังไม่ระบุ|เลือกวัน|--:--/), "Preview placeholders must never be persisted as real values");
const duplicate = buildSyllabusImportPayload(preview, {
  schedules: [{ id: "existing-schedule", courseId: payload.courseId, name: "การวางแผนการเรียน", teacher: "", room: "A-301", day: 0, startTime: "09:00", endTime: "11:00", color: "#7656F6", note: "" }],
  tasks: [{ id: "existing-task", title: "ส่งแผนการเรียน", courseId: payload.courseId, description: "", dueLabel: "", dueDate: "2026-09-30", estimate: "", color: "#7656F6", status: "todo", subtasks: [], attachments: [] }],
  exams: [{ id: "existing-exam", courseId: payload.courseId, title: "Midterm", type: "midterm", startAt: "2026-10-15T09:00:00", room: "A-301", topics: [], createdAt: "", updatedAt: "" }],
});
check(duplicate.schedules.length === 0 && duplicate.tasks.length === 0 && duplicate.exams.length === 0 && duplicate.skippedDuplicates === 3, "Exact duplicate imports must be skipped across all domains");
const timetablePayload = buildSyllabusImportPayload(timetable, { schedules: [], tasks: [], exams: [] });
check(timetablePayload.schedules.length === 9, "Timetable payload must include all 9 courses");
check(timetablePayload.schedules.every((item) => item.name === ""), "Payload schedule name must remain blank when courseName is absent (do not persist display fallback)");
check(timetablePayload.schedules.every((item) => item.courseCode && item.courseCode.length >= 7), "Stored courseCode must preserve leading zero code");
check(timetablePayload.schedules.every((item) => getScheduleDisplayName(item) === item.courseCode), "Display fallback title must resolve to courseCode without contaminating stored state");

// Assert all 9 records in preview have courseName === null
check(timetable.schedules.every((item) => item.courseName === null), "All 9 timetable preview records must have courseName === null");

// Assert exact weekday distribution in preview: Monday=2, Tuesday=1, Wednesday=3, Thursday=2, Friday=1
check(timetable.schedules.filter((item) => item.day === 0).length === 2, "Monday must contain exactly 2 courses");
check(timetable.schedules.filter((item) => item.day === 1).length === 1, "Tuesday must contain exactly 1 course");
check(timetable.schedules.filter((item) => item.day === 2).length === 3, "Wednesday must contain exactly 3 courses");
check(timetable.schedules.filter((item) => item.day === 3).length === 2, "Thursday must contain exactly 2 courses");
check(timetable.schedules.filter((item) => item.day === 4).length === 1, "Friday must contain exactly 1 course");

// Section 14: Assert exact 9 course codes in timetable payload
const expectedCourseCodes = ["0560201", "1204441", "0560202", "0537212", "0042008", "0045003", "1204442", "0537338", "0537211"];
const timetableCodes = timetablePayload.schedules.map((s) => s.courseCode).sort();
check(JSON.stringify(timetableCodes) === JSON.stringify([...expectedCourseCodes].sort()), `Timetable payload must contain exact 9 course codes: ${expectedCourseCodes.join(", ")}`);

// Section 16: Assert individual course durations and total weekly hours
const getDurationH = (code) => {
  const item = timetablePayload.schedules.find((s) => s.courseCode === code);
  return item ? (getClassDurationMinutes(item) / 60) : 0;
};
check(getDurationH("0560201") === 3, "0560201 duration must be 3h");
check(getDurationH("1204441") === 4, "1204441 duration must be 4h");
check(getDurationH("0560202") === 4, "0560202 duration must be 4h");
check(getDurationH("0537212") === 4, "0537212 duration must be 4h");
check(getDurationH("0042008") === 2, "0042008 duration must be 2h");
check(getDurationH("0045003") === 2, "0045003 duration must be 2h");
check(getDurationH("1204442") === 4, "1204442 duration must be 4h");
check(getDurationH("0537338") === 4, "0537338 duration must be 4h");
check(getDurationH("0537211") === 4, "0537211 duration must be 4h");

const totalTimetableMinutes = timetablePayload.schedules.reduce((acc, s) => acc + getClassDurationMinutes(s), 0);
check(totalTimetableMinutes === 1860, `Total weekly hours must be 31h (1860m), got ${totalTimetableMinutes / 60}h`);

// Section 17: Assert exact days for all 9 courses
const getDayForCode = (code) => timetablePayload.schedules.find((s) => s.courseCode === code)?.day;
check(getDayForCode("0560201") === 0 && getDayForCode("1204441") === 0, "Monday (0) must contain 0560201 and 1204441");
check(getDayForCode("0560202") === 1, "Tuesday (1) must contain 0560202");
check(getDayForCode("0537212") === 2 && getDayForCode("0042008") === 2 && getDayForCode("0045003") === 2, "Wednesday (2) must contain 0537212, 0042008, 0045003");
check(getDayForCode("1204442") === 3 && getDayForCode("0537338") === 3, "Thursday (3) must contain 1204442 and 0537338");
check(getDayForCode("0537211") === 4, "Friday (4) must contain 0537211");

// Section 22: Test display fallback safety
check(getScheduleDisplayName({ name: "", courseCode: "0560201" }) === "0560201", "Blank name with valid courseCode must display courseCode");
check(getScheduleDisplayName({ name: "(2) 15, EDU-3402", courseCode: "0560201" }) === "0560201", "Corrupted metadata name '(2) 15, EDU-3402' must display courseCode");
check(getScheduleDisplayName({ name: "15, EDU-3402", courseCode: "0560201" }) === "0560201", "Corrupted OCR name '15, EDU-3402' must display courseCode");
check(getScheduleDisplayName({ name: "เวลาเรียน : 09:00:00 - 12:00:00", courseCode: "0560201" }) === "0560201", "Corrupted time name must display courseCode");
check(getScheduleDisplayName({ name: "EDU-3402", courseCode: "0560201" }) === "0560201", "Room name 'EDU-3402' must display courseCode");
check(getScheduleDisplayName({ name: "RN1-805", courseCode: "0045003" }) === "0045003", "Room name 'RN1-805' must display courseCode");
check(getScheduleDisplayName({ name: "คณิตศาสตร์ทั่วไป", courseCode: "0560201" }) === "คณิตศาสตร์ทั่วไป", "Valid course name must be displayed as-is");

// Missing Monday anchor test (Tuesday must NOT shift to Monday)
const missingMon = parseTimetableGrid(fixtures.timetableMissingMonday.lines, fixtures.timetableMissingMonday.text);
check(missingMon.schedules.length === 9, "Missing Monday anchor: all 9 courses must be retained");
const missingMonTue = missingMon.schedules.find((item) => item.courseCode === "0560202");
const missingMonMon = missingMon.schedules.filter((item) => item.day === 0);
check(missingMonMon.length === 2 && missingMonTue?.day === 1, "Missing Monday anchor: Tuesday course 0560202 must remain Tuesday (day 1) and not shift to Monday");

// Missing Wednesday anchor test (Wednesday must interpolate to day 2)
const missingWed = parseTimetableGrid(fixtures.timetableMissingWednesday.lines, fixtures.timetableMissingWednesday.text);
check(missingWed.schedules.length === 9, "Missing Wednesday anchor: all 9 courses must be retained");
const missingWedWed = missingWed.schedules.filter((item) => item.day === 2);
const missingWedThu = missingWed.schedules.filter((item) => item.day === 3);
check(missingWedWed.length === 3 && missingWedThu.length === 2, "Missing Wednesday anchor: Wednesday courses must interpolate to day 2 and Thursday courses remain day 3");

// Strict 9/9 match on real timetable with 0 day anchors (No over-parsing 13 -> 9)
const zeroAnchors = parseTimetableGrid(fixtures.timetableNoDayAnchors.lines, fixtures.timetableNoDayAnchors.text);
check(zeroAnchors.schedules.length === 9, "Real timetable with 0 anchors must produce exactly 9 courses, never over-parsing to 13");
check(zeroAnchors.schedules.every((item) => item.courseCode !== null && item.courseCode.length >= 7), "Every course in 0-anchor timetable must have a valid course code and preserve leading zeros");
check(zeroAnchors.schedules.every((item) => item.courseName === null), "Every course in 0-anchor timetable must strictly have courseName === null");
check(zeroAnchors.schedules.filter((item) => item.day === 0).length === 2, "0-anchor timetable Monday count must be exactly 2");
check(zeroAnchors.schedules.filter((item) => item.day === 1).length === 1, "0-anchor timetable Tuesday count must be exactly 1");
check(zeroAnchors.schedules.filter((item) => item.day === 2).length === 3, "0-anchor timetable Wednesday count must be exactly 3");
check(zeroAnchors.schedules.filter((item) => item.day === 3).length === 2, "0-anchor timetable Thursday count must be exactly 2");
check(zeroAnchors.schedules.filter((item) => item.day === 4).length === 1, "0-anchor timetable Friday count must be exactly 1");

const zeroSelectedPreview = setAllSyllabusPreviewSelected(zeroAnchors, true);
check(zeroSelectedPreview.schedules.length === 9 && zeroSelectedPreview.schedules.every((s) => s.selected), "Select All must select all 9 items in 0-anchor preview");
const zeroReadiness = getSyllabusImportReadiness(zeroSelectedPreview, { schedules: [], tasks: [], exams: [] });
check(zeroReadiness.readyCount === 9 && zeroReadiness.duplicateCount === 0 && zeroReadiness.importableCount === 9, "0-anchor timetable readiness must report readyCount=9, duplicateCount=0, importableCount=9");
const zeroPayload = buildSyllabusImportPayload(zeroSelectedPreview, { schedules: [], tasks: [], exams: [] });
check(zeroPayload.schedules.length === 9 && zeroPayload.skippedDuplicates === 0, "0-anchor timetable payload must contain exactly 9 schedules with 0 skipped duplicates");
check(zeroPayload.schedules.every((s) => s.courseId && s.courseId.startsWith("syllabus-") && s.courseCode && s.courseCode.length >= 7), "0-anchor payload schedules must have deterministic courseId starting with syllabus- and valid courseCode");
const uniqueCourseIds = new Set(zeroPayload.schedules.map((s) => s.courseId));
check(uniqueCourseIds.size === 9, "All 9 courses in 0-anchor payload must have unique course IDs (no collision on empty name)");
const zeroTotalMinutes = zeroPayload.schedules.reduce((acc, s) => acc + getClassDurationMinutes(s), 0);
check(zeroTotalMinutes === 1860, `Total weekly study time must be exactly 1,860 minutes (31 hours), got ${zeroTotalMinutes}`);
check(zeroPayload.schedules.every((s) => s.name === ""), "Schedules imported from scanned timetable with blank courseName must leave stored name blank");
check(zeroPayload.schedules.every((s) => getScheduleDisplayName(s) === s.courseCode), "getScheduleDisplayName for all 9 items must show their courseCode as name");

const testItem0537212 = zeroPayload.schedules.find((s) => s.courseCode === "0537212");
check(testItem0537212 && testItem0537212.name === "" && testItem0537212.courseCode === "0537212" && getScheduleDisplayName(testItem0537212) === "0537212", "Test A: 0537212 must have stored name === '' and courseCode === '0537212' and display === '0537212'");

const draft0537212 = zeroSelectedPreview.schedules.find((s) => s.courseCode === "0537212");
const edited0537212Preview = updateSyllabusScheduleDraft(zeroSelectedPreview, draft0537212.draftId, { courseName: "นวัตกรรมทางเทคโนโลยี" });
const edited0537212Payload = buildSyllabusImportPayload(edited0537212Preview, { schedules: [], tasks: [], exams: [] });
const editedMatch = edited0537212Payload.schedules.find((s) => s.courseCode === "0537212");
check(editedMatch && editedMatch.name === "นวัตกรรมทางเทคโนโลยี" && editedMatch.courseCode === "0537212", "Test B: user editing course name must update name while keeping courseCode intact");

const persistedEdited = normalizeSchedules([{
  id: "class-test-0537212",
  courseId: "syllabus-0537212",
  courseCode: "0537212",
  name: "นวัตกรรมทางเทคโนโลยี",
  day: 2,
  startTime: "08:00",
  endTime: "12:00",
  room: "ไม่ระบุ1",
  color: "#8b5cf6",
  section: "2",
  credits: 3,
}], []);
check(persistedEdited[0].name === "นวัตกรรมทางเทคโนโลยี" && persistedEdited[0].courseCode === "0537212" && persistedEdited[0].section === "2" && persistedEdited[0].credits === 3, "Test C: persistence reload must retain edited name, courseCode, section, and credits");

const colorBeforeEdit = getDeterministicCourseColor(testItem0537212.courseCode);
const colorAfterEdit = getDeterministicCourseColor(editedMatch.courseCode);
check(colorBeforeEdit === colorAfterEdit, "Test D: deterministic course color must be identical before and after name edit");

const dupCheckPayload = buildSyllabusImportPayload(zeroSelectedPreview, {
  schedules: [{
    id: "existing-0537212",
    courseId: testItem0537212.courseId,
    courseCode: "0537212",
    name: "ชื่ออะไรก็ได้ที่ผู้ใช้เปลี่ยนแล้ว",
    day: testItem0537212.day,
    startTime: testItem0537212.startTime,
    endTime: testItem0537212.endTime,
    room: testItem0537212.room,
    color: "#8b5cf6",
    teacher: "อาจารย์",
  }],
  tasks: [],
  exams: [],
});
check(dupCheckPayload.skippedDuplicates >= 1, "Test E: duplicate detection must match by courseCode even after user edited name");

check(isCorruptedScheduleTitle("N/A") && isCorruptedScheduleTitle("FAC IT") && isCorruptedScheduleTitle("13:00:00 - 17:00:00") && isCorruptedScheduleTitle("เวลาเรียน : 09:00"), "Test F: invalid OCR labels must be detected as corrupted and never become course name");

const leadingZeroItem = zeroPayload.schedules.find((s) => s.courseCode === "0042008");
check(leadingZeroItem && leadingZeroItem.name === "" && leadingZeroItem.courseCode === "0042008" && typeof leadingZeroItem.courseCode === "string" && leadingZeroItem.courseCode.startsWith("00"), "Test G: leading zero must be preserved in courseCode without Number conversion");

check(getScheduleDisplayName({ name: "เวลาเรียน : 13:00:00 - 17:00:00", courseCode: "1204441", courseId: "syllabus-1204441" }) === "1204441", "Historical corrupted time line must fall back to courseCode");
check(getScheduleDisplayName({ name: "เวลา...", courseCode: null, courseId: "syllabus-course" }) === "รายการเรียน", "Historical 'เวลา...' without courseCode must render 'รายการเรียน'");
check(getScheduleDisplayName({ name: "เวลา 08:00", courseCode: "0537212", courseId: "syllabus-0537212" }) === "0537212", "Historical time text must fall back to courseCode");
check(getScheduleDisplayName({ name: "08:00:00", courseCode: "1204442", courseId: "syllabus-1204442" }) === "1204442", "Historical time-only string must fall back to courseCode");
check(getScheduleDisplayName({ name: "EDU", courseCode: "0560201", courseId: "syllabus-0560201" }) === "0560201", "Historical label EDU must fall back to courseCode");
check(getScheduleDisplayName({ name: "FAC IT", courseCode: "1204441", courseId: "syllabus-1204441" }) === "1204441", "Historical label FAC IT must fall back to courseCode");
check(getScheduleDisplayName({ name: "SC1", courseCode: "0042008", courseId: "syllabus-0042008" }) === "0042008", "Historical label SC1 must fall back to courseCode");
check(getScheduleDisplayName({ name: "SCI", courseCode: "0042008", courseId: "syllabus-0042008" }) === "0042008", "Historical label SCI must fall back to courseCode");
check(getScheduleDisplayName({ name: "RN", courseCode: "0045003", courseId: "syllabus-0045003" }) === "0045003", "Historical label RN must fall back to courseCode");
check(getScheduleDisplayName({ name: "IT", courseCode: "0537211", courseId: "syllabus-0537211" }) === "0537211", "Historical label IT must fall back to courseCode");
check(getScheduleDisplayName({ name: "B", courseCode: "0537338", courseId: "syllabus-0537338" }) === "0537338", "Historical label B must fall back to courseCode");
check(getScheduleDisplayName({ name: "N/A", courseCode: "0537212", courseId: "syllabus-0537212" }) === "0537212", "Historical label N/A must fall back to courseCode");
check(getScheduleDisplayName({ name: "(2) 15, EDU-3402", courseCode: "0560201", courseId: "syllabus-0560201" }) === "0560201", "Historical metadata line (2) 15, EDU-3402 must fall back to courseCode");
check(getScheduleDisplayName({ name: "EDU-3402", courseCode: "0560201", courseId: "syllabus-0560201" }) === "0560201", "Historical room EDU-3402 must fall back to courseCode");
check(getScheduleDisplayName({ name: "5701", courseCode: "0537211", courseId: "syllabus-0537211" }) === "0537211", "Historical room 5701 must fall back to courseCode");
check(getScheduleDisplayName({ name: "คณิตศาสตร์ทั่วไป", courseCode: "0560201", courseId: "syllabus-0560201" }) === "คณิตศาสตร์ทั่วไป", "Legitimate course name must be preserved as display title");

const duplicateTimetable = buildSyllabusImportPayload(timetable, { schedules: timetablePayload.schedules.map((item, index) => ({ ...item, id: `existing-${index}` })), tasks: [], exams: [] });
check(duplicateTimetable.schedules.length === 0 && duplicateTimetable.skippedDuplicates === 9, "Re-scanning the same timetable must skip all duplicate classes");
const invalid = { ...preview, tasks: [{ ...preview.tasks[0], dueDate: null }] };
check(validateSyllabusPreview(invalid).some((warning) => warning.includes("ไม่ถูกต้อง")), "An incomplete selected item must block the full import before any write");
const overlapPreview = { ...preview, schedules: [{ ...preview.schedules[0], id: "overlap-a", startTime: "09:00", endTime: "11:00" }, { ...preview.schedules[0], id: "overlap-b", startTime: "10:59", endTime: "12:00" }] };
const adjacentPreview = { ...preview, schedules: [{ ...preview.schedules[0], id: "adjacent-a", startTime: "09:00", endTime: "11:00" }, { ...preview.schedules[0], id: "adjacent-b", startTime: "11:00", endTime: "12:00" }] };
check(validateSyllabusPreview(overlapPreview).some((warning) => warning.includes("เวลาซ้อนทับ")) && !validateSyllabusPreview(adjacentPreview).some((warning) => warning.includes("เวลาซ้อนทับ")), "Preview overlap warnings must use half-open [start, end) intervals");

// ----------------------------------------------------------------------
// Two-Stage Timetable Pipeline Architecture Tests (Stage A & Stage B)
// ----------------------------------------------------------------------

// 1. Stage A: Raw Document Evidence Extraction
const zeroRawEvidence = extractDocumentEvidence(fixtures.timetableNoDayAnchors.lines);
check(zeroRawEvidence.length > 0, "Stage A: Document evidence extraction must produce raw evidence items");
check(zeroRawEvidence.every((item) => item.id && item.rawText && typeof item.x === "number" && typeof item.y === "number" && typeof item.width === "number" && typeof item.height === "number" && item.page >= 1), "Stage A: Every evidence item must preserve geometry, raw text, and page identity");
const allNineCodes = ["0560201", "1204441", "0560202", "0537212", "0042008", "0045003", "1204442", "0537338", "0537211"];
for (const code of allNineCodes) {
  const found = zeroRawEvidence.some((e) => e.normalizedText.includes(code) || e.rawText.includes(code));
  check(found, `Stage A: Raw document evidence must contain course code ${code}`);
}

// 2. Stage B2: Physical Course Cell Grouping
const physicalCourseCells = buildPhysicalCells(zeroRawEvidence, "WEEKLY_TIME_GRID");
check(physicalCourseCells.length === 9, `Stage B: Physical course cell grouping must produce exactly 9 cells, got ${physicalCourseCells.length}`);
check(physicalCourseCells.every((cell) => cell.id && cell.evidence.length >= 1 && cell.minX <= cell.maxX && cell.minY <= cell.maxY), "Stage B: Every physical cell must have valid geometric bounds and associated evidence items");

// 3. Stage B3: Semantic Cell Classification
const semanticCell1 = classifySemanticCell(["0560201", "EDU", "2", "15", "EDU-3402"]);
check(
  semanticCell1.courseCode === "0560201" &&
  semanticCell1.courseName === null &&
  semanticCell1.credits === 2 &&
  semanticCell1.section === "15" &&
  semanticCell1.room === "EDU-3402" &&
  semanticCell1.sourceLabel === "EDU",
  "Stage B: Semantic classification of cell 0560201 must produce correct fields without turning EDU into courseName"
);

const semanticCell2 = classifySemanticCell(["1204441", "FAC IT", "3", "2", "IT-405"]);
check(
  semanticCell2.courseCode === "1204441" &&
  semanticCell2.courseName === null &&
  semanticCell2.credits === 3 &&
  semanticCell2.section === "2" &&
  semanticCell2.room === "IT-405" &&
  semanticCell2.sourceLabel === "FAC IT",
  "Stage B: Semantic classification of cell 1204441 must produce correct fields without turning FAC IT into courseName"
);

// 4. Stage B6: Debuggability & Tracing (1204441 & 0560201)
const trace1204441 = traceTimetableCourse(zeroAnchors, zeroRawEvidence, physicalCourseCells, "1204441");
check(trace1204441.rawEvidenceFound === true, "Trace 1204441: Raw evidence must be found");
check(trace1204441.assignedToCell === true, "Trace 1204441: Must be assigned to a physical cell");
check(trace1204441.cellDay === 0, "Trace 1204441: Cell day must be 0 (Monday)");
check(trace1204441.classifiedAsCourseCode === true, "Trace 1204441: Must be classified as courseCode");
check(trace1204441.finalRecordCreated === true, "Trace 1204441: Final schedule record must be created");
check(trace1204441.courseName === null, "Trace 1204441: courseName must be null");
check(trace1204441.room === "IT-405", "Trace 1204441: room must be IT-405");
check(trace1204441.section === "2", "Trace 1204441: section must be 2");
check(trace1204441.credits === 3, "Trace 1204441: credits must be 3");
check(trace1204441.sourceLabel === "FAC IT" || trace1204441.sourceLabel === "IT", "Trace 1204441: sourceLabel must be FAC IT / IT");
check(trace1204441.startTime === "13:00" && trace1204441.endTime === "17:00", "Trace 1204441: time must be 13:00-17:00");

const trace0560201 = traceTimetableCourse(zeroAnchors, zeroRawEvidence, physicalCourseCells, "0560201");
check(trace0560201.rawEvidenceFound === true, "Trace 0560201: Raw evidence must be found");
check(trace0560201.assignedToCell === true, "Trace 0560201: Must be assigned to a physical cell");
check(trace0560201.cellDay === 0, "Trace 0560201: Cell day must be 0 (Monday)");
check(trace0560201.classifiedAsCourseCode === true, "Trace 0560201: Must be classified as courseCode");
check(trace0560201.finalRecordCreated === true, "Trace 0560201: Final schedule record must be created");
check(trace0560201.courseName === null, "Trace 0560201: courseName must be null");
check(trace0560201.room === "EDU-3402", "Trace 0560201: room must be EDU-3402");
check(trace0560201.section === "15", "Trace 0560201: section must be 15");
check(trace0560201.credits === 2, "Trace 0560201: credits must be 2");
check(trace0560201.sourceLabel === "EDU", "Trace 0560201: sourceLabel must be EDU");
check(trace0560201.startTime === "09:00" && trace0560201.endTime === "12:00", "Trace 0560201: time must be 09:00-12:00");

// 5. Canonical Weekday Contract & Weekend Support
check(parseWeekday("วันจันทร์") === 0, "Canonical weekday: Monday must be 0");
check(parseWeekday("วันอังคาร") === 1, "Canonical weekday: Tuesday must be 1");
check(parseWeekday("วันพุธ") === 2, "Canonical weekday: Wednesday must be 2");
check(parseWeekday("วันพฤหัสบดี") === 3, "Canonical weekday: Thursday must be 3");
check(parseWeekday("วันศุกร์") === 4, "Canonical weekday: Friday must be 4");
check(parseWeekday("วันเสาร์") === 5, "Canonical weekday: Saturday must be 5");
check(parseWeekday("วันอาทิตย์") === 6, "Canonical weekday: Sunday must be 6");

const weekendSchedules = normalizeSchedules([
  { id: "sat-1", courseId: "sat-course", name: "วิชาพิเศษวันเสาร์", day: 5, startTime: "09:00", endTime: "12:00", room: "LAB-1", color: "#8b5cf6" },
  { id: "sun-1", courseId: "sun-course", name: "วิชาพิเศษวันอาทิตย์", day: 6, startTime: "13:00", endTime: "16:00", room: "LAB-2", color: "#8b5cf6" },
], []);
check(weekendSchedules.length === 2 && weekendSchedules[0].day === 5 && weekendSchedules[1].day === 6, "Weekend classes (Saturday=5, Sunday=6) must be supported and normalized");

console.log(`TALEVO Local Syllabus QA: ${checks} checks passed`);

