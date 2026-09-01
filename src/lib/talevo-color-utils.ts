import type { SubjectColor } from "@/types";

export const defaultTalevoColor = "#7656F6";

/** One curated palette for every user-selectable academic color. */
export const TALEVO_COLOR_PRESETS = [
  { family: "purple", shades: ["#F1EDFF", "#DDD5FF", "#B9A7FF", "#7656F6", "#3F2A9C"] },
  { family: "violet", shades: ["#F5EEFF", "#E5D1FF", "#C89BFF", "#9257E9", "#57249B"] },
  { family: "indigo", shades: ["#EEF0FF", "#D5DAFF", "#A5B0FF", "#5865E8", "#30398D"] },
  { family: "blue", shades: ["#EAF3FF", "#CFE4FF", "#98C7FF", "#4389E8", "#1F4E9A"] },
  { family: "sky", shades: ["#E8F8FF", "#C8EDFF", "#83D8F7", "#239BC8", "#16607F"] },
  { family: "cyan", shades: ["#E6FBFB", "#C5F1F3", "#78DCE0", "#159BA5", "#0D5F67"] },
  { family: "teal", shades: ["#E7FAF5", "#C7F0E6", "#78D6C3", "#168B78", "#0B554A"] },
  { family: "green", shades: ["#ECFAEF", "#CEF0D5", "#8FD59D", "#299C57", "#146138"] },
  { family: "lime", shades: ["#F4FBE8", "#E0F2BD", "#B8D96B", "#6F9F22", "#425F12"] },
  { family: "yellow", shades: ["#FFFCE8", "#FFF2A8", "#F5D85A", "#C69A12", "#795B08"] },
  { family: "amber", shades: ["#FFF7E6", "#FFE7A6", "#F6BF58", "#D78014", "#854807"] },
  { family: "orange", shades: ["#FFF1E9", "#FFD6BC", "#FFAA70", "#E86D25", "#913A12"] },
  { family: "coral", shades: ["#FFF0EE", "#FFD2CB", "#F99B8E", "#DB5B4D", "#872D27"] },
  { family: "red", shades: ["#FFF0F1", "#FFD2D6", "#F68A94", "#D84355", "#861E32"] },
  { family: "pink", shades: ["#FFF0F8", "#FFD4E9", "#F39AC9", "#D95699", "#86275E"] },
] as const;

/**
 * The compact recommended palette shown in the shared course/task picker.
 * The full historical palette above remains intact so stored custom colours
 * are never restricted or remapped to this convenience set.
 */
export const TALEVO_RECOMMENDED_COLORS = [
  "#7656F6", "#8B5CF6", "#A855F7",
  "#3B82F6", "#0EA5E9", "#06B6D4",
  "#10B981", "#22C55E", "#65A30D",
  "#EAB308", "#F59E0B", "#F97316",
  "#EF4444", "#F43F5E", "#EC4899",
  "#4F46E5", "#0F766E", "#92400E",
] as const;

export const talevoPresetColors = TALEVO_RECOMMENDED_COLORS;

const legacyCourseColors: Record<SubjectColor, string> = {
  purple: "#7656F6", blue: "#5B8DEF", orange: "#F59E0B", yellow: "#EAB308",
  green: "#22A06B", cyan: "#19A7B8", pink: "#E668A7", magenta: "#B65CE6",
};

export function normalizeTalevoColor(value?: string): string {
  const source = value?.trim();
  if (!source) return defaultTalevoColor;
  if (source in legacyCourseColors) return legacyCourseColors[source as SubjectColor];
  const compact = source.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(compact)) return `#${compact.split("").map((part) => part + part).join("").toUpperCase()}`;
  if (/^[0-9a-f]{6}$/i.test(compact)) return `#${compact.toUpperCase()}`;
  return defaultTalevoColor;
}

/** Creates a safe, low-opacity surface from a selected course colour. */
export function hexToRgba(value: string | undefined, opacity: number): string {
  const color = normalizeTalevoColor(value).slice(1);
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const alpha = Math.min(1, Math.max(0, opacity));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function isValidTalevoHex(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export function getContrastTextColor(color: string): "#FFFFFF" | "#171225" {
  const hex = normalizeTalevoColor(color).slice(1);
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return darkContrast >= whiteContrast ? "#171225" : "#FFFFFF";
}
