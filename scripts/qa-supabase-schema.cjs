/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "supabase/migrations/20260901110000_talevo_v8_schema.sql"), "utf8");
const rls = fs.readFileSync(path.join(root, "supabase/migrations/20260901111000_talevo_v8_rls.sql"), "utf8");
const trigger = fs.readFileSync(path.join(root, "supabase/migrations/20260901112000_talevo_auth_profile_trigger.sql"), "utf8");
const contract = fs.readFileSync(path.join(root, "supabase/tests/talevo_rls_contract.sql"), "utf8");
const liveTwoUser = fs.readFileSync(path.join(root, "supabase/tests/talevo_live_rls_two_user.sql"), "utf8");
const migrationPlanner = fs.readFileSync(path.join(root, "src/lib/supabase/local-v8-migration.ts"), "utf8");
const atomicImport = fs.readFileSync(path.join(root, "supabase/migrations/20260902120000_talevo_v8_atomic_import.sql"), "utf8");
const atomicContract = fs.readFileSync(path.join(root, "supabase/tests/talevo_atomic_import_contract.sql"), "utf8");
const qaAllowlist = fs.readFileSync(path.join(root, "supabase/migrations/20260902130000_talevo_migration_qa_allowlist.sql"), "utf8");
const qaAllowlistContract = fs.readFileSync(path.join(root, "supabase/tests/talevo_qa_allowlist_contract.sql"), "utf8");
const qaAllowlistSetup = fs.readFileSync(path.join(root, "supabase/runbooks/talevo_qa_allowlist_setup.sql"), "utf8");

const contentTables = [
  "profiles", "academic_terms", "class_schedules", "tasks", "task_subtasks",
  "task_attachments", "task_completion_history", "exams", "exam_topics",
  "grade_plans", "grade_components", "grade_thresholds", "course_notes",
  "finance_categories", "finance_transactions",
  "saving_goals", "finance_settings", "learning_goals", "notifications",
  "dismissed_notification_events", "app_settings", "chat_messages",
];
const tables = [...contentTables, "app_state_sync"];

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

for (const table of tables) {
  const tableStart = schema.indexOf(`create table public.${table} (`);
  assert(tableStart >= 0, `Missing schema table: ${table}`);
  const tableEnd = schema.indexOf("\n);", tableStart);
  const tableSql = schema.slice(tableStart, tableEnd);
  assert(tableSql.includes("references auth.users(id) on delete cascade"), `Missing auth.users owner relation: ${table}`);
  assert(rls.includes(table), `Missing RLS registration: ${table}`);
}

const executableSchema = schema
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
for (const removedField of [
  "studyBlocks", "academicRoute", "requiresSubmission", "submittedAt",
  "submissionNote", "submissionEvidenceAttachmentIds", "submissionReminders",
]) {
  assert(!executableSchema.includes(removedField), `Removed field returned in schema: ${removedField}`);
}

assert(!executableSchema.includes("create table public.projects"), "Unused projects table must not be deployed");
assert(!rls.includes("'projects'"), "Unused projects table must not be registered for RLS");
assert(!migrationPlanner.includes("projects:"), "Unused projects rows must not be prepared for cloud import");

function tableSql(table) {
  const start = schema.indexOf(`create table public.${table} (`);
  const end = schema.indexOf("\n);", start);
  return schema.slice(start, end);
}

const profilesSql = tableSql("profiles");
assert(!/\bemail\b/.test(profilesSql), "Auth email must not be duplicated in profiles");
assert(!profilesSql.includes("avatar_path"), "Local object URL must not be represented as a cloud avatar path");

const academicTermsSql = tableSql("academic_terms");
assert(academicTermsSql.includes("char_length(level) <= 60"), "Academic level must preserve bounded custom runtime values");
assert(academicTermsSql.includes("char_length(term) <= 60"), "Academic term must preserve bounded custom runtime values");
assert(!academicTermsSql.includes("level in ("), "Academic level must not be restricted to registration-only options");

const financeCategoriesSql = tableSql("finance_categories");
assert(financeCategoriesSql.includes("primary key (user_id, id)"), "Finance categories need stable owner-scoped IDs");
assert(financeCategoriesSql.includes("unique (user_id, id, type)"), "Finance category type must be available to the integrity FK");
assert(schema.includes("finance_categories_user_name_ci_idx"), "Finance category names need case-insensitive owner uniqueness");

