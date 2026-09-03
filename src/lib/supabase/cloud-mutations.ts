import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcademicTerm,
  ClassSchedule,
  CourseGradePlan,
  Exam,
  FinanceTransaction,
  UserProfile,
  Task,
} from "@/types";

const LOCAL_BANGKOK_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

function toCloudTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const source = LOCAL_BANGKOK_DATETIME.test(value) ? `${value}+07:00` : value;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/**
 * Persist (insert/upsert) a single class schedule record to Supabase.
 */
export async function persistClassSchedule(
  supabase: SupabaseClient,
  userId: string,
  schedule: ClassSchedule,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.from("class_schedules").upsert({
      user_id: userId,
      id: schedule.id,
      course_id: schedule.courseId,
      name: schedule.name,
      teacher: schedule.teacher ?? "",
      room: schedule.room ?? "",
      color: schedule.color,
      day: schedule.day,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      note: schedule.note ?? null,
    });
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist multiple class schedules (e.g. from syllabus scanner import).
 */
export async function persistClassSchedulesBatch(
  supabase: SupabaseClient,
  userId: string,
  schedules: ClassSchedule[],
): Promise<{ error: Error | null }> {
  if (!schedules.length) return { error: null };
  try {
    const rows = schedules.map((schedule) => ({
      user_id: userId,
      id: schedule.id,
      course_id: schedule.courseId,
      name: schedule.name,
      teacher: schedule.teacher ?? "",
      room: schedule.room ?? "",
      color: schedule.color,
      day: schedule.day,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      note: schedule.note ?? null,
    }));
    const { error } = await supabase.from("class_schedules").upsert(rows);
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Delete a class schedule record from Supabase.
 */
export async function deleteClassSchedule(
  supabase: SupabaseClient,
  userId: string,
  scheduleId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("class_schedules")
      .delete()
      .eq("user_id", userId)
      .eq("id", scheduleId);
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist a task and its subtasks to Supabase.
 */
export async function persistTask(
  supabase: SupabaseClient,
  userId: string,
  task: Task,
): Promise<{ error: Error | null }> {
  try {
    const taskRow = {
      user_id: userId,
      id: task.id,
      title: task.title,
      course_id: task.courseId ?? null,
      description: task.description ?? "",
      due_label: task.dueLabel ?? "",
      due_date: toCloudTimestamp(task.dueDate) ?? new Date().toISOString(),
      estimate: task.estimate ?? "",
      status: task.status,
      color: task.color,
      attachment_label: task.attachment ?? null,
      completed_at: toCloudTimestamp(task.completedAt),
    };
    const { error: taskError } = await supabase.from("tasks").upsert(taskRow);
    if (taskError) return { error: new Error(taskError.message) };

    // Subtasks
    if (task.subtasks && task.subtasks.length > 0) {
      const subtaskRows = task.subtasks.map((st, index) => ({
        user_id: userId,
        task_id: task.id,
        id: st.id,
        title: st.title,
        completed: st.completed,
        completed_at: toCloudTimestamp(st.completedAt),
        position: index,
      }));
      const { error: stError } = await supabase.from("task_subtasks").upsert(subtaskRows);
      if (stError) return { error: new Error(stError.message) };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Delete a task from Supabase (cascades to subtasks and attachments).
 */
export async function deleteTask(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("user_id", userId)
      .eq("id", taskId);
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist an exam and its topics to Supabase.
 */
export async function persistExam(
  supabase: SupabaseClient,
  userId: string,
  exam: Exam,
): Promise<{ error: Error | null }> {
  try {
    const examRow = {
      user_id: userId,
      id: exam.id,
      course_id: exam.courseId,
      title: exam.title,
      type: exam.type,
      start_at: toCloudTimestamp(exam.startAt) ?? new Date().toISOString(),
      end_at: toCloudTimestamp(exam.endAt),
      room: exam.room ?? null,
      note: exam.note ?? null,
      completed_at: toCloudTimestamp(exam.completedAt),
      created_at: toCloudTimestamp(exam.createdAt) ?? new Date().toISOString(),
      updated_at: toCloudTimestamp(exam.updatedAt) ?? new Date().toISOString(),
    };
    const { error: examError } = await supabase.from("exams").upsert(examRow);
    if (examError) return { error: new Error(examError.message) };

    if (exam.topics && exam.topics.length > 0) {
      const topicRows = exam.topics.map((topic, index) => ({
        user_id: userId,
        exam_id: exam.id,
        id: topic.id,
        title: topic.title,
        completed: topic.completed,
        completed_at: toCloudTimestamp(topic.completedAt),
        position: index,
      }));
      const { error: topicError } = await supabase.from("exam_topics").upsert(topicRows);
      if (topicError) return { error: new Error(topicError.message) };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Delete an exam from Supabase.
 */
export async function deleteExam(
  supabase: SupabaseClient,
  userId: string,
  examId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("user_id", userId)
      .eq("id", examId);
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist a course grade plan, its components, and its thresholds.
 */
export async function persistGradePlan(
  supabase: SupabaseClient,
  userId: string,
  plan: CourseGradePlan,
): Promise<{ error: Error | null }> {
  try {
    const planRow = {
      user_id: userId,
      id: plan.id,
      course_id: plan.courseId,
      target_grade: plan.targetGrade ?? null,
    };
    const { error: planError } = await supabase.from("grade_plans").upsert(planRow);
    if (planError) return { error: new Error(planError.message) };

    // Components
    if (plan.components && plan.components.length > 0) {
      const componentRows = plan.components.map((comp, index) => ({
        user_id: userId,
        grade_plan_id: plan.id,
        id: comp.id,
        name: comp.name,
        weight: comp.weight,
        max_score: comp.maxScore,
        earned_score: comp.earnedScore ?? null,
        note: comp.note ?? null,
        position: index,
      }));
      const { error: compError } = await supabase.from("grade_components").upsert(componentRows);
      if (compError) return { error: new Error(compError.message) };
    }

    // Thresholds
    if (plan.thresholds && plan.thresholds.length > 0) {
      const thresholdRows = plan.thresholds.map((threshold, index) => ({
        user_id: userId,
        grade_plan_id: plan.id,
        label: threshold.label,
        minimum_percent: threshold.minimumPercent,
        position: index,
      }));
      const { error: thError } = await supabase.from("grade_thresholds").upsert(thresholdRows);
      if (thError) return { error: new Error(thError.message) };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist a finance transaction to Supabase.
 */
export async function persistFinanceTransaction(
  supabase: SupabaseClient,
  userId: string,
  transaction: FinanceTransaction,
  categoryId: string | null,
): Promise<{ error: Error | null }> {
  try {
    const row = {
      user_id: userId,
      id: transaction.id,
      type: transaction.type,
      title: transaction.title,
      amount: transaction.amount,
      category_id: categoryId,
      date: transaction.date,
      note: transaction.note ?? null,
    };
    const { error } = await supabase.from("finance_transactions").upsert(row);
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Delete a finance transaction from Supabase.
 */
export async function deleteFinanceTransaction(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("finance_transactions")
      .delete()
      .eq("user_id", userId)
      .eq("id", transactionId);
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist user profile to Supabase.
 */
export async function persistProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId,
      display_name: profile.displayName,
      major: profile.major,
      university: profile.university,
      updated_at: new Date().toISOString(),
    });
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist academic term to Supabase.
 */
export async function persistAcademicTerm(
  supabase: SupabaseClient,
  userId: string,
  term: AcademicTerm,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.from("academic_terms").upsert({
      user_id: userId,
      level: term.level,
      term: term.term,
      academic_year: term.academicYear,
      label: term.label ?? null,
      updated_at: new Date().toISOString(),
    });
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Persist daily budget (finance_settings) to Supabase.
 */
export async function persistDailyBudget(
  supabase: SupabaseClient,
  userId: string,
  dailyBudget: number,
  selectedMonth?: string,
): Promise<{ error: Error | null }> {
  try {
    const month = selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)
      ? selectedMonth
      : new Date().toISOString().slice(0, 7);
    const { error } = await supabase.from("finance_settings").upsert({
      user_id: userId,
      daily_budget: Math.max(0, dailyBudget),
      selected_month: month,
      updated_at: new Date().toISOString(),
    });
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}
