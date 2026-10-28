import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

const protectedRoutePrefixes = [
  "/academic",
  "/ai",
  "/calendar",
  "/help",
  "/notifications",
  "/profile",
  "/schedule",
  "/settings",
  "/statistics",
  "/tasks",
  "/today",
];

// Long enough for a cold start on a mobile network. A slow check no longer
// signs anyone out, so there is no reason to cut it short.
const authCheckTimeoutMs = 5000;

// Supabase stores the session as sb-<project-ref>-auth-token, split across
// .0/.1 suffixes once it outgrows a single cookie.
const authCookiePattern = /^sb-.+-auth-token(\.\d+)?$/;

function matchesRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Whether this device has a session stored at all.
 *
 * It says nothing about whether the session is still valid - only Auth can -
 * but it separates "never signed in here" from "signed in, and we have yet to
 * check", and those two deserve different treatment.
 */
function hasStoredSession(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => authCookiePattern.test(cookie.name));
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

  // The app on a home screen launches at "/", so sending everyone to the
  // welcome page from there showed the sign-in screen on every launch, however
  // long the session still had to run. Someone carrying a session belongs in
  // the app; "/welcome" stays reachable for anyone who asks for it by name.
  if (pathname === "/") {
    const destination = hasStoredSession(request) ? "/today" : "/welcome";
    return NextResponse.redirect(new URL(destination, request.url));
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

  const hasSessionCookie = hasStoredSession(request);

  // Start optimistic. A stored session is the normal state for someone
  // reopening the app, and the only thing that should end it is Auth saying so
  // - not a slow network. The app shell checks again in the browser and sends
  // them to Login if the session really is gone, while RLS and the API routes
  // remain the actual guard on their data.
  let isAuthenticated = hasSessionCookie;

  if (hasSessionCookie) {
    try {
      const { data, error } = await supabase.auth.getClaims();
      // Only a definite answer overrides the stored session: an aborted or
      // failed request tells us about the connection, not the account.
      if (!error) isAuthenticated = Boolean(data?.claims?.sub);
    } catch {
      // Cold start on a phone network. Let them through on the cookie.
    }
  }

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    // No auth-error here: being signed out is the ordinary state for someone
    // who just logged out, deleted their account, or opened a bookmark, and an
    // alarming banner on the login page reads as a fault. `next` still carries
    // them back to the page they asked for once they sign in.
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
