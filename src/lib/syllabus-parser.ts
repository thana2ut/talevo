import type { SyllabusExamItem, SyllabusPreview, SyllabusScheduleItem, SyllabusTaskItem } from "@/lib/syllabus-import";
import { parseAcademicTimeRange } from "@/lib/academic-time";

const weekdayPatterns: Array<[RegExp, number]> = [
  [/(?:วัน)?จันทร์|(?:^|\s)จ\.(?=\s|$)|\bmon(?:day)?\b/i, 0], [/(?:วัน)?อังคาร|\btue(?:sday)?\b/i, 1], [/(?:วัน)?พุธ|(?:^|\s)พ\.(?=\s|$)|\bwed(?:nesday)?\b/i, 2],
  [/(?:วัน)?พฤหัสบดี|(?:^|\s)พฤ\.(?=\s|$)|\bthu(?:rsday)?\b/i, 3], [/(?:วัน)?ศุกร์|(?:^|\s)ศ\.(?=\s|$)|\bfri(?:day)?\b/i, 4], [/(?:วัน)?เสาร์|\bsat(?:urday)?\b/i, 5], [/(?:วัน)?อาทิตย์|(?:^|\s)อา\.(?=\s|$)|\bsun(?:day)?\b/i, 6],
];
const monthMap: Record<string, number> = { "มกราคม": 1, "ม.ค.": 1, january: 1, jan: 1, "กุมภาพันธ์": 2, "ก.พ.": 2, february: 2, feb: 2, "มีนาคม": 3, "มี.ค.": 3, march: 3, mar: 3, "เมษายน": 4, "เม.ย.": 4, april: 4, apr: 4, "พฤษภาคม": 5, "พ.ค.": 5, may: 5, "มิถุนายน": 6, "มิ.ย.": 6, june: 6, jun: 6, "กรกฎาคม": 7, "ก.ค.": 7, july: 7, jul: 7, "สิงหาคม": 8, "ส.ค.": 8, august: 8, aug: 8, "กันยายน": 9, "ก.ย.": 9, september: 9, sep: 9, "ตุลาคม": 10, "ต.ค.": 10, october: 10, oct: 10, "พฤศจิกายน": 11, "พ.ย.": 11, november: 11, nov: 11, "ธันวาคม": 12, "ธ.ค.": 12, december: 12, dec: 12 };

