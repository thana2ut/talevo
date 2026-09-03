"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Bot, CalendarClock, CalendarDays, ChartNoAxesColumnIncreasing, ChartSpline, CircleHelp, ClipboardList, GraduationCap, Home, Plus, Settings, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet, TalevoBrand, NotificationBell } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";

const primaryNavigationItems = [
  { href: "/today", key: "nav.home", icon: Home },
  { href: "/schedule", key: "nav.schedule", icon: CalendarDays },
  { href: "/tasks", key: "nav.tasks", icon: ClipboardList },
  { href: "/exams", key: "nav.exams", icon: CalendarClock },
  { href: "/grades", key: "nav.grades", icon: ChartSpline },
  { href: "/statistics", key: "nav.statistics", icon: ChartNoAxesColumnIncreasing },
  { href: "/finance", key: "nav.finance", icon: WalletCards },
  { href: "/ai", key: "nav.ai", icon: Bot },
];

const mobileNavigationItems = [
  { href: "/today", key: "nav.home", icon: Home },
  { href: "/schedule", key: "nav.schedule", icon: CalendarDays },
  { href: "/tasks", key: "nav.tasks", icon: ClipboardList },
  { href: "/ai", key: "nav.ai", icon: Bot },
];

const publicRoutes = ["/", "/welcome", "/login", "/register", "/forgot-password", "/resend-confirmation", "/reset-password"];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return <Link href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link>;
}

