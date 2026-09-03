"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, BookOpen, CircleCheck, ClipboardCheck, Clock3, GraduationCap, Sparkles, WalletCards } from "lucide-react";
import { BottomSheet, Card, EmptyState, Field, IconTile, Input, TalevoMascot, NotificationBell, ProgressBar, SectionHeader } from "@/components/ui";
import { getDailyBudgetStatus } from "@/lib/finance-utils";
import { getTaskCourseLabel } from "@/lib/course-utils";
import { getExamCountdown, getExamDate, getExamReadiness } from "@/lib/academic-utils";
import { formatHomeGreeting } from "@/lib/greeting";
import { mondayIndex } from "@/lib/schedule-date";
import { getScheduleDisplayName, timeToMinutes } from "@/lib/schedule-utils";
import { calculateTaskProgress, getCompletedSubtaskCount, hasTaskProgress } from "@/lib/task-progress";
import { formatTodayTaskDeadline, getPendingTasksForToday, getTaskDueState, getTasksDueToday, parseLocalTaskDate } from "@/lib/task-utils";
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

function DailyBudgetCard({
  dailyBudget,
  onOpenBudgetDialog,
  onUpdateTodaySpent,
}: {
  dailyBudget: {
    budget: number;
    spent: number;
    remaining: number;
    isOverBudget: boolean;
  };
  onOpenBudgetDialog: () => void;
  onUpdateTodaySpent: (amount: number) => void;
}) {
  const { t } = useLanguage();
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const displayValue = editingValue !== null
    ? editingValue
    : dailyBudget.spent > 0
    ? String(dailyBudget.spent)
    : "";

  const handleSpendChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.replace(/[^\d]/g, "");
    if (raw.length > 7) return;
    setEditingValue(raw);
    const num = raw === "" ? 0 : Number(raw);
    if (!Number.isNaN(num) && num >= 0) {
      onUpdateTodaySpent(num);
    }
  };

  const handleBlur = () => {
    if (editingValue !== null) {
      const num = editingValue === "" ? 0 : Number(editingValue);
      onUpdateTodaySpent(Number.isFinite(num) && num >= 0 ? Math.round(num) : 0);
      setEditingValue(null);
    }
  };

  const hasBudget = dailyBudget.budget > 0;
  const isOver = dailyBudget.isOverBudget;
  const overAmount = Math.max(0, dailyBudget.spent - dailyBudget.budget);
  const remainingAmount = Math.max(0, dailyBudget.budget - dailyBudget.spent);

  return (
    <Card className={`smart-finance ${isOver ? "is-over" : ""}`} id="today-finance">
      <header>
        <span><WalletCards /></span>
        <strong>{t("today.finance")}</strong>
        <button type="button" className="smart-finance-action text-button" onClick={onOpenBudgetDialog}>
          {!hasBudget ? "ตั้งงบ" : "แก้ไขงบ"}
        </button>
      </header>
      <div className="smart-finance-columns">
        <div className="smart-finance-col col-spend">
          <label htmlFor="today-spend-input">วันนี้ใช้ไป</label>
          <div className="smart-finance-input-wrap">
            <span className="currency-symbol">฿</span>
            <input
              id="today-spend-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="smart-finance-spend-input"
              placeholder="0"
              value={displayValue}
              onChange={handleSpendChange}
              onBlur={handleBlur}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="smart-finance-col col-budget">
          <span>งบรายวัน</span>
          <strong>{hasBudget ? formatMoney(dailyBudget.budget) : "ยังไม่ได้ตั้งงบ"}</strong>
        </div>
        <div className={`smart-finance-col col-status ${isOver ? "status-over" : hasBudget ? "status-ok" : "status-none"}`}>
          <span>{hasBudget ? (isOver ? "เกินงบ" : "เหลือวันนี้") : "สถานะ"}</span>
          <strong>
            {hasBudget ? (
              isOver ? (
                `฿${overAmount.toLocaleString("th-TH")}`
              ) : (
                `฿${remainingAmount.toLocaleString("th-TH")}`
              )
            ) : (
              <button type="button" onClick={onOpenBudgetDialog} className="smart-set-budget-link">
                ตั้งงบ
              </button>
            )}
          </strong>
        </div>
      </div>
      <div className="smart-finance-footer">
        <small>
          {!hasBudget
            ? "ตั้งงบรายวันเพื่อคำนวณยอดเงินที่เหลือใช้ได้วันนี้"
            : isOver
            ? `วันนี้ใช้เกินงบรายวันไปแล้ว ฿${overAmount.toLocaleString("th-TH")}`
            : `ยังใช้ได้อีก ฿${remainingAmount.toLocaleString("th-TH")} จากงบ ${formatMoney(dailyBudget.budget)}`}
        </small>
      </div>
    </Card>
  );
}

