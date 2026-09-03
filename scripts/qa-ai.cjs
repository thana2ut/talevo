/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

// Required files
const files = {
  config: "src/lib/ai/config.ts",
  types: "src/lib/ai/types.ts",
  gateway: "src/lib/ai/gateway.ts",
  groqAdapter: "src/lib/ai/providers/groq.ts",
  geminiAdapter: "src/lib/ai/providers/gemini.ts",
  geminiProvider: "src/lib/ai/gemini-provider.ts",
  geminiClient: "src/lib/ai/gemini-client.ts",
  context: "src/lib/ai/talevo-context.ts",
  validation: "src/lib/ai/request-validation.ts",
  handler: "src/lib/ai/chat-handler.ts",
  usage: "src/lib/ai/usage-repository.ts",
  chatRoute: "src/app/api/ai/chat/route.ts",
  statusRoute: "src/app/api/ai/status/route.ts",
  ui: "src/features/ai/ai-page.tsx",
  uiPage: "src/app/ai/page.tsx",
  migration: "supabase/migrations/20260902170000_talevo_ai_rolling_24h_quota.sql",
  localAI: "src/lib/local-ai.ts",
};

for (const [key, file] of Object.entries(files)) {
  check(exists(file), `Missing AI architecture file (${key}): ${file}`);
}

const packageJson = JSON.parse(read("package.json"));
const config = read(files.config);
const types = read(files.types);
const gateway = read(files.gateway);
const groqAdapter = read(files.groqAdapter);
const geminiAdapter = read(files.geminiAdapter);
const geminiProvider = read(files.geminiProvider);
const geminiClient = read(files.geminiClient);
const context = read(files.context);
const handler = read(files.handler);
const statusRoute = read(files.statusRoute);
const ui = read(files.ui);
const localAI = read(files.localAI);

// -------------------------------------------------------------
// Point 1 & 2: Provider Configuration Detection & Model Defaults
// -------------------------------------------------------------
check(config.includes("isAIProviderConfigured"), "Config must provide isAIProviderConfigured check");
check(config.includes("openai/gpt-oss-120b"), "Safe default model openai/gpt-oss-120b must be configured for Groq");
check(config.includes("process.env.TALEVO_AI_MODEL"), "Config must read model from process.env.TALEVO_AI_MODEL");
check(config.includes("process.env.TALEVO_AI_PROVIDER"), "Config must read provider from process.env.TALEVO_AI_PROVIDER");
check(packageJson.dependencies["groq-sdk"], "groq-sdk must be installed in package.json");
check(!packageJson.dependencies["@google/generative-ai"], "Old deprecated Google AI SDK must not be in dependencies");

// -------------------------------------------------------------
// Point 3: Provider SDK Server-Only & Boundary Checks
// -------------------------------------------------------------
check(config.startsWith('import "server-only";'), "config.ts must be server-only");
check(gateway.startsWith('import "server-only";'), "gateway.ts must be server-only");
check(groqAdapter.startsWith('import "server-only";'), "groq.ts adapter must be server-only");
check(geminiAdapter.startsWith('import "server-only";'), "gemini.ts adapter must be server-only");
check(geminiProvider.startsWith('import "server-only";'), "gemini-provider.ts must be server-only");
check(geminiClient.startsWith('import "server-only";'), "gemini-client.ts must be server-only");
check(context.startsWith('import "server-only";'), "talevo-context.ts must be server-only");
check(handler.startsWith('import "server-only";'), "chat-handler.ts must be server-only");

// Client source audit
const clientFiles = [];
function scanClientFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanClientFiles(full);
    else if (/\.(?:tsx|jsx)$/.test(entry.name) || entry.name.endsWith(".client.ts")) {
      const content = fs.readFileSync(full, "utf8");
      if (/^\s*["']use client["']/m.test(content)) clientFiles.push(content);
    }
  }
}
scanClientFiles(path.join(root, "src"));
const allClientCode = clientFiles.join("\n");
check(!allClientCode.includes("@google/genai"), "@google/genai must not be imported into client components");
check(!allClientCode.includes("groq-sdk"), "groq-sdk must not be imported into client components");
check(!allClientCode.includes("new Groq"), "Client components must not instantiate Groq");
check(!allClientCode.includes("GROQ_API_KEY"), "Client components must not reference GROQ_API_KEY");
check(!allClientCode.includes("GEMINI_API_KEY"), "Client components must not reference GEMINI_API_KEY");

// -------------------------------------------------------------
// Point 4: Auth required on chat and status endpoints
// -------------------------------------------------------------
check(handler.includes("supabase.auth.getUser()"), "Chat handler must verify Supabase session");
check(handler.indexOf("supabase.auth.getUser()") < handler.indexOf("request.json()"), "Chat handler must authenticate before parsing request body");
check(statusRoute.includes("supabase.auth.getUser()"), "Status route must verify Supabase session");

