import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, ShieldCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { requireTalevoAdmin } from "@/lib/admin/admin-repository";
import "./admin.css";

export const metadata: Metadata = { title: "Admin Back Office", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireTalevoAdmin();
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span><ShieldCheck aria-hidden="true" /></span><div><strong>TALEVO</strong><small>Admin Back Office</small></div></div>
      <nav aria-label="เมนูผู้ดูแลระบบ">
        <Link href="/admin"><LayoutDashboard aria-hidden="true" />ภาพรวม</Link>
        <Link href="/admin/users"><UsersRound aria-hidden="true" />รายชื่อผู้ใช้</Link>
      </nav>
      <Link className="admin-back-link" href="/today">กลับไป TALEVO</Link>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><span>พื้นที่สำหรับผู้ดูแลระบบ</span><strong>ข้อมูลเท่าที่จำเป็น</strong></header>
      <main className="admin-main">{children}</main>
    </div>
  </div>;
}
