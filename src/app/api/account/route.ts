import { NextResponse, type NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status, headers: NO_STORE_HEADERS });
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)
      || request.headers.get("x-talevo-account-deletion") !== "confirmed") {
    return fail("invalid_deletion_confirmation", "คำขอลบบัญชีไม่ผ่านการยืนยัน", 403);
  }

  const supabase = await createClient();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return fail("unauthorized", "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
  }

  const admin = createAdminClient();
  if (!admin) {
    return fail("admin_configuration_missing", "ระบบลบบัญชียังไม่พร้อมใช้งาน", 503);
  }

  const { error: deletionError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deletionError) {
    console.error("[TALEVO] Supabase account deletion failed", { code: deletionError.code });
    return fail("account_deletion_failed", "ลบบัญชีไม่สำเร็จ ข้อมูลในอุปกรณ์ยังไม่ถูกลบ", 502);
  }

  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ deleted: true }, { headers: NO_STORE_HEADERS });
}
