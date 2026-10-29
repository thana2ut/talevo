"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, CircleCheck, ClipboardCheck, Clock3, MapPin, Sparkles } from "lucide-react";
import { Card, IconTile, TalevoMascot, NotificationBell, ProgressBar, SectionHeader } from "@/components/ui";
import { getTaskCourseLabel } from "@/lib/course-utils";
import { formatHomeGreeting } from "@/lib/greeting";
import { mondayIndex } from "@/lib/schedule-date";
import { getScheduleDisplayName, timeToMinutes } from "@/lib/schedule-utils";
import { calculateTaskProgress, getCompletedSubtaskCount, hasTaskProgress } from "@/lib/task-progress";
import { formatTodayTaskDeadline, getPendingTasksForToday, getTaskDueState, getTasksDueToday, parseLocalTaskDate } from "@/lib/task-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { ClassSchedule, Task } from "@/types";
import { calculateDeadlineRisk, type DeadlineRiskAssessment } from "@/lib/alerts/deadline-risk";
import type { MascotVariant } from "@/lib/mascot";

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
      const status = language === "th"
        ? isCurrent ? "กำลังเรียน" : isNext ? "คาบถัดไป" : ended ? "เรียนแล้ว" : "ยังไม่เริ่ม"
        : isCurrent ? "In progress" : isNext ? "Next class" : ended ? "Completed" : "Not started";
      return <article className={`smart-today-schedule-item${isCurrent || isNext ? " is-active" : ""}`} key={item.id}>
        <div className="smart-today-schedule-meta"><span className={`smart-today-schedule-time${isCurrent || isNext ? " is-active" : ""}`}>{item.startTime}–{item.endTime}</span><span className={`smart-today-schedule-status${isCurrent || isNext ? " is-active" : ""}`}><i aria-hidden="true" />{status}</span></div>
        <strong className="smart-today-schedule-name">{getScheduleDisplayName(item)}</strong>
        <span className="smart-today-schedule-room"><MapPin aria-hidden="true" />{item.room || (language === "th" ? "ยังไม่ระบุห้อง" : "Room not set")}</span>
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

