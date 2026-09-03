import type { ClassSchedule, Exam, ExamType, NewClassInput, NewExamInput, NewTaskInput, Task } from "@/types";
import { academicRangesOverlap, isValidAcademicTimeRange, parseAcademicTime } from "@/lib/academic-time";
import { getDeterministicCourseColor } from "@/lib/talevo-color-utils";
import { isCorruptedScheduleTitle } from "@/lib/schedule-utils";

export type SyllabusConfidence = "confident" | "review" | "conflict" | "missing";
export type SyllabusSourceKind = "text" | "document";
export type SyllabusCourse = { courseCode: string | null; courseName: string | null; section: string | null; instructor: string | null; room: string | null; credits: number | null; };
export type SyllabusScheduleItem = { id: string; draftId: string; day: number | null; startTime: string | null; endTime: string | null; room: string | null; confidence: SyllabusConfidence; selected: boolean; courseCode?: string | null; courseName?: string | null; credits?: number | null; section?: string | null; extraLabel?: string | null; teacher?: string | null; evidence?: string[]; };
export type SyllabusTaskItem = { id: string; draftId: string; title: string; dueDate: string | null; dueTime: string | null; description: string | null; weight: number | null; confidence: SyllabusConfidence; selected: boolean; };
export type SyllabusExamItem = { id: string; draftId: string; title: string; type: ExamType; date: string | null; startTime: string | null; endTime: string | null; room: string | null; weight: number | null; confidence: SyllabusConfidence; selected: boolean; };
export type SyllabusDocumentLayout = "WEEKLY_TIME_GRID" | "PERIOD_GRID" | "SCHOOL_SUBJECT_GRID" | "DATED_SCHEDULE_GRID" | "DATED_EVENT_GRID" | "EXAM_GRID" | "UNIVERSITY_BLOCK_GRID" | "SYLLABUS_TEXT" | "UNKNOWN";
export type SyllabusPreview = { course: SyllabusCourse; schedules: SyllabusScheduleItem[]; tasks: SyllabusTaskItem[]; exams: SyllabusExamItem[]; warnings: string[]; sourceKind: SyllabusSourceKind; documentLayout?: SyllabusDocumentLayout; debug?: { ocrBlocks: number; dayAnchors: number; courseBlocks: number; parsedSchedules: number; warnings: number; tableCount?: number; rowAnchors?: number; columnAnchors?: number; candidateCells?: number; parsed?: number; review?: number; layoutScore?: number; evidence?: string[]; rawEvidenceCount?: number; physicalCellsCount?: number; classifiedCourseCellsCount?: number; finalRecordsCount?: number; droppedCells?: number }; };
export type SyllabusImportScheduleInput = NewClassInput & { courseId: string };
export type SyllabusImportPayload = { courseId: string; schedules: SyllabusImportScheduleInput[]; tasks: NewTaskInput[]; exams: NewExamInput[]; skippedDuplicates: number; };

const validStartTime = (value: string | null) => value !== null && parseAcademicTime(value, "start") !== null;
const validEndTime = (value: string | null) => value !== null && parseAcademicTime(value, "end") !== null;
const validDate = (value: string | null) => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
const clean = (value: string | null | undefined, max = 160) => value?.replace(/\s+/g, " ").trim().slice(0, max) ?? "";
const key = (value: string) => clean(value).toLocaleLowerCase();

export function updateSyllabusScheduleDraft(preview: SyllabusPreview, draftId: string, update: Partial<Omit<SyllabusScheduleItem, "draftId">>): SyllabusPreview {
  return { ...preview, schedules: preview.schedules.map((item) => item.draftId === draftId ? { ...item, ...update, draftId: item.draftId } : item) };
}

export function setAllSyllabusPreviewSelected(preview: SyllabusPreview, selected: boolean): SyllabusPreview {
  return {
    ...preview,
    schedules: preview.schedules.map((item) => ({ ...item, selected })),
    tasks: preview.tasks.map((item) => ({ ...item, selected })),
    exams: preview.exams.map((item) => ({ ...item, selected })),
  };
}

