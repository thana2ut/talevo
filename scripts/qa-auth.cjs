/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

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
  bindCanonicalStateToAccount,
  clearAccountStateStorage,
  createAccountStateStorage,
  getAccountStateKeys,
  inspectLocalOwnership,
  recordLocalOwnershipDecision,
} = require("../src/lib/persistence/local-account-storage.ts");
const { getSafeAuthCallbackDestination, getSafeInternalPath } = require("../src/lib/auth-redirects.ts");
const {
  APP_STATE_BACKUP_KEY,
  APP_STATE_STORAGE_KEY,
} = require("../src/lib/persistence/app-state-storage.ts");

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

check(getSafeInternalPath("/today?from=login", "/today") === "/today?from=login", "safe internal login redirect should be preserved");
for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
  check(getSafeInternalPath(unsafe, "/today") === "/today", `unsafe redirect must fall back: ${unsafe}`);
}
check(getSafeAuthCallbackDestination("/reset-password", "/today") === "/reset-password", "recovery callback destination should be allowed");
check(getSafeAuthCallbackDestination("/finance", "/today") === "/today", "auth callback should use a strict destination allowlist");

const userA = "qa-user-a";
const userB = "qa-user-b";
const emptyStorage = new MemoryStorage();
check(inspectLocalOwnership(emptyStorage, userA) === "ready", "an empty device should be ready for a fresh account namespace");

const legacyStorage = new MemoryStorage([[APP_STATE_STORAGE_KEY, "legacy-v8"]]);
check(inspectLocalOwnership(legacyStorage, userA) === "needs-adoption", "unowned canonical state must require an explicit adoption decision");
const precreatedAccountStorage = createAccountStateStorage(legacyStorage, userA);
precreatedAccountStorage.setItem(APP_STATE_STORAGE_KEY, "fresh-registration-state");
check(inspectLocalOwnership(legacyStorage, userA) === "needs-adoption", "a registration snapshot must not silently bypass the legacy-data decision");
recordLocalOwnershipDecision(legacyStorage, userA, "fresh");
check(inspectLocalOwnership(legacyStorage, userA) === "ready", "an explicit fresh-account decision must keep legacy data isolated");
legacyStorage.removeItem(getAccountStateKeys(userA).legacyDecision);
bindCanonicalStateToAccount(legacyStorage, userA);
check(inspectLocalOwnership(legacyStorage, userA) === "ready", "explicit owner binding should unlock the matching account");
check(inspectLocalOwnership(legacyStorage, userB) === "ready", "a different account must receive its own isolated namespace rather than legacy data");

const accountAStorage = createAccountStateStorage(legacyStorage, userA);
const accountBStorage = createAccountStateStorage(legacyStorage, userB);
accountAStorage.setItem(APP_STATE_STORAGE_KEY, "state-a");
accountAStorage.setItem(APP_STATE_BACKUP_KEY, "backup-a");
accountBStorage.setItem(APP_STATE_STORAGE_KEY, "state-b");
check(accountAStorage.getItem(APP_STATE_STORAGE_KEY) === "state-a", "User A should read its own local state");
check(accountBStorage.getItem(APP_STATE_STORAGE_KEY) === "state-b", "User B should read its own local state");
check(getAccountStateKeys(userA).primary !== getAccountStateKeys(userB).primary, "account namespaces must use different storage keys");
check(legacyStorage.getItem(APP_STATE_STORAGE_KEY) === "legacy-v8", "account writes must not overwrite canonical legacy v8 state");
clearAccountStateStorage(legacyStorage, userB);
check(accountAStorage.getItem(APP_STATE_STORAGE_KEY) === "state-a", "deleting User B local state must not delete User A state");
check(accountBStorage.getItem(APP_STATE_STORAGE_KEY) === null, "targeted local deletion must remove only User B state");

const authProvider = read("src/providers/auth-provider.tsx");
const publicPages = read("src/features/public/public-pages.tsx");
const confirmRoute = read("src/app/auth/confirm/route.ts");
const resendPage = read("src/app/resend-confirmation/page.tsx");
const accountRoute = read("src/app/api/account/route.ts");
const adminClient = read("src/lib/supabase/admin.ts");
const proxy = read("src/lib/supabase/proxy.ts");
const appShell = read("src/components/app-shell.tsx");
const appStateProvider = read("src/providers/app-state-provider.tsx");
const migrationPlanner = read("src/lib/supabase/local-v8-migration.ts");
const authTrigger = read("supabase/migrations/20260901112000_talevo_auth_profile_trigger.sql");
const nextConfig = read("next.config.ts");

