import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { getPushDispatchSecret, getVapidConfiguration } from "@/lib/push/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// One run drains at most this many reminders. The schedule repeats every few
// minutes, so a backlog clears across runs instead of one request holding the
// connection open while it sends hundreds of deliveries.
const MAX_PER_RUN = 200;

type DueRow = {
  user_id: string;
  event_key: string;
  title: string;
  body: string;
  href: string;
};

type SubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function fail(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}

export async function POST(request: NextRequest) {
  const secret = getPushDispatchSecret();
  const vapid = getVapidConfiguration();
  if (!secret || !vapid) return fail("push_not_configured", 503);

  // A plain comparison here would leak the secret one character at a time to
  // anyone who can measure the response.
  const provided = request.headers.get("x-talevo-push-secret") ?? "";
  const expected = Buffer.from(secret);
  const received = Buffer.from(provided);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return fail("push_forbidden", 403);
  }

  const admin = createAdminClient();
  if (!admin) return fail("push_not_configured", 503);

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("talevo_scheduled_notifications")
    .select("user_id,event_key,title,body,href")
    .is("sent_at", null)
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) return fail("push_read_failed", 500);
  const rows = (due ?? []) as DueRow[];
  if (!rows.length) return NextResponse.json({ sent: 0, delivered: 0, removed: 0 });

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);

  const byUser = new Map<string, SubscriptionRow[]>();
  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  const expired: string[] = [];
  let delivered = 0;

  await Promise.all(rows.flatMap((row) => (byUser.get(row.user_id) ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: row.title, body: row.body, href: row.href, tag: row.event_key }),
      );
      delivered += 1;
    } catch (sendError) {
      // 404 and 410 mean the browser threw this subscription away - the app was
      // uninstalled, or the person cleared site data. Keeping it would fail on
      // every future run.
      const status = (sendError as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) expired.push(sub.endpoint);
    }
  })));

  if (expired.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", expired);
  }

  // Marked sent whether or not a delivery succeeded: a reminder for a class
  // that started an hour ago helps nobody, and retrying forever would turn one
  // dead subscription into an endless queue.
  const sentAt = new Date().toISOString();
  await Promise.all(rows.map((row) => admin
    .from("talevo_scheduled_notifications")
    .update({ sent_at: sentAt })
    .eq("user_id", row.user_id)
    .eq("event_key", row.event_key)));

  return NextResponse.json({ sent: rows.length, delivered, removed: expired.length });
}
