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
      return "รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    case "email_address_not_authorized":
      return "Supabase ยังไม่อนุญาตให้ส่งอีเมลไปยังที่อยู่นี้ กรุณาตรวจการตั้งค่า SMTP";
    case "user_already_exists":
    case "email_exists":
      return "อีเมลนี้ถูกใช้สมัครบัญชีแล้ว";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "มีการลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
    case "weak_password":
      return "รหัสผ่านยังไม่ผ่านข้อกำหนดความปลอดภัย";
    case "same_password":
      return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม";
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

const networkErrorMessage = "เชื่อมต่อ Supabase ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";

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
          emailRedirectTo: getEmailConfirmationRedirectUrl(),
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
      return {
        error: error ? authErrorMessage(error.code) : null,
        requiresEmailConfirmation: !error && !data.session,
        userId: error ? null : data.user?.id ?? null,
      };
    } catch {
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
      return { error: error ? authErrorMessage(error.code) : null };
    } catch {
      return { error: networkErrorMessage };
    }
  }, [supabase]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return { error: error ? authErrorMessage(error.code) : null };
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
