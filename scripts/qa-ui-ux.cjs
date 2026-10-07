/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const collect = (directory, files = []) => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative, files);
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) files.push(relative);
  }
  return files;
};

const sourceFiles = collect("src");
const source = sourceFiles.map(read).join("\n");
const tsxSource = sourceFiles.filter((file) => file.endsWith(".tsx")).map(read).join("\n");
const globals = read("src/app/globals.css");
const ui = read("src/components/ui.tsx");
const adminCss = read("src/app/admin/admin.css");
const adminUsers = read("src/app/admin/users/page.tsx");
const publicPages = read("src/features/public/public-pages.tsx");
const rootLayout = read("src/app/layout.tsx");
const pwaManifest = read("src/app/manifest.ts");
const pwaRuntime = read("src/components/pwa-runtime.tsx");
const notificationWorker = read("public/talevo-notification-worker.js");
const nextConfig = read("next.config.ts");
const defaults = read("src/lib/app-state-defaults.ts");
const proxy = read("src/proxy.ts");
const qaPage = read("src/app/qa/local-cloud-migration/page.tsx");
const aiProvider = read("src/lib/ai/gemini-provider.ts");
const aiUi = read("src/features/ai/ai-page.tsx");
const appShell = read("src/components/app-shell.tsx");
const schedulePages = read("src/features/schedule/schedule-pages.tsx");
const todayPage = read("src/features/today/today-page.tsx");
const syllabusScanner = read("src/features/academic/syllabus-scanner.tsx");
const syllabusCss = read("src/styles/syllabus-import-composition.css");
const profilePages = read("src/features/profile/profile-pages.tsx");
const taskCreatePage = read("src/features/tasks/task-create-page.tsx");
const packageJson = JSON.parse(read("package.json"));

