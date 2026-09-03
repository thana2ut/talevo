import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLOUD_IMPORT_RELEASE_ENABLED,
  LOCAL_V8_TABLE_ORDER,
  type LocalV8MigrationPlan,
  type LocalV8TableName,
} from "@/lib/supabase/local-v8-migration";

export type CloudRow = Record<string, unknown>;
export type CloudTables = Record<LocalV8TableName, CloudRow[]>;

export type CloudLoadResult =
  | { status: "loaded"; tables: CloudTables }
  | { status: "empty"; tables: CloudTables }
  | { status: "error"; message: string; tables: null };

export type ImportRpcResult = {
  status: "imported" | "already_imported";
  import_id: string;
  snapshot_hash: string;
  counts: Record<string, number>;
};

export type ReadBackVerification = {
  verified: boolean;
  errors: string[];
  counts: Record<LocalV8TableName, number>;
  cloudTables: CloudTables | null;
};

export type QaMigrationAccess =
  | { status: "allowed" }
  | { status: "denied" }
  | { status: "error"; message: string };

export type CloudMigrationMarker = {
  local_schema_version: number;
  import_id: string;
  snapshot_hash: string;
  migration_status: "imported" | "verified" | "verification_failed";
  expected_counts: Record<string, number> | null;
  expected_finance_totals: Record<string, number> | null;
};

const SELECT_COLUMNS: Record<LocalV8TableName, string> = {
  profiles: "user_id,display_name,major,university",
  academic_terms: "user_id,level,term,academic_year,label",
  class_schedules: "user_id,id,course_id,name,teacher,room,color,day,start_time,end_time,note",
  tasks: "user_id,id,title,course_id,description,due_label,due_date,estimate,status,color,attachment_label,completed_at",
  task_subtasks: "user_id,task_id,id,title,completed,completed_at,position",
  task_attachments: "user_id,task_id,id,name,mime_type,size_bytes,kind,created_at",
  task_completion_history: "user_id,id,original_task_id,course_id,completed_at,due_date,estimate,subtask_count",
  exams: "user_id,id,course_id,title,type,start_at,end_at,room,note,completed_at,created_at,updated_at",
  exam_topics: "user_id,exam_id,id,title,completed,completed_at,position",
  grade_plans: "user_id,id,course_id,target_grade",
  grade_components: "user_id,grade_plan_id,id,name,weight,max_score,earned_score,note,position",
  grade_thresholds: "user_id,grade_plan_id,label,minimum_percent,position",
  course_notes: "user_id,id,course_id,title,content,tags,pinned,class_date,created_at,updated_at",
  finance_categories: "user_id,id,name,type,icon,color,monthly_budget,created_at,is_default",
  finance_transactions: "user_id,id,type,title,amount,category_id,date,note",
  saving_goals: "user_id,id,title,target_amount,saved_amount",
  finance_settings: "user_id,daily_budget,selected_month",
  learning_goals: "user_id,weekly_study_hours,early_submission_days,exam_preparation_days,personal_goal",
  notifications: "user_id,id,type,priority,title,message,created_at,read_at,href,event_key,source_id,metadata",
  dismissed_notification_events: "user_id,event_key,dismissed_at",
  app_settings: "user_id,timezone,date_format,year_system,alerts_enabled,task_24h,task_12h,deadline_risk,morning_0600,daily_0700,class_30m,class_end_10m,exam_7d,exam_3d,exam_1d,exam_morning,weekly_radar",
  chat_messages: "user_id,id,role,content,kind,position",
};

const TIMESTAMP_FIELDS = new Set([
  "due_date", "completed_at", "created_at", "updated_at", "start_at", "end_at", "read_at",
]);
const TIME_FIELDS = new Set(["start_time", "end_time"]);

function rowKey(table: LocalV8TableName, row: CloudRow) {
  if (table === "profiles" || table === "academic_terms" || table === "finance_settings" || table === "learning_goals" || table === "app_settings") return "singleton";
  if (table === "task_subtasks" || table === "task_attachments") return `${row.task_id}\u0000${row.id}`;
  if (table === "exam_topics") return `${row.exam_id}\u0000${row.id}`;
  if (table === "grade_components") return `${row.grade_plan_id}\u0000${row.id}`;
  if (table === "grade_thresholds") return `${row.grade_plan_id}\u0000${row.position}`;
  if (table === "dismissed_notification_events") return String(row.event_key);
  return String(row.id);
}

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function valuesMatch(field: string, expectedValue: unknown, actualValue: unknown) {
  if (expectedValue === null || expectedValue === undefined) return actualValue === null || actualValue === undefined;
  if (typeof expectedValue === "number") return Math.abs(numeric(actualValue) - expectedValue) <= 0.005;
  if (typeof expectedValue === "boolean") return actualValue === expectedValue;
  if (TIMESTAMP_FIELDS.has(field) && typeof expectedValue === "string" && typeof actualValue === "string") {
    const expectedTime = Date.parse(expectedValue);
    const actualTime = Date.parse(actualValue);
    return Number.isFinite(expectedTime) && expectedTime === actualTime;
  }
  if (TIME_FIELDS.has(field)) {
    const normalizeTime = (value: unknown) => {
      const source = String(value ?? "");
      return source.match(/^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/)?.[1] ?? source;
    };
    return normalizeTime(expectedValue) === normalizeTime(actualValue);
  }
  if (Array.isArray(expectedValue) || typeof expectedValue === "object") return stableValue(expectedValue) === stableValue(actualValue);
  return String(actualValue) === String(expectedValue);
}

