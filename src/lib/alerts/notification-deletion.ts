import type { AppNotification } from "@/types";

const MAX_DISMISSED_EVENT_KEYS = 500;

export function mergeDismissedNotificationEventKeys(current: readonly string[], eventKeys: readonly string[]) {
  return [...new Set([...current, ...eventKeys.filter(Boolean)])].slice(-MAX_DISMISSED_EVENT_KEYS);
}

export function removeReadNotification(notifications: readonly AppNotification[], id: string, dismissedEventKeys: readonly string[]) {
  const target = notifications.find((item) => item.id === id);
  if (!target?.readAt) return { notifications: [...notifications], dismissedEventKeys: [...dismissedEventKeys], removed: false };
  return {
    notifications: notifications.filter((item) => item.id !== id),
    dismissedEventKeys: mergeDismissedNotificationEventKeys(dismissedEventKeys, [target.eventKey]),
    removed: true,
  };
}

export function removeAllReadNotifications(notifications: readonly AppNotification[], dismissedEventKeys: readonly string[]) {
  const readNotifications = notifications.filter((item) => item.readAt);
  if (!readNotifications.length) return { notifications: [...notifications], dismissedEventKeys: [...dismissedEventKeys], removed: 0 };
  return {
    notifications: notifications.filter((item) => !item.readAt),
    dismissedEventKeys: mergeDismissedNotificationEventKeys(dismissedEventKeys, readNotifications.map((item) => item.eventKey)),
    removed: readNotifications.length,
  };
}