// -------------------------------------------------------------
// Point 5 & 6: Begin RPC precedes provider, and quota denial blocks call
// -------------------------------------------------------------
check(handler.includes('supabase.rpc("begin_talevo_ai_request")'), "begin_talevo_ai_request must be called");
check(handler.indexOf('begin_talevo_ai_request') < handler.indexOf('provider.generate'), "begin_talevo_ai_request must precede provider generation");
check(handler.includes("!lease?.allowed") && handler.includes("AI_RATE_LIMIT") && handler.includes("AI_BUSY"), "Lease denial must return rate-limit or busy response");

// -------------------------------------------------------------
// Point 7, 8, 9: Success & failure quota completion lifecycle
// -------------------------------------------------------------
check(handler.includes("completeTalevoAIRequest(supabase, lease.request_id, true)"), "Success path must call complete with true");
check(handler.includes("releaseTalevoAIRequest(supabase, lease.request_id)"), "Failure path must release request without consuming success quota");
check(geminiAdapter.includes("tools: []") && geminiProvider.includes("tools: []"), "Privileged tools must be disabled");

// -------------------------------------------------------------
// Point 10 & 11: On-device mode independence & zero quota usage
// -------------------------------------------------------------
check(!localAI.includes("fetch(") && !localAI.includes("http") && !localAI.includes("gemini"), "On-device mode must be network and provider independent");
check(!localAI.includes("complete_talevo_ai_request") && !localAI.includes("begin_talevo_ai_request"), "On-device mode must not consume Supabase quota");

// -------------------------------------------------------------
// Point 12 & 13: Context whitelisting & default-empty
// -------------------------------------------------------------
check(types.includes("schedule: false") && types.includes("tasks: false") && types.includes("exams: false") && types.includes("grades: false"), "Default context selection must be all false");
check(!context.includes("finance") && !context.includes("profile") && !context.includes("password"), "Context builder must exclude private and financial data");

// -------------------------------------------------------------
// Point 14 & 15: Error sanitization & raw provider internals absent from UI
// -------------------------------------------------------------
check(geminiAdapter.includes("sanitizeProviderText"), "Provider errors must be sanitized");
check(!ui.includes("GEMINI_API_KEY") && !ui.includes("GoogleGenAI"), "UI must not contain secret or SDK tokens");
check(!ui.includes("interactions.create") && !ui.includes("providerDebug"), "UI must not expose SDK operation internals");

// -------------------------------------------------------------
// Point 16 & 17: Usage status RPC integration & 40-quota presentation
// -------------------------------------------------------------
check(statusRoute.includes("getTalevoAIUsageStatus"), "Status route must call getTalevoAIUsageStatus");
check(!statusRoute.includes("generate") && !statusRoute.includes("GoogleGenAI"), "Status route must not call AI generation API");
check(ui.includes("40") && ui.includes("เหลือ"), "UI must present remaining quota in Thai");
check(ui.includes("recheckOnlineStatus"), "UI must define recheckOnlineStatus");
check(ui.includes("isRechecking"), "UI must manage isRechecking state to avoid duplicate clicks");
check(ui.includes('cache: "no-store"') && ui.includes('credentials: "same-origin"'), "Status check must use cache: no-store and credentials: same-origin");
check(ui.includes("disabled={isRechecking}"), "Retry button must be disabled while recheck is in flight");
check(ui.includes("กำลังตรวจสอบ..."), "Retry button must indicate progress while rechecking");
check(ui.includes("กำลังตรวจสอบ AI ออนไลน์..."), "Status badge must display checking state");
check(ui.includes("bypassAvailabilityCheck"), "Retry must bypass stale availability check when recheck succeeds");
check(statusRoute.includes("getActiveAIProviderLabel") && statusRoute.includes("providerLabel"), "Status route must report providerLabel");
check(ui.includes("providerLabel") || ui.includes("Groq"), "UI must display dynamic provider label");
check(groqAdapter.includes("chat.completions.create"), "Groq adapter must use Chat Completions API");
check(groqAdapter.includes("sanitizeProviderText"), "Groq provider errors must be sanitized");
check(!groqAdapter.includes("browser_search") && !groqAdapter.includes("code_interpreter"), "Groq tools must remain absent");

// -------------------------------------------------------------
// Point 18, 19, 20: 4/min, concurrency, and timeout handling
// -------------------------------------------------------------
check(handler.includes("AI_BUSY") && handler.includes("concurrent"), "Concurrent active requests must be gated");
check(geminiAdapter.includes("AI_PROVIDER_TIMEOUT") || geminiAdapter.includes("AI_PROVIDER_TIMEOUT_MS"), "Adapter must have timeout protection");
check(handler.includes("AI_TIMEOUT") || handler.includes("504"), "Handler must map timeout to 504 AI_TIMEOUT");

