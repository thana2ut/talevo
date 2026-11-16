import type { AppLanguage } from "@/lib/i18n";
import english from "@/lib/ui-translations.en.json";

const catalogue: Readonly<Record<string, string>> = english;
const patterns = Object.keys(catalogue).filter(key => /\{\d+\}/.test(key)).map(key => {
  const slots: number[] = [];
  const parts = key.split(/(\{\d+\})/g).map(part => {
    if (/^\{\d+\}$/.test(part)) { slots.push(Number(part.slice(1, -1))); return "([\\s\\S]*?)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return { expression: new RegExp(`^${parts.join("")}$`), slots, value: catalogue[key] };
});

/** Only app-authored UI strings should be passed here, never user record fields. */
export function translateUiText(language: AppLanguage, text: string, values: readonly unknown[] = []): string {
  if (!values.length && !/[ก-๙]/.test(text)) return text;
  const translated = language === "en" ? catalogue[text] ?? text : text;
  if (language === "en" && translated === text && !values.length) {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(text);
      if (!match) continue;
      const captured = new Map(pattern.slots.map((slot, index) => [slot, match[index + 1]]));
      return pattern.value.replace(/\{(\d+)\}/g, (token, index: string) => captured.get(Number(index)) ?? token);
    }
  }
  return translated.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)] ?? "") : match);
}
