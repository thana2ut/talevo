"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AcademicTerm, UserProfile } from "@/types";

type SignUpInput = {
  email: string;
  password: string;
  profile: UserProfile;
  academicTerm: AcademicTerm;
};

type AuthResult = { error: string | null };
type SignUpResult = AuthResult & { requiresEmailConfirmation: boolean; userId: string | null };

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  deleteAccount: () => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authErrorMessage(code?: string) {
  switch (code) {
    case "invalid_credentials":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "email_not_confirmed":
      return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
    case "email_address_invalid":
      return "รูปแบบอีเมลไม่ถูกต้อง";
    case "email_address_not_authorized":
      return "ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง";
    case "user_already_exists":
    case "email_exists":
      return "อีเมลนี้มีบัญชีอยู่แล้ว"; // อีเมลนี้ถูกใช้สมัครบัญชีแล้ว
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "มีการส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    case "weak_password":
      return "รหัสผ่านยังไม่ตรงตามเงื่อนไข";
    case "same_password":
      return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม";
    case "signup_disabled":
      return "ขณะนี้ไม่สามารถสมัครสมาชิกใหม่ได้";
    case "unauthorized":
      return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    case "admin_configuration_missing":
      return "ระบบลบบัญชียังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์ กรุณาติดต่อผู้ดูแล";
    case "account_deletion_failed":
      return "ลบบัญชีบน Supabase ไม่สำเร็จ ข้อมูลในอุปกรณ์ยังไม่ถูกลบ";
    default:
      return "เชื่อมต่อระบบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }
}

export function normalizeAuthError(
  err: unknown,
  context: "signup" | "signin" | "resend" | "recovery" | "default" = "default"
): string {
  if (!err) return "";
  const error = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : { message: String(err) };
  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const status = typeof error.status === "number" ? error.status : undefined;

  // 1. Email invalid
  if (
    code === "email_address_invalid" ||
    (code === "validation_failed" && message.includes("email")) ||
    message.includes("invalid email") ||
    message.includes("email address is invalid") ||
    message.includes("unable to validate email address") ||
    message.includes("invalid format")
  ) {
    return "รูปแบบอีเมลไม่ถูกต้อง";
  }

  // 2. Email already registered / user already exists
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("user already registered") ||
    message.includes("user already exists") ||
    message.includes("email already registered") ||
    message.includes("email already in use") ||
    message.includes("email address already in use")
  ) {
    return "อีเมลนี้มีบัญชีอยู่แล้ว"; // อีเมลนี้ถูกใช้สมัครบัญชีแล้ว
  }

  // 3. Password invalid / weak
  if (
    code === "weak_password" ||
    message.includes("password should be at least") ||
    message.includes("password is too short") ||
    message.includes("weak password") ||
    message.includes("password must be")
  ) {
    return "รหัสผ่านยังไม่ตรงตามเงื่อนไข";
  }

  // 4. Same password
  if (code === "same_password" || message.includes("same as old password") || message.includes("new password should be different")) {
    return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม";
  }

  // 5. Signup disabled
  if (
    code === "signup_disabled" ||
    message.includes("signups not allowed") ||
    message.includes("signup is disabled") ||
    message.includes("signups are disabled")
  ) {
    return "ขณะนี้ไม่สามารถสมัครสมาชิกใหม่ได้";
  }

  // 6. Email rate limited
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "rate_limit_exceeded" ||
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("email rate limit exceeded") ||
    message.includes("too many requests")
  ) {
    return "มีการส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  }

  // 7. SMTP failure / email delivery failure
  if (
    code === "email_address_not_authorized" ||
    (code === "unexpected_failure" && (message.includes("mail") || message.includes("smtp"))) ||
    message.includes("error sending confirmation mail") ||
    message.includes("error sending mail") ||
    message.includes("smtp") ||
    message.includes("failed to send email") ||
    message.includes("error sending email") ||
    (status === 500 && (message.includes("mail") || message.includes("email") || message.includes("confirmation")))
  ) {
    return "ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง";
  }

  // 8. Network failure
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("networkerror")
  ) {
    return "ไม่สามารถเชื่อมต่อระบบบัญชีได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  }

  // 9. Email not confirmed (login)
  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
  }

  // 10. Invalid credentials (login)
  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }

  // 11. Unauthorized / Session expired
  if (code === "unauthorized" || message.includes("unauthorized") || message.includes("session expired")) {
    return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  }

  // 12. Account deletion specifics
  if (code === "admin_configuration_missing") {
    return "ระบบลบบัญชียังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์ กรุณาติดต่อผู้ดูแล";
  }
  if (code === "account_deletion_failed") {
    return "ลบบัญชีบน Supabase ไม่สำเร็จ ข้อมูลในอุปกรณ์ยังไม่ถูกลบ";
  }

  // 13. Context fallback
  if (context === "signup") {
    return "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }
  return "เชื่อมต่อระบบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

const networkErrorMessage = "ไม่สามารถเชื่อมต่อระบบบัญชีได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";

function getEmailConfirmationRedirectUrl() {
  return `${window.location.origin}/auth/confirm`;
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setIsLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const signUp = useCallback(async ({ email, password, profile, academicTerm }: SignUpInput): Promise<SignUpResult> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: profile.displayName,
            major: profile.major,
            university: profile.university,
            level: academicTerm.level,
            term: academicTerm.term,
            academic_year: academicTerm.academicYear,
          },
        },
      });

      if (process.env.NODE_ENV === "development") {
        console.log("[TALEVO Auth Diagnostic: signUp]", {
          stage: "signup_response",
          errorCode: error?.code,
          errorStatus: error?.status,
          errorMessage: error?.message,
          hasUser: Boolean(data?.user),
          hasSession: Boolean(data?.session),
          identitiesCount: data?.user?.identities?.length,
        });
      }

      // Detect if user already exists
      if (
        (!error && data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) ||
        error?.code === "user_already_exists"
      ) {
        return {
          error: "อีเมลนี้มีบัญชีอยู่แล้ว",
          requiresEmailConfirmation: false,
          userId: null,
        };
      }

      if (error) {
        return {
          error: normalizeAuthError(error, "signup"),
          requiresEmailConfirmation: false,
          userId: null,
        };
      }

      // If a real authenticated session was returned (Confirm email = OFF), immediately update session state
      if (data?.session) {
        setSession(data.session);
      }

      return {
        error: null,
        requiresEmailConfirmation: !data.session,
        userId: data.user?.id ?? null,
      };
    } catch (err: unknown) {
      if (process.env.NODE_ENV === "development") {
        console.error("[TALEVO Auth Diagnostic: signUp exception]", err);
      }
      return { error: networkErrorMessage, requiresEmailConfirmation: false, userId: null };
    }
  }, [supabase]);

  const resendConfirmation = useCallback(async (email: string): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: getEmailConfirmationRedirectUrl() },
      });
      if (process.env.NODE_ENV === "development") {
        console.log("[TALEVO Auth Diagnostic: resendConfirmation]", {
          stage: "resend_response",
          errorCode: error?.code,
          errorMessage: error?.message,
          errorStatus: error?.status,
        });
      }
      return { error: error ? normalizeAuthError(error, "resend") : null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (process.env.NODE_ENV === "development") {
        console.log("[TALEVO Auth Diagnostic: signIn]", {
          stage: "signin_response",
          errorCode: error?.code,
          errorMessage: error?.message,
          errorStatus: error?.status,
          hasUser: Boolean(data?.user),
          hasSession: Boolean(data?.session),
        });
      }
      if (error) return { error: normalizeAuthError(error, "signin") };

      // A redirect is permitted only after Supabase returns a verified browser session.
      // Treat an incomplete response as a failed sign-in rather than trusting stale client state.
      if (!data.session || !data.user) {
        return { error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
      }

      setSession(data.session);
      return { error: null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const signOut = useCallback(async (): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.signOut();
      return { error: error ? authErrorMessage(error.code) : null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
      return { error: error ? authErrorMessage(error.code) : null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error ? authErrorMessage(error.code) : null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "x-talevo-account-deletion": "confirmed" },
      });
      const payload = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) return { error: authErrorMessage(payload.code) };
      await supabase.auth.signOut({ scope: "local" });
      return { error: null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    isAuthenticated: Boolean(session?.user),
    isLoading,
    signUp,
    resendConfirmation,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    deleteAccount,
  }), [deleteAccount, isLoading, resendConfirmation, resetPassword, session, signIn, signOut, signUp, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth ต้องใช้งานภายใน SupabaseAuthProvider");
  return value;
}
