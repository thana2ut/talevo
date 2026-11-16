"use client";

import { useCallback } from "react";
import { useLanguage } from "@/providers/language-provider";
import { translateUiText } from "@/lib/ui-language";

export function useUiText() {
  const { language } = useLanguage();
  const text = useCallback(<T,>(text: T, values?: readonly unknown[]): T => typeof text === "string" ? translateUiText(language, text, values) as T : text, [language]);
  return Object.assign(text, { language, locale: language === "en" ? "en-GB" : "th-TH" });
}
