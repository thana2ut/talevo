"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, CalendarDays, ClipboardList, Home, Menu, MoreHorizontal, Plus, Settings, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BottomSheet, TalevoBrand, NotificationBell } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";

const primaryNavigationItems = [
  { href: "/today", key: "nav.home", icon: Home },
  { href: "/schedule", key: "nav.schedule", icon: CalendarDays },
  { href: "/tasks", key: "nav.tasks", icon: ClipboardList },
  { href: "/ai", key: "nav.ai", icon: Bot },
];

const mobileNavigationItems = [
  { href: "/today", key: "nav.home", icon: Home },
  { href: "/schedule", key: "nav.schedule", icon: CalendarDays },
  { href: "/tasks", key: "nav.tasks", icon: ClipboardList },
];

const publicRoutes = ["/", "/welcome", "/login", "/register", "/forgot-password", "/resend-confirmation", "/reset-password"];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return <Link href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isAuthLoading, isHydrated } = useAppState();
  const { t } = useLanguage();
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopDrawerOpen, setDesktopDrawerOpen] = useState(false);
  const [previousPathname, setPreviousPathname] = useState(pathname);
  const hamburgerButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close drawer on route navigation
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setDesktopDrawerOpen(false);
  }
  const isPublicRoute = publicRoutes.includes(pathname);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");


  // Close drawer on Escape key and return focus to hamburger button
  useEffect(() => {
    if (!desktopDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDesktopDrawerOpen(false);
        hamburgerButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [desktopDrawerOpen]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && !isPublicRoute && !isAdminRoute) {
      router.replace(`/login?auth-error=authentication-required&next=${encodeURIComponent(pathname)}`);
    }
  }, [isAdminRoute, isAuthenticated, isAuthLoading, isPublicRoute, pathname, router]);

  if (isAdminRoute) return <>{children}</>;
  if (isPublicRoute) return <>{children}</>;
  if (isAuthLoading || !isHydrated) return <div className="app-hydration-screen" role="status" aria-live="polite">กำลังโหลดข้อมูล TALEVO...</div>;
  if (!isAuthenticated) return null;

  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(`${href}/`);

  const closeDrawer = () => {
    setDesktopDrawerOpen(false);
    hamburgerButtonRef.current?.focus();
  };

  const quickOptions = [
    { label: t("shell.addTask"), description: t("shell.addTaskDescription"), icon: ClipboardList, href: "/tasks/new" },
    { label: t("shell.addClass"), description: t("shell.addClassDescription"), icon: CalendarDays, href: "/schedule/new" },
  ];

  const moreNavigationOptions = [
    { label: "TALEVO AI", description: "ผู้ช่วยวางแผนและตอบคำถามการเรียน", icon: Bot, href: "/ai" },
    { label: "โปรไฟล์", description: "ข้อมูลส่วนตัวและการศึกษา", icon: UserRound, href: "/profile" },
    { label: "การตั้งค่า", description: "การแจ้งเตือนและระบบการใช้งาน", icon: Settings, href: "/settings" },
  ];

  const isMoreActive = moreNavigationOptions.some((item) => isActive(item.href));

  return (
    <div className={`app-shell ${desktopDrawerOpen ? "desktop-drawer-open" : ""}`}>
      {/* Desktop Navigation Drawer (>= 1200px) */}
      <aside
        id="desktop-nav-drawer"
        className={`desktop-nav-drawer ${desktopDrawerOpen ? "is-open" : ""}`}
        aria-label={t("shell.mainMenu")}
      >
        <div className="drawer-header">
          <Link
            href="/today"
            className="drawer-brand"
            onClick={() => setDesktopDrawerOpen(false)}
            aria-label={t("nav.home") + " TALEVO"}
          >
            <TalevoBrand variant="compact" />
          </Link>
          <button
            type="button"
            className="drawer-close-button icon-button"
            onClick={closeDrawer}
            aria-label="ปิดเมนูหลัก"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="drawer-main" aria-label={t("shell.mainMenu")}>
          {primaryNavigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`drawer-nav-link ${isActive(item.href) ? "active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
              onClick={() => setDesktopDrawerOpen(false)}
            >
              <item.icon aria-hidden="true" />
              <span>{t(item.key)}</span>
            </Link>
          ))}
        </nav>

        <nav className="drawer-bottom" aria-label={t("shell.accountMenu")}>
          <Link
            href="/profile"
            className={`drawer-nav-link ${isActive("/profile") ? "active" : ""}`}
            aria-current={isActive("/profile") ? "page" : undefined}
            onClick={() => setDesktopDrawerOpen(false)}
          >
            <UserRound aria-hidden="true" />
            <span>{t("nav.profile")}</span>
          </Link>
          <Link
            href="/settings"
            className={`drawer-nav-link ${isActive("/settings") ? "active" : ""}`}
            aria-current={isActive("/settings") ? "page" : undefined}
            onClick={() => setDesktopDrawerOpen(false)}
          >
            <Settings aria-hidden="true" />
            <span>{t("nav.settings")}</span>
          </Link>
        </nav>
      </aside>

      <div className="app-workspace">
        <div className="desktop-topbar">
          <button
            ref={hamburgerButtonRef}
            type="button"
            className={`desktop-hamburger-button ${desktopDrawerOpen ? "is-active" : ""}`}
            onClick={() => setDesktopDrawerOpen((prev) => !prev)}
            aria-label={desktopDrawerOpen ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
            aria-expanded={desktopDrawerOpen}
            aria-controls="desktop-nav-drawer"
          >
            <Menu aria-hidden="true" />
          </button>
          <div className="desktop-topbar-right">
            <NotificationBell />
          </div>
        </div>

        <main className={`app-main${pathname === "/ai" ? " app-main-ai" : ""}`}>{children}</main>
      </div>

      {/* Mobile & Tablet Navigation (< 1200px) */}
      <nav className="mobile-bottom-nav" aria-label={t("shell.mobileMenu")}>
        <NavLink href={mobileNavigationItems[0].href} label={t(mobileNavigationItems[0].key)} icon={mobileNavigationItems[0].icon} active={isActive(mobileNavigationItems[0].href)} />
        <NavLink href={mobileNavigationItems[1].href} label={t(mobileNavigationItems[1].key)} icon={mobileNavigationItems[1].icon} active={isActive(mobileNavigationItems[1].href)} />
        <button type="button" className="quick-add-button" onClick={() => setQuickOpen(true)} aria-label={t("shell.quickAdd")} aria-haspopup="dialog" aria-expanded={quickOpen}><Plus aria-hidden="true" /></button>
        <NavLink href={mobileNavigationItems[2].href} label={t(mobileNavigationItems[2].key)} icon={mobileNavigationItems[2].icon} active={isActive(mobileNavigationItems[2].href)} />
        <button
          type="button"
          className={`nav-link nav-link-more ${isMoreActive ? "active" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="เพิ่มเติม"
        >
          <MoreHorizontal aria-hidden="true" />
          <span>เพิ่มเติม</span>
        </button>
      </nav>

      <BottomSheet open={quickOpen} title={t("shell.quickAdd")} onClose={() => setQuickOpen(false)} className="quick-add-sheet">
        <div className="quick-options quick-options-create">
          {quickOptions.map(({ label, description, icon: Icon, href }) => (
            <Link key={href} href={href} onClick={() => setQuickOpen(false)}>
              <span><Icon aria-hidden="true" /></span>
              <div>
                <strong>{label}</strong>
                <small>{description}</small>
              </div>
            </Link>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={moreOpen} title="เพิ่มเติม" onClose={() => setMoreOpen(false)} className="more-navigation-sheet">
        <div className="quick-options more-navigation-options">
          {moreNavigationOptions.map(({ label, description, icon: Icon, href }) => (
            <Link key={href} href={href} onClick={() => setMoreOpen(false)}>
              <span><Icon aria-hidden="true" /></span>
              <div>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
              </div>
            </Link>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
