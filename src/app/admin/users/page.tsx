import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { getAdminUserDirectory } from "@/lib/admin/admin-repository";

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const pageHref = (page: number, search: string) => `/admin/users?page=${page}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
const maskedUserId = (value: string) => value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const requestedPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const result = await getAdminUserDirectory(search, requestedPage);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <div className="admin-page">
    <div className="admin-page-heading"><div><span className="admin-eyebrow">USER DIRECTORY</span><h1>รายชื่อผู้ใช้</h1><p>แสดงเฉพาะข้อมูลบัญชีและการศึกษาที่จำเป็น รวม {result.total.toLocaleString("th-TH")} บัญชี</p></div></div>
    <section className="admin-panel">
      <form className="admin-search" method="get" action="/admin/users"><Search aria-hidden="true" /><label className="admin-visually-hidden" htmlFor="admin-user-search">ค้นหาผู้ใช้</label><input id="admin-user-search" name="q" defaultValue={result.search} placeholder="ค้นหาชื่อ อีเมล มหาวิทยาลัย หรือสาขา" maxLength={120} /><button type="submit">ค้นหา</button></form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ผู้ใช้</th><th>มหาวิทยาลัย / สาขา</th><th>ชั้นปี</th><th>สร้างบัญชี</th><th>เข้าใช้ล่าสุด</th><th><span className="admin-visually-hidden">เปิด</span></th></tr></thead><tbody>{result.rows.map((user) => <tr key={user.userId}><td data-label="ผู้ใช้"><strong>{user.displayName || "ยังไม่ตั้งชื่อ"}</strong><small>{user.email}</small><code className="admin-masked-id">{maskedUserId(user.userId)}</code></td><td data-label="การศึกษา"><strong>{user.university || "ยังไม่ระบุ"}</strong><small>{user.major || "ยังไม่ระบุสาขา"}</small></td><td data-label="ชั้นปี"><strong>{user.level || "—"}</strong><small>{[user.term && `เทอม ${user.term}`, user.academicYear].filter(Boolean).join(" · ") || "ยังไม่ระบุ"}</small></td><td data-label="สร้างบัญชี"><time dateTime={user.createdAt}>{dateFormatter.format(new Date(user.createdAt))}</time></td><td data-label="เข้าใช้ล่าสุด">{user.lastSignInAt ? <time dateTime={user.lastSignInAt}>{dateFormatter.format(new Date(user.lastSignInAt))}</time> : "ยังไม่เคย"}</td><td className="admin-table-action"><Link className="admin-icon-link" href={`/admin/users/${user.userId}`} aria-label={`เปิดรายละเอียด ${user.displayName || user.email}`}><ArrowRight aria-hidden="true" /></Link></td></tr>)}</tbody></table>{!result.rows.length ? <div className="admin-empty">ไม่พบผู้ใช้ที่ตรงกับคำค้น</div> : null}</div>
      <nav className="admin-pagination" aria-label="เปลี่ยนหน้ารายชื่อผู้ใช้"><Link aria-disabled={result.page <= 1} href={result.page <= 1 ? pageHref(1, result.search) : pageHref(result.page - 1, result.search)}><ArrowLeft aria-hidden="true" />ก่อนหน้า</Link><span>หน้า {Math.min(result.page, totalPages).toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span><Link aria-disabled={result.page >= totalPages} href={result.page >= totalPages ? pageHref(totalPages, result.search) : pageHref(result.page + 1, result.search)}>ถัดไป<ArrowRight aria-hidden="true" /></Link></nav>
    </section>
  </div>;
}
