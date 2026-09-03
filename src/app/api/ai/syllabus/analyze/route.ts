import { NextResponse, type NextRequest } from "next/server";
import { AIConfigurationError, TALEVO_AI_MODEL } from "@/lib/ai/config";
import {
  SyllabusExtractorError,
  extractSyllabusWithGemini,
  getSyllabusInputMode,
  type SyllabusInputMode,
  type SyllabusProviderCategory,
} from "@/lib/ai/syllabus-extractor";
import {
  MAX_SYLLABUS_DOCUMENT_BYTES,
  MAX_SYLLABUS_MULTIPART_BYTES,
  SYLLABUS_DOCUMENT_MIME_TYPES,
  bytesToBase64,
  hasAllowedSyllabusFileExtension,
  matchesSyllabusDocumentMagic,
  normalizeSyllabusMimeType,
} from "@/lib/ai/syllabus-upload";
import { AIUsageCommitError, completeTalevoAIRequest, releaseTalevoAIRequest } from "@/lib/ai/usage-repository";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Lease = { allowed: boolean; reason: string; retry_after_seconds: number; request_id: string | null; };
type SafeDiagnostic = {
  providerCategory: SyllabusProviderCategory;
  providerHttpStatus: number | null;
  providerCode: number | null;
  providerStatus: string | null;
  providerMessage: string | null;
  model: string;
  inputMode: SyllabusInputMode;
};
const fail = (
  message: string,
  status: number,
  code: string,
  retryAfterSeconds?: number,
  diagnostic?: SafeDiagnostic,
) => NextResponse.json({
  code,
  message,
  ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  ...(process.env.NODE_ENV === "development" && diagnostic ? { diagnostic } : {}),
}, {
  status,
  headers: {
    "Cache-Control": "no-store",
    ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
  },
});

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request, { allowMissingOrigin: true })) return fail("คำขอนี้ไม่ได้มาจาก TALEVO", 403, "SYLLABUS_FORBIDDEN");
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return fail("กรุณาเข้าสู่ระบบก่อนวิเคราะห์เอกสาร", 401, "SYLLABUS_UNAUTHORIZED");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const rawContentLength = request.headers.get("content-length");
  const contentLength = Number(rawContentLength);
  if (!contentType.startsWith("multipart/form-data;")
      || rawContentLength === null
      || !Number.isSafeInteger(contentLength)
      || contentLength <= 0
      || contentLength > MAX_SYLLABUS_MULTIPART_BYTES) {
    return fail("รูปแบบหรือขนาดเอกสารไม่ถูกต้อง", 413, "SYLLABUS_PAYLOAD_TOO_LARGE");
  }
  let body: FormData;
  try { body = await request.formData(); } catch { return fail("รูปแบบเอกสารไม่ถูกต้อง", 400, "SYLLABUS_BAD_REQUEST"); }
  if ([...body.keys()].some((key) => !["sourceKind", "text", "document"].includes(key))) return fail("รูปแบบเอกสารไม่ถูกต้อง", 400, "SYLLABUS_BAD_REQUEST");
  if (["sourceKind", "text", "document"].some((key) => body.getAll(key).length > 1)) return fail("รูปแบบเอกสารไม่ถูกต้อง", 400, "SYLLABUS_BAD_REQUEST");
  const sourceKind = body.get("sourceKind");
  let input: Parameters<typeof extractSyllabusWithGemini>[0];
  const text = body.get("text");
  const document = body.get("document");
  if (sourceKind === "text" && typeof text === "string" && text.trim().length > 0 && text.length <= 50_000 && document === null) {
    input = { sourceKind: "text", text: text.trim(), signal: request.signal };
  } else if (sourceKind === "document" && isUploadedFile(document) && text === null) {
    const mimeType = normalizeSyllabusMimeType(document.name, document.type);
    if (!SYLLABUS_DOCUMENT_MIME_TYPES.has(mimeType)
        || !hasAllowedSyllabusFileExtension(document.name, mimeType)
        || document.size === 0
        || document.size > MAX_SYLLABUS_DOCUMENT_BYTES) return fail("ไฟล์ไม่รองรับหรือมีขนาดเกิน 6 MB", 422, "SYLLABUS_INVALID_FILE");
    const bytes = new Uint8Array(await document.arrayBuffer());
    if (bytes.length !== document.size || !matchesSyllabusDocumentMagic(mimeType, bytes)) return fail("ไฟล์เสียหายหรือชนิดไฟล์ไม่ตรงกับข้อมูลจริง", 422, "SYLLABUS_INVALID_FILE");
    input = { sourceKind: "document", document: { mimeType, base64: bytesToBase64(bytes) }, signal: request.signal };
  } else return fail("ไม่พบข้อความหรือเอกสารที่นำมาวิเคราะห์", 422, "SYLLABUS_INVALID_FILE");
  const inputMode = getSyllabusInputMode(input);
  const providerConfigured: boolean = false;
  if (!providerConfigured) {
    return fail("AI ออนไลน์ยังไม่ได้เชื่อมต่อ", 503, "AI_CONFIGURATION_MISSING");
  }
  const { data, error } = await supabase.rpc("begin_talevo_ai_request");
  const lease = (Array.isArray(data) ? data[0] : data) as Lease | null;
  if (error || !lease) return fail("ระบบจำกัดการใช้ AI ยังไม่ได้ติดตั้ง", 503, "AI_SETUP_REQUIRED");
  if (!lease.allowed || !lease.request_id) return fail(lease.reason === "concurrent" ? "กำลังวิเคราะห์เอกสารอื่นอยู่ กรุณารอให้เสร็จก่อน" : "ใช้ AI ครบโควตาในรอบนี้แล้ว", 429, lease.reason === "concurrent" ? "AI_BUSY" : "AI_RATE_LIMIT", Math.max(1, lease.retry_after_seconds || 60));
  try {
    const preview = await extractSyllabusWithGemini(input);
    if (request.signal.aborted) { await releaseTalevoAIRequest(supabase, lease.request_id); return fail("หยุดการวิเคราะห์แล้ว", 499, "AI_CANCELLED"); }
    const usage = await completeTalevoAIRequest(supabase, lease.request_id, true);
    return NextResponse.json({ preview, usage }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await releaseTalevoAIRequest(supabase, lease.request_id);
    if (error instanceof AIUsageCommitError) return fail("บันทึกโควตาไม่สำเร็จ จึงยังไม่ส่งผลวิเคราะห์", 503, "AI_SETUP_REQUIRED");
    if (error instanceof SyllabusExtractorError) {
      const diagnostic = {
        providerCategory: error.category,
        providerHttpStatus: error.provider.httpStatus,
        providerCode: error.provider.providerCode,
        providerStatus: error.provider.providerStatus,
        providerMessage: error.provider.message,
        model: TALEVO_AI_MODEL,
        inputMode,
      };
      if (error.category === "quota") return fail("โควตา AI ภายนอกเต็มชั่วคราว กรุณาลองใหม่ภายหลัง", 429, "AI_RATE_LIMIT", undefined, diagnostic);
      if (error.category === "timeout") return fail("AI ใช้เวลาวิเคราะห์นานเกินไป กรุณาลองเอกสารที่เล็กลง", 504, "SYLLABUS_TIMEOUT", undefined, diagnostic);
      if (error.category === "schema") return fail("AI ส่งข้อมูลเอกสารที่ตรวจสอบไม่ได้ กรุณาลองใหม่", 502, "SYLLABUS_SCHEMA_ERROR", undefined, diagnostic);
      if (error.category === "cancelled") return fail("หยุดการวิเคราะห์แล้ว", 499, "AI_CANCELLED", undefined, diagnostic);
      if (error.category === "configuration") return fail("การตั้งค่า AI ฝั่งเซิร์ฟเวอร์ไม่รองรับคำขอนี้", 503, "AI_CONFIG_ERROR", undefined, diagnostic);
      if (error.category === "invalid-request") return fail("รูปแบบคำขอไปยัง AI ไม่รองรับ", 400, "SYLLABUS_REQUEST_INVALID", undefined, diagnostic);
      return fail("AI ออนไลน์ไม่พร้อมวิเคราะห์เอกสารในขณะนี้", 503, "SYLLABUS_PROVIDER_ERROR", undefined, diagnostic);
    }
    if (error instanceof AIConfigurationError) return fail("TALEVO AI ยังตั้งค่าบนเซิร์ฟเวอร์ไม่ครบ", 503, "AI_CONFIGURATION_MISSING");
    return fail("AI ออนไลน์ไม่พร้อมวิเคราะห์เอกสารในขณะนี้", 503, "AI_PROVIDER_UNAVAILABLE");
  }
}
