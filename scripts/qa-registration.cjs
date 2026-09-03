/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTalevoAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/") ? path.join(projectRoot, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  registrationDataFromDraft,
  validateRegistration,
  validateRegistrationAccount,
  validateRegistrationEducation,
} = require("../src/lib/registration-utils.ts");

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const validDraft = {
  displayName: "ต้น",
  email: "ton@example.com",
  password: "secure88",
  confirmPassword: "secure88",
  major: "วิศวกรรมซอฟต์แวร์",
  university: "มหาวิทยาลัยมหาสารคาม",
  level: "ชั้นปีที่ 3",
  term: "ภาคเรียนที่ 2",
  academicYear: "2569",
};

check(Object.keys(validateRegistration(validDraft)).length === 0, "complete registration data should validate");
check(Object.keys(validateRegistrationAccount(validDraft)).length === 0, "account step should accept complete account data");
check(Object.keys(validateRegistrationEducation(validDraft)).length === 0, "education step should accept complete academic data");

const mapped = registrationDataFromDraft({ ...validDraft, displayName: "  ต้น  ", major: " วิศวกรรมซอฟต์แวร์ ", university: " มหาวิทยาลัยมหาสารคาม " });
check(mapped.profile.displayName === "ต้น" && mapped.profile.email === "ton@example.com", "registration must map account identity to the existing Profile model");
check(mapped.profile.major === "วิศวกรรมซอฟต์แวร์" && mapped.profile.university === "มหาวิทยาลัยมหาสารคาม", "registration must trim and map education identity to Profile");
check(mapped.academicTerm.level === "ชั้นปีที่ 3" && mapped.academicTerm.term === "ภาคเรียนที่ 2" && mapped.academicTerm.academicYear === "2569", "registration must map the current term to AcademicTerm");
check(!JSON.stringify(mapped).includes("secure88"), "passwords must never be included in Profile or AcademicTerm data");

const blankErrors = validateRegistration({ ...validDraft, displayName: "   ", email: "bad", password: "123", confirmPassword: "456", major: " ", university: "", level: "", term: "", academicYear: "26A9" });
check(blankErrors.displayName && blankErrors.email && blankErrors.password && blankErrors.confirmPassword, "account validation must report visible field errors");
check(blankErrors.major && blankErrors.university && blankErrors.level && blankErrors.term && blankErrors.academicYear, "education validation must report visible field errors");
check(validateRegistrationAccount({ ...validDraft, password: "1234567", confirmPassword: "1234567" }).password === "password", "registration must reject a seven-character password");

const profileSource = fs.readFileSync(path.join(projectRoot, "src/features/profile/profile-pages.tsx"), "utf8");
const mainProfileSource = profileSource.slice(profileSource.indexOf("export function ProfilePage"), profileSource.indexOf("export function PersonalProfilePage"));
check(!mainProfileSource.includes("profile-edit-button") && !mainProfileSource.includes("แก้ไขโปรไฟล์"), "main Profile page must not render an Edit Profile action");
check(!mainProfileSource.includes('href="/profile/edit"') && !mainProfileSource.includes("<Camera />"), "Profile must not expose an avatar upload control while durable upload is unavailable");

const authSource = fs.readFileSync(path.join(projectRoot, "src/features/public/public-pages.tsx"), "utf8");
check(authSource.includes('mode === "login" && form.password.length < 8'), "login validation must match the published eight-character password minimum");

// Regression checks for Email Confirmation Disabled Normal Flow:
const authProviderSource = fs.readFileSync(path.join(projectRoot, "src/providers/auth-provider.tsx"), "utf8");
const confirmRouteSource = fs.readFileSync(path.join(projectRoot, "src/app/auth/confirm/route.ts"), "utf8");

// 1 & 2: signUp normal flow without emailRedirectTo and returns immediate session
const signUpFnSource = authProviderSource.slice(authProviderSource.indexOf("const signUp ="), authProviderSource.indexOf("const resendConfirmation ="));
check(!signUpFnSource.includes("emailRedirectTo"), "normal signUp must not require emailRedirectTo");
check(authProviderSource.includes("requiresEmailConfirmation: !data.session"), "signUp must evaluate confirmation requirement based on session presence");
check(authProviderSource.includes("userId: data.user?.id ?? null"), "signUp must return userId on success");
check(authProviderSource.includes("identities.length === 0"), "signUp must detect empty identities array when user already exists");

