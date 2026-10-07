"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createEmptyAccountAppState } from "@/lib/app-state-defaults";
import { buildLocalAIResponse } from "@/lib/local-ai";
import type { AIContextSelection } from "@/lib/ai/types";
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
  CourseGradePlan,
  NewExamInput,
  TaskAttachment,
  TaskCompletionHistory,
} from "@/types";
import { getLocalMonthKey, toLocalDateKey } from "@/lib/finance-utils";
import { normalizeTaskColor } from "@/lib/task-color-utils";
import { getDeterministicCourseColor, normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { deleteAttachmentBlob } from "@/lib/task-attachment-storage";
import type { SyllabusImportPayload } from "@/lib/syllabus-import";
import { createTaskCompletionHistory, getExpiredCompletedTasks } from "@/lib/task-retention";
import { evaluateSmartAlerts } from "@/lib/alerts/alert-engine";
import { removeAllReadNotifications, removeReadNotification } from "@/lib/alerts/notification-deletion";
import { claimAlertDeliveryLeadership, deliverBrowserNotificationTest, deliverNewBrowserNotifications } from "@/lib/alerts/notification-delivery";
import {
  createAppStateSnapshot,
  parseAppStateSnapshot,
  readAppStateSnapshot,
  writeAppStateSnapshot,
  type AppStateDefaults,
  type PersistedAppState,
} from "@/lib/persistence/app-state-storage";
import {
  bindCanonicalStateToAccount,
  clearAccountStateStorage,
  createAccountStateStorage,
  getAccountStateKeys,
  recordLocalOwnershipDecision,
  type LocalOwnershipStatus,
} from "@/lib/persistence/local-account-storage";
import { createClient } from "@/lib/supabase/client";
import { loadCloudAccountV8 } from "@/lib/supabase/cloud-v8-repository";
import { hydrateCloudAccountToAppState } from "@/lib/supabase/cloud-hydration";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistClassSchedule,
  persistClassSchedulesBatch,
  deleteClassSchedule,
  persistTask,
  deleteTask as deleteTaskFromCloud,
  persistExam,
  deleteExam as deleteExamFromCloud,
  persistGradePlan,
  persistFinanceTransaction,
  deleteFinanceTransaction as deleteFinanceTransactionFromCloud,
  persistProfile,
  persistAcademicTerm,
  persistDailyBudget,
} from "@/lib/supabase/cloud-mutations";
import { useLanguage } from "@/providers/language-provider";
import { useAuth } from "@/providers/auth-provider";
import type { NotificationPreferences } from "@/types";