function RecommendationCard({ task, risk, gap, nextClass, now }: { task?: Task; risk?: DeadlineRiskAssessment; gap?: FreeGap; nextClass?: ClassSchedule; now: Date }) {
  const { t } = useLanguage();
  let eyebrow = "เริ่มต้นพื้นที่เรียนของคุณ";
  let title = "เพิ่มตารางเรียนแรกเพื่อให้ TALEVO ช่วยวางแผน";
  let metadata = "ยังไม่มีตารางเรียน งาน หรือการสอบ";
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
  }

  return <section className="smart-recommendation"><div className="smart-recommendation-copy"><span className="smart-recommendation-label"><Sparkles /> {t("today.suggests")}</span><small>{eyebrow}</small><h2>{title}</h2><strong>{metadata}</strong><p>{detail}</p><Link href={href} className="smart-recommendation-action">{action} <ArrowUpRight /></Link></div><div className="smart-mascot-stage" aria-hidden="true"><span className="smart-mascot-aura" /><span className="smart-mascot-orbit" /><span className="smart-mascot-spark smart-mascot-spark-one" /><span className="smart-mascot-spark smart-mascot-spark-two" /><span className="smart-mascot-spark smart-mascot-spark-three" /><TalevoMascot variant={mascotVariant} crop="full" size="sm" sizes="(max-width: 390px) 112px, (max-width: 699px) 128px, 214px" decorative priority /><span className="smart-mascot-pedestal" /></div></section>;
}

export function WeeklyRadarSection({ now, schedules, tasks, exams }: { now: Date; schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[] }) {
  const { language } = useLanguage();
  const radar = useMemo(() => buildWeeklyRadar({ now, schedules, tasks, exams, language }), [exams, language, now, schedules, tasks]);
  if (schedules.length === 0 && tasks.length === 0 && exams.length === 0) {
    return <section className="weekly-radar-section" id="weekly-radar"><header><div><span><Sparkles aria-hidden="true" /></span><div><h2>{language === "th" ? "7 วันข้างหน้า" : "Next 7 Days"}</h2><p>{language === "th" ? "ยังไม่มีข้อมูลสำหรับสรุปสัปดาห์" : "No data to summarize yet"}</p></div></div></header><EmptyState title={language === "th" ? "สัปดาห์ของคุณยังว่าง" : "Your week is empty"} description={language === "th" ? "เพิ่มตารางเรียน งาน หรือการสอบ แล้ว TALEVO จะสรุปภาระใน 7 วันให้ที่นี่" : "Add a class, task, or exam to see your seven-day overview."} /><Link className="primary-button" href="/schedule/new">{language === "th" ? "เพิ่มตารางเรียน" : "Add a class"}</Link></section>;
  }
  const dayFormatter = new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { weekday: "short" });
  return <section className="weekly-radar-section" id="weekly-radar"><header><div><span><Sparkles aria-hidden="true" /></span><div><h2>{language === "th" ? "7 วันข้างหน้า" : "Next 7 Days"}</h2><p>{language === "th" ? `เรียน ${radar.classCount} คาบ · งาน ${radar.taskCount} · สอบ ${radar.examCount}` : `${radar.classCount} classes · ${radar.taskCount} tasks · ${radar.examCount} exams`}</p></div></div><Link href="/schedule">{language === "th" ? "ดูตาราง" : "Schedule"}</Link></header><div className="weekly-radar-scroll"><div className="weekly-radar-days">{radar.days.map((day) => <Link href={`/schedule?date=${day.dateKey}`} className={`radar-day radar-${day.status}`} key={day.dateKey} aria-label={`${dayFormatter.format(day.date)} ${day.date.getDate()} · ${day.classCount} classes · ${day.taskCount} tasks · ${day.examCount} exams`}><span>{dayFormatter.format(day.date)}</span><strong>{day.date.getDate()}</strong><div>{day.examCount > 0 ? <em>{language === "th" ? "สอบ" : "Exam"}</em> : day.riskCount > 0 ? <em>{language === "th" ? "เสี่ยง" : "Risk"}</em> : day.taskCount > 0 ? <em>{language === "th" ? `งาน ${day.taskCount}` : `${day.taskCount} task`}</em> : day.classCount > 0 ? <em>{language === "th" ? `เรียน ${day.classCount}` : `${day.classCount} class`}</em> : <em>{language === "th" ? "ว่าง" : "Light"}</em>}</div></Link>)}</div></div><div className="weekly-radar-insight"><AlertTriangle aria-hidden="true" /><div><strong>{language === "th" ? `วันที่ภาระมาก: ${dayFormatter.format(radar.busiestDay.date)}` : `Busiest: ${dayFormatter.format(radar.busiestDay.date)}`}</strong><span>{radar.recommendation ?? (language === "th" ? `วันที่เบากว่า: ${dayFormatter.format(radar.lightestDay.date)}` : `Lighter day: ${dayFormatter.format(radar.lightestDay.date)}`)}</span></div></div></section>;
}

