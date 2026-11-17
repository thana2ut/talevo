"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, ChevronRight, Inbox, LifeBuoy, MessageCircleWarning, RefreshCw, Search, Send, ShieldCheck, Trash2, Users } from "lucide-react";
import { BottomSheet, Card, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useUiText } from "@/providers/ui-language";
import "@/components/admin-workspace.css";

type Category = "problem" | "help";
type SupportMessage = {
  id: string; category: Category; message: string; created_at: string;
  read_at: string | null; display_name?: string; email?: string;
};
export type Dashboard = {
  account_count: number; unread_count: number; unread_problem_count: number;
  unread_help_count: number; reports: SupportMessage[]; help_requests: SupportMessage[];
};
type Reply = { id: string; message: string; created_at: string };

export function AdminDashboard({ initialData }: { initialData: Dashboard | null }) {
  const uiText = useUiText();
  const [dashboard, setDashboard] = useState<Dashboard | null>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(initialData ? "" : uiText("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  const [category, setCategory] = useState<"all" | Category>("all");
  const [filter, setFilter] = useState<"all" | "new" | "read">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState("");
  const [replyVersion, setReplyVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inFlight = useRef(false);
  const mutating = useRef(false);
  const alive = useRef(true);
  const conversationHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (inFlight.current || mutating.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const { data, error } = await createClient().rpc("support_admin_dashboard");
      if (error || !data) throw new Error("dashboard_unavailable");
      if (alive.current) {
        setDashboard(data as Dashboard);
        setError("");
        setUpdatedAt(new Date());
      }
    } catch {
      if (alive.current) setError(uiText("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, [uiText]);

  useEffect(() => {
    alive.current = true;
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { alive.current = false; window.clearTimeout(initialLoad); window.clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (selectedId) conversationHeading.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    if (!selectedId) return;
    const readReplies = async () => {
      try {
        const { data, error } = await createClient().from("support_replies")
          .select("id,message,created_at").eq("report_id", selectedId).order("created_at", { ascending: true });
        if (error) throw error;
        if (active) setReplies(data ?? []);
      } catch {
        if (active) setRepliesError(uiText("โหลดประวัติการตอบกลับไม่สำเร็จ"));
      } finally { if (active) setRepliesLoading(false); }
    };
    void readReplies();
    return () => { active = false; };
  }, [selectedId, replyVersion, uiText]);

  const all = [...(dashboard?.reports ?? []), ...(dashboard?.help_requests ?? [])]
    .sort((a, b) => Number(Boolean(a.read_at)) - Number(Boolean(b.read_at)) || Date.parse(b.created_at) - Date.parse(a.created_at));
  const selected = all.find(item => item.id === selectedId);
  const matchingCategory = all.filter(item => category === "all" || item.category === category);
  const visible = matchingCategory.filter(item =>
    (filter === "all" || (filter === "new" ? !item.read_at : Boolean(item.read_at))) &&
    `${item.display_name ?? ""} ${item.email ?? ""} ${item.message}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const formatDate = (value: string) => new Date(value).toLocaleString(uiText.locale, { dateStyle: "medium", timeStyle: "short" });
  const label = (value: Category) => uiText(value === "help" ? "ขอความช่วยเหลือ" : "รายงานปัญหา");

  const choose = (id: string | null) => {
    if (mutating.current || id === selectedId) return;
    setSelectedId(id); setReply(""); setStatus("");
    setReplies([]); setRepliesError(""); setRepliesLoading(Boolean(id));
  };
  const refresh = () => {
    setLoading(true);
    void load();
    if (selectedId) { setRepliesLoading(true); setRepliesError(""); setReplyVersion(value => value + 1); }
  };
  const mutate = async (operation: "read" | "reply" | "delete") => {
    if (!selected || mutating.current || inFlight.current) return;
    const target = selected;
    const text = reply.trim();
    if (operation === "reply" && (!text || text.length > 2000)) return;
    mutating.current = true; setBusy(true); setStatus("");
    try {
      const db = createClient();
      const result = operation === "reply"
        ? await db.rpc("support_admin_reply", { report_id: target.id, reply_message: text })
        : operation === "delete"
          ? await db.rpc("support_admin_delete_report", { target_report_id: target.id })
          : await db.from("support_reports").update({ read_at: new Date().toISOString() }).eq("id", target.id).select("id").single();
      if (result.error) throw result.error;
      if (operation === "reply") {
        setReply(""); setReplyVersion(value => value + 1);
        setRepliesLoading(true); setRepliesError("");
        setStatus(uiText("ส่งข้อความตอบกลับแล้ว"));
      } else if (operation === "delete") {
        setDeleteOpen(false); setSelectedId(null);
        setStatus(uiText("ลบรายการแล้ว"));
      } else setStatus(uiText("ทำเครื่องหมายว่าอ่านแล้ว"));
    } catch {
      setStatus(uiText(operation === "reply" ? "ส่งข้อความตอบกลับไม่สำเร็จ กรุณาลองใหม่" : operation === "delete" ? "ลบรายการไม่สำเร็จ กรุณาลองใหม่" : "เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      mutating.current = false; setBusy(false);
      setLoading(true);
      void load();
    }
  };

  return <div className="page admin-page">
    <PageHeader title={uiText("ศูนย์ดูแลระบบ")} backHref="/settings" />
    <section className="admin-hero" aria-label={uiText("ภาพรวมสำหรับแอดมิน")}>
      <div className="admin-hero-copy"><span className="admin-eyebrow"><ShieldCheck size={16} aria-hidden="true" />TALEVO · {uiText("แอดมิน")}</span>
        <h2>{uiText("ดูแลทุกข้อความได้ในที่เดียว")}</h2><p>{uiText("ติดตามปัญหาและช่วยเหลือผู้ใช้งาน เริ่มจากข้อความที่ยังไม่อ่าน")}</p>
      </div><button type="button" className="secondary-button" disabled={loading || busy} onClick={refresh}><RefreshCw size={17} aria-hidden="true" className={loading ? "admin-spinning" : ""} />{uiText(loading ? "กำลังอัปเดต…" : "รีเฟรชข้อมูล")}</button>
    </section>
    {error && <div className="admin-alert" role="alert">{error}<button type="button" className="text-button" disabled={loading} onClick={refresh}>{uiText("ลองใหม่")}</button></div>}
    <div className="admin-stats" aria-label={uiText("ข้อมูลสำคัญ")}>
      <Card className="admin-stat"><span className="admin-stat-icon"><Users aria-hidden="true" /></span><div><span>{uiText("บัญชีผู้ใช้งาน")}</span><strong>{dashboard ? dashboard.account_count.toLocaleString(uiText.locale) : "—"}</strong><small>{uiText("บัญชีปัจจุบันในระบบ")}</small></div></Card>
      <button type="button" className="card admin-stat" disabled={busy} onClick={() => { setCategory("problem"); setFilter("new"); setSearch(""); choose(null); }}><span className="admin-stat-icon is-problem"><MessageCircleWarning aria-hidden="true" /></span><div><span>{uiText("ปัญหาที่ยังไม่อ่าน")}</span><strong>{dashboard ? dashboard.unread_problem_count.toLocaleString(uiText.locale) : "—"}</strong><small>{uiText("เปิดดูรายงานปัญหา")} <ChevronRight size={13} aria-hidden="true" /></small></div></button>
      <button type="button" className="card admin-stat" disabled={busy} onClick={() => { setCategory("help"); setFilter("new"); setSearch(""); choose(null); }}><span className="admin-stat-icon is-help"><LifeBuoy aria-hidden="true" /></span><div><span>{uiText("คำขอช่วยเหลือที่ยังไม่อ่าน")}</span><strong>{dashboard ? dashboard.unread_help_count.toLocaleString(uiText.locale) : "—"}</strong><small>{uiText("เปิดดูคำขอช่วยเหลือ")} <ChevronRight size={13} aria-hidden="true" /></small></div></button>
    </div>
    <section className="admin-inbox" aria-labelledby="admin-inbox-title" aria-busy={loading}>
      <header className="admin-section-heading"><div><h2 id="admin-inbox-title">{uiText("กล่องข้อความ")}<span>{dashboard?.unread_count ?? "—"} {uiText("ยังไม่อ่าน")}</span></h2><p>{uiText("แสดง 100 รายการล่าสุดต่อประเภท โดยเรียงข้อความที่ยังไม่อ่านก่อน")}</p></div><small>{updatedAt ? `${uiText("อัปเดตล่าสุด")} ${updatedAt.toLocaleTimeString(uiText.locale, { hour: "2-digit", minute: "2-digit" })}` : uiText("อัปเดตอัตโนมัติทุก 30 วินาที")}</small></header>
      <div className="admin-categories" aria-label={uiText("ประเภทข้อความ")}>{(["all", "problem", "help"] as const).map(value => <button type="button" key={value} aria-pressed={category === value} disabled={busy} onClick={() => { setCategory(value); choose(null); }}>{value === "all" ? <Inbox size={17} aria-hidden="true" /> : value === "help" ? <LifeBuoy size={17} aria-hidden="true" /> : <MessageCircleWarning size={17} aria-hidden="true" />}{value === "all" ? uiText("ทั้งหมด") : label(value)}</button>)}</div>
      <div className={`admin-workspace ${selected ? "has-selection" : ""}`}>
        <div className="admin-inbox-list">
          <label className="admin-search"><Search size={18} aria-hidden="true" /><span className="sr-only">{uiText("ค้นหาชื่อ อีเมล หรือข้อความ")}</span><input type="search" placeholder={uiText("ค้นหาชื่อ อีเมล หรือข้อความ")} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="admin-filters" aria-label={uiText("สถานะข้อความ")}>{(["all", "new", "read"] as const).map((key, index) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{uiText(["ทั้งหมด", "ยังไม่อ่าน", "อ่านแล้ว"][index])}<span>{matchingCategory.filter(item => key === "all" || (key === "new" ? !item.read_at : Boolean(item.read_at))).length}</span></button>)}</div>
          <div className="admin-message-list">
            {!dashboard && loading ? <div className="admin-empty" role="status"><RefreshCw aria-hidden="true" /><p>{uiText("กำลังโหลดข้อความ…")}</p></div> : !visible.length ? <div className="admin-empty"><Inbox aria-hidden="true" /><h3>{uiText(error ? "ยังโหลดข้อความไม่ได้" : search || filter !== "all" ? "ไม่พบข้อความที่ตรงกัน" : "ยังไม่มีข้อความ")}</h3><p>{uiText(search || filter !== "all" ? "ลองเปลี่ยนคำค้นหาหรือตัวกรอง" : "รายงานปัญหาและคำขอความช่วยเหลือจะแสดงที่นี่")}</p>{(search || filter !== "all") && <button type="button" className="text-button" onClick={() => { setSearch(""); setFilter("all"); }}>{uiText("ล้างตัวกรอง")}</button>}</div> : visible.map(item => <button type="button" key={item.id} className={`admin-message ${selectedId === item.id ? "is-selected" : ""} ${!item.read_at ? "is-unread" : ""}`} aria-pressed={selectedId === item.id} disabled={busy} onClick={() => choose(item.id)}>
              <span className="admin-message-top"><strong>{item.display_name || uiText("ไม่ได้ระบุชื่อ")}</strong><span className="admin-read-state">{uiText(item.read_at ? "อ่านแล้ว" : "ใหม่")}</span></span><span className="admin-message-preview">{item.message}</span><span className="admin-message-meta"><span>{label(item.category)}</span><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></span>
            </button>)}
          </div>
        </div>
        <div className="admin-conversation">
          {selected ? <>
            <button type="button" className="text-button admin-back-list" disabled={busy} onClick={() => choose(null)}><ArrowLeft size={17} aria-hidden="true" />{uiText("กลับกล่องข้อความ")}</button>
            <header className="admin-conversation-header"><span className="admin-conversation-avatar">{(selected.display_name || "?").slice(0, 1)}</span><div><span className="admin-eyebrow">{label(selected.category)}</span><h3 ref={conversationHeading} tabIndex={-1}>{selected.display_name || uiText("ไม่ได้ระบุชื่อ")}</h3><p>{selected.email || uiText("ไม่ได้ระบุอีเมล")}</p></div><span className="admin-read-state">{uiText(selected.read_at ? "อ่านแล้ว" : "ยังไม่อ่าน")}</span></header>
            <div className="admin-original-message"><time dateTime={selected.created_at}>{formatDate(selected.created_at)}</time><p>{selected.message}</p></div>
            <div className="admin-message-actions"><button type="button" className="secondary-button" disabled={busy || loading || Boolean(selected.read_at)} onClick={() => void mutate("read")}><CheckCheck size={17} aria-hidden="true" />{uiText(selected.read_at ? "อ่านแล้ว" : "ทำเครื่องหมายว่าอ่านแล้ว")}</button><button type="button" className="text-button admin-delete" disabled={busy || loading} onClick={() => { setStatus(""); setDeleteOpen(true); }}><Trash2 size={17} aria-hidden="true" />{uiText("ลบรายการ")}</button></div>
            <section className="admin-reply-history" aria-label={uiText("ประวัติการตอบกลับ")}><h4>{uiText("ประวัติการตอบกลับ")}</h4>{repliesLoading ? <p role="status">{uiText("กำลังโหลด…")}</p> : repliesError ? <p role="alert">{repliesError} <button type="button" className="text-button" onClick={() => { setRepliesLoading(true); setRepliesError(""); setReplyVersion(value => value + 1); }}>{uiText("ลองใหม่")}</button></p> : replies.length ? replies.map(item => <div className="admin-reply-bubble" key={item.id}><strong>{uiText("แอดมิน")}</strong><p>{item.message}</p><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></div>) : <p>{uiText("ยังไม่มีการตอบกลับ")}</p>}</section>
            <form className="admin-compose" onSubmit={event => { event.preventDefault(); void mutate("reply"); }}><label htmlFor="admin-reply">{uiText("ตอบกลับผู้ใช้งาน")}</label><textarea id="admin-reply" className="input" rows={4} required maxLength={2000} disabled={busy} value={reply} onChange={event => setReply(event.target.value)} placeholder={uiText("พิมพ์คำตอบหรือแนวทางช่วยเหลือ…")} aria-describedby="admin-reply-hint" /><div className="admin-compose-footer"><small id="admin-reply-hint">{uiText("ส่งถึงการแจ้งเตือนของผู้ใช้งาน")} · {reply.length}/2,000</small><button className="primary-button" type="submit" disabled={busy || loading || !reply.trim()}><Send size={17} aria-hidden="true" />{uiText(busy ? "กำลังดำเนินการ…" : "ส่งคำตอบ")}</button></div></form>
          </> : <div className="admin-empty admin-select-prompt"><span><Inbox size={30} aria-hidden="true" /></span><h3>{uiText("เลือกข้อความเพื่อเริ่มดูแล")}</h3><p>{uiText("อ่านรายละเอียด ดูประวัติ และส่งคำตอบกลับถึงผู้ใช้งานได้ที่นี่")}</p></div>}
        </div>
      </div>
    </section>
    <p role="status" aria-live="polite" className="admin-action-status">{!deleteOpen && status}</p>
    <BottomSheet open={deleteOpen && Boolean(selected)} title={uiText("ยืนยันการลบรายการ")} onClose={() => { if (!busy) setDeleteOpen(false); }} dismissible={!busy} className="support-delete-sheet"><p>{uiText("ต้องการลบข้อความนี้และข้อความตอบกลับที่เกี่ยวข้องใช่หรือไม่? ไม่สามารถกู้คืนได้")}</p>{status && <p role="alert">{status}</p>}<div className="support-delete-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setDeleteOpen(false)}>{uiText("ยกเลิก")}</button><button type="button" className="danger-button" disabled={busy || loading} onClick={() => void mutate("delete")}>{uiText(busy ? "กำลังลบ…" : "ยืนยันการลบ")}</button></div></BottomSheet>
  </div>;
}
