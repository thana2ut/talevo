const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const thaiWeekdays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const thaiWeekdaysShort = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function createScheduleDate(year: number, month: number, date: number) {
  return new Date(year, month, date, 12);
}

export function sameScheduleDate(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

export function mondayIndex(date: Date) { return (date.getDay() + 6) % 7; }
export function addScheduleDays(date: Date, days: number) { return createScheduleDate(date.getFullYear(), date.getMonth(), date.getDate() + days); }
export function startOfScheduleWeek(date: Date) { return addScheduleDays(date, -mondayIndex(date)); }
export function getScheduleWeekDates(date: Date) { const start = startOfScheduleWeek(date); return Array.from({ length: 7 }, (_, index) => addScheduleDays(start, index)); }
export function formatThaiWeekRange(date: Date) { const start = startOfScheduleWeek(date); const end = addScheduleDays(start, 6); const year = end.getFullYear() + 543; if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${thaiMonths[end.getMonth()]} ${year}`; if (start.getFullYear() === end.getFullYear()) return `${start.getDate()} ${thaiMonths[start.getMonth()]} – ${end.getDate()} ${thaiMonths[end.getMonth()]} ${year}`; return `${start.getDate()} ${thaiMonths[start.getMonth()]} ${start.getFullYear() + 543} – ${end.getDate()} ${thaiMonths[end.getMonth()]} ${year}`; }
export function formatThaiLongDate(date: Date) { return `${thaiWeekdays[date.getDay()]} ${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`; }
export function formatThaiShortDate(date: Date) { return `${date.getDate()} ${thaiMonths[date.getMonth()].slice(0, 3)}. ${date.getFullYear() + 543}`; }
export function formatThaiMonth(date: Date) { return `${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`; }
export function formatThaiDay(date: Date) { return thaiWeekdaysShort[date.getDay()]; }
export function formatThaiWeekday(date: Date) { return thaiWeekdays[date.getDay()]; }
export function getMonthDates(monthDate: Date) {
  const first = createScheduleDate(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstCell = addScheduleDays(first, -mondayIndex(first));
  return Array.from({ length: 42 }, (_, index) => addScheduleDays(firstCell, index));
}