// 3 & 4: normal registration does NOT render confirmation waiting screen or resend button
const registerSubmitBlock = authSource.slice(authSource.indexOf('} else if (mode === "register") {'), authSource.indexOf('} else {', authSource.indexOf('} else if (mode === "register") {')));
check(!registerSubmitBlock.includes("setSent(true)"), "normal registration must not trigger confirmation sent state");
check(!registerSubmitBlock.includes("resendCooldown"), "normal registration must not activate resend cooldown");
check(authSource.includes("isRegisterSuccess") && authSource.includes("register-success-transition"), "registration success must trigger clean transition state");
check(authSource.includes("สร้างบัญชีสำเร็จ") && authSource.includes("กำลังเตรียมพื้นที่ของคุณ..."), "registration transition must show success and preparation feedback");
check(authSource.includes('router.push("/today")'), "successful registration must route directly to /today");

// 5 & 6: resendConfirmation still retains /auth/confirm target and confirm route works for recovery/legacy
check(authProviderSource.includes("`${window.location.origin}/auth/confirm`"), "resendConfirmation callback must target /auth/confirm using current origin");
check(confirmRouteSource.includes('loginUrl.searchParams.set("confirmed", "1")'), "confirm route must redirect to /login?confirmed=1");

// 7 & 8: confirmed login message and legacy unconfirmed login feedback preserved
check(authSource.includes('params.get("confirmed") === "1"') && authSource.includes("ยืนยันอีเมลสำเร็จแล้ว กรุณาเข้าสู่ระบบ"), "confirmed=1 param must display Thai confirmation success notice");
check(authProviderSource.includes("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ"), "legacy unconfirmed sign-in must return unconfirmed message");
check(authSource.includes('result.error.includes("ยืนยันอีเมล")') && authSource.includes("setShowConfirmationResend(true)"), "unconfirmed login error must expose resend link");

// 9 & 10: resend confirmation endpoint works with 60s cooldown for recovery/legacy
check(authProviderSource.includes('type: "signup"') && authProviderSource.includes("supabase.auth.resend"), "resend must call supabase.auth.resend with type signup");
check(authSource.includes("setResendCooldown(60)") && authSource.includes("resendCooldown > 0"), "resend must activate 60s cooldown");

// 11 & 12: duplicate click prevented and form input preserved on error
check(authSource.includes("submitLockRef.current") && authSource.includes("isSubmitting"), "submit lock must prevent duplicate submissions");
check(authSource.includes('isSubmitting ? "กำลังสร้างบัญชี..." : t("auth.createAccount")'), "register button must show 'กำลังสร้างบัญชี...' while submitting");
check(!authSource.includes("setForm(initialRegistrationDraft)"), "form input must not be wiped on submission failure");

// 13 & 14: display_name and education metadata preserved
for (const field of ["display_name", "major", "university", "level", "term", "academic_year"]) {
  check(authProviderSource.includes(`${field}:`), `signUp options data must preserve metadata ${field}`);
}

// 15 & 16: no Resend or service-role secret in browser bundle
check(!authProviderSource.includes("NEXT_PUBLIC_RESEND_API_KEY"), "no Resend secret in auth-provider");
check(!authSource.includes("NEXT_PUBLIC_RESEND_API_KEY"), "no Resend secret in public-pages");
check(!authProviderSource.includes("service_role") && !authSource.includes("service_role"), "no service-role in client code");

// 17: Normalized error mapping
check(authProviderSource.includes("รูปแบบอีเมลไม่ถูกต้อง"), "error mapping for invalid email");
check(authProviderSource.includes("อีเมลนี้มีบัญชีอยู่แล้ว"), "error mapping for duplicate user");
check(authProviderSource.includes("รหัสผ่านยังไม่ตรงตามเงื่อนไข"), "error mapping for weak password");
check(authProviderSource.includes("ขณะนี้ไม่สามารถสมัครสมาชิกใหม่ได้"), "error mapping for disabled signup");
check(authProviderSource.includes("มีการส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"), "error mapping for rate limits");
check(authProviderSource.includes("ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง"), "error mapping for SMTP failure");
check(authProviderSource.includes("ไม่สามารถเชื่อมต่อระบบบัญชีได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"), "error mapping for network failure");
check(authProviderSource.includes("สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"), "error mapping for unexpected signup error");
console.log(`Registration QA passed: ${checks} checks`);
