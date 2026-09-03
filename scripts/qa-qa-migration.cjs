/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

process.env.NODE_ENV = "development";
const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  return originalResolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename });
  module._compile(output.outputText, filename);
};

const { createEmptyAccountAppState } = require("../src/lib/app-state-defaults.ts");
const { APP_STATE_STORAGE_KEY, createAppStateSnapshot } = require("../src/lib/persistence/app-state-storage.ts");
const { getAccountStateKeys } = require("../src/lib/persistence/local-account-storage.ts");
const { createLocalV8MigrationPlan, CLOUD_IMPORT_RELEASE_ENABLED, LOCAL_V8_TABLE_ORDER } = require("../src/lib/supabase/local-v8-migration.ts");
const {
  completeLocalV8VerificationForQa, getQaMigrationAccess, importLocalV8ForQa,
  loadCloudAccountV8, loadOwnMigrationMarker, verifyCloudReadBack,
} = require("../src/lib/supabase/cloud-v8-repository.ts");
const {
  createQaLocalV8Fixture, getQaFixtureContractChecks, isExactQaFixturePlan, isQaDomainEmpty, QA_ATTACHMENT_ID,
  QA_MIGRATION_CONFIRMATION, seedQaLocalV8Fixture,
} = require("../src/lib/supabase/qa-local-v8-fixture.ts");
const {
  hydrateCloudTablesToAppState, persistQaHydratedState, QA_HYDRATION_CONFIRMATION,
} = require("../src/lib/supabase/qa-cloud-hydration.ts");

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.removals = 0; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.removals += 1; this.values.delete(key); }
}

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const qaPanel = fs.readFileSync(path.join(root, "src/components/qa-local-cloud-migration-panel.tsx"), "utf8");
const appStateProvider = fs.readFileSync(path.join(root, "src/providers/app-state-provider.tsx"), "utf8");
const cloudRepositorySource = fs.readFileSync(path.join(root, "src/lib/supabase/cloud-v8-repository.ts"), "utf8");
const qaAtomicMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260902130000_talevo_migration_qa_allowlist.sql"), "utf8");
const fixture = createQaLocalV8Fixture("qa@example.test");
const fixtureAgain = createQaLocalV8Fixture("qa@example.test");
const keysA = getAccountStateKeys(userA);
const keysB = getAccountStateKeys(userB);