// -------------------------------------------------------------
// Point 21 & 22: Chat history and payload size bounds
// -------------------------------------------------------------
check(config.includes("AI_CHAT_MAX_REQUEST_BYTES"), "Chat request payload limit must be configured");
check(config.includes("AI_HISTORY_MAX_ITEMS"), "Chat history max items must be configured");
check(handler.includes("AI_CHAT_MAX_REQUEST_BYTES"), "Handler must enforce request size limits");

// -------------------------------------------------------------
// Point 23 & 24: Scanner and Academic features unchanged
// -------------------------------------------------------------
check(exists("src/lib/syllabus-scanner.ts"), "Syllabus scanner must remain present");
check(exists("src/lib/timetable-parser.ts"), "Timetable parser must remain present");
check(exists("src/features/academic/syllabus-scanner.tsx"), "Syllabus scanner UI must remain present");
const schema = read("supabase/migrations/20260901110000_talevo_v8_schema.sql");
check(schema.includes("create table public.tasks") && schema.includes("create table public.class_schedules"), "Academic schema must remain intact");

// -------------------------------------------------------------
// Runtime Unit & Mock Simulation Contracts
// -------------------------------------------------------------
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

Module._resolveFilename = function resolveTalevoAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

Module._load = function loadAIQAModule(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

async function runRuntimeContracts() {
  const { parseAIChatRequest } = require("../src/lib/ai/request-validation.ts");
  const { buildLocalAIResponse } = require("../src/lib/local-ai.ts");
  const { createAIChatHandler } = require("../src/lib/ai/chat-handler.ts");
  const { isAIProviderConfigured, getTalevoAIModel } = require("../src/lib/ai/config.ts");
  const { generateAIResponse, getConfiguredAIProvider } = require("../src/lib/ai/gateway.ts");

  // Test 1: Configuration check and model default
  const savedProvider = process.env.TALEVO_AI_PROVIDER;
  const savedModel = process.env.TALEVO_AI_MODEL;
  try {
    process.env.TALEVO_AI_PROVIDER = "groq";
    delete process.env.TALEVO_AI_MODEL;
    check(getTalevoAIModel() === "openai/gpt-oss-120b", "Default Groq model must be openai/gpt-oss-120b");
    check(getConfiguredAIProvider().id === "groq", "Gateway must return groq provider adapter when provider=groq");

    process.env.TALEVO_AI_PROVIDER = "gemini";
    check(getTalevoAIModel() === "gemini-3.7-flash", "Default Gemini model must be gemini-3.7-flash");
    check(getConfiguredAIProvider().id === "gemini", "Gateway must return gemini provider adapter when provider=gemini");
  } finally {
    if (savedProvider) process.env.TALEVO_AI_PROVIDER = savedProvider;
    else delete process.env.TALEVO_AI_PROVIDER;
    if (savedModel) process.env.TALEVO_AI_MODEL = savedModel;
  }

  // Test 2: Request validation contract
  const parsed = parseAIChatRequest({ message: "  ขอตารางเรียนวันนี้  " });
  check(parsed.message === "ขอตารางเรียนวันนี้", "Request validator must trim message");
  check(Object.values(parsed.selectedContext).every((val) => val === false), "Context must default to all false");

  // Test 3: On-device local AI query without network
  const sampleTask = { id: "t1", title: "ส่งรายงานฟิสิกส์", dueDate: "2026-09-04T12:00:00Z", status: "todo", courseId: "c1" };
  const localRes = buildLocalAIResponse({
    content: "วันนี้ต้องทำอะไรบ้าง?",
    tasks: [sampleTask],
    schedules: [],
    exams: [],
    now: new Date("2026-09-03T12:00:00Z"),
    language: "th",
    selectedContext: { schedule: false, tasks: true, exams: false, grades: false },
  });
  check(localRes.kind === "task-summary" && localRes.content.includes("มีงานที่ยังไม่เสร็จ"), "On-device mode must answer task queries purely from local data");

  // Test 4: Provider unconfigured check
  const savedGroqKey = process.env.GROQ_API_KEY;
  const savedGeminiKey = process.env.GEMINI_API_KEY;
  const savedProviderFor4 = process.env.TALEVO_AI_PROVIDER;
  try {
    process.env.TALEVO_AI_PROVIDER = "groq";
    delete process.env.GROQ_API_KEY;
    check(!isAIProviderConfigured("groq"), "isAIProviderConfigured must return false when GROQ_API_KEY is missing");
    let unconfiguredError = false;
    try {
      await generateAIResponse({ message: "test", contextBlock: "", history: [] });
    } catch (err) {
      unconfiguredError = err && err.name === "AIConfigurationError";
    }
    check(unconfiguredError, "generateAIResponse must throw AIConfigurationError when unconfigured");
  } finally {
    if (savedGroqKey) process.env.GROQ_API_KEY = savedGroqKey;
    if (savedGeminiKey) process.env.GEMINI_API_KEY = savedGeminiKey;
    if (savedProviderFor4) process.env.TALEVO_AI_PROVIDER = savedProviderFor4;
  }

  // Test 5: Chat handler full lifecycle with mock provider and Supabase RPC
  process.env.GROQ_API_KEY = "mock-groq-key";
  process.env.TALEVO_AI_PROVIDER = "groq";
  let beginRpcCalled = false;
  let completeSuccessCalled = false;
  let completeFailureCalled = false;
  let completeWasSuccessful = null;

  const mockProvider = {
    provenance: { provider: "groq", operation: "chat.completions.create", model: "openai/gpt-oss-120b" },
    isConfigured: () => true,
    generate: async (req) => {
      if (req.message === "trigger-failure") {
        const { AIProviderError } = require("../src/lib/ai/providers/gemini.ts");
        throw new AIProviderError("unavailable");
      }
      return "คำตอบทดสอบจาก AI";
    },
  };

  const handler = createAIChatHandler(mockProvider);

  // Mock Supabase createClient
  const supabaseServer = require("../src/lib/supabase/server.ts");
  const origCreateClient = supabaseServer.createClient;

  supabaseServer.createClient = async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "test-user-id" } }, error: null }),
    },
    rpc: async (fn, params) => {
      if (fn === "begin_talevo_ai_request") {
        beginRpcCalled = true;
        return { data: { allowed: true, request_id: "test-request-id", retry_after_seconds: 0 }, error: null };
      }
      if (fn === "complete_talevo_ai_request") {
        if (params?.was_successful) completeSuccessCalled = true;
        else completeFailureCalled = true;
        completeWasSuccessful = params?.was_successful;
        return {
          data: {
            accepted: true,
            limit_count: 40,
            used_count: params?.was_successful ? 1 : 0,
            remaining_count: params?.was_successful ? 39 : 40,
            cycle_started_at: new Date().toISOString(),
            reset_at: new Date().toISOString(),
            retry_after_seconds: 0,
            minute_remaining: 3,
            request_in_progress: false,
          },
          error: null,
        };
      }
      if (fn === "finish_talevo_ai_request") {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  });

  try {
    // A. Successful call simulation
    const successReq = {
      headers: new Headers({ "content-type": "application/json", "content-length": "25", origin: "http://localhost:3000" }),
      nextUrl: { origin: "http://localhost:3000" },
      json: async () => ({ message: "สวัสดี TALEVO" }),
      signal: new AbortController().signal,
    };

    const successRes = await handler(successReq);
    const successBody = await successRes.json();
    check(successRes.status === 200, "Successful chat must return HTTP 200");
    check(successBody.message === "คำตอบทดสอบจาก AI", "Success response must contain message");
    check(beginRpcCalled, "begin_talevo_ai_request must have been called");
    check(completeSuccessCalled && completeWasSuccessful === true, "complete_talevo_ai_request must commit with true on success");

    // B. Controlled failure simulation (failed Gemini call must NOT consume quota)
    const failureReq = {
      headers: new Headers({ "content-type": "application/json", "content-length": "25", origin: "http://localhost:3000" }),
      nextUrl: { origin: "http://localhost:3000" },
      json: async () => ({ message: "trigger-failure" }),
      signal: new AbortController().signal,
    };

    const failRes = await handler(failureReq);
    check(failRes.status === 503, "Provider failure must return HTTP 503");
    check(completeFailureCalled && completeWasSuccessful === false, "Failed provider call must call complete with was_successful: false");

    // C. Quota rate-limit denial simulation
    supabaseServer.createClient = async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "test-user-id" } }, error: null }) },
      rpc: async (fn) => {
        if (fn === "begin_talevo_ai_request") {
          return { data: { allowed: false, request_id: null, retry_after_seconds: 3600, reason: "rolling_quota" }, error: null };
        }
        return { data: null, error: null };
      },
    });

    const deniedRes = await handler(successReq);
    check(deniedRes.status === 429, "Rate-limited request must return HTTP 429");
    const deniedBody = await deniedRes.json();
    check(deniedBody.code === "AI_RATE_LIMIT", "Denied response must have code AI_RATE_LIMIT");

  } finally {
    supabaseServer.createClient = origCreateClient;
  }

  console.log(`TALEVO Fresh Gemini Integration QA: ${checks} checks passed`);
}

runRuntimeContracts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
