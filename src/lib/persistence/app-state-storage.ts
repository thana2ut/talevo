import type {
  AcademicTerm,
  AppNotification,
  AppSettings,
  ChatMessage,
  ClassSchedule,
  CourseGradePlan,
  CourseNote,
  Exam,
  FinanceCategory,
  FinanceSettings,
  FinanceTransaction,
  LearningGoals,
  Project,
  SavingGoal,
  Task,
  TaskCompletionHistory,
  UserProfile,
} from "@/types";
import { normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { normalizeTaskColor } from "@/lib/task-color-utils";
import {
  LEGACY_KERNOVA_APP_STATE_BACKUP_KEY,
  LEGACY_KERNOVA_APP_STATE_KEY,
  TALEVO_APP_STATE_BACKUP_KEY,
  TALEVO_APP_STATE_KEY,
} from "@/lib/talevo-storage-keys";

export {
  LEGACY_KERNOVA_APP_STATE_BACKUP_KEY,
  LEGACY_KERNOVA_APP_STATE_KEY,
  TALEVO_APP_STATE_BACKUP_KEY,
  TALEVO_APP_STATE_KEY,
};

export const APP_STATE_STORAGE_KEY = TALEVO_APP_STATE_KEY;
export const APP_STATE_BACKUP_KEY = TALEVO_APP_STATE_BACKUP_KEY;
export const APP_STATE_CURRENT_VERSION = 8;
const MAX_DISMISSED_NOTIFICATION_EVENT_KEYS = 500;

export const LEGACY_KERNOVA_STORAGE_KEYS = {
  tasks: "kernova-tasks",
  taskCompletionHistory: "kernova-task-completion-history",
  gradePlans: "kernova-grade-plans",
  notifications: "kernova-notifications-v2",
  settings: "kernova-settings-v2",
} as const;

export interface PersistedAppState {
  version: number;
  savedAt: string;
  writerId?: string;
  profile: UserProfile;
  academicTerm: AcademicTerm;
  schedules: ClassSchedule[];
  tasks: Task[];
  taskCompletionHistory: TaskCompletionHistory[];
  exams: Exam[];
  gradePlans: CourseGradePlan[];
  courseNotes: CourseNote[];
  financeTransactions: FinanceTransaction[];
  savingGoals: SavingGoal[];
  financeSettings: FinanceSettings;
  financeCategories: FinanceCategory[];
  goals: LearningGoals;
  notifications: AppNotification[];
  dismissedNotificationEventKeys: string[];
  settings: AppSettings;
  projects: Project[];
  chat: ChatMessage[];
  selectedFinanceMonth: string;
}

export type AppStateDefaults = Omit<PersistedAppState, "version" | "savedAt" | "writerId">;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type AppStateReadResult = {
  state: PersistedAppState;
  source: "primary" | "backup" | "legacy-primary" | "legacy-backup" | "legacy-fragments" | "defaults";
  warnings: string[];
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const hasStringId = (value: unknown): value is UnknownRecord & { id: string } => isRecord(value) && isString(value.id) && value.id.length > 0;
const cloneArray = <T>(value: T[]) => value.map((item) => isRecord(item) ? { ...item } as T : item);

function safeJsonParse(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeArray<T>(value: unknown, fallback: T[], isValid: (item: unknown) => boolean): T[] {
  if (!Array.isArray(value)) return cloneArray(fallback);
  return value.filter(isValid).map((item) => ({ ...(item as T & UnknownRecord) }));
}

function normalizeProfile(value: unknown, fallback: UserProfile): UserProfile {
  if (!isRecord(value)) return { ...fallback };
  return {
    displayName: isString(value.displayName) ? value.displayName : fallback.displayName,
    email: isString(value.email) ? value.email : fallback.email,
    major: isString(value.major) ? value.major : fallback.major,
    university: isString(value.university) ? value.university : fallback.university,
  };
}

function normalizeAcademicTerm(value: unknown, fallback: AcademicTerm): AcademicTerm {
  if (!isRecord(value)) return { ...fallback };
  return {
    level: isString(value.level) ? value.level : fallback.level,
    term: isString(value.term) ? value.term : fallback.term,
    academicYear: isString(value.academicYear) ? value.academicYear : fallback.academicYear,
    ...(isString(value.label) ? { label: value.label } : {}),
  };
}

export function normalizeSchedules(value: unknown, fallback: ClassSchedule[]) {
  return normalizeArray<ClassSchedule>(value, fallback, (item) => hasStringId(item)
    && isString(item.courseId)
    && (isString(item.name) || isString(item.courseCode))
    && isFiniteNumber(item.day)
    && item.day >= 0
    && item.day <= 6
    && isString(item.startTime)
    && isString(item.endTime))
    .map((schedule) => ({
      ...schedule,
      name: isString(schedule.name) ? schedule.name : "",
      ...(isString(schedule.courseCode) ? { courseCode: schedule.courseCode } : {}),
      ...(isString(schedule.section) ? { section: schedule.section } : {}),
      ...(isFiniteNumber(schedule.credits) ? { credits: schedule.credits } : {}),
      color: normalizeTalevoColor(schedule.color),
    }));
}

function normalizeTasks(value: unknown, fallback: Task[]) {
  return normalizeArray<Task>(value, fallback, (item) => hasStringId(item)
    && isString(item.title)
    && isString(item.dueDate)
    && isString(item.status))
    .map((task) => ({
      ...task,
      color: normalizeTaskColor(task.color),
      subtasks: Array.isArray(task.subtasks)
        ? task.subtasks.filter((item) => hasStringId(item) && isString(item.title)).map((item) => ({ ...item }))
        : [],
      attachments: Array.isArray(task.attachments)
        ? task.attachments.filter((item) => hasStringId(item) && isString(item.name)).map((item) => ({ ...item }))
        : [],
    }));
}

function normalizeExams(value: unknown, fallback: Exam[]) {
  return normalizeArray<Exam>(value, fallback, (item) => hasStringId(item)
    && isString(item.courseId)
    && isString(item.title)
    && isString(item.startAt)
    && isString(item.type))
    .map((exam) => ({
      ...exam,
      topics: Array.isArray(exam.topics)
        ? exam.topics.filter((item) => hasStringId(item) && isString(item.title)).map((item) => ({ ...item }))
        : [],
    }));
}

function normalizeSettings(value: unknown, fallback: AppSettings): AppSettings {
  if (!isRecord(value)) return { ...fallback, notificationPreferences: { ...fallback.notificationPreferences } };
  const preferences = isRecord(value.notificationPreferences) ? value.notificationPreferences : {};
  const supportedPreferences = { ...preferences };
  delete supportedPreferences.submissionReminders;
  return {
    ...fallback,
    ...value,
    timezone: "Asia/Bangkok",
    notificationPreferences: {
      ...fallback.notificationPreferences,
      ...supportedPreferences,
    },
  } as AppSettings;
}

function normalizeFinanceSettings(value: unknown, fallback: FinanceSettings): FinanceSettings {
  if (!isRecord(value) || !isFiniteNumber(value.dailyBudget)) return { ...fallback };
  return { ...fallback, dailyBudget: Math.max(0, value.dailyBudget) };
}

function normalizeGoals(value: unknown, fallback: LearningGoals): LearningGoals {
  if (!isRecord(value)) return { ...fallback };
  return {
    weeklyStudyHours: isFiniteNumber(value.weeklyStudyHours) ? Math.max(0, value.weeklyStudyHours) : fallback.weeklyStudyHours,
    earlySubmissionDays: isFiniteNumber(value.earlySubmissionDays) ? Math.max(0, value.earlySubmissionDays) : fallback.earlySubmissionDays,
    examPreparationDays: isFiniteNumber(value.examPreparationDays) ? Math.max(0, value.examPreparationDays) : fallback.examPreparationDays,
    personalGoal: isString(value.personalGoal) ? value.personalGoal : fallback.personalGoal,
  };
}

function normalizeDismissedNotificationEventKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => isString(item) && item.length > 0))]
    .slice(-MAX_DISMISSED_NOTIFICATION_EVENT_KEYS);
}

