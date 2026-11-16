import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Noto_Sans_Thai } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { PwaRuntime } from "@/components/pwa-runtime";
import { AppStateProvider } from "@/providers/app-state-provider";
import { SupabaseAuthProvider } from "@/providers/auth-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { LEGACY_KERNOVA_LANGUAGE_STORAGE_KEY, TALEVO_LANGUAGE_STORAGE_KEY } from "@/lib/talevo-storage-keys";
import "./globals.css";
import "@/styles/dark-mode.css";
import "@/styles/desktop-polish.css";
import "@/styles/home-aurora.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "TALEVO", template: "%s | TALEVO" },
  description: "จัดการตารางเรียนและงานในชีวิตมหาวิทยาลัยให้อยู่ในที่เดียว",
  applicationName: "TALEVO",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TALEVO",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f3e9fc",
  colorScheme: "light dark",
};

const languageBootstrapScript = `try { const current = localStorage.getItem(${JSON.stringify(TALEVO_LANGUAGE_STORAGE_KEY)}); const legacy = current === null ? localStorage.getItem(${JSON.stringify(LEGACY_KERNOVA_LANGUAGE_STORAGE_KEY)}) : null; const language = current === "th" || current === "en" ? current : legacy === "th" || legacy === "en" ? legacy : "th"; if (current === null && (legacy === "th" || legacy === "en")) localStorage.setItem(${JSON.stringify(TALEVO_LANGUAGE_STORAGE_KEY)}, legacy); document.documentElement.lang = language; } catch { document.documentElement.lang = "th"; }`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${notoSansThai.variable} h-full antialiased`}
    >
      <head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: `try { const isDark = localStorage.getItem("talevo-theme") === "dark"; document.documentElement.dataset.theme = isDark ? "dark" : "light"; const themeColor = document.querySelector('meta[name="theme-color"]'); if (themeColor) themeColor.content = isDark ? "#100b20" : "#f3e9fc"; } catch { document.documentElement.dataset.theme = "light"; }` }} /><script nonce={nonce} dangerouslySetInnerHTML={{ __html: languageBootstrapScript }} /></head>
      <body className="min-h-full"><PwaRuntime /><LanguageProvider><SupabaseAuthProvider><AppStateProvider><AppShell>{children}</AppShell></AppStateProvider></SupabaseAuthProvider></LanguageProvider></body>
    </html>
  );
}