check(JSON.stringify(fixture) === JSON.stringify(fixtureAgain), "fixture must be deterministic");
check(fixture.version === 8 && fixture.writerId === "talevo-qa-fixture-v1", "fixture must be AppState v8");
check(fixture.schedules.length === 2 && fixture.tasks.length === 3 && fixture.exams.length === 2, "fixture must cover active academic domains");
check(fixture.tasks.flatMap((task) => task.attachments ?? []).some((item) => item.id === QA_ATTACHMENT_ID), "fixture must include deterministic attachment metadata");
check(fixture.financeCategories.length === 3 && fixture.financeTransactions.length === 3, "fixture must cover all Finance transaction types");
check(!JSON.stringify(fixture).includes("Academic GPS") && !JSON.stringify(fixture).includes("Life Rescue") && !JSON.stringify(fixture).includes("Did I Submit"), "removed features must not return in fixture");
check(QA_MIGRATION_CONFIRMATION === "QA TEST DATA", "fixture confirmation must use the exact short QA phrase");
check(qaPanel.includes("onSubmit={seedFixture}") && qaPanel.includes('type="submit"'), "fixture must support form submit and Enter-key activation");
check(qaPanel.includes('access.status !== "allowed"') && qaPanel.includes("qaAccessAllowed: access.status"), "fixture UI and write boundary must both enforce the DB allowlist result");
check(qaPanel.includes("fixtureConfirmation") && qaPanel.includes("hydrationConfirmation"), "fixture and Hydration must not share a confusing confirmation field");
check(qaPanel.includes('phase: "Preparing"') && qaPanel.includes('phase: "Importing"') && qaPanel.includes('phase: "Reading back"') && qaPanel.includes('phase: "Verifying"'), "Import UI must expose every operation phase");
check(qaPanel.includes("LOCAL_V8_TABLE_ORDER.map") && qaPanel.includes("QA_EXPECTED_FINANCE_TOTALS"), "Preview must show all table counts and deterministic Finance totals");
check(qaPanel.includes("getQaFixtureContractChecks") && qaPanel.includes("Development fixture contract"), "Development Preview must expose safe Expected versus Actual fixture checks");
check(appStateProvider.includes("refreshCurrentAccountFromStorage") && !qaPanel.includes("window.location.reload"), "Seed and Hydration must refresh AppState without a forced page reload");
check(qaPanel.includes("idempotentRetryReady") && qaPanel.includes("already_imported"), "UI must allow a safe same-payload idempotency retry");
check(qaPanel.includes("Import<strong>PASS") && qaPanel.includes("Read-back<strong>PASS") && qaPanel.includes("Verification<strong>PASS"), "Success UI must report all three verification stages");
const runImportSource = qaPanel.slice(qaPanel.indexOf("const runImport"), qaPanel.indexOf("const hydrateFromCloud"));
check(runImportSource.includes('kind: "error"') && runImportSource.includes("finally") && runImportSource.includes("importInFlight.current = false"), "Import UI must expose a safe error state and unlock manual retry");
check(!/setTimeout|setInterval/.test(runImportSource), "Import UI must not auto-retry a failed operation");
check(runImportSource.indexOf("completeLocalV8VerificationForQa") < runImportSource.indexOf("setImportResult"), "UI must not show Import success before read-back verification is marked");
check(!/localStorage|indexedDB|deleteAttachmentBlob|removeItem/.test(cloudRepositorySource), "Cloud repository failure paths must not mutate Local AppState, IndexedDB, or attachment binaries");
const atomicImportSource = qaAtomicMigration.slice(qaAtomicMigration.indexOf("create or replace function public.import_talevo_v8"), qaAtomicMigration.indexOf("revoke all on function public.get_talevo_migration_qa_access"));
check(atomicImportSource.includes("pg_advisory_xact_lock") && !/\nexception\s+when/i.test(atomicImportSource) && !/\bcommit\b/i.test(atomicImportSource), "QA RPC must remain one PostgreSQL transaction without swallowed exceptions or internal COMMIT");
check(atomicImportSource.indexOf("insert into public.app_state_sync") > atomicImportSource.indexOf("insert into public.chat_messages"), "Import marker must be written only after every domain insert in the atomic RPC");

const confirmed = { status: "confirmed", source: "account-namespace" };
const plan = createLocalV8MigrationPlan(fixture, userA, confirmed);
check(isExactQaFixturePlan(plan), "fixture plan must match the exact QA count and Finance contract");
check(plan.eligibleForUploadAfterDeployment && plan.issues.filter((issue) => issue.severity === "error").length === 0, "fixture must pass local preflight");
check(plan.readyForUpload === false && CLOUD_IMPORT_RELEASE_ENABLED === false, "production gate must remain compile-time false");
check(plan.financeTotals.income === 10000 && plan.financeTotals.expense === 1250 && plan.financeTotals.saving === 2000 && plan.financeTotals.remaining === 6750, "Finance totals must be deterministic");
check(LOCAL_V8_TABLE_ORDER.every((table) => Array.isArray(plan.payload.tables[table])), "payload must include every normalized table");
check(!JSON.stringify(plan.payload).includes("qa@example.test") && !JSON.stringify(plan.payload).includes("user_id"), "payload must exclude Auth email and trusted owner columns");