function normalizeNotificationCopy(notification: AppNotification): AppNotification {
  const rebrand = (copy: string | undefined) => copy?.replace(/kernova/gi, "TALEVO");
  return {
    ...notification,
    ...(notification.title ? { title: rebrand(notification.title) } : {}),
    message: rebrand(notification.message) ?? notification.message,
  };
}

function normalizeAssistantChatCopy(message: ChatMessage): ChatMessage {
  return message.role === "assistant"
    ? { ...message, content: message.content.replace(/kernova/gi, "TALEVO") }
    : message;
}

/**
 * Migrates structural versions without deleting unknown recoverable sections.
 * Version 1 represents the first consolidated snapshot/legacy import, version 2
 * introduced nested settings, version 3 added Academic GPS state, version 5 removes it,
 * version 6 added task submission tracking, version 7 retained dismissed alert
 * event keys, and version 8 removes the retired submission-tracking feature.
 */
export function migratePersistedState(rawState: unknown): UnknownRecord | null {
  if (!isRecord(rawState)) return null;
  let state: UnknownRecord = { ...rawState };
  let version = isFiniteNumber(state.version) ? state.version : 1;
  if (version > APP_STATE_CURRENT_VERSION || version < 1) return null;

  if (version === 1) {
    const settings = isRecord(state.settings) ? state.settings : {};
    const legacyPreferences = isRecord(state.notificationPreferences) ? state.notificationPreferences : undefined;
    state = {
      ...state,
      settings: legacyPreferences && !isRecord(settings.notificationPreferences)
        ? { ...settings, notificationPreferences: legacyPreferences }
        : settings,
      version: 2,
    };
    version = 2;
  }

  if (version === 2) {
    state = { ...state, version: 3 };
    version = 3;
  }
  if (version === 3) {
    state = { ...state, studyBlocks: [], academicRoute: null, version: 4 };
    version = 4;
  }
  if (version === 4) {
    delete state.studyBlocks;
    delete state.academicRoute;
    state = { ...state, version: 5 };
    version = 5;
  }
  if (version === 5) {
    state = { ...state, version: 6 };
    version = 6;
  }
  if (version === 6) {
    state = { ...state, dismissedNotificationEventKeys: normalizeDismissedNotificationEventKeys(state.dismissedNotificationEventKeys), version: 7 };
    version = 7;
  }
  if (version === 7) {
    const tasks = Array.isArray(state.tasks) ? state.tasks.map((item) => {
      if (!isRecord(item)) return item;
      const task = { ...item };
      delete task.requiresSubmission;
      delete task.submittedAt;
      delete task.submissionNote;
      delete task.submissionEvidenceAttachmentIds;
      return task;
    }) : state.tasks;
    const settings = isRecord(state.settings) ? { ...state.settings } : state.settings;
    if (isRecord(settings) && isRecord(settings.notificationPreferences)) {
      const notificationPreferences = { ...settings.notificationPreferences };
      delete notificationPreferences.submissionReminders;
      settings.notificationPreferences = notificationPreferences;
    }
    state = {
      ...state,
      tasks,
      settings,
      notifications: Array.isArray(state.notifications)
        ? state.notifications.filter((item) => !isRecord(item) || (item.type !== "task_submission_pending" && !(isString(item.eventKey) && item.eventKey.startsWith("task-submission-"))))
        : state.notifications,
      dismissedNotificationEventKeys: Array.isArray(state.dismissedNotificationEventKeys)
        ? state.dismissedNotificationEventKeys.filter((item) => !isString(item) || !item.startsWith("task-submission-"))
        : state.dismissedNotificationEventKeys,
      version: 8,
    };
  }

  return state;
}

