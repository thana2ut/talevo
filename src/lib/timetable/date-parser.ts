import { normalizeThaiDigits } from "@/lib/academic-time";

const MONTHS: Record<string, number> = {
  "ม.ค.": 1, มกราคม: 1, "ก.พ.": 2, กุมภาพันธ์: 2, "มี.ค.": 3, มีนาคม: 3, "เม.ย.": 4, เมษายน: 4,
  "พ.ค.": 5, พฤษภาคม: 5, "มิ.ย.": 6, มิถุนายน: 6, "ก.ค.": 7, กรกฎาคม: 7, "ส.ค.": 8, สิงหาคม: 8,
  "ก.ย.": 9, กันยายน: 9, "ต.ค.": 10, ตุลาคม: 10, "พ.ย.": 11, พฤศจิกายน: 11, "ธ.ค.": 12, ธันวาคม: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function canonicalYear(year: number) {
  if (year >= 2400) return year - 543;
  if (year >= 1000) return year;
  return null;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseAcademicDate(value: string) {
  const source = normalizeThaiDigits(value).normalize("NFC").trim();
  const numeric = source.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  let day: number; let month: number; let year: number | null;
  if (numeric) {
    day = Number(numeric[1]); month = Number(numeric[2]); year = canonicalYear(Number(numeric[3]));
  } else {
    const named = source.match(/\b(\d{1,2})\s+([ก-๙A-Za-z.]+)\s+(\d{2,4})\b/u);
    if (!named) return null;
    day = Number(named[1]); month = MONTHS[named[2].toLowerCase()] ?? 0;
    year = named[3].length === 4 ? canonicalYear(Number(named[3])) : null;
  }
  if (!year || !month || !validDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function countExplicitDates(values: string[]) {
  return values.filter((value) => parseAcademicDate(value) !== null).length;
}