interface AppStateValue {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isHydrated: boolean;
  localOwnershipStatus: LocalOwnershipStatus;
  createMigrationSnapshot: () => PersistedAppState;
  refreshCurrentAccountFromStorage: () => PersistedAppState | null;
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
  registerLocalAccount: (profile: UserProfile, academicTerm: AcademicTerm, userId: string) => void;
  adoptExistingLocalData: () => void;
  startFreshLocalData: () => void;
  setSelectedFinanceMonth: (monthKey: string) => void;
  updateSettings: (value: Partial<AppSettings>) => void;
  updateNotificationPreferences: (value: Partial<NotificationPreferences>) => void;
  setBrowserNotificationsEnabled: (enabled: boolean) => Promise<void>;
  updateGoals: (value: Partial<LearningGoals>) => void;
  updateAcademicTerm: (value: AcademicTerm) => void;
  endSession: () => Promise<string | null>;
  deleteUserAccount: () => Promise<string | null>;
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
  importSyllabus: (payload: SyllabusImportPayload) => { schedules: number; tasks: number; exams: number };
  updateSchedule: (id: string, value: NewClassInput) => void;
  deleteSchedule: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  deleteReadNotifications: () => void;
  sendChat: (content: string, selectedContext?: AIContextSelection) => void;
  appendChatMessages: (messages: ChatMessage[]) => void;
  addFinanceTransaction: (value: NewFinanceTransactionInput) => string;
  updateFinanceTransaction: (id: string, value: NewFinanceTransactionInput) => void;
  deleteFinanceTransaction: (id: string) => void;
  setTodaySpent: (amount: number, referenceDate?: Date) => void;
  addSavingGoal: (title: string, targetAmount: number) => void;
  contributeToSavingGoal: (id: string, amount: number) => void;
  updateFinanceSettings: (value: Partial<FinanceSettings>) => void;
  addFinanceCategory: (value: Omit<FinanceCategory, "id">) => string;
  updateFinanceCategory: (id: string, value: Partial<Omit<FinanceCategory, "id">>) => void;
  deleteFinanceCategory: (id: string) => boolean;
  courseNotes: CourseNote[];
  gradePlans: CourseGradePlan[];
  addExam: (value: NewExamInput) => string;
  updateExam: (id: string, value: Partial<NewExamInput>) => void;
  deleteExam: (id: string) => void;
  toggleExamTopic: (examId: string, topicId: string) => void;
  addCourseNote: (value: NewCourseNoteInput) => string;
  updateCourseNote: (id: string, value: Partial<NewCourseNoteInput>) => void;
  deleteCourseNote: (id: string) => void;
  toggleNotePinned: (id: string) => void;
  upsertGradePlan: (courseId: string, value: Omit<CourseGradePlan, "id" | "courseId">) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

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

const defaultAppState = createEmptyAccountAppState();

function getMetadataText(metadata: Record<string, unknown>, key: string, maxLength: number) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createAccountDefaults(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  return createEmptyAccountAppState({
    displayName: getMetadataText(metadata, "display_name", 80),
    email: user.email?.trim() ?? "",
    major: getMetadataText(metadata, "major", 80),
    university: getMetadataText(metadata, "university", 80),
  }, {
    level: getMetadataText(metadata, "level", 60),
    term: getMetadataText(metadata, "term", 60),
    academicYear: /^\d{4}$/.test(getMetadataText(metadata, "academic_year", 4))
      ? getMetadataText(metadata, "academic_year", 4)
      : "",
  });
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const { deleteAccount, isAuthenticated, isLoading: isAuthLoading, signOut, user } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userMetadata = user?.user_metadata;
  const accountDefaults = useMemo(
    () => createAccountDefaults({ email: userEmail, user_metadata: userMetadata }),
    [userEmail, userMetadata],
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const [localOwnershipStatus, setLocalOwnershipStatus] = useState<LocalOwnershipStatus>("checking");
  const activeStorageRef = useRef<ReturnType<typeof createAccountStateStorage> | null>(null);
  const [profile, setProfile] = useState(defaultAppState.profile);
  const [tasks, setTasks] = useState(defaultAppState.tasks);
  const [taskCompletionHistory, setTaskCompletionHistory] = useState<TaskCompletionHistory[]>([]);
  const [now, setNow] = useState(() => new Date());
  const tasksRef = useRef(tasks);
  const [schedules, setSchedules] = useState(defaultAppState.schedules);
  const [notifications, setNotifications] = useState(defaultAppState.notifications);
  const notificationsRef = useRef(notifications);
  const [dismissedNotificationEventKeys, setDismissedNotificationEventKeys] = useState<string[]>([]);
  const dismissedNotificationEventKeysRef = useRef(dismissedNotificationEventKeys);
  const applyingExternalStateRef = useRef(false);
  const tabIdRef = useRef(uid("tab"));
  const [chat, setChat] = useState(defaultAppState.chat);
  const [projects, setProjects] = useState(defaultAppState.projects);
  const [settings, setSettings] = useState(defaultAppState.settings);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [goals, setGoals] = useState<LearningGoals>(defaultAppState.goals);
  const [academicTerm, setAcademicTerm] = useState<AcademicTerm>(defaultAppState.academicTerm);
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>(defaultAppState.financeTransactions);
  const [savingGoals, setSavingGoals] = useState<SavingGoal[]>(defaultAppState.savingGoals);
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>(defaultAppState.financeSettings);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>(defaultAppState.financeCategories);
  const [exams, setExams] = useState<Exam[]>(defaultAppState.exams);
  const [courseNotes, setCourseNotes] = useState<CourseNote[]>(defaultAppState.courseNotes);
  const [gradePlans, setGradePlans] = useState<CourseGradePlan[]>(defaultAppState.gradePlans);
  const [selectedFinanceMonth, setSelectedFinanceMonth] = useState(() => getLocalMonthKey());
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const pendingCloudMutationsRef = useRef<Set<Promise<unknown>>>(new Set());

  const runCloudMutation = useCallback((mutationFn: (client: SupabaseClient, uid: string) => Promise<{ error: Error | null }>) => {
    if (!userId) return;
    const currentUid = userId;
    const client = createClient();
    const promise = (async () => {
      try {
        const { error } = await mutationFn(client, currentUid);
        if (error) {
          console.warn("[TALEVO] Cloud persistence warning:", error.message);
          setSessionNotice("บันทึกข้อมูลไปยังระบบคลาวด์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต");
        }
      } catch (err) {
        console.warn("[TALEVO] Cloud persistence error:", err);
        setSessionNotice("บันทึกข้อมูลไปยังระบบคลาวด์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต");
      }
    })();
    pendingCloudMutationsRef.current.add(promise);
    promise.finally(() => {
      pendingCloudMutationsRef.current.delete(promise);
    });
  }, [userId]);

  const applySnapshot = useCallback((snapshot: PersistedAppState) => {
    setProfile(snapshot.profile);
    setAcademicTerm(snapshot.academicTerm);
    setSchedules(snapshot.schedules);
    setTasks(snapshot.tasks);
    setTaskCompletionHistory(snapshot.taskCompletionHistory);
    setExams(snapshot.exams);
    setGradePlans(snapshot.gradePlans);
    setCourseNotes(snapshot.courseNotes);
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

  const authScope = userId ?? "anonymous";
  const isCurrentScopeHydrated = isHydrated && hydratedScope === authScope;

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;

    const initialize = async () => {
      if (!userId) {
        activeStorageRef.current = null;
        applySnapshot(createAppStateSnapshot(defaultAppState, tabIdRef.current));
        setLocalOwnershipStatus("ready");
        setHydratedScope("anonymous");
        setIsHydrated(true);
        return;
      }

      setLocalOwnershipStatus("ready");
      const accountStorage = createAccountStateStorage(window.localStorage, userId);
      activeStorageRef.current = accountStorage;

      let hydratedState: PersistedAppState | null = null;

      try {
        const supabase = createClient();
        const cloudResult = await loadCloudAccountV8(supabase);
        if (cancelled) return;

        if (cloudResult.status === "loaded") {
          hydratedState = hydrateCloudAccountToAppState(cloudResult.tables, {
            email: userEmail ?? "",
            defaults: accountDefaults,
            writerId: tabIdRef.current,
          });
          writeAppStateSnapshot(accountStorage, hydratedState);
        } else if (cloudResult.status === "empty") {
          const cloudProfile = cloudResult.tables.profiles?.[0];
          const cloudAcademic = cloudResult.tables.academic_terms?.[0];
          const initialProfile = cloudProfile ? {
            displayName: typeof cloudProfile.display_name === "string" ? cloudProfile.display_name : accountDefaults.profile.displayName,
            email: userEmail ?? accountDefaults.profile.email,
            major: typeof cloudProfile.major === "string" ? cloudProfile.major : accountDefaults.profile.major,
            university: typeof cloudProfile.university === "string" ? cloudProfile.university : accountDefaults.profile.university,
          } : accountDefaults.profile;
          const initialAcademic = cloudAcademic ? {
            level: typeof cloudAcademic.level === "string" ? cloudAcademic.level : accountDefaults.academicTerm.level,
            term: typeof cloudAcademic.term === "string" ? cloudAcademic.term : accountDefaults.academicTerm.term,
            academicYear: typeof cloudAcademic.academic_year === "string" ? cloudAcademic.academic_year : accountDefaults.academicTerm.academicYear,
          } : accountDefaults.academicTerm;

          const freshDefaults: AppStateDefaults = {
            ...accountDefaults,
            profile: initialProfile,
            academicTerm: initialAcademic,
          };
          hydratedState = createAppStateSnapshot(freshDefaults, tabIdRef.current);
          writeAppStateSnapshot(accountStorage, hydratedState);
        }
      } catch (err) {
        console.warn("[TALEVO] Supabase cloud load error, falling back to user-scoped storage", err);
      }

      if (cancelled) return;

      if (!hydratedState) {
        // Fallback exclusively to the user's OWN account storage (never global unscoped storage)
        const result = readAppStateSnapshot(accountStorage, accountDefaults);
        hydratedState = result.state;
      }

      const expiredTasks = getExpiredCompletedTasks(hydratedState.tasks, new Date());
      const expiredIds = new Set(expiredTasks.map((task) => task.id));
      const finalState: PersistedAppState = expiredTasks.length ? {
        ...hydratedState,
        tasks: hydratedState.tasks.filter((task) => !expiredIds.has(task.id)),
        taskCompletionHistory: appendCompletionHistory(hydratedState.taskCompletionHistory, expiredTasks),
      } : hydratedState;

      cleanupTaskAttachments(expiredTasks);
      applySnapshot(finalState);
      setBrowserNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
      setLocalOwnershipStatus("ready");
      setHydratedScope(userId);
      setIsHydrated(true);
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [accountDefaults, applySnapshot, isAuthLoading, userEmail, userId]);

  const persistableState = useMemo<AppStateDefaults>(() => ({
    profile,
    academicTerm,
    schedules,
    tasks,
    taskCompletionHistory,
    exams,
    gradePlans,
    courseNotes,
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
  }), [academicTerm, chat, courseNotes, dismissedNotificationEventKeys, exams, financeCategories, financeSettings, financeTransactions, goals, gradePlans, notifications, profile, projects, savingGoals, schedules, selectedFinanceMonth, settings, taskCompletionHistory, tasks]);

  useEffect(() => {
    if (!isCurrentScopeHydrated) return;
    if (applyingExternalStateRef.current) {
      applyingExternalStateRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const snapshot = createAppStateSnapshot(persistableState, tabIdRef.current);
      if (!activeStorageRef.current || localOwnershipStatus !== "ready") return;
      writeAppStateSnapshot(activeStorageRef.current, snapshot);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isCurrentScopeHydrated, localOwnershipStatus, persistableState]);

  useEffect(() => {
    if (!isCurrentScopeHydrated) return;
    const synchronizeFromAnotherTab = (event: StorageEvent) => {
      if (!userId || event.key !== getAccountStateKeys(userId).primary || !event.newValue) return;
      const snapshot = parseAppStateSnapshot(event.newValue, accountDefaults);
      if (!snapshot || snapshot.writerId === tabIdRef.current) return;
      applyingExternalStateRef.current = true;
      applySnapshot(snapshot);
    };
    window.addEventListener("storage", synchronizeFromAnotherTab);
    return () => window.removeEventListener("storage", synchronizeFromAnotherTab);
  }, [accountDefaults, applySnapshot, isCurrentScopeHydrated, userId]);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { dismissedNotificationEventKeysRef.current = dismissedNotificationEventKeys; }, [dismissedNotificationEventKeys]);

  useEffect(() => {
    if (!isCurrentScopeHydrated) return;
    const cleanupExpired = (currentTime: Date) => {
      const expiredTasks = getExpiredCompletedTasks(tasksRef.current, currentTime);
      if (!expiredTasks.length) return;
      const expiredIds = new Set(expiredTasks.map((task) => task.id));
      cleanupTaskAttachments(expiredTasks);
      setTaskCompletionHistory((current) => appendCompletionHistory(current, expiredTasks));
      setTasks((current) => current.filter((task) => !expiredIds.has(task.id)));
    };
    const tick = () => { const currentTime = new Date(); setNow(currentTime); cleanupExpired(currentTime); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    tick();
    const interval = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isCurrentScopeHydrated]);

  useEffect(() => {
    if (!isCurrentScopeHydrated || !settings.notificationPreferences.enabled) return;
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
      void deliverNewBrowserNotifications(generated);
    }
  }, [academicTerm, browserNotificationPermission, dismissedNotificationEventKeys, exams, isCurrentScopeHydrated, language, now, profile, schedules, settings.notificationPreferences, tasks]);

  const adoptExistingLocalData = useCallback(() => {
    if (!userId) return;
    const canonical = readAppStateSnapshot(window.localStorage, accountDefaults);
    bindCanonicalStateToAccount(window.localStorage, userId);
    const accountStorage = createAccountStateStorage(window.localStorage, userId);
    writeAppStateSnapshot(accountStorage, canonical.state);
    activeStorageRef.current = accountStorage;
    applySnapshot(canonical.state);
    setLocalOwnershipStatus("ready");
    setHydratedScope(userId);
    setIsHydrated(true);
  }, [accountDefaults, applySnapshot, userId]);

  const startFreshLocalData = useCallback(() => {
    if (!userId) return;
    const accountStorage = createAccountStateStorage(window.localStorage, userId);
    const snapshot = createAppStateSnapshot(accountDefaults, tabIdRef.current);
    writeAppStateSnapshot(accountStorage, snapshot);
    recordLocalOwnershipDecision(window.localStorage, userId, "fresh");
    activeStorageRef.current = accountStorage;
    applySnapshot(snapshot);
    setLocalOwnershipStatus("ready");
    setHydratedScope(userId);
    setIsHydrated(true);
  }, [accountDefaults, applySnapshot, userId]);

  const refreshCurrentAccountFromStorage = useCallback(() => {
    if (!userId) return null;
    const accountStorage = createAccountStateStorage(window.localStorage, userId);
    const result = readAppStateSnapshot(accountStorage, accountDefaults);
    activeStorageRef.current = accountStorage;
    applyingExternalStateRef.current = true;
    applySnapshot(result.state);
    setLocalOwnershipStatus("ready");
    setHydratedScope(userId);
    setIsHydrated(true);
    return result.state;
  }, [accountDefaults, applySnapshot, userId]);

  const value = useMemo<AppStateValue>(() => ({
    isAuthenticated,
    isAuthLoading,
    isHydrated: isCurrentScopeHydrated,
    localOwnershipStatus,
    createMigrationSnapshot: () => createAppStateSnapshot(persistableState, tabIdRef.current),
    refreshCurrentAccountFromStorage,
    profile,
    tasks,
    tasksHydrated: isCurrentScopeHydrated,
    taskCompletionHistory,
    now,
    schedules,
    notifications,
    exams,
    courseNotes,
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
    updateProfile: (next) => {
      setProfile((current) => {
        const updated = { ...current, ...next };
        runCloudMutation((client, uid) => persistProfile(client, uid, updated));
        return updated;
      });
    },
    registerLocalAccount: (nextProfile, nextAcademicTerm, nextUserId) => {
      const accountStorage = createAccountStateStorage(window.localStorage, nextUserId);
      const snapshot = createAppStateSnapshot({
        ...defaultAppState,
        profile: nextProfile,
        academicTerm: nextAcademicTerm,
      }, tabIdRef.current);
      writeAppStateSnapshot(accountStorage, snapshot);
      if (userId === nextUserId) {
        activeStorageRef.current = accountStorage;
        applySnapshot(snapshot);
        setLocalOwnershipStatus("ready");
        setHydratedScope(nextUserId);
        setIsHydrated(true);
      }
      setSessionNotice(null);
    },
    adoptExistingLocalData,
    startFreshLocalData,
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
      let permission: NotificationPermission;
      try {
        permission = window.Notification.permission === "default" ? await window.Notification.requestPermission() : window.Notification.permission;
      } catch {
        permission = window.Notification.permission;
      }
      setBrowserNotificationPermission(permission);
      setSettings((current) => ({ ...current, notificationPreferences: { ...current.notificationPreferences, browserNotifications: permission === "granted" } }));
      if (permission === "granted") await deliverBrowserNotificationTest(language);
    },
    updateGoals: (next) => setGoals((current) => ({ ...current, ...next })),
    updateAcademicTerm: (next) => {
      setAcademicTerm((current) => {
        const updated = { ...current, ...next };
        runCloudMutation((client, uid) => persistAcademicTerm(client, uid, updated));
        return updated;
      });
    },
    endSession: async () => {
      if (pendingCloudMutationsRef.current.size > 0) {
        await Promise.race([
          Promise.allSettled(Array.from(pendingCloudMutationsRef.current)),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
      const result = await signOut();
      if (result.error) return result.error;
      setSessionNotice("ออกจากระบบจากอุปกรณ์นี้แล้ว");
      return null;
    },
    deleteUserAccount: async () => {
      const currentUserId = userId;
      if (!currentUserId) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
      const attachmentIds = tasks.flatMap((task) => task.attachments?.map((attachment) => attachment.id) ?? []);
      const result = await deleteAccount();
      if (result.error) return result.error;
      await Promise.allSettled(attachmentIds.map((id) => deleteAttachmentBlob(id)));
      clearAccountStateStorage(window.localStorage, currentUserId);
      activeStorageRef.current = null;
      applySnapshot(createAppStateSnapshot(defaultAppState, tabIdRef.current));
      setLocalOwnershipStatus("ready");
      setHydratedScope("anonymous");
      setSessionNotice("ลบบัญชีและข้อมูลของบัญชีนี้ออกจากอุปกรณ์แล้ว");
      return null;
    },
    sessionNotice,
    clearSessionNotice: () => setSessionNotice(null),
    addTask: (input, requestedId) => {
      const id = requestedId ?? uid("task");
      const newTask: Task = { ...input, id, color: normalizeTaskColor(input.color), dueLabel: "กำหนดใหม่", subtasks: input.subtasks ?? [], attachments: input.attachments ?? [], status: "todo" };
      setTasks((current) => [newTask, ...current]);
      runCloudMutation((client, uid) => persistTask(client, uid, newTask));
      return id;
    },
    updateTask: (id, input) => {
      let updatedTask: Task | null = null;
      setTasks((current) => current.map((task) => {
        if (task.id !== id) return task;
        const nextTask: Task = {
          ...task,
          ...input,
          color: normalizeTaskColor(input.color),
          title: input.title.trim(),
          description: input.description.trim(),
        };
        updatedTask = nextTask;
        return nextTask;
      }));
      if (updatedTask) {
        const t = updatedTask;
        runCloudMutation((client, uid) => persistTask(client, uid, t));
      }
    },
    deleteTask: (id) => {
      const task = tasks.find((item) => item.id === id);
      if (task) cleanupTaskAttachments([task]);
      setTasks((current) => current.filter((item) => item.id !== id));
      runCloudMutation((client, uid) => deleteTaskFromCloud(client, uid, id));
    },
    addTaskAttachments: (taskId, attachments) => setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, attachments: [...(task.attachments ?? []), ...attachments] }
      : task)),
    removeTaskAttachment: (taskId, attachmentId) => setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, attachments: (task.attachments ?? []).filter((attachment) => attachment.id !== attachmentId) }
      : task)),
    setTaskStatus: (id, status) => setTasks((current) => {
      let updatedTask: Task | null = null;
      const nextList = current.map((task) => {
        if (task.id !== id) return task;
        const nextTask = { ...task, status, completedAt: undefined };
        updatedTask = nextTask;
        return nextTask;
      });
      if (updatedTask) {
        const t = updatedTask;
        runCloudMutation((client, uid) => persistTask(client, uid, t));
      }
      return nextList;
    }),
    completeTask: (id) => setTasks((current) => {
      let updatedTask: Task | null = null;
      const nextList = current.map((task) => {
        if (task.id !== id || task.status === "completed") return task;
        if ((task.subtasks?.length ?? 0) > 0 && task.subtasks?.some((item) => !item.completed)) return task;
        const nextTask = { ...task, status: "completed" as const, completedAt: new Date().toISOString() };
        updatedTask = nextTask;
        return nextTask;
      });
      if (updatedTask) {
        const t = updatedTask;
        runCloudMutation((client, uid) => persistTask(client, uid, t));
      }
      return nextList;
    }),
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
      let createdSchedule: ClassSchedule | null = null;
      setSchedules((current) => {
        const matchingCourse = current.find(
          (item) => (Boolean(input.courseCode) && item.courseCode === input.courseCode) ||
            item.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
        );
        const courseId = matchingCourse?.courseId ?? uid("course");
        const color = matchingCourse?.color
          ? normalizeTalevoColor(matchingCourse.color)
          : normalizeTalevoColor(input.color || getDeterministicCourseColor(input.courseCode || courseId || input.name));
        const newSchedule: ClassSchedule = { ...input, color, id, courseId };
        createdSchedule = newSchedule;
        return [...current, newSchedule];
      });
      if (createdSchedule) {
        const sched = createdSchedule;
        runCloudMutation((client, uid) => persistClassSchedule(client, uid, sched));
      }
      return id;
    },
    importSyllabus: (payload) => {
      let importedSchedulesCount = 0;
      let importedSchedulesList: ClassSchedule[] = [];
      setSchedules((current) => {
        const imported = payload.schedules.map((input) => {
          const matchingCourse = current.find(
            (item) => item.courseId === input.courseId ||
              Boolean(input.courseCode && item.courseCode === input.courseCode) ||
              Boolean(input.name.trim() && item.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase())
          );
          const color = matchingCourse?.color
            ? normalizeTalevoColor(matchingCourse.color)
            : normalizeTalevoColor(input.color || getDeterministicCourseColor(input.courseCode || input.courseId || input.name));
          return {
            ...input,
            id: uid("class"),
            color,
          };
        });
        importedSchedulesCount = imported.length;
        importedSchedulesList = imported;
        return [...current, ...imported];
      });
      const importedTasks: Task[] = payload.tasks.map((input) => ({ ...input, id: uid("task"), color: normalizeTaskColor(input.color), dueLabel: "กำหนดใหม่", subtasks: input.subtasks ?? [], attachments: input.attachments ?? [], status: "todo" as const }));
      const importedExams: Exam[] = payload.exams.map((input) => { const timestamp = new Date().toISOString(); return { ...input, id: uid("exam"), topics: input.topics ?? [], createdAt: timestamp, updatedAt: timestamp }; });
      // React batches these state updates from one confirmed user action; persistence observes one complete snapshot.
      setTasks((current) => [...importedTasks, ...current]);
      setExams((current) => [...current, ...importedExams]);

      runCloudMutation(async (client, uid) => {
        if (importedSchedulesList.length > 0) {
          await persistClassSchedulesBatch(client, uid, importedSchedulesList);
        }
        for (const task of importedTasks) {
          await persistTask(client, uid, task);
        }
        for (const exam of importedExams) {
          await persistExam(client, uid, exam);
        }
        return { error: null };
      });

      return { schedules: importedSchedulesCount, tasks: importedTasks.length, exams: importedExams.length };
    },
    updateSchedule: (id, input) => {
      let updatedSchedules: ClassSchedule[] = [];
      setSchedules((current) => {
        const previous = current.find((item) => item.id === id);
        if (!previous) return current;
        const name = input.name.trim();
        const courseCode = input.courseCode !== undefined ? (input.courseCode.trim() || undefined) : previous.courseCode;
        const section = input.section !== undefined ? (input.section.trim() || undefined) : previous.section;
        const credits = input.credits !== undefined ? input.credits : previous.credits;
        const nextList = current.map((item) => item.courseId === previous.courseId
          ? {
              ...item,
              ...(item.id === id ? input : {}),
              id: item.id,
              courseId: previous.courseId,
              courseCode: item.id === id ? courseCode : (item.courseCode ?? courseCode),
              section: item.id === id ? section : (item.section ?? section),
              credits: item.id === id ? credits : (item.credits ?? credits),
              name,
              color: normalizeTalevoColor(input.color),
            }
          : item);
        updatedSchedules = nextList.filter((item) => item.courseId === previous.courseId);
        return nextList;
      });
      if (updatedSchedules.length > 0) {
        const list = updatedSchedules;
        runCloudMutation((client, uid) => persistClassSchedulesBatch(client, uid, list));
      }
    },
    deleteSchedule: (id) => {
      setSchedules((current) => current.filter((item) => item.id !== id));
      runCloudMutation((client, uid) => deleteClassSchedule(client, uid, id));
    },
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
    sendChat: (content, selectedContext) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const response = buildLocalAIResponse({
        content: trimmed,
        tasks,
        schedules,
        exams,
        now,
        language,
        selectedContext,
      });
      setChat((current) => [
        ...current,
        { id: uid("chat-user"), role: "user", content: trimmed },
        { id: uid("chat-ai"), role: "assistant", content: response.content, kind: response.kind },
      ]);
    },
    appendChatMessages: (messages) => {
      const safeMessages = messages.filter((message) => message.content.trim());
      if (!safeMessages.length) return;
      setChat((current) => [...current, ...safeMessages]);
    },
    addFinanceTransaction: (input) => {
      const id = uid("finance");
      const newTx: FinanceTransaction = { ...input, id };
      setFinanceTransactions((current) => [newTx, ...current]);
      const matchingCategory = financeCategories.find((cat) => cat.name.trim().toLowerCase() === input.category.trim().toLowerCase());
      runCloudMutation((client, uid) => persistFinanceTransaction(client, uid, newTx, matchingCategory?.id ?? null));
      return id;
    },
    updateFinanceTransaction: (id, input) => {
      const updatedTx: FinanceTransaction = { ...input, id };
      setFinanceTransactions((current) => current.map((item) => item.id === id ? updatedTx : item));
      const matchingCategory = financeCategories.find((cat) => cat.name.trim().toLowerCase() === input.category.trim().toLowerCase());
      runCloudMutation((client, uid) => persistFinanceTransaction(client, uid, updatedTx, matchingCategory?.id ?? null));
    },
    deleteFinanceTransaction: (id) => {
      setFinanceTransactions((current) => current.filter((item) => item.id !== id));
      runCloudMutation((client, uid) => deleteFinanceTransactionFromCloud(client, uid, id));
    },
    setTodaySpent: (amount, referenceDate) => {
      const targetDate = referenceDate ?? new Date();
      const dateKey = toLocalDateKey(targetDate);
      const safeAmount = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));
      const todayExpenses = financeTransactions.filter((tx) => tx.date === dateKey && tx.type === "expense");
      const dailyTx = todayExpenses.find((tx) => tx.note === "ใช้จ่ายประจำวัน") ?? todayExpenses[0];