function compareFields(table: LocalV8TableName, expected: CloudRow | undefined, actual: CloudRow | undefined, fields: string[], errors: string[]) {
  if (!expected || !actual) return;
  for (const field of fields) {
    const expectedValue = expected[field] ?? null;
    const actualValue = actual[field] ?? null;
    if (!valuesMatch(field, expectedValue, actualValue)) {
      errors.push(`field_mismatch:${table}.${field}`);
    }
  }
}

export async function loadCloudAccountV8(client: SupabaseClient): Promise<CloudLoadResult> {
  const results = await Promise.all(LOCAL_V8_TABLE_ORDER.map(async (table) => {
    const { data, error } = await client.from(table).select(SELECT_COLUMNS[table]);
    return { table, data: data as CloudRow[] | null, error };
  }));
  const failed = results.find((result) => result.error);
  if (failed) return { status: "error", message: "ยังโหลดข้อมูล Cloud ไม่สำเร็จ กรุณาลองใหม่ โดยข้อมูลในอุปกรณ์ยังอยู่ครบ", tables: null };
  const tables = Object.fromEntries(results.map((result) => [result.table, result.data ?? []])) as CloudTables;
  const domainRows = LOCAL_V8_TABLE_ORDER.filter((table) => table !== "profiles" && table !== "academic_terms").reduce((total, table) => total + tables[table].length, 0);
  return { status: domainRows === 0 ? "empty" : "loaded", tables };
}

/**
 * QA-only capability probe. Database allowlisting remains the authority; the
 * browser receives only a boolean and never sees the private allowlist table.
 */
export async function getQaMigrationAccess(client: SupabaseClient): Promise<QaMigrationAccess> {
  const { data, error } = await client.rpc("get_talevo_migration_qa_access");
  if (error) return { status: "error", message: "ตรวจสิทธิ์ QA Migration ไม่สำเร็จ" };
  return data === true ? { status: "allowed" } : { status: "denied" };
}

export async function loadOwnMigrationMarker(client: SupabaseClient): Promise<CloudMigrationMarker | null> {
  const { data, error } = await client
    .from("app_state_sync")
    .select("local_schema_version,import_id,snapshot_hash,migration_status,expected_counts,expected_finance_totals")
    .maybeSingle();
  if (error) throw new Error("qa_marker_read_failed");
  return data as CloudMigrationMarker | null;
}

