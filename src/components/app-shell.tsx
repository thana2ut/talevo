"use client";

import Link from "next/link";
import { StartupScreen } from "@/components/startup-screen";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bot, CalendarDays, ChevronRight, ClipboardList, GraduationCap, Home, Menu, MoreHorizontal, Plus, Settings, UserRound } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { BottomSheet, TalevoBrand, NotificationBell } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import { VoiceCommandSheet } from "@/features/ai/voice-command-sheet";
import { AiAssistiveTouch } from "@/features/ai/ai-assistive-touch";
import { Mic, ScanLine, Calculator } from "lucide-react";
import { useUiText } from "@/providers/ui-language";
import { PwaInstallNotice } from "@/components/pwa-install-notice";


// Shared ordering and Thai labels across desktop, tablet and phone menus.
const featureNavigationItems = [
  { href: "/schedule", label: "ตารางเรียน", description: "จัดตารางเรียนและเวลาว่าง", icon: CalendarDays },
  { href: "/tasks", label: "งาน", description: "จัดการงานค้าง งานใกล้ส่ง และงานที่เสร็จแล้ว", icon: ClipboardList },
  { href: "/exams", label: "การสอบ", description: "ตารางสอบและเตือนวันสอบ", icon: GraduationCap },
  { href: "/grade-lab", label: "คำนวณคะแนน", description: "เก็บคะแนนรายวิชา วางแผนคะแนนให้ถึง A", icon: Calculator },
  { href: "/vision", label: "นำงานเข้าจากภาพ", description: "นำเข้างานจากภาพ Google Classroom", icon: ScanLine },
  { href: "/ai", label: "TALEVO AI", description: "ผู้ช่วยวางแผนและตอบคำถามการเรียน", icon: Bot },
];

const primaryNavigationItems = [
  { href: "/today", label: "หน้าหลัก", icon: Home },
  ...featureNavigationItems,
];

const mobileNavigationItems = [
  { href: "/today", label: "หน้าหลัก", icon: Home },
  { href: "/schedule", label: "ตารางเรียน", icon: CalendarDays },
  { href: "/tasks", label: "งาน", icon: ClipboardList },
];

const publicRoutes = ["/", "/welcome", "/login", "/register", "/forgot-password", "/resend-confirmation", "/reset-password"];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  const uiText = useUiText();

  return <Link href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{uiText(label)}</span></Link>;
}

export function AppShell({ children }: { children: ReactNode }) {

  return <Suspense fallback={null}><PwaInstallNotice /><AppShellContent>{children}</AppShellContent></Suspense>;
}

