"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, CalendarDays, ChartNoAxesColumnIncreasing, ClipboardCheck, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Field, Input, Select, TalevoBrand, TalevoMascot } from "@/components/ui";
import { APP_BRAND } from "@/lib/brand";
import { initialRegistrationDraft, registrationDataFromDraft, validateRegistration, validateRegistrationAccount, type RegistrationDraft } from "@/lib/registration-utils";
import { useAppState } from "@/providers/app-state-provider";
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

type AuthMode = "login" | "register" | "forgot";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { profile, registerLocalAccount, startSession } = useAppState();
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<RegistrationDraft>(initialRegistrationDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [registrationStep, setRegistrationStep] = useState<1 | 2>(1);
  const title = mode === "login" ? "ยินดีต้อนรับกลับ" : mode === "register" ? t("auth.registerTitle") : "ลืมรหัสผ่าน";
  const subtitle = mode === "login" ? "พร้อมจัดการการเรียนของคุณต่อหรือยัง?" : mode === "register" ? t("auth.registerSubtitle") : "กรอกอีเมลเพื่อรับคำแนะนำสำหรับตั้งรหัสผ่านใหม่";
  const errorMessage = (code: string) => t(`auth.validation.${code}`);
  const updateForm = <Key extends keyof RegistrationDraft>(key: Key, value: RegistrationDraft[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoginError("");
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
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
    if (mode === "forgot") setSent(true);
    else if (mode === "register") {
      const registrationData = registrationDataFromDraft(form);
      registerLocalAccount(registrationData.profile, registrationData.academicTerm);
      router.push("/profile");
    } else {
      const savedEmail = profile.email.trim().toLocaleLowerCase();
      if (!savedEmail) {
        setLoginError("ยังไม่มีโปรไฟล์ในอุปกรณ์นี้ กรุณาสมัครใช้งานก่อน");
        return;
      }
      if (form.email.trim().toLocaleLowerCase() !== savedEmail) {
        setLoginError("อีเมลไม่ตรงกับโปรไฟล์ที่บันทึกไว้ในอุปกรณ์นี้");
        return;
      }
      startSession();
      router.push("/today");
    }
  };

  return (
    <main className={`auth-page auth-page-${mode}${mode === "forgot" ? " auth-page-login" : ""}`}>
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
          {sent ? <div className="success-message"><Mail /><h3>ยังไม่สามารถส่งอีเมลได้</h3><p>เวอร์ชันนี้ยังไม่ได้เชื่อมบริการอีเมล จึงไม่มีข้อความถูกส่งไปที่ <strong>{form.email}</strong></p><Link className="primary-button button-block" href="/login">กลับไปเข้าสู่ระบบ</Link></div> : (
            <form className="form-grid auth-form" onSubmit={submit} noValidate>
              {mode === "register" && <div className="auth-registration-progress" role="status"><span>{t("auth.step").replace("{step}", String(registrationStep))}</span><i style={{ "--registration-progress": `${registrationStep * 50}%` } as React.CSSProperties} /></div>}
              {mode === "register" && registrationStep === 1 && <>
                <h2 className="auth-section-title">{t("auth.accountSection")}</h2>
                <Field label={`${t("auth.displayName")} *`} error={errors.displayName ? errorMessage(errors.displayName) : undefined}><div className="input-with-icon"><UserRound /><Input value={form.displayName} onChange={(event) => updateForm("displayName", event.target.value)} placeholder={t("auth.displayNamePlaceholder")} autoComplete="name" maxLength={80} /></div></Field>
              </>}
              {(mode !== "register" || registrationStep === 1) && <Field label={`${t("auth.email")} ${mode === "forgot" ? "" : "*"}`} error={errors.email ? errorMessage(errors.email) : undefined}><div className="input-with-icon"><Mail /><Input type="email" inputMode="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="name@gmail.com" autoComplete="email" /></div></Field>}
              {(mode !== "forgot" && (mode !== "register" || registrationStep === 1)) && <Field label={`${t("auth.password")} *`} error={errors.password ? errorMessage(errors.password) : undefined}><div className="input-with-icon password-input"><LockKeyhole /><Input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => updateForm("password", event.target.value)} placeholder={t("auth.passwordPlaceholder")} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}>{showPassword ? <EyeOff /> : <Eye />}</button></div></Field>}
              {mode === "register" && registrationStep === 1 && <Field label={`${t("auth.confirmPassword")} *`} error={errors.confirmPassword ? errorMessage(errors.confirmPassword) : undefined}><Input type="password" value={form.confirmPassword} onChange={(event) => updateForm("confirmPassword", event.target.value)} placeholder={t("auth.confirmPasswordPlaceholder")} autoComplete="new-password" /></Field>}
              {mode === "register" && registrationStep === 2 && <>
                <h2 className="auth-section-title">{t("auth.educationSection")}</h2>
                <Field label={`${t("auth.major")} *`} error={errors.major ? errorMessage(errors.major) : undefined}><Input value={form.major} onChange={(event) => updateForm("major", event.target.value)} placeholder={t("auth.majorPlaceholder")} autoComplete="organization-title" maxLength={80} /></Field>
                <Field label={`${t("auth.university")} *`} error={errors.university ? errorMessage(errors.university) : undefined}><Input value={form.university} onChange={(event) => updateForm("university", event.target.value)} placeholder={t("auth.universityPlaceholder")} autoComplete="organization" maxLength={80} /></Field>
                <h2 className="auth-section-title auth-section-title-term">{t("auth.currentTermSection")}</h2>
                <div className="auth-term-fields">
                  <Field label={`${t("auth.yearLevel")} *`} error={errors.level ? errorMessage(errors.level) : undefined}><Select value={form.level} onChange={(event) => updateForm("level", event.target.value)}><option value="">{t("auth.selectYearLevel")}</option>{[1, 2, 3, 4].map((level) => <option key={level} value={`ชั้นปีที่ ${level}`}>{t("auth.yearLevelOption").replace("{level}", String(level))}</option>)}</Select></Field>
                  <Field label={`${t("auth.semester")} *`} error={errors.term ? errorMessage(errors.term) : undefined}><Select value={form.term} onChange={(event) => updateForm("term", event.target.value)}><option value="">{t("auth.selectSemester")}</option><option value="ภาคเรียนที่ 1">{t("auth.semesterOne")}</option><option value="ภาคเรียนที่ 2">{t("auth.semesterTwo")}</option><option value="ภาคฤดูร้อน">{t("auth.summerTerm")}</option></Select></Field>
                </div>
                <Field label={`${t("auth.academicYear")} *`} error={errors.academicYear ? errorMessage(errors.academicYear) : undefined}><Input inputMode="numeric" maxLength={4} value={form.academicYear} onChange={(event) => updateForm("academicYear", event.target.value.replace(/\D/g, ""))} placeholder="2569" /></Field>
              </>}
              {mode === "login" && <><p className="auth-local-notice">เวอร์ชันนี้ใช้โปรไฟล์ในอุปกรณ์เท่านั้น ยังไม่มีบัญชีออนไลน์และไม่จัดเก็บหรือตรวจสอบรหัสผ่านกับเซิร์ฟเวอร์</p>{loginError && <p className="form-error" role="alert">{loginError}</p>}<div className="auth-helper"><span>ข้อมูลอยู่ในเบราว์เซอร์ของอุปกรณ์นี้</span><Link href="/forgot-password">ลืมรหัสผ่าน?</Link></div></>}
              {mode === "register" && registrationStep === 1 ? <button className="primary-button button-block" type="submit">{t("auth.next")} <ArrowRight /></button> : <>{mode === "register" && <button className="secondary-button button-block auth-back-button" type="button" onClick={() => setRegistrationStep(1)}><ArrowLeft />{t("auth.back")}</button>}<button className="primary-button button-block" type="submit">{mode === "login" ? t("auth.signIn") : mode === "register" ? t("auth.createAccount") : "ตรวจสอบสถานะ"}</button></>}
            </form>
          )}
          {!sent && <div className="auth-switch">{mode === "login" ? <>ยังไม่มีบัญชี? <Link href="/register">สมัครใช้งาน</Link></> : mode === "register" ? <>มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></> : <Link href="/login">กลับไปเข้าสู่ระบบ</Link>}</div>}
        </div>
      </section>
    </main>
  );
}
