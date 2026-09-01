import type { Task } from "@/types";
export function hasTaskProgress(task: Pick<Task, "subtasks">) { return (task.subtasks ?? []).length > 0; }
export function getCompletedSubtaskCount(task: Pick<Task, "subtasks">) { return (task.subtasks ?? []).filter((item) => item.completed).length; }
export function getRemainingSubtaskCount(task: Pick<Task, "subtasks">) { return (task.subtasks ?? []).length - getCompletedSubtaskCount(task); }
export function calculateTaskProgress(task: Pick<Task, "subtasks">) { const subtasks=task.subtasks ?? []; return subtasks.length ? Math.round((getCompletedSubtaskCount(task) / subtasks.length) * 100) : 0; }
