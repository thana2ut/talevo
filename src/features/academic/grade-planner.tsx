"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, Plus, Save, Sparkles, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, Card, EmptyState, Field, Input, PageHeader, ProgressBar, Select, StatusPill } from "@/components/ui";
import { calculateGradePlan, hasEarnedScore, validateSimplifiedGradePlan } from "@/lib/academic-utils";
import { getCourseById } from "@/lib/course-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { CourseGradePlan, GradeComponent, GradeThreshold } from "@/types";

type GradePlanDraft = Omit<CourseGradePlan, "id" | "courseId">;

const defaultThresholds: GradeThreshold[] = [
  { label: "A", minimumPercent: 80 }, { label: "B+", minimumPercent: 75 }, { label: "B", minimumPercent: 70 },
  { label: "C+", minimumPercent: 65 }, { label: "C", minimumPercent: 60 }, { label: "D+", minimumPercent: 55 },
  { label: "D", minimumPercent: 50 }, { label: "F", minimumPercent: 0 },
];

function createBlankPlan(): GradePlanDraft {
  return { targetGrade: "A", thresholds: defaultThresholds.map((threshold) => ({ ...threshold })), components: [] };
}

function clonePlan(plan: CourseGradePlan): GradePlanDraft {
  return { targetGrade: plan.targetGrade, thresholds: plan.thresholds.map((threshold) => ({ ...threshold })), components: plan.components.map((component) => ({ ...component })) };
}

function formatScore(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatCompactScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")) : "—";
}

function emptyToNumber(value: string) {
  return value === "" ? 0 : Number(value);
}

