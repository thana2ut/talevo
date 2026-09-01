import type { Task, TaskCompletionHistory } from "@/types";

export const COMPLETED_TASK_RETENTION_DAYS = 7;
export const COMPLETED_TASK_RETENTION_MS = COMPLETED_TASK_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type CompletedTaskRemainingTime = { expired: boolean; remainingMs: number; days: number; hours: number; minutes: number };

export function getCompletedTaskDeleteAt(task: Pick<Task, "completedAt">): Date | null {
  if (!task.completedAt) return null;
  const completedAt = new Date(task.completedAt);
  return Number.isNaN(completedAt.getTime()) ? null : new Date(completedAt.getTime() + COMPLETED_TASK_RETENTION_MS);
}

export function getCompletedTaskRemainingTime(task: Pick<Task, "completedAt">, now: Date): CompletedTaskRemainingTime {
  const deleteAt = getCompletedTaskDeleteAt(task);
  const remainingMs = deleteAt ? Math.max(0, deleteAt.getTime() - now.getTime()) : 0;
  const totalMinutes = Math.floor(remainingMs / 60_000);
  return { expired: Boolean(deleteAt) && remainingMs === 0, remainingMs, days: Math.floor(totalMinutes / 1_440), hours: Math.floor((totalMinutes % 1_440) / 60), minutes: totalMinutes % 60 };
}

export function formatCompletedTaskRemainingTime(remaining: CompletedTaskRemainingTime, language: "th" | "en") {
  if (remaining.remainingMs < 60_000) return language === "th" ? "น้อยกว่า 1 นาที" : "less than 1m";
  if (language === "en") return remaining.days > 0 ? `${remaining.days}d ${remaining.hours}h ${remaining.minutes}m` : remaining.hours > 0 ? `${remaining.hours}h ${remaining.minutes}m` : `${remaining.minutes}m`;
  return remaining.days > 0 ? `${remaining.days} วัน ${remaining.hours} ชม. ${remaining.minutes} นาที` : remaining.hours > 0 ? `${remaining.hours} ชม. ${remaining.minutes} นาที` : `${remaining.minutes} นาที`;
}

export function getExpiredCompletedTasks(tasks: Task[], now: Date) {
  return tasks.filter((task) => task.status === "completed" && Boolean(task.completedAt) && getCompletedTaskRemainingTime(task, now).expired);
}

export function createTaskCompletionHistory(task: Task): TaskCompletionHistory | null {
  if (!task.completedAt || Number.isNaN(new Date(task.completedAt).getTime())) return null;
  return { id: `task-history-${task.id}-${task.completedAt}`, originalTaskId: task.id, courseId: task.courseId, completedAt: task.completedAt, dueDate: task.dueDate, estimate: task.estimate, subtaskCount: task.subtasks?.length ?? 0 };
}
