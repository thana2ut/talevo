import { type NextRequest, NextResponse } from "next/server";
import { secureApi } from "@/lib/security/api-guard";
import { profileAvatarPath } from "@/lib/security/profile-avatar";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

async function avatar(request: NextRequest) {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return NextResponse.json({ message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const reference = `/api/profile/avatar?path=${encodeURIComponent(request.nextUrl.searchParams.get("path") ?? "")}`;
  const path = profileAvatarPath(reference, getSupabaseConfiguration().url, data.user.id);
  if (!path) return NextResponse.json({ message: "ไม่พบรูปโปรไฟล์" }, { status: 404 });
  // Use the caller's session and Storage RLS, never an administrative key.
  const { data: image, error: downloadError } = await db.storage.from("profile-avatars").download(path);
  if (downloadError || !image) return NextResponse.json({ message: "ไม่พบรูปโปรไฟล์" }, { status: 404 });
  const type = path.endsWith(".webp") ? "image/webp" : "image/jpeg";
  if (image.size > 2 * 1024 * 1024 || (image.type && image.type !== type)) {
    return NextResponse.json({ message: "รูปแบบรูปโปรไฟล์ไม่ถูกต้อง" }, { status: 415 });
  }
  return new Response(image, { headers: {
    "Content-Type": type, "Cache-Control": "private, no-store", "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  } });
}

export const GET = secureApi(avatar, "/api/profile/avatar", "GET");
