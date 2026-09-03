import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarDays, GraduationCap, Mail, School, UserRound } from "lucide-react";
import { AdminCopyIdButton } from "@/components/admin/admin-copy-id-button";
import { getAdminUserDetail } from "@/lib/admin/admin-repository";

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" });
const formatDate = (value: string | null) => value ? dateFormatter.format(new Date(value)) : "ยังไม่มีข้อมูล";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAdminUserDetail(id);
  const fields = [
    { label: "อีเมลจาก Supabase Auth", value: user.email || "ยังไม่มีอีเมล", icon: Mail },
    { label: "มหาวิทยาลัย", value: user.university || "ยังไม่ระบุ", icon: School },
    { label: "สาขา", value: user.major || "ยังไม่ระบุ", icon: GraduationCap },
    { label: "ชั้น / ปี", value: user.level || "ยังไม่ระบุ", icon: UserRound },
    { label: "ภาคเรียน / ปีการศึกษา", value: [user.term, user.academicYear].filter(Boolean).join(" / ") || "ยังไม่ระบุ", icon: CalendarDays },
    { label: "สถานะยืนยันอีเมล", value: user.emailConfirmedAt ? `ยืนยันเมื่อ ${formatDate(user.emailConfirmedAt)}` : "ยังไม่ยืนยัน", icon: BadgeCheck },
  ];
  return <div className="admin-page">
    <Link className="admin-back-button" href="/admin/users"><ArrowLeft aria-hidden="true" />กลับไปรายชื่อผู้ใช้</Link>
    <section className="admin-profile-hero"><span className="admin-profile-avatar">{(user.displayName || user.email || "T").slice(0, 1).toLocaleUpperCase("th-TH")}</span><div><span className="admin-eyebrow">USER DETAIL</span><h1>{user.displayName || "ยังไม่ตั้งชื่อ"}</h1><p>{user.email}</p></div></section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>ข้อมูลบัญชีและการศึกษา</h2><p>ไม่มีข้อมูลกิจกรรม งาน การสอบ การเงิน หรือเนื้อหาส่วนตัวในหน้านี้</p></div></div><div className="admin-detail-grid">{fields.map(({ label, value, icon: Icon }) => <article key={label}><span><Icon aria-hidden="true" /></span><div><small>{label}</small><strong>{value}</strong></div></article>)}</div></section>
    <section className="admin-panel"><div className="admin-id-row"><div><small>User ID</small><code>{user.userId}</code></div><AdminCopyIdButton value={user.userId} /></div><div className="admin-timeline"><div><small>สร้างบัญชี</small><time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time></div><div><small>เข้าสู่ระบบล่าสุด</small><time dateTime={user.lastSignInAt ?? undefined}>{formatDate(user.lastSignInAt)}</time></div></div></section>
  </div>;
}

