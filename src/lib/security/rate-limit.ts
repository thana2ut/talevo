import "server-only";
import { createHash } from "node:crypto";

type Window = { count: number; reset: number };
const windows = new Map<string, Window>();
const MAX_WINDOWS = 10_000;

// Burst protection within one process. Database quotas add cross-instance limits.
export function takeLocalLimit(key: string, limit: number, now = Date.now(), period = 60_000) {
  if (windows.size >= MAX_WINDOWS) {
    for (const [key, value] of windows) if (value.reset <= now) windows.delete(key);
  }
  const digest = createHash("sha256").update(key).digest("hex");
  let window = windows.get(digest);
  if (!window || window.reset <= now) {
    if (!window && windows.size >= MAX_WINDOWS) return { allowed: false, retryAfter: 60 };
    window = { count: 0, reset: now + period };
    windows.set(digest, window);
  }
  const allowed = window.count < limit;
  if (allowed) window.count++;
  return { allowed, retryAfter: Math.max(1, Math.ceil((window.reset - now) / 1000)) };
}

export function trustedClientAddress(headers: Headers) {
  // Do not trust arbitrary forwarding headers on a self-hosted server.
  return process.env.VERCEL === "1"
    ? (headers.get("x-vercel-forwarded-for")?.split(",")[0].trim().slice(0, 64) || "unknown")
    : "untrusted-proxy";
}