export function normalizePersistedState(rawState: unknown, defaults: AppStateDefaults): PersistedAppState | null {
  const migrated = migratePersistedState(rawState);
  if (!migrated) return null;
  return {
    version: APP_STATE_CURRENT_VERSION,
    savedAt: isString(migrated.savedAt) ? migrated.savedAt : "",
    ...(isString(migrated.writerId) ? { writerId: migrated.writerId } : {}),
    profile: normalizeProfile(migrated.profile, defaults.profile),
    academicTerm: normalizeAcademicTerm(migrated.academicTerm, defaults.academicTerm),
    schedules: normalizeSchedules(migrated.schedules, defaults.schedules),
    tasks: normalizeTasks(migrated.tasks, defaults.tasks),
    taskCompletionHistory: normalizeArray<TaskCompletionHistory>(migrated.taskCompletionHistory, defaults.taskCompletionHistory, (item) => hasStringId(item) && isString(item.originalTaskId) && isString(item.completedAt)),
    exams: [],
    gradePlans: [],
    courseNotes: normalizeArray<CourseNote>(migrated.courseNotes, defaults.courseNotes, (item) => hasStringId(item) && isString(item.courseId) && isString(item.title)),
    financeTransactions: [],
    savingGoals: [],
    financeSettings: defaults.financeSettings,
    financeCategories: [],
    goals: normalizeGoals(migrated.goals, defaults.goals),
    notifications: normalizeArray<AppNotification>(migrated.notifications, defaults.notifications, (item) => hasStringId(item) && isString(item.eventKey) && isString(item.createdAt) && isString(item.message)).filter((item) => !item.eventKey.startsWith("task-submission-")).map(normalizeNotificationCopy),
    dismissedNotificationEventKeys: normalizeDismissedNotificationEventKeys(migrated.dismissedNotificationEventKeys).filter((item) => !item.startsWith("task-submission-")),
    settings: normalizeSettings(migrated.settings, defaults.settings),
    projects: normalizeArray<Project>(migrated.projects, defaults.projects, (item) => hasStringId(item) && isString(item.title)),
    chat: normalizeArray<ChatMessage>(migrated.chat, defaults.chat, (item) => hasStringId(item) && (item.role === "assistant" || item.role === "user") && isString(item.content)).map(normalizeAssistantChatCopy),
    selectedFinanceMonth: isString(migrated.selectedFinanceMonth) ? migrated.selectedFinanceMonth : defaults.selectedFinanceMonth,
  };
}

