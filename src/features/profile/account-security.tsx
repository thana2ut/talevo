"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useUiText } from "@/providers/ui-language";
import "./account-security.css";

export function AccountSecurity({ verifiedFactorId, verifiedSession, canManageSupport }: { verifiedFactorId: string | null; verifiedSession: boolean; canManageSupport: boolean }) {
  const uiText = useUiText();
  const router = useRouter();
  const [pending, setPending] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const factorId = verifiedFactorId || pending?.id;
  const secure = confirmed || verifiedSession;

  const enroll = async () => {
    if (busy || verifiedFactorId || pending) return;
    setBusy(true); setMessage("");
    try {
      const { data, error } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: `TALEVO ${Date.now()}`, issuer: "TALEVO" });
      if (error || !data) throw new Error("enrollment_failed");
      const qr = data.totp.qr_code;
      setPending({ id: data.id, qr: qr.startsWith("data:image/") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` });
    } catch { setMessage(uiText("เริ่มตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!factorId || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      setCode(""); setPending(null); setConfirmed(true);
      setMessage(uiText("ยืนยันความปลอดภัยเรียบร้อยแล้ว"));
      router.refresh();
    } catch { setCode(""); setMessage(uiText("รหัสไม่ถูกต้องหรือหมดอายุ กรุณาใช้รหัสล่าสุดแล้วลองใหม่")); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!pending || busy) return;
    setBusy(true); setMessage("");
    try {
      // Only this unverified enrollment is removed; verified factors stay intact.
      const { error } = await createClient().auth.mfa.unenroll({ factorId: pending.id });
      if (error) throw error;
      setPending(null); setCode("");
    } catch { setMessage(uiText("ยกเลิกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่")); }
    finally { setBusy(false); }
  };

  return <div className="page account-security-page"><PageHeader title={uiText("ความปลอดภัยบัญชี")} backHref={canManageSupport ? "/admin" : "/settings"} />
    <Card className={`account-security-card${secure ? " is-secure" : ""}`}><div className="account-security-heading"><span className="account-security-icon"><ShieldCheck aria-hidden="true" /></span><div><h2>{uiText("ยืนยันตัวตนสองขั้นตอน")}</h2><p>{uiText("เพิ่มความปลอดภัยให้บัญชีแอดมิน")}</p></div></div>
      {secure ? <><p className="account-security-confirmed">{uiText("ยืนยันสองขั้นตอนแล้ว")}</p><button type="button" className="primary-button" onClick={() => router.push(canManageSupport ? "/admin" : "/settings")}>{uiText("ปิด")}</button></> : <>
        {!verifiedFactorId && !pending && <><p>{uiText("ใช้แอปยืนยันตัวตนสแกน QR แล้วกรอกรหัส 6 หลัก")}</p><button type="button" className="primary-button" disabled={busy} onClick={() => void enroll()}>{uiText(busy ? "กำลังดำเนินการ…" : "เริ่มตั้งค่า")}</button></>}
        {pending && <div className="account-security-qr"><p>{uiText("สแกน QR ด้วยแอปยืนยันตัวตน แล้วกรอกรหัส 6 หลัก")}</p>{/* Image data stays in memory on this page; never persisted or logged. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.qr} alt={uiText("รหัสสำหรับตั้งค่าแอปยืนยันตัวตน")} width={220} height={220} /></div>}
        {factorId && <form onSubmit={event => { event.preventDefault(); void verify(); }}><label htmlFor="account-mfa-code">{uiText("รหัสจากแอปยืนยันตัวตน")}</label><input className="input" id="account-mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ""))} disabled={busy} aria-describedby="mfa-code-hint" /><small id="mfa-code-hint">{uiText("ใช้รหัสล่าสุดจากแอป รหัสจะเปลี่ยนเป็นระยะ")}</small><button className="primary-button" type="submit" disabled={busy || code.length !== 6}>{uiText(busy ? "กำลังยืนยัน…" : "ยืนยันรหัส")}</button>{pending && <button type="button" className="secondary-button" disabled={busy} onClick={() => void cancel()}>{uiText("ยกเลิกการตั้งค่า")}</button>}</form>}
      </>}
      <p role="status" aria-live="polite">{message}</p>
    </Card></div>;
}
