"use client";
import { useSyncExternalStore } from "react";
import { TALEVO_LANGUAGE_CHANGE_EVENT, TALEVO_LANGUAGE_STORAGE_KEY } from "@/lib/talevo-storage-keys";

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(TALEVO_LANGUAGE_CHANGE_EVENT, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(TALEVO_LANGUAGE_CHANGE_EVENT, notify); };
};
function snapshot() {
  try { return `${localStorage.getItem(TALEVO_LANGUAGE_STORAGE_KEY) === "en" ? "en" : "th"}|${localStorage.getItem("talevo-theme") === "dark" ? "dark" : "light"}`; }
  catch { return "th|light"; }
}

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const preference = useSyncExternalStore(subscribe, snapshot, () => "th|light");
  const english = preference.startsWith("en");
  const dark = preference.endsWith("dark");
  return (
    <html lang={english ? "en" : "th"}>
      <body style={{ margin: 0, background: dark ? "#11111c" : "#f7f5ff", color: dark ? "#f4edff" : "#25164f", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }} role="alert">
          <section style={{ width: "min(100%, 520px)", boxSizing: "border-box", padding: 28, border: dark ? "1px solid #a786db30" : "1px solid #e2dcf7", borderRadius: 24, background: dark ? "linear-gradient(145deg,#2c233d,#201b2e)" : "#fff", boxShadow: dark ? "0 18px 50px #0005" : "0 18px 50px rgba(69, 48, 130, .12)", textAlign: "center" }}>
            <strong style={{ color: "#6b47ed", letterSpacing: ".12em", fontSize: 12 }}>TALEVO</strong>
            <h1 style={{ margin: "12px 0 8px", fontSize: 28 }}>{english ? "The app could not start" : "แอปเริ่มทำงานไม่สำเร็จ"}</h1>
            <p style={{ margin: "0 0 22px", color: dark ? "#c4b8d7" : "#6f6882", lineHeight: 1.65 }}>{english ? "Your data has not been deleted. Please try opening the app again." : "ข้อมูลของคุณยังไม่ได้ถูกลบ กรุณาลองเปิดแอปอีกครั้ง"}</p>
            <button type="button" onClick={retry} style={{ minWidth: 160, minHeight: 48, border: 0, borderRadius: 14, background: "#6b47ed", color: "#fff", font: "inherit", fontWeight: 800, cursor: "pointer" }}>{english ? "Try again" : "ลองอีกครั้ง"}</button>
          </section>
        </main>
      </body>
    </html>
  );
}