function readLegacyState(storage: StorageLike, defaults: AppStateDefaults): PersistedAppState | null {
  const legacyValues = Object.fromEntries(Object.entries(LEGACY_KERNOVA_STORAGE_KEYS).map(([field, key]) => [field, safeJsonParse(storage.getItem(key))]));
  if (Object.values(legacyValues).every((value) => value === undefined)) return null;
  return normalizePersistedState({
    version: 1,
    ...defaults,
    ...legacyValues,
  }, defaults);
}

function persistLegacySnapshotAsTalevo(storage: StorageLike, state: PersistedAppState, warnings: string[]) {
  const serialized = JSON.stringify(state);
  try {
    // Backup is written first so a failed primary write never removes the recoverable copy.
    storage.setItem(TALEVO_APP_STATE_BACKUP_KEY, serialized);
    storage.setItem(TALEVO_APP_STATE_KEY, serialized);
    if (storage.getItem(TALEVO_APP_STATE_KEY) !== serialized || storage.getItem(TALEVO_APP_STATE_BACKUP_KEY) !== serialized) {
      warnings.push("legacy_key_migration_verification_failed");
    }
  } catch {
    // The in-memory state remains usable and legacy keys stay untouched for retry on refresh.
    warnings.push("legacy_key_migration_write_failed");
  }
}

