"use client";

import { useEffect } from "react";
import Image from "next/image";
import "./startup-screen.css";

/** Stage completion comes from authentication and account hydration, never a timer. */
export function StartupScreen({ authReady = false, dataReady = false }: { authReady?: boolean; dataReady?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previous = meta?.content;
    const sync = () => { if (meta) meta.content = root.dataset.theme === "dark" ? "#100b20" : "#f3e9fc"; };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { observer.disconnect(); if (meta && previous) meta.content = previous; };
  }, []);
  const complete = Number(authReady) + Number(dataReady);
  return <div className="startup-screen" role="status" aria-live="polite" aria-busy={complete < 2}>
    <div className="startup-waves" aria-hidden="true"><span/><span/></div>
    <div className="startup-content">
      <div className="startup-art" aria-hidden="true"><span className="startup-orbit"/><span className="startup-orbit second"/><Image src="/assets/startup/mascot.png" alt="" width={640} height={800} priority unoptimized/><span className="startup-platform"/></div>
      <h1>TALEVO</h1><p className="startup-tagline">พื้นที่จัดการการเรียนรู้ของคุณ</p>
      <div className="startup-progress" role="progressbar" aria-label="เตรียมข้อมูล TALEVO" aria-valuemin={0} aria-valuemax={2} aria-valuenow={complete} aria-valuetext={complete === 2 ? "เตรียมข้อมูลเรียบร้อยแล้ว" : authReady ? "ตรวจสอบบัญชีแล้ว กำลังเตรียมข้อมูล" : "กำลังตรวจสอบบัญชี"}><span style={{width: `${complete * 50}%`}}/><i/></div>
      <p className="startup-status">{complete === 2 ? "โหลดข้อมูลเรียบร้อยแล้ว" : "กำลังโหลดข้อมูล TALEVO..."}</p>
    </div><footer>POWERED BY INTELLIGENCE</footer>
  </div>;
}
