import type {
  AppNotification,
  AppSettings,
  ChatMessage,
  ClassSchedule,
  Exam,
  CourseNote,
  AttendanceRecord,
  CourseGradePlan,
  Project,
  Task,
  UserProfile,
  LearningGoals,
  AcademicTerm,
  FinanceTransaction,
  FinanceSettings,
  FinanceCategory,
  SavingGoal,
} from "@/types";
import { relativeTaskDate } from "@/lib/task-utils";

export const initialProfile: UserProfile = {
  displayName: "น้องตาต้าร์",
  email: "name@gmail.com",
  major: "วิทยาการคอมพิวเตอร์",
  university: "มหาวิทยาลัยเชียงใหม่",
};

export const initialAcademicTerm: AcademicTerm = { level: "ชั้นปีที่ 2", term: "ภาคเรียนที่ 1", academicYear: "2569", label: "ภาคต้น" };

export const initialSchedules: ClassSchedule[] = [
  { id: "class-math", courseId: "course-math", name: "คณิตศาสตร์", teacher: "อ. ธนกฤต", room: "ห้อง 320", day: 0, startTime: "08:30", endTime: "10:00", color: "purple" },
  { id: "class-science", courseId: "course-science", name: "วิทยาศาสตร์", teacher: "อ. พิมพ์ชนก", room: "ห้อง 204", day: 1, startTime: "10:00", endTime: "11:30", color: "green" },
  { id: "class-english", courseId: "course-english", name: "ภาษาอังกฤษ", teacher: "อ. Amanda", room: "ห้อง 301", day: 2, startTime: "13:00", endTime: "14:30", color: "orange" },
  { id: "class-computer", courseId: "course-computer", name: "คอมพิวเตอร์", teacher: "อ. ณัฐวุฒิ", room: "ห้อง LAB-2", day: 4, startTime: "14:30", endTime: "16:30", color: "blue" },
];

export const initialTasks: Task[] = [
  { id: "math-homework", title: "แบบฝึกหัดคณิตศาสตร์", courseId: "course-math", description: "บทที่ 3 ข้อ 1–20", dueLabel: "วันนี้ 23:59", dueDate: relativeTaskDate(0, 23, 59), estimate: "2 ชั่วโมง", status: "doing", color: "orange", attachment: "ตัวอย่างโจทย์.pdf", subtasks: ["ทำข้อ 1–5","ทำข้อ 6–10","ทำข้อ 11–15","ทำข้อ 16–20","ตรวจคำตอบ"].map((title,index) => ({id:`math-${index}`,title,completed:index<3})) },
  { id: "computing-project", title: "โครงงานวิทยาการคำนวณ", description: "เตรียมสไลด์และสรุปผลการทดลอง", dueLabel: "พรุ่งนี้ 20:00", dueDate: relativeTaskDate(1, 20), estimate: "4 ชั่วโมง", status: "doing", color: "purple", subtasks: ["รวบรวมข้อมูล","ออกแบบสไลด์","ตรวจเนื้อหา","ซ้อมนำเสนอ"].map((title,index) => ({id:`project-${index}`,title,completed:index===0})) },
  { id: "science-report", title: "รายงานวิทยาศาสตร์", courseId: "course-science", description: "สรุปผลการทดลองเรื่องแรง", dueLabel: "ส่งอีก 4 วัน", dueDate: relativeTaskDate(4, 23, 59), estimate: "3 ชั่วโมง", status: "todo", color: "green", subtasks: [] },
  { id: "english-reading", title: "อ่านบทที่ 2 ภาษาอังกฤษ", courseId: "course-english", description: "อ่านและจดคำศัพท์สำคัญ", dueLabel: "เสร็จแล้ว", dueDate: relativeTaskDate(-1, 20), estimate: "20 นาที", status: "completed", color: "blue", completedAt: relativeTaskDate(0, 18), subtasks: [] },
  { id: "physics-practice", title: "ทำแบบฝึกหัดฟิสิกส์", description: "แบบฝึกหัดท้ายบท", dueLabel: "เสร็จแล้ว", dueDate: relativeTaskDate(-2, 19), estimate: "1 ชั่วโมง", status: "completed", color: "cyan", completedAt: relativeTaskDate(-2, 19), subtasks: [] },
];

/** Notifications are generated from current app state by the Smart Alert engine. */
export const initialNotifications: AppNotification[] = [];