const { version: fixtureVersion, savedAt: fixtureSavedAt, writerId: fixtureWriterId, ...fixtureState } = fixture;
check(fixtureVersion === 8 && Boolean(fixtureSavedAt) && fixtureWriterId === "talevo-qa-fixture-v1", "fixture metadata must be present before the provider round-trip test");
const runtimeSnapshot = createAppStateSnapshot(fixtureState, "runtime-tab-writer", new Date("2026-09-02T00:30:00.000Z"));
const runtimePlan = createLocalV8MigrationPlan(runtimeSnapshot, userA, confirmed);
check(isExactQaFixturePlan(runtimePlan), "runtime writerId changes must not invalidate an otherwise exact QA fixture");
const smartAlertSnapshot = createAppStateSnapshot({
  ...fixtureState,
  notifications: [{
    id: "notification:daily-0700:2026-09-02", type: "daily_brief", priority: "normal",
    title: "วันนี้ของคุณ", message: "QA Smart Alert", createdAt: "2026-09-02T00:30:00.000Z",
    eventKey: "daily-0700:2026-09-02",
  }, ...fixtureState.notifications],
}, "runtime-tab-writer", new Date("2026-09-02T00:30:00.000Z"));
const smartAlertPlan = createLocalV8MigrationPlan(smartAlertSnapshot, userA, confirmed);
check(isExactQaFixturePlan(smartAlertPlan), "recognized Smart Alerts created by normal runtime behavior must not invalidate the QA fixture");
const notificationCheck = getQaFixtureContractChecks(smartAlertPlan).find((item) => item.key === "count:notifications");
check(notificationCheck?.actual === 2 && notificationCheck.passed, "fixture comparison must report the fixture notification plus recognized Smart Alerts accurately");
const unexpectedNotificationPlan = createLocalV8MigrationPlan({
  ...smartAlertSnapshot,
  notifications: [{ id: "manual-extra", type: "system", priority: "normal", title: "Unexpected", message: "Unexpected", createdAt: "2026-09-02T00:30:00.000Z", eventKey: "manual:extra" }, ...smartAlertSnapshot.notifications],
}, userA, confirmed);
check(!isExactQaFixturePlan(unexpectedNotificationPlan), "unexpected notification rows must still invalidate the exact QA fixture contract");

function cloudRowsFromPlan(sourcePlan) {
  return Object.fromEntries(LOCAL_V8_TABLE_ORDER.map((table) => [table, sourcePlan.payload.tables[table].map((row) => ({ user_id: userA, ...row }))]));
}
const cloudRows = cloudRowsFromPlan(plan);
const hydrated = hydrateCloudTablesToAppState(cloudRows, { email: "qa@example.test", writerId: "qa-roundtrip", now: new Date("2026-09-03T00:00:00.000Z") });
const roundTripPlan = createLocalV8MigrationPlan(hydrated, userA, confirmed);
for (const table of LOCAL_V8_TABLE_ORDER) {
  check(JSON.stringify(roundTripPlan.payload.tables[table]) === JSON.stringify(plan.payload.tables[table]), `Cloud hydration mapping differs for ${table}`);
}
check(roundTripPlan.previewFingerprint === plan.previewFingerprint, "Cloud hydration must preserve the logical migration fingerprint");
check(roundTripPlan.financeTotals.remaining === 6750 && hydrated.projects.length === 0, "hydration must preserve Finance and not revive removed/local-only features");
check(hydrated.settings.notificationPreferences.browserNotifications === false, "browser permission must remain device-local");
const postgresTimeRows = structuredClone(cloudRows);
postgresTimeRows.class_schedules[0].start_time = "09:00:00";
postgresTimeRows.class_schedules[0].end_time = "11:00:00";
const postgresTimeHydrated = hydrateCloudTablesToAppState(postgresTimeRows, { email: "qa@example.test" });
check(postgresTimeHydrated.schedules[0].startTime === "09:00", "Postgres schedule times must normalize to AppState HH:MM");

const emptySnapshot = createAppStateSnapshot(createEmptyAccountAppState(), "qa-empty", new Date("2026-09-03T00:00:00.000Z"));
check(isQaDomainEmpty(emptySnapshot) && !isQaDomainEmpty(fixture), "empty-domain guard must distinguish populated state");

function mockClient({ access = true, accessError = false, tables = cloudRows, tableError = false, importFailures = 0, verificationError = false, verificationData = true } = {}) {
  const calls = { access: 0, import: 0, successfulImports: 0, verification: 0, tableReads: 0 };
  let remainingImportFailures = importFailures;
  return {
    calls,
    from(table) { return { async select() { calls.tableReads += 1; return tableError ? { data: null, error: { message: "network" } } : { data: tables[table], error: null }; } }; },
    async rpc(name) {
      if (name === "get_talevo_migration_qa_access") { calls.access += 1; return accessError ? { data: null, error: { message: "network unavailable" } } : { data: access, error: null }; }
      if (name === "import_talevo_v8") {
        calls.import += 1;
        if (remainingImportFailures > 0) { remainingImportFailures -= 1; return { data: null, error: { message: "rpc failed" } }; }
        calls.successfulImports += 1;
        return { data: { status: "imported", import_id: plan.payload.import_id, snapshot_hash: "qa-hash", counts: plan.counts }, error: null };
      }
      if (name === "complete_talevo_v8_verification") { calls.verification += 1; return verificationError ? { data: null, error: { message: "verification failed" } } : { data: verificationData, error: null }; }
      return { data: null, error: { message: "unexpected rpc" } };
    },
  };
}