      if (!dailyTx) {
        if (safeAmount > 0) {
          const id = uid("finance");
          const newTx: FinanceTransaction = {
            id,
            type: "expense",
            title: "ค่าใช้จ่ายวันนี้",
            amount: safeAmount,
            category: "ทั่วไป",
            note: "ใช้จ่ายประจำวัน",
            date: dateKey,
          };
          setFinanceTransactions((current) => [newTx, ...current]);
          runCloudMutation((client, uid) => persistFinanceTransaction(client, uid, newTx, null));
        }
        return;
      }

      const otherExpensesTotal = todayExpenses
        .filter((tx) => tx.id !== dailyTx.id)
        .reduce((sum, tx) => sum + tx.amount, 0);
      const neededForDaily = Math.max(0, safeAmount - otherExpensesTotal);

      if (neededForDaily === 0 && otherExpensesTotal >= safeAmount && dailyTx.note === "ใช้จ่ายประจำวัน") {
        setFinanceTransactions((current) => current.filter((item) => item.id !== dailyTx.id));
        runCloudMutation((client, uid) => deleteFinanceTransactionFromCloud(client, uid, dailyTx.id));
      } else {
        const updatedTx: FinanceTransaction = {
          ...dailyTx,
          amount: neededForDaily,
        };
        setFinanceTransactions((current) => current.map((item) => item.id === dailyTx.id ? updatedTx : item));
        const matchingCategory = financeCategories.find((cat) => cat.name.trim().toLowerCase() === dailyTx.category.trim().toLowerCase());
        runCloudMutation((client, uid) => persistFinanceTransaction(client, uid, updatedTx, matchingCategory?.id ?? null));
      }
    },
    addSavingGoal: (title, targetAmount) => setSavingGoals((current) => [...current, { id: uid("saving"), title: title.trim(), targetAmount, savedAmount: 0 }]),
    contributeToSavingGoal: (id, amount) => setSavingGoals((current) => current.map((item) => item.id === id ? { ...item, savedAmount: Math.min(item.targetAmount, item.savedAmount + amount) } : item)),
    updateFinanceSettings: (next) => {
      let updatedBudget = 0;
      setFinanceSettings((current) => {
        const updated = {
          ...current,
          ...next,
          dailyBudget: Math.max(0, next.dailyBudget ?? current.dailyBudget),
        };
        updatedBudget = updated.dailyBudget;
        return updated;
      });
      runCloudMutation((client, uid) =>
        persistDailyBudget(client, uid, updatedBudget, selectedFinanceMonth)
      );
    },
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
    addExam: (input) => {
      const id = uid("exam");
      const now = new Date().toISOString();
      const newExam: Exam = { ...input, id, topics: input.topics ?? [], createdAt: now, updatedAt: now };
      setExams((current) => [...current, newExam]);
      runCloudMutation((client, uid) => persistExam(client, uid, newExam));
      return id;
    },
    updateExam: (id, next) => {
      let updatedExam: Exam | null = null;
      setExams((current) => current.map((exam) => {
        if (exam.id !== id) return exam;
        const nextExam: Exam = { ...exam, ...next, updatedAt: new Date().toISOString() };
        updatedExam = nextExam;
        return nextExam;
      }));
      if (updatedExam) {
        const ex = updatedExam;
        runCloudMutation((client, uid) => persistExam(client, uid, ex));
      }
    },
    deleteExam: (id) => {
      setExams((current) => current.filter((exam) => exam.id !== id));
      runCloudMutation((client, uid) => deleteExamFromCloud(client, uid, id));
    },
    toggleExamTopic: (examId, topicId) => {
      let updatedExam: Exam | null = null;
      setExams((current) => current.map((exam) => {
        if (exam.id !== examId) return exam;
        const nextExam: Exam = {
          ...exam,
          topics: exam.topics.map((topic) => topic.id !== topicId ? topic : { ...topic, completed: !topic.completed, completedAt: !topic.completed ? new Date().toISOString() : undefined }),
          updatedAt: new Date().toISOString(),
        };
        updatedExam = nextExam;
        return nextExam;
      }));
      if (updatedExam) {
        const ex = updatedExam;
        runCloudMutation((client, uid) => persistExam(client, uid, ex));
      }
    },
    addCourseNote: (input) => { const id = uid("note"); const now = new Date().toISOString(); setCourseNotes((current) => [{ ...input, id, createdAt: now, updatedAt: now }, ...current]); return id; },
    updateCourseNote: (id, next) => setCourseNotes((current) => current.map((note) => note.id === id ? { ...note, ...next, updatedAt: new Date().toISOString() } : note)),
    deleteCourseNote: (id) => setCourseNotes((current) => current.filter((note) => note.id !== id)),
    toggleNotePinned: (id) => setCourseNotes((current) => current.map((note) => note.id === id ? { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() } : note)),
    upsertGradePlan: (courseId, next) => {
      let targetPlan: CourseGradePlan | null = null;
      setGradePlans((current) => {
        const existing = current.find((plan) => plan.courseId === courseId);
        if (existing) {
          const updated = { ...existing, ...next };
          targetPlan = updated;
          return current.map((plan) => plan.id === existing.id ? updated : plan);
        }
        const created: CourseGradePlan = { ...next, id: uid("grade"), courseId };
        targetPlan = created;
        return [...current, created];
      });
      if (targetPlan) {
        const gp = targetPlan;
        runCloudMutation((client, uid) => persistGradePlan(client, uid, gp));
      }
    },
  }), [academicTerm, adoptExistingLocalData, applySnapshot, browserNotificationPermission, chat, courseNotes, deleteAccount, dismissedNotificationEventKeys, exams, financeCategories, financeSettings, financeTransactions, goals, gradePlans, isAuthenticated, isAuthLoading, isCurrentScopeHydrated, language, localOwnershipStatus, notifications, now, persistableState, profile, projects, refreshCurrentAccountFromStorage, runCloudMutation, savingGoals, schedules, selectedFinanceMonth, sessionNotice, settings, signOut, startFreshLocalData, taskCompletionHistory, tasks, userId]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState ต้องใช้งานภายใน AppStateProvider");
  return value;
}
