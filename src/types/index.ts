export type SubjectColor = "purple" | "blue" | "orange" | "yellow" | "green" | "cyan" | "pink" | "magenta";

export interface UserProfile {
  displayName: string;
  email: string;
  major: string;
  university: string;
  /** Object URL for a locally selected image during the current session only. */
  avatarUrl?: string;
}

export interface AcademicTerm {
  level: string;
  term: string;
  academicYear: string;
  label?: string;
}

export interface Course {
  id: string;
  name: string;
  teacher: string;
  room: string;
  color: string;
}

export interface ClassSchedule {
  id: string;
  courseId: string;
  name: string;
  courseCode?: string;
  teacher: string;
  room: string;
  /** Canonical #RRGGBB color. Legacy named colors are normalized when state loads. */
  color: string;
  day: number;
  startTime: string;
  endTime: string;
  note?: string;
  section?: string;
  credits?: number;
}

export type TaskStatus = "todo" | "doing" | "completed";
export interface TaskSubtask { id: string; title: string; completed: boolean; completedAt?: string; }
export interface TaskAttachment {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "file";
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  courseId?: string;
  description: string;
  dueLabel: string;
  dueDate: string;
  estimate: string;
  status: TaskStatus;
  subtasks?: TaskSubtask[];
  /** HEX color for tasks. Older named subject colors are accepted while reading saved data. */
  color: string;
  attachment?: string;
  attachments?: TaskAttachment[];
  completedAt?: string;
}

/** Minimal immutable record retained after a completed task reaches its 7-day expiry. */
export interface TaskCompletionHistory {
  id: string;
  originalTaskId: string;
  courseId?: string;
  completedAt: string;
  dueDate?: string;
  estimate?: string;
  subtaskCount: number;
}

export type ExamType = "quiz" | "midterm" | "final" | "practical" | "presentation" | "other";
export interface ExamTopic { id: string; title: string; completed: boolean; completedAt?: string; }
export interface Exam { id: string; courseId: string; title: string; type: ExamType; startAt: string; endAt?: string; room?: string; note?: string; topics: ExamTopic[]; completedAt?: string; createdAt: string; updatedAt: string; }
export type NewExamInput = Omit<Exam, "id" | "createdAt" | "updatedAt" | "completedAt">;

export interface CourseNote { id: string; courseId: string; title: string; content: string; tags: string[]; pinned: boolean; classDate?: string; createdAt: string; updatedAt: string; }
export type NewCourseNoteInput = Omit<CourseNote, "id" | "createdAt" | "updatedAt">;


export interface GradeComponent { id: string; name: string; weight: number; maxScore: number; earnedScore?: number; note?: string; }
export interface GradeThreshold { label: string; minimumPercent: number; }
export interface CourseGradePlan { id: string; courseId: string; components: GradeComponent[]; thresholds: GradeThreshold[]; targetGrade?: string; }

export interface Project {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  progress: number;
}

export type NotificationTone = "red" | "orange" | "green" | "purple" | "blue";

export type NotificationType =
  | "task_deadline"
  | "deadline_risk"
  | "morning_summary"
  | "daily_brief"
  | "class_upcoming"
  | "class_ending"
  | "exam_upcoming"
  | "exam_today"
  | "weekly_radar"
  | "academic_weather"
  | "system";

export type NotificationPriority = "high" | "medium" | "normal";

export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
  href?: string;
  eventKey: string;
  sourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NotificationPreferences {
  enabled: boolean;
  task24h: boolean;
  task12h: boolean;
  deadlineRisk: boolean;
  morning0600: boolean;
  daily0700: boolean;
  class30m: boolean;
  classEnd10m: boolean;
  exam7d: boolean;
  exam3d: boolean;
  exam1d: boolean;
  examMorning: boolean;
  weeklyRadar: boolean;
  browserNotifications: boolean;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  kind?: "text" | "task-summary";
}

export interface AppSettings {
  notificationPreferences: NotificationPreferences;
  timezone: "Asia/Bangkok";
  dateFormat: "วัน/เดือน/ปี" | "เดือน/วัน/ปี";
  yearSystem: "พ.ศ." | "ค.ศ.";
}

export interface LearningGoals {
  weeklyStudyHours: number;
  earlySubmissionDays: number;
  examPreparationDays: number;
  personalGoal: string;
}

export interface NewTaskInput {
  title: string;
  courseId?: string;
  description: string;
  dueDate: string;
  estimate: string;
  color: string;
  subtasks?: TaskSubtask[];
  attachments?: TaskAttachment[];
}

export interface NewClassInput {
  name: string;
  courseCode?: string;
  teacher: string;
  room: string;
  day: number;
  startTime: string;
  endTime: string;
  color: string;
  note: string;
  section?: string;
  credits?: number;
}

export type FinanceTransactionType = "income" | "expense" | "saving";

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  title: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
}

export interface NewFinanceTransactionInput {
  type: FinanceTransactionType;
  title: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  type: FinanceTransactionType;
  icon: string;
  color: SubjectColor;
  monthlyBudget?: number;
  createdAt?: string;
  isDefault?: boolean;
}

export interface SavingGoal {
  id: string;
  title: string;
  targetAmount: number;
  savedAmount: number;
}

export interface FinanceSettings {
  dailyBudget: number;
}
