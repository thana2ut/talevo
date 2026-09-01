import type { AppLanguage } from "@/lib/i18n";
import type { AppNotification, NotificationTone } from "@/types";
import { localDateKey } from "@/lib/alerts/date-time";

export type NotificationGroupKey = "important" | "today" | "thisWeek" | "previous";

export function getUnreadNotificationCount(notifications: AppNotification[]) {
  return notifications.filter((notification) => !notification.readAt).length;
}

export function getNotificationTone(notification: AppNotification): NotificationTone {
  if (notification.type === "deadline_risk" || notification.type === "exam_today" || (notification.type === "task_deadline" && notification.priority === "high")) return "red";
  if (notification.type === "task_deadline" || notification.type === "class_upcoming") return "orange";
  if (notification.type === "class_ending") return "blue";
  if (notification.type === "system") return "green";
  return "purple";
}

export function groupNotifications(notifications: AppNotification[], now: Date) {
  const groups: Record<NotificationGroupKey, AppNotification[]> = { important: [], today: [], thisWeek: [], previous: [] };
  const today = localDateKey(now);
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  [...notifications].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).forEach((notification) => {
    const created = new Date(notification.createdAt);
    const important = notification.priority === "high" && !notification.readAt;
    if (important) groups.important.push(notification);
    else if (localDateKey(created) === today) groups.today.push(notification);
    else if (created.getTime() >= weekAgo) groups.thisWeek.push(notification);
    else groups.previous.push(notification);
  });
  return groups;
}

export function formatNotificationTime(createdAt: string, language: AppLanguage, now = new Date()) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = localDateKey(date) === localDateKey(now);
  if (sameDay) return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
