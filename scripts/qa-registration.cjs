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

console.log(`Registration QA passed: ${checks} checks`);
