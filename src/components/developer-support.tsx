"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, GraduationCap, Layers, MessageCircleWarning, Send, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { DeveloperPortraitEditor } from "@/components/developer-portrait-editor";
import { createClient } from "@/lib/supabase/client";
import { useUiText } from "@/providers/ui-language";
import "./admin-workspace.css";

export function DeveloperSupport() {
  const uiText = useUiText();
  const [avatar, setAvatar] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [hasMfa, setHasMfa] = useState(false);

  useEffect(() => {
    let active = true;
    const db = createClient();
    const load = async () => {
      const { data: profile } = await db.from("developer_profile").select("avatar").eq("id", true).maybeSingle();
      if (active && profile?.avatar) setAvatar(profile.avatar);
      const { data: auth } = await db.auth.getUser();
      if (active) setHasMfa(Boolean(auth.user?.factors?.some(factor => factor.status === "verified")));
      const { data: allowed } = await db.rpc("is_support_admin");
      if (!active || allowed !== true) return;
      setAdmin(true);
    };
    void load().catch(() => { if (active) setAdmin(false); });
    return () => { active = false; };
  }, [uiText]);

  return <section className="developer-support">
    <h2>{uiText("ข้อมูลผู้พัฒนา")}</h2>
    <Card className="developer-profile-card">
      <div className="developer-identity">
        <div className="developer-portrait" role="img" aria-label={uiText("รูปผู้พัฒนา")} style={avatar ? { backgroundImage: `url("${avatar}")` } : undefined}>{!avatar && "ต"}</div>
        {admin && <DeveloperPortraitEditor onSaved={setAvatar} />}
        <h3>นายธนวุฒิ โคตรพรม (ตาต้าร์)</h3><p>{uiText("ผู้พัฒนา TALEVO")}</p>
      </div>
      <dl className="developer-details">
        <div><dt><GraduationCap aria-hidden="true" /><span>{uiText("คณะ")}</span></dt><dd>{uiText("คณะศึกษาศาสตร์")}</dd></div>
        <div><dt><Layers aria-hidden="true" /><span>{uiText("สาขา")}</span></dt><dd>{uiText("เทคโนโลยีการศึกษาและคอมพิวเตอร์ศึกษา")}</dd></div>
        <div><dt><CalendarDays aria-hidden="true" /><span>{uiText("ชั้นปี")}</span></dt><dd>{uiText("ชั้นปีที่ 2")}</dd></div>
      </dl>
      <div className="developer-socials">
        <a href="https://www.facebook.com/share/19egL5VWvM/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label={uiText("Facebook ของผู้พัฒนา")}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#1877F2" /><path fill="white" d="M18.5 32V19h4.4l.7-5h-5.1v-3.2c0-1.4.4-2.4 2.5-2.4h2.7V4.1c-.5-.1-2.1-.2-4-.2-4 0-6.7 2.4-6.7 6.9V14H8.5v5H13v13z" /></svg><span>Ťhänawüt</span></a>
        <a href="https://www.instagram.com/thxna2ut._?obrf=bzUxenRlZ2podm4x&amp;utm_source=qr" target="_blank" rel="noopener noreferrer" aria-label={uiText("Instagram ของผู้พัฒนา")}><svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="developer-instagram" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#FFCA50" /><stop offset=".5" stopColor="#F02D83" /><stop offset="1" stopColor="#7941E9" /></linearGradient></defs><rect x="2" y="2" width="28" height="28" rx="8" fill="none" stroke="url(#developer-instagram)" strokeWidth="3.5" /><circle cx="16" cy="16" r="6" fill="none" stroke="url(#developer-instagram)" strokeWidth="3" /><circle cx="24" cy="8" r="2" fill="#B333C7" /></svg><span>thxna2ut._</span></a>
      </div>
    </Card>

    <h2>{uiText("รายงานปัญหา")}</h2>
    <Card className="support-report-card">
      <div className="support-report-intro"><span><MessageCircleWarning aria-hidden="true" /></span><strong>{uiText("แจ้งปัญหาที่พบให้เราทราบ")}</strong></div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setStatus("");
        try {
          const db = createClient();
          const { data: auth, error: authError } = await db.auth.getUser();
          if (authError || !auth.user) throw new Error(uiText("กรุณาเข้าสู่ระบบก่อนส่งรายงาน"));
          const { error } = await db.from("support_reports").insert({ user_id: auth.user.id, message: message.trim(), category: "problem" });
          if (error) {
            console.error("Problem report submit failed", error);
            if (error.code === "42501") throw new Error(uiText("บัญชีนี้ยังไม่มีสิทธิ์ส่งรายงาน กรุณาออกจากระบบแล้วเข้าใหม่"));
            if (error.code === "23514") throw new Error(uiText("กรุณาพิมพ์รายละเอียดอย่างน้อย 10 ตัวอักษร"));
            if (error.code === "PGRST204") throw new Error(uiText("ระบบกำลังปรับปรุงส่วนนี้ กรุณาลองใหม่อีกครั้งภายหลัง"));
            throw new Error(uiText("ยังส่งรายงานไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง"));
          }
          setMessage(""); setStatus(uiText("ส่งรายงานถึงผู้พัฒนาแล้ว ขอบคุณที่ช่วยปรับปรุง TALEVO ครับ"));
        } catch (error) { setStatus(error instanceof Error ? error.message : uiText("ส่งไม่สำเร็จ")); }
        finally { setBusy(false); }
      }}>
        <label htmlFor="support-message">{uiText("รายละเอียดปัญหา")}</label>
        <textarea id="support-message" className="input" aria-describedby="support-message-help" required minLength={10} maxLength={2000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={uiText("พิมพ์รายละเอียดปัญหา...")} />
        <small id="support-message-help" className="support-report-hint">{uiText("พิมพ์อย่างน้อย 10 ตัวอักษรเพื่อส่งรายงาน")}</small>
        <div className="support-report-meta"><small>{message.length}/2,000</small><small>{uiText("ไม่ใส่ข้อมูลส่วนตัว")}</small></div>
        <button className="primary-button" type="submit" disabled={busy || message.trim().length < 10}><Send size={20} aria-hidden="true" />{busy ? uiText("กำลังส่ง…") : uiText("ส่งรายงานปัญหา")}</button>
        <p role="status">{status}</p>
      </form>
    </Card>

    {(admin || hasMfa) && <Link href="/profile/security" className="support-admin-entry"><span className="support-admin-entry-icon"><ShieldCheck aria-hidden="true" /></span><span><strong>{uiText("ความปลอดภัยบัญชี")}</strong><small>{uiText("ตั้งค่าหรือยืนยันรหัสจากแอปยืนยันตัวตน")}</small></span><ChevronRight aria-hidden="true" /></Link>}
    {admin && <Link href="/admin" className="support-admin-entry">
      <span className="support-admin-entry-icon"><ShieldCheck aria-hidden="true" /></span>
      <span><strong>{uiText("แอดมิน")}</strong><small>{uiText("จัดการรายงานปัญหาและข้อความขอความช่วยเหลือ")}</small></span>
      <ChevronRight aria-hidden="true" />
    </Link>}
  </section>;
}