export function readAppStateSnapshot(storage: StorageLike, defaults: AppStateDefaults): AppStateReadResult {
  const warnings: string[] = [];
  const primaryRaw = storage.getItem(APP_STATE_STORAGE_KEY);
  if (primaryRaw !== null) {
    const primary = normalizePersistedState(safeJsonParse(primaryRaw), defaults);
    if (primary) return { state: primary, source: "primary", warnings };
    warnings.push("primary_snapshot_invalid");
  }

  const backupRaw = storage.getItem(APP_STATE_BACKUP_KEY);
  if (backupRaw !== null) {
    const backup = normalizePersistedState(safeJsonParse(backupRaw), defaults);
    if (backup) return { state: backup, source: "backup", warnings };
    warnings.push("backup_snapshot_invalid");
  }

  const legacyPrimaryRaw = storage.getItem(LEGACY_KERNOVA_APP_STATE_KEY);
  if (legacyPrimaryRaw !== null) {
    const legacyPrimary = normalizePersistedState(safeJsonParse(legacyPrimaryRaw), defaults);
    if (legacyPrimary) {
      persistLegacySnapshotAsTalevo(storage, legacyPrimary, warnings);
      return { state: legacyPrimary, source: "legacy-primary", warnings };
    }
    warnings.push("legacy_primary_snapshot_invalid");
  }

  const legacyBackupRaw = storage.getItem(LEGACY_KERNOVA_APP_STATE_BACKUP_KEY);
  if (legacyBackupRaw !== null) {
    const legacyBackup = normalizePersistedState(safeJsonParse(legacyBackupRaw), defaults);
    if (legacyBackup) {
      persistLegacySnapshotAsTalevo(storage, legacyBackup, warnings);
      return { state: legacyBackup, source: "legacy-backup", warnings };
    }
    warnings.push("legacy_backup_snapshot_invalid");
  }

  const legacy = readLegacyState(storage, defaults);
  if (legacy) {
    persistLegacySnapshotAsTalevo(storage, legacy, warnings);
    return { state: legacy, source: "legacy-fragments", warnings };
  }

  const initial = normalizePersistedState({ version: APP_STATE_CURRENT_VERSION, ...defaults }, defaults);
  if (!initial) throw new Error("TALEVO default AppState is invalid");
  return { state: initial, source: "defaults", warnings };
}

export function parseAppStateSnapshot(serialized: string, defaults: AppStateDefaults) {
  return normalizePersistedState(safeJsonParse(serialized), defaults);
}

export function createAppStateSnapshot(state: AppStateDefaults, writerId: string, now = new Date()): PersistedAppState {
  const normalized = normalizePersistedState({
    ...state,
    version: APP_STATE_CURRENT_VERSION,
    savedAt: now.toISOString(),
    writerId,
  }, state);
  if (!normalized) throw new Error("Unable to create TALEVO AppState snapshot");
  return normalized;
}

export function writeAppStateSnapshot(storage: StorageLike, snapshot: PersistedAppState) {
  const previous = storage.getItem(APP_STATE_STORAGE_KEY);
  if (previous !== null && normalizePersistedState(safeJsonParse(previous), snapshot)) {
    storage.setItem(APP_STATE_BACKUP_KEY, previous);
  }
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearLegacyAppState(storage: StorageLike) {
  storage.removeItem(LEGACY_KERNOVA_APP_STATE_KEY);
  storage.removeItem(LEGACY_KERNOVA_APP_STATE_BACKUP_KEY);
  Object.values(LEGACY_KERNOVA_STORAGE_KEYS).forEach((key) => storage.removeItem(key));
}

export function clearAppStateStorage(storage: StorageLike) {
  storage.removeItem(APP_STATE_STORAGE_KEY);
  storage.removeItem(APP_STATE_BACKUP_KEY);
  clearLegacyAppState(storage);
}
