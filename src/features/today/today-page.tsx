"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Activity, ArrowRight, BookOpen, CalendarDays, Circle, CircleAlert, CircleCheck, ClipboardCheck, Clock3, MapPin, Sparkles } from "lucide-react";
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

function StudyHero({ classes, tasks, now, nowMinutes }: { classes: ClassSchedule[]; tasks: Task[]; now: Date; nowMinutes: number }) {
  const { tasks: allTasks } = useAppState();
  const [liveTime, setLiveTime] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setLiveTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = liveTime > now ? liveTime : now;
  const elapsedMinutes = clock.getHours() * 60 + clock.getMinutes() + clock.getSeconds() / 60;
  const current = classes.find((item) => timeToMinutes(item.startTime) <= nowMinutes && timeToMinutes(item.endTime) > nowMinutes);
  const next = classes.find((item) => timeToMinutes(item.startTime) > nowMinutes);
  const lesson = next ?? current;
  const completed = classes.filter((item) => timeToMinutes(item.endTime) <= elapsedMinutes).length;
  const percent = classes.length ? classes.reduce((total, item) => {
    const start = timeToMinutes(item.startTime);
    const duration = timeToMinutes(item.endTime) - start;
    return total + (duration > 0 ? Math.min(1, Math.max(0, (elapsedMinutes - start) / duration)) : elapsedMinutes >= start ? 1 : 0);
  }, 0) / classes.length : 0;
  const date = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(now);
  return <section className="study-hero" aria-label="TALEVO แนะนำ">
    <div className="study-hero-content">
      <span className="study-hero-label"><Sparkles aria-hidden="true" /> TALEVO แนะนำ</span>
      <p className="study-hero-eyebrow">{next ? "เตรียมตัวสำหรับคาบถัดไป" : current ? "คาบเรียนที่กำลังเรียน" : "ภาพรวมการเรียนวันนี้"}</p>
      <h2>{lesson ? getScheduleDisplayName(lesson) : classes.length ? "เรียนครบทุกคาบของวันนี้แล้ว" : "วันนี้ไม่มีคาบเรียน"}</h2>
      <div className="study-hero-facts">
        <div><Clock3 aria-hidden="true" /><span><strong>{lesson ? `${lesson.startTime} – ${lesson.endTime} น.` : "ไม่มีคาบถัดไป"}</strong><small>เวลาเรียน</small></span></div>
        <div><MapPin aria-hidden="true" /><span><strong>{lesson?.room || "ยังไม่ระบุห้อง"}</strong><small>ห้องเรียน</small></span></div>
        <div><CalendarDays aria-hidden="true" /><span><strong>{date}</strong><small>วันที่เรียน</small></span></div>
      </div>
      <div className="study-hero-summary">
        <div className="study-hero-progress"><div className="study-hero-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" /><circle cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${percent * 100} 100`} /></svg><span><strong>{completed}<small>/{classes.length}</small></strong><small>คาบ</small></span></div><div><span>วันนี้เรียนไปแล้ว</span><strong>{completed} คาบ</strong><small>เหลืออีก {classes.length - completed} คาบ</small></div></div>
        <div className="study-hero-tasks"><h3><ClipboardCheck aria-hidden="true" /> งานค้าง <span className={tasks.length === 0 ? "is-clear" : undefined}>{tasks.length} รายการ</span></h3>{tasks.length ? tasks.slice(0, 2).map((task) => { const overdue = getTaskDueState(task, now) === "overdue"; const StatusIcon = overdue ? CircleAlert : Circle; return <Link className={overdue ? "is-overdue" : ""} href={`/tasks/${task.id}`} key={task.id}><StatusIcon aria-hidden="true" /><span><strong>{task.title}</strong><small>{formatTodayTaskDeadline(task, now)}</small></span><ArrowRight aria-hidden="true" /></Link>; }) : <p><CircleCheck aria-hidden="true" /> ไม่มีงานค้างในวันนี้</p>}</div>
      </div>
    </div>
    <div className="phone-task-totals">
      <Link href="/tasks"><CircleCheck/><strong>{allTasks.filter(task => task.status === "completed" || task.completedAt != null).length}</strong><span>งานที่เสร็จแล้ว</span><ArrowRight/></Link>
      <Link href="/tasks"><ClipboardCheck/><strong>{tasks.length}</strong><span>งานที่ต้องทำ</span><ArrowRight/></Link>
      <Link href="/tasks"><Clock3/><strong>{getTasksDueToday(allTasks, now).length}</strong><span>งานใกล้ครบกำหนด</span><ArrowRight/></Link>
    </div>
    <section className="phone-next-lesson"><header><h3>คาบเรียนถัดไป</h3><Link href="/schedule">ดูทั้งหมด →</Link></header><Link href="/schedule" className="phone-next-lesson-card"><CalendarDays/><span><strong>{next ? getScheduleDisplayName(next) : "ไม่มีคาบเรียนถัดไป"}</strong><small>{next ? `${next.startTime}–${next.endTime} · ${next.room || "ยังไม่ระบุห้อง"}` : "ขอให้พักผ่อนให้เต็มที่นะ 🎉"}</small></span></Link></section>
    <div className="study-hero-visual"><div className="study-hero-speech study-hero-speech-glass"><span className="study-speech-bulb" aria-hidden="true">💡</span><strong>เตรียมตัวให้พร้อม!</strong><span className="study-speech-message">วันนี้เราไปเรียนกันเลย</span><span className="study-speech-stars" aria-hidden="true"><i /><i /><i /></span></div><span className="study-hero-mascot" aria-hidden="true" /><Link href="/schedule" className="study-hero-action"><BookOpen aria-hidden="true" /> ดูคาบเรียน <ArrowRight aria-hidden="true" /></Link></div>
  </section>;
}

function TodayFreeTimeCard({ gap, nowMinutes }: { gap?: FreeGap; nowMinutes: number }) {
  const { t } = useLanguage();
  const gapIsActive = gap !== undefined && nowMinutes >= gap.start;
  const remainingMinutes = gap ? gap.end - Math.max(nowMinutes, gap.start) : 0;
  const timeLabel = gap ? gapIsActive ? `ถึง ${formatMinutes(gap.end)}` : `${formatMinutes(gap.start)}–${formatMinutes(gap.end)}` : "ยังไม่มีช่วงว่าง";

  return <Card className="smart-free-time smart-free-time-hero">
    <div className="smart-free-time-hero-heading"><IconTile tone="purple"><Clock3 aria-hidden="true" /></IconTile><div><strong>{t("today.freeTime")}</strong><small>{gapIsActive ? "เวลาว่างตอนนี้" : gap ? "ช่วงว่างถัดไป" : "ภาพรวมเวลาว่างวันนี้"}</small></div></div>
    <div className="smart-free-time-hero-detail"><span>{gapIsActive ? "คุณมีเวลาว่าง" : gap ? "ช่วงว่างถัดไป" : "วันนี้"}</span><strong>{timeLabel}</strong><small>{gap ? `เหลือ ${formatDuration(remainingMinutes)}` : "ไม่มีช่วงว่างต่อเนื่องอย่างน้อย 30 นาที"}</small></div>
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
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} <span aria-hidden="true">👋</span></h1><p className="today-tagline">ทุกเรื่องเรียนของคุณ จัดการได้ง่าย ๆ ในที่เดียว</p></div><NotificationBell /></header>
    <section className="smart-today-hero"><StudyHero classes={view.classes} tasks={view.pendingTasks} now={referenceDate} nowMinutes={view.nowMinutes} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? "วันนี้ของคุณ" : "Today at a Glance"} />
    <div className="smart-today-primary-grid">
      <TodayScheduleCard classes={view.classes} nowMinutes={view.nowMinutes} />
      <TodayTaskCard task={view.pendingTasks[0]} now={referenceDate} schedules={schedules} />
      <TodayFreeTimeCard gap={view.usefulGap} nowMinutes={view.nowMinutes} />
    </div>
    </section>
  </div>;
}
