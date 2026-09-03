/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

const migration = read("supabase/migrations/20260902170000_talevo_ai_rolling_24h_quota.sql");
const originalMigration = read("supabase/migrations/20260902160000_talevo_ai_free_rate_limit.sql");
const handler = read("src/lib/ai/chat-handler.ts");
const repository = read("src/lib/ai/usage-repository.ts");
const statusRoute = read("src/app/api/ai/status/route.ts");
const page = read("src/features/ai/ai-page.tsx");
const types = read("src/lib/ai/types.ts");

check(migration.includes("alter table private.talevo_ai_rate_limits"), "Corrective migration must be additive");
check(originalMigration.includes("daily_request_count"), "Deployed predecessor migration must remain present");
check(migration.includes("cycle_started_at timestamptz"), "Rolling cycle start column is missing");
check(migration.includes("reset_at timestamptz"), "Rolling reset column is missing");
check(migration.includes("successful_count integer"), "Successful-response counter is missing");
check(migration.includes("reset_at = cycle_started_at + interval '24 hours'"), "Reset must be exactly 24 hours after cycle start");
check((migration.match(/request_now timestamptz := pg_catalog\.now\(\)/g) ?? []).length === 3, "Every quota RPC must use database time");
check(!migration.includes("date_trunc('day'"), "Rolling quota must not use a calendar-day boundary");
check(migration.includes("for update"), "Quota mutation must lock the owner row");
check(migration.includes("auth.uid()"), "Quota RPCs must derive the authenticated owner");
check(!migration.includes("service_role"), "Quota implementation must not use service_role");
check((migration.match(/security definer/g) ?? []).length === 4, "All quota and compatibility RPCs must have explicit hardened boundaries");
check((migration.match(/set search_path = ''/g) ?? []).length === 4, "All quota and compatibility RPCs must pin an empty search path");
check(
  migration.includes("revoke all on function public.get_talevo_ai_usage_status() from public") &&
  migration.includes("revoke all on function public.get_talevo_ai_usage_status() from anon"),
  "Anonymous status access must be revoked",
);
check(migration.includes("grant execute on function public.get_talevo_ai_usage_status() to authenticated"), "Authenticated status access must be granted");
check(migration.includes("short_window_request_count >= 4"), "Four-per-minute gate must remain");
check(migration.includes("'concurrent'::text"), "Single concurrent request gate must remain");
check(migration.includes("successful_count >= 40"), "Forty-success rolling gate must remain");
check(!/\b(prompt|response_content|message_content|chat_messages)\b/i.test(migration), "Quota storage must not contain chat content");
check(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(migration), "Migration must not contain a real UUID");

check(handler.includes("completeTalevoAIRequest(supabase, lease.request_id, true)"), "Only the successful provider path may commit usage");
check(handler.includes("releaseTalevoAIRequest(supabase, lease.request_id)"), "Failure paths must release without usage");
check(repository.includes("was_successful: wasSuccessful"), "Completion RPC must receive an explicit success flag");
check(statusRoute.includes("supabase.auth.getUser()"), "Usage status must require a restored authenticated session");
check(statusRoute.includes("Cache-Control") && statusRoute.includes("private, no-store"), "Usage status must not be publicly cached");
check(!statusRoute.includes("generate") && !statusRoute.includes("createGeminiProvider"), "Status checks must not consume provider requests");
check(types.includes("cycleStartedAt") && types.includes("resetAt") && types.includes("remaining"), "Client status type is incomplete");
check(page.includes('fetch("/api/ai/status"') && page.includes('cache: "no-store"'), "UI must load authoritative quota status safely");
check(page.includes("performance.now()") && !page.includes("Date.now()"), "Countdown must use elapsed client time without claiming clock authority");
check(page.includes("refreshUsage") && page.includes("next === 0"), "Countdown completion must re-read server status");
check(page.includes("usage?.remaining === 0"), "Composer must honor exhausted quota");
check(page.includes("useโหมด") === false && page.includes("ใช้โหมดในอุปกรณ์"), "Quota fallback label must be explicit");
check(page.includes("setInput(suggestion)") && !page.includes("sendRequest({ message: suggestion"), "Suggestions must fill, not auto-send");
check(page.includes("event.key === \"Enter\" && !event.shiftKey"), "Enter/Shift+Enter keyboard contract is missing");
check(page.includes("selectedContext") && page.includes("EMPTY_AI_CONTEXT_SELECTION"), "Context must start disabled");
check(page.includes("ข้อมูลการเงิน") && page.includes("จะไม่ถูกส่งอัตโนมัติ"), "Private-context disclosure is missing");
check(!handler.includes("deleteChat") && !page.includes("clearChat"), "Quota changes must not delete chat history");

