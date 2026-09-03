"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, CalendarDays, ChartNoAxesColumnIncreasing, ClipboardCheck, Eye, EyeOff, LockKeyhole, Mail, Sparkles, TriangleAlert, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Field, Input, Select, TalevoBrand, TalevoMascot } from "@/components/ui";
import { APP_BRAND } from "@/lib/brand";
import { getSafeInternalPath } from "@/lib/auth-redirects";
import { initialRegistrationDraft, registrationDataFromDraft, validateRegistration, validateRegistrationAccount, type RegistrationDraft } from "@/lib/registration-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useAuth } from "@/providers/auth-provider";
import { useLanguage } from "@/providers/language-provider";

export function WelcomePage() {
  const { sessionNotice, clearSessionNotice } = useAppState();
  useEffect(() => {
    if (!sessionNotice) return;
    const timeout = window.setTimeout(clearSessionNotice, 4000);
    return () => window.clearTimeout(timeout);
  }, [clearSessionNotice, sessionNotice]);
  return (
    <main className="welcome-page">
      <div className="welcome-background" aria-hidden="true">
        <span className="welcome-aurora welcome-aurora-primary" />
        <span className="welcome-aurora welcome-aurora-secondary" />
        <span className="welcome-study-grid" />
        <span className="welcome-ai-path welcome-ai-path-one" />
        <span className="welcome-ai-path welcome-ai-path-two" />
        <span className="welcome-ai-node welcome-ai-node-one" />
        <span className="welcome-ai-node welcome-ai-node-two" />
        <span className="welcome-ai-node welcome-ai-node-three" />
        <span className="welcome-background-spark welcome-background-spark-one" />
        <span className="welcome-background-spark welcome-background-spark-two" />
        <span className="welcome-background-spark welcome-background-spark-three" />
      </div>
      {sessionNotice && <div className="session-notice" role="status">{sessionNotice}</div>}
      <header className="welcome-brand"><TalevoBrand /></header>
      <div className="welcome-grid">
        <section className="welcome-copy">
          <span className="eyebrow"><Sparkles /> {APP_BRAND.tagline}</span>
          <h1>จัดการการเรียน<br /><em>ให้โฟกัสสิ่งสำคัญ</em></h1>
          <p>รวมตารางเรียน งาน และเป้าหมายไว้ในที่เดียว<br className="desktop-only-break" /> เพื่อให้ทุกวันเรียนได้อย่างมั่นใจ</p>
          <div className="welcome-actions desktop-welcome-actions">
            <Link className="primary-button" href="/register">เริ่มต้นใช้งาน <span className="round-arrow"><ArrowRight /></span></Link>
            <Link className="secondary-button" href="/login">เข้าสู่ระบบ</Link>
          </div>
        </section>
        <section className="welcome-visual" aria-label="ภาพประกอบ TALEVO">
          <span className="welcome-mascot-glow" aria-hidden="true" />
          <span className="welcome-orbit-line" aria-hidden="true" />
          <TalevoMascot variant="happy" crop="full" size="hero" decorative priority />
        </section>
      </div>
      <div className="welcome-actions mobile-welcome-actions">
        <Link className="primary-button" href="/register">เริ่มต้นใช้งาน <span className="round-arrow"><ArrowRight /></span></Link>
        <Link className="secondary-button" href="/login">เข้าสู่ระบบ</Link>
      </div>
      <section className="welcome-benefits" aria-label="ความสามารถของ TALEVO">
        <article className="welcome-benefit"><CalendarDays aria-hidden="true" /><span><strong>จัดการตารางเรียน</strong><small>เห็นภาพเรียนชัดเจน</small></span></article>
        <article className="welcome-benefit"><ClipboardCheck aria-hidden="true" /><span><strong>ติดตามงาน</strong><small>ไม่พลาดกำหนดส่ง</small></span></article>
        <article className="welcome-benefit"><ChartNoAxesColumnIncreasing aria-hidden="true" /><span><strong>สรุปการเรียน</strong><small>ดูเวลาที่ใช้จริง</small></span></article>
        <article className="welcome-benefit"><Bot aria-hidden="true" /><span><strong>AI ช่วยวางแผน</strong><small>เริ่มวันได้ง่ายขึ้น</small></span></article>
      </section>
    </main>
  );
}

