import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  if (!endpoint.startsWith("https://") || endpoint.length > 1000) return null;
  if (!p256dh || !auth || p256dh.length > 255 || auth.length > 255) return null;
  return { endpoint, p256dh, auth };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("push_unauthorized", "กรุณาเข้าสู่ระบบก่อนเปิดการแจ้งเตือน", 401);

  const admin = createAdminClient();
  if (!admin) return fail("push_not_configured", "ระบบแจ้งเตือนยังไม่พร้อมใช้งาน", 503);

  const payload = await request.json().catch(() => null) as SubscriptionPayload | null;
  const subscription = payload ? readSubscription(payload) : null;
  if (!subscription) return fail("push_bad_request", "ข้อมูลการสมัครรับแจ้งเตือนไม่ถูกต้อง", 400);

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);

  // The endpoint is the primary key, so re-subscribing on a device the person
  // already registered updates that row rather than leaving a stale one behind
  // to receive duplicates.
  const { error: writeError } = await admin.from("push_subscriptions").upsert({
    user_id: data.user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    user_agent: userAgent,
  }, { onConflict: "endpoint" });

  if (writeError) return fail("push_write_failed", "บันทึกการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่", 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("push_unauthorized", "กรุณาเข้าสู่ระบบก่อน", 401);

  const admin = createAdminClient();
  if (!admin) return fail("push_not_configured", "ระบบแจ้งเตือนยังไม่พร้อมใช้งาน", 503);

  const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint.trim() : "";
  if (!endpoint) return fail("push_bad_request", "ไม่พบข้อมูลอุปกรณ์", 400);

  // Scoped to this user as well as the endpoint, so knowing someone else's
  // endpoint is not enough to unsubscribe their device.
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", data.user.id);
  return NextResponse.json({ ok: true });
}