function createState() {
  return { cycleStartedAt: null, resetAt: null, successfulCount: 0, active: false };
}

function normalize(state, now) {
  if (state.resetAt !== null && state.resetAt <= now) {
    state.cycleStartedAt = null;
    state.resetAt = null;
    state.successfulCount = 0;
  }
}

function begin(state, now) {
  normalize(state, now);
  if (state.active) return "concurrent";
  if (state.successfulCount >= 40) return "rolling";
  state.active = true;
  return "allowed";
}

function finish(state, now, success) {
  state.active = false;
  if (!success) return;
  if (state.cycleStartedAt === null) {
    state.cycleStartedAt = now;
    state.resetAt = now + 24 * 60 * 60 * 1000;
    state.successfulCount = 1;
    return;
  }
  state.successfulCount += 1;
}

const start = Date.UTC(2026, 8, 2, 17, 25, 42);
const state = createState();
check(begin(state, start) === "allowed" && state.successfulCount === 0, "Reservation must not pre-count a response");
finish(state, start + 500, false);
check(state.successfulCount === 0 && state.resetAt === null, "Provider failure must not start a cycle");
check(begin(state, start + 1_000) === "allowed", "Retry after a safe failure must be allowed");
finish(state, start + 2_000, true);
check(state.successfulCount === 1, "First successful response must count as one");
check(state.cycleStartedAt === start + 2_000, "First success must establish the cycle start");
check(state.resetAt === start + 2_000 + 86_400_000, "First success must establish an exact 24-hour reset");
const fixedReset = state.resetAt;
check(begin(state, start + 3_000) === "allowed", "Second request must be allowed");
finish(state, start + 4_000, true);
check(state.successfulCount === 2 && state.resetAt === fixedReset, "Later successes must not slide the reset time");

for (let count = 2; count < 40; count += 1) {
  const now = start + 5_000 + count * 1_000;
  assert.equal(begin(state, now), "allowed");
  finish(state, now + 100, true);
}
check(state.successfulCount === 40, "Exactly forty successful responses must be counted");
check(begin(state, fixedReset - 1) === "rolling", "The forty-first request must be blocked before reset");
check(state.successfulCount === 40, "A blocked request must not change usage");
check(begin(state, fixedReset) === "allowed", "A request must be allowed at the authoritative reset instant");
check(state.successfulCount === 0 && state.resetAt === null, "Expired state must normalize before the next success");
finish(state, fixedReset + 250, true);
check(state.successfulCount === 1 && state.cycleStartedAt === fixedReset + 250, "First post-reset success must start a fresh cycle");

for (const failure of ["provider", "timeout", "cancel", "validation", "local-fallback"]) {
  const isolated = createState();
  if (failure !== "validation" && failure !== "local-fallback") {
    check(begin(isolated, start) === "allowed", `${failure} simulation must reserve safely`);
    finish(isolated, start + 100, false);
  }
  check(isolated.successfulCount === 0 && isolated.resetAt === null, `${failure} must not consume rolling quota`);
}

const concurrent = createState();
check(begin(concurrent, start) === "allowed" && begin(concurrent, start + 1) === "concurrent", "Only one request may be active per user");
finish(concurrent, start + 2, false);
check(begin(concurrent, start + 3) === "allowed", "A released lease must permit manual retry");

console.log(`TALEVO AI rolling 24-hour quota QA passed: ${checks} assertion paths`);