export async function verifyCloudReadBack(client: SupabaseClient, plan: LocalV8MigrationPlan): Promise<ReadBackVerification> {
  const loaded = await loadCloudAccountV8(client);
  if (loaded.status === "error") return { verified: false, errors: ["cloud_read_failed"], counts: plan.counts, cloudTables: null };
  const errors: string[] = [];
  const counts = Object.fromEntries(LOCAL_V8_TABLE_ORDER.map((table) => [table, loaded.tables[table].length])) as Record<LocalV8TableName, number>;
  for (const table of LOCAL_V8_TABLE_ORDER) {
    if (counts[table] !== plan.counts[table]) errors.push(`count_mismatch:${table}`);
    const expectedKeys = plan.payload.tables[table].map((row) => rowKey(table, row)).sort();
    const actualKeys = loaded.tables[table].map((row) => rowKey(table, row)).sort();
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) errors.push(`stable_id_mismatch:${table}`);
    const actualByKey = new Map(loaded.tables[table].map((row) => [rowKey(table, row), row]));
    const comparableFields = SELECT_COLUMNS[table].split(",").filter((field) => field !== "user_id" && field !== "dismissed_at");
    for (const expectedRow of plan.payload.tables[table]) {
      compareFields(table, expectedRow, actualByKey.get(rowKey(table, expectedRow)), comparableFields, errors);
    }
  }

  const taskIds = new Set(loaded.tables.tasks.map((row) => String(row.id)));
  if (loaded.tables.task_subtasks.some((row) => !taskIds.has(String(row.task_id)))) errors.push("orphan_relation:task_subtasks");
  if (loaded.tables.task_attachments.some((row) => !taskIds.has(String(row.task_id)))) errors.push("orphan_relation:task_attachments");
  const examIds = new Set(loaded.tables.exams.map((row) => String(row.id)));
  if (loaded.tables.exam_topics.some((row) => !examIds.has(String(row.exam_id)))) errors.push("orphan_relation:exam_topics");
  const gradePlanIds = new Set(loaded.tables.grade_plans.map((row) => String(row.id)));
  if (loaded.tables.grade_components.some((row) => !gradePlanIds.has(String(row.grade_plan_id))) || loaded.tables.grade_thresholds.some((row) => !gradePlanIds.has(String(row.grade_plan_id)))) errors.push("orphan_relation:grade_plans");

  const finance = loaded.tables.finance_transactions.reduce<{ income: number; expense: number; saving: number }>((result, row) => {
    const type = String(row.type) as "income" | "expense" | "saving";
    return { ...result, [type]: result[type] + numeric(row.amount) };
  }, { income: 0, expense: 0, saving: 0 });
  const categoryTypes = new Map(loaded.tables.finance_categories.map((row) => [`${row.id}\u0000${row.type}`, true]));
  if (loaded.tables.finance_transactions.some((row) => !categoryTypes.has(`${row.category_id}\u0000${row.type}`))) errors.push("finance_category_relation_mismatch");
  const remaining = finance.income - finance.expense - finance.saving;
  for (const key of ["income", "expense", "saving", "remaining"] as const) {
    const actual = key === "remaining" ? remaining : finance[key];
    if (Math.abs(actual - plan.financeTotals[key]) > 0.005) errors.push(`finance_total_mismatch:${key}`);
  }
  return { verified: errors.length === 0, errors, counts, cloudTables: loaded.tables };
}

/**
 * Prepared production path. The compile-time release gate intentionally keeps
 * it unreachable until the SQL migration and live two-user contract pass.
 */
export async function importLocalV8Atomically(client: SupabaseClient, plan: LocalV8MigrationPlan): Promise<ImportRpcResult> {
  if (!CLOUD_IMPORT_RELEASE_ENABLED || !plan.readyForUpload) throw new Error("cloud_import_release_not_enabled");
  const { data, error } = await client.rpc("import_talevo_v8", { payload: plan.payload });
  if (error) throw new Error("atomic_import_failed");
  return data as ImportRpcResult;
}

export async function completeLocalV8Verification(client: SupabaseClient, result: ImportRpcResult, verification: ReadBackVerification) {
  if (!CLOUD_IMPORT_RELEASE_ENABLED) throw new Error("cloud_import_release_not_enabled");
  const { data, error } = await client.rpc("complete_talevo_v8_verification", {
    expected_import_id: result.import_id,
    expected_snapshot_hash: result.snapshot_hash,
    verification_passed: verification.verified,
  });
  if (error || data !== verification.verified) throw new Error("cloud_verification_marker_failed");
}

/** Development-only QA path. The RPC independently enforces auth.uid() and the private allowlist. */
export async function importLocalV8ForQa(client: SupabaseClient, plan: LocalV8MigrationPlan): Promise<ImportRpcResult> {
  if (process.env.NODE_ENV !== "development") throw new Error("qa_migration_development_only");
  if (!plan.eligibleForUploadAfterDeployment) throw new Error("qa_migration_plan_not_eligible");
  const access = await getQaMigrationAccess(client);
  if (access.status !== "allowed") throw new Error(access.status === "error" ? "qa_access_check_failed" : "qa_account_not_allowlisted");
  const { data, error } = await client.rpc("import_talevo_v8", { payload: plan.payload });
  if (error) throw new Error("qa_atomic_import_failed");
  return data as ImportRpcResult;
}

/** The verified marker can only be written after the full read-back contract passes. */
export async function completeLocalV8VerificationForQa(
  client: SupabaseClient,
  result: ImportRpcResult,
  verification: ReadBackVerification,
) {
  if (process.env.NODE_ENV !== "development") throw new Error("qa_migration_development_only");
  if (!verification.verified || verification.errors.length > 0 || !verification.cloudTables) {
    throw new Error("qa_read_back_not_verified");
  }
  const access = await getQaMigrationAccess(client);
  if (access.status !== "allowed") throw new Error(access.status === "error" ? "qa_access_check_failed" : "qa_account_not_allowlisted");
  const { data, error } = await client.rpc("complete_talevo_v8_verification", {
    expected_import_id: result.import_id,
    expected_snapshot_hash: result.snapshot_hash,
    verification_passed: true,
  });
  if (error || data !== true) throw new Error("cloud_verification_marker_failed");
}
