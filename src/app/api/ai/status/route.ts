import { NextResponse } from "next/server";
import {
  getActiveAIProviderLabel,
  getTalevoAIProviderId,
  isAIProviderConfigured,
} from "@/lib/ai/config";
import { getTalevoAIUsageStatus } from "@/lib/ai/usage-repository";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ code: "AI_UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบก่อนใช้ TALEVO AI" }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const providerId = getTalevoAIProviderId();
  const providerLabel = getActiveAIProviderLabel(providerId);
  const providerConfigured = isAIProviderConfigured(providerId);

  if (!providerConfigured) {
    return NextResponse.json({
      providerConfigured: false,
      providerId,
      providerLabel,
      limit: 0,
      used: 0,
      remaining: 0,
      cycleStartedAt: null,
      resetAt: null,
      retryAfterSeconds: 0,
      minuteRemaining: 0,
      requestInProgress: false,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const usage = await getTalevoAIUsageStatus(supabase);
    return NextResponse.json({
      providerConfigured: true,
      providerId,
      providerLabel,
      ...usage,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({
      providerConfigured: true,
      providerId,
      providerLabel,
      limit: 40,
      used: 0,
      remaining: 40,
      cycleStartedAt: null,
      resetAt: null,
      retryAfterSeconds: 0,
      minuteRemaining: 4,
      requestInProgress: false,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
