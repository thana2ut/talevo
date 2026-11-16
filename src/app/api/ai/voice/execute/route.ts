import { secureApi } from "@/lib/security/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrustedMutationOrigin } from "@/lib/security/request-origin";

export const dynamic = "force-dynamic";
const tables = { task: "tasks", exam: "exams", schedule: "class_schedules" } as const;
const fields = {
  task: ["title", "course_id", "description", "due_date", "estimate"],
  exam: ["title", "course_id", "type", "start_at", "end_at", "room", "note"],
  schedule: ["name", "course_id", "day", "start_time", "end_time", "room", "teacher", "note"],
};
function fail(message: string, status = 400) { return NextResponse.json({ message }, { status }); }
async function handlerPOST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) return fail("คำขอไม่ถูกต้อง", 403);
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return fail("กรุณาเข้าสู่ระบบใหม่", 401);
  const raw = await request.text();
  if (raw.length > 12000) return fail("คำสั่งยาวเกินไป");
  try {
    const plan = JSON.parse(raw);
    if (!Object.hasOwn(tables, plan.entity) || !["create", "update", "delete"].includes(plan.action)) return fail("คำสั่งไม่ถูกต้อง");
    if (typeof plan.summary !== "string" || !plan.summary.trim() || plan.summary.length > 500) return fail("สรุปคำสั่งไม่ถูกต้อง");
    const entity = plan.entity as keyof typeof tables;
    const table = tables[entity];
    if (typeof plan.id !== "string" || !/^[\w-]{1,100}$/.test(plan.id)) return fail("ไม่พบรหัสรายการ");
    let existing: Record<string, unknown> = {};
    if (plan.action !== "create") {
      const result = await db.from(table).select("*").eq("user_id", auth.user.id).eq("id", plan.id).maybeSingle();
      if (result.error || !result.data) return fail("ไม่พบรายการนี้ หรือไม่มีสิทธิ์แก้ไข", 404);
      existing = result.data;
    }
    if (plan.action === "delete") {
      const result = await db.from(table).delete().eq("user_id", auth.user.id).eq("id", plan.id).select("id").single();
      return result.error ? fail("ลบไม่สำเร็จ กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง", 409) : NextResponse.json({ saved: true });
    }
    if (!plan.fields || typeof plan.fields !== "object" || Array.isArray(plan.fields)) return fail("รายละเอียดไม่ถูกต้อง");
    if (plan.action === "update" && !Object.keys(plan.fields).length) return fail("ไม่พบข้อมูลที่ต้องการแก้ไข");
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(plan.fields)) {
      if (value === null || value === undefined) continue;
      if (key === "course_name" && entity !== "schedule") continue;
      if (!fields[entity].includes(key) || (typeof value !== "string" && typeof value !== "number") || String(value).length > 4000) return fail("ข้อมูลบางช่องไม่ถูกต้อง");
      patch[key] = value;
    }
    // Resolve the spoken subject against this account's actual courses.
    // Multiple class slots belonging to one course count as one match.
    if (entity !== "schedule" && plan.fields.course_name !== undefined) {
      const spoken = plan.fields.course_name;
      if (typeof spoken !== "string" || !spoken.trim() || spoken.length > 200) return fail("กรุณาบอกชื่อวิชา");
      const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("th").replace(/^วิชา\s*/, "").replace(/[\s\p{P}\p{S}]+/gu, "");
      const query = normalize(spoken);
      if (!query) return fail("กรุณาบอกชื่อวิชาให้ชัดเจน");
      const courses = await db.from("class_schedules").select("course_id,name").eq("user_id", auth.user.id);
      if (courses.error) return fail("อ่านรายวิชาไม่สำเร็จ กรุณาลองใหม่", 503);
      const unique = [...new Map((courses.data ?? []).map(course => [course.course_id, course])).values()];
      const exact = unique.filter(course => normalize(course.name) === query);
      const matches = exact.length ? exact : unique.filter(course => normalize(course.name).includes(query));
      if (!matches.length) return fail(`ไม่พบวิชาที่มีคำว่า “${spoken}” กรุณาบอกชื่อวิชาอีกครั้ง`);
      if (plan.fields.course_id !== undefined) {
        const selected = matches.find(course => course.course_id === plan.fields.course_id);
        if (!selected) return fail("วิชาที่ AI เลือกไม่ตรงกับตารางเรียน กรุณาลองพูดใหม่หรือเลือกวิชาให้ชัดเจน");
        patch.course_id = selected.course_id;
      } else {
        if (matches.length > 1) return fail(`คำว่า “${spoken}” ตรงกับหลายวิชา: ${matches.slice(0, 4).map(course => course.name).join(" / ")} กรุณาระบุเพิ่มอีกนิด`);
        patch.course_id = matches[0].course_id;
      }
    }
    if (plan.action === "create" && entity === "schedule" && !patch.end_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(patch.start_time))) {
      const [hours, minutes] = String(patch.start_time).split(":").map(Number);
      if (hours < 23) patch.end_time = `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    const row = { ...existing, ...patch };
    const title = entity === "schedule" ? row.name : row.title;
    if (typeof title !== "string" || !title.trim() || title.length > 200) return fail("กรุณาระบุชื่อรายการให้ชัดเจน");
    for (const key of ["due_date", "start_at", "end_at"]) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(row[key])) || !Number.isFinite(Date.parse(String(row[key]))))) return fail("กรุณาระบุวันและเวลาให้ชัดเจน");
    }
    if (entity === "task" && !row.due_date) return fail("กรุณาระบุกำหนดส่งงาน");
    if (entity === "task" && plan.action === "create" && !row.course_id) return fail("กรุณาบอกวิชาแยกจากชื่องาน เช่น งานสรุปบทที่ 3 วิชานวัตกรรม");
    if (entity === "exam" && (!row.start_at || !["quiz", "midterm", "final", "practical", "presentation", "other"].includes(String(row.type ?? "other")))) return fail("ข้อมูลการสอบไม่ครบ");
    if (row.end_at && Date.parse(String(row.end_at)) <= Date.parse(String(row.start_at))) return fail("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
    if (entity === "schedule" && (!Number.isInteger(row.day) || Number(row.day) < 0 || Number(row.day) > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(row.start_time)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(row.end_time)) || String(row.end_time) <= String(row.start_time))) return fail("กรุณาระบุวันและเวลาเรียนให้ถูกต้อง");
    if (entity !== "schedule" && row.course_id) {
      const course = await db.from("class_schedules").select("course_id").eq("user_id", auth.user.id).eq("course_id", row.course_id).limit(1);
      if (course.error || !course.data?.length) return fail("ไม่พบวิชาที่ระบุในบัญชีของคุณ");
    }
    if (entity === "exam" && !row.course_id) return fail("กรุณาระบุวิชาที่มีในตารางเรียนก่อน");
    const defaults = entity === "task" ? { status: "todo", color: "#7656F6", description: "", estimate: "1 ชั่วโมง", due_label: "" } : entity === "exam" ? { type: "other" } : { course_id: crypto.randomUUID(), teacher: "", room: "", color: "#7656F6" };
    const result = plan.action === "create"
      ? await db.from(table).insert({ ...defaults, ...patch, id: plan.id, user_id: auth.user.id }).select("id").single()
      : await db.from(table).update(patch).eq("id", plan.id).eq("user_id", auth.user.id).select("id").single();
    if (result.error) return fail("บันทึกไม่สำเร็จ หรือรายการนี้ถูกบันทึกไปแล้ว กรุณาโหลดข้อมูลใหม่ก่อนลองอีกครั้ง", 409);
    return NextResponse.json({ saved: true });
  } catch { return fail("อ่านคำสั่งไม่สำเร็จ กรุณาลองใหม่"); }
}

export const POST = secureApi(handlerPOST, "/api/ai/voice/execute", "POST");
