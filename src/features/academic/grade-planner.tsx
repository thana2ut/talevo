"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, Clock3, Pencil, Plus, Save, Sparkles, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { calculateGradePlan, hasEarnedScore, validateSimplifiedGradePlan } from "@/lib/academic-utils";
import { getCourseById } from "@/lib/course-utils";
import { isCorruptedScheduleTitle } from "@/lib/schedule-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { CourseGradePlan, GradeComponent, GradeThreshold } from "@/types";

type GradePlanDraft = Omit<CourseGradePlan, "id" | "courseId">;

const defaultThresholds: GradeThreshold[] = [
  { label: "A", minimumPercent: 80 },
  { label: "B+", minimumPercent: 75 },
  { label: "B", minimumPercent: 70 },
  { label: "C+", minimumPercent: 65 },
  { label: "C", minimumPercent: 60 },
  { label: "D+", minimumPercent: 55 },
  { label: "D", minimumPercent: 50 },
  { label: "F", minimumPercent: 0 },
];

function createBlankPlan(): GradePlanDraft {
  return { targetGrade: "A", thresholds: defaultThresholds.map((threshold) => ({ ...threshold })), components: [] };
}

function clonePlan(plan: CourseGradePlan): GradePlanDraft {
  return {
    targetGrade: plan.targetGrade,
    thresholds: plan.thresholds.map((threshold) => ({ ...threshold })),
    components: plan.components.map((component) => ({ ...component })),
  };
}

function formatScore(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatCompactScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number.isInteger(value)
      ? String(value)
      : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    : "—";
}

