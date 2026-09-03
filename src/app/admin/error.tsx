"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const developmentDiagnostic = process.env.NODE_ENV === "development" ? error.message : "";
  return <section className="admin-error" role="alert"><span><TriangleAlert aria-hidden="true" /></span><h1>โหลดข้อมูล Admin ไม่สำเร็จ</h1><p>ระบบไม่แสดงข้อมูลบางส่วนเพื่อความปลอดภัย กรุณาลองใหม่อีกครั้ง</p>{developmentDiagnostic ? <code>{developmentDiagnostic}</code> : null}<button type="button" onClick={reset}><RotateCcw aria-hidden="true" />ลองใหม่</button></section>;
}