const financeTransactionsSql = tableSql("finance_transactions");
assert(financeTransactionsSql.includes("category_id text not null"), "Finance transactions must reference category_id");
assert(!financeTransactionsSql.includes("category_name"), "Mutable category_name must not be a finance FK");
assert(financeTransactionsSql.includes("foreign key (user_id, category_id, type)"), "Finance FK must preserve ownership and category type");
assert(financeTransactionsSql.includes("references public.finance_categories(user_id, id, type) on delete restrict"), "Finance history must survive category delete attempts");
assert(migrationPlanner.includes("category_id: financeCategoryIdByName.get"), "Local finance migration must resolve stable category IDs");
assert(migrationPlanner.includes("finance_transaction_category_type_mismatch"), "Local migration must reject transaction/category type mismatches");
assert(migrationPlanner.includes("duplicate_cloud_key_detected"), "Local migration preview must detect duplicate cloud keys");
assert(!migrationPlanner.includes("category_name:"), "Migration planner must not emit mutable category_name relations");

const thresholdsSql = tableSql("grade_thresholds");
assert(thresholdsSql.includes("primary key (user_id, grade_plan_id, position)"), "Grade threshold identity must not depend on editable label text");
assert(thresholdsSql.includes("unique (user_id, grade_plan_id, label)"), "Grade threshold labels must remain unique within a plan");

const appSettingsSql = tableSql("app_settings");
assert(!appSettingsSql.includes("browser_notifications"), "Browser permission is device-local, not cloud account state");
assert(!migrationPlanner.includes("browser_notifications:"), "Migration planner must not upload browser permission state");

assert(rls.includes("enable row level security"), "RLS is not enabled by the migration");
assert(rls.includes("revoke all on table public.%I from anon"), "anon privileges are not explicitly revoked");
assert(rls.includes("grant select, insert, update, delete"), "authenticated CRUD grants are incomplete");
for (const command of ["select", "insert", "update", "delete"]) {
  assert(rls.includes(`for ${command} to authenticated`) || rls.includes(`for ${command}\n  to authenticated`), `Missing authenticated ${command.toUpperCase()} policy`);
}
assert((rls.match(/\(select auth\.uid\(\)\) is not null/g) ?? []).length === 6, "Every owner policy path must reject unauthenticated null UIDs");
assert(rls.includes("grant select on table public.app_state_sync to authenticated"), "app_state_sync must be authenticated SELECT-only");
assert(!rls.includes("grant select, insert, update, delete on table public.app_state_sync"), "app_state_sync must not expose client writes");

assert(trigger.includes("security definer"), "Auth trigger must be security definer");
assert(trigger.includes("set search_path = ''"), "Auth trigger must use an empty search_path");
assert(trigger.includes("left(btrim(coalesce("), "Auth metadata must be trimmed and length-bounded");
assert(trigger.includes("on conflict (user_id) do nothing"), "Auth profile creation must be idempotent");
assert(trigger.includes("revoke all on function public.handle_new_talevo_user()"), "Auth trigger function execute privileges must be revoked");

assert(contract.includes("This is a read-only catalog test. It does not replace authenticated User A/B tests."), "Static RLS test must state its live-test limitation");
assert(contract.includes("constraint_row.confrelid = 'auth.users'::regclass"), "Static contract must inspect real auth.users foreign keys");
assert(contract.includes("lower(coalesce(update_qual"), "Static contract must inspect UPDATE USING");
assert(contract.includes("lower(coalesce(update_check"), "Static contract must inspect UPDATE WITH CHECK");
assert(contract.includes("has_table_privilege('anon'"), "Static contract must verify anon grants");
assert(contract.includes("has_table_privilege('authenticated'"), "Static contract must verify authenticated grants");
assert(contract.includes("finance_transactions', 'finance_categories'"), "Static contract must verify the finance owner-preserving FK");
assert(contract.includes("'r'::\"char\""), "Static contract must verify finance ON DELETE RESTRICT");

