import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  AI_CHAT_MAX_REQUEST_BYTES,
  AIConfigurationError,
  getTalevoAIModel,
  isAIProviderConfigured,
} from "@/lib/ai/config";
import { AIContextReadError, buildTalevoContext } from "@/lib/ai/talevo-context";
import {
  AIProviderError,
  createGeminiProvider,
  getDevelopmentProviderDebug,
  type AIProvider,
} from "@/lib/ai/gemini-provider";
import { AIRequestValidationError, parseAIChatRequest } from "@/lib/ai/request-validation";
import type { AIErrorCode, AIErrorResponse, AIProviderDebug } from "@/lib/ai/types";
import {
  AIUsageCommitError,
  completeTalevoAIRequest,
  finishTalevoAIRequest,
  releaseTalevoAIRequest,
} from "@/lib/ai/usage-repository";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { createClient } from "@/lib/supabase/server";

interface RateLimitLease {
  allowed: boolean;
  reason: string;
  retry_after_seconds: number;
  request_id: string | null;
}

function errorResponse(code: AIErrorCode, message: string, status: number, retryAfterSeconds?: number, debug?: AIProviderDebug) {
  const body: AIErrorResponse = { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}), ...(debug ? { debug } : {}) };
  const headers = { "Cache-Control": "private, no-store", ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}) };
  return NextResponse.json(body, { status, headers });
}

function providerErrorResponse(error: AIProviderError) {
  const debug = getDevelopmentProviderDebug(false);
  if (error.kind === "quota") {
    return errorResponse("AI_PROVIDER_QUOTA", "โควตา AI ฟรีของโปรเจกต์เต็มชั่วคราว กรุณาลองใหม่ภายหลัง", 429, undefined, debug);
  }
  if (error.kind === "timeout") {
    return errorResponse("AI_TIMEOUT", "AI ใช้เวลาตอบนานเกินไป กรุณาลองใหม่ด้วยข้อความที่สั้นลง", 504, undefined, debug);
  }
  if (error.kind === "cancelled") {
    return errorResponse("AI_CANCELLED", "หยุดการสร้างคำตอบแล้ว", 499, undefined, debug);
  }
  return errorResponse("AI_PROVIDER_UNAVAILABLE", "AI ภายนอกยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง", 503, undefined, debug);
}

export function createAIChatHandler(provider: AIProvider = createGeminiProvider()) {
  return async function handleAIChat(request: NextRequest) {
    if (!isTrustedMutationOrigin(request, { allowMissingOrigin: true })) {
      return errorResponse("AI_FORBIDDEN", "คำขอนี้ไม่ได้มาจาก TALEVO", 403);
    }

    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return errorResponse("AI_UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนใช้ TALEVO AI", 401);
    }

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const rawContentLength = request.headers.get("content-length");
    const contentLength = Number(rawContentLength);
    if (contentType !== "application/json"
        || rawContentLength === null
        || !Number.isSafeInteger(contentLength)
        || contentLength <= 0
        || contentLength > AI_CHAT_MAX_REQUEST_BYTES) {
      return errorResponse("AI_BAD_REQUEST", "รูปแบบหรือขนาดข้อความไม่ถูกต้อง", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("AI_BAD_REQUEST", "รูปแบบข้อความไม่ถูกต้อง", 400);
    }

    let input;
    try {
      input = parseAIChatRequest(body);
    } catch (error) {
      if (error instanceof AIRequestValidationError) {
        return errorResponse("AI_BAD_REQUEST", "ข้อความหรือบริบทไม่ถูกต้อง", 400);
      }
      throw error;
    }

    const isConnected = isAIProviderConfigured() && provider.provenance.provider !== "disconnected";
    if (!isConnected) {
      return errorResponse("AI_CONFIGURATION_MISSING", "AI ออนไลน์ยังไม่ได้เชื่อมต่อ", 503);
    }

    const { data: leaseData, error: leaseError } = await supabase.rpc("begin_talevo_ai_request");
    if (leaseError) {
      return errorResponse("AI_SETUP_REQUIRED", "ระบบจำกัดการใช้งาน AI ยังไม่ได้ติดตั้ง", 503);
    }
    const lease = (Array.isArray(leaseData) ? leaseData[0] : leaseData) as RateLimitLease | null;
    if (!lease?.allowed || !lease.request_id) {
      const retryAfter = Math.max(1, lease?.retry_after_seconds ?? 60);
      const busy = lease?.reason === "concurrent";
      return errorResponse(
        busy ? "AI_BUSY" : "AI_RATE_LIMIT",
        busy ? "มีคำตอบ AI ที่กำลังประมวลผลอยู่ กรุณารอให้เสร็จก่อน" : "ถึงขีดจำกัดการใช้ AI ฟรีแล้ว กรุณาลองใหม่ภายหลัง",
        429,
        retryAfter,
      );
    }

    try {
      const context = await buildTalevoContext(supabase, authData.user.id, input.selectedContext);
      const message = await provider.generate({ ...input, contextBlock: context.block, signal: request.signal });
      if (request.signal.aborted) {
        await finishTalevoAIRequest(supabase, lease.request_id);
        return errorResponse("AI_CANCELLED", "หยุดการสร้างคำตอบแล้ว", 499);
      }
      const usage = await completeTalevoAIRequest(supabase, lease.request_id, true);
      const debug = getDevelopmentProviderDebug(true);
      return NextResponse.json({
        message,
        model: provider.provenance.model || getTalevoAIModel(),
        attachedContext: context.attachedContext,
        usage,
        ...(debug ? { debug } : {}),
      }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      await releaseTalevoAIRequest(supabase, lease.request_id);
      if (error instanceof AIConfigurationError) {
        return errorResponse("AI_CONFIGURATION_MISSING", "ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์", 503);
      }
      if (error instanceof AIUsageCommitError) {
        return errorResponse("AI_SETUP_REQUIRED", "บันทึกโควตา AI ไม่สำเร็จ จึงยังไม่ได้ส่งคำตอบกลับ", 503);
      }
      if (error instanceof AIContextReadError) {
        return errorResponse("AI_PROVIDER_UNAVAILABLE", "อ่านบริบท TALEVO ไม่สำเร็จ จึงยังไม่ได้ส่งข้อความไปยัง AI", 503);
      }
      if (error instanceof AIProviderError) return providerErrorResponse(error);
      return errorResponse("AI_PROVIDER_UNAVAILABLE", "AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง", 503);
    }
  };
}
