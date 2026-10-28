"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduledPush } from "@/lib/push/schedule-plan";

const WORKER_PATH = "/talevo-notification-worker.js";
const WORKER_SCOPE = "/";

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

/** The server hands out the key as base64url; PushManager wants raw bytes. */
function decodeVapidKey(base64Url: string) {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeKey(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Registers this device with the push service and tells our server where to
 * reach it. Returns false when push is unavailable or not permitted, so the
 * caller can leave the in-app alerts as the only channel.
 */
export async function enablePushOnThisDevice(vapidPublicKey: string) {
  if (!isPushSupported() || !vapidPublicKey) return false;
  if (window.Notification.permission !== "granted") return false;

  try {
    await navigator.serviceWorker.register(WORKER_PATH, { scope: WORKER_SCOPE });
    const registration = await navigator.serviceWorker.ready;

    // An existing subscription may be signed with a key we no longer use (the
    // VAPID pair was rotated), and the push service will reject deliveries for
    // it. Replacing it is cheaper than discovering that at send time.
    const current = await registration.pushManager.getSubscription();
    if (current) await current.unsubscribe().catch(() => undefined);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey) as BufferSource,
    });

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: encodeKey(subscription.getKey("p256dh")),
          auth: encodeKey(subscription.getKey("auth")),
        },
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function disablePushOnThisDevice() {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    // Tell the server first: if unsubscribing succeeds but the request fails,
    // the row would linger and every future send against it would bounce.
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);

    await subscription.unsubscribe().catch(() => undefined);
  } catch {
    // Leaving the subscription in place is harmless: the next dispatch that
    // bounces removes it.
  }
}

/**
 * Replaces this account's queued reminders with the current plan.
 *
 * Rows already delivered keep their sent_at, so re-running this after a visit
 * does not resend them; rows for classes or tasks that were edited away are
 * deleted because they are no longer in the plan.
 */
export async function syncScheduledPush(client: SupabaseClient, userId: string, plan: ScheduledPush[]) {
  const keys = plan.map((item) => item.eventKey);

  const stale = client.from("talevo_scheduled_notifications").delete().eq("user_id", userId).is("sent_at", null);
  await (keys.length ? stale.not("event_key", "in", `(${keys.map((key) => `"${key}"`).join(",")})`) : stale);

  if (!plan.length) return;

  await client.from("talevo_scheduled_notifications").upsert(
    plan.map((item) => ({
      user_id: userId,
      event_key: item.eventKey,
      send_at: item.sendAt,
      title: item.title,
      body: item.body,
      href: item.href,
    })),
    { onConflict: "user_id,event_key", ignoreDuplicates: true },
  );
}
