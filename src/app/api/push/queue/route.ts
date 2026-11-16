import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { secureApi } from "@/lib/security/api-guard";

export const dynamic = "force-dynamic";

async function handlerPOST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "ข้อมูลแจ้งเตือนไม่ถูกต้อง" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !Array.isArray((body as { rows?: unknown }).rows)) return NextResponse.json({ message: "ข้อมูลแจ้งเตือนไม่ถูกต้อง" }, { status: 400 });
  const raw = (body as { rows: unknown[] }).rows;
  if (raw.length > 500) return NextResponse.json({ message: "จำนวนแจ้งเตือนเกินกำหนด" }, { status: 400 });
  const rows = raw.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (row.user_id !== auth.user.id || typeof row.event_key !== "string" || !/^[\w:.-]{1,180}$/.test(row.event_key)
      || typeof row.send_at !== "string" || !Number.isFinite(Date.parse(row.send_at))
      || typeof row.title !== "string" || row.title.length < 1 || row.title.length > 180
      || typeof row.body !== "string" || row.body.length > 300
      || typeof row.href !== "string" || row.href.length > 500 || !row.href.startsWith("/") || row.href.startsWith("//")) return null;
    return { user_id: auth.user.id, event_key: row.event_key, send_at: row.send_at, title: row.title, body: row.body, href: row.href };
  });
  if (rows.some(row => row === null)) return NextResponse.json({ message: "ข้อมูลแจ้งเตือนบางรายการไม่ถูกต้อง" }, { status: 400 });

  const existing = await supabase.from("talevo_scheduled_notifications").select("event_key").eq("user_id", auth.user.id).is("sent_at", null);
  if (existing.error) return NextResponse.json({ message: "จัดการแจ้งเตือนไม่สำเร็จ" }, { status: 503 });
  const keep = new Set(rows.map(row => row!.event_key));
  const staleKeys = (existing.data ?? []).map(row => row.event_key).filter(key => !keep.has(key));
  if (staleKeys.length) {
    const removed = await supabase.from("talevo_scheduled_notifications").delete().eq("user_id", auth.user.id).is("sent_at", null).in("event_key", staleKeys);
    if (removed.error) return NextResponse.json({ message: "อัปเดตรายการแจ้งเตือนไม่สำเร็จ" }, { status: 503 });
  }
  if (rows.length) {
    const saved = await supabase.from("talevo_scheduled_notifications").upsert(rows as NonNullable<(typeof rows)[number]>[], { onConflict: "user_id,event_key" });
    if (saved.error) return NextResponse.json({ message: "บันทึกรายการแจ้งเตือนไม่สำเร็จ" }, { status: 503 });
  }
  return NextResponse.json({ saved: rows.length }, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = secureApi(handlerPOST, "/api/push/queue", "POST");
