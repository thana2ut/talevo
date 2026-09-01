import type { Task } from "@/types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Parses the app's datetime-local value without converting it to UTC. */
export function parseLocalTaskDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalTaskDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function relativeTaskDate(daysFromToday: number, hour: number, minute = 0, referenceDate = new Date()) {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + daysFromToday, hour, minute);
  return formatLocalTaskDate(date);
}

export function isSameLocalDate(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

export function getTasksDueToday(tasks: Task[], referenceDate = new Date()) {
  return tasks.filter((task) => {
    const dueDate = parseLocalTaskDate(task.dueDate);
    return task.status !== "completed" && dueDate !== null && isSameLocalDate(dueDate, referenceDate);
  });
}

export type TaskDueState = "overdue" | "urgent" | "today" | "future" | "unknown";

export function getTaskDueState(task: Task, referenceDate = new Date()): TaskDueState {
  const dueDate = parseLocalTaskDate(task.dueDate);
  if (!dueDate) return "unknown";
  const differenceMinutes = Math.ceil((dueDate.getTime() - referenceDate.getTime()) / 60_000);
  if (differenceMinutes < 0) return "overdue";
  if (isSameLocalDate(dueDate, referenceDate) && differenceMinutes <= 120) return "urgent";
  return isSameLocalDate(dueDate, referenceDate) ? "today" : "future";
}

export function formatTaskDueTime(task: Task, referenceDate = new Date()) {
  const dueDate = parseLocalTaskDate(task.dueDate);
  if (!dueDate) return task.dueLabel;
  const state = getTaskDueState(task, referenceDate);
  if (state === "overdue") return "เกินกำหนด";
  if (state === "urgent") {
    const minutes = Math.max(0, Math.ceil((dueDate.getTime() - referenceDate.getTime()) / 60_000));
    return minutes < 60 ? `เหลือ ${minutes} นาที` : `เหลือ ${Math.ceil(minutes / 60)} ชั่วโมง`;
  }
  return `วันนี้ ${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}`;
}

export function formatTaskDateTime(task: Task) {
  const dueDate = parseLocalTaskDate(task.dueDate);
  if (!dueDate) return task.dueLabel;
  return `${dueDate.getDate()} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][dueDate.getMonth()]} ${dueDate.getFullYear() + 543} ${pad(dueDate.getHours())}:${pad(dueDate.getMinutes())}`;
}

export function formatTaskCompletionDate(completedAt: string | undefined, language: "th" | "en" = "th", yearSystem: "พ.ศ." | "ค.ศ." = "พ.ศ.", dateFormat: "วัน/เดือน/ปี" | "เดือน/วัน/ปี" = "วัน/เดือน/ปี") {
  if (!completedAt) return "ไม่พบเวลาเสร็จสิ้น";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "ไม่พบเวลาเสร็จสิ้น";
  const locale = language === "th" ? (yearSystem === "พ.ศ." ? "th-TH-u-ca-buddhist" : "th-TH-u-ca-gregory") : (dateFormat === "เดือน/วัน/ปี" ? "en-US" : "en-GB");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date).replace(",", " ·");
}
