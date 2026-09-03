import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIUsageStatus } from "@/lib/ai/types";

interface UsageStatusRow {
  limit_count: number;
  used_count: number;
  remaining_count: number;
  cycle_started_at: string | null;
  reset_at: string | null;
  retry_after_seconds: number;
  minute_remaining: number;
  request_in_progress: boolean;
}

interface UsageCommitRow extends UsageStatusRow {
  accepted: boolean;
}

export class AIUsageReadError extends Error {
  constructor() {
    super("AI usage status unavailable");
    this.name = "AIUsageReadError";
  }
}

export class AIUsageCommitError extends Error {
  constructor() {
    super("AI usage commit failed");
    this.name = "AIUsageCommitError";
  }
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function normalizeUsage(row: UsageStatusRow): AIUsageStatus {
  return {
    limit: Number(row.limit_count),
    used: Number(row.used_count),
    remaining: Number(row.remaining_count),
    cycleStartedAt: row.cycle_started_at,
    resetAt: row.reset_at,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds)),
    minuteRemaining: Math.max(0, Number(row.minute_remaining)),
    requestInProgress: Boolean(row.request_in_progress),
  };
}

export async function getTalevoAIUsageStatus(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("get_talevo_ai_usage_status");
  const row = firstRow(data as UsageStatusRow | UsageStatusRow[] | null);
  if (error || !row) throw new AIUsageReadError();
  return normalizeUsage(row);
}

export async function completeTalevoAIRequest(
  supabase: SupabaseClient,
  requestId: string,
  wasSuccessful: boolean,
) {
  const { data, error } = await supabase.rpc("complete_talevo_ai_request", {
    completed_request_id: requestId,
    was_successful: wasSuccessful,
  });
  const row = firstRow(data as UsageCommitRow | UsageCommitRow[] | null);
  if (error || !row?.accepted) throw new AIUsageCommitError();
  return normalizeUsage(row);
}

export async function releaseTalevoAIRequest(supabase: SupabaseClient, requestId: string) {
  try {
    await completeTalevoAIRequest(supabase, requestId, false);
  } catch {
    // The database lease expires automatically; failure cleanup must remain best-effort.
  }
}

export async function finishTalevoAIRequest(supabase: SupabaseClient, requestId: string) {
  try {
    await supabase.rpc("finish_talevo_ai_request", { completed_request_id: requestId });
  } catch {
    // The database lease expires automatically; failure cleanup must remain best-effort.
  }
}

