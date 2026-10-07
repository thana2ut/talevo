"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ArrowUpRight, BookOpen, CircleCheck, ClipboardCheck, Clock3, GraduationCap, Sparkles } from "lucide-react";
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
import { formatNotificationTime, getUnreadNotificationCount } from "@/lib/alerts/notification-utils";
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

function NextClassCard({ classes, nowMinutes }: { classes: ClassSchedule[]; nowMinutes: number }) {
  const { t } = useLanguage();
  const current = classes.find((item) => timeToMinutes(item.startTime) <= nowMinutes && timeToMinutes(item.endTime) > nowMinutes);
  const upcoming = classes.find((item) => timeToMinutes(item.startTime) > nowMinutes);
  const item = current ?? upcoming;
  const state = current ? "กำลังเรียนอยู่" : upcoming ? `อีก ${formatDuration(timeToMinutes(upcoming.startTime) - nowMinutes)}` : classes.length ? "วันนี้ไม่มีคาบเรียนต่อแล้ว" : "วันนี้ไม่มีคาบเรียน";
  return <Link href="/schedule" className={`smart-next-class${current ? " is-current" : ""}`}><IconTile tone="purple"><GraduationCap /></IconTile><div className="smart-next-copy"><span>{t("today.nextClass")}</span>{item ? <><strong>{getScheduleDisplayName(item)}</strong><small>{current ? "กำลังเรียนอยู่" : `${item.startTime} · ${state}`}</small><small>{item.room}{item.teacher ? ` · ${item.teacher}` : ""}</small></> : <><strong>{state}</strong><small>ดูตารางเรียนหรือเพิ่มคาบเรียนได้จากหน้านี้</small></>}</div><ArrowUpRight aria-hidden="true" /></Link>;
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
  const { profile, isAuthLoading, isHydrated, tasks, schedules, notifications, markNotificationRead, now: appNow } = useAppState();
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
  const unread = getUnreadNotificationCount(notifications);
  const isLoadingProfile = isAuthLoading || !isHydrated || !clientReady;
  const greeting = formatHomeGreeting(profile.displayName, isLoadingProfile);

  return <div className="page today-page smart-today-page">
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} <span aria-hidden="true">👋</span></h1><OverviewSentence classes={view.classes.length} pendingCount={view.pendingTasks.length} dueTodayCount={view.dueTodayTasks.length} /></div><NotificationBell /></header>
    <section className="smart-today-hero"><RecommendationCard task={view.atRisk?.task ?? view.pendingTasks[0]} risk={view.atRisk?.assessment ?? undefined} gap={view.usefulGap} nextClass={view.nextClass} classCount={view.classes.length} now={referenceDate} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? "วันนี้ของคุณ" : "Today at a Glance"} />
    <div className="smart-today-primary-grid">
      <NextClassCard classes={view.classes} nowMinutes={view.nowMinutes} />
      <TodayTaskCard task={view.pendingTasks[0]} now={referenceDate} schedules={schedules} />
      <Card className="smart-free-time"><header><span><Clock3 /></span><strong>{t("today.freeTime")}</strong>{view.gaps.length > 1 && <Link href="/schedule">ดูทั้งหมด</Link>}</header>{view.usefulGap ? <div className="smart-free-detail"><span>{view.nowMinutes >= view.usefulGap.start ? "ตอนนี้คุณว่างถึง" : "ช่วงว่างถัดไป"}</span><strong>{view.nowMinutes >= view.usefulGap.start ? formatMinutes(view.usefulGap.end) : `${formatMinutes(view.usefulGap.start)}–${formatMinutes(view.usefulGap.end)}`}</strong><small>เหลือ {formatDuration(view.usefulGap.end - Math.max(view.nowMinutes, view.usefulGap.start))}</small></div> : <div className="smart-free-detail"><strong>ไม่มีช่วงว่างอย่างน้อย 30 นาที</strong><small>หลังคาบสุดท้าย ลองจัดเวลาพักและทบทวนบทเรียน</small></div>}</Card>
    </div>
    </section>
    <div className="smart-today-bottom-grid"><section className="smart-later-section"><SectionHeader title="ภายหลังวันนี้" /><Card className="smart-later-card"><BookOpen /><div><strong>{view.nextClass ? `${view.nextClass.startTime} · ${getScheduleDisplayName(view.nextClass)}` : view.classes.length ? "วันนี้ไม่มีคาบเรียนต่อแล้ว" : "วันนี้ไม่มีคาบเรียน"}</strong><small>{view.nextClass ? `${view.nextClass.room}${view.nextClass.teacher ? ` · ${view.nextClass.teacher}` : ""}` : unread ? `มีการแจ้งเตือนใหม่ ${unread} รายการ` : "ไม่มีการแจ้งเตือนใหม่"}</small></div></Card></section><section className="smart-notification-section"><SectionHeader title="แจ้งเตือนล่าสุด" action="ดูทั้งหมด" href="/notifications" /><Card className="mini-notifications">{notifications.length ? notifications.slice(0, 3).map((item) => <Link href={item.href ?? "/notifications"} key={item.id} className={item.readAt ? "is-read" : ""} onClick={() => markNotificationRead(item.id)}><span className={`mini-tone tone-${item.priority === "high" ? "red" : item.priority === "medium" ? "orange" : "purple"}`} /><div><strong>{item.title}</strong><small>{formatNotificationTime(item.createdAt, language, referenceDate)}</small></div>{!item.readAt && <i aria-label="ยังไม่อ่าน" />}</Link>) : <div className="mini-notification-empty"><strong>ยังไม่มีการแจ้งเตือน</strong><small>TALEVO จะแจ้งจากงานและตารางเรียนที่คุณบันทึกไว้</small></div>}</Card></section></div>
  </div>;
}
