import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { createClient } from "@/lib/supabase/server";

export const CHAT_COMPATIBLE_PROBE_MESSAGE = "Reply with exactly: TALEVO_OK";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function createAIChatProbeHandler() {
  return async function handleAIChatProbe(request: NextRequest) {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (!isTrustedMutationOrigin(request, { allowMissingOrigin: true })) {
      return NextResponse.json({ code: "AI_FORBIDDEN" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ code: "AI_UNAUTHORIZED" }, { status: 401, headers: NO_STORE_HEADERS });
    }

    // Disconnected baseline: No online AI provider is connected.
    return NextResponse.json({
      ok: false,
      providerConfigured: false,
      message: "AI ออนไลน์ยังไม่ได้เชื่อมต่อ",
      externalSuccess: false,
      endpointStatus: 503,
    }, { status: 503, headers: NO_STORE_HEADERS });
  };
}
