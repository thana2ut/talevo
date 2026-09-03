import { normalizeThaiDigits } from "@/lib/academic-time";

export function normalizeTimetableText(value: string) {
  return normalizeThaiDigits(value)
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBreakLabel(value: string) {
  const text = normalizeTimetableText(value).toLowerCase();
  return /^(?:พัก|พักกลางวัน|พักรับประทานอาหาร|พักรับประทานอาหารกลางวัน|พักเที่ยง|break|lunch|lunch\s*break)$/iu.test(text);
}

export function isNonCourseActivityLabel(value: string) {
  const text = normalizeTimetableText(value).toLowerCase();
  if (isBreakLabel(text)) return true;
  return /^(?:เข้าแถว|เข้าแถวเคารพธงชาติ|เคารพธงชาติ|กิจกรรมหน้าเสาธง|หน้าเสาธง|โฮมรูม|กิจกรรมโฮมรูม|homeroom|flag\s*ceremony|morning\s*assembly|assembly|กิจกรรมพัฒนาผู้เรียน|กิจกรรมแนะแนว|แนะแนว|ชุมนุม|ลูกเสือ|เนตรนารี|ยุวกาชาด|บำเพ็ญประโยชน์|สวดมนต์|อบรม|ประชุม|club|scout|guidance)$/iu.test(text);
}

