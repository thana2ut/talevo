import { TALEVO_DEVICE_NOTIFICATIONS_KEY } from "@/lib/talevo-storage-keys";

/**
 * Whether this install was asked to deliver notifications.
 *
 * It is written the moment the person turns the switch on and read again on
 * every launch, so enabling it once is enough. It deliberately does not record
 * the browser permission: that is the browser's to answer and can change
 * outside the app, so the effective state is this flag AND a granted
 * permission. Revoking permission in the browser therefore silences alerts
 * without forgetting the request, and re-granting brings them straight back.
 */
export function readDeviceNotificationPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TALEVO_DEVICE_NOTIFICATIONS_KEY) === "on";
  } catch {
    // Private mode and blocked storage both throw; alerts stay off rather than
    // crashing the page that reads them.
    return false;
  }
}

export function writeDeviceNotificationPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TALEVO_DEVICE_NOTIFICATIONS_KEY, enabled ? "on" : "off");
  } catch {
    // The switch still works for this session even if it cannot be remembered.
  }
}
