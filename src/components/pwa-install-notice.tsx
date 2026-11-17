"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Share, MoreVertical, PlusSquare } from "lucide-react";
import { BottomSheet } from "@/components/ui";
import { useLanguage } from "@/providers/language-provider";
import { useAppState } from "@/providers/app-state-provider";
import "./pwa-install-notice.css";
import { useAuth } from "@/providers/auth-provider";

export function NotificationWelcome() {
  const { user } = useAuth();
  const { isHydrated, deviceNotificationsEnabled, setBrowserNotificationsEnabled, updateNotificationPreferences } = useAppState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = user ? `talevo:notification-welcome:v1:${user.id}` : null;
  useEffect(() => {
    const timer = window.setTimeout(() => {
    setOpen(false);
    if (!key || !isHydrated || !("Notification" in window)) return;
    const mobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (mobile && !installed) return;
    // iOS only exposes notifications in installed Home Screen apps.
    try {
      if (deviceNotificationsEnabled || Notification.permission !== "default") {
        localStorage.setItem(key, "done");
        return;
      }
      setOpen(localStorage.getItem(key) !== "done");
    } catch { /* Storage may be unavailable in private browsing. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, isHydrated, deviceNotificationsEnabled]);
  const finish = () => {
    if (key) { try { localStorage.setItem(key, "done"); } catch { /* Keep this visit usable. */ } }
    setOpen(false);
  };
  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      // Calls the browser permission prompt directly from the user's tap and sends one test.
      await setBrowserNotificationsEnabled(true);
      if (Notification.permission === "granted") {
        updateNotificationPreferences({ enabled: true, task24h: true, task12h: true, deadlineRisk: true, morning0600: true, daily0700: true, class30m: true, classEnd10m: true, exam7d: true, exam3d: true, exam1d: true, examMorning: true, weeklyRadar: true });
        finish();
      } else if (Notification.permission === "denied") finish();
      else setError("ยังไม่ได้อนุญาต สามารถลองอีกครั้งหรือตั้งค่าภายหลังได้");
    } catch { setError("เปิดแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  };
  return <BottomSheet open={open} onClose={finish} title="เปิดการแจ้งเตือน" dismissible={!busy}>
    <p>รับการเตือนงาน คาบเรียน และการสอบ เมื่ออนุญาตจะเปิดการแจ้งเตือนทุกประเภทและส่งข้อความทดสอบ 1 ครั้ง</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="primary-button" disabled={busy} onClick={() => void enable()}>{busy ? "กำลังเปิดแจ้งเตือน…" : "อนุญาตการแจ้งเตือน"}</button>
    <button type="button" className="secondary-button" disabled={busy} onClick={finish}>ไว้ภายหลัง</button>
  </BottomSheet>;
}

export function PwaInstallNotice() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android">("android");
  const { language } = useLanguage();
  const { isAuthenticated } = useAppState();
  const router = useRouter();
  const en = language === "en";

  useEffect(() => {
    const showForBrowserVisit = () => {
      const apple = /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const installed = matchMedia("(display-mode: standalone)").matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const mobile = apple || /Android/.test(navigator.userAgent)
        || matchMedia("(max-width: 1199px) and (pointer: coarse)").matches;
      setPlatform(apple ? "ios" : "android");
      setOpen(mobile && !installed);
    };
    // Deliberately no saved dismissal: every new browser visit shows the guide.
    const timer = window.setTimeout(showForBrowserVisit, 0);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) showForBrowserVisit();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    if (isAuthenticated) router.replace("/today");
  };

  return <BottomSheet open={open} onClose={dismiss} dismissible={false} title={en ? "Install Talevo" : "ติดตั้งแอป Talevo"} className="pwa-install-sheet">
    <div className="pwa-install-logo"><Image src="/apple-icon.png" alt="Talevo" width={76} height={76} priority unoptimized /></div>
    <div className="pwa-install-content">
      <p className="pwa-install-intro">{en ? (platform === "ios" ? "Add Talevo to your Home Screen for quick access." : "Install Talevo on your Android device for quick access.") : (platform === "ios" ? "เพิ่ม Talevo ไว้บนหน้าจอโฮม\nเปิดใช้งานได้สะดวกเหมือนแอป" : "ติดตั้ง Talevo บน Android\nแล้วเปิดใช้ได้จากหน้าจอหลัก")}</p>
      <div className="pwa-install-platform" role="group" aria-label={en ? "Choose your device" : "เลือกระบบของอุปกรณ์"}>
        <button type="button" aria-pressed={platform === "ios"} onPointerDown={(event) => { event.currentTarget.dataset.pointerInteraction = "true"; }} onKeyDown={(event) => { delete event.currentTarget.dataset.pointerInteraction; }} onBlur={(event) => { delete event.currentTarget.dataset.pointerInteraction; }} onClick={() => setPlatform("ios")}>iOS</button>
        <button type="button" aria-pressed={platform === "android"} onPointerDown={(event) => { event.currentTarget.dataset.pointerInteraction = "true"; }} onKeyDown={(event) => { delete event.currentTarget.dataset.pointerInteraction; }} onBlur={(event) => { delete event.currentTarget.dataset.pointerInteraction; }} onClick={() => setPlatform("android")}>Android</button>
      </div>
      <ol className="pwa-install-steps">
        {platform === "ios" ? <>
          <li><span className="pwa-step-number">1</span><span>{en ? "Tap " : "แตะปุ่ม "}<strong>{en ? "Share" : "แชร์"}</strong><Share aria-hidden="true" />{en ? " in Safari." : " ใน Safari"}</span></li>
          <li><span className="pwa-step-number">2</span><span>{en ? "Choose " : "เลือก "}<strong>{en ? "Add to Home Screen" : "เพิ่มไปยังหน้าจอโฮม"}</strong><PlusSquare aria-hidden="true" /></span></li>
          <li><span className="pwa-step-number">3</span><span>{en ? "Tap " : "แตะ "}<strong>{en ? "Add" : "เพิ่ม"}</strong>{en ? ", then open Talevo from its icon." : " แล้วเปิด Talevo จากไอคอนบนหน้าจอ"}</span></li>
        </> : <>
          <li><span className="pwa-step-number">1</span><span>{en ? "Open the " : "แตะเมนู "}<strong>{en ? "⋮ Menu" : "⋮"}</strong><MoreVertical aria-hidden="true" />{en ? " in Chrome." : " มุมขวาบนของ Chrome"}</span></li>
          <li><span className="pwa-step-number">2</span><span>{en ? "Choose " : "เลือก "}<strong>{en ? "Install app" : "ติดตั้งแอป"}</strong>{en ? " or " : " หรือ "}<strong>{en ? "Add to Home screen" : "เพิ่มในหน้าจอหลัก"}</strong><PlusSquare aria-hidden="true" /></span></li>
          <li><span className="pwa-step-number">3</span><span>{en ? "Tap " : "แตะ "}<strong>{en ? "Install" : "ติดตั้ง"}</strong>{en ? ", then open Talevo from its icon." : " แล้วเปิด Talevo จากไอคอนบนหน้าจอ"}</span></li>
        </>}
      </ol>
      <p className="pwa-install-note">{en ? (platform === "ios" ? "If you opened this in an in-app browser, open the page in Safari first." : "If you opened this in an in-app browser, open the page in Chrome first.") : (platform === "ios" ? "หากเปิดจากแอปอื่น ให้เปิดหน้านี้ใน Safari ก่อน" : "หากเปิดจากแอปอื่น ให้เปิดหน้านี้ใน Chrome ก่อน")}</p>
      <button type="button" className="primary-button pwa-install-understood" onClick={dismiss}>{en ? "Got it" : "เข้าใจแล้ว"}</button>
    </div>
  </BottomSheet>;
}
