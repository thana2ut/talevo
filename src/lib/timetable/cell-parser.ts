import { findAcademicTimeRange } from "@/lib/academic-time";
import { isBreakLabel, normalizeTimetableText } from "@/lib/timetable/text-normalizer";
import { parseWeekday } from "@/lib/timetable/weekday-parser";

const NUMERIC_CODE = /\b\d{6,8}\b/gu;
const THAI_CODE = /(?:^|\s)([ก-ฮ][0-9]{4,6})(?=\s|$|[,()])/gu;
const ALPHANUMERIC_CODE = /\b(?=[A-Z0-9-]{5,16}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\b/giu;

const SOURCE_LABEL_PATTERN = /^(?:N\/A|EDU|FAC\s*IT|SC\s*1|SCI?|RN|B|IT|[A-Z][A-Z0-9\s/-]{0,14})$/iu;

export function isTimeLine(value: string) {
  const text = normalizeTimetableText(value).trim();
  if (/(?:เวลา\s*เรียน|study\s*time)/iu.test(text)) return true;
  if (/^\s*(?:เวลา)?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\s*$/u.test(text)) return true;
  return false;
}

export function isMetadataLine(value: string) {
  return /^\(\s*\d+\s*\)/u.test(normalizeTimetableText(value));
}

export function isSourceLabel(value: string) {
  const text = normalizeTimetableText(value).trim();
  return SOURCE_LABEL_PATTERN.test(text) && !isTimeLine(text);
}

export function correctNumericCourseCodeOcr(value: string) {
  const source = normalizeTimetableText(value);
  if (isTimeLine(source) || isMetadataLine(source)) return null;
  const token = source.match(/(?:^|[^\p{L}\p{N}])([0-9OoIl|]{6,8})(?=$|[^\p{L}\p{N}])/u)?.[1];
  if (!token || (token.match(/\d/g) ?? []).length < 3 || !/[OoIl|]/.test(token)) return null;
  return token.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
}

export function extractCourseCodes(value: string) {
  const source = normalizeTimetableText(value);
  if (isTimeLine(source) || isMetadataLine(source)) return [];
  const correctedNumeric = correctNumericCourseCodeOcr(source);
  const candidates = [
    ...(correctedNumeric ? [correctedNumeric] : []),
    ...source.matchAll(NUMERIC_CODE),
    ...source.matchAll(THAI_CODE),
    ...source.matchAll(ALPHANUMERIC_CODE),
  ]
    .map((match) => match[1] ?? match[0])
    .filter((code) => !/^25\d{2}$/.test(code) && !/:/.test(code));
  return [...new Set(candidates)];
}

import type { SemanticCellFields, TimetableTextEvidence } from "@/lib/timetable/types";

export function isLikelyCourseToken(value: string) {
  const source = normalizeTimetableText(value);
  if (isTimeLine(source) || isMetadataLine(source)) return false;
  return /\b\d{6,8}\b/u.test(source) || /(?:^|\s)[ก-ฮ][0-9]{4,6}(?=\s|$|[,()])/u.test(source) || (/(?:รหัสวิชา|course\s*code)/iu.test(source) && extractCourseCodes(source).length > 0);
}

/**
 * Stage B3: Semantic Cell Classification.
 * Classifies the textual content of an established physical cell into domain fields.
 * Guarantees that course codes preserve leading zeroes as strings, labels (EDU, FAC IT, etc.)
 * are never classified as courseName, and unknown course names remain strictly null.
 */
export function classifySemanticCell(values: string[] | TimetableTextEvidence[]): SemanticCellFields {
  const rawLines = values.map((v) => (typeof v === "string" ? v : v.normalizedText));
  const lines = rawLines
    .map(normalizeTimetableText)
    .filter((value) => Boolean(value) && !isBreakLabel(value) && parseWeekday(value) === null);

  // 1. Course Code (Preserves leading zero as string, never Number)
  const code = lines.flatMap(extractCourseCodes)[0] ?? null;

  // 2. Explicit Time Range
  const time = lines.map(findAcademicTimeRange).find((range) => range !== null) ?? null;

  // 3. Combined metadata pattern: e.g. (2) 15, EDU-3402
  const metaMatch = lines.map((line) => line.match(/^\(\s*(\d+)\s*\)\s*([^\s,]+)\s*(?:,\s*|\s+)(.+)$/u)).find(Boolean);

  // 4. Teacher
  const teacher = lines.find((line) => !isTimeLine(line) && /^(?:ครู|อ\.|ผศ\.|รศ\.|ศ\.|ดร\.|teacher)\s*\S+/iu.test(line)) ?? null;

  // 5. Room
  const locationLines = lines.filter(
    (line) =>
      !isTimeLine(line) &&
      !isMetadataLine(line) &&
      (
        /(?:ห้อง|อาคาร|ตึก|online|arr-arr)/iu.test(line) ||
        /^(?:[A-Z]{2,}\d+|[A-Z0-9]{1,6}[-\s]\d{2,4}[A-Z]?|\d{3,4})$/iu.test(line) ||
        line === "ไม่ระบุ1"
      ) &&
      line !== code &&
      !/^25\d{2}$/.test(line)
  );
  const roomLine = metaMatch ? metaMatch[3].trim() : (locationLines.slice(0, 2).join(" ") || null);
  let finalRoom = roomLine;
  if (finalRoom && /^8-\d+/i.test(finalRoom)) {
    finalRoom = "B-" + finalRoom.slice(2);
  }

  // 6. Source Label (EDU, FAC IT, SC1, RN, B, IT, N/A, etc.)
  let finalLabel = lines.find((line) => (
    line !== code &&
    line !== roomLine &&
    line !== finalRoom &&
    line !== teacher &&
    !isTimeLine(line) &&
    !isMetadataLine(line) &&
    isSourceLabel(line)
  )) ?? null;

  if (finalRoom === "ไม่ระบุ1") {
    finalLabel = finalLabel ?? "N/A";
  } else if (finalRoom && /^IT-\d+/i.test(finalRoom)) {
    finalLabel = finalLabel ?? "FAC IT";
  } else if ((finalRoom && /^SC[1I]-\d+/i.test(finalRoom)) || finalLabel === "SCI") {
    finalLabel = "SC1";
  } else if (finalRoom === "5701") {
    finalLabel = finalLabel ?? "IT";
  } else if (finalRoom && /^B-\d+/i.test(finalRoom)) {
    finalLabel = "B";
  } else if (finalRoom && /^EDU-\d+/i.test(finalRoom)) {
    finalLabel = finalLabel ?? "EDU";
  }

  // 7. Credits and Section (supports both combined '(2) 15, EDU-3402' and separate '2', '15' lines)
  let credits = metaMatch ? Number(metaMatch[1]) : null;
  let section = metaMatch ? metaMatch[2] : null;

  if (credits === null || section === null) {
    const remainingTokens = lines.filter((line) => (
      line !== code &&
      line !== roomLine &&
      line !== finalRoom &&
      line !== teacher &&
      line !== finalLabel &&
      !isTimeLine(line) &&
      !isMetadataLine(line)
    ));

    const credToken = remainingTokens.find((t) => /^\(?\s*([1-9])\s*\)?$/.test(t));
    if (credits === null && credToken) {
      const match = credToken.match(/^\(?\s*([1-9])\s*\)?$/);
      if (match) credits = Number(match[1]);
    }

    const secToken = remainingTokens.find((t) => (
      t !== credToken &&
      (/^(?:sec|section|กลุ่ม|ตอน)\s*([A-Za-z0-9]+)$/iu.test(t) || /^\d{1,2}$/.test(t))
    ));
    if (section === null && secToken) {
      const match = secToken.match(/^(?:sec|section|กลุ่ม|ตอน)\s*([A-Za-z0-9]+)$/iu);
      section = match ? match[1] : secToken;
    }
  }

  // 8. Course Name: strictly null if no valid course title exists in the cell.
  // Never classify labels, codes, room, time, credits, or sections as courseName.
  const candidateNameLines = lines.filter((line) => (
    line !== code &&
    line !== roomLine &&
    line !== finalRoom &&
    line !== teacher &&
    line !== finalLabel &&
    line !== (credits !== null ? String(credits) : null) &&
    line !== (credits !== null ? `(${credits})` : null) &&
    line !== section &&
    !isTimeLine(line) &&
    !isMetadataLine(line) &&
    !isSourceLabel(line) &&
    !/^(?:[A-Z0-9]{1,6}[-\s]\d{2,4}[A-Z]?|\d{2,4})$/iu.test(line) &&
    line !== "ไม่ระบุ1"
  ));
  const courseName = candidateNameLines[0] ?? null;

  return {
    courseCode: code,
    courseName,
    credits,
    section,
    room: finalRoom,
    teacher,
    sourceLabel: finalLabel,
    extraLabel: finalLabel,
    time,
  };
}

export function parseCourseCell(values: string[]) {
  return classifySemanticCell(values);
}


