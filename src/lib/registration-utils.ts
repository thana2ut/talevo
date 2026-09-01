import type { AcademicTerm, UserProfile } from "@/types";

export type RegistrationDraft = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  major: string;
  university: string;
  level: string;
  term: string;
  academicYear: string;
};

export type RegistrationField = keyof RegistrationDraft;
export type RegistrationValidationCode =
  | "displayName"
  | "email"
  | "password"
  | "confirmPassword"
  | "major"
  | "university"
  | "level"
  | "term"
  | "academicYear";

export type RegistrationValidationErrors = Partial<Record<RegistrationField, RegistrationValidationCode>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PROFILE_TEXT_LENGTH = 80;

export const initialRegistrationDraft: RegistrationDraft = {
  displayName: "",
  email: "",
  password: "",
  confirmPassword: "",
  major: "",
  university: "",
  level: "",
  term: "",
  academicYear: "",
};

export function validateRegistrationAccount(draft: RegistrationDraft): RegistrationValidationErrors {
  const errors: RegistrationValidationErrors = {};
  const displayName = draft.displayName.trim();
  if (displayName.length < 2 || displayName.length > MAX_PROFILE_TEXT_LENGTH) errors.displayName = "displayName";
  if (!EMAIL_PATTERN.test(draft.email.trim())) errors.email = "email";
  if (draft.password.length < 8) errors.password = "password";
  if (!draft.confirmPassword || draft.password !== draft.confirmPassword) errors.confirmPassword = "confirmPassword";
  return errors;
}

export function validateRegistrationEducation(draft: RegistrationDraft): RegistrationValidationErrors {
  const errors: RegistrationValidationErrors = {};
  if (!draft.major.trim() || draft.major.trim().length > MAX_PROFILE_TEXT_LENGTH) errors.major = "major";
  if (!draft.university.trim() || draft.university.trim().length > MAX_PROFILE_TEXT_LENGTH) errors.university = "university";
  if (!draft.level) errors.level = "level";
  if (!draft.term) errors.term = "term";
  if (!/^\d{4}$/.test(draft.academicYear)) errors.academicYear = "academicYear";
  return errors;
}

export function validateRegistration(draft: RegistrationDraft): RegistrationValidationErrors {
  return { ...validateRegistrationAccount(draft), ...validateRegistrationEducation(draft) };
}

export function registrationDataFromDraft(draft: RegistrationDraft): { profile: UserProfile; academicTerm: AcademicTerm } {
  return {
    profile: {
      displayName: draft.displayName.trim(),
      email: draft.email.trim(),
      major: draft.major.trim(),
      university: draft.university.trim(),
    },
    academicTerm: {
      level: draft.level,
      term: draft.term,
      academicYear: draft.academicYear,
    },
  };
}
