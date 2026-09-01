import type { AttendanceRecord, CourseGradePlan, Exam, GradeComponent, GradeThreshold } from "@/types";
import { parseLocalTaskDate } from "@/lib/task-utils";

export function getExamDate(exam: Pick<Exam, "startAt">) { return parseLocalTaskDate(exam.startAt); }

export type ExamDateLanguage = "th" | "en";

/**
 * Parses an exam calendar date as local time.  Unlike `new Date("YYYY-MM-DD")`,
 * this never interprets a date-only value as UTC and therefore cannot shift the
 * visible Thai date in timezones west of UTC.
 */
function getExamCalendarDate(startAt: string) {
  const localDateTime = parseLocalTaskDate(startAt);
  if (localDateTime) return localDateTime;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startAt);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatExamTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function formatExamRoom(room: string | undefined, language: ExamDateLanguage) {
  const value = room?.trim();
  if (!value) return "";
  if (language === "th") return value.startsWith("ห้อง") ? value : `ห้อง ${value}`;
  return /^room\b/i.test(value) ? value : `Room ${value}`;
}

/** Formats an exam date in the active language using the student's local calendar. */
export function formatExamDate(exam: Pick<Exam, "startAt">, language: ExamDateLanguage = "th") {
  const date = getExamCalendarDate(exam.startAt);
  if (!date) return "";
  return new Intl.DateTimeFormat(language === "th" ? "th-TH-u-ca-buddhist" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Returns only time information, so date-only legacy records stay date-only. */
export function formatExamTimeRange(exam: Pick<Exam, "startAt" | "endAt">, language: ExamDateLanguage = "th") {
  const start = parseLocalTaskDate(exam.startAt);
  if (!start) return "";
  const end = exam.endAt ? parseLocalTaskDate(exam.endAt) : null;
  const range = end ? `${formatExamTime(start)}–${formatExamTime(end)}` : formatExamTime(start);
  return language === "th" ? `${range} น.` : range;
}

/** Human-friendly metadata used by every student-facing Exam display. */
export function formatExamDateTime(exam: Pick<Exam, "startAt" | "endAt" | "room">, language: ExamDateLanguage = "th") {
  return [formatExamDate(exam, language), formatExamTimeRange(exam, language), formatExamRoom(exam.room, language)].filter(Boolean).join(" · ");
}

export function getExamCountdown(exam: Pick<Exam, "startAt">, now = new Date(), language: "th" | "en" = "th") {
  const date = getExamDate(exam); if (!date) return "—";
  const hours = Math.ceil((date.getTime() - now.getTime()) / 3_600_000);
  if (hours < 0) return language === "th" ? "สอบแล้ว" : "Completed";
  if (hours < 1) return language === "th" ? "วันนี้" : "Today";
  if (hours < 24) return language === "th" ? `อีก ${hours} ชั่วโมง` : `In ${hours} hours`;
  const days = Math.ceil(hours / 24); if (days === 1) return language === "th" ? "พรุ่งนี้" : "Tomorrow";
  return language === "th" ? `อีก ${days} วัน` : `In ${days} days`;
}
export function getExamReadiness(exam: Pick<Exam, "topics">) { const total = exam.topics.length; const completed = exam.topics.filter((item) => item.completed).length; return total ? { total, completed, percent: Math.round((completed / total) * 100) } : null; }
export function getAttendanceSummary(records: AttendanceRecord[]) { const count = (status: AttendanceRecord["status"]) => records.filter((record) => record.status === status).length; const present = count("present"); const late = count("late"); const leave = count("leave"); const absent = count("absent"); const cancelled = count("cancelled"); const denominator = present + late + leave + absent; return { present, late, leave, absent, cancelled, rate: denominator ? ((present + late) / denominator) * 100 : null }; }
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function hasEarnedScore(component: GradeComponent): component is GradeComponent & { earnedScore: number } {
  return isFiniteNumber(component.earnedScore);
}

export function isGradeComponentUsed(component: GradeComponent) {
  return Boolean(component.name.trim()) || component.weight !== 0 || component.maxScore !== 0 || hasEarnedScore(component);
}

export function calculateWeightedScore(component: GradeComponent) {
  if (!hasEarnedScore(component) || !isFiniteNumber(component.weight) || !isFiniteNumber(component.maxScore) || component.maxScore <= 0) return 0;
  return (component.earnedScore / component.maxScore) * component.weight;
}

export function getWeightedScore(components: GradeComponent[]) {
  return components.reduce((total, component) => total + calculateWeightedScore(component), 0);
}

export function calculateGradedWeight(components: GradeComponent[]) {
  return components.filter(hasEarnedScore).reduce((total, component) => total + (isFiniteNumber(component.weight) ? component.weight : 0), 0);
}

export function calculateRemainingWeight(components: GradeComponent[]) {
  return components.filter((component) => !hasEarnedScore(component)).reduce((total, component) => total + (isFiniteNumber(component.weight) ? component.weight : 0), 0);
}

export function resolveGrade(score: number | null, thresholds: GradeThreshold[]) {
  if (score === null || !Number.isFinite(score)) return null;
  return [...thresholds].sort((first, second) => second.minimumPercent - first.minimumPercent).find((threshold) => score >= threshold.minimumPercent)?.label ?? null;
}

export interface GradePlanValidation {
  isValid: boolean;
  weightOverage: number;
  componentErrors: Record<string, string[]>;
  thresholdErrors: Record<number, string[]>;
}

export function validateGradePlan(plan: Pick<CourseGradePlan, "components" | "thresholds">): GradePlanValidation {
  const componentErrors: Record<string, string[]> = {};
  plan.components.forEach((component) => {
    if (!isGradeComponentUsed(component)) return;
    const errors: string[] = [];
    if (!component.name.trim()) errors.push("componentNameRequired");
    if (!isFiniteNumber(component.weight) || component.weight <= 0 || component.weight > 100) errors.push("componentWeightRange");
    if (!isFiniteNumber(component.maxScore) || component.maxScore <= 0) errors.push("componentMaxScore");
    if (hasEarnedScore(component) && component.earnedScore < 0) errors.push("componentEarnedRange");
    if (hasEarnedScore(component) && isFiniteNumber(component.maxScore) && component.earnedScore > component.maxScore) errors.push("componentEarnedMax");
    if (errors.length) componentErrors[component.id] = errors;
  });
  const totalWeight = plan.components.reduce((total, component) => total + (isFiniteNumber(component.weight) ? component.weight : 0), 0);
  const thresholdErrors: Record<number, string[]> = {};
  plan.thresholds.forEach((threshold, index) => {
    const errors: string[] = [];
    if (!threshold.label.trim()) errors.push("thresholdLabelRequired");
    if (!isFiniteNumber(threshold.minimumPercent) || threshold.minimumPercent < 0 || threshold.minimumPercent > 100) errors.push("thresholdRange");
    if (index > 0 && threshold.minimumPercent >= plan.thresholds[index - 1].minimumPercent) errors.push("thresholdOrder");
    if (errors.length) thresholdErrors[index] = errors;
  });
  return { isValid: totalWeight <= 100 && !Object.keys(componentErrors).length && !Object.keys(thresholdErrors).length, weightOverage: Math.max(0, totalWeight - 100), componentErrors, thresholdErrors };
}

export function getGradePlanSummary(plan: CourseGradePlan) {
  const weight = plan.components.reduce((total, component) => total + (isFiniteNumber(component.weight) ? component.weight : 0), 0);
  const current = getWeightedScore(plan.components);
  const gradedWeight = calculateGradedWeight(plan.components);
  const remainingWeight = calculateRemainingWeight(plan.components);
  const gradedAverage = gradedWeight > 0 ? (current / gradedWeight) * 100 : null;
  const target = plan.thresholds.find((threshold) => threshold.label === plan.targetGrade)?.minimumPercent;
  const requiredPoints = target === undefined ? null : Math.max(0, target - current);
  const maximumPossible = current + remainingWeight;
  const targetReached = target !== undefined && current >= target;
  const possible = target === undefined || targetReached || target <= maximumPossible;
  const requiredAverage = target !== undefined && !targetReached && possible && remainingWeight > 0 ? (target - current) / remainingWeight * 100 : null;
  const ungradedComponents = plan.components.filter((component) => !hasEarnedScore(component) && isGradeComponentUsed(component));
  const requiredRawScore = !targetReached && possible && requiredPoints !== null && ungradedComponents.length === 1 && ungradedComponents[0].weight > 0 && ungradedComponents[0].maxScore > 0 ? requiredPoints / ungradedComponents[0].weight * ungradedComponents[0].maxScore : null;
  const projectedFinal = gradedAverage === null ? null : current + (gradedAverage / 100) * remainingWeight;
  return {
    weight,
    current,
    gradedWeight,
    remainingWeight,
    gradedAverage,
    target,
    requiredPoints,
    requiredAverage,
    requiredRawScore,
    ungradedComponents,
    maximumPossible,
    targetReached,
    possible,
    currentGrade: resolveGrade(gradedAverage, plan.thresholds),
    projectedFinal,
    projectedGrade: resolveGrade(projectedFinal, plan.thresholds),
  };
}

export interface SimplifiedGradePlanSummary {
  totalMax: number;
  earnedPoints: number;
  gradedMax: number;
  remainingPossible: number;
  currentPercent: number | null;
  targetPercent: number | null;
  targetPoints: number | null;
  pointsNeeded: number | null;
  maxPossiblePoints: number;
  canReachTarget: boolean;
  targetReached: boolean;
  pendingComponents: GradeComponent[];
}

/**
 * Score planning intentionally uses raw points. The legacy `weight` field is
 * retained on stored components for backwards compatibility, but is not part
 * of this student-facing calculation.
 */
export function calculateGradePlan(plan: Pick<CourseGradePlan, "components" | "thresholds" | "targetGrade">): SimplifiedGradePlanSummary {
  const scoredComponents = plan.components.filter((component) => hasEarnedScore(component) && isFiniteNumber(component.maxScore) && component.maxScore > 0);
  const pendingComponents = plan.components.filter((component) => !hasEarnedScore(component) && isFiniteNumber(component.maxScore) && component.maxScore > 0);
  const totalMax = [...scoredComponents, ...pendingComponents].reduce((total, component) => total + component.maxScore, 0);
  const earnedPoints = scoredComponents.reduce((total, component) => total + (component.earnedScore ?? 0), 0);
  const gradedMax = scoredComponents.reduce((total, component) => total + component.maxScore, 0);
  const remainingPossible = pendingComponents.reduce((total, component) => total + component.maxScore, 0);
  const targetPercent = plan.thresholds.find((threshold) => threshold.label === plan.targetGrade)?.minimumPercent ?? null;
  const targetPoints = targetPercent === null || totalMax <= 0 ? null : (targetPercent / 100) * totalMax;
  const pointsNeeded = targetPoints === null ? null : Math.max(0, targetPoints - earnedPoints);
  const maxPossiblePoints = earnedPoints + remainingPossible;
  const targetReached = targetPoints !== null && earnedPoints >= targetPoints;
  const canReachTarget = targetPoints === null || targetReached || maxPossiblePoints >= targetPoints;
  return {
    totalMax,
    earnedPoints,
    gradedMax,
    remainingPossible,
    currentPercent: totalMax > 0 ? (earnedPoints / totalMax) * 100 : null,
    targetPercent,
    targetPoints,
    pointsNeeded,
    maxPossiblePoints,
    canReachTarget,
    targetReached,
    pendingComponents,
  };
}

export interface SimplifiedGradePlanValidation {
  isValid: boolean;
  componentErrors: Record<string, string[]>;
  thresholdErrors: Record<number, string[]>;
}

export function validateSimplifiedGradePlan(plan: Pick<CourseGradePlan, "components" | "thresholds" | "targetGrade">): SimplifiedGradePlanValidation {
  const componentErrors: Record<string, string[]> = {};
  plan.components.forEach((component) => {
    const errors: string[] = [];
    if (!component.name.trim()) errors.push("componentNameRequired");
    if (!isFiniteNumber(component.maxScore) || component.maxScore <= 0) errors.push("componentMaxScore");
    if (hasEarnedScore(component) && component.earnedScore < 0) errors.push("componentEarnedRange");
    if (hasEarnedScore(component) && isFiniteNumber(component.maxScore) && component.earnedScore > component.maxScore) errors.push("componentEarnedMax");
    if (errors.length) componentErrors[component.id] = errors;
  });
  const thresholdErrors: Record<number, string[]> = {};
  plan.thresholds.forEach((threshold, index) => {
    const errors: string[] = [];
    if (!threshold.label.trim()) errors.push("thresholdLabelRequired");
    if (!isFiniteNumber(threshold.minimumPercent) || threshold.minimumPercent < 0 || threshold.minimumPercent > 100) errors.push("thresholdRange");
    if (index > 0 && threshold.minimumPercent >= plan.thresholds[index - 1].minimumPercent) errors.push("thresholdOrder");
    if (errors.length) thresholdErrors[index] = errors;
  });
  const targetIsValid = plan.targetGrade !== undefined && plan.thresholds.some((threshold) => threshold.label === plan.targetGrade);
  return { isValid: targetIsValid && !Object.keys(componentErrors).length && !Object.keys(thresholdErrors).length, componentErrors, thresholdErrors };
}