function initializeSyntheticAdminClient(environment) {
  const source = adminClient.replace('import "server-only";', "");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: "admin.ts",
  });
  const syntheticModule = { exports: {} };
  const context = {
    module: syntheticModule,
    exports: syntheticModule.exports,
    process: { env: environment },
    require(request) {
      if (request === "@supabase/supabase-js") {
        return { createClient: (url, key, options) => ({ url, key, options }) };
      }
      if (request === "@/lib/supabase/config") {
        return { getSupabaseConfiguration: () => ({ url: "https://qa.invalid", publishableKey: "qa-public" }) };
      }
      throw new Error(`Unexpected synthetic admin import: ${request}`);
    },
  };
  vm.runInNewContext(output.outputText, context, { filename: "admin.qa.cjs" });
  return syntheticModule.exports.createAdminClient();
}

check(publicPages.includes('registrationStep === 1') && publicPages.includes('registrationStep === 2'), "Register must preserve both existing steps");
check(nextConfig.includes('allowedDevOrigins: ["127.0.0.1"]'), "Next dev must allow the local 127.0.0.1 origin so Auth forms can hydrate");
check(authProvider.includes("signInWithPassword") && authProvider.includes("email_not_confirmed"), "Login must use Supabase Auth and handle unconfirmed accounts");
check(authProvider.includes("const { data, error } = await supabase.auth.signInWithPassword") && authProvider.includes("if (!data.session || !data.user)") && authProvider.includes("setSession(data.session)"), "Login must fail closed unless Supabase returns both an authenticated user and session");
check(authProvider.includes("user_already_exists") && authProvider.includes("อีเมลนี้ถูกใช้สมัครบัญชีแล้ว"), "Registration must show a clear duplicate-email message when Supabase returns that error");
check(authProvider.includes("requiresEmailConfirmation: !data.session") || authProvider.includes("requiresEmailConfirmation: !error && !data.session"), "Sign-up without a Supabase session must require email confirmation");
check(publicPages.includes("isRegisterSuccess") && publicPages.includes("สร้างบัญชีสำเร็จ"), "Register must render success transition when account is created");
check(publicPages.includes('router.push("/today")'), "Registration with an immediate Supabase session must continue directly to Today");
check(authProvider.includes("emailRedirectTo: getEmailConfirmationRedirectUrl()") && authProvider.includes("`${window.location.origin}/auth/confirm`"), "Resend confirmation must use the current origin confirmation callback");
check(!authProvider.includes("/auth/confirm?next=/today"), "Sign-up confirmation must not carry an ambiguous Today callback");
for (const metadataField of ["display_name", "major", "university", "level", "term", "academic_year"]) {
  check(authProvider.includes(`${metadataField}:`) && authTrigger.includes(`'${metadataField}'`), `Registration metadata and trigger must preserve ${metadataField}`);
}
check(authProvider.includes("resetPasswordForEmail") && authProvider.includes("next=/reset-password"), "Forgot Password must return through the recovery callback");
check(authProvider.includes("updateUser({ password })"), "Set New Password must call Supabase updateUser");
check(publicPages.includes("password.length < 8") && publicPages.includes("password !== confirmPassword"), "Password recovery must validate minimum length and confirmation");
check(confirmRoute.includes("exchangeCodeForSession") && confirmRoute.includes("verifyOtp"), "Confirmation must support PKCE codes and token hashes");
check(confirmRoute.includes('value === "email"') && confirmRoute.includes('value === "signup"') && confirmRoute.includes('value === "recovery"'), "Token hash confirmation must allow only supported email OTP types");
check(!confirmRoute.includes('"invite",') && !confirmRoute.includes('"magiclink",') && !confirmRoute.includes('"email_change",'), "Confirmation must reject unrelated or arbitrary OTP types");
check(confirmRoute.includes("auth.getUser()") && confirmRoute.indexOf("auth.getUser()") < confirmRoute.indexOf('auth.signOut({ scope: "local" })'), "Confirmation must verify the authenticated user before clearing the temporary session");
check(confirmRoute.indexOf("if (recoveryFlow)") < confirmRoute.indexOf('auth.signOut({ scope: "local" })'), "Password recovery must keep its verified session until Reset Password");
check(confirmRoute.includes('loginUrl.searchParams.set("confirmed", "1")') && publicPages.includes("ยืนยันอีเมลสำเร็จแล้ว กรุณาเข้าสู่ระบบ"), "Successful email confirmation must return to Login with a clear success state");
for (const failure of ["invalid-link", "expired-link", "expired-recovery", "callback-failed"]) {
  check(confirmRoute.includes(failure) || publicPages.includes(failure), `Confirmation failure state missing: ${failure}`);
}
check(confirmRoute.includes("getSafeAuthCallbackDestination"), "Confirmation redirects must use the strict allowlist");
check(authProvider.includes("supabase.auth.resend") && authProvider.includes('type: "signup"'), "Resend Confirmation must use the Supabase signup resend endpoint");
check(publicPages.includes("resendCooldown") && publicPages.includes("isResending || resendCooldown > 0"), "Resend UI must enforce cooldown and double-click protection");
check(publicPages.includes("กำลังส่งอีกครั้ง") && publicPages.includes("ส่งอีเมลยืนยันฉบับใหม่แล้ว") && publicPages.includes("resendError"), "Resend UI must expose loading, success, and error states");
check(resendPage.includes('<AuthPage mode="resend" />') && publicPages.includes('href="/resend-confirmation"'), "Expired confirmation links must offer a dedicated resend route");
check(accountRoute.indexOf("auth.getUser()") < accountRoute.indexOf("admin.auth.admin.deleteUser"), "Account deletion must verify the current user before admin deletion");
check(accountRoute.includes("isTrustedMutationOrigin(request)") && accountRoute.includes("x-talevo-account-deletion"), "Account deletion must require same-origin explicit confirmation");
check(adminClient.includes('import "server-only"') && adminClient.includes("SUPABASE_SECRET_KEY"), "Admin client must be server-only and prefer the current secret environment variable");
check(adminClient.indexOf("SUPABASE_SECRET_KEY") < adminClient.indexOf("SUPABASE_SERVICE_ROLE_KEY"), "Current Supabase secret must have priority over the legacy fallback");
const syntheticPrimaryAdmin = initializeSyntheticAdminClient({ SUPABASE_SECRET_KEY: "qa-current-secret", SUPABASE_SERVICE_ROLE_KEY: "qa-legacy-secret" });
check(syntheticPrimaryAdmin?.key === "qa-current-secret", "Admin initialization must prefer the current Supabase secret");
const syntheticLegacyAdmin = initializeSyntheticAdminClient({ SUPABASE_SERVICE_ROLE_KEY: "qa-legacy-secret" });
check(syntheticLegacyAdmin?.key === "qa-legacy-secret", "Admin initialization must temporarily support the legacy fallback");
check(initializeSyntheticAdminClient({}) === null, "Admin initialization must fail closed when no server secret exists");
const forbiddenPublicSecretNames = [
  ["NEXT", "PUBLIC", "SUPABASE", "SECRET", "KEY"].join("_"),
  ["NEXT", "PUBLIC", "SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
];
const securitySources = [adminClient, authProvider, publicPages, accountRoute, appShell, appStateProvider];
for (const forbiddenName of forbiddenPublicSecretNames) {
  check(securitySources.every((source) => !source.includes(forbiddenName)), `Forbidden public server secret name found: ${forbiddenName}`);
}
check(!authProvider.includes("service_role"), "Legacy elevated role must never be exposed to browser Auth code");
check(!adminClient.includes("console.log") && !adminClient.includes("console.error"), "Admin configuration must never log environment values");
check(accountRoute.includes("admin_configuration_missing"), "Missing admin configuration must fail closed without deleting local data");
const localDeletionFlow = appStateProvider.slice(appStateProvider.indexOf("deleteUserAccount: async"), appStateProvider.indexOf("sessionNotice,", appStateProvider.indexOf("deleteUserAccount: async")));
check(localDeletionFlow.indexOf("await deleteAccount()") < localDeletionFlow.indexOf("clearAccountStateStorage"), "Local account state must only be cleared after cloud deletion succeeds");
check(!appShell.includes("LocalOwnershipGate"), "Normal authenticated startup must not be blocked by LocalOwnershipGate");
check(appStateProvider.includes("adoptExistingLocalData"), "Explicit adoption mechanism must remain available for legacy data");
check(appShell.includes('"/resend-confirmation"'), "The resend confirmation page must remain public before authentication");
check(proxy.includes("getClaims()") && proxy.includes("isProtectedRoute && !isAuthenticated"), "Protected routes must reject users without a valid Supabase claim");
check(proxy.includes("authCheckTimeoutMs = 1500") && proxy.includes("fetchWithAuthTimeout") && proxy.includes("if (!isProtectedRoute)"), "Public routes must not wait for Auth and protected-route checks must have a bounded timeout");
for (const route of ["/today", "/schedule", "/tasks", "/statistics", "/ai", "/notifications", "/profile", "/settings"]) {
  check(proxy.includes(`"${route}"`), `Protected route missing from Proxy: ${route}`);
}
check(proxy.includes('matchesRoute(pathname, "/finance") || matchesRoute(pathname, "/exams")'), "Retired finance and exam routes must redirect safely");
check(proxy.includes('matchesRoute(pathname, "/grades")') && proxy.includes('new URL("/tasks", request.url)'), "Retired grade-planning routes must redirect safely to Tasks");
check((migrationPlanner.match(/readyForUpload:\s*false/g) ?? []).length >= 2, "Local to Cloud upload must remain disabled in types and plans");
check(!/readyForUpload:\s*true/.test(migrationPlanner), "Auth completion must not enable Local to Cloud upload");

// Personalized Today greeting & user isolation contract
const { formatHomeGreeting } = require("../src/lib/greeting.ts");
const { hydrateCloudAccountToAppState } = require("../src/lib/supabase/cloud-hydration.ts");
// 1. greeting uses current authenticated display_name
check(formatHomeGreeting("ต้า") === "สวัสดี ต้า", "formatHomeGreeting with 'ต้า' must return 'สวัสดี ต้า'");
check(formatHomeGreeting("รุ้ง") === "สวัสดี รุ้ง", "formatHomeGreeting with 'รุ้ง' must return 'สวัสดี รุ้ง'");
// 2. no hard-coded user name
const todayPageSource = fs.readFileSync(path.join(projectRoot, "src/features/today/today-page.tsx"), "utf8");
check(!todayPageSource.includes('greeting = "สวัสดี ต้า"'), "Today page must not hardcode user name");
check(todayPageSource.includes("formatHomeGreeting(profile.displayName"), "Today page must derive greeting from current profile");
// 3. missing display_name -> "สวัสดี"
check(formatHomeGreeting("") === "สวัสดี", "Empty display_name must return 'สวัสดี'");
check(formatHomeGreeting(null) === "สวัสดี", "null display_name must return 'สวัสดี'");
check(formatHomeGreeting(undefined) === "สวัสดี", "undefined display_name must return 'สวัสดี'");
check(formatHomeGreeting("user@example.com") === "สวัสดี", "Email address as display_name must fallback to 'สวัสดี'");
// 4. loading profile never displays previous user's name
check(formatHomeGreeting("ต้า", true) === "สวัสดี", "Loading state must return 'สวัสดี' to prevent flashing previous user's name");
// 5. User A / User B names remain isolated
const userAState = hydrateCloudAccountToAppState({ profiles: [{ display_name: "ต้า" }] }, { email: "userA@talevo.app" });
const userBState = hydrateCloudAccountToAppState({ profiles: [{ display_name: "รุ้ง" }] }, { email: "userB@talevo.app" });
check(formatHomeGreeting(userAState.profile.displayName) === "สวัสดี ต้า", "User A must see 'สวัสดี ต้า'");
check(formatHomeGreeting(userBState.profile.displayName) === "สวัสดี รุ้ง", "User B must see 'สวัสดี รุ้ง'");
check(userBState.profile.displayName !== userAState.profile.displayName, "User B profile must be completely isolated from User A");
// 6. profile rename updates greeting correctly
check(formatHomeGreeting("ต้าคนเก่ง") === "สวัสดี ต้าคนเก่ง", "Renamed display_name must update greeting immediately");

console.log(`TALEVO Auth QA passed: ${checks} checks`);
