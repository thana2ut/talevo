import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AdminSummary = {
  totalUsers: number;
  newUsersToday: number;
  newUsersLast7Days: number;
  recentlyActiveUsers: number;
};

export type AdminUserDirectoryRow = {
  userId: string;
  displayName: string;
  email: string;
  university: string;
  major: string;
  level: string;
  term: string;
  academicYear: string;
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
};

type AdminContext = { supabase: SupabaseClient };
type RawRow = Record<string, unknown>;
type AdminRpcFailure = {
  error: { code?: string; details?: string; message?: string } | null;
  status?: number;
  statusText?: string;
};

const text = (row: RawRow, key: string) => typeof row[key] === "string" ? row[key] as string : "";
const nullableText = (row: RawRow, key: string) => typeof row[key] === "string" ? row[key] as string : null;
const count = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const diagnosticText = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 240);
  return normalized || fallback;
};

function throwAdminRpcError(rpcName: string, result: AdminRpcFailure): never {
  const databaseCode = diagnosticText(result.error?.code, "unknown");
  const databaseDetails = diagnosticText(result.error?.details, "none");
  const message = diagnosticText(result.error?.message, "Admin RPC failed");
  const httpStatus = Number.isInteger(result.status) ? result.status : 0;
  const httpStatusText = diagnosticText(result.statusText, "unknown");

  if (process.env.NODE_ENV === "development") {
    console.error("[TALEVO Admin RPC]", {
      rpcName,
      databaseCode,
      databaseDetails,
      httpStatus,
      httpStatusText,
      message,
    });
    throw new Error(
      `admin_rpc_failed:${rpcName}:${databaseCode}:http_${httpStatus}:${message}:${databaseDetails}`,
    );
  }

  throw new Error("admin_directory_read_failed");
}

function mapDirectoryRow(row: RawRow): AdminUserDirectoryRow {
  return {
    userId: text(row, "user_id"),
    displayName: text(row, "display_name"),
    email: text(row, "email"),
    university: text(row, "university"),
    major: text(row, "major"),
    level: text(row, "level"),
    term: text(row, "term"),
    academicYear: text(row, "academic_year"),
    createdAt: text(row, "created_at"),
    emailConfirmedAt: nullableText(row, "email_confirmed_at"),
    lastSignInAt: nullableText(row, "last_sign_in_at"),
  };
}

export const requireTalevoAdmin = cache(async (): Promise<AdminContext> => {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login?next=/admin");

  const { data: allowed, error: accessError } = await supabase.rpc("get_talevo_admin_access");
  if (accessError || allowed !== true) notFound();
  return { supabase };
});

export async function getAdminDashboardData() {
  const { supabase } = await requireTalevoAdmin();
  const [summaryResult, latestResult] = await Promise.all([
    supabase.rpc("get_talevo_admin_summary"),
    supabase.rpc("list_talevo_admin_users", { search_text: "", page_number: 1, page_size: 6 }),
  ]);
  if (summaryResult.error) throwAdminRpcError("get_talevo_admin_summary", summaryResult);
  if (latestResult.error) throwAdminRpcError("list_talevo_admin_users", latestResult);
  const summaryRow = ((summaryResult.data as RawRow[] | null) ?? [])[0] ?? {};
  return {
    summary: {
      totalUsers: count(summaryRow.total_users),
      newUsersToday: count(summaryRow.new_users_today),
      newUsersLast7Days: count(summaryRow.new_users_last_7_days),
      recentlyActiveUsers: count(summaryRow.recently_active_users),
    } satisfies AdminSummary,
    latestUsers: ((latestResult.data as RawRow[] | null) ?? []).map(mapDirectoryRow),
  };
}

export async function getAdminUserDirectory(search: string, requestedPage: number, pageSize = 20) {
  const { supabase } = await requireTalevoAdmin();
  const safeSearch = search.trim().slice(0, 120);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { data, error, status, statusText } = await supabase.rpc("list_talevo_admin_users", {
    search_text: safeSearch,
    page_number: page,
    page_size: pageSize,
  });
  if (error) throwAdminRpcError("list_talevo_admin_users", { error, status, statusText });
  const rows = (data as RawRow[] | null) ?? [];
  const total = rows.length ? count(rows[0].total_count) : 0;
  return { rows: rows.map(mapDirectoryRow), total, page, pageSize, search: safeSearch };
}

export async function getAdminUserDetail(userId: string) {
  const { supabase } = await requireTalevoAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) notFound();
  const { data, error, status, statusText } = await supabase.rpc("get_talevo_admin_user", { target_user_id: userId });
  if (error) throwAdminRpcError("get_talevo_admin_user", { error, status, statusText });
  const row = ((data as RawRow[] | null) ?? [])[0];
  if (!row) notFound();
  return mapDirectoryRow(row);
}
