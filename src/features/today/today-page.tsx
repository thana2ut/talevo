"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Activity, ArrowRight, CalendarDays, Circle, CircleCheck, ClipboardCheck, Clock3, MapPin } from "lucide-react";
import { Card, IconTile, NotificationBell, ProgressBar, SectionHeader } from "@/components/ui";
import { getTaskCourseLabel } from "@/lib/course-utils";
import { formatHomeGreeting } from "@/lib/greeting";
import { mondayIndex } from "@/lib/schedule-date";
import { getScheduleDisplayName, timeToMinutes } from "@/lib/schedule-utils";
import { calculateTaskProgress, getCompletedSubtaskCount, hasTaskProgress } from "@/lib/task-progress";
import { formatTodayTaskDeadline, getPendingTasksForToday, getTaskDueState, getTasksDueToday } from "@/lib/task-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { ClassSchedule, Task } from "@/types";
const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
type FreeGap = { start: number; end: number };

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} ชม.` : `${hours} ชม. ${remaining} น.`;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function getTodayClasses(classes: ClassSchedule[], now: Date) {
  const targetDay = mondayIndex(now);
  return classes.filter((item) => item.day === targetDay).sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime));
}

function getFreeGaps(classes: ClassSchedule[]) {
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = DAY_START;
  for (const item of classes) {
    const start = Math.max(DAY_START, timeToMinutes(item.startTime));
    const end = Math.min(DAY_END, timeToMinutes(item.endTime));
    if (start - cursor >= 30) gaps.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (DAY_END - cursor >= 30) gaps.push({ start: cursor, end: DAY_END });
  return gaps;
}

function OverviewSentence({ classes, pendingCount, dueTodayCount }: { classes: number; pendingCount: number; dueTodayCount: number }) {
  const classText = classes === 0 ? "วันนี้ไม่มีเรียน" : `วันนี้มีเรียน ${classes} คาบ`;
  let taskText = "ไม่มีงานค้าง";
  if (dueTodayCount > 0) {
    taskText = `มีงานส่งวันนี้ ${dueTodayCount} งาน`;
  } else if (pendingCount > 0) {
    taskText = `มีงานที่ต้องทำ ${pendingCount} งาน`;
  }
  return <p className="smart-today-overview">{classText} · {taskText}</p>;
}

function TodayScheduleCard({ classes, nowMinutes }: { classes: ClassSchedule[]; nowMinutes: number }) {
  const { t, language } = useLanguage();
  const upcomingIndex = classes.findIndex((item) => timeToMinutes(item.startTime) > nowMinutes);
  const currentIndex = classes.findIndex((item) => timeToMinutes(item.startTime) <= nowMinutes && timeToMinutes(item.endTime) > nowMinutes);
  const countText = new Intl.NumberFormat(language).format(classes.length);
  return <section className="smart-today-schedule" aria-label={language === "th" ? "ตารางเรียนวันนี้" : "Today's schedule"}>
    <header className="smart-today-schedule-header"><IconTile tone="purple"><CalendarDays /></IconTile><div><h2>{language === "th" ? "ตารางเรียนวันนี้" : "Today's Schedule"}</h2><p>{language === "th" ? `มี ${countText} คาบเรียน` : `${countText} classes today`}</p></div><Link href="/schedule" className="smart-today-schedule-link">{language === "th" ? "ดูทั้งหมด" : "View all"} <ArrowRight aria-hidden="true" /></Link></header>
    {classes.length ? <div className="smart-today-schedule-list">{classes.map((item, index) => {
      const ended = timeToMinutes(item.endTime) <= nowMinutes;
      const isCurrent = index === currentIndex;
      const isNext = index === upcomingIndex && !isCurrent && !ended;
      const StatusIcon = isCurrent ? Activity : isNext ? Clock3 : ended ? CircleCheck : Circle;
      const statusTone = isCurrent ? "is-current" : isNext ? "is-next" : ended ? "is-completed" : "is-pending";
      const status = language === "th"
        ? isCurrent ? "กำลังเรียน" : isNext ? "คาบถัดไป" : ended ? "เรียนแล้ว" : "ยังไม่เริ่ม"
        : isCurrent ? "In progress" : isNext ? "Next class" : ended ? "Completed" : "Not started";
      return <article className={`smart-today-schedule-item${isCurrent || isNext ? " is-active" : ""}`} key={item.id}>
        <div className="smart-today-schedule-meta"><span className={`smart-today-schedule-time${isCurrent || isNext ? " is-active" : ""}`}>{item.startTime}–{item.endTime}</span><span className={`smart-today-schedule-status ${statusTone}`}><StatusIcon aria-hidden="true" />{status}</span></div>
        <strong className="smart-today-schedule-name">{getScheduleDisplayName(item)}</strong>
        <span className="smart-today-schedule-room"><MapPin aria-hidden="true" /><span>{item.room || (language === "th" ? "ยังไม่ระบุห้อง" : "Room not set")}</span></span>
      </article>;
    })}</div> : <p className="smart-today-schedule-empty">{language === "th" ? "วันนี้ไม่มีคาบเรียน" : "No classes today"}</p>}
  </section>;
}

function TodayTaskCard({ task, now, schedules }: { task?: Task; now: Date; schedules: ClassSchedule[] }) {
  if (!task) {
    return (
      <Card className="smart-due-card smart-empty-card">
        <CircleCheck />
        <div className="smart-due-copy">
          <span>งานที่ควรทำต่อ</span>
          <strong>ยังไม่มีงานที่ต้องทำ</strong>
          <small>เพิ่มงานแรกเพื่อเริ่มติดตามกำหนดส่ง</small>
        </div>
        <div className="smart-due-actions">
          <Link href="/tasks/new">เพิ่มงานแรก</Link>
        </div>
      </Card>
    );
  }

  const subtaskTotal = task.subtasks?.length ?? 0;
  const completed = getCompletedSubtaskCount(task);
  const courseLabel = getTaskCourseLabel(task, schedules);
  const deadline = formatTodayTaskDeadline(task, now);
  const dueState = getTaskDueState(task, now);
  const isOverdue = dueState === "overdue";

  return (
    <Card className="smart-due-card">
      <IconTile tone={task.color === "orange" ? "orange" : "purple"}>
        <ClipboardCheck />
      </IconTile>
      <div className="smart-due-copy">
        <div className="smart-due-header-row">
          <span>งานที่ควรทำต่อ</span>
          <small className="smart-due-subtitle">
            {isOverdue ? "เลยกำหนดส่งแล้ว" : "งานที่ใกล้ถึงกำหนดที่สุด"}
          </small>
        </div>
        <strong>{task.title}</strong>
        <div className="smart-due-meta">
          {courseLabel && <span className="smart-due-course">{courseLabel}</span>}
          {courseLabel && <span className="smart-due-meta-dot">·</span>}
          <span className={isOverdue ? "due-overdue" : "due-normal"}>
            {deadline}
          </span>
        </div>
        {hasTaskProgress(task) && subtaskTotal > 0 && (
          <div className="smart-task-progress-wrap">
            <ProgressBar value={calculateTaskProgress(task)} color={task.color} />
            <small>เหลือ {subtaskTotal - completed} จาก {subtaskTotal} ขั้นตอน</small>
          </div>
        )}
      </div>
      <div className="smart-due-actions">
        <Link href={`/tasks/${task.id}`}>ทำงานต่อ</Link>
      </div>
    </Card>
  );
}

function TodayFreeTimeCard({ gap, nowMinutes }: { gap?: FreeGap; nowMinutes: number }) {
  const { t } = useLanguage();
  const gapIsActive = gap !== undefined && nowMinutes >= gap.start;
  const remainingMinutes = gap ? gap.end - Math.max(nowMinutes, gap.start) : 0;
  const timeLabel = gap ? gapIsActive ? `ถึง ${formatMinutes(gap.end)}` : `${formatMinutes(gap.start)}–${formatMinutes(gap.end)}` : "ยังไม่มีช่วงว่าง";

  return <Card className="smart-free-time smart-free-time-hero">
    <div className="smart-free-time-hero-heading"><IconTile tone="purple"><Clock3 aria-hidden="true" /></IconTile><div><strong>{t("today.freeTime")}</strong><small>{gapIsActive ? "เวลาว่างตอนนี้" : gap ? "ช่วงว่างถัดไป" : "ภาพรวมเวลาว่างวันนี้"}</small></div></div>
    <div className="smart-free-time-hero-detail"><span>{gapIsActive ? "คุณมีเวลาว่าง" : gap ? "ช่วงเวลาที่จัดไว้ได้" : "วันนี้"}</span><strong>{timeLabel}</strong><small>{gap ? `เหลือ ${formatDuration(remainingMinutes)}` : "ไม่มีช่วงว่างต่อเนื่องอย่างน้อย 30 นาที"}</small></div>
  </Card>;
}

export function TodayPage() {
  const { profile, isAuthLoading, isHydrated, tasks, schedules, now: appNow } = useAppState();
  const { t, language } = useLanguage();
  const clientReady = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const referenceDate = useMemo(() => clientReady ? appNow : new Date(2000, 0, 1, 0, 0), [appNow, clientReady]);
  const view = useMemo(() => {
    const classes = getTodayClasses(schedules, referenceDate);
    const pendingTasks = getPendingTasksForToday(tasks, referenceDate);
    const dueTodayTasks = getTasksDueToday(tasks, referenceDate);
    const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    const gaps = getFreeGaps(classes);
    const usefulGap = gaps.find((gap) => gap.end > nowMinutes);
    return { classes, pendingTasks, dueTodayTasks, nowMinutes, usefulGap };
  }, [referenceDate, schedules, tasks]);
  const isLoadingProfile = isAuthLoading || !isHydrated || !clientReady;
  const greeting = formatHomeGreeting(profile.displayName, isLoadingProfile);

  return <div className="page today-page smart-today-page">
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} <span aria-hidden="true">👋</span></h1><OverviewSentence classes={view.classes.length} pendingCount={view.pendingTasks.length} dueTodayCount={view.dueTodayTasks.length} /></div><NotificationBell /></header>
    <section className="smart-today-hero"><TodayFreeTimeCard gap={view.usefulGap} nowMinutes={view.nowMinutes} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? "วันนี้ของคุณ" : "Today at a Glance"} />
    <div className="smart-today-primary-grid">
      <TodayTaskCard task={view.pendingTasks[0]} now={referenceDate} schedules={schedules} />
      <TodayScheduleCard classes={view.classes} nowMinutes={view.nowMinutes} />
    </div>
    </section>
  </div>;
}
