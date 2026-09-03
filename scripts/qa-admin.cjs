/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const migrationPath = "supabase/migrations/20260902140000_talevo_admin_backoffice.sql";
const fixMigrationPath = "supabase/migrations/20260902150000_talevo_admin_backoffice_return_types_fix.sql";
const runbookPath = "supabase/runbooks/talevo_admin_setup.sql";
const repositoryPath = "src/lib/admin/admin-repository.ts";
const adminRoutes = [
  "src/app/admin/layout.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/admin/users/[id]/page.tsx",
];
for (const file of [migrationPath, fixMigrationPath, runbookPath, repositoryPath, ...adminRoutes]) check(exists(file), `Missing Admin file: ${file}`);

const migration = read(migrationPath);
const fixMigration = read(fixMigrationPath);
const runbook = read(runbookPath);
const repository = read(repositoryPath);
const appShell = read("src/components/app-shell.tsx");
const proxy = read("src/lib/supabase/proxy.ts");
const packageJson = JSON.parse(read("package.json"));
const routeSources = adminRoutes.map(read).join("\n");
const dashboard = read("src/app/admin/page.tsx");
const usersList = read("src/app/admin/users/page.tsx");

check(migration.includes("create table if not exists private.talevo_admin_users"), "Private Admin membership table is missing");
check(migration.includes("references auth.users(id) on delete cascade"), "Admin membership must reference auth.users");
check(migration.includes("enable row level security") && migration.includes("force row level security"), "Admin membership RLS must be enabled and forced");
check(migration.includes("revoke all on table private.talevo_admin_users from authenticated"), "Authenticated clients must not read Admin membership");
check(migration.includes("create or replace function public.get_talevo_admin_access()"), "Admin access RPC is missing");
for (const rpc of ["get_talevo_admin_summary", "list_talevo_admin_users", "get_talevo_admin_user"]) {
  check(migration.includes(`function public.${rpc}`), `Missing Admin RPC: ${rpc}`);
}
check((migration.match(/security definer/g) ?? []).length >= 5, "Every Admin authorization/data function must be SECURITY DEFINER");
check((migration.match(/set search_path = ''/g) ?? []).length >= 5, "Every Admin function must harden search_path");
check((migration.match(/\$\$/g) ?? []).length % 2 === 0, "Admin migration has unbalanced dollar quotes");
check(!/execute\s+format|\bexec(?:ute)?\s+['\"]/i.test(migration), "Admin migration must not use dynamic SQL");
check((migration.match(/talevo_admin_access_denied/g) ?? []).length >= 3, "Every directory RPC must deny non-admin users before returning data");
check(migration.includes("from auth.users as auth_user"), "Canonical Auth directory source is missing");
check(migration.includes("public.profiles") && migration.includes("public.academic_terms"), "Allowed profile and academic relations are missing");
for (const forbiddenTable of ["tasks", "exams", "finance_transactions", "course_notes", "class_schedules", "notifications", "chat_messages", "task_attachments"]) {
  check(!new RegExp(`public\\.${forbiddenTable}\\b`, "i").test(migration), `Admin migration must not query ${forbiddenTable}`);
}
for (const forbiddenField of ["encrypted_password", "confirmation_token", "recovery_token", "access_token", "refresh_token"]) {
  check(!migration.includes(forbiddenField) && !repository.includes(forbiddenField) && !routeSources.includes(forbiddenField), `Forbidden credential field found: ${forbiddenField}`);
}
check(!/insert\s+into\s+private\.talevo_admin_users/i.test(migration), "Migration must not silently create an Admin");
check(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(migration), "Migration must not contain a real user UUID");
check(runbook.includes("ADMIN_USER_UUID") && (runbook.match(/ADMIN_USER_UUID/g) ?? []).length === 2, "Runbook must retain the Admin UUID placeholder and instructions");
check(runbook.includes("talevo_global_import_gate_must_remain_disabled") && !/set\s+import_enabled\s*=\s*true/i.test(runbook), "Admin runbook must keep Global import disabled");
check(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(runbook), "Runbook must not contain a real UUID");

check(fixMigration.includes("create or replace function public.list_talevo_admin_users(") && fixMigration.includes("create or replace function public.get_talevo_admin_user("), "Corrective migration must replace both affected directory RPCs");
check((fixMigration.match(/coalesce\(auth_user\.email, ''\)::text/g) ?? []).length === 2, "Both directory RPCs must cast auth.users.email from varchar to text");
check((fixMigration.match(/::text/g) ?? []).length >= 14, "Corrective migration must make every declared text return column explicit");
check((fixMigration.match(/security definer/g) ?? []).length === 2 && (fixMigration.match(/set search_path = ''/g) ?? []).length === 2, "Corrective Admin RPCs must retain hardened SECURITY DEFINER boundaries");
check((fixMigration.match(/talevo_admin_access_denied/g) ?? []).length === 2, "Corrective Admin RPCs must check membership before querying the directory");
check((fixMigration.match(/from auth\.users as auth_user/g) ?? []).length === 2 && (fixMigration.match(/left join public\.profiles/g) ?? []).length === 2 && (fixMigration.match(/left join public\.academic_terms/g) ?? []).length === 2, "Corrective migration must preserve the controlled Auth directory and optional joins");
check(fixMigration.includes("revoke all on function public.list_talevo_admin_users(text, integer, integer) from anon") && fixMigration.includes("grant execute on function public.list_talevo_admin_users(text, integer, integer) to authenticated"), "Corrective directory privileges are incomplete");
check(!/insert\s+into\s+private\.talevo_admin_users/i.test(fixMigration) && !/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(fixMigration), "Corrective migration must not create an Admin or contain a real UUID");
check(!/execute\s+format|\bexec(?:ute)?\s+['\"]/i.test(fixMigration) && (fixMigration.match(/\$\$/g) ?? []).length % 2 === 0, "Corrective migration SQL structure is unsafe");

check(repository.startsWith('import "server-only";'), "Admin repository must be server-only");
check(repository.indexOf("supabase.auth.getUser()") < repository.indexOf('supabase.rpc("get_talevo_admin_access")'), "Admin must authenticate before checking membership");
check(repository.indexOf('supabase.rpc("get_talevo_admin_access")') < repository.indexOf('supabase.rpc("get_talevo_admin_summary")'), "Admin access must be checked before directory data");
check(repository.includes("await connection()"), "Admin responses must opt out of prerender caching");
check(repository.includes("throwAdminRpcError") && repository.includes("databaseCode") && repository.includes("httpStatus"), "Admin RPC failures need safe development diagnostics");
check(repository.includes('process.env.NODE_ENV === "development"') && repository.includes('throw new Error("admin_directory_read_failed")'), "Production Admin errors must remain generic");
check(repository.includes('throwAdminRpcError("get_talevo_admin_summary"') && repository.includes('throwAdminRpcError("list_talevo_admin_users"') && repository.includes('throwAdminRpcError("get_talevo_admin_user"'), "Every Admin data RPC must report its failing operation");
check(!repository.includes("createAdminClient") && !routeSources.includes("createAdminClient"), "Admin directory must use the normal authenticated server session, not an elevated client");
check(!routeSources.includes('"use client"'), "Admin data pages and layout must remain Server Components");
check(routeSources.includes("Supabase Auth") && routeSources.includes("ข้อมูลเท่าที่จำเป็น"), "Admin privacy copy is missing");
check(dashboard.includes("ผู้ใช้ใหม่วันนี้") && dashboard.includes("ผู้ใช้ใหม่ 7 วันล่าสุด") && dashboard.includes("เข้าใช้งานใน 30 วัน"), "Dashboard must use real today, 7-day, and recent sign-in metrics");
check(usersList.includes("maskedUserId") && usersList.includes("lastSignInAt") && usersList.includes("pageHref"), "Users list must mask IDs and support last sign-in plus pagination");
check(appShell.includes('pathname === "/admin"') && appShell.includes("isAdminRoute"), "Admin routes must bypass the user AppShell");
check(proxy.includes('"/admin"'), "Admin routes must be protected by the session proxy");
check(packageJson.scripts["qa:admin"] === "node scripts/qa-admin.cjs", "qa:admin package script is missing");

console.log(`TALEVO Admin Back Office contract: ${checks} checks passed`);
