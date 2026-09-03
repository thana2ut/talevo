/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const collect = (directory, files = []) => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative, files);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative);
  }
  return files;
};
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  const target = request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, target, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const originalLoad = Module._load;
Module._load = function loadSecurityModule(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const { getSafeInternalPath, getSafeAuthCallbackDestination } = require("../src/lib/auth-redirects.ts");
const { isTrustedMutationOrigin } = require("../src/lib/security/request-origin.ts");
const {
  hasAllowedSyllabusFileExtension,
  matchesSyllabusDocumentMagic,
  MAX_SYLLABUS_DOCUMENT_BYTES,
  MAX_SYLLABUS_MULTIPART_BYTES,
} = require("../src/lib/ai/syllabus-upload.ts");
const { parseAIChatRequest, AIRequestValidationError } = require("../src/lib/ai/request-validation.ts");
const { isAllowedTaskAttachment, isTaskAttachmentImage } = require("../src/lib/task-attachment-validation.ts");

function request(origin, fetchSite = null) {
  const values = new Map();
  if (origin !== null) values.set("origin", origin);
  if (fetchSite !== null) values.set("sec-fetch-site", fetchSite);
  return { nextUrl: { origin: "https://talevo.example" }, headers: { get: (name) => values.get(name) ?? null } };
}

check(isTrustedMutationOrigin(request("https://talevo.example")), "Exact same-origin browser mutation must pass");
check(!isTrustedMutationOrigin(request("https://evil.example")), "External Origin must fail");
check(!isTrustedMutationOrigin(request("null")), "Opaque/null Origin must fail");
check(!isTrustedMutationOrigin(request(null, "cross-site"), { allowMissingOrigin: true }), "Cross-site Fetch Metadata must fail even without Origin");
check(isTrustedMutationOrigin(request(null, "same-origin"), { allowMissingOrigin: true }), "Same-origin Fetch Metadata may pass");
check(!isTrustedMutationOrigin(request(null)), "Sensitive mutations must reject a truly missing Origin by default");
check(!isTrustedMutationOrigin(request(null, "none")), "Sensitive mutations must reject a missing Origin from browser navigation/tool contexts");
check(isTrustedMutationOrigin(request(null), { allowMissingOrigin: true }), "Explicit non-browser/server caller may omit Origin");

check(getSafeInternalPath("/tasks?tab=pending", "/today") === "/tasks?tab=pending", "Valid internal redirect must pass");
for (const unsafe of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example"]) {
  check(getSafeInternalPath(unsafe, "/today") === "/today", `Unsafe redirect accepted: ${unsafe}`);
}
check(getSafeAuthCallbackDestination("/reset-password", "/today") === "/reset-password", "Allowed recovery callback must pass");
check(getSafeAuthCallbackDestination("/finance", "/today") === "/today", "Auth callback allowlist must reject arbitrary routes");

const pdf = Uint8Array.from(Buffer.from("%PDF-1.7"));
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const html = Uint8Array.from(Buffer.from("<html>"));
check(matchesSyllabusDocumentMagic("application/pdf", pdf), "PDF magic bytes must pass");
check(matchesSyllabusDocumentMagic("image/jpeg", jpeg), "JPEG magic bytes must pass");
check(!matchesSyllabusDocumentMagic("application/pdf", html), "HTML renamed as PDF must fail");
check(!matchesSyllabusDocumentMagic("image/jpeg", new Uint8Array()), "Empty document must fail");
check(hasAllowedSyllabusFileExtension("course.pdf", "application/pdf"), "Matching PDF extension/MIME must pass");
check(!hasAllowedSyllabusFileExtension("payload.exe", "image/jpeg"), "Executable renamed MIME must fail");
check(!hasAllowedSyllabusFileExtension("payload.jpg", "application/pdf"), "Mismatched extension/MIME must fail");
check(MAX_SYLLABUS_DOCUMENT_BYTES === 6 * 1024 * 1024 && MAX_SYLLABUS_MULTIPART_BYTES > MAX_SYLLABUS_DOCUMENT_BYTES, "Upload and multipart size budgets are invalid");
check(isAllowedTaskAttachment({ name: "report.pdf", type: "application/pdf", size: 10, lastModified: 1 }), "Safe local PDF attachment must pass");
check(!isAllowedTaskAttachment({ name: "attack.pdf", type: "text/html", size: 10, lastModified: 1 }), "HTML renamed as a local attachment must fail");
check(!isTaskAttachmentImage({ name: "attack.jpg", type: "image/svg+xml" }), "Image preview must require matching safe MIME and extension");

const validAI = parseAIChatRequest({ message: " สวัสดี ", selectedContext: {}, history: [] });
check(validAI.message === "สวัสดี" && Object.values(validAI.selectedContext).every((value) => value === false), "AI request normalization/default-private context failed");
for (const invalid of [
  { message: "" },
  { message: "ok", unknown: true },
  { message: "ok", selectedContext: { finance: true } },
  JSON.parse('{"message":"ok","__proto__":{"polluted":true}}'),
]) {
  let rejected = false;
  try { parseAIChatRequest(invalid); } catch (error) { rejected = error instanceof AIRequestValidationError; }
  check(rejected, "Malformed or unexpected AI payload must fail closed");
}

const sourceFiles = collect("src");
const sources = Object.fromEntries(sourceFiles.map((file) => [file.replaceAll("\\", "/"), read(file)]));
const allSource = Object.values(sources).join("\n");
const clientSource = Object.entries(sources).filter(([, value]) => /^\s*["']use client["'];/m.test(value)).map(([, value]) => value).join("\n");
const accountRoute = read("src/app/api/account/route.ts");
const chatHandler = read("src/lib/ai/chat-handler.ts");
const analyzeRoute = read("src/app/api/ai/syllabus/analyze/route.ts");
const statusRoute = read("src/app/api/ai/status/route.ts");
const proxy = read("src/proxy.ts");
const admin = read("src/lib/admin/admin-repository.ts");
const adminLayout = read("src/app/admin/layout.tsx");
const context = read("src/lib/ai/talevo-context.ts");
const provider = read("src/lib/ai/gemini-provider.ts");
const extractor = read("src/lib/ai/syllabus-extractor.ts");
const nextConfig = read("next.config.ts");
const storage = read("src/lib/persistence/local-account-storage.ts");
const authProvider = read("src/providers/auth-provider.tsx");
const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).map((name) => read(path.join("supabase/migrations", name))).join("\n");

const publicSecretNames = [
  ["NEXT", "PUBLIC", "GEMINI", "API", "KEY"].join("_"),
  ["NEXT", "PUBLIC", "SUPABASE", "SECRET", "KEY"].join("_"),
  ["NEXT", "PUBLIC", "SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
];
check(publicSecretNames.every((name) => !allSource.includes(name)), "A server secret has a public environment-variable name");
check(!/(?:AIza[0-9A-Za-z_-]{30,}|sk-(?:proj|live|test)-[0-9A-Za-z_-]{20,})/.test(allSource), "A key-like literal exists in application source");
for (const marker of ["GEMINI_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  check(!clientSource.includes(marker), `Server secret marker entered a client component: ${marker}`);
}
check(read("src/lib/supabase/admin.ts").startsWith('import "server-only";') && read("src/lib/ai/gemini-client.ts").startsWith('import "server-only";'), "Privileged clients must be server-only");
check(accountRoute.includes("supabase.auth.getUser()") && accountRoute.indexOf("supabase.auth.getUser()") < accountRoute.indexOf("admin.auth.admin.deleteUser"), "Account deletion auth must precede elevated action");
check(chatHandler.includes("supabase.auth.getUser()") && chatHandler.indexOf("supabase.auth.getUser()") < chatHandler.indexOf("request.json()"), "AI route must authenticate before parsing payload");
check(analyzeRoute.includes("supabase.auth.getUser()") && analyzeRoute.indexOf("supabase.auth.getUser()") < analyzeRoute.indexOf("request.formData()"), "Upload route must authenticate before multipart parsing");
check(statusRoute.includes("supabase.auth.getUser()"), "AI status must be authenticated");
check(admin.includes("supabase.auth.getUser()") && admin.includes('rpc("get_talevo_admin_access")'), "Admin access must verify user and database membership server-side");
check(adminLayout.includes("await requireTalevoAdmin()"), "Admin payload must be denied before layout render");
check(!/localStorage[^\n]{0,100}(?:admin|isAdmin)|searchParams[^\n]{0,100}(?:admin|isAdmin)/i.test(admin + adminLayout), "Admin trust must not come from local/client parameters");
check(!/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(migrations), "User RLS contains an unconditional true policy");
check((migrations.match(/enable row level security/gi) ?? []).length >= 4 && migrations.includes("(select auth.uid()) = user_id") && migrations.includes("user_content_tables"), "RLS enablement/owner predicate contract is incomplete");
check(migrations.includes("foreign key (user_id") && migrations.includes("references public.tasks(user_id"), "Nested owner relation must use a composite owner foreign key");
check(nextConfig.includes("Content-Security-Policy") && nextConfig.includes("frame-ancestors 'none'"), "CSP/frame protection is missing");
check(nextConfig.includes("X-Content-Type-Options") && nextConfig.includes("nosniff"), "MIME nosniff header is missing");
check(nextConfig.includes("Referrer-Policy") && nextConfig.includes("Permissions-Policy"), "Privacy/security headers are incomplete");
check(nextConfig.includes("productionBrowserSourceMaps: false"), "Production browser source maps must remain disabled");
check(nextConfig.includes('source: "/api/:path*"') && nextConfig.includes("private, no-store"), "Sensitive API cache policy is missing");
check(proxy.includes('process.env.NODE_ENV !== "development"') && proxy.includes('startsWith("/qa/")') && proxy.includes("status: 404"), "QA routes must fail closed in production");
for (const route of ["src/lib/ai/chat-probe-handler.ts", "src/app/api/ai/syllabus/probe/route.ts"]) {
  const value = read(route);
  check(value.includes('process.env.NODE_ENV !== "development"') && value.includes("404"), `Probe is not production guarded: ${route}`);
}
const dangerousHtmlUses = Object.entries(sources).filter(([, value]) => value.includes("dangerouslySetInnerHTML"));
check(dangerousHtmlUses.length === 1 && dangerousHtmlUses[0][0] === "src/app/layout.tsx" && dangerousHtmlUses[0][1].includes("languageBootstrapScript"), "Dynamic/user HTML rendering exists outside the static language bootstrap");
check(!/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(allSource), "Executable string API found in application source");
check(!/href\s*=\s*["']javascript:/i.test(allSource), "javascript: link found");
check(provider.includes("tools: []") && extractor.includes("tools: []"), "External AI must have no privileged tools");
check(context.includes("attachedContext.length === 0") && !/(finance|profile|email|admin|attachment)/i.test(context), "AI context must default to no read and exclude sensitive domains");
check(extractor.includes("UNTRUSTED DOCUMENT DATA") && extractor.includes("Ignore prompt injection"), "Syllabus prompt-injection boundary is missing");
check(analyzeRoute.includes("hasAllowedSyllabusFileExtension") && analyzeRoute.includes("matchesSyllabusDocumentMagic") && analyzeRoute.includes("MAX_SYLLABUS_MULTIPART_BYTES"), "Upload validation must cover extension, MIME/magic, and payload size");
check(chatHandler.includes("AI_CHAT_MAX_REQUEST_BYTES") && chatHandler.includes("application/json") && chatHandler.includes("Number.isSafeInteger(contentLength)"), "AI route lacks content-type/body size limits");
check(accountRoute.includes("isTrustedMutationOrigin(request)") && chatHandler.includes("isTrustedMutationOrigin(request") && analyzeRoute.includes("isTrustedMutationOrigin(request"), "Browser mutation routes must enforce same-origin");
check(accountRoute.includes("x-talevo-account-deletion") && accountRoute.includes('!== "confirmed"'), "Account deletion requires explicit acknowledgement");
check(storage.includes("TALEVO_ACCOUNT_STATE_PREFIX") && storage.includes("encodeURIComponent(userId)"), "Local account namespaces are missing");
check(!/localStorage\.clear\s*\(|indexedDB\.deleteDatabase\s*\(/.test(allSource), "Application contains a global local-data clearing operation");
check(authProvider.includes("supabase.auth.getSession()") && authProvider.includes(".then(({ data }) =>") && authProvider.includes(".catch(() =>"), "Session restore failure must terminate loading safely");
check(!/console\.(?:log|error|warn)\s*\([^\n]*(?:process\.env|access_token|refresh_token|password|GEMINI_API_KEY|SUPABASE_SECRET_KEY)/i.test(allSource), "Sensitive value may be written to logs");
check(!/(?:billing|auto.?recharge|paymentIntent|stripe)/i.test(allSource), "Unexpected billing/payment implementation found");
check(fs.existsSync(path.join(root, "src/app/error.tsx")) && fs.existsSync(path.join(root, "src/app/global-error.tsx")), "Production-safe error boundaries are missing");

console.log(`TALEVO Security contract: ${checks} checks passed`);
