import type { AppNotification } from "@/types";
import type { StorageLike } from "@/lib/persistence/app-state-storage";
import { LEGACY_KERNOVA_ALERT_LEADER_STORAGE_KEY, TALEVO_ALERT_LEADER_STORAGE_KEY } from "@/lib/talevo-storage-keys";

export type NotificationDeliveryChannel = {
  isSupported(): boolean;
  deliver(notification: AppNotification): Promise<void> | void;
};

const ALERT_LEADER_TTL_MS = 90_000;
const NOTIFICATION_WORKER_PATH = "/talevo-notification-worker.js";
const NOTIFICATION_WORKER_SCOPE = "/";

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
    deliver: async (notification) => {
      if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") return;

      const options: NotificationOptions = {
        body: notification.message,
        tag: notification.eventKey,
        icon: "/brand/talevo-mascot-head.png",
        badge: "/brand/talevo-mascot-head.png",
        data: { href: notification.href ?? "/notifications" },
      };

      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register(NOTIFICATION_WORKER_PATH, { scope: NOTIFICATION_WORKER_SCOPE });
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(notification.title, options);
        return;
      }

      const browserNotification = new window.Notification(notification.title, {
        ...options,
      });
      browserNotification.onclick = () => {
        window.focus();
        if (notification.href) window.location.assign(notification.href);
        browserNotification.close();
      };
    },
  };
}

export async function deliverNewBrowserNotifications(notifications: AppNotification[], channel = createBrowserNotificationChannel()) {
  if (!channel.isSupported()) return;
  await Promise.all(
    notifications
      .filter(qualifiesForBrowserDelivery)
      .map(async (notification) => {
        try {
          await channel.deliver(notification);
        } catch {
          // In-app notifications remain available if the operating system rejects a popup.
        }
      }),
  );
}

export async function deliverBrowserNotificationTest(language: "th" | "en", channel = createBrowserNotificationChannel()) {
  if (!channel.isSupported()) return false;
  const now = new Date();
  const notification: AppNotification = {
    id: `notification-test:${now.getTime()}`,
    type: "system",
    priority: "normal",
    title: language === "th" ? "เปิดการแจ้งเตือน TALEVO แล้ว" : "TALEVO notifications are enabled",
    message: language === "th" ? "ระบบจะแจ้งงานและคาบเรียนตามเวลาที่ตั้งไว้" : "Task and class reminders will appear at their scheduled times.",
    createdAt: now.toISOString(),
    eventKey: "notification-permission-test",
    href: "/notifications",
  };
  try {
    await channel.deliver(notification);
    return true;
  } catch {
    return false;
  }
}

/*
 * Future background Push requires HTTPS, a Service Worker, PushSubscription
 * lifecycle management, VAPID keys, server-side persistence/scheduling and
 * timezone-aware delivery. This client-only adapter intentionally does not
 * claim delivery while the browser/TALEVO runtime is closed.
 */