export function getCanonicalImportablePreview(preview: SyllabusPreview): SyllabusPreview {
  const selectedSchedules = preview.schedules.filter((item) =>
    item.selected &&
    item.day !== null &&
    item.day >= 0 &&
    item.day <= 6 &&
    isValidAcademicTimeRange(item.startTime, item.endTime) &&
    Boolean(clean(item.courseName) || clean(item.courseCode) || clean(preview.course.courseName) || clean(preview.course.courseCode))
  );

  const acceptedSchedules: SyllabusScheduleItem[] = [];
  for (const item of selectedSchedules) {
    const hasOverlap = acceptedSchedules.some((existing) =>
      existing.day === item.day &&
      academicRangesOverlap(item.startTime!, item.endTime!, existing.startTime!, existing.endTime!)
    );
    if (!hasOverlap) {
      acceptedSchedules.push(item);
    }
  }

  const validTasks = preview.tasks.filter((item) =>
    item.selected &&
    Boolean(clean(item.title)) &&
    validDate(item.dueDate)
  );

  const validExams = preview.exams.filter((item) =>
    item.selected &&
    Boolean(clean(item.title)) &&
    validDate(item.date) &&
    validStartTime(item.startTime) &&
    (item.endTime === null || validEndTime(item.endTime))
  );

  return {
    ...preview,
    schedules: preview.schedules.map((item) => ({
      ...item,
      selected: acceptedSchedules.some((s) => s.draftId === item.draftId),
    })),
    tasks: preview.tasks.map((item) => ({
      ...item,
      selected: validTasks.some((t) => t.draftId === item.draftId),
    })),
    exams: preview.exams.map((item) => ({
      ...item,
      selected: validExams.some((e) => e.draftId === item.draftId),
    })),
    warnings: [],
  };
}

export function getSyllabusImportReadiness(preview: SyllabusPreview, existing: { schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[] }) {
  const readyPreview = getCanonicalImportablePreview(preview);
  const readyCount = readyPreview.schedules.filter((item) => item.selected).length +
    readyPreview.tasks.filter((item) => item.selected).length +
    readyPreview.exams.filter((item) => item.selected).length;
  if (readyCount === 0) return { readyCount: 0, duplicateCount: 0, importableCount: 0 };
  const payload = buildSyllabusImportPayload(readyPreview, existing);
  return { readyCount, duplicateCount: payload.skippedDuplicates, importableCount: payload.schedules.length + payload.tasks.length + payload.exams.length };
}

export function deterministicCourseId(course: SyllabusCourse) {
  const basis = clean(course.courseCode) || clean(course.courseName);
  return "syllabus-" + (basis.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "course");
}

export function validateSyllabusPreview(preview: SyllabusPreview) {
  const warnings = [...preview.warnings];
  const selectedSchedules = preview.schedules.filter((item) => item.selected);
  if (!clean(preview.course.courseName) && !selectedSchedules.some((item) => clean(item.courseName) || clean(item.courseCode))) warnings.push("ไม่พบชื่อหรือรหัสวิชาที่ชัดเจน กรุณากรอกก่อนเพิ่มข้อมูล");
  selectedSchedules.forEach((item) => { if (item.day === null || item.day < 0 || item.day > 6 || !isValidAcademicTimeRange(item.startTime, item.endTime)) warnings.push("ตารางเรียนบางรายการมีวันหรือเวลาที่ไม่ถูกต้อง"); });
  selectedSchedules.forEach((item, index) => {
    if (item.day === null || !isValidAcademicTimeRange(item.startTime, item.endTime)) return;
    if (selectedSchedules.slice(index + 1).some((other) => other.day === item.day && isValidAcademicTimeRange(other.startTime, other.endTime) && academicRangesOverlap(item.startTime!, item.endTime!, other.startTime!, other.endTime!))) warnings.push("ตารางเรียนบางรายการมีเวลาซ้อนทับกัน กรุณาตรวจสอบก่อนนำเข้า");
  });
  preview.tasks.forEach((item) => { if (item.selected && (!clean(item.title) || !validDate(item.dueDate))) warnings.push("งานบางรายการไม่ถูกต้อง: ยังไม่มีชื่อหรือวันส่ง"); });
  preview.exams.forEach((item) => { if (item.selected && (!clean(item.title) || !validDate(item.date) || !validStartTime(item.startTime) || item.endTime !== null && !validEndTime(item.endTime))) warnings.push("การสอบบางรายการไม่ถูกต้อง: ยังไม่มีชื่อ วัน หรือเวลาเริ่ม"); });
  return [...new Set(warnings)];
}