function RecommendationCard({ task, risk, gap, nextClass, classCount, now }: { task?: Task; risk?: DeadlineRiskAssessment; gap?: FreeGap; nextClass?: ClassSchedule; classCount: number; now: Date }) {
  const { t } = useLanguage();
  let eyebrow = "เริ่มต้นพื้นที่เรียนของคุณ";
  let title = "เพิ่มตารางเรียนแรกเพื่อให้ TALEVO ช่วยวางแผน";
  let metadata = "ยังไม่มีตารางเรียนหรืองาน";
  let detail = "เมื่อเริ่มบันทึกข้อมูล ภาพรวมวันนี้และคำแนะนำจะปรากฏตรงนี้";
  let href = "/schedule/new";
  let action = "เพิ่มตารางเรียน";
  let mascotVariant: MascotVariant = "neutral";

  if (task && risk?.level === "at_risk") {
    eyebrow = "เสี่ยงส่งไม่ทัน";
    title = task.title;
    metadata = `เหลืองานประมาณ ${formatDuration(risk.remainingEstimatedMinutes)}`;
    detail = `ก่อนกำหนดส่งมีเวลาว่างประมาณ ${formatDuration(risk.availableFreeMinutes)} ควรเริ่มในช่วงว่างถัดไป`;
    href = `/tasks/${task.id}`;
    action = "จัดการงานนี้";
    mascotVariant = "focused";
  } else if (task) {
    const due = parseLocalTaskDate(task.dueDate);
    const dueState = getTaskDueState(task, now);
    const total = task.subtasks?.length ?? 0;
    const remaining = total - getCompletedSubtaskCount(task);
    eyebrow = dueState === "overdue" ? "งานที่ควรจัดการก่อน" : gap ? "ช่วงนี้เหมาะกับการทำงาน" : "งานที่ควรทำก่อน";
    title = task.title;
    metadata = dueState === "overdue" ? "เลยกำหนดแล้ว" : due ? `ส่งวันนี้ ${formatMinutes(due.getHours() * 60 + due.getMinutes())}` : task.dueLabel;
    detail = gap ? `ลองใช้ช่วง ${formatMinutes(gap.start)}–${formatMinutes(gap.end)}${remaining > 0 ? ` เพื่อทำอีก ${remaining} ขั้นตอน` : " เพื่อเริ่มทำก่อนพัก"}` : remaining > 0 ? `เหลือ ${remaining} จาก ${total} ขั้นตอน` : "เริ่มทำก่อนจบวันเพื่อให้ตามแผนได้ทัน";
    href = `/tasks/${task.id}`;
    action = "ทำงานต่อ";
    mascotVariant = "focused";
  } else if (nextClass) {
    eyebrow = "เตรียมตัวสำหรับคาบถัดไป";
    title = getScheduleDisplayName(nextClass);
    metadata = `${nextClass.startTime} · ${nextClass.room}`;
    detail = "ดูรายละเอียดคาบเรียนและเตรียมสิ่งที่ต้องใช้ล่วงหน้า";
    href = "/schedule";
    action = "ดูคาบเรียน";
    mascotVariant = "happy";
  } else if (classCount > 0) {
    eyebrow = "ตารางเรียนวันนี้ครบแล้ว";
    title = "วันนี้ไม่มีคาบเรียนถัดไป";
    metadata = `${classCount} คาบเรียนวันนี้`;
    detail = "ตรวจดูตารางวันถัดไปหรือใช้ช่วงเวลาที่เหลือพักและทบทวนบทเรียน";
    href = "/schedule";
    action = "ดูตารางเรียน";
    mascotVariant = "happy";
  }

  return <section className="smart-recommendation"><div className="smart-recommendation-copy"><span className="smart-recommendation-label"><Sparkles /> {t("today.suggests")}</span><small>{eyebrow}</small><h2>{title}</h2><strong>{metadata}</strong><p>{detail}</p><Link href={href} className="smart-recommendation-action">{action} <ArrowUpRight /></Link></div><div className="smart-mascot-stage" aria-hidden="true"><span className="smart-mascot-aura" /><span className="smart-mascot-orbit" /><span className="smart-mascot-spark smart-mascot-spark-one" /><span className="smart-mascot-spark smart-mascot-spark-two" /><span className="smart-mascot-spark smart-mascot-spark-three" /><TalevoMascot variant={mascotVariant} crop="full" size="sm" sizes="(max-width: 390px) 112px, (max-width: 699px) 128px, 214px" decorative priority /><span className="smart-mascot-pedestal" /></div></section>;
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
    const nextClass = classes.find((item) => timeToMinutes(item.startTime) > nowMinutes);
    const risks = tasks.map((task) => ({ task, assessment: calculateDeadlineRisk(task, schedules, referenceDate) })).filter((item) => item.assessment?.level === "at_risk");
    return { classes, pendingTasks, dueTodayTasks, nowMinutes, gaps, usefulGap, nextClass, atRisk: risks[0] };
  }, [referenceDate, schedules, tasks]);
  const isLoadingProfile = isAuthLoading || !isHydrated || !clientReady;
  const greeting = formatHomeGreeting(profile.displayName, isLoadingProfile);

  return <div className="page today-page smart-today-page">
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} <span aria-hidden="true">👋</span></h1><OverviewSentence classes={view.classes.length} pendingCount={view.pendingTasks.length} dueTodayCount={view.dueTodayTasks.length} /></div><NotificationBell /></header>
    <section className="smart-today-hero"><RecommendationCard task={view.atRisk?.task ?? view.pendingTasks[0]} risk={view.atRisk?.assessment ?? undefined} gap={view.usefulGap} nextClass={view.nextClass} classCount={view.classes.length} now={referenceDate} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? "วันนี้ของคุณ" : "Today at a Glance"} />
    <div className="smart-today-primary-grid">
      <TodayScheduleCard classes={view.classes} nowMinutes={view.nowMinutes} />
      <TodayTaskCard task={view.pendingTasks[0]} now={referenceDate} schedules={schedules} />
      <Card className="smart-free-time"><header><span><Clock3 /></span><strong>{t("today.freeTime")}</strong>{view.gaps.length > 1 && <span className="smart-free-time-more">ดูทั้งหมด</span>}</header>{view.usefulGap ? <div className="smart-free-detail"><span>{view.nowMinutes >= view.usefulGap.start ? "ตอนนี้คุณว่างถึง" : "ช่วงว่างถัดไป"}</span><strong>{view.nowMinutes >= view.usefulGap.start ? formatMinutes(view.usefulGap.end) : `${formatMinutes(view.usefulGap.start)}–${formatMinutes(view.usefulGap.end)}`}</strong><small>เหลือ {formatDuration(view.usefulGap.end - Math.max(view.nowMinutes, view.usefulGap.start))}</small></div> : <div className="smart-free-detail"><strong>ไม่มีช่วงว่างอย่างน้อย 30 นาที</strong><small>หลังคาบสุดท้าย ลองจัดเวลาพักและทบทวนบทเรียน</small></div>}</Card>
    </div>
    </section>
  </div>;
}
