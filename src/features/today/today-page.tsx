"use client";

import Link from "next/link";
import {LiveOverview} from "./live-overview";
import {MobileHome} from "./mobile-home";
import {ThailandClock} from "@/components/thailand-clock";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Activity, ArrowRight, CalendarDays, Circle, CircleAlert, CircleCheck, ClipboardCheck, Clock3, MapPin, Sparkles } from "lucide-react";
import { IconTile, NotificationBell, SectionHeader } from "@/components/ui";

import { formatHomeGreeting } from "@/lib/greeting";
import { mondayIndex } from "@/lib/schedule-date";
import { getScheduleDisplayName, timeToMinutes } from "@/lib/schedule-utils";

import { formatTodayTaskDeadline, getPendingTasksForToday, getTaskDueState, getTasksDueToday } from "@/lib/task-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { ClassSchedule, Task } from "@/types";
import { useUiText } from "@/providers/ui-language";

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
  const uiText = useUiText();

  const { language } = useLanguage();
  const upcomingIndex = classes.findIndex((item) => timeToMinutes(item.startTime) > nowMinutes);
  const currentIndex = classes.findIndex((item) => timeToMinutes(item.startTime) <= nowMinutes && timeToMinutes(item.endTime) > nowMinutes);
  const countText = new Intl.NumberFormat(language).format(classes.length);
  return <section className="smart-today-schedule" aria-label={language === "th" ? uiText("ตารางเรียนวันนี้") : "Today's schedule"}>
    <header className="smart-today-schedule-header"><IconTile tone="purple"><CalendarDays /></IconTile><div><h2>{language === "th" ? uiText("ตารางเรียนวันนี้") : "Today's Schedule"}</h2><p>{language === "th" ? uiText("มี {0} คาบเรียน", [countText]) : `${countText} classes today`}</p></div><Link href="/schedule" className="smart-today-schedule-link">{language === "th" ? uiText("ดูทั้งหมด") : "View all"} <ArrowRight aria-hidden="true" /></Link></header>
    {classes.length ? <div className="smart-today-schedule-list">{classes.map((item, index) => {
      const ended = timeToMinutes(item.endTime) <= nowMinutes;
      const isCurrent = index === currentIndex;
      const isNext = index === upcomingIndex && !isCurrent && !ended;
      const StatusIcon = isCurrent ? Activity : isNext ? Clock3 : ended ? CircleCheck : Circle;
      const statusTone = isCurrent ? "is-current" : isNext ? "is-next" : ended ? "is-completed" : "is-pending";
      const status = language === "th"
        ? isCurrent ? uiText("กำลังเรียน") : isNext ? uiText("คาบถัดไป") : ended ? uiText("เรียนแล้ว") : uiText("ยังไม่เริ่ม")
        : isCurrent ? "In progress" : isNext ? "Next class" : ended ? "Completed" : "Not started";
      return <article className={`smart-today-schedule-item${isCurrent || isNext ? " is-active" : ""}`} key={item.id}>
        <div className="smart-today-schedule-meta"><span className={`smart-today-schedule-time${isCurrent || isNext ? " is-active" : ""}`}>{item.startTime}–{item.endTime}</span><span className={`smart-today-schedule-status ${statusTone}`}><StatusIcon aria-hidden="true" />{uiText(status)}</span></div>
        <strong className="smart-today-schedule-name">{getScheduleDisplayName(item)}</strong>
        <span className="smart-today-schedule-room"><MapPin aria-hidden="true" /><span>{item.room || (language === "th" ? uiText("ยังไม่ระบุห้อง") : "Room not set")}</span></span>
      </article>;
    })}</div> : <p className="smart-today-schedule-empty">{language === "th" ? uiText("วันนี้ไม่มีคาบเรียน") : "No classes today"}</p>}
  </section>;
}

