import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeAuthCallbackDestination } from "@/lib/auth-redirects";
import { createClient } from "@/lib/supabase/server";

type AllowedEmailOtpType = Extract<EmailOtpType, "email" | "signup" | "recovery">;

function isAllowedEmailOtpType(value: string | null): value is AllowedEmailOtpType {
  return value === "email" || value === "signup" || value === "recovery";
}

function redirectToLogin(request: NextRequest, authError: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("auth-error", authError);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const recoveryFlow = type === "recovery" || request.nextUrl.searchParams.get("next") === "/reset-password";
  const fallback = recoveryFlow ? "/reset-password" : "/today";
  const destination = getSafeAuthCallbackDestination(request.nextUrl.searchParams.get("next"), fallback);
  const failureCode = recoveryFlow ? "expired-recovery" : "expired-link";

  try {
    const supabase = await createClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return redirectToLogin(request, failureCode);
    } else {
      if (!tokenHash || !isAllowedEmailOtpType(type)) {
        return redirectToLogin(request, "invalid-link");
      }

      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return redirectToLogin(request, failureCode);
    }

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return redirectToLogin(request, failureCode);

    if (recoveryFlow) return NextResponse.redirect(new URL(destination, request.url));

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) return redirectToLogin(request, "confirmation-session");

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("confirmed", "1");
    return NextResponse.redirect(loginUrl);
  } catch {
    return redirectToLogin(request, "callback-failed");
  }
}
