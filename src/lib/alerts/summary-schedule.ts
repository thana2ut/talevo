import type {NotificationPreferences} from "@/types";
export function summaryTime(value:string|undefined,fallback:string){const time=/^([01]\d|2[0-3]):[0-5]\d$/.test(value??"")?value!:fallback;return time.split(":").map(Number);}
export function summaryWeekday(preferences:NotificationPreferences){const day=preferences.weeklySummaryDay;return typeof day==="number"&&Number.isInteger(day)&&day>=0&&day<=6?day:6;}