function StudyHero({ classes, tasks, now, nowMinutes, gap }: { classes: ClassSchedule[]; tasks: Task[]; now: Date; nowMinutes: number; gap?: FreeGap }) {
  const uiText = useUiText();

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
  const date = new Intl.DateTimeFormat(uiText.locale, { day: "numeric", month: "short", year: "numeric" }).format(now);
  return <section className="study-hero" aria-label={uiText("TALEVO แนะนำ")}>
    <div className="study-hero-content">
      <span className="study-hero-label"><Sparkles aria-hidden="true" /> {uiText("TALEVO แนะนำ")}</span>
      <p className="study-hero-eyebrow">{next ? uiText("เตรียมตัวสำหรับคาบถัดไป") : current ? uiText("คาบเรียนที่กำลังเรียน") : uiText("ภาพรวมการเรียนวันนี้")}</p>
      <h2>{lesson ? getScheduleDisplayName(lesson) : classes.length ? uiText("เรียนครบทุกคาบของวันนี้แล้ว") : uiText("วันนี้ไม่มีคาบเรียน")}</h2>
      <div className="study-hero-facts">
        <div><Clock3 aria-hidden="true" /><span><strong>{lesson ? uiText("{0} – {1} น.", [lesson.startTime, lesson.endTime]) : uiText("ไม่มีคาบถัดไป")}</strong><small>{uiText("เวลาเรียน")}</small></span></div>
        <div><MapPin aria-hidden="true" /><span><strong>{lesson?.room || uiText("ยังไม่ระบุห้อง")}</strong><small>{uiText("ห้องเรียน")}</small></span></div>
        <div><CalendarDays aria-hidden="true" /><span><strong>{date}</strong><small>{uiText("วันที่เรียน")}</small></span></div>
      </div>
      <div className="study-hero-summary">
        <div className="study-hero-progress"><div className="study-hero-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" /><circle cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${percent * 100} 100`} /></svg><span><strong>{completed}<small>/{classes.length}</small></strong><small>{uiText("คาบ")}</small></span></div><div><span>{uiText("วันนี้เรียนไปแล้ว")}</span><strong>{completed} {uiText("คาบ")}</strong><small>{uiText("เหลืออีก")}{classes.length - completed} {uiText("คาบ")}</small></div></div>
        <div className="study-hero-tasks"><h3><ClipboardCheck aria-hidden="true" /> {uiText("งานค้าง")}<span className={tasks.length === 0 ? "is-clear" : undefined}>{tasks.length} {uiText("รายการ")}</span></h3>{tasks.length ? tasks.slice(0, 2).map((task) => { const overdue = getTaskDueState(task, now) === "overdue"; const StatusIcon = overdue ? CircleAlert : Circle; return <Link className={overdue ? "is-overdue" : ""} href={`/tasks/${task.id}`} key={task.id}><StatusIcon aria-hidden="true" /><span><strong>{task.title}</strong><small>{formatTodayTaskDeadline(task, now, uiText.language)}</small></span><ArrowRight aria-hidden="true" /></Link>; }) : <p><CircleCheck aria-hidden="true" /> {uiText("ไม่มีงานค้างในวันนี้")}</p>}</div>
      </div>
    </div>
    <div className="phone-task-totals">
      <Link href="/tasks"><CircleCheck/><strong>{allTasks.filter(task => task.status === "completed" || task.completedAt != null).length}</strong><span>{uiText("งานที่เสร็จแล้ว")}</span><ArrowRight/></Link>
      <Link href="/tasks"><ClipboardCheck/><strong>{tasks.length}</strong><span>{uiText("งานที่ต้องทำ")}</span><ArrowRight/></Link>
      <Link href="/tasks"><Clock3/><strong>{getTasksDueToday(allTasks, now).length}</strong><span>{uiText("งานใกล้ครบกำหนด")}</span><ArrowRight/></Link>
    </div>
    <section className="phone-next-lesson"><Link href="/schedule" className="phone-next-lesson-card"><CalendarDays/><span><strong>{next ? getScheduleDisplayName(next) : uiText("ไม่มีคาบเรียนถัดไป")}</strong><small>{next ? `${next.startTime}–${next.endTime} · ${next.room || uiText("ยังไม่ระบุห้อง")}` : uiText("ขอให้พักผ่อนให้เต็มที่นะ 🎉")}</small></span></Link></section>
    <section className="phone-free-time"><div className="phone-free-time-card"><Clock3 aria-hidden="true" /><span><strong>{gap ? (nowMinutes >= gap.start ? uiText("ว่างถึง {0}", [formatMinutes(gap.end)]) : `${formatMinutes(gap.start)}–${formatMinutes(gap.end)}`) : uiText("วันนี้ไม่มีช่วงว่าง")}</strong><small>{gap ? `${nowMinutes >= gap.start ? uiText("เหลือ") : uiText("ว่าง")} ${formatDuration(gap.end - Math.max(nowMinutes, gap.start))}` : uiText("ไม่มีช่วงว่างต่อเนื่องอย่างน้อย 30 นาที")}</small></span></div></section>
    <div className="study-hero-visual"><div className="study-hero-speech study-hero-speech-glass"><span className="study-speech-bulb" aria-hidden="true">💡</span><strong>{uiText("เตรียมตัวให้พร้อม!")}</strong><span className="study-speech-message">{uiText("วันนี้เราไปเรียนกันเลย")}</span><span className="study-speech-stars" aria-hidden="true"><i /><i /><i /></span></div><span className="study-hero-mascot" aria-hidden="true" /><ThailandClock className="study-hero-action"/></div>
  </section>;
}

export function TodayPage() {
  const uiText = useUiText();

  const { profile, isAuthLoading, isHydrated, tasks, schedules, academicTerm, now: appNow } = useAppState();
  const { t, language } = useLanguage();
  const clientReady = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const referenceDate = useMemo(() => clientReady ? appNow : new Date(2000, 0, 1, 0, 0), [appNow, clientReady]);
  const view = useMemo(() => {
    const normalizeScope = (value: string | undefined) => value?.trim().toLocaleLowerCase("th-TH") ?? "";
    const classes = getTodayClasses(schedules.filter(item => normalizeScope(item.academicLevel) === normalizeScope(academicTerm.level) && normalizeScope(item.academicTerm) === normalizeScope(academicTerm.term) && normalizeScope(item.academicYear) === normalizeScope(academicTerm.academicYear)), referenceDate);
    const pendingTasks = getPendingTasksForToday(tasks, referenceDate);
    const dueTodayTasks = getTasksDueToday(tasks, referenceDate);
    const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    const gaps = getFreeGaps(classes);
    const usefulGap = gaps.find((gap) => gap.end > nowMinutes);
    return { classes, pendingTasks, dueTodayTasks, nowMinutes, usefulGap };
  }, [referenceDate, schedules, tasks, academicTerm]);
  const isLoadingProfile = isAuthLoading || !isHydrated || !clientReady;
  const greeting = formatHomeGreeting(profile.displayName, isLoadingProfile, language);

  return <div className="page today-page smart-today-page">
    <MobileHome greeting={greeting} now={referenceDate} classes={view.classes} tasks={tasks} pending={view.pendingTasks}><TodayScheduleCard classes={view.classes} nowMinutes={view.nowMinutes}/></MobileHome>
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} <span aria-hidden="true">👋</span></h1><p className="today-tagline">{uiText("ทุกเรื่องเรียนของคุณ จัดการได้ง่าย ๆ ในที่เดียว")}</p></div><NotificationBell glass /></header>
    <section className="smart-today-hero"><StudyHero classes={view.classes} tasks={view.pendingTasks} now={referenceDate} nowMinutes={view.nowMinutes} gap={view.usefulGap} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? uiText("วันนี้ของคุณ") : "Today at a Glance"} />
    <div className="smart-today-primary-grid">
      <TodayScheduleCard classes={view.classes} nowMinutes={view.nowMinutes} />
      <LiveOverview kind="tasks" />
      <LiveOverview kind="lesson" />
    </div>
    </section>
  </div>;
}
