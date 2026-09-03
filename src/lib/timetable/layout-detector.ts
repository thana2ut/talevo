import { findAcademicTimeRange } from "@/lib/academic-time";
import { extractCourseCodes } from "@/lib/timetable/cell-parser";
import { countExplicitDates } from "@/lib/timetable/date-parser";
import { adaptOcrLines, rectangularGeometryScore } from "@/lib/timetable/geometry";
import { normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import type { LayoutDetection, TimetableLayoutType } from "@/lib/timetable/types";
import { countWeekdays } from "@/lib/timetable/weekday-parser";
import type { SpatialOcrLine } from "@/lib/syllabus-scanner";

type Candidate = { type: TimetableLayoutType; score: number; evidence: string[] };
const score = (type: TimetableLayoutType, parts: Array<[boolean, number, string]>): Candidate => ({ type, score: parts.reduce((sum, [yes, points]) => sum + (yes ? points : 0), 0), evidence: parts.filter(([yes]) => yes).map(([, , label]) => label) });

export function classifyTimetableLayout(text: string, lines: SpatialOcrLine[] = []): LayoutDetection {
  const values = (lines.length ? lines.map((line) => line.text) : text.split(/\r?\n/)).map(normalizeTimetableText).filter(Boolean);
  const joined = values.join("\n");
  const nodes = adaptOcrLines(lines);
  const weekdayCount = countWeekdays(values);
  const hourlyHeaderCount = values.filter((value) => findAcademicTimeRange(value) !== null).length;
  const courseCodeCount = new Set(values.flatMap(extractCourseCodes)).size;
  const dateCount = countExplicitDates(values);
  const periodCount = new Set(values.flatMap((value) => { const match = value.match(/^(?:คาบ|period)?\s*(\d{1,2})$/iu); return match ? [Number(match[1])] : []; }).filter((value) => value >= 1 && value <= 20)).size;
  const subjectCount = values.filter((value) => /(?:ภาษาไทย|ภาษาอังกฤษ|คณิตศาสตร์|วิทยาศาสตร์|สังคมศึกษา|ประวัติศาสตร์|สุขศึกษา|พลศึกษา|ศิลปะ|ดนตรี|การงาน|เคมี|ฟิสิกส์|ชีววิทยา|คอมพิวเตอร์|ดาราศาสตร์|ทัศนศิลป์|เศรษฐศาสตร์|ภูมิศาสตร์|หน้าที่พลเมือง)/u.test(value)).length;
  const hasStudyTimeLabel = /เวลาเรียน|study\s*time/iu.test(joined);
  const examWords = /วันสอบ|เวลาสอบ|ตารางสอบ|สอบกลางภาค|สอบปลายภาค|exam/iu.test(joined);
  const eventWords = /กิจกรรม|ชุมนุม|แนะแนว|โฮมรูม|event|activity/iu.test(joined);
  const roomCount = values.filter((value) => /(?:ห้อง|online|arr-arr|[A-Z]{2,}\d*[- ]?\d{2,}[A-Z]?)/iu.test(value)).length;
  const geometry = rectangularGeometryScore(nodes) > 0;
  const candidates = [
    score("WEEKLY_TIME_GRID", [[weekdayCount >= 3, 3, "weekday anchors"], [hourlyHeaderCount >= 4, 3, "time headers"], [geometry, 1, "rectangular geometry"], [courseCodeCount >= 2, 2, "repeated course blocks"]]),
    score("PERIOD_GRID", [[periodCount >= 5, 4, "period headers"], [hourlyHeaderCount >= 4, 3, "period-time mapping"], [weekdayCount >= 3, 2, "weekday rows"], [geometry, 1, "rectangular geometry"]]),
    score("SCHOOL_SUBJECT_GRID", [[weekdayCount >= 3, 3, "weekday rows"], [subjectCount >= 3, 5, "school subjects"], [periodCount >= 3 || hourlyHeaderCount >= 3, 2, "column headers"], [geometry, 1, "rectangular geometry"]]),
    score("DATED_SCHEDULE_GRID", [[dateCount >= 3, 4, "explicit dates"], [hourlyHeaderCount >= 2, 2, "time ranges"], [subjectCount >= 2 || courseCodeCount >= 2, 2, "subjects/courses"], [geometry, 1, "row geometry"]]),
    score("DATED_EVENT_GRID", [[dateCount >= 2, 3, "explicit dates"], [eventWords, 4, "event labels"], [geometry, 1, "row geometry"]]),
    score("EXAM_GRID", [[dateCount >= 2, 3, "exam dates"], [examWords, 4, "exam labels"], [courseCodeCount >= 1, 2, "course codes"], [hourlyHeaderCount >= 1, 1, "exam time"]]),
    score("UNIVERSITY_BLOCK_GRID", [[weekdayCount >= 3, 2, "weekday rows"], [courseCodeCount >= 2, 3, "university course codes"], [roomCount >= 2, 2, "room labels"], [hourlyHeaderCount >= 2 || hasStudyTimeLabel, 2, "explicit block times"], [geometry, 1, "block geometry"]]),
  ].sort((a, b) => b.score - a.score);
  const best = candidates[0]; const runnerUp = candidates[1];
  const warnings: string[] = [];
  let type: TimetableLayoutType;
  if (!values.length) type = "UNKNOWN";
  else if (best.score < 6) type = "SYLLABUS_TEXT";
  else if (best.score - runnerUp.score < 1) { type = "UNKNOWN"; warnings.push("รูปแบบตารางมีหลักฐานใกล้เคียงกันหลายแบบ จึงหยุดให้ตรวจสอบแทนการเดา"); }
  else type = best.type;
  return { type, layout: type, score: best.score, evidence: best.evidence, warnings, weekdayCount, hourlyHeaderCount, courseCodeCount, hasStudyTimeLabel };
}
