/** Pure, shared validation. Never infer a missing year from today's date. */
export const VISION_FIELDS = ["title", "courseName", "courseCode", "lesson", "description", "dueDate", "dueTime", "postedAt", "points", "status", "url", "attachments"] as const;
export type VisionField = typeof VISION_FIELDS[number];
export type VisionKind = "task" | "exam" | "announcement" | "material" | "review";
export type VisionStatus = "pending" | "submitted" | "overdue" | "unknown";
export type Evidence = { imageId: string; imageNumber: number; text: string };
export type Fact = { value: string | null; evidence: Evidence[] };
export type VisionItem = { id: string; kind: VisionKind; facts: Record<VisionField, Fact>; sources: string[]; issues: string[]; conflicts: VisionField[]; selected: boolean; reviewed: boolean; courseId: string; choice: "create" | "skip" | "update"; targetId: string };
export const kindLabels: Record<VisionKind, string> = { task: "งานที่ต้องส่ง", exam: "การสอบ", announcement: "ประกาศ", material: "เอกสาร / สื่อ", review: "ต้องตรวจสอบ" };
export const statusLabels: Record<VisionStatus, string> = { pending: "ยังไม่ได้ส่ง", submitted: "ส่งแล้ว", overdue: "เลยกำหนดและยังไม่ส่ง", unknown: "ไม่ทราบสถานะ" };
export const fieldLabels: Record<VisionField, string> = { title: "ชื่อรายการ", courseName: "ชื่อวิชา", courseCode: "รหัสวิชา", lesson: "บทเรียน", description: "รายละเอียด", dueDate: "วันที่กำหนดส่ง / สอบ", dueTime: "เวลากำหนดส่ง / สอบ", postedAt: "โพสต์เมื่อ", points: "คะแนน", status: "สถานะ", url: "ลิงก์", attachments: "ไฟล์แนบที่ปรากฏ" };
export function normalizeText(s: string) { return s.normalize("NFKC").toLocaleLowerCase("th").replace(/[\s\p{P}\p{S}]+/gu, ""); }
const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function confirmedDate(value: string | null, chosenYear?: string): string | null {
  if (!value) return null;
  const western = value.replace(/[๐-๙]/g, n => String(n.charCodeAt(0) - 3664));
  let year: number, month: number, day: number;
  const iso = western.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) [, year, month, day] = iso.map(Number);
  else {
    const monthNames = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const englishMonths = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const numeric = western.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (numeric) return confirmedDate(`${numeric[3]}-${numeric[2].padStart(2,"0")}-${numeric[1].padStart(2,"0")}`);
    const monthIndex = months.findIndex((m,index) => western.includes(m)||western.includes(monthNames[index])||new RegExp(`\\b${englishMonths[index]}\\b|\\b${englishMonths[index].slice(0,3)}\\b`,"i").test(western));
    if (monthIndex < 0) return null;
    const withoutMonth = western.replace(months[monthIndex], " ");
    const numbers = withoutMonth.match(/\d+/g)?.map(Number) ?? [];
    const explicitYear = numbers.find(n => n >= 1900);
    const selectedYear = chosenYear && /^\d{4}$/.test(chosenYear) ? Number(chosenYear) : undefined;
    if (!explicitYear && !selectedYear) return null;
    year = explicitYear ?? selectedYear!; month = monthIndex + 1;
    day = numbers.find(n => n >= 1 && n <= 31) ?? 0;
  }
  if (year >= 2400) year -= 543;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}` : null;
}
export function confirmedTime(value: string | null) {
  const match = value?.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s*น\.?|$)/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}
export function dueTimestamp(item: VisionItem) {
  const date = confirmedDate(item.facts.dueDate.value); const time = confirmedTime(item.facts.dueTime.value);
  return date && time ? `${date}T${time}:00+07:00` : null;
}
export function safeLink(value: string | null) { try { const u = new URL(value ?? ""); return u.protocol === "https:" ? u.href : null; } catch { return null; } }
function obj(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function normalizeBatchExtraction(value: unknown, sources: { id: string; number: number }[]): VisionItem[] {
  const root = obj(value);
  if (!Array.isArray(root.images) || !Array.isArray(root.items) || root.items.length > 80) throw new Error("อ่านตัวอักษรในภาพไม่ได้ กรุณาใช้ภาพชัดเจนหรือแบ่งชุดใหม่");
  const texts = new Map<string, string>();
  for (const input of root.images) {
    const row = obj(input);
    if (sources.some(s => s.id === row.imageId) && typeof row.rawText === "string") texts.set(String(row.imageId), row.rawText.slice(0, 50000));
  }
  if (texts.size !== sources.length || ![...texts.values()].some(text => text.trim())) throw new Error("อ่านตัวอักษรในภาพไม่ได้ กรุณาใช้ภาพชัดเจนหรือครอปใหม่");
  return root.items.map((input, index) => {
    const row = obj(input), inputFacts = obj(row.facts);
    const facts: Record<string, unknown> = {};
    const references = new Map<VisionField, Evidence>();
    for (const key of VISION_FIELDS) {
      const fact = obj(inputFacts[key]);
      const source = sources.find(s => s.id === fact.imageId);
      const quote = typeof fact.evidence === "string" ? fact.evidence.trim() : "";
      if (source && quote && texts.get(source.id)?.includes(quote)) {
        facts[key] = { value: fact.value, evidence: quote };
        references.set(key, { imageId: source.id, imageNumber: source.number, text: quote });
      } else facts[key] = { value: null, evidence: null };
    }
    const first = [...references.values()][0];
    const source = sources.find(s => s.id === first?.imageId) ?? sources[0];
    const item = normalizeExtraction({ rawText: [...texts.values()].join("\n"), items: [{ kind: row.kind, facts }] }, source.id, source.number)[0];
    item.id = `${source.id}-batch-${index}`;
    for (const key of VISION_FIELDS) item.facts[key].evidence = references.has(key) ? [references.get(key)!] : [];
    item.sources = [...new Set([...references.values()].map(ref => ref.imageId))];
    if (!item.sources.length) item.sources = [source.id];
    return item;
  });
}
export function normalizeExtraction(value: unknown, imageId: string, imageNumber: number): VisionItem[] {
  const root = obj(value); const rawText = typeof root.rawText === "string" ? root.rawText.slice(0, 50000) : "";
  if (!rawText.trim() || !Array.isArray(root.items)) throw new Error("อ่านตัวอักษรในภาพไม่ได้ กรุณาใช้ภาพชัดเจนหรือครอปใหม่");
  if (root.items.length > 80) throw new Error("ภาพมีรายการมากเกินไป กรุณาแบ่งภาพเพื่อไม่ให้ข้อมูลตกหล่น");
  return root.items.map((input, index) => {
    const row = obj(input); const inputFacts = obj(row.facts); const facts = {} as VisionItem["facts"];
    const issues: string[] = [];
    for (const key of VISION_FIELDS) {
      const field = obj(inputFacts[key]);
      const text = typeof field.evidence === "string" ? field.evidence.trim().slice(0, 3000) : "";
      const supported = text.length > 0 && rawText.includes(text);
      const v = supported && typeof field.value === "string" && field.value.trim() ? field.value.trim().slice(0, key === "description" ? 8000 : 2000) : null;
      facts[key] = { value: v, evidence: supported ? [{ imageId, imageNumber, text }] : [] };
      if (field.value && !supported) issues.push(`${fieldLabels[key]}ไม่มีหลักฐานที่ตรวจสอบได้`);
    }
    let kind = ["task","exam","announcement","material","review"].includes(String(row.kind)) ? row.kind as VisionKind : "review";
    if (!["pending","submitted","overdue","unknown"].includes(facts.status.value ?? "")) facts.status.value = "unknown";
    const statusProof=facts.status.evidence.map(e=>e.text).join(" ");
    const submitted=/ส่งแล้ว|turned\s+in|submitted/i.test(statusProof)&&!/ยังไม่ได้ส่ง|not\s+(?:submitted|turned\s+in)/i.test(statusProof);
    const notSubmitted=/ยังไม่ได้ส่ง|ยังไม่ส่ง|missing|assigned|not\s+(?:submitted|turned\s+in)/i.test(statusProof);
    const overdue=/เลยกำหนด|เกินกำหนด|missing|overdue/i.test(statusProof);
    if ((facts.status.value==="submitted"&&!submitted)||(facts.status.value==="pending"&&!notSubmitted)||(facts.status.value==="overdue"&&!overdue)) {
      facts.status.value="unknown";issues.push("หลักฐานสถานะส่งงานไม่ชัดเจน");
    }
    if (/เอกสารประกอบการสอน|สื่อประกอบการสอน/.test(facts.title.value??"") && kind==="task" && !/ส่ง(?:งาน|สรุป|คำตอบ)|(?:ให้|ต้อง).{0,60}ส่ง/.test(`${facts.title.value??""} ${facts.description.value??""}`)) { kind="material"; issues.push("จัดเป็นเอกสารประกอบการสอน เพราะไม่มีคำสั่งให้ส่งงานที่อ่านได้"); }
    // A date with no visible year stays a partial date, even if the model filled a year.
    const evidence = facts.dueDate.evidence.map(e=>e.text).join(" ");
    const visibleDate = confirmedDate(evidence);
    if (visibleDate && facts.dueDate.value && confirmedDate(facts.dueDate.value) !== visibleDate) {
      facts.dueDate.value = evidence;
      issues.push("ปรับวันและปีให้ตรงหลักฐาน กรุณาตรวจสอบอีกครั้ง");
    }
    if (facts.dueDate.value && !/\b(?:19|20|21|24|25|26)\d{2}\b/.test(evidence.replace(/[๐-๙]/g,n=>String(n.charCodeAt(0)-3664)))) {
      if (/^\d{4}-/.test(facts.dueDate.value)) facts.dueDate.value = evidence;
      issues.push("โปรดตรวจสอบปีกำหนดส่ง");
    }
    return { id: `${imageId}-${index}`, kind, facts, sources:[imageId], issues:[...new Set(issues)], conflicts:[], selected:false, reviewed:false, courseId:"", choice:"create", targetId:"" };
  });
}
export function sameItem(a: VisionItem, b: VisionItem): boolean {
  if (a.kind !== b.kind || !a.facts.title.value || !b.facts.title.value) return false;
  const value = (item: VisionItem, field: VisionField) => item.facts[field].value;
  const linkA=safeLink(value(a,"url")), linkB=safeLink(value(b,"url"));
  const sameLink=Boolean(linkA&&linkA===linkB);
  const codeA=value(a,"courseCode"), codeB=value(b,"courseCode");
  if (codeA && codeB && normalizeText(codeA)!==normalizeText(codeB)) return false;
  if (!codeA || !codeB) {
    const nameA=value(a,"courseName"),nameB=value(b,"courseName");
    if ((!nameA || !nameB || normalizeText(nameA)!==normalizeText(nameB))&&!sameLink) return false;
  }
  if (linkA && linkB && linkA!==linkB) return false;
  if(sameLink)return true;
  const titleKey=(item:VisionItem)=>normalizeText(value(item,"title")!.replace(/\[([^\]]+)\]/g,(whole,inside)=>normalizeText(inside)===normalizeText(value(item,"courseCode")??"")?"":whole));
  if (titleKey(a)!==titleKey(b)) return false;
  if (value(a,"lesson") && value(b,"lesson") && normalizeText(value(a,"lesson")!) !== normalizeText(value(b,"lesson")!)) return false;
  const dateA=value(a,"dueDate"),dateB=value(b,"dueDate");
  // Different due dates need manual comparison unless the canonical URL proves identity.
  if (dateA && dateB && normalizeText(dateA)!==normalizeText(dateB)) {
    const fullA=confirmedDate(dateA),fullB=confirmedDate(dateB);
    if(fullA&&fullB&&fullA!==fullB)return false;
    const monthDayA=confirmedDate(dateA,"2000")?.slice(5),monthDayB=confirmedDate(dateB,"2000")?.slice(5);
    if(!monthDayA||monthDayA!==monthDayB)return false;
  }
  return true;
}
export function mergeItems(items: VisionItem[]): VisionItem[] {
  const result: VisionItem[] = [];
  for (const source of items) {
    const existing = result.find(item=>sameItem(item,source));
    if (!existing) { result.push(structuredClone(source)); continue; }
    existing.sources = [...new Set([...existing.sources,...source.sources])];
    existing.issues = [...new Set([...existing.issues,...source.issues])];
    for (const field of VISION_FIELDS) {
      const a=existing.facts[field], b=source.facts[field];
      a.evidence.push(...b.evidence);
      if (!a.value) a.value=b.value;
      else if(field==="dueDate"&&b.value&&confirmedDate(a.value)&&confirmedDate(a.value)===confirmedDate(b.value)) { /* Same date in Buddhist and Gregorian notation. */ }
      else if(field==="dueDate"&&b.value&&!confirmedDate(a.value)&&confirmedDate(b.value)&&confirmedDate(a.value,"2000")?.slice(5)===confirmedDate(b.value)?.slice(5)) a.value=b.value;
      else if (b.value && normalizeText(a.value)!==normalizeText(b.value) && field!=="description" && field!=="attachments") existing.conflicts=[...new Set([...existing.conflicts,field])];
      else if (b.value && (field==="description"||field==="attachments") && !a.value.includes(b.value)) a.value += `\n${b.value}`;
    }
    if (existing.conflicts.length) existing.reviewed=false;
  }
  return result;
}
export function readiness(item: VisionItem): string[] {
  const issues: string[] = [];
  if (!item.facts.title.value?.trim()) issues.push("ไม่มีชื่อรายการ");
  if (!item.reviewed) issues.push("ยังไม่ได้ยืนยันการตรวจสอบ");
  if (item.conflicts.length && !item.reviewed) issues.push("ข้อมูลหลายภาพขัดแย้งกัน");
  if (item.kind === "review") issues.push("กรุณาเลือกประเภทให้ชัดเจน");
  if ((item.kind==="task"||item.kind==="exam") && !item.courseId) issues.push("กรุณาเชื่อมรายวิชา");
  if ((item.kind==="task"||item.kind==="exam") && !dueTimestamp(item)) issues.push("กรุณายืนยันวัน ปี และเวลา");
  if ((item.kind==="task"||item.kind==="exam") && (!item.facts.status.value || item.facts.status.value==="unknown")) issues.push("กรุณายืนยันสถานะส่งงาน");
  if (item.choice==="update" && !item.targetId) issues.push("กรุณาเลือกรายการเดิมที่จะอัปเดต");
  return issues;
}