function duplicateSignatures(schedules: ClassSchedule[], tasks: Task[], exams: Exam[]) {
  const scheduleSet = new Set<string>();
  for (const item of schedules) {
    scheduleSet.add([item.day, item.startTime, item.endTime, item.courseId, key(item.room)].join("|"));
    if (item.courseCode) {
      const codeCourseId = deterministicCourseId({ courseCode: item.courseCode, courseName: null, instructor: null, room: null, section: null, credits: null });
      scheduleSet.add([item.day, item.startTime, item.endTime, codeCourseId, key(item.room)].join("|"));
    }
  }
  return {
    schedules: scheduleSet,
    tasks: new Set(tasks.map((item) => [key(item.title), item.dueDate, item.courseId ?? ""].join("|"))),
    exams: new Set(exams.map((item) => [key(item.title), item.startAt.slice(0, 16), item.courseId].join("|"))),
  };
}

export function buildSyllabusImportPayload(preview: SyllabusPreview, existing: { schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[] }): SyllabusImportPayload {
  const readyPreview = getCanonicalImportablePreview(preview);
  const totalSelectedInReady =
    readyPreview.schedules.filter((item) => item.selected).length +
    readyPreview.tasks.filter((item) => item.selected).length +
    readyPreview.exams.filter((item) => item.selected).length;
  if (totalSelectedInReady === 0) throw new Error("invalid_syllabus_preview");

  const courseId = deterministicCourseId(readyPreview.course);
  const name = clean(readyPreview.course.courseName);
  const teacher = clean(readyPreview.course.instructor);
  const room = clean(readyPreview.course.room);
  const signatures = duplicateSignatures(existing.schedules, existing.tasks, existing.exams);
  let skippedDuplicates = 0;

  const schedules = readyPreview.schedules.flatMap((item) => {
    if (!item.selected) return [];
    const scheduleCode = clean(item.courseCode) || clean(readyPreview.course.courseCode);
    const rawCourseName = clean(item.courseName) || name;
    const cleanCourseName = !isCorruptedScheduleTitle(rawCourseName) ? rawCourseName : "";
    // Do not persist display fallback (e.g. course code) into stored name. Stored name remains blank if no course name in document.
    const scheduleName = cleanCourseName;
    const scheduleCourseId = deterministicCourseId({ ...readyPreview.course, courseCode: scheduleCode || null, courseName: scheduleName || null });
    const courseIdentity = scheduleCode || scheduleCourseId || scheduleName;
    const color = getDeterministicCourseColor(courseIdentity);
    const section = clean(item.section) || clean(readyPreview.course.section) || undefined;
    const credits = typeof item.credits === "number" ? item.credits : (typeof readyPreview.course.credits === "number" ? readyPreview.course.credits : undefined);
    const value: SyllabusImportScheduleInput = {
      name: scheduleName,
      courseCode: scheduleCode || undefined,
      teacher: clean(item.teacher) || teacher,
      room: clean(item.room) || room,
      day: item.day!,
      startTime: item.startTime!,
      endTime: item.endTime!,
      color,
      note: section ? `Section ${section}` : "",
      courseId: scheduleCourseId,
      section,
      credits,
    };
    const signature = [value.day, value.startTime, value.endTime, value.courseId, key(value.room)].join("|");
    if (signatures.schedules.has(signature)) { skippedDuplicates += 1; return []; }
    signatures.schedules.add(signature);
    return [value];
  });

  const tasks = readyPreview.tasks.flatMap((item) => {
    if (!item.selected) return [];
    const value: NewTaskInput = {
      title: clean(item.title),
      courseId,
      description: clean(item.description, 1000),
      dueDate: item.dueDate!,
      estimate: item.weight ? String(item.weight) + "%" : "",
      color: getDeterministicCourseColor(courseId),
    };
    const signature = [key(value.title), value.dueDate, courseId].join("|");
    if (signatures.tasks.has(signature)) { skippedDuplicates += 1; return []; }
    signatures.tasks.add(signature);
    return [value];
  });

  const exams = readyPreview.exams.flatMap((item) => {
    if (!item.selected) return [];
    const value: NewExamInput = {
      courseId,
      title: clean(item.title),
      type: item.type,
      startAt: item.date + "T" + item.startTime + ":00",
      ...(validEndTime(item.endTime) ? { endAt: item.date + "T" + item.endTime + ":00" } : {}),
      ...(clean(item.room) || room ? { room: clean(item.room) || room } : {}),
      note: item.weight ? "น้ำหนัก " + item.weight + "%" : "",
      topics: [],
    };
    const signature = [key(value.title), value.startAt.slice(0, 16), courseId].join("|");
    if (signatures.exams.has(signature)) { skippedDuplicates += 1; return []; }
    signatures.exams.add(signature);
    return [value];
  });

  return { courseId, schedules, tasks, exams, skippedDuplicates };
}
