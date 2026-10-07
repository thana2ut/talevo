import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

const protectedRoutePrefixes = [
  "/admin",
  "/academic",
  "/ai",
  "/calendar",
  "/help",
  "/notes",
  "/notifications",
  "/profile",
  "/schedule",
  "/settings",
  "/statistics",
  "/tasks",
  "/today",
];

const authCheckTimeoutMs = 1500;

function matchesRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), authCheckTimeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;

  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timeout));
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Keep old bookmarks safe: retired features return to the active home screen.
  if (matchesRoute(pathname, "/finance") || matchesRoute(pathname, "/exams")) {
    return NextResponse.redirect(new URL("/today", request.url));
  }
  if (matchesRoute(pathname, "/grades")) {
    return NextResponse.redirect(new URL("/tasks", request.url));
  }

  const isProtectedRoute = protectedRoutePrefixes.some((prefix) => matchesRoute(pathname, prefix));

  // Public routes must stay responsive even when the external Auth service is unavailable.
  // Their forms and links do not require a server-side session check.
  // This also avoids a stale browser session blocking navigation to Login or Register.
  if (!isProtectedRoute) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfiguration();
  const supabase = createServerClient(url, publishableKey, {
    global: { fetch: fetchWithAuthTimeout },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let isAuthenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    isAuthenticated = !error && Boolean(data?.claims?.sub);
  } catch {
    // Fail closed for protected routes without leaving the navigation blocked by a network retry.
    isAuthenticated = false;
  }

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    loginUrl.searchParams.set("auth-error", "authentication-required");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
