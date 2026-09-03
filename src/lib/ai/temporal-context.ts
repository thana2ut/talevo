export const TALEVO_TIMEZONE = "Asia/Bangkok" as const;
export const TALEVO_UTC_OFFSET = "+07:00" as const;

export const WEEKDAY_TH_BY_EN: Record<string, string> = {
  Sunday: "วันอาทิตย์",
  Monday: "วันจันทร์",
  Tuesday: "วันอังคาร",
  Wednesday: "วันพุธ",
  Thursday: "วันพฤหัสบดี",
  Friday: "วันศุกร์",
  Saturday: "วันเสาร์",
};

export const CANONICAL_DAY_BY_EN: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

export const WEEKDAY_EN_BY_CANONICAL: Record<number, string> = {
  0: "Monday",
  1: "Tuesday",
  2: "Wednesday",
  3: "Thursday",
  4: "Friday",
  5: "Saturday",
  6: "Sunday",
};

export const WEEKDAY_TH_BY_CANONICAL: Record<number, string> = {
  0: "วันจันทร์",
  1: "วันอังคาร",
  2: "วันพุธ",
  3: "วันพฤหัสบดี",
  4: "วันศุกร์",
  5: "วันเสาร์",
  6: "วันอาทิตย์",
};

export interface AuthoritativeTemporalContext {
  localDate: string; // YYYY-MM-DD
  weekdayEn: string; // e.g. "Friday"
  weekdayTh: string; // e.g. "วันศุกร์"
  canonicalDay: number; // 0=Monday..6=Sunday
  localTime: string; // HH:mm
  timeZone: "Asia/Bangkok";
  utcOffset: "+07:00";
  buddhistYear: number; // year + 543
  formattedTh: string; // e.g. "วันศุกร์ที่ 4 กันยายน 2569"
  relative: {
    today: { date: string; weekdayTh: string; weekdayEn: string; canonicalDay: number };
    tomorrow: { date: string; weekdayTh: string; weekdayEn: string; canonicalDay: number };
    dayAfterTomorrow: { date: string; weekdayTh: string; weekdayEn: string; canonicalDay: number };
    yesterday: { date: string; weekdayTh: string; weekdayEn: string; canonicalDay: number };
  };
}

const THAI_MONTHS = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function extractBangkokParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TALEVO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const year = Number(partMap.year);
  const month = partMap.month;
  const day = partMap.day;
  const weekdayEn = partMap.weekday;
  const hour = partMap.hour;
  const minute = partMap.minute;

  const localDate = `${year}-${month}-${day}`;
  const localTime = `${hour}:${minute}`;
  const weekdayTh = WEEKDAY_TH_BY_EN[weekdayEn] ?? "วันศุกร์";
  const canonicalDay = CANONICAL_DAY_BY_EN[weekdayEn] ?? 4;
  const buddhistYear = year + 543;
  const monthNameTh = THAI_MONTHS[Number(month)] ?? "";
  const formattedTh = `${weekdayTh}ที่ ${Number(day)} ${monthNameTh} ${buddhistYear}`;

  return {
    year,
    month,
    day,
    weekdayEn,
    weekdayTh,
    canonicalDay,
    localDate,
    localTime,
    buddhistYear,
    formattedTh,
  };
}

export function getAuthoritativeTemporalContext(date: Date = new Date()): AuthoritativeTemporalContext {
  const current = extractBangkokParts(date);

  // Relative dates calculated by offset in ms
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const tomorrow = extractBangkokParts(new Date(date.getTime() + ONE_DAY_MS));
  const dayAfterTomorrow = extractBangkokParts(new Date(date.getTime() + 2 * ONE_DAY_MS));
  const yesterday = extractBangkokParts(new Date(date.getTime() - ONE_DAY_MS));

  return {
    localDate: current.localDate,
    weekdayEn: current.weekdayEn,
    weekdayTh: current.weekdayTh,
    canonicalDay: current.canonicalDay,
    localTime: current.localTime,
    timeZone: TALEVO_TIMEZONE,
    utcOffset: TALEVO_UTC_OFFSET,
    buddhistYear: current.buddhistYear,
    formattedTh: current.formattedTh,
    relative: {
      today: {
        date: current.localDate,
        weekdayTh: current.weekdayTh,
        weekdayEn: current.weekdayEn,
        canonicalDay: current.canonicalDay,
      },
      tomorrow: {
        date: tomorrow.localDate,
        weekdayTh: tomorrow.weekdayTh,
        weekdayEn: tomorrow.weekdayEn,
        canonicalDay: tomorrow.canonicalDay,
      },
      dayAfterTomorrow: {
        date: dayAfterTomorrow.localDate,
        weekdayTh: dayAfterTomorrow.weekdayTh,
        weekdayEn: dayAfterTomorrow.weekdayEn,
        canonicalDay: dayAfterTomorrow.canonicalDay,
      },
      yesterday: {
        date: yesterday.localDate,
        weekdayTh: yesterday.weekdayTh,
        weekdayEn: yesterday.weekdayEn,
        canonicalDay: yesterday.canonicalDay,
      },
    },
  };
}

export function getWeekdayNameTh(canonicalDay: number): string {
  return WEEKDAY_TH_BY_CANONICAL[canonicalDay] ?? "ไม่ระบุวัน";
}

export function getWeekdayNameEn(canonicalDay: number): string {
  return WEEKDAY_EN_BY_CANONICAL[canonicalDay] ?? "Unknown";
}

/**
 * Builds the provider-neutral system context block for temporal grounding.
 */
export function buildTemporalContextBlock(temporal: AuthoritativeTemporalContext): string {
  return `[CURRENT_TIME_CONTEXT]
Current local timezone: ${temporal.timeZone} (${temporal.utcOffset})
Current local date: ${temporal.localDate}
Current weekday: ${temporal.weekdayEn} (${temporal.weekdayTh})
Current local time: ${temporal.localTime}
Current Thai Buddhist date: ${temporal.formattedTh}
Canonical schedule day index: ${temporal.canonicalDay} (0=Monday..6=Sunday)

Relative Date Grounding:
- วันนี้ (Today) = ${temporal.relative.today.weekdayTh} (${temporal.relative.today.weekdayEn}, ${temporal.relative.today.date})
- พรุ่งนี้ (Tomorrow) = ${temporal.relative.tomorrow.weekdayTh} (${temporal.relative.tomorrow.weekdayEn}, ${temporal.relative.tomorrow.date})
- มะรืนนี้ (Day after tomorrow) = ${temporal.relative.dayAfterTomorrow.weekdayTh} (${temporal.relative.dayAfterTomorrow.weekdayEn}, ${temporal.relative.dayAfterTomorrow.date})
- เมื่อวาน (Yesterday) = ${temporal.relative.yesterday.weekdayTh} (${temporal.relative.yesterday.weekdayEn}, ${temporal.relative.yesterday.date})
- สัปดาห์นี้ (This week) = current week containing ${temporal.relative.today.weekdayTh} (${temporal.relative.today.date})

Rules:
- Treat this block as the authoritative definition of "today" and "now".
- Resolve relative dates and times strictly from this date/time.
- Never guess today's weekday, date, or year from training data.
- Never infer "today" from user schedule, task, or exam records.
- If schedule data is provided, match "today" queries against weekday "${temporal.weekdayTh}" / canonical day ${temporal.canonicalDay}.
- If schedule data is NOT provided (Schedule context unchecked), state clearly that schedule data was not attached, but confirm the current day and date.
[/CURRENT_TIME_CONTEXT]`;
}
