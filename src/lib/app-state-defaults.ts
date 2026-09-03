import { getLocalMonthKey } from "@/lib/finance-utils";
import type { AppStateDefaults } from "@/lib/persistence/app-state-storage";
import type { AcademicTerm, UserProfile } from "@/types";

export const emptyProfile: UserProfile = {
  displayName: "",
  email: "",
  major: "",
  university: "",
};

export const emptyAcademicTerm: AcademicTerm = {
  level: "",
  term: "",
  academicYear: "",
};

/**
 * Production baseline for a brand-new account. Only product configuration is
 * initialized here; every user-owned collection starts empty.
 */
export function createEmptyAccountAppState(
  profile: UserProfile = emptyProfile,
  academicTerm: AcademicTerm = emptyAcademicTerm,
): AppStateDefaults {
  return {
    profile,
    academicTerm,
    schedules: [],
    tasks: [],
    taskCompletionHistory: [],
    exams: [],
    gradePlans: [],
    courseNotes: [],
    financeTransactions: [],
    savingGoals: [],
    financeSettings: { dailyBudget: 0 },
    financeCategories: [],
    goals: {
      weeklyStudyHours: 0,
      earlySubmissionDays: 0,
      examPreparationDays: 0,
      personalGoal: "",
    },
    notifications: [],
    dismissedNotificationEventKeys: [],
    settings: {
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
    },
    projects: [],
    chat: [],
    selectedFinanceMonth: getLocalMonthKey(),
  };
}