function LocalOwnershipGate() {
  const { adoptExistingLocalData, startFreshLocalData } = useAppState();
  const adopt = () => {
    if (window.confirm("นำข้อมูล TALEVO เดิมในอุปกรณ์นี้มาใช้กับบัญชีที่กำลังเข้าสู่ระบบใช่หรือไม่?")) adoptExistingLocalData();
  };
  const startFresh = () => {
    if (window.confirm("เริ่มบัญชีใหม่โดยเก็บข้อมูล TALEVO เดิมไว้ในอุปกรณ์นี้ใช่หรือไม่?")) startFreshLocalData();
  };
  return <main className="local-ownership-gate"><section className="local-ownership-card" aria-labelledby="local-ownership-title"><span><ShieldCheck aria-hidden="true" /></span><h1 id="local-ownership-title">พบข้อมูล TALEVO เดิมในอุปกรณ์นี้</h1><p>ต้องการนำข้อมูลนี้มาใช้กับบัญชีนี้หรือเริ่มบัญชีใหม่? TALEVO จะไม่เลือกแทนคุณและจะไม่เปิดข้อมูลเดิมจนกว่าจะยืนยัน</p><button className="primary-button button-block" type="button" onClick={adopt}>นำข้อมูลมาใช้</button><button className="secondary-button button-block" type="button" onClick={startFresh}>เริ่มบัญชีใหม่</button><small>การเริ่มบัญชีใหม่จะไม่ลบ AppState v8 เดิม ไม่ล้าง IndexedDB และไม่อัปโหลดข้อมูลขึ้น Supabase</small></section></main>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isAuthLoading, isHydrated, localOwnershipStatus } = useAppState();
  const { t } = useLanguage();
  const [quickOpen, setQuickOpen] = useState(false);

  const isPublicRoute = publicRoutes.includes(pathname);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && !isPublicRoute && !isAdminRoute) {
      router.replace(`/login?auth-error=authentication-required&next=${encodeURIComponent(pathname)}`);
    }
  }, [isAdminRoute, isAuthenticated, isAuthLoading, isPublicRoute, pathname, router]);

  if (isAdminRoute) return <>{children}</>;
  if (isPublicRoute) return <>{children}</>;
  if (isAuthLoading || !isHydrated) return <div className="app-hydration-screen" role="status" aria-live="polite">กำลังโหลดข้อมูล TALEVO...</div>;
  if (!isAuthenticated) return null;
  if (localOwnershipStatus === "needs-adoption") return <LocalOwnershipGate />;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const quickOptions = [
    { label: t("shell.addTask"), description: t("shell.addTaskDescription"), icon: ClipboardList, href: "/tasks/new" },
    { label: t("shell.addClass"), description: t("shell.addClassDescription"), icon: CalendarDays, href: "/schedule/new" },
    { label: t("shell.addExam"), description: t("shell.addExamDescription"), icon: GraduationCap, href: "/exams/new" },
    { label: t("shell.addFinance"), description: t("shell.addFinanceDescription"), icon: WalletCards, href: "/finance/new" },
  ];
  const quickDestinationOptions = [
    { label: t("nav.exams"), icon: CalendarClock, href: "/exams" },
    { label: t("nav.grades"), icon: ChartSpline, href: "/grades" },
    { label: t("nav.statistics"), icon: ChartNoAxesColumnIncreasing, href: "/statistics" },
    { label: t("nav.finance"), icon: WalletCards, href: "/finance" },
    { label: t("notifications.title"), icon: Bell, href: "/notifications" },
    { label: t("nav.profile"), icon: UserRound, href: "/profile" },
    { label: t("nav.settings"), icon: Settings, href: "/settings" },
    { label: t("profile.help"), icon: CircleHelp, href: "/help" },
  ];

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <Link href="/today" className="sidebar-brand" aria-label={t("nav.home") + " TALEVO"}><TalevoBrand variant="compact" /></Link>
        <nav className="sidebar-main" aria-label={t("shell.mainMenu")}>
          {primaryNavigationItems.map((item) => <NavLink key={item.href} href={item.href} label={t(item.key)} icon={item.icon} active={isActive(item.href)} />)}
        </nav>
        <nav className="sidebar-bottom" aria-label={t("shell.accountMenu")}><NavLink href="/profile" label={t("nav.profile")} icon={UserRound} active={isActive("/profile")} /><NavLink href="/settings" label={t("nav.settings")} icon={Settings} active={isActive("/settings")} /></nav>
      </aside>

      <div className="app-workspace">
        <div className="desktop-topbar"><NotificationBell /></div>
        <main className={`app-main${pathname === "/ai" ? " app-main-ai" : ""}`}>{children}</main>
      </div>

      <nav className="mobile-bottom-nav" aria-label={t("shell.mobileMenu")}>
        <NavLink href={mobileNavigationItems[0].href} label={t(mobileNavigationItems[0].key)} icon={mobileNavigationItems[0].icon} active={isActive(mobileNavigationItems[0].href)} />
        <NavLink href={mobileNavigationItems[1].href} label={t(mobileNavigationItems[1].key)} icon={mobileNavigationItems[1].icon} active={isActive(mobileNavigationItems[1].href)} />
        <button type="button" className="quick-add-button" onClick={() => setQuickOpen(true)} aria-label={t("shell.quickAdd")} aria-haspopup="dialog" aria-expanded={quickOpen}><Plus aria-hidden="true" /></button>
        <NavLink href={mobileNavigationItems[2].href} label={t(mobileNavigationItems[2].key)} icon={mobileNavigationItems[2].icon} active={isActive(mobileNavigationItems[2].href)} />
        <NavLink href={mobileNavigationItems[3].href} label={t(mobileNavigationItems[3].key)} icon={mobileNavigationItems[3].icon} active={isActive(mobileNavigationItems[3].href)} />
      </nav>

      <BottomSheet open={quickOpen} title={t("shell.quickAdd")} onClose={() => setQuickOpen(false)} className="quick-add-sheet">
        <div className="quick-add-groups">
          <section className="quick-add-section" aria-labelledby="quick-add-destinations-title">
            <h3 id="quick-add-destinations-title">ไปยังหน้า</h3>
            <div className="quick-options quick-options-destinations">{quickDestinationOptions.map(({ label, icon: Icon, href }) => <Link key={href} href={href} onClick={() => setQuickOpen(false)}><span><Icon aria-hidden="true" /></span><strong>{label}</strong></Link>)}</div>
          </section>
          <section className="quick-add-section" aria-labelledby="quick-add-create-title">
            <h3 id="quick-add-create-title">เพิ่มข้อมูลด่วน</h3>
            <div className="quick-options quick-options-create">{quickOptions.map(({ label, description, icon: Icon, href }) => <Link key={href} href={href} onClick={() => setQuickOpen(false)}><span><Icon aria-hidden="true" /></span><div><strong>{label}</strong><small>{description}</small></div></Link>)}</div>
          </section>
        </div>
      </BottomSheet>
    </div>
  );
}
