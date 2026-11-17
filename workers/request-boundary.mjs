const MAX_BODY_BYTES = 7 * 1024 * 1024;

function reject(status, message, retryAfter) {
  return Response.json({ message }, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000", "Referrer-Policy": "no-referrer",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}

// Edge protection complements authenticated database quotas. The binding's
// counters are shared within a Cloudflare location, not a global billing cap.
export async function checkRequestBoundary(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/") && path !== "/auth/confirm") return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    return reject(413, "ข้อมูลมีขนาดใหญ่เกินไป กรุณาแบ่งส่งเป็นชุดย่อย");
  }
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || !env.API_BURST_LIMITER) return reject(503, "ระบบป้องกันคำขอยังไม่พร้อม กรุณาลองใหม่ภายหลัง", 5);
  try {
    // A single key across API paths prevents bypass by rotating endpoint names.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
    const key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    const result = await env.API_BURST_LIMITER.limit({ key });
    if (!result.success) return reject(429, "มีคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", 60);
    return null;
  } catch {
    return reject(503, "ระบบป้องกันคำขอยังไม่พร้อม กรุณาลองใหม่ภายหลัง", 5);
  }
}
