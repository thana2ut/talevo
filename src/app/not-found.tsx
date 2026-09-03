import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <main className="system-state-page">
      <section className="system-state-card">
        <span className="system-state-icon"><MapPinOff aria-hidden="true" /></span>
        <p className="eyebrow">404 · TALEVO</p>
        <h1>ไม่พบหน้าที่ต้องการ</h1>
        <p>ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ไม่มีอยู่แล้ว</p>
        <div className="system-state-actions">
          <Link className="primary-button" href="/today">กลับหน้าหลัก</Link>
          <Link className="secondary-button" href="/help">เปิดศูนย์ช่วยเหลือ</Link>
        </div>
      </section>
    </main>
  );
}
