"use client";

import Link from "next/link";
import { Bell, BellRing, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Clock3, FileText, FolderKanban, MapPin, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Card, ProgressBar, StatusPill } from "@/components/ui";
import { getTaskCourseLabel } from "@/lib/course-utils";
import { calculateTaskProgress, getCompletedSubtaskCount, hasTaskProgress } from "@/lib/task-progress";
import { formatCompletedTaskRemainingTime, getCompletedTaskRemainingTime } from "@/lib/task-retention";
import { formatTaskCompletionDate } from "@/lib/task-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import { getContrastTextColor, normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { formatNotificationTime, getNotificationTone } from "@/lib/alerts/notification-utils";
import type { AppNotification, ClassSchedule, Task } from "@/types";

export function SubjectIcon({ color, children }: { color: string; children?: React.ReactNode }) {
  const hexColor = /^#[0-9a-f]{3,6}$/i.test(color) ? normalizeTalevoColor(color) : undefined;
  return <span className={`subject-icon ${hexColor ? "subject-custom" : `subject-${color}`}`} style={hexColor ? { background: hexColor, color: getContrastTextColor(hexColor) } : undefined}>{children ?? <BookOpen />}</span>;
}

export function TaskCard({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { schedules, settings, now } = useAppState();
  const { language, t } = useLanguage();
  const showsProgress = hasTaskProgress(task); const progress = calculateTaskProgress(task); const completedSubtasks = getCompletedSubtaskCount(task); const courseLabel = getTaskCourseLabel(task, schedules);
  const completed = task.status === "completed" && Boolean(task.completedAt); const retention = completed ? getCompletedTaskRemainingTime(task, now) : null;
  const countdownTone = retention && retention.remainingMs < 60 * 60 * 1000 ? "urgent" : retention && retention.remainingMs < 24 * 60 * 60 * 1000 ? "soon" : "";
  return <Link href={`/tasks/${task.id}`} className="task-card-link"><Card className={`task-card ${compact ? "task-card-compact" : ""}`} style={{ "--task-color": normalizeTalevoColor(task.color) } as React.CSSProperties}>{completed ? <div className="task-completed-layout"><SubjectIcon color={task.color}><TaskTypeIcon task={task} /></SubjectIcon><div className="task-completed-content"><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<small className="task-course-label">{courseLabel}</small><div className="task-completed-meta"><div className="task-completed"><CheckCircle2 />{t("tasks.completedAt")} {formatTaskCompletionDate(task.completedAt, language, settings.yearSystem, settings.dateFormat)}</div>{retention && <div className={`task-auto-delete ${countdownTone}`}><Clock3 /><span suppressHydrationWarning>{t("tasks.autoDeleteIn")} {formatCompletedTaskRemainingTime(retention, language)}</span></div>}</div></div></div> : <><div className="task-card-top"><SubjectIcon color={task.color}><TaskTypeIcon task={task} /></SubjectIcon>{task.status === "doing" ? <StatusPill tone="orange">{language === "th" ? "กำลังทำ" : "In progress"}</StatusPill> : <StatusPill tone="blue">{language === "th" ? "ยังไม่เริ่ม" : "Not started"}</StatusPill>}</div><h3>{task.title}</h3><p>{task.description}</p><small className="task-course-label">{courseLabel}</small><div className="task-due"><Clock3 />{task.dueLabel}</div>{showsProgress && <ProgressBar value={progress} color={task.color} label={`${completedSubtasks}/${task.subtasks?.length ?? 0} ${language === "th" ? "ขั้นตอน" : "steps"} · ${progress}%`} />}</>}</Card></Link>;
}

export function TaskTypeIcon({ task }: { task: Pick<Task, "title" | "description"> }) {
  if (/โครงงาน|โปรเจกต์/.test(`${task.title} ${task.description}`)) return <FolderKanban aria-hidden="true" />;
  if (/อ่าน/.test(`${task.title} ${task.description}`)) return <BookOpen aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

export function ScheduleCard({ item, onClick }: { item: ClassSchedule; onClick?: () => void }) {
  return (
    <button className="schedule-card schedule-custom" type="button" onClick={onClick} style={{ "--course-color": normalizeTalevoColor(item.color) } as React.CSSProperties}>
      <span className="schedule-time">{item.startTime}</span><div><strong>{item.name}</strong><span><MapPin />{item.room}</span></div><CalendarClock />
    </button>
  );
}

export function NotificationCard({ item, onClick, onDelete, deleteLabel }: { item: AppNotification; onClick: () => void; onDelete?: () => void; deleteLabel?: string }) {
  const { language } = useLanguage();
  const tone = getNotificationTone(item);
  const Icon = item.type === "deadline_risk" || item.type === "academic_weather" ? TriangleAlert : item.type === "class_upcoming" || item.type === "class_ending" ? BellRing : item.type === "exam_upcoming" || item.type === "exam_today" ? CalendarClock : item.type === "weekly_radar" || item.type === "daily_brief" || item.type === "morning_summary" ? Sparkles : Bell;
  const content = <><span className="notification-icon"><Icon aria-hidden="true" /></span><span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><small>{formatNotificationTime(item.createdAt, language)}</small></span>{!item.readAt && <i aria-label={language === "th" ? "ยังไม่อ่าน" : "Unread"} />}{item.href && <ChevronRight className="notification-chevron" aria-hidden="true" />}</>;
  const className = `notification-card notification-${tone} ${item.readAt ? "is-read" : "is-unread"}`;
  if (onDelete) {
    const deleteNotification = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onDelete();
    };
    const main = item.href
      ? <Link href={item.href} className="notification-card-main" onClick={onClick}>{content}</Link>
      : <button className="notification-card-main" type="button" onClick={onClick}>{content}</button>;
    return <article className={`${className} notification-card-with-delete`}>{main}<button className="notification-delete-button" type="button" onClick={deleteNotification} aria-label={deleteLabel ?? (language === "th" ? "ลบการแจ้งเตือน" : "Delete notification")}><Trash2 aria-hidden="true" /></button></article>;
  }
  if (item.href) return <Link href={item.href} className={className} onClick={onClick}>{content}</Link>;
  return (
    <button className={className} type="button" onClick={onClick}>{content}</button>
  );
}
