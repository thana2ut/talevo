"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/providers/language-provider";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const english = useLanguage().language === "en";
  return (
    <main className="system-state-page" role="alert">
      <section className="system-state-card">
        <span className="system-state-icon"><AlertTriangle aria-hidden="true" /></span>
        <p className="eyebrow">TALEVO</p>
        <h1>{english ? "This page could not load" : "หน้านี้ทำงานไม่สำเร็จ"}</h1>
        <p>{english ? "Your data has not been deleted. Try loading this page again or return home." : "ข้อมูลในอุปกรณ์ไม่ได้ถูกลบ ลองโหลดส่วนนี้อีกครั้ง หรือกลับไปหน้าหลัก"}</p>
        <div className="system-state-actions">
          <button className="primary-button" type="button" onClick={retry}><RefreshCw aria-hidden="true" />{english ? "Try again" : "ลองอีกครั้ง"}</button>
          <Link className="secondary-button" href="/today">{english ? "Back to home" : "กลับหน้าหลัก"}</Link>
        </div>
      </section>
    </main>
  );
}
