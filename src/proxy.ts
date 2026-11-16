import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { NextRequest as ForwardedRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "production", getSupabaseConfiguration().url);
  const headers = new Headers(request.headers);
  // Overwrite caller-controlled nonce/CSP, and forward only as request headers.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = await updateSession(new ForwardedRequest(request, { headers }));
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