export function normalizeSyllabusText(value: string) {
  return value.normalize("NFC").replace(/\u00a0/g, " ").replace(/[–—]/g, "-").replace(/[\t\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/[ \u200b]{2,}/g, " ").trim();
}
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const id = (kind: string, index: number) => `local-${kind}-${index + 1}`;
export function parseSyllabusDate(value: string) {
  const numeric = value.match(/(?:^|\D)(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?=\D|$)/); const named = value.match(/(?:^|\s)(\d{1,2})\s+([\p{L}\p{M}.]+)\s+(\d{4})(?=\s|$)/iu);
  const parts = numeric ? [numeric[1], numeric[2], numeric[3]] : named ? [named[1], String(monthMap[named[2].toLowerCase()] ?? 0), named[3]] : null;
  if (!parts) return null; let year = Number(parts[2]); const month = Number(parts[1]); const day = Number(parts[0]); if (year >= 2400 && year <= 2700) year -= 543;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null; const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}
function lineDay(value: string) { return weekdayPatterns.find(([pattern]) => pattern.test(value))?.[1] ?? null; }
function lineTimes(value: string) {
  const match = value.match(/(\d{1,2}(?:[.:]\d{1,2}(?::\d{1,2})?)?\s*(?:AM|PM)?)\s*(?:-|–|—|ถึง|to|~)\s*(\d{1,2}(?:[.:]\d{1,2}(?::\d{1,2})?)?\s*(?:AM|PM)?)/iu);
  const range = match ? parseAcademicTimeRange(`${match[1]}-${match[2]}`) : null;
  return range ? [range.startTime, range.endTime] as const : null;
}
function room(value: string) { return value.match(/(?:ห้อง|room)\s*([A-Z0-9-]{1,32})/i)?.[1] ?? null; }
function title(value: string) { return compact(value.replace(/^(?:งาน|การบ้าน|รายงาน|โครงงาน|กิจกรรม|assignment|homework|project|presentation|due|กำหนดส่ง|สอบ(?:กลางภาค|ปลายภาค|ย่อย|ปฏิบัติ)?|midterm|final|quiz)\s*[:\-]?\s*/i, "")).slice(0, 160); }
function pairedLine(lines: string[], index: number) { return [lines[index], lines[index + 1], lines[index + 2]].filter(Boolean).join(" "); }

export function parseLocalSyllabus(text: string): SyllabusPreview {
  const normalized = normalizeSyllabusText(text); const lines = normalized.split("\n").map(compact).filter(Boolean); const warnings: string[] = [];
  const courseCode = lines.join("\n").match(/(?:รหัสวิชา|course\s*code)\s*[:\-]?\s*([A-Z]{2,}\s*\d{3,}[A-Z0-9-]*)/i)?.[1]?.replace(/\s+/g, " ") ?? lines.find((line) => /^[A-Z]{2,}\s*\d{3,}[A-Z0-9-]*$/i.test(line))?.replace(/\s+/g, " ") ?? null;
  const courseName = lines.join("\n").match(/(?:ชื่อวิชา|course\s*(?:title|name))\s*[:\-]?\s*(.{3,})/i)?.[1]?.trim() ?? null;
  const instructor = lines.join("\n").match(/(?:อาจารย์(?:ผู้สอน)?|instructor|lecturer)\s*[:\-]?\s*(.{2,})/i)?.[1]?.trim() ?? null;
  const schedules: SyllabusScheduleItem[] = []; const tasks: SyllabusTaskItem[] = []; const exams: SyllabusExamItem[] = [];
  lines.forEach((line, index) => {
    const day = lineDay(line); const times = lineTimes(line); if (day !== null) { const draftId = id("schedule", schedules.length); schedules.push({ id: draftId, draftId, day, startTime: times?.[0] ?? null, endTime: times?.[1] ?? null, room: room(line), confidence: times ? "confident" : "missing", selected: Boolean(times) }); }
    const related = pairedLine(lines, index); const date = parseSyllabusDate(related); const timesForItem = lineTimes(related); const isExam = /สอบ|midterm|final|quiz|exam/i.test(line); const isTask = /งาน|การบ้าน|รายงาน|โครงงาน|กิจกรรม|assignment|homework|project|presentation|\bdue\b|กำหนดส่ง/i.test(line);
    if (isTask) { const draftId = id("task", tasks.length); const parsedTitle = title(line); tasks.push({ id: draftId, draftId, title: parsedTitle, dueDate: date, dueTime: timesForItem?.[0] ?? null, description: null, weight: null, confidence: date && parsedTitle ? "confident" : "missing", selected: Boolean(date && parsedTitle) }); }
    if (isExam) { const kind = /กลางภาค|midterm/i.test(line) ? "midterm" : /ปลายภาค|final/i.test(line) ? "final" : /quiz|สอบย่อย/i.test(line) ? "quiz" : /ปฏิบัติ/i.test(line) ? "practical" : "other"; const draftId = id("exam", exams.length); const parsedTitle = title(line); exams.push({ id: draftId, draftId, title: parsedTitle, type: kind, date, startTime: timesForItem?.[0] ?? null, endTime: timesForItem?.[1] ?? null, room: room(related), weight: null, confidence: date && timesForItem?.[0] && parsedTitle ? "confident" : "missing", selected: Boolean(date && timesForItem?.[0] && parsedTitle) }); }
  });
  if (!normalized) warnings.push("ยังไม่พบข้อความที่อ่านได้จากเอกสารนี้");
  if (!schedules.length && !tasks.length && !exams.length) warnings.push("ยังไม่พบข้อมูลตารางเรียน งาน หรือการสอบในเอกสารนี้");
  return { course: { courseCode, courseName, section: null, instructor, room: null, credits: null }, schedules, tasks, exams, warnings, sourceKind: "text" };
}
