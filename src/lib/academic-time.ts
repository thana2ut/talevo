const THAI_DIGITS: Record<string, string> = {
  "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4",
  "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9",
};

export type AcademicTimeRole = "start" | "end" | "either";
export type ParsedAcademicTime = { value: string; minutes: number; isEndOfDay: boolean };
export type ParsedAcademicTimeRange = { startTime: string; endTime: string; startMinutes: number; endMinutes: number };

export function normalizeThaiDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGITS[digit] ?? digit);
}

function normalizedTimeSource(value: string) {
  return normalizeThaiDigits(value).normalize("NFC").replace(/\u00a0/g, " ").trim().toLowerCase().replace(/น\.?$/u, "").trim();
}

/** Parses wall-clock time without Date/timezone conversion. `24:00` remains the 1440-minute end-of-day boundary. */
export function parseAcademicTime(value: string | null | undefined, role: AcademicTimeRole = "either"): ParsedAcademicTime | null {
  if (typeof value !== "string") return null;
  const match = normalizedTimeSource(value).match(/^(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?(?:\s*[:.]\s*(\d{1,2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const meridiem = match[4]?.toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59 || !Number.isInteger(second) || second !== 0) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
  }
  if (hour === 24) {
    if (minute !== 0 || meridiem || role === "start") return null;
    return { value: "24:00", minutes: 1440, isEndOfDay: true };
  }
  if (hour < 0 || hour > 23) return null;
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes: hour * 60 + minute, isEndOfDay: false };
}

export function formatAcademicTime(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return null;
  if (minutes === 1440) return "24:00";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function timeToAcademicMinutes(value: string, role: AcademicTimeRole = "either") {
  return parseAcademicTime(value, role)?.minutes ?? Number.NaN;
}

export function isValidAcademicTimeRange(startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = parseAcademicTime(startTime, "start");
  const end = parseAcademicTime(endTime, "end");
  return Boolean(start && end && start.minutes < end.minutes);
}

/** Half-open intervals: adjacent ranges do not overlap. */
export function academicRangesOverlap(firstStart: string, firstEnd: string, secondStart: string, secondEnd: string) {
  const values = [
    timeToAcademicMinutes(firstStart, "start"), timeToAcademicMinutes(firstEnd, "end"),
    timeToAcademicMinutes(secondStart, "start"), timeToAcademicMinutes(secondEnd, "end"),
  ];
  if (!values.every(Number.isFinite)) return false;
  return values[0] < values[3] && values[1] > values[2];
}

export function calculateAcademicDuration(startTime: string, endTime: string) {
  if (!isValidAcademicTimeRange(startTime, endTime)) return Number.NaN;
  return timeToAcademicMinutes(endTime, "end") - timeToAcademicMinutes(startTime, "start");
}

export function parseAcademicTimeRange(value: string | null | undefined): ParsedAcademicTimeRange | null {
  if (typeof value !== "string") return null;
  const source = normalizeThaiDigits(value).normalize("NFC").replace(/\u00a0/g, " ").replace(/เวลา(?:เรียน|สอบ)?\s*[:：]?/giu, " ").trim();
  const parts = source.split(/\s*(?:-|–|—|ถึง|to|~)\s*/iu);
  if (parts.length !== 2) return null;
  const start = parseAcademicTime(parts[0], "start");
  const end = parseAcademicTime(parts[1], "end");
  if (!start || !end || start.minutes >= end.minutes) return null;
  return { startTime: start.value, endTime: end.value, startMinutes: start.minutes, endMinutes: end.minutes };
}

/** Finds a range embedded in a larger OCR line, such as `0560201 09:00–12:00 EDU-3402`. */
export function findAcademicTimeRange(value: string | null | undefined): ParsedAcademicTimeRange | null {
  if (typeof value !== "string") return null;
  const source = normalizeThaiDigits(value).normalize("NFC");
  const match = source.match(/(\d{1,2}(?:\s*[:.]\s*\d{1,2}(?:\s*[:.]\s*\d{1,2})?)?\s*(?:am|pm)?)\s*(?:-|–|—|ถึง|to|~)\s*(\d{1,2}(?:\s*[:.]\s*\d{1,2}(?:\s*[:.]\s*\d{1,2})?)?\s*(?:am|pm)?)/iu);
  return match ? parseAcademicTimeRange(`${match[1]}-${match[2]}`) : null;
}