assert(/^begin;/m.test(liveTwoUser), "Live RLS test must start a transaction");
assert(/rollback;\s*$/i.test(liveTwoUser), "Live RLS test must end with ROLLBACK");
assert(!/^\s*commit\s*;/im.test(liveTwoUser), "Live RLS test must never COMMIT QA rows");
assert(liveTwoUser.includes("USER_A_UUID") && liveTwoUser.includes("USER_B_UUID"), "Live RLS test must retain both safe UUID placeholders");
assert((liveTwoUser.match(/'USER_A_UUID'/g) ?? []).length === 1, "Live RLS test must contain exactly one User A placeholder literal");
assert((liveTwoUser.match(/'USER_B_UUID'/g) ?? []).length === 1, "Live RLS test must contain exactly one User B placeholder literal");
assert(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(liveTwoUser), "Live RLS test must never contain a real UUID literal");
assert(liveTwoUser.includes("set local role authenticated;"), "Live RLS test must impersonate authenticated");
assert(liveTwoUser.includes("set local role anon;"), "Live RLS test must impersonate anon");
assert(liveTwoUser.includes("'request.jwt.claims'"), "Live RLS test must set PostgREST JWT claims");
assert(liveTwoUser.includes("auth.uid()"), "Live RLS test must verify the effective auth.uid()");
assert(!/service_role/i.test(liveTwoUser.replace(/^--.*$/gm, "")), "Live RLS test must not use service_role");
assert(!/delete\s+from\s+auth\.users/i.test(liveTwoUser), "Live RLS test must never delete QA auth users");
assert(!/delete\s+from\s+public\.profiles/i.test(liveTwoUser), "Live RLS test must never delete real profile rows");
assert(liveTwoUser.includes("when insufficient_privilege then null"), "Live RLS test must assert expected RLS denials without aborting the test transaction");
assert(liveTwoUser.includes("when foreign_key_violation then null"), "Live RLS test must assert owner-preserving foreign keys");
assert(liveTwoUser.includes("when unique_violation then null"), "Live RLS test must assert notification event uniqueness");
const liveDoBlocks = (liveTwoUser.match(/^do \$\$/gm) ?? []).length;
assert(liveDoBlocks === 4, `Live RLS test DO block count changed: ${liveDoBlocks}`);
assert((liveTwoUser.match(/^#variable_conflict error$/gm) ?? []).length === liveDoBlocks, "Every PL/pgSQL block must reject ambiguous variable references");
assert((liveTwoUser.match(/^\$\$;$/gm) ?? []).length === liveDoBlocks, "Every PL/pgSQL block must have a dollar-quote terminator");

const liveVariableNames = [...liveTwoUser.matchAll(
  /^\s{2}([a-z][a-z0-9_]*)\s+(?:constant\s+)?(?:text(?:\[\])?|uuid|integer)\b/gm,
)].map((match) => match[1]);
assert(liveVariableNames.length > 0, "Live RLS test PL/pgSQL variable inventory is empty");
for (const variableName of liveVariableNames) {
  assert(variableName.startsWith("qa_"), `Live RLS variable must use the qa_ prefix: ${variableName}`);
}
const collisionProneVariableNames = new Set([
  "id", "user_id", "type", "task_id", "subtask_id", "category_id",
  "transaction_id", "exam_id", "schedule_id", "notification_id",
  "event_key", "affected", "user_a", "user_b", "suffix", "table_name",
]);
for (const variableName of liveVariableNames) {
  assert(!collisionProneVariableNames.has(variableName), `Live RLS variable collides with a likely table column: ${variableName}`);
}
const unqualifiedPredicateColumns = liveTwoUser.match(
  /^\s*(?:where|and|or)\s+(?:id|user_id|type|task_id|subtask_id|category_id|transaction_id|exam_id|schedule_id|notification_id|event_key)\b/gim,
) ?? [];
assert(unqualifiedPredicateColumns.length === 0, `Live RLS predicates contain unqualified columns: ${unqualifiedPredicateColumns.join(", ")}`);
const unaliasedTableReferences = liveTwoUser
  .split(/\r?\n/)
  .filter((line) => /^\s*(?:from|update|delete\s+from)\s+(?:public\.[a-z_]+|auth\.users)\b/i.test(line))
  .filter((line) => !/\bas\s+[a-z][a-z0-9_]*\b/i.test(line));
assert(unaliasedTableReferences.length === 0, `Live RLS query is missing a table alias: ${unaliasedTableReferences.join(" | ")}`);
assert(liveTwoUser.includes("child_row.task_id = qa_task_id"), "Child relation assertion must distinguish the task_id column from its QA variable");
for (const table of ["profiles", "tasks", "task_subtasks", "class_schedules", "exams", "finance_categories", "finance_transactions", "notifications"]) {
  assert(liveTwoUser.includes(`public.${table}`), `Live RLS test is missing required table coverage: ${table}`);
}
assert(liveTwoUser.includes("TALEVO LIVE TWO-USER RLS TEST PASSED"), "Live RLS test must emit the exact success result");
const singleLiveAssertions = (liveTwoUser.match(/-- ASSERT:/g) ?? []).length;
assert(singleLiveAssertions === 48, `Live RLS single assertion count changed: ${singleLiveAssertions}`);
assert(liveTwoUser.includes("-- ASSERTS (24):"), "Live RLS test must SELECT-check all 24 private tables as anon");

assert(atomicImport.includes("create or replace function public.import_talevo_v8(payload jsonb)"), "Atomic import RPC is missing");
assert(atomicImport.includes("security definer") && atomicImport.includes("set search_path = ''"), "Atomic import RPC must use a hardened definer boundary");
assert(atomicImport.includes("qa_uid uuid := auth.uid()") && atomicImport.includes("insert into public.tasks (user_id"), "Atomic import must derive owner from auth.uid()");
assert(atomicImport.includes("talevo_client_user_id_forbidden"), "Atomic import must reject client-provided user_id fields");
assert(atomicImport.includes("pg_advisory_xact_lock"), "Atomic import needs a per-user transaction lock for retry races");
assert(atomicImport.includes("talevo_cloud_account_not_empty"), "First import must block non-empty Cloud domain data");
assert(atomicImport.includes("already_imported") && atomicImport.includes("snapshot_hash"), "Atomic import must be idempotent by payload fingerprint");
assert(atomicImport.includes("private.talevo_migration_control") && atomicImport.includes("talevo_import_release_disabled"), "Atomic import needs a database-side release gate");
assert(atomicImport.includes("pg_catalog.sha256") && !atomicImport.includes("pg_catalog.md5"), "Snapshot fingerprint must use built-in SHA-256 rather than MD5");
assert(atomicImport.includes("finance_transactions") && atomicImport.includes("category_id"), "Atomic import must preserve Finance category identity");
assert(atomicImport.includes("create or replace function public.complete_talevo_v8_verification") && atomicImport.includes("verification_failed") && atomicImport.includes("qa_actual_counts = qa_expected_counts") && atomicImport.includes("qa_actual_finance_totals = qa_expected_finance_totals"), "Read-back verification must cross-check server counts and Finance totals");
assert(atomicImport.includes("revoke all on function public.import_talevo_v8(jsonb) from anon") && atomicImport.includes("grant execute on function public.import_talevo_v8(jsonb) to authenticated"), "Atomic RPC grants are unsafe");
assert(!/execute\s+format|\bexec(?:ute)?\s+['\"]/i.test(atomicImport), "Atomic import must not use dynamic SQL");
for (const removedField of ["studyBlocks", "academicRoute", "requiresSubmission", "submittedAt", "submissionNote", "submissionEvidenceAttachmentIds", "submissionReminders"]) {
  assert(atomicImport.includes(removedField), `Atomic import must explicitly reject removed field: ${removedField}`);
}
assert(/^begin;/m.test(atomicContract) && /rollback;\s*$/i.test(atomicContract), "Atomic live contract must be fully rollback-safe");
assert(!/^\s*commit\s*;/im.test(atomicContract), "Atomic live contract must never COMMIT");
assert(atomicContract.includes("USER_A_UUID") && atomicContract.includes("USER_B_UUID"), "Atomic live contract must retain safe user placeholders");
assert(atomicContract.includes("anon cannot execute") && atomicContract.includes("cross-owner import") && atomicContract.includes("partial failure"), "Atomic live contract is missing security/rollback paths");
assert(atomicContract.includes("database-side release gate") && atomicContract.includes("User B cannot mark User A import verified") && atomicContract.includes("server-side Finance totals differ"), "Atomic live contract must test the server release and verification boundaries");
const atomicAssertions = (atomicContract.match(/-- ASSERT:/g) ?? []).length;
assert(atomicAssertions >= 20, `Atomic live contract has too few behavior assertions: ${atomicAssertions}`);
assert(atomicContract.includes("TALEVO ATOMIC IMPORT CONTRACT PASSED"), "Atomic live contract must emit the exact PASS result");

assert(qaAllowlist.includes("create table if not exists private.talevo_migration_qa_allowlist"), "QA allowlist table is missing");
assert(qaAllowlist.includes("user_id uuid primary key references auth.users(id) on delete cascade"), "QA allowlist must reference auth.users");
assert(qaAllowlist.includes("enable row level security"), "QA allowlist must have RLS enabled");
assert(qaAllowlist.includes("revoke all on table private.talevo_migration_qa_allowlist from authenticated"), "Authenticated clients must not write the private allowlist");
assert(qaAllowlist.includes("create or replace function public.get_talevo_migration_qa_access()"), "QA capability RPC is missing");
assert(qaAllowlist.includes("security definer") && qaAllowlist.includes("set search_path = ''"), "QA functions must use hardened definer boundaries");
assert(qaAllowlist.includes("revoke all on function public.get_talevo_migration_qa_access() from anon"), "Anon must not execute the QA capability RPC");
assert(qaAllowlist.includes("grant execute on function public.get_talevo_migration_qa_access() to authenticated"), "Authenticated users need the boolean QA capability RPC");
assert(qaAllowlist.includes("or exists (") && qaAllowlist.includes("allowlist_row.user_id = qa_uid") && qaAllowlist.includes("allowlist_row.enabled"), "Atomic import must combine global gate with the private per-user allowlist");
assert(qaAllowlist.includes("talevo_global_import_gate_must_remain_disabled"), "Additive deployment must refuse an unexpectedly enabled global gate");
assert(!/insert\s+into\s+private\.talevo_migration_qa_allowlist/i.test(qaAllowlist), "Migration must not silently allowlist any user");
assert(!/set\s+import_enabled\s*=\s*true/i.test(qaAllowlist), "Migration must never enable the global gate");
assert(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(qaAllowlist), "Migration must not contain a user UUID");
assert((qaAllowlist.match(/\$\$/g) ?? []).length % 2 === 0, "QA allowlist migration has unbalanced dollar quotes");
assert(qaAllowlist.includes("#variable_conflict error"), "QA import replacement must reject PL/pgSQL variable ambiguity");
assert(!/execute\s+format|\bexec(?:ute)?\s+['\"]/i.test(qaAllowlist), "QA migration must not use dynamic SQL");

assert(/^begin;/m.test(qaAllowlistContract) && /rollback;\s*$/i.test(qaAllowlistContract), "QA allowlist contract must be rollback-safe");
assert(!/^\s*commit\s*;/im.test(qaAllowlistContract), "QA allowlist contract must never COMMIT");
assert(qaAllowlistContract.includes("QA_USER_A_UUID") && qaAllowlistContract.includes("QA_USER_B_UUID"), "QA allowlist contract must retain placeholders");
assert((qaAllowlistContract.match(/'QA_USER_A_UUID'/g) ?? []).length === 1 && (qaAllowlistContract.match(/'QA_USER_B_UUID'/g) ?? []).length === 1, "QA contract must have exactly one literal for each placeholder");
assert(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(qaAllowlistContract), "QA allowlist contract must not contain a real UUID");
assert(qaAllowlistContract.includes("set local role anon;") && qaAllowlistContract.includes("set local role authenticated;"), "QA allowlist contract must test anon and authenticated roles");
assert(qaAllowlistContract.includes("global import gate must remain false") && qaAllowlistContract.includes("disabled User B") && qaAllowlistContract.includes("global gate compatibility"), "QA allowlist contract is missing global/allowlisted/denied paths");
const qaAllowlistAssertions = (qaAllowlistContract.match(/-- ASSERT:/g) ?? []).length;
assert(qaAllowlistAssertions >= 13, `QA allowlist contract has too few assertions: ${qaAllowlistAssertions}`);
assert(qaAllowlistContract.includes("TALEVO QA ALLOWLIST CONTRACT PASSED"), "QA allowlist contract must emit the exact PASS result");
assert((qaAllowlistContract.match(/\$\$/g) ?? []).length % 2 === 0, "QA contract has unbalanced dollar quotes");
assert(!/service_role/i.test(qaAllowlistContract.replace(/^--.*$/gm, "")), "QA contract must not use service_role");

assert(qaAllowlistSetup.includes("QA_USER_A_UUID") && qaAllowlistSetup.includes("QA_USER_B_UUID"), "Manual setup must retain QA placeholders");
assert(qaAllowlistSetup.includes("on conflict (user_id) do update"), "Manual allowlist setup must be idempotent");
assert(qaAllowlistSetup.includes("Global import gate is true"), "Manual setup must refuse an enabled global gate");
assert(!/set\s+import_enabled\s*=\s*true/i.test(qaAllowlistSetup), "Manual setup must never enable the global gate");
assert(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(qaAllowlistSetup), "Manual setup must not contain a real UUID");

console.log(`TALEVO Supabase schema contract: ${checks} checks passed; live RLS script: ${singleLiveAssertions + 24} assertion paths; QA allowlist: ${qaAllowlistAssertions} assertion paths`);