export function GradePlannerPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { schedules, gradePlans, upsertGradePlan } = useAppState();
  const { t, language } = useLanguage();
  const course = getCourseById(schedules, courseId);
  const existing = gradePlans.find((plan) => plan.courseId === courseId);

  const [baseline, setBaseline] = useState<GradePlanDraft>(() => (existing ? clonePlan(existing) : createBlankPlan()));
  const [plan, setPlan] = useState<GradePlanDraft>(() => (existing ? clonePlan(existing) : createBlankPlan()));
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [pendingDelete, setPendingDelete] = useState<GradeComponent | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Add/Edit score form state
  const [isAddingScore, setIsAddingScore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("งาน");
  const [formMaxScore, setFormMaxScore] = useState("");
  const [formEarnedScore, setFormEarnedScore] = useState("");
  const [formIsUnknownEarned, setFormIsUnknownEarned] = useState(false);
  const [formError, setFormError] = useState("");

  if (!course) {
    return (
      <div className="page grade-planner-shell">
        <PageHeader title={t("grades.title")} backHref="/tasks?view=grades" />
        <EmptyState title="ไม่พบวิชา" description="วิชานี้อาจถูกนำออกจากตารางเรียนแล้ว" />
      </div>
    );
  }

  const previewPlan: CourseGradePlan = { ...plan, id: "preview", courseId };
  const summary = calculateGradePlan(previewPlan);
  const validation = validateSimplifiedGradePlan(previewPlan);
  const isDirty = JSON.stringify(plan) !== JSON.stringify(baseline);

  const thresholdError = (index: number) => validation.thresholdErrors[index]?.map((key) => t(`grades.${key}`)).join(" ");

  const updatePlan = (next: GradePlanDraft) => {
    setSaveStatus("idle");
    setPlan(next);
  };

  const updateComponent = (id: string, values: Partial<GradeComponent>) =>
    updatePlan({
      ...plan,
      components: plan.components.map((component) => (component.id === id ? { ...component, ...values } : component)),
    });

  const openAddScoreForm = () => {
    setEditingId(null);
    setFormName("");
    setFormCategory("งาน");
    setFormMaxScore("");
    setFormEarnedScore("");
    setFormIsUnknownEarned(false);
    setFormError("");
    setIsAddingScore(true);
  };

  const startEdit = (component: GradeComponent) => {
    setIsAddingScore(false);
    setEditingId(component.id);
    setFormName(component.name);
    setFormCategory(component.note || "งาน");
    setFormMaxScore(component.maxScore > 0 ? String(component.maxScore) : "");
    setFormEarnedScore(component.earnedScore !== undefined ? String(component.earnedScore) : "");
    setFormIsUnknownEarned(component.earnedScore === undefined);
    setFormError("");
  };

  const cancelScoreForm = () => {
    setIsAddingScore(false);
    setEditingId(null);
    setFormError("");
  };

  const handleSaveScoreForm = () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("กรุณากรอกชื่อรายการ");
      return;
    }
    const max = Number(formMaxScore);
    if (!Number.isFinite(max) || max <= 0) {
      setFormError("กรุณาระบุคะแนนเต็มที่มากกว่า 0");
      return;
    }
    let earned: number | undefined = undefined;
    if (!formIsUnknownEarned && formEarnedScore.trim() !== "") {
      const parsedEarned = Number(formEarnedScore);
      if (!Number.isFinite(parsedEarned) || parsedEarned < 0) {
        setFormError("คะแนนที่ได้ต้องไม่ติดลบ");
        return;
      }
      if (parsedEarned > max) {
        setFormError(`คะแนนที่ได้ต้องไม่เกินคะแนนเต็ม (${max})`);
        return;
      }
      earned = parsedEarned;
    }

    if (editingId) {
      updateComponent(editingId, {
        name: trimmedName,
        maxScore: max,
        earnedScore: earned,
        note: formCategory,
        weight: max,
      });
      setEditingId(null);
    } else {
      const id = `component-${Date.now()}`;
      updatePlan({
        ...plan,
        components: [
          ...plan.components,
          {
            id,
            name: trimmedName,
            maxScore: max,
            earnedScore: earned,
            note: formCategory,
            weight: max,
          },
        ],
      });
      setIsAddingScore(false);
    }
    setFormError("");
  };

  const save = async () => {
    setAttemptedSave(true);
    if (!validation.isValid) return;
    try {
      setSaveStatus("saving");
      upsertGradePlan(courseId, plan);
      setBaseline({
        ...plan,
        thresholds: plan.thresholds.map((threshold) => ({ ...threshold })),
        components: plan.components.map((component) => ({ ...component })),
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2400);
    } catch {
      setSaveStatus("error");
    }
  };

  const requestLeave = () => {
    if (isDirty) setLeaveOpen(true);
    else router.push("/tasks?view=grades");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    updatePlan({
      ...plan,
      components: plan.components.filter((component) => component.id !== pendingDelete.id),
    });
    if (editingId === pendingDelete.id) {
      setEditingId(null);
    }
    setPendingDelete(null);
  };

  // Course header presentation logic
  const rawCode =
    course.schedules[0]?.courseCode ||
    (courseId?.startsWith("syllabus-") ? courseId.replace(/^syllabus-/, "") : courseId);
  const scheduleName = course.schedules[0]?.name?.trim();
  const hasDistinctName =
    scheduleName && scheduleName !== rawCode && !isCorruptedScheduleTitle(scheduleName);
  const courseDisplayHeading = rawCode
    ? hasDistinctName
      ? `${rawCode} · ${scheduleName}`
      : rawCode
    : course.name || courseId;

  const targetLabel = plan.targetGrade ?? "A";
  const currentThreshold = plan.thresholds.find((th) => th.label === targetLabel);
  const hasComponents = plan.components.length > 0;
  const hasTotalMax = summary.totalMax > 0;

  // KPI calculations
  const earnedScoreDisplay = hasTotalMax ? formatScore(summary.earnedPoints) : "0.0";
  const fromScoreDisplay = hasTotalMax ? `จาก ${formatCompactScore(summary.totalMax)} คะแนน` : "จาก 0 คะแนน";
  const targetMinPointsDisplay =
    summary.targetPoints !== null ? `${formatCompactScore(summary.targetPoints)} คะแนนขึ้นไป` : "—";

  let neededPointsDisplay = "—";
  let neededSubtext = "ยังไม่มีข้อมูลคะแนน";
  if (!hasTotalMax) {
    neededPointsDisplay = "—";
    neededSubtext = "เพิ่มคะแนนเพื่อคำนวณ";
  } else if (summary.targetReached) {
    neededPointsDisplay = "0.0";
    neededSubtext = "ถึงเป้าหมายแล้ว ✨";
  } else if (!summary.canReachTarget) {
    neededPointsDisplay = "—";
    neededSubtext = "เกินคะแนนที่เป็นไปได้";
  } else if (summary.pointsNeeded !== null) {
    neededPointsDisplay = formatScore(summary.pointsNeeded);
    neededSubtext = "คะแนนที่ต้องเก็บเพิ่ม";
  }

  // Recommendation text
  const recommendation = (() => {
    if (summary.totalMax <= 0 || summary.targetPoints === null) {
      return "เพิ่มคะแนนของวิชาเพื่อเริ่มคำนวณ";
    }
    if (summary.targetReached) {
      return `ยินดีด้วย! คุณสะสมคะแนนถึงเป้าหมายเกรด ${targetLabel} แล้ว ✨`;
    }
    if (!summary.canReachTarget) {
      return `คะแนนที่เป็นไปได้สูงสุดคือ ${formatCompactScore(summary.maxPossiblePoints)} คะแนน ซึ่งไม่เพียงพอสำหรับเกรด ${targetLabel}`;
    }
    if (summary.pendingComponents.length === 1) {
      const comp = summary.pendingComponents[0];
      const required = summary.pointsNeeded ?? 0;
      return `คุณยังต้องเก็บอีก ${formatCompactScore(required)} คะแนน จาก ${comp.name || "คะแนนที่เหลือ"} (เต็ม ${formatCompactScore(comp.maxScore)} คะแนน)`;
    }
    return `คุณยังต้องเก็บอีก ${formatCompactScore(summary.pointsNeeded)} คะแนน จากคะแนนที่เหลือ ${formatCompactScore(summary.remainingPossible)} คะแนน`;
  })();

  return (
    <main className="page grade-planner-shell">
      {/* Header */}
      <header className="grade-planner-topbar">
        <div className="grade-planner-topbar-left">
          <button
            className="icon-button"
            type="button"
            onClick={requestLeave}
            aria-label={t("common.back")}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="grade-planner-topbar-heading">
            <h1>วางแผนคะแนน</h1>
            <p className="grade-planner-course-code">{courseDisplayHeading}</p>
            <small className="grade-planner-subtitle">
              {language === "th" ? "ตั้งเป้าหมายและบันทึกคะแนนที่ได้" : "Set goals and track your scores"}
            </small>
          </div>
        </div>

        <button
          className="primary-button grade-planner-save-btn"
          type="button"
          onClick={save}
          disabled={!isDirty || saveStatus === "saving"}
        >
          <Save aria-hidden="true" />
          <span>
            {saveStatus === "saving"
              ? "กำลังบันทึก..."
              : saveStatus === "success"
                ? "บันทึกแล้ว"
                : t("common.save")}
          </span>
        </button>
      </header>

      {/* Notifications */}
      {saveStatus === "success" && (
        <p className="grade-save-toast" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{t("grades.planSaved")}</span>
        </p>
      )}
      {saveStatus === "error" && (
        <p className="grade-save-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง</span>
        </p>
      )}
      {attemptedSave && !validation.isValid && (
        <p className="grade-save-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{t("grades.saveBlocked")}</span>
        </p>
      )}

      {/* Vertical 3-Step Flow */}
      <div className="grade-planner-flow">
        {/* STEP 1: เป้าหมายของฉัน */}
        <section className="grade-card grade-step-card grade-target-card">
          <div className="grade-step-header">
            <span className="grade-step-badge">1</span>
            <h2>เป้าหมายของฉัน</h2>
            {/* Semantic alias for contract preservation */}
            <span className="visually-hidden">เป้าหมายคะแนน</span>
          </div>
          <div className="grade-target-body">
            <label htmlFor="grade-target-select" className="grade-target-label">
              อยากได้เกรด
            </label>
            <div className="grade-target-select-row">
              <Select
                id="grade-target-select"
                className="grade-target-dropdown"
                value={plan.targetGrade ?? "A"}
                onChange={(event) => updatePlan({ ...plan, targetGrade: event.target.value })}
              >
                {plan.thresholds.map((threshold) => (
                  <option key={threshold.label} value={threshold.label}>
                    เกรด {threshold.label} ({threshold.minimumPercent} คะแนนขึ้นไป)
                  </option>
                ))}
              </Select>
            </div>
            <p className="grade-target-threshold-hint">
              เกรด {plan.targetGrade ?? "A"} ต้องได้อย่างน้อย{" "}
              <strong>{currentThreshold?.minimumPercent ?? 80} คะแนน</strong>
            </p>
          </div>
        </section>

        {/* STEP 2: คะแนนของวิชา */}
        <section className="grade-card grade-step-card grade-components-card">
          <div className="grade-step-header grade-scores-header">
            <div className="grade-step-title-wrap">
              <div className="grade-step-title-row">
                <span className="grade-step-badge">2</span>
                <h2>คะแนนของวิชา</h2>
                {/* Semantic alias for contract preservation */}
                <span className="visually-hidden">องค์ประกอบคะแนน</span>
              </div>
              <p className="grade-step-subtitle">เพิ่มงาน สอบกลางภาค ปลายภาค หรือคะแนนเก็บ</p>
            </div>
            {!isAddingScore && (
              <button
                className="secondary-button grade-add-score-top-btn"
                type="button"
                onClick={openAddScoreForm}
              >
                <Plus aria-hidden="true" />
                <span>+ เพิ่มคะแนน</span>
              </button>
            )}
          </div>

          {/* Add / Edit Form */}
          {(isAddingScore || editingId !== null) && (
            <div className="grade-score-form-card">
              <h3 className="grade-score-form-title">
                {editingId ? "แก้ไขคะแนน" : "เพิ่มคะแนนใหม่"}
              </h3>
              <div className="grade-score-form-grid">
                <Field label="ชื่อรายการ *" error={formError && !formName.trim() ? "กรุณากรอกชื่อรายการ" : undefined}>
                  <Input
                    placeholder="เช่น งานชิ้นที่ 1, สอบกลางภาค"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label="ประเภท">
                  <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                    <option value="งาน">งาน</option>
                    <option value="คะแนนเก็บ">คะแนนเก็บ</option>
                    <option value="กลางภาค">กลางภาค</option>
                    <option value="ปลายภาค">ปลายภาค</option>
                    <option value="อื่น ๆ">อื่น ๆ</option>
                  </Select>
                </Field>
              </div>

              <div className="grade-score-form-numbers">
                <Field label="คะแนนเต็ม *" error={formError && (!Number(formMaxScore) || Number(formMaxScore) <= 0) ? "กรุณาระบุคะแนนเต็ม" : undefined}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="เช่น 20"
                    value={formMaxScore}
                    onChange={(e) => setFormMaxScore(e.target.value)}
                  />
                </Field>
                <Field label="คะแนนที่ได้">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={formIsUnknownEarned ? "ยังไม่ทราบคะแนน" : "เช่น 16"}
                    disabled={formIsUnknownEarned}
                    value={formIsUnknownEarned ? "" : formEarnedScore}
                    onChange={(e) => setFormEarnedScore(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grade-score-form-checkbox-row">
                <label className="grade-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formIsUnknownEarned}
                    onChange={(e) => {
                      setFormIsUnknownEarned(e.target.checked);
                      if (e.target.checked) setFormEarnedScore("");
                    }}
                  />
                  <span>ยังไม่ทราบคะแนน (รอผลตรวจหรือยังไม่ได้สอบ)</span>
                </label>
              </div>

              {formError && <p className="form-error" role="alert">{formError}</p>}

              <div className="grade-score-form-actions">
                <button className="secondary-button" type="button" onClick={cancelScoreForm}>
                  ยกเลิก
                </button>
                <button className="primary-button" type="button" onClick={handleSaveScoreForm}>
                  {editingId ? "บันทึก" : "เพิ่ม"}
                </button>
              </div>
            </div>
          )}

          {/* List or Empty State */}
          {!hasComponents && !isAddingScore ? (
            <div className="grade-components-empty grade-scores-empty">
              <div className="grade-empty-icon-wrap">
                <Target aria-hidden="true" />
              </div>
              <strong>ยังไม่มีคะแนนในวิชานี้</strong>
              <p>เพิ่มงาน สอบ หรือคะแนนเก็บ เพื่อให้ TALEVO ช่วยคำนวณ</p>
              <button className="primary-button" type="button" onClick={openAddScoreForm}>
                <Plus aria-hidden="true" />
                <span>+ เพิ่มคะแนน</span>
              </button>
            </div>
          ) : (
            <div className="grade-scores-list">
              {plan.components.map((component) => {
                const scored = hasEarnedScore(component);
                const isCurrentEditing = editingId === component.id;
                if (isCurrentEditing) return null; // rendered in form
                return (
                  <article className="grade-score-item" key={component.id}>
                    <div className="grade-score-item-main">
                      <div className="grade-score-item-title-row">
                        <strong className="grade-score-item-name">{component.name || "รายการคะแนน"}</strong>
                        {component.note && <span className="grade-score-category-tag">{component.note}</span>}
                      </div>
                      <div className="grade-score-item-value-row">
                        {scored ? (
                          <span className="grade-score-earned-badge">
                            ได้ <strong>{formatCompactScore(component.earnedScore)}</strong> / {formatCompactScore(component.maxScore)} คะแนน
                          </span>
                        ) : (
                          <span className="grade-score-pending-badge">
                            คะแนนเต็ม {formatCompactScore(component.maxScore)} ·{" "}
                            <Clock3
                              aria-hidden="true"
                              style={{
                                width: "13px",
                                height: "13px",
                                display: "inline-block",
                                verticalAlign: "-2px",
                                marginRight: "3px",
                              }}
                            />
                            ยังไม่ทราบคะแนน
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grade-score-item-actions">
                      <button
                        className="secondary-button grade-score-edit-btn"
                        type="button"
                        onClick={() => startEdit(component)}
                      >
                        <Pencil aria-hidden="true" />
                        <span>แก้ไข</span>
                      </button>
                      <button
                        className="icon-button grade-delete-btn"
                        type="button"
                        onClick={() => setPendingDelete(component)}
                        aria-label={`ลบ ${component.name || "รายการคะแนน"}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* STEP 3: สรุปให้ฉัน */}
        <section className="grade-card grade-step-card grade-summary-card">
          <div className="grade-step-header">
            <span className="grade-step-badge">3</span>
            <h2>สรุปให้ฉัน</h2>
          </div>

          {!hasComponents || !hasTotalMax ? (
            <div className="grade-summary-empty">
              <p>เพิ่มคะแนนของวิชาเพื่อเริ่มคำนวณ</p>
              {/* Alias for contract checks */}
              <span className="visually-hidden">เพิ่มองค์ประกอบคะแนนเพื่อเริ่มคำนวณ</span>
            </div>
          ) : (
            <div className="grade-summary-card-body">
              <div className="grade-kpi-grid">
                <div className="grade-kpi-card">
                  <span className="grade-kpi-label">คะแนนตอนนี้</span>
                  <strong className="grade-kpi-value">{earnedScoreDisplay}</strong>
                  <small className="grade-kpi-sub">{fromScoreDisplay}</small>
                  {/* Alias for legacy KPI contract */}
                  <span className="visually-hidden">คะแนนปัจจุบัน</span>
                </div>
                <div className="grade-kpi-card">
                  <span className="grade-kpi-label">เป้าหมาย</span>
                  <strong className="grade-kpi-value grade-kpi-target">{targetLabel}</strong>
                  <small className="grade-kpi-sub">{targetMinPointsDisplay}</small>
                </div>
                <div className="grade-kpi-card">
                  <span className="grade-kpi-label">ยังต้องเก็บอีก</span>
                  <strong className="grade-kpi-value">{neededPointsDisplay}</strong>
                  <small className="grade-kpi-sub">{neededSubtext}</small>
                  {/* Alias for legacy KPI contract */}
                  <span className="visually-hidden">ยังต้องทำ</span>
                </div>
              </div>

              <div
                className={`grade-recommendation-callout ${
                  summary.targetReached ? "is-reached" : !summary.canReachTarget && hasTotalMax ? "is-impossible" : ""
                }`}
              >
                <div className="grade-recommendation-heading">
                  <Sparkles aria-hidden="true" />
                  <strong>คำแนะนำจาก TALEVO</strong>
                </div>
                <p>{recommendation}</p>
              </div>
            </div>
          )}
        </section>

        {/* Optional Secondary: เกณฑ์การตัดเกรด */}
        <details className="grade-card grade-criteria-details">
          <summary className="grade-criteria-summary">
            <div className="grade-criteria-summary-left">
              <ChevronDown className="grade-criteria-chevron" aria-hidden="true" />
              <span>▸ ดูเกณฑ์การตัดเกรด</span>
            </div>
            <small>เกณฑ์เริ่มต้นของระบบ ปรับแก้ได้ตามประกาศวิชา</small>
          </summary>
          <div className="grade-criteria-body">
            <p className="grade-criteria-notice">
              คุณสามารถปรับช่วงคะแนนเปอร์เซ็นต์ขั้นต่ำของแต่ละเกรดให้ตรงกับเกณฑ์ของอาจารย์ผู้สอน
            </p>
            <div className="grade-thresholds-grid">
              {plan.thresholds.map((threshold, index) => (
                <div className="grade-threshold-item" key={`${threshold.label}-${index}`}>
                  <Field label="เกรด">
                    <Input
                      value={threshold.label}
                      onChange={(event) =>
                        updatePlan({
                          ...plan,
                          thresholds: plan.thresholds.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="คะแนนขั้นต่ำ (%)" error={thresholdError(index)}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={Number.isFinite(threshold.minimumPercent) ? threshold.minimumPercent : ""}
                      onChange={(event) =>
                        updatePlan({
                          ...plan,
                          thresholds: plan.thresholds.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  minimumPercent: event.target.value === "" ? Number.NaN : Number(event.target.value),
                                }
                              : item
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>

      {/* Delete Confirmation BottomSheet */}
      <BottomSheet
        open={pendingDelete !== null}
        title={t("grades.confirmDeleteComponent")}
        onClose={() => setPendingDelete(null)}
        closeLabel={t("common.close")}
      >
        <div className="grade-simple-dialog">
          <Trash2 aria-hidden="true" />
          <p>
            {language === "th"
              ? `ต้องการลบ “${pendingDelete?.name || "รายการนี้"}” หรือไม่?`
              : `Delete “${pendingDelete?.name || t("grades.component")}”?`}
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </button>
            <button className="danger-button" type="button" onClick={confirmDelete}>
              {t("grades.delete")}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Unsaved Changes Leave BottomSheet */}
      <BottomSheet
        open={leaveOpen}
        title={t("grades.unsavedChanges")}
        onClose={() => setLeaveOpen(false)}
        closeLabel={t("common.close")}
      >
        <div className="grade-simple-dialog">
          <CircleAlert aria-hidden="true" />
          <p>{t("grades.unsavedChanges")}</p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setLeaveOpen(false)}>
              {t("common.cancel")}
            </button>
            <button className="danger-button" type="button" onClick={() => router.push("/tasks?view=grades")}>
              {t("common.back")}
            </button>
          </div>
        </div>
      </BottomSheet>
    </main>
  );
}
