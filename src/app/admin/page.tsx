import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarPlus, LogIn, UsersRound } from "lucide-react";
import { getAdminDashboardData } from "@/lib/admin/admin-repository";

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const formatDate = (value: string | null) => value ? dateFormatter.format(new Date(value)) : "ยังไม่มีข้อมูล";

export default async function AdminDashboardPage() {
  const { summary, latestUsers } = await getAdminDashboardData();
  const metrics = [
    { label: "ผู้ใช้ทั้งหมด", value: summary.totalUsers, icon: UsersRound },
    { label: "ผู้ใช้ใหม่วันนี้", value: summary.newUsersToday, icon: CalendarPlus },
    { label: "ผู้ใช้ใหม่ 7 วันล่าสุด", value: summary.newUsersLast7Days, icon: CalendarCheck },
    { label: "เข้าใช้งานใน 30 วัน", value: summary.recentlyActiveUsers, icon: LogIn },
  ];
  return <div className="admin-page">
    <div className="admin-page-heading"><div><span className="admin-eyebrow">DASHBOARD</span><h1>ภาพรวมระบบ</h1><p>สรุปจาก Supabase Auth และข้อมูลโปรไฟล์ที่อนุญาตเท่านั้น</p></div><Link className="admin-primary-link" href="/admin/users">ดูผู้ใช้ทั้งหมด<ArrowRight aria-hidden="true" /></Link></div>
    <section className="admin-metric-grid" aria-label="สถิติผู้ใช้">{metrics.map(({ label, value, icon: Icon }) => <article className="admin-metric-card" key={label}><span><Icon aria-hidden="true" /></span><div><small>{label}</small><strong>{value.toLocaleString("th-TH")}</strong></div></article>)}</section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>ผู้ใช้ล่าสุด</h2><p>เรียงตามวันที่สร้างบัญชีล่าสุด</p></div><Link href="/admin/users">เปิด Directory</Link></div>
      <div className="admin-user-list">{latestUsers.length ? latestUsers.map((user) => <Link href={`/admin/users/${user.userId}`} className="admin-user-row" key={user.userId}><span className="admin-avatar">{(user.displayName || user.email || "T").slice(0, 1).toLocaleUpperCase("th-TH")}</span><span><strong>{user.displayName || "ยังไม่ตั้งชื่อ"}</strong><small>{user.email}</small><small>{[user.university, user.major].filter(Boolean).join(" · ") || "ยังไม่มีข้อมูลการศึกษา"}</small></span><time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time><ArrowRight aria-hidden="true" /></Link>) : <div className="admin-empty">ยังไม่มีผู้ใช้ในระบบ</div>}</div>
    </section>
  </div>;
}
