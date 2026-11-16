"use client";

import { useEffect, useState } from "react";
import { CalendarDays, GraduationCap, Layers, MessageCircleWarning, Send, ShieldCheck, Users } from "lucide-react";
import { Card } from "@/components/ui";
import { DeveloperPortraitEditor } from "@/components/developer-portrait-editor";
import { createClient } from "@/lib/supabase/client";
import { useUiText } from "@/providers/ui-language";

type SupportMessage = {
  id: string;
  category?: "problem" | "help";
  message: string;
  created_at: string;
  read_at: string | null;
  display_name?: string;
  email?: string;
  major?: string;
  university?: string;
  user_id?: string;
};

export function DeveloperSupport() {
  const uiText = useUiText();
  const [avatar, setAvatar] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<SupportMessage[]>([]);
  const [helpRequests, setHelpRequests] = useState<SupportMessage[]>([]);
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [problemUnread, setProblemUnread] = useState(0);
  const [helpUnread, setHelpUnread] = useState(0);
  const [dashboardError, setDashboardError] = useState("");
  const [inbox, setInbox] = useState<"problem" | "help" | null>(null);
  const [selected, setSelected] = useState<SupportMessage | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    const db = createClient();
    const load = async () => {
      const { data: profile } = await db.from("developer_profile").select("avatar").eq("id", true).maybeSingle();
      if (active && profile?.avatar) setAvatar(profile.avatar);
      const { data: allowed } = await db.rpc("is_support_admin");
      if (!active || allowed !== true) return;
      setAdmin(true);
      const { data, error } = await db.rpc("support_admin_dashboard");
      if (!active) return;
      if (error) { setDashboardError(uiText("ยังโหลดข้อมูลผู้ดูแลไม่ได้ กรุณาลองใหม่ภายหลัง")); return; }
      setDashboardError("");
      setAccountCount(data.account_count);
      setUnread(data.unread_count);
      setProblemUnread(data.unread_problem_count ?? data.unread_count);
      setHelpUnread(data.unread_help_count ?? 0);
      setReports(data.reports ?? []);
      setHelpRequests(data.help_requests ?? []);
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [uiText]);

  const markRead = async (item: SupportMessage) => {
    const read_at = new Date().toISOString();
    const { error } = await createClient().from("support_reports").update({ read_at }).eq("id", item.id);
    if (error) { setDashboardError(uiText("เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่")); return; }
    const setItems = item.category === "help" ? setHelpRequests : setReports;
    setItems((items) => items.map((current) => current.id === item.id ? { ...current, read_at } : current));
    setUnread((count) => Math.max(0, count - 1));
    if (item.category === "help") setHelpUnread((count) => Math.max(0, count - 1));
    else setProblemUnread((count) => Math.max(0, count - 1));
  };

  const items = inbox === "help" ? helpRequests : reports;
  const visible = items.filter(item => (filter === "all" || (filter === "new" ? !item.read_at : Boolean(item.read_at))) && `${item.display_name} ${item.message}`.toLowerCase().includes(search.toLowerCase()));
  const detail = selected && <Card className="support-detail">
    <header><span className="support-avatar">{(selected.display_name || "?").slice(0,1)}</span><div><h3>{selected.display_name || uiText("ไม่ได้ระบุชื่อ")}</h3><time>{new Date(selected.created_at).toLocaleString(uiText.locale)}</time></div><span className={`support-report-state ${selected.read_at ? "is-read" : "is-new"}`}>{uiText(selected.read_at ? "อ่านแล้ว" : "ใหม่")}</span></header>
    <dl><div><dt>{uiText("อีเมล")}</dt><dd>{selected.email || "—"}</dd></div><div><dt>{uiText("สาขา / มหาวิทยาลัย")}</dt><dd>{[selected.major,selected.university].filter(Boolean).join(" · ") || "—"}</dd></div></dl>
    <p>{uiText(inbox === "help" ? "ข้อความขอความช่วยเหลือ" : "ปัญหาที่พบ")}</p><div className="support-message-body">{selected.message}</div>
    <div className="support-detail-actions"><button type="button" className="secondary-button" disabled={Boolean(selected.read_at)} onClick={async()=>{await markRead(selected);setSelected({...selected,read_at:new Date().toISOString()});}}>{uiText("อ่านแล้ว")}</button><button type="button" className="primary-button" onClick={()=>document.getElementById("support-reply")?.focus()}>{uiText("ตอบกลับ")}</button></div>
    <form onSubmit={async event=>{event.preventDefault();if(replyBusy || !reply.trim())return;setReplyBusy(true);setDashboardError("");const {error}=await createClient().rpc("support_admin_reply",{report_id:selected.id,reply_message:reply.trim()});setReplyBusy(false);if(error){setDashboardError(uiText("ส่งข้อความตอบกลับไม่สำเร็จ กรุณาลองใหม่"));return;}setReply("");setDashboardError(uiText("ส่งข้อความตอบกลับแล้ว"));}}><label className="sr-only" htmlFor="support-reply">{uiText("ตอบกลับ")}</label><textarea id="support-reply" className="input" maxLength={2000} required value={reply} onChange={event=>setReply(event.target.value)} placeholder={uiText("พิมพ์ข้อความตอบกลับ...")}/><button type="submit" className="primary-button" disabled={replyBusy || !reply.trim()}><Send size={18}/>{uiText(replyBusy ? "กำลังส่ง…" : "ส่ง")}</button></form>
  </Card>;

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

    {admin && <details className="support-admin-panel">
      <summary><ShieldCheck aria-hidden="true" />{uiText("แอดมิน")}<span>{uiText("ใหม่ {0}", [unread])}</span></summary>
      <div className="support-admin-content">
        <Card><h3><Users size={22} aria-hidden="true" /> {uiText("จำนวนผู้ใช้งานแอป")}</h3><strong className="support-account-count">{uiText("{0} บัญชี", [accountCount === null ? "—" : accountCount.toLocaleString(uiText.locale)])}</strong><p>{uiText("จำนวนบัญชีปัจจุบันในระบบ")}</p></Card>
        {dashboardError && <p role="alert">{dashboardError}</p>}
        {!inbox ? <div className="support-menu">{(["help","problem"] as const).map(category=><button type="button" key={category} className="secondary-button" onClick={()=>{setInbox(category);setSelected(null);setFilter("all");setSearch("");}}><MessageCircleWarning/>{uiText(category === "help" ? "ขอความช่วยเหลือ" : "รายงานปัญหา")}<span>{category === "help" ? helpUnread : problemUnread}</span></button>)}</div> : <section className="support-workspace">
          <header><button type="button" className="secondary-button" onClick={()=>{setInbox(null);setSelected(null);}}>{uiText("ย้อนกลับ")}</button><h2>{uiText(inbox === "help" ? "กล่องข้อความช่วยเหลือ" : "กล่องรายงานปัญหา")}</h2></header>
          <div className={`support-inbox-layout ${selected ? "has-selection" : ""}`}><div className="support-inbox-list"><div className="support-inbox-tabs">{["all","new","read"].map((key,index)=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{uiText(["ทั้งหมด","ใหม่","อ่านแล้ว"][index])} {items.filter(item=>key==="all" || (key==="new" ? !item.read_at : Boolean(item.read_at))).length}</button>)}</div><input className="input" aria-label={uiText("ค้นหา")} placeholder={uiText("ค้นหาจากชื่อหรือหัวข้อ...")} value={search} onChange={event=>setSearch(event.target.value)}/>{!visible.length && <p>{uiText("ยังไม่มีข้อความ")}</p>}{visible.map(item=><article key={item.id} className={`support-inbox-card ${selected?.id===item.id ? "is-selected" : ""}`}><button type="button" onClick={()=>{setSelected(item);setReply("");}}><span className="support-avatar">{(item.display_name || "?").slice(0,1)}</span><span><strong>{item.display_name || uiText("ไม่ได้ระบุชื่อ")}</strong><span>{item.message}</span><time>{new Date(item.created_at).toLocaleString(uiText.locale)}</time></span><span className={`support-report-state ${item.read_at ? "is-read" : "is-new"}`}>{uiText(item.read_at ? "อ่านแล้ว" : "ใหม่")}</span></button><footer><button type="button" onClick={()=>setSelected(item)}>{uiText("ดูรายละเอียด")} ›</button><button type="button" onClick={()=>{setSelected(item);setReply("");}}>{uiText("ตอบกลับ")}</button></footer></article>)}</div>{selected && <div className="support-detail-wrap"><button type="button" className="secondary-button support-back-list" onClick={()=>setSelected(null)}>{uiText("ย้อนกลับ")}</button>{detail}</div>}</div>
        </section>}
      </div>
    </details>}
  </section>;
}