export function GradePlannerPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { schedules, gradePlans, upsertGradePlan } = useAppState();
  const { t, language } = useLanguage();
  const course = getCourseById(schedules, courseId);
  const existing = gradePlans.find((plan) => plan.courseId === courseId);
  const [baseline, setBaseline] = useState<GradePlanDraft>(() => existing ? clonePlan(existing) : createBlankPlan());
  const [plan, setPlan] = useState<GradePlanDraft>(() => existing ? clonePlan(existing) : createBlankPlan());
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GradeComponent | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  if (!course) return <div className="page"><PageHeader title={t("grades.title")} backHref="/grades" /><EmptyState title="ไม่พบวิชา" description="วิชานี้อาจถูกนำออกจากตารางเรียนแล้ว" /></div>;

  const previewPlan: CourseGradePlan = { ...plan, id: "preview", courseId };
  const summary = calculateGradePlan(previewPlan);
  const validation = validateSimplifiedGradePlan(previewPlan);
  const isDirty = JSON.stringify(plan) !== JSON.stringify(baseline);
  const componentError = (id: string) => validation.componentErrors[id]?.map((key) => t(`grades.${key}`)).join(" ");
  const thresholdError = (index: number) => validation.thresholdErrors[index]?.map((key) => t(`grades.${key}`)).join(" ");
  const updatePlan = (next: GradePlanDraft) => { setSaved(false); setPlan(next); };
  const updateComponent = (id: string, values: Partial<GradeComponent>) => updatePlan({ ...plan, components: plan.components.map((component) => component.id === id ? { ...component, ...values } : component) });
  const addComponent = () => {
    const id = `component-${Date.now()}`;
    updatePlan({ ...plan, components: [...plan.components, { id, name: "", weight: 0, maxScore: 0 }] });
    window.requestAnimationFrame(() => document.getElementById(`grade-name-${id}`)?.focus());
  };
  const save = () => {
    setAttemptedSave(true);
    if (!validation.isValid) return;
    upsertGradePlan(courseId, plan);
    setBaseline({ ...plan, thresholds: plan.thresholds.map((threshold) => ({ ...threshold })), components: plan.components.map((component) => ({ ...component })) });
    setSaved(true);
  };
  const requestLeave = () => { if (isDirty) setLeaveOpen(true); else router.push("/grades"); };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    updatePlan({ ...plan, components: plan.components.filter((component) => component.id !== pendingDelete.id) });
    setPendingDelete(null);
  };

  const targetLabel = plan.targetGrade ?? "—";
  const totalMaxLabel = language === "th" ? "คะแนนเต็มรวม" : "Total maximum score";
  const recommendation = (() => {
    if (summary.totalMax <= 0 || summary.targetPoints === null) return t("grades.noScoresYet");
    if (summary.targetReached) return `${t("grades.targetReached")} ${targetLabel}`;
    if (!summary.canReachTarget) return `${t("grades.targetImpossible")} ${targetLabel} · ${t("grades.maximumPossible")} ${formatCompactScore(summary.maxPossiblePoints)} / ${formatCompactScore(summary.totalMax)}`;
    if (summary.pendingComponents.length === 1) {
      const component = summary.pendingComponents[0];
      const required = summary.pointsNeeded ?? 0;
      const percent = component.maxScore > 0 ? (required / component.maxScore) * 100 : 0;
      return `${component.name || t("grades.component")} ${t("grades.exactRequired")} ${formatCompactScore(required)} / ${formatCompactScore(component.maxScore)} ${t("grades.points")} (${formatCompactScore(percent)}%)`;
    }
    const percentage = summary.remainingPossible > 0 ? ((summary.pointsNeeded ?? 0) / summary.remainingPossible) * 100 : 0;
    return `${t("grades.needPoints")} ${formatCompactScore(summary.pointsNeeded)} ${t("grades.points")} · ${t("grades.remainingScore")} ${formatCompactScore(summary.remainingPossible)} ${t("grades.points")} (${formatCompactScore(percentage)}%)`;
  })();

  return <main className="page grade-simple-page">
    <header className="grade-simple-header">
      <button className="icon-button" type="button" onClick={requestLeave} aria-label={t("common.back")}><ArrowLeft /></button>
      <h1>{course.name}</h1>
      <button className="primary-button grade-simple-save" type="button" onClick={save} disabled={!isDirty}><Save />{t("common.save")}</button>
    </header>
    {saved && <p className="grade-save-toast" role="status"><CheckCircle2 />{t("grades.planSaved")}</p>}
    {attemptedSave && !validation.isValid && <p className="grade-save-error" role="alert"><CircleAlert />{t("grades.saveBlocked")}</p>}

    <Card className="grade-simple-summary">
      <div className="grade-simple-section-heading"><div><h2>{t("grades.summary")}</h2><p>{t("grades.currentScore")} {formatScore(summary.earnedPoints)} / {formatCompactScore(summary.totalMax)}</p></div></div>
      <div className="grade-simple-metrics">
        <div><span>{t("grades.currentScore")}</span><strong>{formatScore(summary.earnedPoints)}</strong><small>{t("grades.points")}</small></div>
        <div><span>{t("grades.needPoints")}</span><strong>{summary.targetReached ? "0" : formatScore(summary.pointsNeeded)}</strong><small>{summary.targetReached ? t("grades.targetReached") : `${t("grades.targetGrade")} ${targetLabel}`}</small></div>
        <div><span>{t("grades.target")}</span><strong>{targetLabel}</strong><small>{formatCompactScore(summary.targetPoints)} {t("grades.pointsOrMore")}</small></div>
      </div>
      <ProgressBar value={summary.totalMax > 0 ? Math.min(100, Math.max(0, (summary.earnedPoints / summary.totalMax) * 100)) : 0} color="purple" />
      <p className="grade-simple-progress-text">{formatCompactScore(summary.earnedPoints)} / {formatCompactScore(summary.totalMax)}</p>
    </Card>

    <section className="grade-simple-section">
      <div className="grade-simple-section-heading"><h2>{t("grades.components")}</h2><span>{totalMaxLabel} {formatCompactScore(summary.totalMax)} {t("grades.points")}</span></div>
      <Card className="grade-simple-components">
        <div className="grade-simple-component-header" aria-hidden="true"><span>{t("grades.component")}</span><span>{t("grades.maxScore")}</span><span>{t("grades.earnedScore")}</span><span>{t("grades.status")}</span><span>{t("grades.delete")}</span></div>
        {plan.components.length ? plan.components.map((component) => {
          const scored = hasEarnedScore(component);
          const error = componentError(component.id);
          return <article className="grade-simple-component" key={component.id}>
            <label><span>{t("grades.component")}</span><Input id={`grade-name-${component.id}`} value={component.name} onChange={(event) => updateComponent(component.id, { name: event.target.value })} /></label>
            <label><span>{t("grades.maxScore")}</span><Input type="number" min="0" step="0.01" value={component.maxScore > 0 ? component.maxScore : ""} onChange={(event) => updateComponent(component.id, { maxScore: emptyToNumber(event.target.value) })} /></label>
            <label><span>{t("grades.earnedScore")}</span><Input type="number" min="0" step="0.01" placeholder="—" value={component.earnedScore ?? ""} onChange={(event) => updateComponent(component.id, { earnedScore: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <StatusPill tone={scored ? "green" : "orange"}><i className="grade-status-dot" />{scored ? t("grades.scored") : t("grades.waitingScore")}</StatusPill>
            <button className="icon-button grade-simple-delete" type="button" onClick={() => setPendingDelete(component)} aria-label={`${t("grades.delete")} ${component.name || t("grades.component")}`}><Trash2 /></button>
            {attemptedSave && error && <p className="grade-simple-component-error" role="alert">{error}</p>}
          </article>;
        }) : <div className="grade-simple-empty"><Target /><strong>{t("grades.noComponents")}</strong><p>{t("grades.noComponentsDescription")}</p><button className="secondary-button" type="button" onClick={addComponent}><Plus />{t("grades.addComponent")}</button></div>}
        {plan.components.length > 0 && <button className="secondary-button grade-simple-add" type="button" onClick={addComponent}><Plus />{t("grades.addComponent")}</button>}
      </Card>
    </section>

    <Card className={`grade-simple-recommendation ${summary.targetReached ? "reached" : !summary.canReachTarget ? "impossible" : ""}`}>
      <div className="grade-simple-recommendation-heading"><div><Sparkles /><h2>{t("grades.targetRecommendation")}</h2></div><Field label={t("grades.target")}><Select value={plan.targetGrade ?? ""} onChange={(event) => updatePlan({ ...plan, targetGrade: event.target.value })}>{plan.thresholds.map((threshold) => <option key={threshold.label} value={threshold.label}>{threshold.label}</option>)}</Select></Field></div>
      <p>{recommendation}</p>
    </Card>

    <details className="grade-simple-criteria">
      <summary><span>{t("grades.criteria")}</span><ChevronDown /></summary>
      <p>{t("grades.criteriaNotice")}</p>
      <div>{plan.thresholds.map((threshold, index) => <section key={`${threshold.label}-${index}`}><Field label={t("grades.thresholdLabel")}><Input value={threshold.label} onChange={(event) => updatePlan({ ...plan, thresholds: plan.thresholds.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></Field><Field label={t("grades.thresholdMinimum")} error={thresholdError(index)}><Input type="number" min="0" max="100" step="0.01" value={Number.isFinite(threshold.minimumPercent) ? threshold.minimumPercent : ""} onChange={(event) => updatePlan({ ...plan, thresholds: plan.thresholds.map((item, itemIndex) => itemIndex === index ? { ...item, minimumPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) } : item) })} /></Field></section>)}</div>
    </details>

    <BottomSheet open={pendingDelete !== null} title={t("grades.confirmDeleteComponent")} onClose={() => setPendingDelete(null)} closeLabel={t("common.close")}><div className="grade-simple-dialog"><Trash2 /><p>{language === "th" ? `ต้องการลบ “${pendingDelete?.name || t("grades.component")}” หรือไม่` : `Delete “${pendingDelete?.name || t("grades.component")}”?`}</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>{t("common.cancel")}</button><button className="danger-button" type="button" onClick={confirmDelete}>{t("grades.delete")}</button></div></div></BottomSheet>
    <BottomSheet open={leaveOpen} title={t("grades.unsavedChanges")} onClose={() => setLeaveOpen(false)} closeLabel={t("common.close")}><div className="grade-simple-dialog"><CircleAlert /><p>{t("grades.unsavedChanges")}</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setLeaveOpen(false)}>{t("common.cancel")}</button><button className="danger-button" type="button" onClick={() => router.push("/grades")}>{t("common.back")}</button></div></div></BottomSheet>
  </main>;
}