function AppShellContent({ children }: { children: ReactNode }) {
  const uiText = useUiText();

  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isAuthLoading, isHydrated } = useAppState();
  const { t } = useLanguage();
  const [startupComplete, setStartupComplete] = useState(false);
  useEffect(() => {
    if (isAuthLoading || !isHydrated) return;
    // Show the real completed state before dismissing the screen.
    const timer = window.setTimeout(() => setStartupComplete(true), 350);
    return () => window.clearTimeout(timer);
  }, [isAuthLoading, isHydrated]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopDrawerOpen, setDesktopDrawerOpen] = useState(false);
  const [previousPathname, setPreviousPathname] = useState(pathname);
  const hamburgerButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    if (drawerWasOpen.current && !desktopDrawerOpen) hamburgerButtonRef.current?.focus();
    drawerWasOpen.current = desktopDrawerOpen;
  }, [desktopDrawerOpen]);

  // Close drawer on route navigation
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setDesktopDrawerOpen(false);
  }
  const isPublicRoute = publicRoutes.includes(pathname);


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
    if (!isAuthLoading && !isAuthenticated && !isPublicRoute) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isAuthLoading, isPublicRoute, pathname, router]);

  if (!startupComplete) return <StartupScreen authReady={!isAuthLoading} dataReady={isHydrated} />;
  if (isPublicRoute) return <>{children}</>;
  if (!isAuthenticated) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const closeDrawer = () => {
    setDesktopDrawerOpen(false);
  };

  const quickOptions = [
    { label: "เพิ่มงาน", description: "สร้างงานและกำหนดวันส่ง", icon: ClipboardList, href: "/tasks/new" },
    { label: "เพิ่มคาบเรียน", description: "เพิ่มวิชาลงตารางเรียน", icon: CalendarDays, href: "/schedule/new" },
  ];

  const moreNavigationOptions = [
    ...featureNavigationItems.filter(({ href }) => href !== "/schedule" && href !== "/tasks" && href !== "/vision"),
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
          <button type="button" className="drawer-close-button icon-button" onClick={closeDrawer} aria-label={uiText("ย้อนกลับและปิดเมนูหลัก")}>
            <ArrowLeft aria-hidden="true" />
          </button>
        </div>

        <nav className="drawer-main" aria-label={t("shell.mainMenu")}>
          {primaryNavigationItems.slice(0, 1).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`drawer-nav-link ${isActive(item.href) ? "active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
              onClick={() => setDesktopDrawerOpen(false)}
            >
              <item.icon aria-hidden="true" />
              <span>{uiText(item.label)}</span>
            </Link>
          ))}
          <button type="button" className="drawer-nav-link drawer-voice-launch" onClick={() => { setDesktopDrawerOpen(false); setVoiceOpen(true); }} aria-haspopup="dialog" aria-expanded={voiceOpen}>
            <Mic aria-hidden="true" /><span>{uiText("เพิ่มด้วยเสียง")}</span><small>AI</small>
          </button>
          {primaryNavigationItems.slice(1).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`drawer-nav-link ${isActive(item.href) ? "active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
              onClick={() => setDesktopDrawerOpen(false)}
            >
              <item.icon aria-hidden="true" />
              <span>{uiText(item.label)}</span>
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
            <span>{uiText("โปรไฟล์")}</span>
          </Link>
          <Link
            href="/settings"
            className={`drawer-nav-link ${isActive("/settings") ? "active" : ""}`}
            aria-current={isActive("/settings") ? "page" : undefined}
            onClick={() => setDesktopDrawerOpen(false)}
          >
            <Settings aria-hidden="true" />
            <span>{uiText("การตั้งค่า")}</span>
          </Link>
        </nav>
      </aside>

      <div className="app-workspace">
        <div className="desktop-topbar">
          <div className="desktop-topbar-left">{!desktopDrawerOpen && <button
            ref={hamburgerButtonRef}
            type="button"
            className={`desktop-hamburger-button ${desktopDrawerOpen ? "is-active" : ""}`}
            onClick={() => setDesktopDrawerOpen((prev) => !prev)}
            aria-label={desktopDrawerOpen ? uiText("ปิดเมนูหลัก") : uiText("เปิดเมนูหลัก")}
            aria-expanded={desktopDrawerOpen}
            aria-controls="desktop-nav-drawer"
          >
            <Menu aria-hidden="true" />
          </button>}</div>
          <div className="desktop-topbar-right">
            <NotificationBell />
          </div>
        </div>

        <main className={`app-main${pathname === "/ai" ? " app-main-ai" : ""}`}>{children}</main>
      </div>

      {/* Mobile & Tablet Navigation (< 1200px) */}
      <nav className="mobile-bottom-nav" aria-label={t("shell.mobileMenu")}>
        <NavLink href={mobileNavigationItems[0].href} label={uiText(mobileNavigationItems[0].label)} icon={mobileNavigationItems[0].icon} active={isActive(mobileNavigationItems[0].href)} />
        <NavLink href={mobileNavigationItems[1].href} label={uiText(mobileNavigationItems[1].label)} icon={mobileNavigationItems[1].icon} active={isActive(mobileNavigationItems[1].href)} />
        <button type="button" className="quick-add-button" onClick={() => setQuickOpen(true)} aria-label={uiText("เพิ่มรายการ")} aria-haspopup="dialog" aria-expanded={quickOpen}><Plus aria-hidden="true" /></button>
        <NavLink href={mobileNavigationItems[2].href} label={uiText(mobileNavigationItems[2].label)} icon={mobileNavigationItems[2].icon} active={isActive(mobileNavigationItems[2].href)} />
        <button
          type="button"
          className={`nav-link nav-link-more ${isMoreActive ? "active" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label={uiText("เพิ่มเติม")}
        >
          <MoreHorizontal aria-hidden="true" />
          <span>{uiText("เพิ่มเติม")}</span>
        </button>
      </nav>

      <AiAssistiveTouch hidden={voiceOpen || quickOpen || moreOpen || desktopDrawerOpen || pathname === "/rescue"} onOpen={() => setVoiceOpen(true)} />

      <BottomSheet open={quickOpen} title={uiText("เพิ่มรายการ")} onClose={() => setQuickOpen(false)} className="quick-add-sheet">
        <div className="quick-options quick-options-create">
          <button type="button" className="voice-quick-entry" onClick={() => { setQuickOpen(false); setVoiceOpen(true); }}>
            <span><Mic aria-hidden="true" /></span>
            <div><strong>{uiText("เพิ่มด้วยเสียง")}<em>AI</em></strong><small>{uiText("พูดเพื่อเพิ่มงาน การสอบ หรือจัดการคาบเรียน")}</small></div>
            <ChevronRight className="quick-option-chevron" aria-hidden="true" />
          </button>
          <Link href="/vision" aria-current={isActive("/vision") ? "page" : undefined} onClick={() => setQuickOpen(false)}><span><ScanLine aria-hidden="true" /></span><div><strong>{uiText("นำงานเข้าจากภาพ")}</strong><small>{uiText("สแกนภาพ Classroom หลายรูป แล้วตรวจสอบก่อนนำเข้า")}</small></div><ChevronRight className="quick-option-chevron" aria-hidden="true" /></Link>
          {quickOptions.map(({ label, description, icon: Icon, href }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} onClick={() => setQuickOpen(false)}>
              <span><Icon aria-hidden="true" /></span>
              <div>
                <strong>{uiText(label)}</strong>
                <small>{uiText(description)}</small>
              </div>
              <ChevronRight className="quick-option-chevron" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </BottomSheet>

      {voiceOpen && <VoiceCommandSheet onClose={() => setVoiceOpen(false)} />}

      <BottomSheet open={moreOpen} title={uiText("เพิ่มเติม")} onClose={() => setMoreOpen(false)} className="more-navigation-sheet">
        <div className="quick-options more-navigation-options">
          {moreNavigationOptions.map(({ label, description, icon: Icon, href }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} onClick={() => setMoreOpen(false)}>
              <span><Icon aria-hidden="true" /></span>
              <div>
                <strong>{uiText(label)}</strong>
                {description && <small>{uiText(description)}</small>}
              </div>
            </Link>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
