"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { type AppLanguage, translate } from "@/lib/i18n";
import {
  LEGACY_KERNOVA_LANGUAGE_STORAGE_KEY,
  TALEVO_LANGUAGE_CHANGE_EVENT,
  TALEVO_LANGUAGE_STORAGE_KEY,
} from "@/lib/talevo-storage-keys";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string, fallback?: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isAppLanguage(value: string | null): value is AppLanguage {
  return value === "th" || value === "en";
}

function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "th";
  const stored = window.localStorage.getItem(TALEVO_LANGUAGE_STORAGE_KEY);
  if (isAppLanguage(stored)) return stored;
  const legacy = window.localStorage.getItem(LEGACY_KERNOVA_LANGUAGE_STORAGE_KEY);
  if (!isAppLanguage(legacy)) return "th";
  try {
    window.localStorage.setItem(TALEVO_LANGUAGE_STORAGE_KEY, legacy);
  } catch {
    // Continue with the valid legacy preference if browser storage is unavailable.
  }
  return legacy;
}

function applyLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore<AppLanguage>(
    (notify) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === TALEVO_LANGUAGE_STORAGE_KEY) notify();
      };
      window.addEventListener("storage", handleStorage);
      window.addEventListener(TALEVO_LANGUAGE_CHANGE_EVENT, notify);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(TALEVO_LANGUAGE_CHANGE_EVENT, notify);
      };
    },
    getStoredLanguage,
    () => "th",
  );

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    window.localStorage.setItem(TALEVO_LANGUAGE_STORAGE_KEY, nextLanguage);
    applyLanguage(nextLanguage);
    window.dispatchEvent(new Event(TALEVO_LANGUAGE_CHANGE_EVENT));
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, fallback) => translate(language, key, fallback),
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
