import { formatExamDateTime, getExamDate } from "@/lib/academic-utils";
import { getAuthoritativeTemporalContext } from "@/lib/ai/temporal-context";
import { EMPTY_AI_CONTEXT_SELECTION, type AIContextSelection } from "@/lib/ai/types";
import { parseLocalTaskDate } from "@/lib/task-utils";
import type { ClassSchedule, Exam, Task } from "@/types";

type LocalAIContext = {
  content: string;
  tasks: Task[];
  schedules: ClassSchedule[];
  exams: Exam[];
  now: Date;
  language: "th" | "en";
  selectedContext?: AIContextSelection;
};

export type LocalAIResponse = { content: string; kind: "text" | "task-summary" };

function courseName(courseId: string | undefined, schedules: ClassSchedule[]) {
  return schedules.find((item) => item.courseId === courseId)?.name;
}

function formatTaskDue(task: Task, language: "th" | "en") {
  const date = parseLocalTaskDate(task.dueDate);
  if (!date) return language === "th" ? "ไม่พบกำหนดส่ง" : "No valid due date";
  return new Intl.DateTimeFormat(language === "th" ? "th-TH-u-ca-buddhist" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getPendingTasks(tasks: Task[]) {
  return tasks
    .filter((task) => task.status !== "completed")
    .sort((first, second) => (parseLocalTaskDate(first.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (parseLocalTaskDate(second.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER));
}

export function buildLocalAIResponse({ content, tasks, schedules, exams, now, language, selectedContext = EMPTY_AI_CONTEXT_SELECTION }: LocalAIContext): LocalAIResponse {
  const prompt = content.trim();
  const temporal = getAuthoritativeTemporalContext(now);
  const todayIndex = temporal.canonicalDay;
  const pending = selectedContext.tasks ? getPendingTasks(tasks) : [];
  const selectedSchedules = selectedContext.schedule ? schedules : [];
  const todayClasses = selectedSchedules.filter((item) => item.day === todayIndex).sort((first, second) => first.startTime.localeCompare(second.startTime));
  const upcomingExams = (selectedContext.exams ? exams : [])
    .filter((exam) => !exam.completedAt && (getExamDate(exam)?.getTime() ?? -1) >= now.getTime())
    .sort((first, second) => (getExamDate(first)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (getExamDate(second)?.getTime() ?? Number.MAX_SAFE_INTEGER));

  if (prompt === "วันนี้วันอะไร?" || prompt === "วันนี้วันอะไร" || prompt === "What day is today?" || prompt === "What day is it today?") {
    return {
      content: language === "th"
        ? `วันนี้คือ${temporal.weekdayTh} (${temporal.formattedTh}) ครับ`
        : `Today is ${temporal.weekdayEn}, ${temporal.localDate} (${temporal.timeZone}).`,
      kind: "text",
    };
  }

  if (prompt === "วันนี้ต้องทำอะไรบ้าง?" || prompt === "What do I need to do today?") {
    if (!selectedContext.tasks) return { content: language === "th" ? "เลือก “งาน” ในข้อมูลที่ให้ AI ใช้ก่อน แล้วผมจะช่วยสรุปสิ่งที่ต้องทำวันนี้จากข้อมูลในอุปกรณ์ให้ครับ" : "Select Tasks in the data panel first, and I can summarize today’s work from this device.", kind: "text" };
    return pending.length
      ? { content: language === "th" ? `มีงานที่ยังไม่เสร็จ ${pending.length} รายการ ผมเรียงตามกำหนดส่งจากข้อมูลที่บันทึกไว้ให้แล้วครับ` : `You have ${pending.length} unfinished task${pending.length === 1 ? "" : "s"}, ordered by the saved due dates.`, kind: "task-summary" }
      : { content: language === "th" ? "ตอนนี้ไม่มีงานที่ยังไม่เสร็จในข้อมูลที่บันทึกไว้ครับ" : "There are no unfinished tasks in your saved data.", kind: "text" };
  }
  if (
    prompt === "วันนี้มีเรียนอะไร?" ||
    prompt === "What classes do I have today?" ||
    prompt === "วันนี้มีเรียนกี่โมงครับ" ||
    prompt === "วันนี้มีเรียนกี่โมง?" ||
    prompt === "วันนี้มีเรียนกี่โมง" ||
    prompt === "วันนี้เรียนกี่ชั่วโมง?" ||
    prompt === "วันนี้เรียนกี่ชั่วโมง"
  ) {
    if (!selectedContext.schedule) {
      return {
        content: language === "th"
          ? `วันนี้คือ${temporal.weekdayTh} แต่หากต้องการให้ดูคาบเรียน กรุณาเลือกข้อมูลตารางเรียนก่อนครับ`
          : `Today is ${temporal.weekdayEn}, but please select Schedule in the data panel first to view today's classes.`,
        kind: "text",
      };
    }
    return todayClasses.length
      ? { content: language === "th" ? `วันนี้ (${temporal.weekdayTh}) มี ${todayClasses.length} คาบ: ${todayClasses.map((item) => `${item.name} ${item.startTime}–${item.endTime}${item.room ? ` ${item.room}` : ""}`).join("; ")}` : `You have ${todayClasses.length} class${todayClasses.length === 1 ? "" : "es"} today (${temporal.weekdayEn}): ${todayClasses.map((item) => `${item.name} ${item.startTime}–${item.endTime}${item.room ? ` ${item.room}` : ""}`).join("; ")}`, kind: "text" }
      : { content: language === "th" ? `วันนี้ (${temporal.weekdayTh}) ไม่มีคาบเรียนในตารางที่บันทึกไว้ครับ` : `There are no classes in your saved schedule today (${temporal.weekdayEn}).`, kind: "text" };
  }
  if (prompt === "งานอะไรใกล้ส่ง?" || prompt === "Which tasks are due soon?") {
    if (!selectedContext.tasks) return { content: language === "th" ? "เลือก “งาน” ในข้อมูลที่ให้ AI ใช้ก่อน แล้วผมจะเรียงงานที่ใกล้ส่งให้ครับ" : "Select Tasks in the data panel first, and I can sort what is due soon.", kind: "text" };
    const task = pending[0];
    return task
      ? { content: language === "th" ? `${task.title}${courseName(task.courseId, schedules) ? ` (${courseName(task.courseId, schedules)})` : ""} ใกล้ส่งที่สุด กำหนด ${formatTaskDue(task, language)} ครับ` : `${task.title}${courseName(task.courseId, schedules) ? ` (${courseName(task.courseId, schedules)})` : ""} is due first, on ${formatTaskDue(task, language)}.`, kind: "text" }
      : { content: language === "th" ? "ตอนนี้ไม่มีงานค้างที่มีข้อมูลกำหนดส่งครับ" : "There are no pending tasks with a valid due date.", kind: "text" };
  }
  if (prompt === "ฉันมีสอบเมื่อไหร่?" || prompt === "When are my exams?") {
    if (!selectedContext.exams) return { content: language === "th" ? "เลือก “การสอบ” ในข้อมูลที่ให้ AI ใช้ก่อน แล้วผมจะดูการสอบถัดไปให้ครับ" : "Select Exams in the data panel first, and I can check the next exam.", kind: "text" };
    const exam = upcomingExams[0];
    return exam
      ? { content: language === "th" ? `การสอบถัดไปคือ ${exam.title}${courseName(exam.courseId, schedules) ? ` วิชา${courseName(exam.courseId, schedules)}` : ""} · ${formatExamDateTime(exam, language)}` : `Your next exam is ${exam.title}${courseName(exam.courseId, schedules) ? ` for ${courseName(exam.courseId, schedules)}` : ""} · ${formatExamDateTime(exam, language)}`, kind: "text" }
      : { content: language === "th" ? "ตอนนี้ไม่มีการสอบที่กำลังจะมาถึงในข้อมูลที่บันทึกไว้ครับ" : "There are no upcoming exams in your saved data.", kind: "text" };
  }
  return {
    content: language === "th"
      ? "โหมดในอุปกรณ์ช่วยตอบคำถามแนะนำเกี่ยวกับงาน ตารางเรียน และการสอบได้ เลือกข้อมูลที่ต้องการใช้ก่อนถามเพื่อให้คำตอบตรงกับคุณมากขึ้นครับ"
      : "On-device mode supports the suggested task, schedule, and exam questions. Select the data you want to use first for a more personal answer.",
    kind: "text",
  };
}
