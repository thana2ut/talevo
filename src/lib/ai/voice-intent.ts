export type VoiceAction = "create" | "update" | "delete";

const actionPatterns: ReadonlyArray<[VoiceAction, RegExp]> = [
  ["create", /(?:เพิ่ม|สร้าง|จด|บันทึก|ใส่เพิ่ม|ลง(?:ตาราง|รายการ))/u],
  ["update", /(?:แก้(?:ไข)?|เปลี่ยน|เลื่อน|ย้าย|อัปเดต|อัพเดต)/u],
  ["delete", /(?:ลบ|ยกเลิก|เอา.{0,20}ออก|นำ.{0,20}ออก)/u],
];

/** Conservative guard for mutation requests: detect explicit Thai action verbs. */
export function inferVoiceActions(command: string): VoiceAction[] {
  const normalized = command.normalize("NFKC").toLocaleLowerCase("th");
  return actionPatterns.flatMap(([action, pattern]) => pattern.test(normalized) ? [action] : []);
}
