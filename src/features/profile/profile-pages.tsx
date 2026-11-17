"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Building2, ChevronDown, ChevronRight, CircleHelp, GraduationCap, LifeBuoy, Search, Send, Target, UserRound } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Card, Field, Input, TalevoMascot, PageHeader, Select, Textarea } from "@/components/ui";
import { PortraitImageEditor } from "@/components/developer-portrait-editor";
import { createClient } from "@/lib/supabase/client";
import { useAppState } from "@/providers/app-state-provider";
import { useUiText } from "@/providers/ui-language";
import { getSupabaseConfiguration } from "@/lib/supabase/config";
import { privateProfileAvatarUrl, profileAvatarPath } from "@/lib/security/profile-avatar";


export function ProfileAvatar({ name, imageUrl, size = "normal" }: { name: string; imageUrl?: string; size?: "normal" | "large" }) {
  const uiText = useUiText();

  const path = imageUrl ? profileAvatarPath(imageUrl, getSupabaseConfiguration().url) : null;
  const source = path ? privateProfileAvatarUrl(path)
    : imageUrl && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl) ? imageUrl : "";
  // Legacy public references are translated locally; no arbitrary external fetch.
  // eslint-disable-next-line @next/next/no-img-element
  if (source) return <img className={`profile-avatar-image profile-avatar-${size}`} src={source} alt={uiText("รูปโปรไฟล์ {0}", [name])} />;
  return <span className={`profile-avatar-fallback profile-avatar-${size}`} aria-label={uiText("รูปโปรไฟล์ {0}", [name])}>{name.trim().slice(0, 1) || uiText("ค")}</span>;
}

const academicItems = [{ key: "major", label: "สาขา", icon: GraduationCap }, { key: "university", label: "มหาวิทยาลัย", icon: Building2 }] as const;

function joinAcademicDetails(values: string[], fallback = "ยังไม่ได้ระบุข้อมูลการศึกษา") {
  const details = values.map((value) => value.trim()).filter(Boolean);
  return details.length ? details.join(" · ") : fallback;
}