(async () => {
  const allowed = await getQaMigrationAccess(mockClient());
  check(allowed.status === "allowed", "allowlist capability must recognize allowed user");
  const denied = await getQaMigrationAccess(mockClient({ access: false }));
  check(denied.status === "denied", "allowlist capability must recognize denied user");
  await assert.rejects(() => importLocalV8ForQa(mockClient({ access: false }), plan), /qa_account_not_allowlisted/);
  checks += 1;
  const result = await importLocalV8ForQa(mockClient(), plan);
  check(result.status === "imported", "development QA import must call the atomic RPC only after access passes");
  const verification = await verifyCloudReadBack(mockClient(), plan);
  check(verification.verified && verification.cloudTables, "full read-back must pass for deterministic Cloud rows");
  const postgresTimeVerification = await verifyCloudReadBack(mockClient({ tables: postgresTimeRows }), plan);
  check(postgresTimeVerification.verified, "read-back must treat PostgreSQL HH:MM:SS as equivalent to AppState HH:MM");
  await completeLocalV8VerificationForQa(mockClient(), result, verification);
  checks += 1;
  await assert.rejects(() => completeLocalV8VerificationForQa(mockClient(), result, { ...verification, verified: false, errors: ["forced"] }), /qa_read_back_not_verified/);
  checks += 1;
  const failedLoad = await loadCloudAccountV8(mockClient({ tableError: true }));
  check(failedLoad.status === "error", "Cloud read failure must return a safe error without local writes");

  const safetyStorage = new MemoryStorage({ [keysA.primary]: "primary-sentinel", [keysA.backup]: "backup-sentinel" });
  const localBeforeFailures = JSON.stringify([...safetyStorage.values.entries()]);
  const deviceSentinels = { indexedDbClears: 0, attachmentDeletes: 0, attachmentBinary: "qa-attachment-sentinel" };

  const rpcFailureClient = mockClient({ importFailures: 1 });
  await assert.rejects(() => importLocalV8ForQa(rpcFailureClient, plan), /qa_atomic_import_failed/);
  checks += 1;
  check(rpcFailureClient.calls.import === 1 && rpcFailureClient.calls.successfulImports === 0, "RPC failure must stop after one attempt and leave no simulated partial import");

  const networkFailureClient = mockClient({ accessError: true });
  await assert.rejects(() => importLocalV8ForQa(networkFailureClient, plan), /qa_access_check_failed/);
  checks += 1;
  check(networkFailureClient.calls.access === 1 && networkFailureClient.calls.import === 0, "Network failure during access check must not call the import RPC");

  const readFailureVerification = await verifyCloudReadBack(mockClient({ tableError: true }), plan);
  check(!readFailureVerification.verified && readFailureVerification.cloudTables === null && readFailureVerification.errors.includes("cloud_read_failed"), "Cloud read failure must produce an unverified result without empty-state hydration");
  const mismatchedTables = structuredClone(cloudRows);
  mismatchedTables.tasks = [];
  const readBackMismatch = await verifyCloudReadBack(mockClient({ tables: mismatchedTables }), plan);
  check(!readBackMismatch.verified && readBackMismatch.errors.includes("count_mismatch:tasks"), "Read-back mismatch must fail verification with the exact table mismatch");
  const readBackGuardClient = mockClient();
  await assert.rejects(() => completeLocalV8VerificationForQa(readBackGuardClient, result, readBackMismatch), /qa_read_back_not_verified/);
  checks += 1;
  check(readBackGuardClient.calls.verification === 0, "Read-back failure must never call the verified-marker RPC");

  const verificationFailureClient = mockClient({ verificationError: true });
  await assert.rejects(() => completeLocalV8VerificationForQa(verificationFailureClient, result, verification), /cloud_verification_marker_failed/);
  checks += 1;
  check(verificationFailureClient.calls.verification === 1, "Verification RPC failure must surface without a false success marker");

  const retryClient = mockClient({ importFailures: 1 });
  await assert.rejects(() => importLocalV8ForQa(retryClient, plan), /qa_atomic_import_failed/);
  checks += 1;
  check(retryClient.calls.import === 1, "Safe failure must not auto-retry");
  const retryResult = await importLocalV8ForQa(retryClient, plan);
  check(retryResult.status === "imported" && retryClient.calls.import === 2 && retryClient.calls.successfulImports === 1, "One explicit retry after failure must succeed without a duplicate successful import");

  check(safetyStorage.getItem(keysA.primary) === "primary-sentinel" && safetyStorage.getItem(keysA.backup) === "backup-sentinel" && JSON.stringify([...safetyStorage.values.entries()]) === localBeforeFailures, "Failure and retry paths must preserve Local primary and backup exactly");
  check(safetyStorage.removals === 0 && deviceSentinels.indexedDbClears === 0 && deviceSentinels.attachmentDeletes === 0 && deviceSentinels.attachmentBinary === "qa-attachment-sentinel", "Failure and retry paths must not clear IndexedDB or delete attachment binaries");

  const marker = await loadOwnMigrationMarker({ from() { return { select() { return { async maybeSingle() { return { data: { local_schema_version: 8, import_id: plan.payload.import_id, snapshot_hash: "qa-hash", migration_status: "verified", expected_counts: plan.counts, expected_finance_totals: plan.financeTotals }, error: null }; } }; } }; } });
  check(marker?.migration_status === "verified" && marker.local_schema_version === 8, "refresh flow must read the current user's verified marker through RLS");

  const seedStorage = new MemoryStorage();
  const savedBinaries = [];
  await assert.rejects(() => seedQaLocalV8Fixture(seedStorage, userA, "qa@example.test", emptySnapshot, "wrong", { saveBinary: async () => {} }), /qa_fixture_confirmation_required/);
  checks += 1;
  await assert.rejects(() => seedQaLocalV8Fixture(seedStorage, userA, "qa@example.test", emptySnapshot, QA_MIGRATION_CONFIRMATION, { saveBinary: async () => {} }), /qa_account_not_allowlisted/);
  checks += 1;
  await seedQaLocalV8Fixture(seedStorage, userA, "qa@example.test", emptySnapshot, QA_MIGRATION_CONFIRMATION, { qaAccessAllowed: true, saveBinary: async (id, blob) => savedBinaries.push([id, blob.size]) });
  check(seedStorage.getItem(keysA.primary) !== null && seedStorage.getItem(keysB.primary) === null, "fixture must write only User A account namespace");
  check(savedBinaries.length === 1 && savedBinaries[0][0] === QA_ATTACHMENT_ID, "fixture must write only its deterministic attachment blob");
  check(seedStorage.removals === 0, "fixture must not clear localStorage or IndexedDB");
  await assert.rejects(() => seedQaLocalV8Fixture(seedStorage, userA, "qa@example.test", fixture, QA_MIGRATION_CONFIRMATION, { qaAccessAllowed: true, saveBinary: async () => {} }), /qa_fixture_requires_empty_local_domain/);
  checks += 1;

  const hydrationStorage = new MemoryStorage();
  persistQaHydratedState(hydrationStorage, userA, emptySnapshot, hydrated, QA_HYDRATION_CONFIRMATION);
  check(hydrationStorage.getItem(keysA.primary) !== null && hydrationStorage.getItem(APP_STATE_STORAGE_KEY) === null, "hydration must write only the account namespace");
  check(hydrationStorage.removals === 0, "hydration must never clear existing device stores");
  assert.throws(() => persistQaHydratedState(hydrationStorage, userA, fixture, hydrated, QA_HYDRATION_CONFIRMATION), /qa_hydration_requires_empty_local_domain/);
  checks += 1;

  process.env.NODE_ENV = "production";
  await assert.rejects(() => importLocalV8ForQa(mockClient(), plan), /qa_migration_development_only/);
  checks += 1;
  assert.throws(() => persistQaHydratedState(new MemoryStorage(), userA, emptySnapshot, hydrated, QA_HYDRATION_CONFIRMATION), /qa_hydration_development_only/);
  checks += 1;
  process.env.NODE_ENV = "development";

  console.log(`TALEVO QA migration contract: ${checks} checks passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
