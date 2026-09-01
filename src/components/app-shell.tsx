"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, CalendarClock, CalendarDays, ChartNoAxesColumnIncreasing, ChartSpline, ClipboardList, GraduationCap, Home, Plus, Settings, UserRound, WalletCards } from "lucide-react";
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

const mobileNavigationItems = primaryNavigationItems.filter((item) => ["/today", "/schedule", "/tasks", "/finance"].includes(item.href));

const publicRoutes = ["/", "/welcome", "/login", "/register", "/forgot-password"];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return <Link href={href} className={`nav-link ${active ? "active" : ""}`}><Icon aria-hidden="true" /><span>{label}</span></Link>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isHydrated } = useAppState();
  const { t } = useLanguage();
  const [quickOpen, setQuickOpen] = useState(false);

  const isPublicRoute = publicRoutes.includes(pathname);
  useEffect(() => { if (!isAuthenticated && !isPublicRoute) router.replace("/welcome"); }, [isAuthenticated, isPublicRoute, router]);

  if (isPublicRoute) return <>{children}</>;
  if (!isHydrated) return <div className="app-hydration-screen" role="status" aria-live="polite">กำลังโหลดข้อมูล TALEVO...</div>;
  if (!isAuthenticated) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const quickOptions = [
    { label: t("shell.addTask"), description: t("shell.addTaskDescription"), icon: ClipboardList, href: "/tasks/new" },
    { label: t("shell.addClass"), description: t("shell.addClassDescription"), icon: CalendarDays, href: "/schedule/new" },
    { label: t("shell.addExam"), description: t("shell.addExamDescription"), icon: GraduationCap, href: "/exams/new" },
    { label: t("shell.addFinance"), description: t("shell.addFinanceDescription"), icon: WalletCards, href: "/finance/new" },
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
        <button type="button" className="quick-add-button" onClick={() => setQuickOpen(true)} aria-label={t("shell.quickAdd")}><Plus /></button>
        <NavLink href={mobileNavigationItems[2].href} label={t(mobileNavigationItems[2].key)} icon={mobileNavigationItems[2].icon} active={isActive(mobileNavigationItems[2].href)} />
        <NavLink href={mobileNavigationItems[3].href} label={t(mobileNavigationItems[3].key)} icon={mobileNavigationItems[3].icon} active={isActive(mobileNavigationItems[3].href)} />
      </nav>

      <BottomSheet open={quickOpen} title={t("shell.quickAdd")} onClose={() => setQuickOpen(false)}>
        <div className="quick-options">{quickOptions.map(({ label, description, icon: Icon, href }) => <Link key={label} href={href} onClick={() => setQuickOpen(false)}><span><Icon /></span><div><strong>{label}</strong><small>{description}</small></div></Link>)}</div>
      </BottomSheet>
    </div>
  );
}
