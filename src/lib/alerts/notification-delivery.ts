import type { AppNotification } from "@/types";
import type { StorageLike } from "@/lib/persistence/app-state-storage";
import { LEGACY_KERNOVA_ALERT_LEADER_STORAGE_KEY, TALEVO_ALERT_LEADER_STORAGE_KEY } from "@/lib/talevo-storage-keys";

export type NotificationDeliveryChannel = {
  isSupported(): boolean;
  deliver(notification: AppNotification): Promise<void> | void;
};

const ALERT_LEADER_TTL_MS = 90_000;

type AlertLeaderLease = {
  tabId: string;
  expiresAt: number;
};

function parseLease(value: string | null): AlertLeaderLease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AlertLeaderLease>;
    return typeof parsed.tabId === "string" && typeof parsed.expiresAt === "number"
      ? { tabId: parsed.tabId, expiresAt: parsed.expiresAt }
      : null;
  } catch {
    return null;
  }
}

/**
 * Uses a short localStorage lease so only one open tab delivers browser popups.
 * In-app notifications still synchronize through the versioned AppState store.
 */
export function claimAlertDeliveryLeadership(storage: StorageLike, tabId: string, now = Date.now()) {
  const talevoLeaseRaw = storage.getItem(TALEVO_ALERT_LEADER_STORAGE_KEY);
  const current = parseLease(talevoLeaseRaw)
    ?? (talevoLeaseRaw === null ? parseLease(storage.getItem(LEGACY_KERNOVA_ALERT_LEADER_STORAGE_KEY)) : null);
  if (current && current.tabId !== tabId && current.expiresAt > now) return false;
  const next: AlertLeaderLease = { tabId, expiresAt: now + ALERT_LEADER_TTL_MS };
  storage.setItem(TALEVO_ALERT_LEADER_STORAGE_KEY, JSON.stringify(next));
  return parseLease(storage.getItem(TALEVO_ALERT_LEADER_STORAGE_KEY))?.tabId === tabId;
}

export function qualifiesForBrowserDelivery(notification: AppNotification) {
  if (notification.type === "system") return false;
  return notification.priority !== "normal" || [
    "morning_summary",
    "daily_brief",
    "weekly_radar",
    "class_upcoming",
    "class_ending",
    "exam_upcoming",
    "exam_today",
  ].includes(notification.type);
}

export function createBrowserNotificationChannel(): NotificationDeliveryChannel {
  return {
    isSupported: () => typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "granted",
    deliver: (notification) => {
      if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") return;
      const browserNotification = new window.Notification(notification.title, {
        body: notification.message,
        tag: notification.eventKey,
      });
      browserNotification.onclick = () => {
        window.focus();
        if (notification.href) window.location.assign(notification.href);
        browserNotification.close();
      };
    },
  };
}

export function deliverNewBrowserNotifications(notifications: AppNotification[], channel = createBrowserNotificationChannel()) {
  if (!channel.isSupported()) return;
  notifications.filter(qualifiesForBrowserDelivery).forEach((notification) => channel.deliver(notification));
}

/*
 * Future background Push requires HTTPS, a Service Worker, PushSubscription
 * lifecycle management, VAPID keys, server-side persistence/scheduling and
 * timezone-aware delivery. This client-only adapter intentionally does not
 * claim delivery while the browser/TALEVO runtime is closed.
 */