export const initialExams: Exam[] = [{ id: "exam-math", courseId: "course-math", title: "สอบกลางภาค", type: "midterm", startAt: relativeTaskDate(5, 9), endAt: relativeTaskDate(5, 12), room: "ห้อง 320", note: "อนุญาตให้นำเครื่องคิดเลขได้", topics: ["บทที่ 1", "บทที่ 2", "บทที่ 3", "แบบฝึกหัด"].map((title, index) => ({ id: `topic-${index}`, title, completed: index < 2 })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: "exam-science", courseId: "course-science", title: "สอบย่อยการทดลอง", type: "quiz", startAt: relativeTaskDate(12, 10), room: "ห้อง 204", topics: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
export const initialCourseNotes: CourseNote[] = [{ id: "note-math", courseId: "course-math", title: "สรุปบทที่ 2", content: "สูตรสำคัญและตัวอย่างโจทย์", tags: ["สรุป", "สอบ"], pinned: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: "note-science", courseId: "course-science", title: "การทดลองเรื่องแรง", content: "บันทึกขั้นตอนและผลการทดลอง", tags: ["Lecture"], pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
export const initialAttendanceRecords: AttendanceRecord[] = [{ id: "attendance-math-1", courseId: "course-math", date: relativeTaskDate(-7, 8).slice(0, 10), startTime: "08:30", status: "present", createdAt: new Date().toISOString() }, { id: "attendance-math-2", courseId: "course-math", date: relativeTaskDate(-14, 8).slice(0, 10), startTime: "08:30", status: "late", createdAt: new Date().toISOString() }, { id: "attendance-science-1", courseId: "course-science", date: relativeTaskDate(-6, 10).slice(0, 10), startTime: "10:00", status: "present", createdAt: new Date().toISOString() }];
export const initialGradePlans: CourseGradePlan[] = [{ id: "grade-math", courseId: "course-math", targetGrade: "A", thresholds: [{ label: "A", minimumPercent: 80 }, { label: "B+", minimumPercent: 75 }, { label: "B", minimumPercent: 70 }, { label: "C+", minimumPercent: 65 }, { label: "C", minimumPercent: 60 }, { label: "D", minimumPercent: 50 }], components: [{ id: "grade-math-1", name: "คะแนนเก็บ", weight: 20, maxScore: 20, earnedScore: 18 }, { id: "grade-math-2", name: "กลางภาค", weight: 30, maxScore: 30, earnedScore: 25 }, { id: "grade-math-3", name: "งาน", weight: 30, maxScore: 30, earnedScore: 22 }, { id: "grade-math-4", name: "ปลายภาค", weight: 20, maxScore: 20 }] }];
export const initialProjects: Project[] = [{ id: "project-science", title: "สไลด์โครงงานวิทยาศาสตร์", subject: "วิทยาศาสตร์", dueDate: "พรุ่งนี้", progress: 45 }];

export const initialChat: ChatMessage[] = [
  { id: "hello", role: "assistant", content: "สวัสดีครับ ผม TALEVO\nมีอะไรให้ผมช่วยไหมครับ 😊" },
];

export const initialSettings: AppSettings = {
  notificationPreferences: {
    enabled: true,
    task24h: true,
    task12h: true,
    deadlineRisk: true,
    morning0600: true,
    daily0700: true,
    class30m: true,
    classEnd10m: true,
    exam7d: true,
    exam3d: true,
    exam1d: true,
    examMorning: true,
    weeklyRadar: true,
    browserNotifications: false,
  },
  timezone: "Asia/Bangkok",
  dateFormat: "วัน/เดือน/ปี",
  yearSystem: "พ.ศ.",
};

export const initialLearningGoals: LearningGoals = {
  weeklyStudyHours: 8,
  earlySubmissionDays: 1,
  examPreparationDays: 7,
  personalGoal: "ส่งงานให้ตรงเวลาทุกวิชา",
};

export const initialFinanceTransactions: FinanceTransaction[] = [
  { id: "finance-income", type: "income", title: "เงินจากผู้ปกครอง", amount: 4500, category: "เงินจากผู้ปกครอง", date: "2026-08-01", note: "ค่าใช้จ่ายประจำเดือน" },
  { id: "finance-food", type: "expense", title: "อาหารกลางวัน", amount: 85, category: "ค่าอาหาร", date: "2026-08-30" },
  { id: "finance-travel", type: "expense", title: "ค่าเดินทาง", amount: 40, category: "ค่าเดินทาง", date: "2026-08-30" },
  { id: "finance-study", type: "expense", title: "สมุดและอุปกรณ์เรียน", amount: 180, category: "ค่าเรียน / อุปกรณ์การเรียน", date: "2026-08-25" },
  { id: "finance-saving", type: "saving", title: "เก็บเงินซื้อแท็บเล็ต", amount: 600, category: "เงินออม", date: "2026-08-22" },
];

export const initialFinanceCategories: FinanceCategory[] = [
  { id: "category-food", name: "ค่าอาหาร", type: "expense", icon: "utensils", color: "purple", monthlyBudget: 2200, isDefault: true },
  { id: "category-travel", name: "ค่าเดินทาง", type: "expense", icon: "bus", color: "blue", monthlyBudget: 900, isDefault: true },
  { id: "category-study", name: "ค่าเรียน / อุปกรณ์การเรียน", type: "expense", icon: "book", color: "green", monthlyBudget: 1800, isDefault: true },
  { id: "category-housing", name: "ค่าหอ / ที่พัก", type: "expense", icon: "house", color: "purple", isDefault: true },
  { id: "category-fun", name: "ความบันเทิง", type: "expense", icon: "gamepad", color: "pink", monthlyBudget: 600, isDefault: true },
  { id: "category-health", name: "สุขภาพ", type: "expense", icon: "heart", color: "orange", isDefault: true },
  { id: "category-shopping", name: "ชอปปิง", type: "expense", icon: "bag", color: "magenta", isDefault: true },
  { id: "category-parent", name: "เงินจากผู้ปกครอง", type: "income", icon: "wallet", color: "green", isDefault: true },
  { id: "category-parttime", name: "งานพิเศษ", type: "income", icon: "briefcase", color: "blue", isDefault: true },
  { id: "category-scholarship", name: "ทุนการศึกษา", type: "income", icon: "graduate", color: "purple", isDefault: true },
  { id: "category-saving", name: "เงินออม", type: "saving", icon: "piggy", color: "purple", isDefault: true },
];

export const initialSavingGoals: SavingGoal[] = [
  { id: "saving-tablet", title: "ซื้อแท็บเล็ต", targetAmount: 12000, savedAmount: 4600 },
  { id: "saving-emergency", title: "เงินฉุกเฉิน", targetAmount: 5000, savedAmount: 1800 },
];

export const initialFinanceSettings: FinanceSettings = { dailyBudget: 200 };
