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

/** True when an existing subscription was signed with the key we still use. */
function matchesVapidKey(subscription: PushSubscription, expected: Uint8Array) {
  const applied = subscription.options?.applicationServerKey;
  if (!applied) return false;
  const bytes = new Uint8Array(applied);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

/** Why a device is not registered, in the words the settings screen shows. */
export type PushRegistration =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "no_key" | "not_permitted" | "subscribe_failed" | "signed_out" | "server" | "offline" };

/**
 * Registers this device with the push service and tells our server where to
 * reach it.
 *
 * It reports why it failed rather than a bare false: a device that is simply
 * offline for a moment, or whose session cookie is not readable yet on the
 * first paint after a cold start, has to be tried again, while one the browser
 * will never support should stop being asked. The caller decides which is
 * which, and the settings screen says so instead of claiming success.
 *
 * Safe to call on every launch: it reuses the subscription the device already
 * holds and only re-registers it with the server.
 */
/**
 * One registration at a time.
 *
 * Flipping the switch and the launch effect both ask to register, within a
 * frame of each other. Both found no subscription, both called subscribe(),
 * and the push service handed out two endpoints - two rows for one browser,
 * and every reminder arriving on that machine twice. Callers now share
 * whichever attempt is already in flight.
 */
let inFlightRegistration: Promise<PushRegistration> | null = null;

export function enablePushOnThisDevice(vapidPublicKey: string): Promise<PushRegistration> {
  inFlightRegistration ??= registerPushOnThisDevice(vapidPublicKey).finally(() => {
    inFlightRegistration = null;
  });
  return inFlightRegistration;
}

async function registerPushOnThisDevice(vapidPublicKey: string): Promise<PushRegistration> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!vapidPublicKey) return { ok: false, reason: "no_key" };
  if (window.Notification.permission !== "granted") return { ok: false, reason: "not_permitted" };

  try {
    await navigator.serviceWorker.register(WORKER_PATH, { scope: WORKER_SCOPE });
    const registration = await navigator.serviceWorker.ready;
    const expectedKey = decodeVapidKey(vapidPublicKey);

    // Reuse the subscription this device already has. Unsubscribing first
    // would be the simpler code, but the push service hands out a fresh
    // endpoint each time, and this runs on every launch: the device would
    // collect a new row per launch and receive one copy of every reminder for
    // each of them until the dead endpoints finally bounced.
    let subscription = await registration.pushManager.getSubscription();

    // A subscription signed with a key we no longer use (the VAPID pair was
    // rotated) will be rejected at send time, so that one does have to go. Its
    // server row goes with it, or it would linger and bounce forever.
    if (subscription && !matchesVapidKey(subscription, expectedKey)) {
      const staleEndpoint = subscription.endpoint;
      await subscription.unsubscribe().catch(() => undefined);
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: staleEndpoint }),
      }).catch(() => undefined);
      subscription = null;
    }

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey as BufferSource,
        });
      } catch {
        // The push service itself refused. Nothing the app can retry into.
        return { ok: false, reason: "subscribe_failed" };
      }
    }

    // Sent even when the subscription was reused: the row is keyed by
    // endpoint, so this re-attaches a device whose row was dropped after a
    // delivery bounced, and keeps it pointed at the account signed in now.
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

    if (response.ok) return { ok: true };
    // 401 is the ordinary cold-start race: the page is interactive before the
    // session cookie can be read back. It is worth another go in a moment.
    return { ok: false, reason: response.status === 401 ? "signed_out" : "server" };
  } catch {
    // fetch only rejects when the request never reached the server.
    return { ok: false, reason: "offline" };
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

  // Updating rather than ignoring a conflict: a class renamed or moved keeps
  // its event key, so ignoring the row would leave the old wording queued.
  // sent_at is absent from the payload and survives the update, which is what
  // keeps an already-delivered reminder from being sent a second time.
  await client.from("talevo_scheduled_notifications").upsert(
    plan.map((item) => ({
      user_id: userId,
      event_key: item.eventKey,
      send_at: item.sendAt,
      title: item.title,
      body: item.body,
      href: item.href,
    })),
    { onConflict: "user_id,event_key" },
  );
}
