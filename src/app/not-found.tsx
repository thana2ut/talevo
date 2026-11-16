"use client";
import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { useLanguage } from "@/providers/language-provider";

export default function NotFound() {
  const english = useLanguage().language === "en";
  return (
    <main className="system-state-page">
      <section className="system-state-card">
        <span className="system-state-icon"><MapPinOff aria-hidden="true" /></span>
        <p className="eyebrow">404 · TALEVO</p>
        <h1>{english ? "Page not found" : "ไม่พบหน้าที่ต้องการ"}</h1>
        <p>{english ? "The link may be incorrect or this page no longer exists." : "ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ไม่มีอยู่แล้ว"}</p>
        <div className="system-state-actions">
          <Link className="primary-button" href="/today">{english ? "Back to home" : "กลับหน้าหลัก"}</Link>
          <Link className="secondary-button" href="/help">{english ? "Help center" : "เปิดศูนย์ช่วยเหลือ"}</Link>
        </div>
      </section>
    </main>
  );
}
