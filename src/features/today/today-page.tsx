"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { AlertTriangle, ArrowUpRight, BookOpen, CircleCheck, ClipboardCheck, Clock3, GraduationCap, Sparkles, WalletCards } from "lucide-react";
import { Card, IconTile, TalevoMascot, NotificationBell, ProgressBar, SectionHeader } from "@/components/ui";
import { getDailyBudgetStatus } from "@/lib/finance-utils";
import { getTaskCourseLabel } from "@/lib/course-utils";
import { getExamCountdown, getExamDate, getExamReadiness } from "@/lib/academic-utils";
import { getGreetingByLocalTime } from "@/lib/greeting";
import { mondayIndex } from "@/lib/schedule-date";
import { calculateTaskProgress, getCompletedSubtaskCount, hasTaskProgress } from "@/lib/task-progress";
import { getTaskDueState, getTasksDueToday, parseLocalTaskDate } from "@/lib/task-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { ClassSchedule, Exam, Task } from "@/types";
import { calculateDeadlineRisk, type DeadlineRiskAssessment } from "@/lib/alerts/deadline-risk";
import { buildWeeklyRadar } from "@/lib/alerts/weekly-radar";
import { formatNotificationTime, getUnreadNotificationCount } from "@/lib/alerts/notification-utils";
import { SemesterWeather } from "@/features/academic/semester-weather";
import type { MascotVariant } from "@/lib/mascot";

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const formatMoney = (amount: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(amount);
const timeToMinutes = (time: string) => { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; };
const formatMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const formatDuration = (minutes: number) => minutes < 60 ? `${minutes} นาที` : `${Math.floor(minutes / 60)} ชม.${minutes % 60 ? ` ${minutes % 60} นาที` : ""}`;

type FreeGap = { start: number; end: number };

function getTodayClasses(schedules: ClassSchedule[], date: Date) {
  return schedules.filter((item) => item.day === mondayIndex(date)).sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime));
}

function getFreeGaps(classes: ClassSchedule[]) {
  const gaps: FreeGap[] = [];
  let cursor = DAY_START;
  classes.forEach((item) => {
    const start = Math.max(DAY_START, timeToMinutes(item.startTime));
    const end = Math.min(DAY_END, timeToMinutes(item.endTime));
    if (start - cursor >= 30) gaps.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  });
  if (DAY_END - cursor >= 30) gaps.push({ start: cursor, end: DAY_END });
  return gaps;
}

