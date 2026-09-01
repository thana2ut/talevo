"use client";

import { Clock3 } from "lucide-react";
import { useParams } from "next/navigation";
import { formatCompletedTaskRemainingTime, getCompletedTaskRemainingTime } from "@/lib/task-retention";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";

/** Keeps the retention rule visible on a completed task without changing its completion controls. */
export function TaskDetailRetentionNotice() {
  const { id } = useParams<{ id: string }>();
  const { tasks, now } = useAppState();
  const { language, t } = useLanguage();
  const task = tasks.find((item) => item.id === id);
  if (!task || task.status !== "completed" || !task.completedAt) return null;
  const remaining = getCompletedTaskRemainingTime(task, now);
  if (remaining.expired || !task.completedAt) return null;
  return <aside className="task-detail-retention-shell"><div className="task-retention-notice" role="status"><Clock3 /><span>{t("tasks.taskAutoDeleteNotice")} <strong>{formatCompletedTaskRemainingTime(remaining, language)}</strong></span></div></aside>;
}
