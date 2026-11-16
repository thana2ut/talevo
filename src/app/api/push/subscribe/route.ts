import { secureApi } from "@/lib/security/api-guard";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrustedPushEndpoint } from "@/lib/push/endpoint";

type SubscriptionPayload = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function readSubscription(value: SubscriptionPayload) {
  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
  const p256dh = typeof value.keys?.p256dh === "string" ? value.keys.p256dh.trim() : "";
  const auth = typeof value.keys?.auth === "string" ? value.keys.auth.trim() : "";

  // A push endpoint is a URL at the browser vendor's own service. Anything
  // else is either a mistake or an attempt to have us sign deliveries to a
  // host of the caller's choosing.
  if (!isTrustedPushEndpoint(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

async function handlerPOST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("push_unauthorized", "กรุณาเข้าสู่ระบบก่อนเปิดการแจ้งเตือน", 401);

  const payload = await request.json().catch(() => null) as SubscriptionPayload | null;
  const subscription = payload ? readSubscription(payload) : null;
  if (!subscription) return fail("push_bad_request", "ข้อมูลการสมัครรับแจ้งเตือนไม่ถูกต้อง", 400);

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);

  // The endpoint is the primary key, so re-subscribing on a device the person
  // already registered updates that row rather than leaving a stale one behind
  // to receive duplicates.
  // RLS checks both the existing and new owner; a guessed endpoint cannot be reassigned.
  const { error: writeError } = await supabase.from("push_subscriptions").upsert({
    user_id: data.user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    user_agent: userAgent,
  }, { onConflict: "endpoint" });

  if (writeError) return fail("push_write_failed", "บันทึกการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่", 500);
  return NextResponse.json({ ok: true });
}

async function handlerDELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("push_unauthorized", "กรุณาเข้าสู่ระบบก่อน", 401);

  const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint.trim() : "";
  if (!endpoint) return fail("push_bad_request", "ไม่พบข้อมูลอุปกรณ์", 400);

  // Scoped to this user as well as the endpoint, so knowing someone else's
  // endpoint is not enough to unsubscribe their device.
  const { error: deleteError } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", data.user.id);
  if (deleteError) return fail("push_write_failed", "ยกเลิกการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่", 503);
  return NextResponse.json({ ok: true });
}

export const POST = secureApi(handlerPOST, "/api/push/subscribe", "POST");
export const DELETE = secureApi(handlerDELETE, "/api/push/subscribe", "DELETE");
