"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Share, MoreVertical, PlusSquare } from "lucide-react";
import { BottomSheet } from "@/components/ui";
import { useLanguage } from "@/providers/language-provider";
import { useAppState } from "@/providers/app-state-provider";
import "./pwa-install-notice.css";

export function PwaInstallNotice() {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
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
      setIos(apple);
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
    <div className="pwa-install-logo"><Image src="/icon.png" alt="Talevo" width={76} height={76} priority /></div>
    <div className="pwa-install-content">
      <p className="pwa-install-intro">{en ? "Your study planner, one tap away from your Home Screen." : "เพิ่ม Talevo ไว้บนหน้าจอโฮม\nเปิดใช้งานสะดวกเหมือนแอป"}</p>
      <ol className="pwa-install-steps">
        <li><span className="pwa-step-number">1</span><span>{en ? "Tap " : "แตะปุ่ม "}<strong>{ios ? (en ? "Share" : "แชร์") : (en ? "Menu" : "เมนู")}</strong>{ios ? <Share aria-hidden="true" /> : <MoreVertical aria-hidden="true" />}{en ? (ios ? " in your browser." : " at the top right of Chrome.") : (ios ? " ในเบราว์เซอร์" : " มุมขวาบนของ Chrome")}</span></li>
        <li><span className="pwa-step-number">2</span><span>{en ? "Choose " : "เลือก "}<strong>{en ? "Add to Home Screen" : "เพิ่มไปยังหน้าจอโฮม"}</strong><PlusSquare aria-hidden="true" />{!ios && (en ? " or Install app." : " หรือ ติดตั้งแอป")}</span></li>
        <li><span className="pwa-step-number">3</span><span>{en ? "Tap " : "แตะ "}<strong>{en ? "Add" : "เพิ่ม"}</strong>{en ? ", then open Talevo from its icon." : " แล้วเปิด Talevo จากไอคอนบนหน้าจอ"}</span></li>
      </ol>
      <p className="pwa-install-note">{en ? "If the option is missing, use Safari or Chrome. You may need to sign in again after installation." : "ไม่พบเมนู? เปิดผ่าน Safari หรือ Chrome\nหลังติดตั้ง อาจต้องเข้าสู่ระบบอีกครั้ง"}</p>
      <button type="button" className="primary-button pwa-install-understood" onClick={dismiss}>{en ? "Got it" : "เข้าใจแล้ว"}</button>
    </div>
  </BottomSheet>;
}