export function TodayPage() {
  const { profile, isAuthLoading, isHydrated, tasks, schedules, notifications, markNotificationRead, financeTransactions, financeSettings, updateFinanceSettings, setTodaySpent, exams, now: appNow } = useAppState();
  const { t, language } = useLanguage();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [draftBudget, setDraftBudget] = useState("");
  const [budgetError, setBudgetError] = useState("");
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
  const dailyBudget = getDailyBudgetStatus(financeSettings, financeTransactions, referenceDate);
  const unread = getUnreadNotificationCount(notifications);
  const upcomingExam = [...exams].filter((exam) => { const examDate = getExamDate(exam); return examDate !== null && examDate >= referenceDate; }).sort((first, second) => getExamDate(first)!.getTime() - getExamDate(second)!.getTime())[0];
  const isLoadingProfile = isAuthLoading || !isHydrated || !clientReady;
  const greeting = formatHomeGreeting(profile.displayName, isLoadingProfile);

  const openBudgetDialog = () => {
    setDraftBudget(dailyBudget.budget > 0 ? String(dailyBudget.budget) : "");
    setBudgetError("");
    setBudgetOpen(true);
  };

  const handleSaveBudget = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftBudget.trim();
    if (!trimmed) {
      setBudgetError("กรุณาระบุงบรายวัน");
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || Number.isNaN(num) || num < 0 || num > 1_000_000) {
      setBudgetError("กรุณาระบุจำนวนเงินที่ถูกต้อง (0–1,000,000 บาท)");
      return;
    }
    try {
      updateFinanceSettings({ dailyBudget: Math.round(num) });
      setBudgetOpen(false);
      setBudgetError("");
    } catch {
      setBudgetError("บันทึกงบรายวันไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  return <div className="page today-page smart-today-page">
    <header className="today-header smart-today-header"><div><span>{t("today.title")}</span><h1>{greeting} <span aria-hidden="true">👋</span></h1><OverviewSentence classes={view.classes.length} pendingCount={view.pendingTasks.length} dueTodayCount={view.dueTodayTasks.length} /></div><NotificationBell /></header>
    <section className="smart-today-hero"><RecommendationCard task={view.atRisk?.task ?? view.pendingTasks[0]} risk={view.atRisk?.assessment ?? undefined} gap={view.usefulGap} nextClass={view.nextClass} now={referenceDate} /></section>
    <section className="smart-today-glance"><SectionHeader title={language === "th" ? "วันนี้ของคุณ" : "Today at a Glance"} />
    {upcomingExam && <Link className="smart-next-class smart-exam-context" href={`/exams/${upcomingExam.id}`}><IconTile tone="orange"><GraduationCap /></IconTile><div className="smart-next-copy"><span>{t("nav.exams")}</span><strong>{getTaskCourseLabel({ courseId: upcomingExam.courseId }, schedules)}</strong><small>{getExamCountdown(upcomingExam, referenceDate, language)}{getExamReadiness(upcomingExam) ? ` · พร้อม ${getExamReadiness(upcomingExam)?.completed}/${getExamReadiness(upcomingExam)?.total}` : ""}</small></div><ArrowUpRight aria-hidden="true" /></Link>}
    <div className="smart-today-primary-grid">
      <NextClassCard classes={view.classes} nowMinutes={view.nowMinutes} />
      <TodayTaskCard task={view.pendingTasks[0]} now={referenceDate} schedules={schedules} />
      <Card className="smart-free-time"><header><span><Clock3 /></span><strong>{t("today.freeTime")}</strong>{view.gaps.length > 1 && <Link href="/schedule">ดูทั้งหมด</Link>}</header>{view.usefulGap ? <div className="smart-free-detail"><span>{view.nowMinutes >= view.usefulGap.start ? "ตอนนี้คุณว่างถึง" : "ช่วงว่างถัดไป"}</span><strong>{view.nowMinutes >= view.usefulGap.start ? formatMinutes(view.usefulGap.end) : `${formatMinutes(view.usefulGap.start)}–${formatMinutes(view.usefulGap.end)}`}</strong><small>เหลือ {formatDuration(view.usefulGap.end - Math.max(view.nowMinutes, view.usefulGap.start))}</small></div> : <div className="smart-free-detail"><strong>ไม่มีช่วงว่างอย่างน้อย 30 นาที</strong><small>หลังคาบสุดท้าย ลองจัดเวลาพักและทบทวนบทเรียน</small></div>}</Card>
      <DailyBudgetCard
        dailyBudget={dailyBudget}
        onOpenBudgetDialog={openBudgetDialog}
        onUpdateTodaySpent={(amount) => setTodaySpent(amount, referenceDate)}
      />
    </div>
    </section>
    <SemesterWeather />
    <div className="smart-today-bottom-grid"><section className="smart-later-section"><SectionHeader title="ภายหลังวันนี้" /><Card className="smart-later-card"><BookOpen /><div><strong>{view.nextClass ? `${view.nextClass.startTime} · ${getScheduleDisplayName(view.nextClass)}` : view.classes.length ? "วันนี้ไม่มีคาบเรียนต่อแล้ว" : "วันนี้ไม่มีคาบเรียน"}</strong><small>{view.nextClass ? `${view.nextClass.room}${view.nextClass.teacher ? ` · ${view.nextClass.teacher}` : ""}` : unread ? `มีการแจ้งเตือนใหม่ ${unread} รายการ` : "ไม่มีการแจ้งเตือนใหม่"}</small></div></Card></section><section className="smart-notification-section"><SectionHeader title="แจ้งเตือนล่าสุด" action="ดูทั้งหมด" href="/notifications" /><Card className="mini-notifications">{notifications.length ? notifications.slice(0, 3).map((item) => <Link href={item.href ?? "/notifications"} key={item.id} className={item.readAt ? "is-read" : ""} onClick={() => markNotificationRead(item.id)}><span className={`mini-tone tone-${item.priority === "high" ? "red" : item.priority === "medium" ? "orange" : "purple"}`} /><div><strong>{item.title}</strong><small>{formatNotificationTime(item.createdAt, language, referenceDate)}</small></div>{!item.readAt && <i aria-label="ยังไม่อ่าน" />}</Link>) : <div className="mini-notification-empty"><strong>ยังไม่มีการแจ้งเตือน</strong><small>TALEVO จะแจ้งจากงาน ตารางเรียน และการสอบที่คุณบันทึกไว้</small></div>}</Card></section></div>
    <BottomSheet open={budgetOpen} title={dailyBudget.budget === 0 ? "ตั้งงบรายวัน" : "แก้ไขงบรายวัน"} onClose={() => { setBudgetOpen(false); setBudgetError(""); }} closeLabel="ปิด"><form onSubmit={handleSaveBudget} className="form-grid"><Field label="งบที่ต้องการใช้ต่อวัน" error={budgetError}><Input type="number" min="0" max="1000000" step="1" autoFocus placeholder="เช่น 200" value={draftBudget} onChange={(e) => { setDraftBudget(e.target.value); if (budgetError) setBudgetError(""); }} /></Field><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => { setBudgetOpen(false); setBudgetError(""); }}>ยกเลิก</button><button type="submit" className="primary-button">บันทึก</button></div></form></BottomSheet>
  </div>;
}