type AuthMode = "login" | "register" | "forgot" | "resend";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { registerLocalAccount } = useAppState();
  const { signIn, signUp, resendConfirmation, resetPassword } = useAuth();
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<RegistrationDraft>(initialRegistrationDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [resendFeedback, setResendFeedback] = useState("");
  const [resendError, setResendError] = useState("");
  const [showConfirmationResend, setShowConfirmationResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const resendLockRef = useRef(false);
  const [registrationStep, setRegistrationStep] = useState<1 | 2>(1);
  const title = mode === "login" ? "ยินดีต้อนรับ" : mode === "register" ? t("auth.registerTitle") : mode === "forgot" ? "ลืมรหัสผ่าน" : "ส่งอีเมลยืนยันอีกครั้ง";
  const subtitle = mode === "login" ? "พร้อมจัดการการเรียนของคุณต่อหรือยัง?" : mode === "register" ? t("auth.registerSubtitle") : mode === "forgot" ? "กรอกอีเมลเพื่อรับคำแนะนำสำหรับตั้งรหัสผ่านใหม่" : "กรอกอีเมลที่ใช้สมัคร TALEVO เพื่อรับลิงก์ยืนยันฉบับใหม่";
  const errorMessage = (code: string) => t(`auth.validation.${code}`);
  useEffect(() => {
    if (mode !== "login") return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth-error");
      setShowConfirmationResend(authError === "invalid-link" || authError === "expired-link");
      if (authError === "invalid-link") setLoginError("ลิงก์ยืนยันไม่ถูกต้อง กรุณาขอลิงก์ใหม่");
      if (authError === "expired-link") setLoginError("ลิงก์ยืนยันหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่");
      if (authError === "expired-recovery") setLoginError("ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่");
      if (authError === "callback-failed") setLoginError("ระบบตรวจสอบลิงก์ยืนยันไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
      if (authError === "confirmation-session") setLoginError("ยืนยันอีเมลสำเร็จ แต่ระบบปิดเซสชันชั่วคราวไม่สำเร็จ กรุณาปิดหน้านี้แล้วเข้าสู่ระบบใหม่");
      if (authError === "authentication-required") setLoginError("เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง");
      if (params.get("confirmed") === "1") setLoginNotice("ยืนยันอีเมลสำเร็จแล้ว กรุณาเข้าสู่ระบบ");
      if (params.get("password-updated") === "1") setLoginNotice("ตั้งรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบ");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);
  const updateForm = <Key extends keyof RegistrationDraft>(key: Key, value: RegistrationDraft[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoginError("");
    setLoginNotice("");
    setResendFeedback("");
    setResendError("");
    setErrors((current) => {
      if (!current[key]) return current;
      const remaining = { ...current };
      delete remaining[key];
      return remaining;
    });
  };

  const continueRegistration = () => {
    const nextErrors = validateRegistrationAccount(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setRegistrationStep(2);
  };

  const resendSignupConfirmation = async () => {
    if (resendLockRef.current || isResending || resendCooldown > 0) return;
    resendLockRef.current = true;
    setIsResending(true);
    setResendFeedback("");
    setResendError("");
    const result = await resendConfirmation(form.email);
    if (result.error) setResendError(result.error);
    else {
      setResendCooldown(60);
      setResendFeedback("ส่งอีเมลยืนยันฉบับใหม่แล้ว กรุณาตรวจทั้งกล่องจดหมายและโฟลเดอร์สแปม");
    }
    setIsResending(false);
    resendLockRef.current = false;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    if (mode === "register" && registrationStep === 1) {
      continueRegistration();
      return;
    }
    const nextErrors: Record<string, string> = mode === "register"
      ? validateRegistration(form)
      : {};
    if (mode !== "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = "email";
    if (mode === "login" && form.password.length < 8) nextErrors.password = "password";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (mode === "register") setRegistrationStep(nextErrors.displayName || nextErrors.email || nextErrors.password || nextErrors.confirmPassword ? 1 : 2);
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    if (mode === "forgot") {
      const result = await resetPassword(form.email);
      if (result.error) setLoginError(result.error);
      else setSent(true);
    } else if (mode === "resend") {
      const result = await resendConfirmation(form.email);
      if (result.error) setLoginError(result.error);
      else {
        setSent(true);
        setResendCooldown(60);
      }
    } else if (mode === "register") {
      const registrationData = registrationDataFromDraft(form);
      const result = await signUp({
        email: form.email,
        password: form.password,
        profile: registrationData.profile,
        academicTerm: registrationData.academicTerm,
      });
      if (result.error) {
        setLoginError(result.error);
      } else {
        if (!result.userId) {
          setLoginError("Supabase ไม่ได้ส่งข้อมูลบัญชีกลับมา กรุณาลองเข้าสู่ระบบก่อนบันทึกข้อมูลในอุปกรณ์");
          setIsSubmitting(false);
          submitLockRef.current = false;
          return;
        }
        registerLocalAccount(registrationData.profile, registrationData.academicTerm, result.userId);
        if (result.requiresEmailConfirmation) {
          setSent(true);
          setResendCooldown(60);
        }
        else {
          router.push("/today");
          router.refresh();
        }
      }
    } else {
      const result = await signIn(form.email, form.password);
      if (result.error) {
        setLoginError(result.error);
      } else {
        const params = new URLSearchParams(window.location.search);
        router.push(getSafeInternalPath(params.get("next"), "/today"));
        router.refresh();
      }
    }
    setIsSubmitting(false);
    submitLockRef.current = false;
  };

  return (
    <main className={`auth-page auth-page-${mode}${mode === "forgot" || mode === "resend" ? " auth-page-login" : ""}`}>
      <aside className="auth-hero">
        <span className="auth-aurora" aria-hidden="true" />
        <span className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <span className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <span className="auth-star auth-star-one" aria-hidden="true" />
        <span className="auth-star auth-star-two" aria-hidden="true" />
        <span className="auth-star auth-star-three" aria-hidden="true" />
        <span className="auth-star auth-star-four" aria-hidden="true" />
        <Link href="/welcome"><TalevoBrand variant="compact" /></Link>
        <div className="auth-hero-copy"><span className="eyebrow"><Sparkles /> {APP_BRAND.thaiTagline}</span><h2>ทุกเป้าหมายการเรียน<br />เริ่มต้นได้อย่างมั่นใจ</h2><p>พื้นที่ที่ช่วยให้ตารางเรียน งาน และเป้าหมายของคุณเป็นเรื่องง่ายขึ้น</p></div><TalevoMascot variant="neutral" crop="full" size="lg" decorative priority />
      </aside>
      <section className="auth-panel">
        <div className="auth-mobile-brand"><Link href="/welcome"><TalevoBrand variant="compact" /></Link></div>
        <div className="auth-card">
          <span className="auth-kicker">TALEVO</span>
          <h1>{title}</h1><p>{subtitle}</p>
          {sent ? <div className="success-message"><Mail /><h3>{mode === "forgot" ? "ส่งลิงก์ตั้งรหัสผ่านแล้ว" : "ตรวจสอบอีเมลเพื่อยืนยันบัญชี"}</h3><p>{mode === "forgot" ? <>กรุณาตรวจสอบกล่องจดหมายของ <strong>{form.email}</strong> และทำตามขั้นตอนในอีเมล</> : <>ส่งลิงก์ยืนยันไปที่ <strong>{form.email}</strong> แล้ว กรุณากดลิงก์ก่อนเข้าสู่ระบบ และตรวจโฟลเดอร์สแปมหากยังไม่พบอีเมล</>}</p>{mode !== "forgot" && <><button className="secondary-button button-block" type="button" onClick={resendSignupConfirmation} disabled={isResending || resendCooldown > 0}>{isResending ? "กำลังส่งอีกครั้ง..." : resendCooldown > 0 ? `ส่งอีกครั้งได้ใน ${resendCooldown} วินาที` : "ส่งอีเมลยืนยันอีกครั้ง"}</button>{resendFeedback && <p className="auth-status-message" role="status">{resendFeedback}</p>}{resendError && <p className="form-error" role="alert">{resendError}</p>}</>}<Link className="primary-button button-block" href="/login">กลับไปเข้าสู่ระบบ</Link></div> : (
            <form className="form-grid auth-form" onSubmit={submit} noValidate>
              {mode === "register" && <div className="auth-registration-progress" role="status"><span>{t("auth.step").replace("{step}", String(registrationStep))}</span><i style={{ "--registration-progress": `${registrationStep * 50}%` } as React.CSSProperties} /></div>}
              {mode === "register" && registrationStep === 1 && <>
                <h2 className="auth-section-title">{t("auth.accountSection")}</h2>
                <Field label={`${t("auth.displayName")} *`} error={errors.displayName ? errorMessage(errors.displayName) : undefined}><div className="input-with-icon"><UserRound /><Input value={form.displayName} onChange={(event) => updateForm("displayName", event.target.value)} placeholder={t("auth.displayNamePlaceholder")} autoComplete="name" maxLength={80} /></div></Field>
              </>}
              {(mode !== "register" || registrationStep === 1) && <Field label={`${t("auth.email")} ${mode === "forgot" ? "" : "*"}`} error={errors.email ? errorMessage(errors.email) : undefined}><div className="input-with-icon"><Mail /><Input type="email" inputMode="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="name@gmail.com" autoComplete="email" /></div></Field>}
              {(!["forgot", "resend"].includes(mode) && (mode !== "register" || registrationStep === 1)) && <Field label={`${t("auth.password")} *`} error={errors.password ? errorMessage(errors.password) : undefined}><div className="input-with-icon password-input"><LockKeyhole /><Input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => updateForm("password", event.target.value)} placeholder={t("auth.passwordPlaceholder")} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}>{showPassword ? <EyeOff /> : <Eye />}</button></div></Field>}
              {mode === "register" && registrationStep === 1 && <Field label={`${t("auth.confirmPassword")} *`} error={errors.confirmPassword ? errorMessage(errors.confirmPassword) : undefined}><Input type="password" value={form.confirmPassword} onChange={(event) => updateForm("confirmPassword", event.target.value)} placeholder={t("auth.confirmPasswordPlaceholder")} autoComplete="new-password" /></Field>}
              {mode === "register" && registrationStep === 2 && <>
                <h2 className="auth-section-title">{t("auth.educationSection")}</h2>
                <div className="auth-education-fields">
                  <Field label={`${t("auth.major")} *`} error={errors.major ? errorMessage(errors.major) : undefined}><Input value={form.major} onChange={(event) => updateForm("major", event.target.value)} placeholder={t("auth.majorPlaceholder")} autoComplete="organization-title" maxLength={80} /></Field>
                  <Field label={`${t("auth.university")} *`} error={errors.university ? errorMessage(errors.university) : undefined}><Input value={form.university} onChange={(event) => updateForm("university", event.target.value)} placeholder={t("auth.universityPlaceholder")} autoComplete="organization" maxLength={80} /></Field>
                </div>
                <h2 className="auth-section-title auth-section-title-term">{t("auth.currentTermSection")}</h2>
                <div className="auth-term-fields">
                  <Field label={`${t("auth.yearLevel")} *`} error={errors.level ? errorMessage(errors.level) : undefined}><Select value={form.level} onChange={(event) => updateForm("level", event.target.value)}><option value="">{t("auth.selectYearLevel")}</option>{[1, 2, 3, 4].map((level) => <option key={level} value={`ชั้นปีที่ ${level}`}>{t("auth.yearLevelOption").replace("{level}", String(level))}</option>)}</Select></Field>
                  <Field label={`${t("auth.semester")} *`} error={errors.term ? errorMessage(errors.term) : undefined}><Select value={form.term} onChange={(event) => updateForm("term", event.target.value)}><option value="">{t("auth.selectSemester")}</option><option value="ภาคเรียนที่ 1">{t("auth.semesterOne")}</option><option value="ภาคเรียนที่ 2">{t("auth.semesterTwo")}</option><option value="ภาคฤดูร้อน">{t("auth.summerTerm")}</option></Select></Field>
                </div>
                <Field label={`${t("auth.academicYear")} *`} error={errors.academicYear ? errorMessage(errors.academicYear) : undefined}><Input inputMode="numeric" maxLength={4} value={form.academicYear} onChange={(event) => updateForm("academicYear", event.target.value.replace(/\D/g, ""))} placeholder="2569" /></Field>
              </>}
              {mode === "login" && <><p className="auth-local-notice">จัดการตารางเรียน งาน และเป้าหมายของคุณต่อได้อย่างเป็นระบบ</p>{loginNotice && <p className="auth-status-message" role="status">{loginNotice}</p>}{loginError && <><p className="form-error" role="alert">{loginError}</p>{showConfirmationResend && <Link className="auth-resend-link" href="/resend-confirmation">ขออีเมลยืนยันฉบับใหม่</Link>}</>}<div className="auth-helper"><span>เข้าสู่ระบบเพื่อกลับไปยังพื้นที่การเรียนของคุณ</span><Link href="/forgot-password">ลืมรหัสผ่าน?</Link></div></>}
              {mode !== "login" && loginError && <p className="form-error" role="alert">{loginError}</p>}
              {mode === "register" && registrationStep === 1 ? <button className="primary-button button-block" type="submit" disabled={isSubmitting}>{t("auth.next")} <ArrowRight /></button> : mode === "register" ? <div className="auth-registration-actions"><button className="secondary-button button-block auth-back-button" type="button" disabled={isSubmitting} onClick={() => setRegistrationStep(1)}><ArrowLeft />{t("auth.back")}</button><button className="primary-button button-block" type="submit" disabled={isSubmitting}>{isSubmitting ? "กำลังเชื่อมต่อ..." : t("auth.createAccount")}</button></div> : <button className="primary-button button-block" type="submit" disabled={isSubmitting}>{isSubmitting ? "กำลังเชื่อมต่อ..." : mode === "login" ? t("auth.signIn") : mode === "resend" ? "ส่งอีเมลยืนยัน" : "ส่งลิงก์ตั้งรหัสผ่าน"}</button>}
            </form>
          )}
          {!sent && <div className="auth-switch">{mode === "login" ? <>ยังไม่มีบัญชี? <Link href="/register">สมัครใช้งาน</Link></> : mode === "register" ? <>มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></> : <Link href="/login">กลับไปเข้าสู่ระบบ</Link>}</div>}
        </div>
      </section>
    </main>
  );
}

export function PasswordResetPage() {
  const { isAuthenticated, isLoading, signOut, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [updated, setUpdated] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    setError("");
    const result = await updatePassword(password);
    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      submitLockRef.current = false;
      return;
    }
    await signOut();
    setUpdated(true);
    setIsSubmitting(false);
    submitLockRef.current = false;
  };

  return (
    <main className="auth-page auth-page-login">
      <aside className="auth-hero">
        <span className="auth-aurora" aria-hidden="true" />
        <Link href="/welcome"><TalevoBrand variant="compact" /></Link>
        <div className="auth-hero-copy"><span className="eyebrow"><Sparkles /> {APP_BRAND.thaiTagline}</span><h2>ตั้งรหัสผ่านใหม่<br />เพื่อกลับมาใช้งานอย่างปลอดภัย</h2><p>ลิงก์กู้คืนใช้ได้ครั้งเดียวและมีเวลาจำกัด</p></div>
        <TalevoMascot variant="neutral" crop="full" size="lg" decorative priority />
      </aside>
      <section className="auth-panel">
        <div className="auth-mobile-brand"><Link href="/welcome"><TalevoBrand variant="compact" /></Link></div>
        <div className="auth-card">
          <span className="auth-kicker">TALEVO</span>
          <h1>ตั้งรหัสผ่านใหม่</h1>
          {isLoading ? <p role="status">กำลังตรวจสอบลิงก์กู้คืน...</p> : updated ? <div className="success-message"><LockKeyhole /><h3>ตั้งรหัสผ่านใหม่สำเร็จแล้ว</h3><p>เซสชันกู้คืนถูกออกจากระบบแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</p><Link className="primary-button button-block" href="/login?password-updated=1">ไปหน้าเข้าสู่ระบบ</Link></div> : !isAuthenticated ? <div className="success-message"><TriangleAlert /><h3>ลิงก์กู้คืนไม่พร้อมใช้งาน</h3><p>ลิงก์อาจหมดอายุ ถูกใช้ไปแล้ว หรือเปิดไม่ครบ กรุณาขอลิงก์ใหม่</p><Link className="primary-button button-block" href="/forgot-password">ขอลิงก์ใหม่</Link></div> : <form className="form-grid auth-form" onSubmit={submit} noValidate>
            <Field label="รหัสผ่านใหม่ *"><div className="input-with-icon password-input"><LockKeyhole /><Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></Field>
            <Field label="ยืนยันรหัสผ่านใหม่ *"><Input type="password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} autoComplete="new-password" /></Field>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button button-block" type="submit" disabled={isSubmitting}>{isSubmitting ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่านใหม่"}</button>
          </form>}
        </div>
      </section>
    </main>
  );
}
