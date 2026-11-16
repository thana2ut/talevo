export type VoiceAction = "create" | "update" | "delete";

const actionPatterns: ReadonlyArray<[VoiceAction, RegExp]> = [
  ["create", /(?:เพิ่ม|สร้าง|จด|บันทึก|ใส่เพิ่ม|ลง(?:ตาราง|รายการ)|ตั้ง(?:งาน|การบ้าน|สอบ|ตารางเรียน)|นัดสอบ|\b(?:add|create|record)\b)/u],
  ["update", /(?:แก้(?:ไข)?|เปลี่ยน|เลื่อน|ย้าย|อัปเดต|อัพเดต|ปรับ(?:เวลา|วัน|กำหนดส่ง|ชื่อ|ห้อง)|\b(?:update|change|reschedule)\b)/u],
  ["delete", /(?:ลบ|ยกเลิก|เอา.{0,20}ออก|นำ.{0,20}ออก|\b(?:delete|remove|cancel)\b)/u],
];

/** Conservative guard for mutation requests: detect explicit Thai action verbs. */
export function inferVoiceActions(command: string): VoiceAction[] {
  const normalized = command.normalize("NFKC").toLocaleLowerCase("th");
  return actionPatterns.flatMap(([action, pattern]) => pattern.test(normalized) ? [action] : []);
}


type VoiceCourseSlot = { id: string; course_id?: string; name: string; day: number; start_time: string };
type TaskVoiceHints = { title?: string; course?: { course_name: string; course_id?: string }; question?: string };

/** Ground explicit task names and class references before asking the model. */
export function getTaskVoiceHints(command: string, slots: VoiceCourseSlot[]): TaskVoiceHints {
  const normalized = command.normalize("NFKC");
  if (!/(?:เพิ่ม|สร้าง|จด|บันทึก|ตั้ง)\s*(?:งาน|การบ้าน)|ชื่องาน/u.test(normalized)) return {};
  const hints: TaskVoiceHints = {};
  const named = (normalized.match(/ชื่องาน(?:ว่า|คือ)?\s*(.+)/u) ?? normalized.match(/งานชื่อ(?:ว่า|คือ)?\s*(.+)/u))?.[1];
  const quoted = named?.match(/^[“"'](.+?)[”"']/u)?.[1];
  const title = (quoted ?? named?.match(/^(.+?)(?=\s*(?:กำหนดส่ง|ส่ง\s*(?:วัน|พรุ่งนี้|มะรืน|วันนี้|วันที่|ภายใน|เวลา|ก่อน))|\s+(?:รายวิชา|วิชา)|(?:ใน|ของ)(?:คาบ|รายวิชา|วิชา)|$)/u)?.[1])?.trim();
  if (title && title.length <= 200) hints.title = title;
  // Require a class/subject reference so a deadline weekday is never used as a class day.
  const reference = normalized.match(/(?:รายวิชา|วิชา|คาบเรียน|คาบ)(?:ที่เรียน)?\s*(?:ของ|ใน)?\s*(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)\s*(?:(?:(?:ตอน|ช่วง|ในช่วง)\s*)?(เช้า|บ่าย|เย็น))?/u);
  if (!reference) return hints;
  const days: Record<string, number> = { จันทร์: 0, อังคาร: 1, พุธ: 2, พฤหัสบดี: 3, พฤหัส: 3, ศุกร์: 4, เสาร์: 5, อาทิตย์: 6 };
  const day = days[reference[1]];
  const period = reference[2];
  const matches = slots.filter(slot => {
    if (slot.day !== day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start_time)) return false;
    const hour = Number(slot.start_time.slice(0, 2));
    return !period || (period === "เช้า" ? hour < 12 : period === "บ่าย" ? hour >= 12 && hour < 17 : hour >= 17);
  });
  const unique = [...new Map(matches.map(slot => [slot.course_id || slot.name, slot])).values()];
  if (unique.length === 1) {
    hints.course = { course_name: unique[0].name, ...(unique[0].course_id ? { course_id: unique[0].course_id } : {}) };
  } else {
    const when = `วัน${reference[1]}${period ? `ตอน${period}` : ""}`;
    hints.question = unique.length
      ? `${when}มีหลายวิชา: ${unique.slice(0, 4).map(slot => slot.name).join(" / ")} ต้องการเพิ่มงานในวิชาไหนครับ?`
      : `ไม่พบคาบ${when}ในภาคเรียนปัจจุบัน งานนี้เป็นของวิชาไหนครับ?`;
  }
  return hints;
}
