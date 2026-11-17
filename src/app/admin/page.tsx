import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboard, type Dashboard } from "@/features/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "ศูนย์ดูแลระบบ",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) redirect("/login");
  if (auth.user.factors?.some(factor => factor.status === "verified")) {
    const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") redirect("/profile/security");
  }
  const { data: allowed, error } = await db.rpc("is_support_admin");
  // Fail closed. Client navigation never grants database privileges.
  if (error) return <div className="page"><h1>ยังตรวจสอบสิทธิ์ไม่ได้</h1><p>กรุณาลองใหม่อีกครั้งภายหลัง</p><Link href="/settings">กลับการตั้งค่า</Link></div>;
  if (allowed !== true) notFound();
  const { data } = await db.rpc("support_admin_dashboard");
  const source = data as Dashboard | null;
  // Forward only fields used by this workspace, after database authorization.
  const messageFields = (item: Dashboard["reports"][number]) => ({
    id: item.id, category: item.category, message: item.message,
    created_at: item.created_at, read_at: item.read_at,
    display_name: item.display_name, email: item.email,
  });
  const initialData: Dashboard | null = source ? {
    account_count: source.account_count, unread_count: source.unread_count,
    unread_problem_count: source.unread_problem_count, unread_help_count: source.unread_help_count,
    reports: (source.reports ?? []).map(messageFields), help_requests: (source.help_requests ?? []).map(messageFields),
  } : null;
  return <AdminDashboard initialData={initialData} />;
}
