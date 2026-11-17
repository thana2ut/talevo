import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";
import { apiPayloadSchemas, isSafeJSON } from "@/lib/security/payload";
import { takeLocalLimit, trustedClientAddress } from "@/lib/security/rate-limit";

type Handler = (request: NextRequest) => Response | Promise<Response>;
type Policy = { body?: number; schema?: ZodType; multipart?: boolean; public?: boolean; service?: boolean; developmentOnly?: boolean };
const policies: Record<string, Policy> = {
  "/api/time": { public: true },
  "/api/push/dispatch": { service: true },
  "/api/account": {},
  "/api/ai/status": {},
  "/api/ai/chat": { body: 32768, schema: apiPayloadSchemas.chat },
  "/api/ai/chat/probe": { developmentOnly: true, body: 32768 },
  "/api/ai/syllabus/probe": { developmentOnly: true, body: 12000 },
  "/api/ai/syllabus/analyze": { body: 6 * 1024 * 1024 + 256 * 1024, multipart: true },
  "/api/ai/voice/execute": { body: 12000, schema: apiPayloadSchemas.voice },
  "/api/grade-lab": { body: 300000, schema: apiPayloadSchemas.grade },
  "/api/grade-lab/criteria": { body: 4 * 1024 * 1024 + 256 * 1024, multipart: true },
  "/api/vision/analyze": { body: 3500000, multipart: true },
  "/api/vision/import": { body: 1500000, schema: apiPayloadSchemas.visionImport },
  "/api/vision/records": {},
  "/api/push/subscribe": { body: 4096, schema: apiPayloadSchemas.push },
  "/api/push/queue": { body: 500000, schema: z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(500) }).strict() },
};

export class RequestBoundaryError extends Error {
  constructor(public status: number) { super("Invalid request body"); }
}

export async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new RequestBoundaryError(Number(declared) > maximum ? 413 : 400);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RequestBoundaryError(408)), 10000); });
  try {
    for (;;) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximum) throw new RequestBoundaryError(413);
      chunks.push(result.value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return body;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

function audit(route: string, status: number, requestId: string) {
  if (takeLocalLimit("security-events", 60).allowed) {
    // Fixed fields only: never request bodies, URLs with queries, cookies or errors.
    console.warn(JSON.stringify({ event: "security_request_rejected", route, status, requestId }));
  }
}

export function secureApi(handler: Handler, route: string, method: string): Handler {
  return async (request) => {
    const requestId = crypto.randomUUID();
    const deny = (status: number, retryAfter?: number) => {
      audit(route, status, requestId);
      const message = status === 401 ? "กรุณาเข้าสู่ระบบใหม่" : status === 429 ? "มีคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" : status === 413 ? "ข้อมูลมีขนาดใหญ่เกินไป กรุณาแบ่งส่งเป็นชุดย่อย" : status >= 500 ? "ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" : "คำขอไม่ถูกต้อง กรุณาตรวจข้อมูลแล้วลองใหม่";
      return NextResponse.json({ code: `SECURITY_${status}`, message, requestId }, { status, headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
    };
    try {
      const policy = policies[route];
      if (!policy) return deny(404);
      if (request.method !== method) return deny(405);
      if (policy.developmentOnly && process.env.NODE_ENV !== "development") return deny(404);
      const burst = takeLocalLimit(`${trustedClientAddress(request.headers)}:${route}`, policy.public ? 600 : 300);
      if (!burst.allowed) return deny(429, burst.retryAfter);
      const mutates = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (mutates && !policy.service && !isTrustedMutationOrigin(request)) return deny(403);
      if (!policy.public && !policy.service) {
        const db = await createClient();
        const { data, error } = await db.auth.getUser();
        if (error || !data.user) return deny(401);
        const scope = route === "/api/account" ? "sensitive" : route.includes("analyze") || route === "/api/ai/chat" ? "ai" : mutates ? "write" : "read";
        if (scope !== "ai") {
          const { data: quota, error: quotaError } = await db.rpc("consume_talevo_api_limit", { p_scope: scope });
          // New SQL is a deployment prerequisite. Never fall back to unbounded use.
          if (quotaError || !quota || typeof quota.allowed !== "boolean") return deny(503);
          if (!quota.allowed) return deny(429, Math.max(1, Math.min(3600, Number(quota.retry_after) || 60)));
        }
      }
      if (mutates && !policy.service && !policy.developmentOnly) {
        const maximum = policy.body ?? 0;
        const body = await readBoundedBody(request, maximum);
        const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
        if (policy.multipart) {
          if (contentType !== "multipart/form-data" || !body.length) return deny(415);
        } else if (policy.schema) {
          if (contentType !== "application/json" || !body.length) return deny(415);
          let value: unknown;
          try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); } catch { return deny(400); }
          const schema = route === "/api/push/subscribe" && method === "DELETE" ? apiPayloadSchemas.pushDelete : policy.schema;
          if (!isSafeJSON(value) || !schema.safeParse(value).success) return deny(400);
        } else if (body.length) return deny(400);
        const headers = new Headers(request.headers);
        headers.set("content-length", String(body.length));
        request = new NextRequest(request.url, { method, headers, signal: request.signal, ...(body.length ? { body } : {}) });
      }
      const response = await handler(request);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Request-Id", requestId);
      if (response.status >= 400) audit(route, response.status, requestId);
      return response;
    } catch (error) {
      return deny(error instanceof RequestBoundaryError ? error.status : 503);
    }
  };
}
