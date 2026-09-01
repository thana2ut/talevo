import { formatExamDateTime, getExamDate } from "@/lib/academic-utils";
import { parseLocalTaskDate } from "@/lib/task-utils";
import type { ClassSchedule, Exam, Task } from "@/types";

type LocalAIContext = {
  content: string;
  tasks: Task[];
  schedules: ClassSchedule[];
  exams: Exam[];
  now: Date;
  language: "th" | "en";
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

export function buildLocalAIResponse({ content, tasks, schedules, exams, now, language }: LocalAIContext): LocalAIResponse {
  const prompt = content.trim();
  const pending = getPendingTasks(tasks);
  const todayIndex = (now.getDay() + 6) % 7;
  const todayClasses = schedules.filter((item) => item.day === todayIndex).sort((first, second) => first.startTime.localeCompare(second.startTime));
  const upcomingExams = exams
    .filter((exam) => !exam.completedAt && (getExamDate(exam)?.getTime() ?? -1) >= now.getTime())
    .sort((first, second) => (getExamDate(first)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (getExamDate(second)?.getTime() ?? Number.MAX_SAFE_INTEGER));

  if (prompt === "วันนี้ต้องทำอะไรบ้าง?" || prompt === "What do I need to do today?") {
    return pending.length
      ? { content: language === "th" ? `มีงานที่ยังไม่เสร็จ ${pending.length} รายการ ผมเรียงตามกำหนดส่งจากข้อมูลที่บันทึกไว้ให้แล้วครับ` : `You have ${pending.length} unfinished task${pending.length === 1 ? "" : "s"}, ordered by the saved due dates.`, kind: "task-summary" }
      : { content: language === "th" ? "ตอนนี้ไม่มีงานที่ยังไม่เสร็จในข้อมูลที่บันทึกไว้ครับ" : "There are no unfinished tasks in your saved data.", kind: "text" };
  }
  if (prompt === "วันนี้มีเรียนอะไร?" || prompt === "What classes do I have today?") {
    return todayClasses.length
      ? { content: language === "th" ? `วันนี้มี ${todayClasses.length} คาบ: ${todayClasses.map((item) => `${item.name} ${item.startTime}–${item.endTime}${item.room ? ` ${item.room}` : ""}`).join("; ")}` : `You have ${todayClasses.length} class${todayClasses.length === 1 ? "" : "es"} today: ${todayClasses.map((item) => `${item.name} ${item.startTime}–${item.endTime}${item.room ? ` ${item.room}` : ""}`).join("; ")}`, kind: "text" }
      : { content: language === "th" ? "วันนี้ไม่มีคาบเรียนในตารางที่บันทึกไว้ครับ" : "There are no classes in your saved schedule today.", kind: "text" };
  }
  if (prompt === "งานอะไรใกล้ส่ง?" || prompt === "Which tasks are due soon?") {
    const task = pending[0];
    return task
      ? { content: language === "th" ? `${task.title}${courseName(task.courseId, schedules) ? ` (${courseName(task.courseId, schedules)})` : ""} ใกล้ส่งที่สุด กำหนด ${formatTaskDue(task, language)} ครับ` : `${task.title}${courseName(task.courseId, schedules) ? ` (${courseName(task.courseId, schedules)})` : ""} is due first, on ${formatTaskDue(task, language)}.`, kind: "text" }
      : { content: language === "th" ? "ตอนนี้ไม่มีงานค้างที่มีข้อมูลกำหนดส่งครับ" : "There are no pending tasks with a valid due date.", kind: "text" };
  }
  if (prompt === "ฉันมีสอบเมื่อไหร่?" || prompt === "When are my exams?") {
    const exam = upcomingExams[0];
    return exam
      ? { content: language === "th" ? `การสอบถัดไปคือ ${exam.title}${courseName(exam.courseId, schedules) ? ` วิชา${courseName(exam.courseId, schedules)}` : ""} · ${formatExamDateTime(exam, language)}` : `Your next exam is ${exam.title}${courseName(exam.courseId, schedules) ? ` for ${courseName(exam.courseId, schedules)}` : ""} · ${formatExamDateTime(exam, language)}`, kind: "text" }
      : { content: language === "th" ? "ตอนนี้ไม่มีการสอบที่กำลังจะมาถึงในข้อมูลที่บันทึกไว้ครับ" : "There are no upcoming exams in your saved data.", kind: "text" };
  }
  return {
    content: language === "th"
      ? "ตอนนี้ผมตอบด้วยกฎภายในอุปกรณ์เกี่ยวกับงาน ตารางเรียน และการสอบที่บันทึกไว้ ลองเลือกคำถามแนะนำด้านบนได้ครับ"
      : "I currently use on-device rules for your saved tasks, schedule, and exams. Try one of the suggested questions above.",
    kind: "text",
  };
}
