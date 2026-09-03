import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AppStateProvider } from "@/providers/app-state-provider";
import { SupabaseAuthProvider } from "@/providers/auth-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { LEGACY_KERNOVA_LANGUAGE_STORAGE_KEY, TALEVO_LANGUAGE_STORAGE_KEY } from "@/lib/talevo-storage-keys";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "TALEVO", template: "%s | TALEVO" },
  description: "จัดการตารางเรียน งาน การสอบ คะแนน และการเงินในชีวิตมหาวิทยาลัยให้อยู่ในที่เดียว",
};

const languageBootstrapScript = `try { const current = localStorage.getItem(${JSON.stringify(TALEVO_LANGUAGE_STORAGE_KEY)}); const legacy = current === null ? localStorage.getItem(${JSON.stringify(LEGACY_KERNOVA_LANGUAGE_STORAGE_KEY)}) : null; const language = current === "th" || current === "en" ? current : legacy === "th" || legacy === "en" ? legacy : "th"; if (current === null && (legacy === "th" || legacy === "en")) localStorage.setItem(${JSON.stringify(TALEVO_LANGUAGE_STORAGE_KEY)}, legacy); document.documentElement.lang = language; } catch { document.documentElement.lang = "th"; }`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${notoSansThai.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: languageBootstrapScript }} /></head>
      <body className="min-h-full"><LanguageProvider><SupabaseAuthProvider><AppStateProvider><AppShell>{children}</AppShell></AppStateProvider></SupabaseAuthProvider></LanguageProvider></body>
    </html>
  );
}