check(exists("docs/talevo-ui-ux-inventory.md"), "Route/component UI inventory is missing");
check(!/href\s*=\s*["']#["']/.test(tsxSource), "Active UI must not contain href=\"#\"");
check(!/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(tsxSource), "Known empty click handler found");
const unexplainedButtons = sourceFiles.filter((file) => file.endsWith(".tsx")).flatMap((file) => {
  const tags = read(file).match(/<button\b[^>]*>/g) ?? [];
  return tags.filter((tag) => !/onClick=|type="submit"|type="reset"|disabled|\{\.\.\.props\}/.test(tag)).map((tag) => `${file}: ${tag}`);
});
check(unexplainedButtons.length === 0, `Button without action/form/disabled contract: ${unexplainedButtons.join(" | ")}`);

for (const token of [
  "--color-background", "--color-surface", "--color-surface-elevated", "--color-primary",
  "--color-text-primary", "--color-text-secondary", "--color-border", "--color-success",
  "--color-warning", "--color-danger", "--space-1", "--space-12", "--radius-sm",
  "--radius-xl", "--shadow-subtle", "--shadow-card", "--shadow-floating", "--tap-target",
]) check(globals.includes(token), `Missing canonical design token: ${token}`);

check(globals.includes("--tap-target: 44px") && globals.includes('button[aria-label], [role="button"][aria-label]'), "Mobile touch-target contract is missing");
for (const selector of [".notification-page-actions button", ".ai-selected-context button"]) {
  check(globals.includes(selector), `Missing mobile touch-target override: ${selector}`);
}
check(globals.includes("env(safe-area-inset-top)") && globals.includes("env(safe-area-inset-bottom)"), "Mobile safe-area support is incomplete");
check(globals.includes("100svh") && globals.includes("100dvh"), "Stable and dynamic viewport-height fallbacks are required");
check(globals.includes("input, select, textarea, .input { font-size: 16px; }"), "Mobile form controls must prevent iOS auto zoom");
check(read("src/styles/auth-composition.css").includes(".auth-helper a") && read("src/styles/auth-composition.css").includes("min-height: 44px"), "Auth helper links need mobile-sized hit areas");
check(globals.includes("max-height: min(720px, 92dvh)") && globals.includes("overscroll-behavior: contain"), "Bottom sheets must remain inside the viewport");
check(ui.includes('document.body.style.overflow = "hidden"') && ui.includes("previousBodyOverflow"), "Open BottomSheet must lock and restore page scrolling");
check(ui.includes('role="dialog"') && ui.includes('aria-modal="true"') && ui.includes('event.key === "Escape"'), "Dialog semantics or Escape support is missing");
check(ui.includes("previousFocusRef.current?.focus()") && ui.includes('event.key !== "Tab"'), "BottomSheet focus trap/restoration is missing");

check(ui.includes('role="alert"') && ui.includes("field-error"), "Field errors must be announced accessibly");
check(ui.includes('aria-label={label}') && ui.includes("export function IconButton"), "Canonical icon-only button must require an accessible label");
check(globals.includes(":focus-visible") && !globals.includes(":focus-visible { outline: none"), "Visible keyboard focus styling is missing");
check(globals.includes("prefers-reduced-motion: reduce"), "Reduced-motion support is missing");
check(appShell.includes('aria-current={active ? "page" : undefined}'), "Active navigation links must expose aria-current");
const mobileNavSource = appShell.match(/const mobileNavigationItems = \[([\s\S]*?)\];/)?.[1] ?? "";
check(["/today", "/schedule", "/tasks"].every((href) => mobileNavSource.includes(`href: "${href}"`)), "Mobile navigation must contain Home, Schedule, and Tasks routes");
check(!mobileNavSource.includes('href: "/finance"'), "Finance must not appear in the mobile navigation");
check(appShell.includes('aria-label="เพิ่มเติม"') && appShell.includes("setMoreOpen(true)"), "Mobile navigation must include 'เพิ่มเติม' button");
check(appShell.includes('aria-haspopup="dialog"') && appShell.includes('aria-expanded={quickOpen}'), "Quick Add must expose its dialog state");
check(appShell.includes('aria-expanded={moreOpen}'), "More navigation must expose its dialog state");
for (const href of ["/ai", "/profile", "/settings"]) {
  check(appShell.includes(`href: "${href}"`), `More navigation sheet is missing ${href}`);
}
check(!appShell.includes('href: "/exams"'), "Exams must not appear in the More navigation sheet or desktop sidebar");
check(!appShell.includes('href: "/finance"'), "Finance must not appear in More navigation or desktop sidebar");
check(!appShell.includes('href: "/grades"'), "Grades should no longer be a standalone destination in More navigation or Sidebar");
check(!appShell.includes('href: "/statistics"'), "Statistics must be completely removed from navigation");
for (const href of ["/tasks/new", "/schedule/new"]) {
  check(appShell.includes(`href: "${href}"`), `Quick Add creation sheet is missing ${href}`);
}
check(!appShell.includes('href: "/exams/new"'), "Quick Add must not contain the retired exam route");
check(!appShell.includes('href: "/finance/new"'), "Quick Add must not contain finance/new");
check(appShell.includes('grid-column: 3') || globals.includes('grid-column: 3'), "Quick Add button must occupy the centered mobile-nav grid column");
check(globals.includes('.quick-add-button { display: grid; width: 56px; height: 56px; grid-column: 3;'), "Quick Add needs a centered 44px-or-larger touch target");
check(schedulePages.includes('"ยังไม่ได้ตั้งค่าภาคเรียน"') && schedulePages.includes("formatAcademicTermSummary(academicTerm)"), "Empty academic-term summaries must not render stray separators");
check(!exists("src/app/attendance/page.tsx") && !exists("src/app/attendance/[courseId]/page.tsx"), "Attendance routes must be removed instead of being visually hidden");
check(!source.includes('href={`/attendance') && !source.includes('href="/attendance') && !source.includes('"/attendance"'), "Product UI must not retain attendance navigation targets");
check(!read("src/providers/app-state-provider.tsx").includes("addAttendance") && !read("src/providers/app-state-provider.tsx").includes("attendanceRecords"), "Attendance state and actions must not remain exposed by AppState");
check(todayPage.includes("getTodayClasses(schedules, referenceDate)") && todayPage.includes("NextClassCard classes={view.classes}"), "Today and Next Class must continue to derive from schedule data without Attendance");
check(schedulePages.includes("getScheduleWeekDates(selectedDate)") && schedulePages.includes("item.day === day") && schedulePages.includes("getHorizontalEventPosition(item, range)"), "Week View must render canonical weekday rows with mathematical horizontal time positions");
check(schedulePages.includes("getHorizontalTimelinePercent(minute, range)") && schedulePages.includes("timetable-time-marker") && schedulePages.includes("timetable-grid-guide-line"), "Week View hour markers and grid guides must share the timeline positioning scale");
check(schedulePages.includes("layoutHorizontalDay(daySchedules)") && schedulePages.includes("lanes > 1"), "Week View must preserve overlapping classes using row lanes");
check(schedulePages.includes("getScheduleDisplayName(item)") && schedulePages.includes("formatThaiWeekday(date)"), "Week View cards need safe course-code fallback and readable canonical weekday labels");
check(syllabusScanner.includes(">เลือกทั้งหมด</button>") && syllabusScanner.includes(">ยกเลิกทั้งหมด</button>") && !syllabusScanner.includes("เลือกเฉพาะที่อ่านชัด"), "Syllabus Preview bulk-selection labels are incorrect");
check((syllabusScanner.match(/setAllSyllabusPreviewSelected\(preview, true\)/g) ?? []).length === 1 && (syllabusScanner.match(/setAllSyllabusPreviewSelected\(preview, false\)/g) ?? []).length === 1, "Syllabus Preview must expose one Select All and one Unselect All action");
check(syllabusScanner.includes('className="syllabus-import-header"') && syllabusScanner.includes('className="syllabus-import-body"') && syllabusScanner.includes('className="syllabus-import-action"'), "Import modal must be partitioned into header, body, and footer");
check(!/\.syllabus-import-action\s*\{[^}]*position:\s*fixed/i.test(syllabusCss), "Import action footer must not be viewport-fixed");
check(syllabusCss.includes(".syllabus-import-body") && /\.syllabus-import-body\s*\{[^}]*overflow-y:\s*auto/i.test(syllabusCss), "Preview body must be independently scrollable with overflow-y: auto");
check(/\.syllabus-import-body\s*\{[^}]*padding:[^;]*24px/i.test(syllabusCss), "Preview body must supply generous bottom padding so final row is never covered by footer");
check(syllabusScanner.includes('disabled={readiness.importableCount === 0 || importing}') && syllabusScanner.includes('readiness.importableCount === 0 ? "ยังไม่มีรายการที่พร้อมเพิ่ม"'), "No ready records must disable Confirm button and show empty state message");
check(syllabusScanner.includes('`ยืนยันและเพิ่ม ${readiness.importableCount} รายการ`'), "Valid selected records must enable Confirm button with accurate count");
check(syllabusScanner.includes('`พร้อมเพิ่ม ${readiness.importableCount} รายการ`') && syllabusScanner.includes('readiness.readyCount'), "Selected and ready count indicators must accurately reflect readiness state");
check(/\.bottom-sheet\.syllabus-import-sheet\s*\{[^}]*max-height:\s*min\(88dvh/i.test(syllabusCss) && /\.bottom-sheet\.syllabus-import-sheet\s*\{[^}]*width:\s*min\(820px/i.test(syllabusCss), "Desktop import modal must safely constrain dimensions to viewport");
check(/@media\s*\(max-width:\s*699px\)[\s\S]*?\.bottom-sheet\.syllabus-import-sheet\s*\{[^}]*max-height:\s*92dvh/i.test(syllabusCss), "Mobile import modal must constrain max-height to 92dvh");
check(/\.bottom-sheet\.syllabus-import-sheet\s*\{[^}]*overflow:\s*hidden/i.test(syllabusCss), "Modal container must have overflow: hidden to prevent double vertical scrollbars");
check(profilePages.includes("joinAcademicDetails") && profilePages.includes('academicTerm.level || "ยังไม่ได้ระบุ"'), "Empty profile academic details need readable fallbacks");
check(taskCreatePage.includes('aria-label={t("tasks.subtasks")}'), "Task subtask input needs an accessible name");
check(!exists("src/features/finance/finance-pages.tsx"), "Standalone finance page must be removed");
check(read("src/app/finance/page.tsx").includes('redirect("/today")'), "/finance must redirect to /today");
check(read("src/app/finance/new/page.tsx").includes('redirect("/today")'), "/finance/new must redirect to /today");
for (const route of ["src/app/exams/page.tsx", "src/app/exams/new/page.tsx", "src/app/exams/[id]/page.tsx"]) {
  check(read(route).includes('redirect("/today")'), `${route} must redirect to /today`);
}
check(!todayPage.includes("smart-finance") && !todayPage.includes('t("today.finance")'), "Today page must not render finance controls");
check(!todayPage.includes("SemesterWeather") && !todayPage.includes("semester-weather"), "Today page must not render the weather panel");
check(!todayPage.includes("upcomingExam") && !todayPage.includes("smart-exam-context"), "Today page must not render exam information");
check(todayPage.includes("formatHomeGreeting(profile.displayName"), "Today page must format personalized greeting from authenticated profile");
check(!todayPage.includes('displayName = "'), "Today page must not hardcode any user name");

const aiPage = read("src/features/ai/ai-page.tsx");
check(aiPage.includes('<TalevoMascotAvatar size="sm"'), "AI header must use TalevoMascotAvatar size sm");
check(aiPage.includes('<TalevoMascotAvatar size="lg"'), "AI empty state must use TalevoMascotAvatar size lg");
check(exists("public/brand/talevo-mascot-head.png"), "Approved brand mascot head asset must exist");

// Responsive Desktop Hamburger Navigation & Tablet Mobile Navigation Contract
check(globals.includes("@media (min-width: 1200px)"), "Desktop layout must activate at >= 1200px breakpoint");
check(globals.includes(".desktop-hamburger-button"), "Desktop hamburger button styles must exist");
check(appShell.includes('className={`desktop-hamburger-button'), "AppShell must render desktop hamburger button");
check(globals.includes(".desktop-sidebar { display: none !important; }"), "Permanent desktop sidebar must be absent from desktop layout");
check(appShell.includes('setDesktopDrawerOpen((prev) => !prev)'), "Hamburger button must toggle desktop drawer open/closed");
check(!appShell.includes("drawer-backdrop"), "Desktop backdrop must be removed from AppShell");
check(globals.includes(".drawer-backdrop {") && globals.includes("display: none !important"), "Desktop backdrop must be disabled in CSS");
check(globals.includes("width: 260px") && globals.includes(".app-shell.desktop-drawer-open .desktop-nav-drawer"), "Desktop drawer width must be 260px in open state");
check(globals.includes(".desktop-topbar {") && globals.includes("padding: 16px 24px 0"), "Desktop topbar must align controls close to viewport edges");
check(appShell.includes("className=\"drawer-close-button icon-button\"") && appShell.includes("onClick={closeDrawer}"), "Drawer close button must trigger closeDrawer");
check(appShell.includes('event.key === "Escape"') && appShell.includes("setDesktopDrawerOpen(false)"), "Escape key must close desktop drawer");
check(appShell.includes('onClick={() => setDesktopDrawerOpen(false)}') && appShell.includes("drawer-nav-link"), "Navigation links in drawer must close drawer on click");
check(globals.includes(".app-main {") && globals.includes("max-width: 1240px") && globals.includes("margin: 0 auto"), "Desktop content must be centered with max-width and auto margins");
check(globals.includes("@media (max-width: 1199px)") && globals.includes(".mobile-bottom-nav { display: grid; }"), "Tablet (< 1200px including 1024px, 834px, 768px) must display mobile navigation");
check(globals.includes("@media (max-width: 1199px)") && globals.includes(".desktop-topbar { display: none !important; }"), "Tablet (< 1200px) must hide desktop topbar");
check(globals.includes("@media (max-width: 1199px)") && globals.includes(".desktop-nav-drawer { display: none !important; }"), "Tablet (< 1200px) must hide desktop drawer");
check(appShell.includes('className="mobile-bottom-nav"'), "Mobile bottom nav component must remain in AppShell");
check(appShell.includes('setQuickOpen(true)') && appShell.includes('quickOptions'), "Quick Add modal functionality must remain intact");
check(appShell.includes('setMoreOpen(true)') && appShell.includes('moreNavigationOptions'), "More navigation sheet must remain intact");
check(!appShell.includes('href: "/finance"'), "Finance must not be restored in navigation");
check(!appShell.includes('href: "/statistics"'), "Statistics must not be restored in navigation");
check(!appShell.includes('href: "/grades"') && !appShell.includes('key: "nav.grades"'), "Standalone Grade Planning must not appear in navigation drawer");
check(read("src/styles/today-composition.css").includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "Today cards must support 2-column layout on tablet/desktop");
check(read("src/styles/today-composition.css").includes(".smart-today-primary-grid > .smart-free-time") && read("src/styles/today-composition.css").includes("grid-column: 1 / -1"), "Today free-time card must span the full tablet/desktop grid row");
check(todayPage.includes("classCount > 0") && todayPage.includes("วันนี้ไม่มีคาบเรียนถัดไป"), "Today recommendation must not show empty onboarding when today's classes already exist");
check(read("src/features/ai/ai-page.tsx").includes("ai-premium-page"), "AI page layout and workspace must remain unaffected");
check(read("src/styles/ai-composition.css").includes(".app-main.app-main-ai") && read("src/styles/ai-composition.css").includes("min-height: 100dvh") && read("src/styles/ai-composition.css").includes("overflow: visible") && read("src/styles/ai-composition.css").includes("position: static") && read("src/styles/ai-composition.css").includes("bottom: auto"), "AI mobile/tablet layout must use one page scroll without a clipped shell or floating composer");
check(read("src/features/ai/ai-page.tsx").includes("attempt < 2") && read("src/features/ai/ai-page.tsx").includes("8_000"), "AI status must retry once with a bounded request timeout on unstable mobile networks");
check(pwaManifest.includes('display: "standalone"') && pwaManifest.includes('start_url: "/"') && pwaManifest.includes('purpose: "maskable"'), "PWA manifest must install TALEVO as a standalone app with a maskable icon");
check(rootLayout.includes("appleWebApp") && rootLayout.includes('viewportFit: "cover"') && rootLayout.includes("<PwaRuntime />"), "Root layout must support iOS standalone mode, safe areas and Service Worker registration");
check(pwaRuntime.includes('navigator.serviceWorker.register') && pwaRuntime.includes('window.isSecureContext'), "PWA runtime must register its Service Worker only in a secure context");
check(notificationWorker.includes('addEventListener("push"') && notificationWorker.includes('addEventListener("notificationclick"'), "PWA worker must support safe push display and notification navigation");
check(nextConfig.includes('source: "/talevo-notification-worker.js"') && nextConfig.includes('Service-Worker-Allowed'), "Service Worker must update safely and control the full app scope");
check(read("src/features/schedule/schedule-pages.tsx").includes("getScheduleWeekDates"), "Schedule page timeline calculations must remain unaffected");

// Retired Grade Planning Contract
const taskPagesSrc = read("src/features/tasks/task-pages.tsx");
const gradesIndexRoute = read("src/app/grades/page.tsx");
const gradesDetailRoute = read("src/app/grades/[courseId]/page.tsx");
check(!taskPagesSrc.includes("tasks-view-switcher") && !taskPagesSrc.includes("GradesOverviewView") && !taskPagesSrc.includes("view=grades"), "Tasks page must not expose Grade Planning");
check(gradesIndexRoute.includes('redirect("/tasks")') && gradesDetailRoute.includes('redirect("/tasks")'), "Retired Grade Planning URLs must redirect to Tasks");
check(!aiUi.includes('{ key: "grades"') && !aiUi.includes("BarChart3"), "AI context picker must not expose Grade Planning");

check(globals.includes(".primary-button") && globals.includes(".secondary-button") && globals.includes(".icon-button") && source.includes(".danger-button"), "Canonical button variants are incomplete");
check(ui.includes("export function EmptyState") && ui.includes('className="empty-state"'), "Canonical empty state is missing");
check(source.includes('role="status"'), "Loading/success status announcements are missing");
check(source.includes('role="alert"'), "Error announcements are missing");

check(adminCss.includes("@media (max-width: 620px)") && adminCss.includes(".admin-table { min-width: 0; display: block"), "Admin directory must switch from the wide table on phones");
check((adminUsers.match(/data-label=/g) ?? []).length === 5, "Admin mobile user cards need five readable field labels");
check(!adminCss.includes("focus-visible { background: rgb(255 255 255 / 10%); color: #fff; outline: none"), "Admin navigation must not suppress focus without an alternative");
check(globals.includes(".page .floating-add { display: none; }"), "Feature pages must not duplicate the global mobile add action");

for (const collection of ["schedules", "tasks", "exams", "gradePlans", "financeTransactions", "savingGoals", "notifications", "chat"]) {
  check(defaults.includes(`${collection}: []`), `New-account state must not seed demo ${collection}`);
}
check(!/localStorage\.clear\s*\(/.test(source) && !/indexedDB\.deleteDatabase\s*\(/.test(source), "UI source must not clear all local user data");

check(publicPages.includes('registrationStep === 1') && publicPages.includes('registrationStep === 2'), "Two-step registration regressed");
check(publicPages.includes('router.push("/today")') && (publicPages.includes("isRegisterSuccess") || publicPages.includes("requiresEmailConfirmation")), "Register success flow regressed");
check(proxy.includes('process.env.NODE_ENV !== "development"') && proxy.includes('startsWith("/qa/")'), "Production QA-route proxy guard is missing");
check(qaPage.includes('process.env.NODE_ENV !== "development"') && qaPage.includes("notFound()"), "Production QA page guard is missing");
check(aiProvider.includes('process.env.NODE_ENV === "development"') && !aiUi.includes("providerDebug") && !aiUi.includes("interactions.create"), "AI provenance must stay out of the student-facing UI");
check(!aiUi.includes("GEMINI_API_KEY") && !aiUi.includes("SUPABASE_SECRET_KEY"), "Server secret name leaked into client UI");
check(packageJson.scripts["qa:ui-ux"] === "node scripts/qa-ui-ux.cjs", "qa:ui-ux package script is missing");

check(exists("src/app/error.tsx") && exists("src/app/global-error.tsx") && exists("src/app/not-found.tsx"), "App, root, or not-found recovery UI is missing");
const appError = read("src/app/error.tsx");
const globalError = read("src/app/global-error.tsx");
const notFound = read("src/app/not-found.tsx");
check(appError.includes('role="alert"') && appError.includes("retry") && appError.includes("ข้อมูลในอุปกรณ์ไม่ได้ถูกลบ"), "Route error must announce failure, preserve data confidence, and offer retry");
check(globalError.includes('role="alert"') && globalError.includes("100dvh") && globalError.includes("retry"), "Root error UI must remain usable on mobile and recoverable");
check(notFound.includes("/today") && notFound.includes("/help"), "404 UI must offer clear recovery destinations");
check(accountActionsContract(read("src/components/account-actions.tsx")), "Account deletion must separate destructive action with two-step acknowledgement");
check(globals.includes("overflow-wrap: anywhere") && globals.includes("min-width: 0"), "Long content must wrap without forcing horizontal overflow");
check(globals.includes("body { min-width: 0") && globals.includes("overflow-x: hidden") && globals.includes(".app-main { width: 100%"), "Global responsive content width constraint is missing");
check(packageJson.scripts["qa:security"] && packageJson.scripts["qa:reliability"], "Security/reliability QA scripts are not wired into package.json");

console.log(`TALEVO UI/UX contract: ${checks} checks passed`);

function accountActionsContract(value) {
  return value.includes('step === "warning"')
    && value.includes('setStep("confirm")')
    && value.includes("ConfirmationPhraseInput")
    && value.includes("phrase !== requiredPhrase");
}
