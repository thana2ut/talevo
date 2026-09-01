"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  initialChat,
  initialAcademicTerm,
  initialExams,
  initialLearningGoals,
  initialNotifications,
  initialProfile,
  initialProjects,
  initialSchedules,
  initialSettings,
  initialFinanceTransactions,
  initialFinanceSettings,
  initialFinanceCategories,
  initialSavingGoals,
  initialTasks,
  initialCourseNotes,
  initialAttendanceRecords,
  initialGradePlans,
} from "@/lib/mock-data";
import { buildLocalAIResponse } from "@/lib/local-ai";
import type {
  AppNotification,
  AppSettings,
  ChatMessage,
  ClassSchedule,
  Exam,
  NewClassInput,
  NewTaskInput,
  Project,
  Task,
  UserProfile,
  LearningGoals,
  AcademicTerm,
  FinanceTransaction,
  FinanceSettings,
  NewFinanceTransactionInput,
  SavingGoal,
  FinanceCategory,
  CourseNote,
  NewCourseNoteInput,
  AttendanceRecord,
  NewAttendanceInput,
  CourseGradePlan,
  NewExamInput,
  TaskAttachment,
  TaskCompletionHistory,
} from "@/types";
import { getLocalMonthKey } from "@/lib/finance-utils";
import { normalizeTaskColor } from "@/lib/task-color-utils";
import { normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { clearAttachmentBlobs, deleteAttachmentBlob } from "@/lib/task-attachment-storage";
import { createTaskCompletionHistory, getExpiredCompletedTasks } from "@/lib/task-retention";
import { evaluateSmartAlerts } from "@/lib/alerts/alert-engine";
import { removeAllReadNotifications, removeReadNotification } from "@/lib/alerts/notification-deletion";
import { claimAlertDeliveryLeadership, deliverNewBrowserNotifications } from "@/lib/alerts/notification-delivery";
import {
  APP_STATE_STORAGE_KEY,
  clearAppStateStorage,
  createAppStateSnapshot,
  parseAppStateSnapshot,
  readAppStateSnapshot,
  writeAppStateSnapshot,
  type AppStateDefaults,
  type PersistedAppState,
} from "@/lib/persistence/app-state-storage";
import { LEGACY_KERNOVA_SESSION_STORAGE_KEY, TALEVO_SESSION_STORAGE_KEY } from "@/lib/talevo-storage-keys";
import { useLanguage } from "@/providers/language-provider";
import type { NotificationPreferences } from "@/types";

interface AppStateValue {
  isAuthenticated: boolean;
  isHydrated: boolean;
  profile: UserProfile;
  tasks: Task[];
  tasksHydrated: boolean;
  taskCompletionHistory: TaskCompletionHistory[];
  now: Date;
  schedules: ClassSchedule[];
  notifications: AppNotification[];
  exams: Exam[];
  projects: Project[];
  chat: ChatMessage[];
  settings: AppSettings;
  browserNotificationPermission: NotificationPermission | "unsupported";
  goals: LearningGoals;
  academicTerm: AcademicTerm;
  financeTransactions: FinanceTransaction[];
  savingGoals: SavingGoal[];
  financeSettings: FinanceSettings;
  financeCategories: FinanceCategory[];
  selectedFinanceMonth: string;
  updateProfile: (value: Partial<UserProfile>) => void;
  registerLocalAccount: (profile: UserProfile, academicTerm: AcademicTerm) => void;
  setSelectedFinanceMonth: (monthKey: string) => void;
  updateSettings: (value: Partial<AppSettings>) => void;
  updateNotificationPreferences: (value: Partial<NotificationPreferences>) => void;
  setBrowserNotificationsEnabled: (enabled: boolean) => Promise<void>;
  updateGoals: (value: Partial<LearningGoals>) => void;
  updateAcademicTerm: (value: AcademicTerm) => void;
  startSession: () => void;
  endSession: () => void;
  resetUserData: () => void;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  addTask: (value: NewTaskInput, id?: string) => string;
  updateTask: (id: string, value: NewTaskInput) => void;
  deleteTask: (id: string) => void;
  addTaskAttachments: (taskId: string, attachments: TaskAttachment[]) => void;
  removeTaskAttachment: (taskId: string, attachmentId: string) => void;
  setTaskStatus: (id: string, status: Exclude<Task["status"], "completed">) => void;
  completeTask: (id: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addTaskSubtask: (taskId: string, title: string) => void;
  updateTaskSubtask: (taskId: string, subtaskId: string, title: string) => void;
  removeTaskSubtask: (taskId: string, subtaskId: string) => void;
  addSchedule: (value: NewClassInput) => string;
  updateSchedule: (id: string, value: NewClassInput) => void;
  deleteSchedule: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  deleteReadNotifications: () => void;
  sendChat: (content: string) => void;
  addFinanceTransaction: (value: NewFinanceTransactionInput) => string;
  updateFinanceTransaction: (id: string, value: NewFinanceTransactionInput) => void;
  deleteFinanceTransaction: (id: string) => void;
  addSavingGoal: (title: string, targetAmount: number) => void;
  contributeToSavingGoal: (id: string, amount: number) => void;
  updateFinanceSettings: (value: Partial<FinanceSettings>) => void;
  addFinanceCategory: (value: Omit<FinanceCategory, "id">) => string;
  updateFinanceCategory: (id: string, value: Partial<Omit<FinanceCategory, "id">>) => void;
  deleteFinanceCategory: (id: string) => boolean;
  courseNotes: CourseNote[];
  attendanceRecords: AttendanceRecord[];
  gradePlans: CourseGradePlan[];
  addExam: (value: NewExamInput) => string;
  updateExam: (id: string, value: Partial<NewExamInput>) => void;
  deleteExam: (id: string) => void;
  toggleExamTopic: (examId: string, topicId: string) => void;
  addCourseNote: (value: NewCourseNoteInput) => string;
  updateCourseNote: (id: string, value: Partial<NewCourseNoteInput>) => void;
  deleteCourseNote: (id: string) => void;
  toggleNotePinned: (id: string) => void;
  addAttendance: (value: NewAttendanceInput) => string | null;
  updateAttendance: (id: string, value: Partial<NewAttendanceInput>) => void;
  deleteAttendance: (id: string) => void;
  upsertGradePlan: (courseId: string, value: Omit<CourseGradePlan, "id" | "courseId">) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function readSessionStatus(storage: Storage) {
  const current = storage.getItem(TALEVO_SESSION_STORAGE_KEY);
  if (current !== null) return current;
  const legacy = storage.getItem(LEGACY_KERNOVA_SESSION_STORAGE_KEY);
  if (legacy === null) return null;
  try {
    storage.setItem(TALEVO_SESSION_STORAGE_KEY, legacy);
  } catch {
    // The legacy value remains available for this session when storage is full or blocked.
  }
  return legacy;
}

function appendCompletionHistory(current: TaskCompletionHistory[], tasks: Task[]) {
  const existingIds = new Set(current.map((item) => item.originalTaskId));
  const additions = tasks.map(createTaskCompletionHistory).filter((item): item is TaskCompletionHistory => item !== null && !existingIds.has(item.originalTaskId));
  return additions.length ? [...current, ...additions] : current;
}

function cleanupTaskAttachments(tasks: Task[]) {
  const attachmentIds = tasks.flatMap((task) => task.attachments?.map((attachment) => attachment.id) ?? []);
  if (attachmentIds.length) void Promise.allSettled(attachmentIds.map((id) => deleteAttachmentBlob(id)));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const defaultAppState: AppStateDefaults = {
  profile: initialProfile,
  academicTerm: initialAcademicTerm,
  schedules: initialSchedules,
  tasks: initialTasks,
  taskCompletionHistory: [],
  exams: initialExams,
  gradePlans: initialGradePlans,
  courseNotes: initialCourseNotes,
  attendanceRecords: initialAttendanceRecords,
  financeTransactions: initialFinanceTransactions,
  savingGoals: initialSavingGoals,
  financeSettings: initialFinanceSettings,
  financeCategories: initialFinanceCategories,
  goals: initialLearningGoals,
  notifications: initialNotifications,
  dismissedNotificationEventKeys: [],
  settings: initialSettings,
  projects: initialProjects,
  chat: initialChat,
  selectedFinanceMonth: getLocalMonthKey(),
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  // The current prototype has no backend authentication, so this flag only
  // represents access during this browser session.
  const [isAuthenticated, setIsAuthenticated] = useState(() => typeof window === "undefined" || readSessionStatus(window.sessionStorage) !== "logged-out");
  const [isHydrated, setIsHydrated] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [tasks, setTasks] = useState(initialTasks);
  const [taskCompletionHistory, setTaskCompletionHistory] = useState<TaskCompletionHistory[]>([]);
  const [now, setNow] = useState(() => new Date());
  const tasksRef = useRef(tasks);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [notifications, setNotifications] = useState(initialNotifications);
  const notificationsRef = useRef(notifications);
  const [dismissedNotificationEventKeys, setDismissedNotificationEventKeys] = useState<string[]>([]);
  const dismissedNotificationEventKeysRef = useRef(dismissedNotificationEventKeys);
  const applyingExternalStateRef = useRef(false);
  const tabIdRef = useRef(uid("tab"));
  const [chat, setChat] = useState(initialChat);
  const [projects, setProjects] = useState(initialProjects);
  const [settings, setSettings] = useState(initialSettings);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [goals, setGoals] = useState<LearningGoals>(initialLearningGoals);
  const [academicTerm, setAcademicTerm] = useState<AcademicTerm>(initialAcademicTerm);
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>(initialFinanceTransactions);
  const [savingGoals, setSavingGoals] = useState<SavingGoal[]>(initialSavingGoals);
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>(initialFinanceSettings);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>(initialFinanceCategories);
  const [exams, setExams] = useState<Exam[]>(initialExams);
  const [courseNotes, setCourseNotes] = useState<CourseNote[]>(initialCourseNotes);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(initialAttendanceRecords);
  const [gradePlans, setGradePlans] = useState<CourseGradePlan[]>(initialGradePlans);
  const [selectedFinanceMonth, setSelectedFinanceMonth] = useState(() => getLocalMonthKey());
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: PersistedAppState) => {
    setProfile(snapshot.profile);
    setAcademicTerm(snapshot.academicTerm);
    setSchedules(snapshot.schedules);
    setTasks(snapshot.tasks);
    setTaskCompletionHistory(snapshot.taskCompletionHistory);
    setExams(snapshot.exams);
    setGradePlans(snapshot.gradePlans);
    setCourseNotes(snapshot.courseNotes);
    setAttendanceRecords(snapshot.attendanceRecords);
    setFinanceTransactions(snapshot.financeTransactions);
    setSavingGoals(snapshot.savingGoals);
    setFinanceSettings(snapshot.financeSettings);
    setFinanceCategories(snapshot.financeCategories);
    setGoals(snapshot.goals);
    notificationsRef.current = snapshot.notifications;
    setNotifications(snapshot.notifications);
    dismissedNotificationEventKeysRef.current = snapshot.dismissedNotificationEventKeys;
    setDismissedNotificationEventKeys(snapshot.dismissedNotificationEventKeys);
    setSettings(snapshot.settings);
    setProjects(snapshot.projects);
    setChat(snapshot.chat);
    setSelectedFinanceMonth(snapshot.selectedFinanceMonth);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const result = readAppStateSnapshot(window.localStorage, defaultAppState);
      const expiredTasks = getExpiredCompletedTasks(result.state.tasks, new Date());
      const expiredIds = new Set(expiredTasks.map((task) => task.id));
      const hydratedState: PersistedAppState = expiredTasks.length ? {
        ...result.state,
        tasks: result.state.tasks.filter((task) => !expiredIds.has(task.id)),
        taskCompletionHistory: appendCompletionHistory(result.state.taskCompletionHistory, expiredTasks),
      } : result.state;
      cleanupTaskAttachments(expiredTasks);
      applySnapshot(hydratedState);
      setBrowserNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
      if (result.source !== "primary" && result.source !== "defaults" || result.warnings.length) {
        console.warn("[TALEVO] AppState recovery", { source: result.source, warnings: result.warnings });
      }
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [applySnapshot]);

  const persistableState = useMemo<AppStateDefaults>(() => ({
    profile,
    academicTerm,
    schedules,
    tasks,
    taskCompletionHistory,
    exams,
    gradePlans,
    courseNotes,
    attendanceRecords,
    financeTransactions,
    savingGoals,
    financeSettings,
    financeCategories,
    goals,
    notifications,
    dismissedNotificationEventKeys,
    settings,
    projects,
    chat,
    selectedFinanceMonth,
  }), [academicTerm, attendanceRecords, chat, courseNotes, dismissedNotificationEventKeys, exams, financeCategories, financeSettings, financeTransactions, goals, gradePlans, notifications, profile, projects, savingGoals, schedules, selectedFinanceMonth, settings, taskCompletionHistory, tasks]);

  useEffect(() => {
    if (!isHydrated) return;
    if (applyingExternalStateRef.current) {
      applyingExternalStateRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const snapshot = createAppStateSnapshot(persistableState, tabIdRef.current);
      writeAppStateSnapshot(window.localStorage, snapshot);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isHydrated, persistableState]);

  useEffect(() => {
    if (!isHydrated) return;
    const synchronizeFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== APP_STATE_STORAGE_KEY || !event.newValue) return;
      const snapshot = parseAppStateSnapshot(event.newValue, defaultAppState);
      if (!snapshot || snapshot.writerId === tabIdRef.current) return;
      applyingExternalStateRef.current = true;
      applySnapshot(snapshot);
    };
    window.addEventListener("storage", synchronizeFromAnotherTab);
    return () => window.removeEventListener("storage", synchronizeFromAnotherTab);
  }, [applySnapshot, isHydrated]);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { dismissedNotificationEventKeysRef.current = dismissedNotificationEventKeys; }, [dismissedNotificationEventKeys]);

  useEffect(() => {
    if (!isHydrated) return;
    const cleanupExpired = (currentTime: Date) => {
      const expiredTasks = getExpiredCompletedTasks(tasksRef.current, currentTime);
      if (!expiredTasks.length) return;
      const expiredIds = new Set(expiredTasks.map((task) => task.id));
      cleanupTaskAttachments(expiredTasks);
      setTaskCompletionHistory((current) => appendCompletionHistory(current, expiredTasks));
      setTasks((current) => current.filter((task) => !expiredIds.has(task.id)));
    };
    const tick = () => { const currentTime = new Date(); setNow(currentTime); cleanupExpired(currentTime); };
    tick();
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || !settings.notificationPreferences.enabled) return;
    const currentNotifications = notificationsRef.current;
    const generated = evaluateSmartAlerts({
      now,
      tasks,
      schedules,
      exams,
      profile,
      academicTerm,
      preferences: settings.notificationPreferences,
      language,
      existingEventKeys: new Set(currentNotifications.map((notification) => notification.eventKey)),
      dismissedEventKeys: new Set(dismissedNotificationEventKeysRef.current),
    });
    if (!generated.length) return;
    const nextNotifications = [...generated, ...currentNotifications];
    notificationsRef.current = nextNotifications;
    setNotifications(nextNotifications);
    if (settings.notificationPreferences.browserNotifications && browserNotificationPermission === "granted" && claimAlertDeliveryLeadership(window.localStorage, tabIdRef.current)) {
      deliverNewBrowserNotifications(generated);
    }
  }, [academicTerm, browserNotificationPermission, dismissedNotificationEventKeys, exams, isHydrated, language, now, profile, schedules, settings.notificationPreferences, tasks]);

  const value = useMemo<AppStateValue>(() => ({
    isAuthenticated,
    isHydrated,
    profile,
    tasks,
    tasksHydrated: isHydrated,
    taskCompletionHistory,
    now,
    schedules,
    notifications,
    exams,
    courseNotes,
    attendanceRecords,
    gradePlans,
    projects,
    chat,
    settings,
    browserNotificationPermission,
    goals,
    academicTerm,
    financeTransactions,
    savingGoals,
    financeSettings,
    financeCategories,
    selectedFinanceMonth,
    updateProfile: (next) => setProfile((current) => ({ ...current, ...next })),
    registerLocalAccount: (nextProfile, nextAcademicTerm) => {
      setProfile(nextProfile);
      setAcademicTerm(nextAcademicTerm);
      window.sessionStorage.setItem(TALEVO_SESSION_STORAGE_KEY, "authenticated");
      setIsAuthenticated(true);
      setSessionNotice(null);
    },
    setSelectedFinanceMonth,
    updateSettings: (next) => setSettings((current) => ({ ...current, ...next })),
    updateNotificationPreferences: (next) => setSettings((current) => ({ ...current, notificationPreferences: { ...current.notificationPreferences, ...next } })),
    setBrowserNotificationsEnabled: async (enabled) => {
      if (!enabled) {
        setSettings((current) => ({ ...current, notificationPreferences: { ...current.notificationPreferences, browserNotifications: false } }));
        return;
      }
      if (!("Notification" in window)) {
        setBrowserNotificationPermission("unsupported");
        return;
      }
      const permission = window.Notification.permission === "default" ? await window.Notification.requestPermission() : window.Notification.permission;
      setBrowserNotificationPermission(permission);
      setSettings((current) => ({ ...current, notificationPreferences: { ...current.notificationPreferences, browserNotifications: permission === "granted" } }));
    },
    updateGoals: (next) => setGoals((current) => ({ ...current, ...next })),
    updateAcademicTerm: (next) => setAcademicTerm(next),
    startSession: () => { window.sessionStorage.setItem(TALEVO_SESSION_STORAGE_KEY, "authenticated"); setIsAuthenticated(true); setSessionNotice(null); },
    endSession: () => { window.sessionStorage.setItem(TALEVO_SESSION_STORAGE_KEY, "logged-out"); setIsAuthenticated(false); setSessionNotice("ออกจากระบบจากอุปกรณ์นี้แล้ว"); },
    resetUserData: () => {
      void clearAttachmentBlobs().catch(() => undefined);
      clearAppStateStorage(window.localStorage);
      window.sessionStorage.setItem(TALEVO_SESSION_STORAGE_KEY, "logged-out");
      setIsAuthenticated(false);
      setProfile({ displayName: "", email: "", major: "", university: "" });
      setTasks([]);
      setTaskCompletionHistory([]);
      setSchedules([]);
      setNotifications([]);
      setDismissedNotificationEventKeys([]);
      setChat(initialChat);
      setProjects([]);
      setSettings(initialSettings);
      setGoals(initialLearningGoals);
      setAcademicTerm({ level: "", term: "", academicYear: "" });
      setFinanceTransactions([]);
      setSavingGoals([]);
      setFinanceSettings({ dailyBudget: 0 });
      setFinanceCategories(initialFinanceCategories.map((category) => ({ ...category, monthlyBudget: undefined })));
      setExams([]);
      setCourseNotes([]);
      setAttendanceRecords([]);
      setGradePlans([]);
      setSelectedFinanceMonth(getLocalMonthKey());
      setSessionNotice("ลบข้อมูล TALEVO ในอุปกรณ์นี้แล้ว");
    },
    sessionNotice,
    clearSessionNotice: () => setSessionNotice(null),
    addTask: (input, requestedId) => {
      const id = requestedId ?? uid("task");
      setTasks((current) => [{ ...input, id, color: normalizeTaskColor(input.color), dueLabel: "กำหนดใหม่", subtasks: input.subtasks ?? [], attachments: input.attachments ?? [], status: "todo" }, ...current]);
      return id;
    },
    updateTask: (id, input) => setTasks((current) => current.map((task) => task.id === id ? {
      ...task,
      ...input,
      color: normalizeTaskColor(input.color),
      title: input.title.trim(),
      description: input.description.trim(),
    } : task)),
    deleteTask: (id) => {
      const task = tasks.find((item) => item.id === id);
      if (task) cleanupTaskAttachments([task]);
      setTasks((current) => current.filter((item) => item.id !== id));
    },
    addTaskAttachments: (taskId, attachments) => setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, attachments: [...(task.attachments ?? []), ...attachments] }
      : task)),
    removeTaskAttachment: (taskId, attachmentId) => setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, attachments: (task.attachments ?? []).filter((attachment) => attachment.id !== attachmentId) }
      : task)),
    setTaskStatus: (id, status) => setTasks((current) => current.map((task) => {
      if (task.id !== id) return task;
      return { ...task, status, completedAt: undefined };
    })),
    completeTask: (id) => setTasks((current) => current.map((task) => {
      if (task.id !== id || task.status === "completed") return task;
      if ((task.subtasks?.length ?? 0) > 0 && task.subtasks?.some((item) => !item.completed)) return task;
      return { ...task, status: "completed", completedAt: new Date().toISOString() };
    })),
    toggleSubtask: (taskId, subtaskId) => setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      const subtasks = (task.subtasks ?? []).map((item) => item.id !== subtaskId ? item : { ...item, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : undefined });
      const completedCount = subtasks.filter((item) => item.completed).length;
      const status = completedCount > 0 ? "doing" : "todo";
      return { ...task, subtasks, status, completedAt: undefined };
    })),
    addTaskSubtask: (taskId, title) => setTasks((current) => current.map((task) => {
      if (task.id !== taskId || !title.trim()) return task;
      const subtasks = [...(task.subtasks ?? []), { id: uid("subtask"), title: title.trim(), completed: false }];
      return { ...task, subtasks, status: subtasks.some((item) => item.completed) ? "doing" : "todo", completedAt: undefined };
    })),
    updateTaskSubtask: (taskId, subtaskId, title) => setTasks((current) => current.map((task) => {
      if (task.id !== taskId || !title.trim()) return task;
      return { ...task, subtasks: (task.subtasks ?? []).map((item) => item.id === subtaskId ? { ...item, title: title.trim() } : item) };
    })),
    removeTaskSubtask: (taskId, subtaskId) => setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      const subtasks = (task.subtasks ?? []).filter((item) => item.id !== subtaskId);
      if (!subtasks.length) return { ...task, subtasks };
      const completedCount = subtasks.filter((item) => item.completed).length;
      const status = completedCount > 0 ? "doing" : "todo";
      return { ...task, subtasks, status, completedAt: undefined };
    })),
    addSchedule: (input) => {
      const id = uid("class");
      setSchedules((current) => {
        const matchingCourse = current.find((item) => item.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase());
        return [...current, { ...input, color: normalizeTalevoColor(input.color), id, courseId: matchingCourse?.courseId ?? uid("course") }];
      });
      return id;
    },
    updateSchedule: (id, input) => setSchedules((current) => {
      const previous = current.find((item) => item.id === id);
      if (!previous) return current;
      const name = input.name.trim();
      return current.map((item) => item.courseId === previous.courseId
        ? { ...item, ...(item.id === id ? input : {}), id: item.id, courseId: previous.courseId, name, color: normalizeTalevoColor(input.color) }
        : item);
    }),
    deleteSchedule: (id) => setSchedules((current) => current.filter((item) => item.id !== id)),
    markNotificationRead: (id) => setNotifications((current) => current.map((item) => item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item)),
    markAllNotificationsRead: () => setNotifications((current) => { const readAt = new Date().toISOString(); return current.map((item) => item.readAt ? item : { ...item, readAt }); }),
    deleteNotification: (id) => {
      const result = removeReadNotification(notifications, id, dismissedNotificationEventKeys);
      if (!result.removed) return;
      notificationsRef.current = result.notifications;
      dismissedNotificationEventKeysRef.current = result.dismissedEventKeys;
      setNotifications(result.notifications);
      setDismissedNotificationEventKeys(result.dismissedEventKeys);
    },
    deleteReadNotifications: () => {
      const result = removeAllReadNotifications(notifications, dismissedNotificationEventKeys);
      if (!result.removed) return;
      notificationsRef.current = result.notifications;
      dismissedNotificationEventKeysRef.current = result.dismissedEventKeys;
      setNotifications(result.notifications);
      setDismissedNotificationEventKeys(result.dismissedEventKeys);
    },
    sendChat: (content) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const response = buildLocalAIResponse({ content: trimmed, tasks, schedules, exams, now, language });
      setChat((current) => [
        ...current,
        { id: uid("chat-user"), role: "user", content: trimmed },
        { id: uid("chat-ai"), role: "assistant", content: response.content, kind: response.kind },
      ]);
    },
    addFinanceTransaction: (input) => {
      const id = uid("finance");
      setFinanceTransactions((current) => [{ ...input, id }, ...current]);
      return id;
    },
    updateFinanceTransaction: (id, input) => setFinanceTransactions((current) => current.map((item) => item.id === id ? { ...input, id } : item)),
    deleteFinanceTransaction: (id) => setFinanceTransactions((current) => current.filter((item) => item.id !== id)),
    addSavingGoal: (title, targetAmount) => setSavingGoals((current) => [...current, { id: uid("saving"), title: title.trim(), targetAmount, savedAmount: 0 }]),
    contributeToSavingGoal: (id, amount) => setSavingGoals((current) => current.map((item) => item.id === id ? { ...item, savedAmount: Math.min(item.targetAmount, item.savedAmount + amount) } : item)),
    updateFinanceSettings: (next) => setFinanceSettings((current) => ({ ...current, ...next, dailyBudget: Math.max(0, next.dailyBudget ?? current.dailyBudget) })),
    addFinanceCategory: (input) => { const id = uid("category"); setFinanceCategories((current) => [...current, { ...input, id, createdAt: new Date().toISOString() }]); return id; },
    updateFinanceCategory: (id, next) => {
      const currentCategory = financeCategories.find((item) => item.id === id);
      const nextName = next.name?.trim();
      if (currentCategory && nextName && nextName !== currentCategory.name) {
        setFinanceTransactions((current) => current.map((item) => item.category === currentCategory.name ? { ...item, category: nextName } : item));
      }
      setFinanceCategories((current) => current.map((item) => item.id === id ? { ...item, ...next, ...(nextName ? { name: nextName } : {}) } : item));
    },
    deleteFinanceCategory: (id) => {
      const category = financeCategories.find((item) => item.id === id);
      if (!category || category.isDefault || financeTransactions.some((item) => item.category === category.name)) return false;
      setFinanceCategories((current) => current.filter((item) => item.id !== id));
      return true;
    },
    addExam: (input) => { const id = uid("exam"); const now = new Date().toISOString(); setExams((current) => [...current, { ...input, id, topics: input.topics ?? [], createdAt: now, updatedAt: now }]); return id; },
    updateExam: (id, next) => setExams((current) => current.map((exam) => exam.id === id ? { ...exam, ...next, updatedAt: new Date().toISOString() } : exam)),
    deleteExam: (id) => setExams((current) => current.filter((exam) => exam.id !== id)),
    toggleExamTopic: (examId, topicId) => setExams((current) => current.map((exam) => exam.id !== examId ? exam : { ...exam, topics: exam.topics.map((topic) => topic.id !== topicId ? topic : { ...topic, completed: !topic.completed, completedAt: !topic.completed ? new Date().toISOString() : undefined }), updatedAt: new Date().toISOString() })),
    addCourseNote: (input) => { const id = uid("note"); const now = new Date().toISOString(); setCourseNotes((current) => [{ ...input, id, createdAt: now, updatedAt: now }, ...current]); return id; },
    updateCourseNote: (id, next) => setCourseNotes((current) => current.map((note) => note.id === id ? { ...note, ...next, updatedAt: new Date().toISOString() } : note)),
    deleteCourseNote: (id) => setCourseNotes((current) => current.filter((note) => note.id !== id)),
    toggleNotePinned: (id) => setCourseNotes((current) => current.map((note) => note.id === id ? { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() } : note)),
    addAttendance: (input) => { const duplicate = attendanceRecords.find((item) => item.courseId === input.courseId && item.date === input.date && item.startTime === input.startTime); if (duplicate) return null; const id = uid("attendance"); setAttendanceRecords((current) => [...current, { ...input, id, createdAt: new Date().toISOString() }]); return id; },
    updateAttendance: (id, next) => setAttendanceRecords((current) => current.map((record) => record.id === id ? { ...record, ...next, updatedAt: new Date().toISOString() } : record)),
    deleteAttendance: (id) => setAttendanceRecords((current) => current.filter((record) => record.id !== id)),
    upsertGradePlan: (courseId, next) => setGradePlans((current) => { const existing = current.find((plan) => plan.courseId === courseId); return existing ? current.map((plan) => plan.id === existing.id ? { ...plan, ...next } : plan) : [...current, { ...next, id: uid("grade"), courseId }]; }),
  }), [academicTerm, attendanceRecords, browserNotificationPermission, chat, courseNotes, dismissedNotificationEventKeys, exams, financeCategories, financeSettings, financeTransactions, goals, gradePlans, isAuthenticated, isHydrated, language, notifications, now, profile, projects, savingGoals, schedules, selectedFinanceMonth, sessionNotice, settings, taskCompletionHistory, tasks]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState ต้องใช้งานภายใน AppStateProvider");
  return value;
}
