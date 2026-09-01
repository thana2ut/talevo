"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Clock3, GraduationCap, ListTodo } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { calculateGradePlan, formatExamDate, formatExamTimeRange, getExamCountdown, hasEarnedScore } from "@/lib/academic-utils";
import { getCourseById, getCurrentTermCourses } from "@/lib/course-utils";
import { hexToRgba, normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { formatScheduleDuration } from "@/lib/schedule-utils";
import { formatThaiMonth, formatThaiShortDate, formatThaiWeekRange } from "@/lib/schedule-date";
import { getNextUpcomingExam, getPeriodDates, getPreviousPeriodDates, getPriorityTaskSummary, getScheduleDurationForRange, getStudyTrend, getSubjectDurationBreakdown, getTaskPeriodSummary, getUpcomingExams, type StatisticsPeriod } from "@/lib/statistics-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";

const periods: StatisticsPeriod[] = ["day", "week", "month"];
const percentOf = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;

function formatRange(period: StatisticsPeriod, anchor: Date, language: "th" | "en") {
  if (language === "th") return period === "day" ? formatThaiShortDate(anchor) : period === "week" ? formatThaiWeekRange(anchor) : formatThaiMonth(anchor);
  if (period === "day") return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(anchor);
  if (period === "month") return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(anchor);
  const { start, end } = getPeriodDates("week", anchor);
  return `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(start)}–${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(end)}`;
}

function comparisonCopy(current: number, previous: number, t: (key: string) => string) {
  if (!previous) return { label: t("statistics.noPreviousData"), tone: "neutral" };
  const difference = Math.round(((current - previous) / previous) * 100);
  if (!difference) return { label: t("statistics.sameAsPrevious"), tone: "neutral" };
  return { label: `${difference > 0 ? "▲" : "▼"} ${Math.abs(difference)}% ${t("statistics.vsPrevious")}`, tone: difference > 0 ? "positive" : "negative" };
}

function formatScore(earned: number, total: number) {
  return total > 0 ? `${earned % 1 ? earned.toFixed(1) : earned} / ${total % 1 ? total.toFixed(1) : total}` : "—";
}

export function StatisticsPage() {
  const { academicTerm, exams, gradePlans, isHydrated, now, schedules, tasks } = useAppState();
  const { language, t } = useLanguage();
  const [period, setPeriod] = useState<StatisticsPeriod>("week");
  const { start, end } = getPeriodDates(period, now);
  const previous = getPreviousPeriodDates(period, now);
  const studyMinutes = getScheduleDurationForRange(schedules, start, end);
  const previousMinutes = getScheduleDurationForRange(schedules, previous.start, previous.end);
  const subjectStudy = getSubjectDurationBreakdown(schedules, start, end);
  const trend = getStudyTrend(schedules, period, now);
  const taskSummary = getTaskPeriodSummary(tasks, schedules, start, end, now);
  const priorityTaskSummary = getPriorityTaskSummary(tasks, schedules, now);
  const periodExams = getUpcomingExams(exams, start, end, now);
  const nextExam = getNextUpcomingExam(exams, now);
  const nextExamCourse = nextExam ? getCourseById(schedules, nextExam.courseId) : undefined;
  const courses = getCurrentTermCourses(schedules, academicTerm);
  const courseColors = useMemo(() => new Map(courses.map((course) => [course.id, normalizeTalevoColor(course.color)])), [courses]);
  const colorForCourse = (courseId: string, fallback?: string) => courseColors.get(courseId) ?? normalizeTalevoColor(fallback);
  const averageMinutes = trend.length ? Math.round(studyMinutes / trend.length) : 0;
  const trendMaximum = Math.max(1, ...trend.map((point) => point.minutes));
  const comparison = comparisonCopy(studyMinutes, previousMinutes, t);

  const insight = (() => {
    if (priorityTaskSummary.overdueTask) return { tone: "danger", icon: AlertTriangle, title: t("statistics.insightOverdue"), message: priorityTaskSummary.overdueTask.title, detail: t("statistics.insightOverdueDetail"), href: `/tasks/${priorityTaskSummary.overdueTask.id}`, action: t("statistics.viewDetails"), courseId: priorityTaskSummary.overdueTask.courseId };
    if (priorityTaskSummary.atRiskTask) return { tone: "warning", icon: AlertTriangle, title: t("statistics.insightTaskRisk"), message: priorityTaskSummary.atRiskTask.title, detail: t("statistics.insightTaskRiskDetail"), href: `/tasks/${priorityTaskSummary.atRiskTask.id}`, action: t("statistics.viewDetails"), courseId: priorityTaskSummary.atRiskTask.courseId };
    if (nextExam) {
      const course = getCourseById(schedules, nextExam.courseId);
      return { tone: "warning", icon: CalendarDays, title: t("statistics.insightNextExam"), message: `${course?.name ?? nextExam.title} · ${getExamCountdown(nextExam, now, language)}`, detail: t("statistics.insightNextExamDetail"), href: `/exams/${nextExam.id}`, action: t("statistics.viewExam"), courseId: nextExam.courseId };
    }
    return { tone: "calm", icon: CheckCircle2, title: t("statistics.insightCalm"), message: t("statistics.insightCalmMessage"), detail: t("statistics.insightCalmDetail"), href: "/tasks", action: t("statistics.viewTasks"), courseId: undefined };
  })();

  if (!isHydrated) return <div className="page statistics-dashboard" aria-busy="true"><header className="statistics-header"><h1>{t("statistics.loadingTitle")}</h1><p>{t("statistics.loadingDescription")}</p></header><Card className="statistics-loading"><span /><span /><span /><span /></Card></div>;

  const insightColor = insight.courseId ? colorForCourse(insight.courseId) : undefined;

  return <main className="page statistics-dashboard">
    <header className="statistics-header"><div><p className="statistics-eyebrow">{academicTerm.level} · {academicTerm.term} · {academicTerm.academicYear}</p><h1>{t("statistics.title")}</h1><p>{t("statistics.subtitle")}</p></div><p className="statistics-range"><CalendarDays aria-hidden="true" />{formatRange(period, now, language)}</p></header>
    <div className="statistics-periods" role="tablist" aria-label={t("statistics.periodLabel")}>{periods.map((item) => <button key={item} id={`statistics-period-${item}`} type="button" role="tab" aria-selected={period === item} aria-controls="statistics-content" className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{t(`statistics.period.${item}`)}</button>)}</div>
    <section className="statistics-kpis" aria-label={t("statistics.kpiLabel")}>
      <Card className="statistics-kpi purple"><span><Clock3 aria-hidden="true" /></span><div><small>{t("statistics.studyTime")}</small><strong>{formatScheduleDuration(studyMinutes)}</strong><em className={comparison.tone}>{comparison.label}</em></div></Card>
      <Card className="statistics-kpi green"><span><CheckCircle2 aria-hidden="true" /></span><div><small>{t("statistics.completedTasks")}</small><strong>{taskSummary.completed} / {taskSummary.total}</strong><em>{t("statistics.completedTasksHint")}</em></div></Card>
      <Card className="statistics-kpi amber"><span><ListTodo aria-hidden="true" /></span><div><small>{t("statistics.remainingTasks")}</small><strong>{taskSummary.pending} {t("statistics.items")}</strong><em className={taskSummary.dueSoon ? "negative" : ""}>{taskSummary.dueSoon ? `${taskSummary.dueSoon} ${t("statistics.dueSoonHint")}` : t("statistics.noDueSoon")}</em></div></Card>
      <Card className="statistics-kpi coral"><span><GraduationCap aria-hidden="true" /></span><div><small>{t("statistics.upcomingExams")}</small><strong>{periodExams.length} {t("statistics.subjects")}</strong><em>{periodExams[0] ? `${t("statistics.firstExam")} ${getExamCountdown(periodExams[0], now, language)}` : t("statistics.noUpcomingExams")}</em></div></Card>
    </section>
    <section className={`statistics-insight ${insight.tone}`} style={insightColor ? { "--statistics-insight-accent": insightColor } as React.CSSProperties : undefined} aria-labelledby="statistics-insight-title"><span><insight.icon aria-hidden="true" /></span><div><h2 id="statistics-insight-title">{t("statistics.importantNow")}</h2><strong>{insight.title}: {insight.message}</strong><p>{insight.detail}</p></div><Link href={insight.href}>{insight.action}<ChevronRight aria-hidden="true" /></Link></section>
    <div id="statistics-content" role="tabpanel" aria-labelledby={`statistics-period-${period}`} className="statistics-grid">
      <section className="statistics-card statistics-subject-time" aria-labelledby="statistics-subject-time-title"><header><div><h2 id="statistics-subject-time-title">{t("statistics.subjectTime")}</h2><p>{t("statistics.subjectTimeDescription")}</p></div><strong>{formatScheduleDuration(studyMinutes)}</strong></header>{subjectStudy.length ? <div className="statistics-subject-bars" role="list">{subjectStudy.map((subject) => { const percentage = percentOf(subject.minutes, studyMinutes); const color = colorForCourse(subject.courseId, subject.color); return <article key={subject.courseId} role="listitem"><div><span style={{ backgroundColor: color }} aria-hidden="true" /><strong>{subject.subject}</strong><small>{formatScheduleDuration(subject.minutes)} · {percentage}%</small></div><div className="statistics-bar" role="progressbar" aria-label={`${subject.subject}: ${formatScheduleDuration(subject.minutes)}, ${percentage}%`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percentage}%`, backgroundColor: color }} /></div></article>; })}</div> : <EmptyState title={t("statistics.noStudyTime")} description={t("statistics.noStudyTimeDescription")} />}</section>
      <section className="statistics-card statistics-trend" aria-labelledby="statistics-trend-title"><header><div><h2 id="statistics-trend-title">{t("statistics.trend")}</h2><p>{period === "day" ? t("statistics.todayBreakdown") : t("statistics.trendDescription")}</p></div><strong>{t("statistics.dailyAverage")} {formatScheduleDuration(averageMinutes)}</strong></header>{period === "day" ? <div className="statistics-today-summary"><Clock3 aria-hidden="true" /><div><strong>{formatScheduleDuration(studyMinutes)}</strong><p>{studyMinutes ? t("statistics.todayStudySummary") : t("statistics.noStudyTime")}</p>{subjectStudy.length ? <ul>{subjectStudy.map((subject) => <li key={subject.courseId}><i style={{ backgroundColor: colorForCourse(subject.courseId, subject.color) }} aria-hidden="true" />{subject.subject} · {formatScheduleDuration(subject.minutes)}</li>)}</ul> : null}</div></div> : <div className="statistics-trend-chart" role="img" aria-label={`${t("statistics.trend")}: ${trend.map((point) => `${point.label} ${formatScheduleDuration(point.minutes)}`).join(", ")}`}>{trend.map((point) => <article key={point.label}><i style={{ height: `${Math.max(point.minutes ? 4 : 0, (point.minutes / trendMaximum) * 100)}%` }} /><strong>{point.label}</strong><small>{formatScheduleDuration(point.minutes)}</small></article>)}</div>}</section>
      <section className="statistics-card statistics-status" aria-labelledby="statistics-task-status-title"><header><div><h2 id="statistics-task-status-title">{t("statistics.tasksAndExams")}</h2><p>{t("statistics.tasksAndExamsDescription")}</p></div></header><div className="statistics-status-columns"><section className="statistics-status-tasks" aria-labelledby="statistics-tasks-title"><h3 id="statistics-tasks-title">{t("statistics.tasks")}</h3>{taskSummary.total ? <><strong className="statistics-total">{taskSummary.total} {t("statistics.items")}</strong><dl><div><dt>{t("statistics.completed")}</dt><dd>{taskSummary.completed}</dd></div><div><dt>{t("statistics.pending")}</dt><dd>{taskSummary.pending}</dd></div><div><dt>{t("statistics.dueSoon")}</dt><dd>{taskSummary.dueSoon}</dd></div></dl><Link href="/tasks">{t("statistics.viewTasks")}<ChevronRight aria-hidden="true" /></Link></> : <><p>{t("statistics.noTasks")}</p><Link href="/tasks">{t("statistics.viewTasks")}<ChevronRight aria-hidden="true" /></Link></>}</section><section className="statistics-status-exams" aria-labelledby="statistics-exams-title"><h3 id="statistics-exams-title">{t("statistics.exams")}</h3>{nextExam ? <><div className="statistics-exam-course"><i style={{ backgroundColor: colorForCourse(nextExam.courseId, nextExamCourse?.color) }} aria-hidden="true" /><strong>{nextExamCourse?.name ?? nextExam.title}</strong></div><p className="statistics-exam-countdown">{getExamCountdown(nextExam, now, language)}</p><p className="statistics-exam-meta"><span>{formatExamDate(nextExam, language)}</span><span>{[formatExamTimeRange(nextExam, language), nextExam.room?.trim() ? (language === "th" && !nextExam.room.trim().startsWith("ห้อง") ? `ห้อง ${nextExam.room.trim()}` : nextExam.room.trim()) : ""].filter(Boolean).join(" · ")}</span></p><Link href={`/exams/${nextExam.id}`}>{t("statistics.viewExam")}<ChevronRight aria-hidden="true" /></Link></> : <p>{t("statistics.noUpcomingExams")}</p>}</section></div></section>
      <section className="statistics-card statistics-overview" aria-labelledby="statistics-overview-title"><header><div><h2 id="statistics-overview-title">{t("statistics.subjectOverview")}</h2><p>{t("statistics.subjectOverviewDescription")}</p></div></header>{courses.length ? <div className="statistics-overview-list" role="list">{courses.map((course) => { const courseColor = colorForCourse(course.id, course.color); const courseTasks = tasks.filter((task) => task.courseId === course.id); const courseCompleted = courseTasks.filter((task) => task.completedAt != null).length; const coursePending = courseTasks.filter((task) => task.completedAt == null).length; const courseMinutes = subjectStudy.find((subject) => subject.courseId === course.id)?.minutes ?? 0; const courseExam = getNextUpcomingExam(exams.filter((exam) => exam.courseId === course.id), now); const gradePlan = gradePlans.find((plan) => plan.courseId === course.id); const grade = gradePlan && gradePlan.components.some(hasEarnedScore) ? calculateGradePlan(gradePlan) : null; return <article role="listitem" key={course.id} style={{ "--course-color": courseColor, "--course-tint": hexToRgba(courseColor, 0.07) } as React.CSSProperties}><header><span style={{ backgroundColor: courseColor }} aria-hidden="true" /><strong>{course.name}</strong></header><dl><div><dt>{t("statistics.studyTime")}</dt><dd>{courseMinutes ? formatScheduleDuration(courseMinutes) : "—"}</dd></div><div><dt>{t("statistics.completed")}</dt><dd>{courseCompleted} / {courseTasks.length}</dd></div><div><dt>{t("statistics.pending")}</dt><dd>{coursePending}</dd></div><div><dt>{t("statistics.nextExam")}</dt><dd>{courseExam ? getExamCountdown(courseExam, now, language) : "—"}</dd></div><div><dt>{t("statistics.currentScore")}</dt><dd>{grade ? formatScore(grade.earnedPoints, grade.totalMax) : t("statistics.noScore")}</dd></div></dl></article>; })}</div> : <EmptyState title={t("statistics.noCourses")} description={t("statistics.noCoursesDescription")} />}</section>
    </div>
  </main>;
}
