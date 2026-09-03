import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_CONTEXT_MAX_CHARACTERS } from "@/lib/ai/config";
import { AI_CONTEXT_KEYS, type AIContextKey, type AIContextSelection } from "@/lib/ai/types";

export class AIContextReadError extends Error {
  constructor() {
    super("TALEVO context could not be read");
    this.name = "AIContextReadError";
  }
}

interface AIContextResult {
  block: string;
  attachedContext: AIContextKey[];
}

function assertQuery(error: { message: string } | null) {
  if (error) throw new AIContextReadError();
}

function withinBudget(value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length <= AI_CONTEXT_MAX_CHARACTERS
    ? serialized
    : `${serialized.slice(0, AI_CONTEXT_MAX_CHARACTERS)}\n[บริบทถูกตัดตามขีดจำกัดความเป็นส่วนตัว]`;
}

export async function buildTalevoContext(
  supabase: SupabaseClient,
  userId: string,
  selected: AIContextSelection,
): Promise<AIContextResult> {
  const attachedContext = AI_CONTEXT_KEYS.filter((key) => selected[key]);
  if (attachedContext.length === 0) return { block: "", attachedContext: [] };

  const context: Record<string, unknown> = {};
  let courseNames = new Map<string, string>();

  if (selected.schedule || selected.grades) {
    const { data, error } = await supabase
      .from("class_schedules")
      .select("course_id,name,day,start_time,end_time")
      .eq("user_id", userId)
      .order("day", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(20);
    assertQuery(error);
    courseNames = new Map((data ?? []).map((row) => [row.course_id, row.name]));
    if (selected.schedule) {
      context.schedule = (data ?? []).map((row) => ({
        subject: row.name,
        day: row.day,
        startTime: row.start_time,
        endTime: row.end_time,
      }));
    }
  }

  if (selected.tasks) {
    const { data, error } = await supabase
      .from("tasks")
      .select("title,due_date,status")
      .eq("user_id", userId)
      .order("due_date", { ascending: true })
      .limit(20);
    assertQuery(error);
    context.tasks = (data ?? []).map((row) => ({
      title: row.title,
      dueDate: row.due_date,
      status: row.status,
    }));
  }

  if (selected.exams) {
    const { data, error } = await supabase
      .from("exams")
      .select("title,type,start_at,completed_at")
      .eq("user_id", userId)
      .order("start_at", { ascending: true })
      .limit(12);
    assertQuery(error);
    context.exams = (data ?? []).map((row) => ({
      title: row.title,
      type: row.type,
      startAt: row.start_at,
      completed: Boolean(row.completed_at),
    }));
  }

  if (selected.grades) {
    const { data: plans, error: plansError } = await supabase
      .from("grade_plans")
      .select("id,course_id,target_grade")
      .eq("user_id", userId)
      .limit(10);
    assertQuery(plansError);
    const planIds = (plans ?? []).map((row) => row.id);
    let components: Array<{
      grade_plan_id: string;
      name: string;
      weight: number;
      max_score: number;
      earned_score: number | null;
    }> = [];
    if (planIds.length > 0) {
      const { data, error } = await supabase
        .from("grade_components")
        .select("grade_plan_id,name,weight,max_score,earned_score")
        .eq("user_id", userId)
        .in("grade_plan_id", planIds)
        .order("position", { ascending: true })
        .limit(40);
      assertQuery(error);
      components = data ?? [];
    }
    context.grades = (plans ?? []).map((plan) => ({
      subject: courseNames.get(plan.course_id) ?? "รายวิชาที่บันทึกไว้",
      targetGrade: plan.target_grade,
      components: components.filter((item) => item.grade_plan_id === plan.id).map((item) => ({
        name: item.name,
        weight: item.weight,
        maxScore: item.max_score,
        earnedScore: item.earned_score,
      })),
    }));
  }

  return { block: withinBudget(context), attachedContext };
}