function useProfileAvatar(initialAvatarUrl: string) {
  const uiText = useUiText();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  useEffect(() => {
    let active = true;
    const loadAvatar = async () => {
      const db = createClient();
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) return;
      const { data } = await db.from("user_profile_avatars").select("avatar_url").eq("user_id", auth.user.id).maybeSingle();
      if (active && data?.avatar_url) setAvatarUrl(data.avatar_url);
    };
    void loadAvatar();
    return () => { active = false; };
  }, []);
  const saveAvatar = async (image: Blob) => {
    const db = createClient();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) throw new Error(uiText("กรุณาเข้าสู่ระบบก่อนเปลี่ยนรูปโปรไฟล์"));
    const extension = image.type === "image/webp" ? "webp" : image.type === "image/jpeg" ? "jpg" : "";
    if (!extension) throw new Error(uiText("รูปภาพที่ได้ไม่มีรูปแบบที่รองรับ กรุณาลองเลือกรูปใหม่"));
    const { data: previousAvatar, error: previousAvatarError } = await db.from("user_profile_avatars").select("avatar_url").eq("user_id", auth.user.id).maybeSingle();
    if (previousAvatarError) throw new Error(uiText("โหลดข้อมูลรูปโปรไฟล์เดิมไม่ได้ กรุณาลองอีกครั้ง"));
    const path = `${auth.user.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from("profile-avatars").upload(path, image, { contentType: image.type, upsert: true, cacheControl: "0" });
    if (error) {
      console.error("Profile avatar upload failed", error);
      if (error.message.toLowerCase().includes("mime")) throw new Error(uiText("ระบบรูปโปรไฟล์ยังตั้งค่ารูปแบบไฟล์ไม่ครบ กรุณาลองใหม่ภายหลัง"));
      if (error.message.toLowerCase().includes("size")) throw new Error(uiText("รูปที่ปรับแล้วยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปอื่น"));
      throw new Error(uiText("อัปโหลดรูปไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง"));
    }
    const privateUrl = privateProfileAvatarUrl(path);
    const { error: profileError } = await db.from("user_profile_avatars").upsert({ user_id: auth.user.id, avatar_url: privateUrl, updated_at: new Date().toISOString() });
    if (profileError) {
      console.error("Profile avatar reference update failed", profileError);
      await db.storage.from("profile-avatars").remove([path]);
      throw new Error(uiText("รูปถูกอัปโหลดแล้ว แต่บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง"));
    }
    const previousPath = previousAvatar?.avatar_url
      ? profileAvatarPath(previousAvatar.avatar_url, getSupabaseConfiguration().url, auth.user.id) : null;
    if (previousPath) await db.storage.from("profile-avatars").remove([previousPath]);
    setAvatarUrl(privateUrl);
  };
  return { avatarUrl, saveAvatar };
}

export function ProfilePage() {
  const uiText = useUiText();

  const { profile, academicTerm } = useAppState();
  const { avatarUrl } = useProfileAvatar(profile.avatarUrl ?? "");
  const menu = [{ href: "/profile/personal", title: "ข้อมูลส่วนตัว", subtitle: "ชื่อ อีเมล และข้อมูลการศึกษา", icon: UserRound, tone: "purple" }, { href: "/help", title: "ช่วยเหลือ", subtitle: "คู่มือและคำถามที่พบบ่อย", icon: CircleHelp, tone: "cyan" }];
  const requiredFields = [profile.displayName, profile.email, profile.major, profile.university];
  const completion = Math.round((requiredFields.filter((value) => value.trim()).length / requiredFields.length) * 100);
  return <div className="page profile-page-new"><header className="profile-page-header"><div><h1>{uiText("โปรไฟล์")}</h1><p>{uiText("จัดการข้อมูลส่วนตัวและการเรียนของคุณ")}</p></div></header><Card className="profile-hero profile-hero-static"><div className="profile-avatar-wrap"><ProfileAvatar name={profile.displayName} imageUrl={avatarUrl} size="large" /></div><div className="profile-hero-copy"><h2>{profile.displayName || uiText("โปรไฟล์ของคุณ")}</h2><p>{profile.email || uiText("เพิ่มอีเมลเพื่อให้ข้อมูลครบถ้วน")}</p><span>{uiText(joinAcademicDetails([profile.major, academicTerm.level]))}</span></div></Card>{completion < 100 && <Card className="profile-completeness"><div><strong>{uiText("ข้อมูลโปรไฟล์")}{completion}{uiText("% ครบถ้วน")}</strong><p>{uiText("เพิ่มข้อมูลที่ยังขาดเพื่อให้ TALEVO แสดงข้อมูลได้เหมาะขึ้น")}</p></div><Link href="/profile/personal">{uiText("เพิ่มข้อมูล")}</Link></Card>}<section><div className="section-header"><h2>{uiText("ข้อมูลการศึกษา")}</h2></div><div className="academic-identity-grid">{academicItems.map(({ key, label, icon: Icon }, index) => <Card key={key} className={`academic-card academic-card-${index + 1}`}><span className="academic-icon"><Icon /></span><small>{uiText(label)}</small><strong>{profile[key] || uiText("ยังไม่ได้ระบุ")}</strong></Card>)}<Card className="academic-card academic-card-3"><span className="academic-icon"><Target /></span><small>{uiText("ชั้นปี")}</small><strong>{academicTerm.level || uiText("ยังไม่ได้ระบุ")}</strong></Card><Card className="academic-card academic-card-4"><span className="academic-icon"><BookOpen /></span><small>{uiText("ภาคการศึกษา")}</small><strong>{joinAcademicDetails([academicTerm.term, academicTerm.academicYear], uiText("ยังไม่ได้ระบุ"))}</strong></Card></div></section><section><div className="section-header"><h2>{uiText("บัญชีและการเรียน")}</h2></div><Card className="profile-menu-new">{menu.map(({ href, title, subtitle, icon: Icon, tone }) => <Link key={href} href={href} className={`menu-tone-${tone}`}><span><Icon /></span><div><strong>{uiText(title)}</strong><small>{uiText(subtitle)}</small></div><ChevronRight /></Link>)}</Card></section></div>;
}

export function PersonalProfilePage() {
  const uiText = useUiText();

  const router = useRouter();
  const { profile, academicTerm, updateProfile, updateAcademicTerm } = useAppState();
  const { avatarUrl, saveAvatar } = useProfileAvatar(profile.avatarUrl ?? "");
  const [editing, setEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(profile);
  const [termDraft, setTermDraft] = useState(academicTerm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const beginEdit = () => { setProfileDraft(profile); setTermDraft(academicTerm); setErrors({}); setSaved(false); setEditing(true); };
  const cancelEdit = () => { setProfileDraft(profile); setTermDraft(academicTerm); setErrors({}); setEditing(false); };
  const isDirty = profileDraft.displayName !== profile.displayName || profileDraft.email !== profile.email || profileDraft.major !== profile.major || profileDraft.university !== profile.university || termDraft.level !== academicTerm.level || termDraft.term !== academicTerm.term || termDraft.academicYear !== academicTerm.academicYear;
  const returnToProfile = () => { if (!editing || !isDirty || window.confirm(uiText("ยังไม่ได้บันทึกการเปลี่ยนแปลง ต้องการออกโดยไม่บันทึกหรือไม่?"))) router.push("/profile"); };
  const save = () => {
    const nextProfile = { displayName: profileDraft.displayName.trim(), email: profileDraft.email.trim(), major: profileDraft.major.trim(), university: profileDraft.university.trim() };
    const nextTerm = { ...termDraft, level: termDraft.level.trim(), term: termDraft.term.trim(), academicYear: termDraft.academicYear.trim() };
    const nextErrors: Record<string, string> = {};
    if (!nextProfile.displayName) nextErrors.displayName = "กรุณากรอกชื่อที่แสดง";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextProfile.email)) nextErrors.email = "กรุณากรอกอีเมลให้ถูกต้อง";
    if (!nextTerm.level) nextErrors.level = "กรุณากรอกชั้นปี";
    if (!nextTerm.term) nextErrors.term = "กรุณากรอกภาคเรียน";
    if (!/^\d{4}$/.test(nextTerm.academicYear)) nextErrors.academicYear = "กรุณากรอกปีการศึกษา 4 หลัก";
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    updateProfile(nextProfile);
    updateAcademicTerm(nextTerm);
    setProfileDraft((current) => ({ ...current, ...nextProfile }));
    setTermDraft(nextTerm);
    setErrors({});
    setSaved(true);
    setEditing(false);
  };
  const value = (key: keyof typeof profileDraft, label: string, error?: string) => editing ? <Field label={uiText(label)} error={uiText(error)}><Input maxLength={80} value={profileDraft[key] as string} onChange={(event) => setProfileDraft({ ...profileDraft, [key]: event.target.value })} /></Field> : <div><span>{uiText(label)}</span><strong>{profile[key] || uiText("ยังไม่ได้ระบุ")}</strong></div>;
  return <div className="page profile-subpage"><PageHeader title={uiText("ข้อมูลส่วนตัว")} backHref="/profile" onBack={returnToProfile} action={editing ? undefined : uiText("แก้ไขข้อมูล")} onAction={beginEdit} />{editing && <p className="personal-edit-status" role="status">{uiText("กำลังแก้ไข")}</p>}{saved && <p className="local-saved personal-saved" role="status">{uiText("บันทึกข้อมูลเรียบร้อยแล้ว")}</p>}<section className={`personal-list ${editing ? "is-editing" : ""}`}><h2>{uiText("ข้อมูลบัญชี")}</h2><Card><div className="personal-avatar-settings"><ProfileAvatar name={profile.displayName} imageUrl={avatarUrl} size="normal" /><div className="personal-avatar-copy"><strong>{uiText("รูปโปรไฟล์")}</strong><p>{uiText("รูปนี้จะแสดงบนหน้าโปรไฟล์ของคุณ")}</p><PortraitImageEditor onSaved={saveAvatar} buttonLabel={uiText("เปลี่ยนรูปภาพ")} /></div></div>{value("displayName", uiText("ชื่อที่แสดง"), errors.displayName)}{editing ? <Field label={uiText("อีเมล")} error={errors.email}><Input type="email" inputMode="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} /></Field> : <div><span>{uiText("อีเมล")}</span><strong>{profile.email || uiText("ยังไม่ได้ระบุ")}</strong></div>}</Card><h2>{uiText("ข้อมูลการศึกษา")}</h2><Card>{value("major", uiText("สาขา"))}{value("university", uiText("มหาวิทยาลัย"))}</Card><h2>{uiText("ข้อมูลภาคเรียนปัจจุบัน")}</h2><Card>{editing ? <><Field label={uiText("ชั้นปี")} error={errors.level}><Input maxLength={60} value={termDraft.level} onChange={(event) => setTermDraft({ ...termDraft, level: event.target.value })} /></Field><Field label={uiText("ภาคเรียน")} error={errors.term}><Input maxLength={60} value={termDraft.term} onChange={(event) => setTermDraft({ ...termDraft, term: event.target.value })} /></Field><Field label={uiText("ปีการศึกษา")} error={errors.academicYear}><Input inputMode="numeric" maxLength={4} value={termDraft.academicYear} onChange={(event) => setTermDraft({ ...termDraft, academicYear: event.target.value.replace(/\D/g, "") })} /></Field></> : <><div><span>{uiText("ชั้นปี")}</span><strong>{academicTerm.level || uiText("ยังไม่ได้ระบุ")}</strong></div><div><span>{uiText("ภาคเรียน")}</span><strong>{academicTerm.term || uiText("ยังไม่ได้ระบุ")}</strong></div><div><span>{uiText("ปีการศึกษา")}</span><strong>{academicTerm.academicYear || uiText("ยังไม่ได้ระบุ")}</strong></div></>}</Card></section>{editing && <div className="personal-edit-actions"><button className="secondary-button" type="button" onClick={cancelEdit}>{uiText("ยกเลิก")}</button><button className="primary-button" type="button" onClick={save} disabled={!isDirty}>{uiText("บันทึกการเปลี่ยนแปลง")}</button></div>}</div>;
}

export function GoalsPage() {
  const uiText = useUiText();

  const { goals, updateGoals } = useAppState(); const [form, setForm] = useState(goals); const [saved, setSaved] = useState(false);
  const save = () => { updateGoals({ ...form, weeklyStudyHours: Math.max(1, Math.min(40, form.weeklyStudyHours)) }); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  return <div className="page goals-page"><PageHeader title={uiText("เป้าหมายการเรียน")} backHref="/profile" /><p className="goals-intro">{uiText("กำหนดสิ่งที่อยากทำให้สำเร็จ เพื่อให้ TALEVO ช่วยวางแผนได้เหมาะขึ้น")}</p><section className="goals-summary" aria-label={uiText("เป้าหมายของฉัน")}><Card><strong>{goals.weeklyStudyHours} {uiText("ชม.")}</strong><span>{uiText("ทบทวนต่อสัปดาห์")}</span></Card><Card><strong>{goals.earlySubmissionDays} {uiText("วัน")}</strong><span>{uiText("ทำงานก่อนกำหนด")}</span></Card></section><Card className="goals-editor"><Field label={uiText("เวลาทบทวนต่อสัปดาห์ — {0} ชั่วโมง", [form.weeklyStudyHours])}><Input type="range" min="1" max="40" step="1" value={form.weeklyStudyHours} onChange={(event) => setForm({ ...form, weeklyStudyHours: Number(event.target.value) })} /></Field><Field label={uiText("ทำงานให้เสร็จก่อนกำหนด")}><Select value={String(form.earlySubmissionDays)} onChange={(event) => setForm({ ...form, earlySubmissionDays: Number(event.target.value) })}><option value="0">{uiText("ตรงวันกำหนด")}</option><option value="1">{uiText("1 วัน")}</option><option value="2">{uiText("2 วัน")}</option><option value="3">{uiText("3 วัน")}</option></Select></Field><Field label={uiText("เป้าหมายส่วนตัว")}><Textarea value={form.personalGoal} onChange={(event) => setForm({ ...form, personalGoal: event.target.value })} placeholder={uiText("เช่น ส่งงานให้ตรงเวลาทุกวิชา")} /></Field><button className="primary-button button-block" type="button" onClick={save}>{uiText("บันทึกเป้าหมาย")}</button>{saved && <p className="local-saved" role="status">{uiText("บันทึกเป้าหมายบนอุปกรณ์แล้ว")}</p>}</Card></div>;
}

const faqItems = [
  {
    category: "เริ่มต้นใช้งาน",
    question: "เริ่มใช้ TALEVO อย่างไร?",
    answer: "เริ่มจากเพิ่มคาบเรียนในตารางเรียน แล้วเพิ่มงานที่ต้องส่ง จากนั้นหน้าหลักจะสรุปให้เองว่าวันนี้มีเรียนอะไรและงานไหนใกล้ถึงกำหนด",
  },
  {
    category: "ตารางเรียน",
    question: "เพิ่มคาบเรียนอย่างไร?",
    answer: "ไปที่ตารางเรียน แล้วกดปุ่มเพิ่มคาบเรียน กรอกชื่อวิชา วัน เวลา และห้องเรียน",
  },
  {
    category: "งานและกำหนดส่ง",
    question: "แก้ไขงานที่สร้างแล้วได้อย่างไร?",
    answer: "เปิดงานที่ต้องการจากหน้ารายการงาน แล้วเลือกแก้ไข หรือกดลบถ้าไม่ต้องการแล้ว",
  },
  {
    category: "การแจ้งเตือน",
    question: "ทำไมฉันไม่ได้รับการแจ้งเตือน?",
    answer: "การแจ้งเตือนจะเด้งเฉพาะตอนที่เปิด TALEVO ค้างไว้ในเบราว์เซอร์ ถ้าปิดไปแล้วจะไม่มีแจ้งเตือน และต้องเปิดการแจ้งเตือนในหน้าตั้งค่าพร้อมกดอนุญาตให้เบราว์เซอร์แจ้งเตือนด้วย สำหรับ iPhone และ iPad ต้องเพิ่ม TALEVO ไปยังหน้าจอโฮมก่อนจึงจะแจ้งเตือนได้",
  },
  {
    category: "TALEVO AI",
    question: "TALEVO AI ใช้ข้อมูลอะไรในการตอบ?",
    answer: "AI จะเห็นเฉพาะคำถามที่คุณพิมพ์ กับหมวดข้อมูลที่คุณติ๊กเลือกก่อนส่ง เช่น ตารางเรียนหรืองาน ถ้าไม่ติ๊กอะไรเลย AI จะตอบจากคำถามอย่างเดียว และถามได้ 20 ครั้งต่อ 24 ชั่วโมง",
  },
];

export function HelpPage() {
  const uiText = useUiText();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [helpMessage, setHelpMessage] = useState("");
  const [helpStatus, setHelpStatus] = useState("");
  const [sendingHelp, setSendingHelp] = useState(false);
  const shown = faqItems.filter((item) => `${item.category}${item.question}${item.answer}${uiText(item.category)}${uiText(item.question)}${uiText(item.answer)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sendHelpRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingHelp) return;
    setSendingHelp(true);
    setHelpStatus("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) throw new Error(uiText("กรุณาเข้าสู่ระบบก่อนส่งข้อความ"));
      const { error } = await db.from("support_reports").insert({ user_id: auth.user.id, message: helpMessage.trim(), category: "help" });
      if (error) {
        console.error("Help request submit failed", error);
        if (error.code === "42501") throw new Error(uiText("บัญชีนี้ยังไม่มีสิทธิ์ส่งข้อความ กรุณาออกจากระบบแล้วเข้าใหม่"));
        if (error.code === "23514") throw new Error(uiText("กรุณาพิมพ์ข้อความอย่างน้อย 10 ตัวอักษร"));
        if (error.code === "PGRST204") throw new Error(uiText("ระบบกำลังปรับปรุงส่วนนี้ กรุณาลองใหม่อีกครั้งภายหลัง"));
        throw new Error(uiText("ส่งข้อความไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง"));
      }
      setHelpMessage("");
      setHelpStatus(uiText("ส่งข้อความถึงแอดมินเรียบร้อยแล้ว"));
    } catch (error) {
      setHelpStatus(error instanceof Error ? error.message : uiText("ส่งข้อความไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setSendingHelp(false);
    }
  };
  return <div className="page help-page"><PageHeader title={uiText("ช่วยเหลือ")} backHref="/profile" /><Card className="help-hero"><TalevoMascot variant="neutral" crop="head" size="sm" decorative priority /><div><h2>{uiText("มีอะไรให้ TALEVO ช่วยไหม?")}</h2><p>{uiText("ค้นหาวิธีใช้งานหรือดูคำตอบจากคำถามที่พบบ่อย")}</p></div></Card><label className="help-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={uiText("ค้นหาคำถามหรือวิธีใช้งาน")} aria-label={uiText("ค้นหาคำถามหรือวิธีใช้งาน")} /></label><section className="faq-list" aria-label={uiText("คำถามที่พบบ่อย")}>{shown.length ? shown.map((item) => <Card key={uiText(item.question)}><button type="button" aria-expanded={open === item.question} onClick={() => setOpen(open === item.question ? null : item.question)}><span><small>{uiText(item.category)}</small><strong>{uiText(item.question)}</strong></span><ChevronDown /></button>{open === item.question && <p>{uiText(item.answer)}</p>}</Card>) : <Card className="faq-empty"><p>{uiText("ไม่พบคำถามที่ตรงกับการค้นหา ลองใช้คำที่กว้างขึ้น")}</p></Card>}</section><section className="help-request-section"><div className="section-header"><h2>{uiText("ขอความช่วยเหลือ")}</h2></div><Card className="help-request-card"><div className="support-report-intro"><span><LifeBuoy aria-hidden="true" /></span><div><strong>{uiText("ส่งข้อความถึงแอดมิน")}</strong><p>{uiText("พิมพ์คำถามหรือเรื่องที่ต้องการให้ช่วยได้เลย")}</p></div></div><form onSubmit={sendHelpRequest}><label htmlFor="help-request-message">{uiText("ข้อความของคุณ")}</label><textarea id="help-request-message" className="input" aria-describedby="help-request-hint" required minLength={10} maxLength={2000} rows={4} value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} placeholder={uiText("พิมพ์ข้อความที่ต้องการสอบถาม...")} /><small id="help-request-hint" className="support-report-hint">{uiText("พิมพ์อย่างน้อย 10 ตัวอักษรเพื่อส่งข้อความ")}</small><div className="support-report-meta"><small>{helpMessage.length}/2,000</small><small>{uiText("ข้อความนี้จะส่งถึงแอดมินเท่านั้น")}</small></div><button className="primary-button" type="submit" disabled={sendingHelp || helpMessage.trim().length < 10}><Send size={20} aria-hidden="true" />{sendingHelp ? uiText("กำลังส่ง…") : uiText("ส่งข้อความขอความช่วยเหลือ")}</button><p role="status">{helpStatus}</p></form></Card></section></div>;
}
