import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

const protectedRoutePrefixes = [
  "/admin",
  "/academic",
  "/ai",
  "/calendar",
  "/exams",
  "/finance",
  "/grades",
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

const authRoutes = ["/login", "/register", "/resend-confirmation"];

function matchesRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfiguration();
  const supabase = createServerClient(url, publishableKey, {
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

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (matchesRoute(pathname, "/finance")) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  const isProtectedRoute = protectedRoutePrefixes.some((prefix) => matchesRoute(pathname, prefix));

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    loginUrl.searchParams.set("auth-error", "authentication-required");
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && authRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return response;
}