function sortDueTasks(tasks: Task[], now: Date) {
  const rank = (task: Task) => ({ overdue: 0, urgent: 1, today: 2, future: 3, unknown: 4 })[getTaskDueState(task, now)];
  return [...tasks].sort((first, second) => {
    const rankDifference = rank(first) - rank(second);
    if (rankDifference) return rankDifference;
    return (parseLocalTaskDate(first.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (parseLocalTaskDate(second.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });
}

function OverviewSentence({ classes, dueCount }: { classes: number; dueCount: number }) {
  const classText = classes === 0 ? "วันนี้ไม่มีเรียน" : `วันนี้มีเรียน ${classes} คาบ`;
  const dueText = dueCount === 0 ? "ไม่มีงานที่ต้องส่ง" : `มีงานส่ง ${dueCount} งาน`;
  return <p className="smart-today-overview">{classText} · {dueText}</p>;
}

function NextClassCard({ classes, nowMinutes }: { classes: ClassSchedule[]; nowMinutes: number }) {
  const { t } = useLanguage();
  const current = classes.find((item) => timeToMinutes(item.startTime) <= nowMinutes && timeToMinutes(item.endTime) > nowMinutes);
  const upcoming = classes.find((item) => timeToMinutes(item.startTime) > nowMinutes);
  const item = current ?? upcoming;
  const state = current ? "กำลังเรียนอยู่" : upcoming ? `อีก ${formatDuration(timeToMinutes(upcoming.startTime) - nowMinutes)}` : classes.length ? "วันนี้ไม่มีคาบเรียนต่อแล้ว" : "วันนี้ไม่มีคาบเรียน";
  return <Link href="/schedule" className={`smart-next-class${current ? " is-current" : ""}`}><IconTile tone="purple"><GraduationCap /></IconTile><div className="smart-next-copy"><span>{t("today.nextClass")}</span>{item ? <><strong>{item.name}</strong><small>{current ? "กำลังเรียนอยู่" : `${item.startTime} · ${state}`}</small><small>{item.room}{item.teacher ? ` · ${item.teacher}` : ""}</small></> : <><strong>{state}</strong><small>ดูตารางเรียนหรือเพิ่มคาบเรียนได้จากหน้านี้</small></>}</div><ArrowUpRight aria-hidden="true" /></Link>;
}

function DueTodayCard({ task, total, now, schedules }: { task?: Task; total: number; now: Date; schedules: ClassSchedule[] }) {
  const { t } = useLanguage();
  if (!task) return <Card className="smart-due-card smart-empty-card"><CircleCheck /><div><span>{t("today.dueToday")}</span><strong>วันนี้ไม่มีงานที่ต้องส่ง</strong><small>คุณจัดการงานสำคัญเรียบร้อยแล้ว</small></div></Card>;
  const subtaskTotal = task.subtasks?.length ?? 0;
  const completed = getCompletedSubtaskCount(task);
  const due = parseLocalTaskDate(task.dueDate);
  const dueLabel = getTaskDueState(task, now) === "overdue" ? "เกินกำหนดแล้ว" : due ? `ส่งวันนี้ ${formatMinutes(due.getHours() * 60 + due.getMinutes())}` : task.dueLabel;
  return <Card className="smart-due-card"><IconTile tone={task.color === "orange" ? "orange" : "purple"}><ClipboardCheck /></IconTile><div className="smart-due-copy"><span>{t("today.dueToday")}</span><strong>{task.title}</strong><small>{getTaskCourseLabel(task, schedules)} · {dueLabel}</small>{hasTaskProgress(task) && subtaskTotal > 0 && <><ProgressBar value={calculateTaskProgress(task)} color={task.color} /><small>เหลือ {subtaskTotal - completed} จาก {subtaskTotal} ขั้นตอน</small></>}</div><div className="smart-due-actions"><Link href={`/tasks/${task.id}`}>ทำงานต่อ</Link>{total > 1 && <small>+ อีก {total - 1} งาน</small>}</div></Card>;
}

function RecommendationCard({ task, risk, gap, nextClass, dailyOverBudget, now }: { task?: Task; risk?: DeadlineRiskAssessment; gap?: FreeGap; nextClass?: ClassSchedule; dailyOverBudget: boolean; now: Date }) {
  const { t } = useLanguage();
  let eyebrow = "วันนี้ค่อนข้างเบา";
  let title = "ลองใช้เวลาว่างวางแผนงานล่วงหน้า";
  let metadata = "ยังไม่มีคาบเรียนหรืองานเร่งด่วน";
  let detail = "ทบทวนบทเรียนสั้น ๆ หรือเตรียมสิ่งสำคัญสำหรับวันถัดไป";
  let href = "/tasks";
  let action = "ดูงานทั้งหมด";
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
    title = nextClass.name;
    metadata = `${nextClass.startTime} · ${nextClass.room}`;
    detail = "ดูรายละเอียดคาบเรียนและเตรียมสิ่งที่ต้องใช้ล่วงหน้า";
    href = "/schedule";
    action = "ดูคาบเรียน";
    mascotVariant = "happy";
  } else if (dailyOverBudget) {
    eyebrow = "การเงินวันนี้";
    title = "วันนี้ใช้เกินงบแล้ว";
    metadata = "ลองตรวจรายจ่ายที่ยังไม่จำเป็น";
    detail = "จัดการงบรายวันต่อเพื่อให้แผนการเงินยังเดินหน้าได้";
    href = "/finance";
    action = "ดูการเงิน";
  }

  return <section className="smart-recommendation"><div className="smart-recommendation-copy"><span className="smart-recommendation-label"><Sparkles /> {t("today.suggests")}</span><small>{eyebrow}</small><h2>{title}</h2><strong>{metadata}</strong><p>{detail}</p><Link href={href} className="smart-recommendation-action">{action} <ArrowUpRight /></Link></div><div className="smart-mascot-stage" aria-hidden="true"><span className="smart-mascot-aura" /><span className="smart-mascot-orbit" /><span className="smart-mascot-spark smart-mascot-spark-one" /><span className="smart-mascot-spark smart-mascot-spark-two" /><span className="smart-mascot-spark smart-mascot-spark-three" /><TalevoMascot variant={mascotVariant} crop="full" size="sm" sizes="(max-width: 390px) 112px, (max-width: 699px) 128px, 214px" decorative priority /><span className="smart-mascot-pedestal" /></div></section>;
}

export function WeeklyRadarSection({ now, schedules, tasks, exams }: { now: Date; schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[] }) {
  const { language } = useLanguage();
  const radar = useMemo(() => buildWeeklyRadar({ now, schedules, tasks, exams, language }), [exams, language, now, schedules, tasks]);
  const dayFormatter = new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { weekday: "short" });
  return <section className="weekly-radar-section" id="weekly-radar"><header><div><span><Sparkles aria-hidden="true" /></span><div><h2>{language === "th" ? "7 วันข้างหน้า" : "Next 7 Days"}</h2><p>{language === "th" ? `เรียน ${radar.classCount} คาบ · งาน ${radar.taskCount} · สอบ ${radar.examCount}` : `${radar.classCount} classes · ${radar.taskCount} tasks · ${radar.examCount} exams`}</p></div></div><Link href="/schedule">{language === "th" ? "ดูตาราง" : "Schedule"}</Link></header><div className="weekly-radar-scroll"><div className="weekly-radar-days">{radar.days.map((day) => <Link href={`/schedule?date=${day.dateKey}`} className={`radar-day radar-${day.status}`} key={day.dateKey} aria-label={`${dayFormatter.format(day.date)} ${day.date.getDate()} · ${day.classCount} classes · ${day.taskCount} tasks · ${day.examCount} exams`}><span>{dayFormatter.format(day.date)}</span><strong>{day.date.getDate()}</strong><div>{day.examCount > 0 ? <em>{language === "th" ? "สอบ" : "Exam"}</em> : day.riskCount > 0 ? <em>{language === "th" ? "เสี่ยง" : "Risk"}</em> : day.taskCount > 0 ? <em>{language === "th" ? `งาน ${day.taskCount}` : `${day.taskCount} task`}</em> : day.classCount > 0 ? <em>{language === "th" ? `เรียน ${day.classCount}` : `${day.classCount} class`}</em> : <em>{language === "th" ? "ว่าง" : "Light"}</em>}</div></Link>)}</div></div><div className="weekly-radar-insight"><AlertTriangle aria-hidden="true" /><div><strong>{language === "th" ? `วันที่ภาระมาก: ${dayFormatter.format(radar.busiestDay.date)}` : `Busiest: ${dayFormatter.format(radar.busiestDay.date)}`}</strong><span>{radar.recommendation ?? (language === "th" ? `วันที่เบากว่า: ${dayFormatter.format(radar.lightestDay.date)}` : `Lighter day: ${dayFormatter.format(radar.lightestDay.date)}`)}</span></div></div></section>;
}

export function TodayPage() {
  const { profile, tasks, schedules, notifications, markNotificationRead, financeTransactions, financeSettings, exams, now: appNow } = useAppState();
  const { t, language } = useLanguage();
  const clientReady = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const referenceDate = useMemo(() => clientReady ? appNow : new Date(2000, 0, 1, 0, 0), [appNow, clientReady]);
  const view = useMemo(() => {
    const classes = getTodayClasses(schedules, referenceDate);
    const dueTasks = sortDueTasks(getTasksDueToday(tasks, referenceDate), referenceDate);
    const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    const gaps = getFreeGaps(classes);
    const usefulGap = gaps.find((gap) => gap.end > nowMinutes);
    const nextClass = classes.find((item) => timeToMinutes(item.startTime) > nowMinutes);
    const risks = tasks.map((task) => ({ task, assessment: calculateDeadlineRisk(task, schedules, referenceDate) })).filter((item) => item.assessment?.level === "at_risk");
    return { classes, dueTasks, nowMinutes, gaps, usefulGap, nextClass, atRisk: risks[0] };
  }, [referenceDate, schedules, tasks]);
  const dailyBudget = getDailyBudgetStatus(financeSettings, financeTransactions, referenceDate);
  const unread = getUnreadNotificationCount(notifications);
  const upcomingExam = [...exams].filter((exam) => { const examDate = getExamDate(exam); return examDate !== null && examDate >= referenceDate; }).sort((first, second) => getExamDate(first)!.getTime() - getExamDate(second)!.getTime())[0];
  const greeting = clientReady ? getGreetingByLocalTime(referenceDate) : "สวัสดี";

  return <div className="page today-page smart-today-page">
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} {profile.displayName} <span aria-hidden="true">👋</span></h1><OverviewSentence classes={view.classes.length} dueCount={view.dueTasks.length} /></div><NotificationBell /></header>
    <section className="smart-today-hero"><RecommendationCard task={view.atRisk?.task ?? view.dueTasks[0]} risk={view.atRisk?.assessment ?? undefined} gap={view.usefulGap} nextClass={view.nextClass} dailyOverBudget={dailyBudget.isOverBudget} now={referenceDate} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? "วันนี้ของคุณ" : "Today at a Glance"} />
    {upcomingExam && <Link className="smart-next-class smart-exam-context" href={`/exams/${upcomingExam.id}`}><IconTile tone="orange"><GraduationCap /></IconTile><div className="smart-next-copy"><span>{t("nav.exams")}</span><strong>{getTaskCourseLabel({ courseId: upcomingExam.courseId }, schedules)}</strong><small>{getExamCountdown(upcomingExam, referenceDate, language)}{getExamReadiness(upcomingExam) ? ` · พร้อม ${getExamReadiness(upcomingExam)?.completed}/${getExamReadiness(upcomingExam)?.total}` : ""}</small></div><ArrowUpRight aria-hidden="true" /></Link>}
    <div className="smart-today-primary-grid"><NextClassCard classes={view.classes} nowMinutes={view.nowMinutes} /><DueTodayCard task={view.dueTasks[0]} total={view.dueTasks.length} now={referenceDate} schedules={schedules} /><Card className="smart-free-time"><header><span><Clock3 /></span><strong>{t("today.freeTime")}</strong>{view.gaps.length > 1 && <Link href="/schedule">ดูทั้งหมด</Link>}</header>{view.usefulGap ? <div className="smart-free-detail"><span>{view.nowMinutes >= view.usefulGap.start ? "ตอนนี้คุณว่างถึง" : "ช่วงว่างถัดไป"}</span><strong>{view.nowMinutes >= view.usefulGap.start ? formatMinutes(view.usefulGap.end) : `${formatMinutes(view.usefulGap.start)}–${formatMinutes(view.usefulGap.end)}`}</strong><small>เหลือ {formatDuration(view.usefulGap.end - Math.max(view.nowMinutes, view.usefulGap.start))}</small></div> : <div className="smart-free-detail"><strong>ไม่มีช่วงว่างอย่างน้อย 30 นาที</strong><small>หลังคาบสุดท้าย ลองจัดเวลาพักและทบทวนบทเรียน</small></div>}</Card><Card className={`smart-finance ${dailyBudget.isOverBudget ? "is-over" : ""}`}><header><span><WalletCards /></span><strong>{t("today.finance")}</strong><Link href={dailyBudget.budget === 0 ? "/finance/budgets" : "/finance"}>{dailyBudget.budget === 0 ? t("finance.setBudget") : t("finance.title")}</Link></header><div className="smart-finance-values"><div><span>วันนี้ใช้ไป</span><strong>{formatMoney(dailyBudget.spent)}</strong></div><div><span>{dailyBudget.budget === 0 ? "งบรายวัน" : dailyBudget.isOverBudget ? "เกินงบวันนี้" : "วันนี้เหลือ"}</span><strong>{dailyBudget.budget === 0 ? "ยังไม่ได้ตั้งงบ" : formatMoney(Math.abs(dailyBudget.remaining))}</strong></div></div><small>{dailyBudget.budget === 0 ? "ตั้งงบรายวันเพื่อดูยอดคงเหลือ" : `งบรายวัน ${formatMoney(dailyBudget.budget)}`}</small></Card></div>
    </section>
    <SemesterWeather />
    <div className="smart-today-bottom-grid"><section className="smart-later-section"><SectionHeader title="ภายหลังวันนี้" /><Card className="smart-later-card"><BookOpen /><div><strong>{view.nextClass ? `${view.nextClass.startTime} · ${view.nextClass.name}` : view.classes.length ? "วันนี้ไม่มีคาบเรียนต่อแล้ว" : "วันนี้ไม่มีคาบเรียน"}</strong><small>{view.nextClass ? `${view.nextClass.room}${view.nextClass.teacher ? ` · ${view.nextClass.teacher}` : ""}` : unread ? `มีการแจ้งเตือนใหม่ ${unread} รายการ` : "ไม่มีการแจ้งเตือนใหม่"}</small></div></Card></section><section className="smart-notification-section"><SectionHeader title="แจ้งเตือนล่าสุด" action="ดูทั้งหมด" href="/notifications" /><Card className="mini-notifications">{notifications.length ? notifications.slice(0, 3).map((item) => <Link href={item.href ?? "/notifications"} key={item.id} className={item.readAt ? "is-read" : ""} onClick={() => markNotificationRead(item.id)}><span className={`mini-tone tone-${item.priority === "high" ? "red" : item.priority === "medium" ? "orange" : "purple"}`} /><div><strong>{item.title}</strong><small>{formatNotificationTime(item.createdAt, language, referenceDate)}</small></div>{!item.readAt && <i aria-label="ยังไม่อ่าน" />}</Link>) : <div className="mini-notification-empty"><strong>ยังไม่มีการแจ้งเตือน</strong><small>TALEVO จะแจ้งจากงาน ตารางเรียน และการสอบที่คุณบันทึกไว้</small></div>}</Card></section></div>
  </div>;
}
