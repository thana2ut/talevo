"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Building2, ChevronDown, ChevronRight, CircleHelp, GraduationCap, Search, Target, UserRound } from "lucide-react";
import { useState } from "react";
import { Card, Field, Input, TalevoMascot, PageHeader, Select, Textarea } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";

export function ProfileAvatar({ name, imageUrl, size = "normal" }: { name: string; imageUrl?: string; size?: "normal" | "large" }) {
  // Older versions persisted session-only blob URLs. They are invalid after a reload.
  // eslint-disable-next-line @next/next/no-img-element
  if (imageUrl && !imageUrl.startsWith("blob:")) return <img className={`profile-avatar-image profile-avatar-${size}`} src={imageUrl} alt={`รูปโปรไฟล์ ${name}`} />;
  return <span className={`profile-avatar-fallback profile-avatar-${size}`} aria-label={`รูปโปรไฟล์ ${name}`}>{name.trim().slice(0, 1) || "ค"}</span>;
}

const academicItems = [{ key: "major", label: "สาขา", icon: GraduationCap }, { key: "university", label: "มหาวิทยาลัย", icon: Building2 }] as const;

function joinAcademicDetails(values: string[], fallback = "ยังไม่ได้ระบุข้อมูลการศึกษา") {
  const details = values.map((value) => value.trim()).filter(Boolean);
  return details.length ? details.join(" · ") : fallback;
}

export function ProfilePage() {
  const { profile, academicTerm } = useAppState();
  const menu = [{ href: "/profile/personal", title: "ข้อมูลส่วนตัว", subtitle: "ชื่อ อีเมล และข้อมูลการศึกษา", icon: UserRound, tone: "purple" }, { href: "/help", title: "ช่วยเหลือ", subtitle: "คู่มือและคำถามที่พบบ่อย", icon: CircleHelp, tone: "cyan" }];
  const requiredFields = [profile.displayName, profile.email, profile.major, profile.university];
  const completion = Math.round((requiredFields.filter((value) => value.trim()).length / requiredFields.length) * 100);
  return <div className="page profile-page-new"><header className="profile-page-header"><div><h1>โปรไฟล์</h1><p>จัดการข้อมูลส่วนตัวและการเรียนของคุณ</p></div></header><Card className="profile-hero profile-hero-static"><div className="profile-avatar-wrap"><ProfileAvatar name={profile.displayName} imageUrl={profile.avatarUrl} size="large" /></div><div className="profile-hero-copy"><h2>{profile.displayName || "โปรไฟล์ของคุณ"}</h2><p>{profile.email || "เพิ่มอีเมลเพื่อให้ข้อมูลครบถ้วน"}</p><span>{joinAcademicDetails([profile.major, academicTerm.level])}</span></div></Card>{completion < 100 && <Card className="profile-completeness"><div><strong>ข้อมูลโปรไฟล์ {completion}% ครบถ้วน</strong><p>เพิ่มข้อมูลที่ยังขาดเพื่อให้ TALEVO แสดงข้อมูลได้เหมาะขึ้น</p></div><Link href="/profile/personal">เพิ่มข้อมูล</Link></Card>}<section><div className="section-header"><h2>ข้อมูลการศึกษา</h2></div><div className="academic-identity-grid">{academicItems.map(({ key, label, icon: Icon }, index) => <Card key={key} className={`academic-card academic-card-${index + 1}`}><span className="academic-icon"><Icon /></span><small>{label}</small><strong>{profile[key] || "ยังไม่ได้ระบุ"}</strong></Card>)}<Card className="academic-card academic-card-3"><span className="academic-icon"><Target /></span><small>ชั้นปี</small><strong>{academicTerm.level || "ยังไม่ได้ระบุ"}</strong></Card><Card className="academic-card academic-card-4"><span className="academic-icon"><BookOpen /></span><small>ภาคการศึกษา</small><strong>{joinAcademicDetails([academicTerm.term, academicTerm.academicYear], "ยังไม่ได้ระบุ")}</strong></Card></div></section><section><div className="section-header"><h2>บัญชีและการเรียน</h2></div><Card className="profile-menu-new">{menu.map(({ href, title, subtitle, icon: Icon, tone }) => <Link key={href} href={href} className={`menu-tone-${tone}`}><span><Icon /></span><div><strong>{title}</strong><small>{subtitle}</small></div><ChevronRight /></Link>)}</Card></section></div>;
}

export function PersonalProfilePage() {
  const router = useRouter();
  const { profile, academicTerm, updateProfile, updateAcademicTerm } = useAppState();
  const [editing, setEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(profile);
  const [termDraft, setTermDraft] = useState(academicTerm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const beginEdit = () => { setProfileDraft(profile); setTermDraft(academicTerm); setErrors({}); setSaved(false); setEditing(true); };
  const cancelEdit = () => { setProfileDraft(profile); setTermDraft(academicTerm); setErrors({}); setEditing(false); };
  const isDirty = profileDraft.displayName !== profile.displayName || profileDraft.email !== profile.email || profileDraft.major !== profile.major || profileDraft.university !== profile.university || termDraft.level !== academicTerm.level || termDraft.term !== academicTerm.term || termDraft.academicYear !== academicTerm.academicYear;
  const returnToProfile = () => { if (!editing || !isDirty || window.confirm("ยังไม่ได้บันทึกการเปลี่ยนแปลง ต้องการออกโดยไม่บันทึกหรือไม่?")) router.push("/profile"); };
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
  const value = (key: keyof typeof profileDraft, label: string, error?: string) => editing ? <Field label={label} error={error}><Input maxLength={80} value={profileDraft[key] as string} onChange={(event) => setProfileDraft({ ...profileDraft, [key]: event.target.value })} /></Field> : <div><span>{label}</span><strong>{profile[key] || "ยังไม่ได้ระบุ"}</strong></div>;
  return <div className="page profile-subpage"><PageHeader title="ข้อมูลส่วนตัว" backHref="/profile" onBack={returnToProfile} action={editing ? undefined : "แก้ไขข้อมูล"} onAction={beginEdit} />{editing && <p className="personal-edit-status" role="status">กำลังแก้ไข</p>}{saved && <p className="local-saved personal-saved" role="status">บันทึกข้อมูลเรียบร้อยแล้ว</p>}<section className={`personal-list ${editing ? "is-editing" : ""}`}><h2>ข้อมูลบัญชี</h2><Card>{value("displayName", "ชื่อที่แสดง", errors.displayName)}{editing ? <Field label="อีเมล" error={errors.email}><Input type="email" inputMode="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} /></Field> : <div><span>อีเมล</span><strong>{profile.email || "ยังไม่ได้ระบุ"}</strong></div>}</Card><h2>ข้อมูลการศึกษา</h2><Card>{value("major", "สาขา")}{value("university", "มหาวิทยาลัย")}</Card><h2>ข้อมูลภาคเรียนปัจจุบัน</h2><Card>{editing ? <><Field label="ชั้นปี" error={errors.level}><Input maxLength={60} value={termDraft.level} onChange={(event) => setTermDraft({ ...termDraft, level: event.target.value })} /></Field><Field label="ภาคเรียน" error={errors.term}><Input maxLength={60} value={termDraft.term} onChange={(event) => setTermDraft({ ...termDraft, term: event.target.value })} /></Field><Field label="ปีการศึกษา" error={errors.academicYear}><Input inputMode="numeric" maxLength={4} value={termDraft.academicYear} onChange={(event) => setTermDraft({ ...termDraft, academicYear: event.target.value.replace(/\D/g, "") })} /></Field></> : <><div><span>ชั้นปี</span><strong>{academicTerm.level || "ยังไม่ได้ระบุ"}</strong></div><div><span>ภาคเรียน</span><strong>{academicTerm.term || "ยังไม่ได้ระบุ"}</strong></div><div><span>ปีการศึกษา</span><strong>{academicTerm.academicYear || "ยังไม่ได้ระบุ"}</strong></div></>}</Card></section>{editing && <div className="personal-edit-actions"><button className="secondary-button" type="button" onClick={cancelEdit}>ยกเลิก</button><button className="primary-button" type="button" onClick={save} disabled={!isDirty}>บันทึกการเปลี่ยนแปลง</button></div>}</div>;
}

export function GoalsPage() {
  const { goals, updateGoals } = useAppState(); const [form, setForm] = useState(goals); const [saved, setSaved] = useState(false);
  const save = () => { updateGoals({ ...form, weeklyStudyHours: Math.max(1, Math.min(40, form.weeklyStudyHours)) }); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  return <div className="page goals-page"><PageHeader title="เป้าหมายการเรียน" backHref="/profile" /><p className="goals-intro">กำหนดสิ่งที่อยากทำให้สำเร็จ เพื่อให้ TALEVO ช่วยวางแผนได้เหมาะขึ้น</p><section className="goals-summary" aria-label="เป้าหมายของฉัน"><Card><strong>{goals.weeklyStudyHours} ชม.</strong><span>ทบทวนต่อสัปดาห์</span></Card><Card><strong>{goals.earlySubmissionDays} วัน</strong><span>ทำงานก่อนกำหนด</span></Card></section><Card className="goals-editor"><Field label={`เวลาทบทวนต่อสัปดาห์ — ${form.weeklyStudyHours} ชั่วโมง`}><Input type="range" min="1" max="40" step="1" value={form.weeklyStudyHours} onChange={(event) => setForm({ ...form, weeklyStudyHours: Number(event.target.value) })} /></Field><Field label="ทำงานให้เสร็จก่อนกำหนด"><Select value={String(form.earlySubmissionDays)} onChange={(event) => setForm({ ...form, earlySubmissionDays: Number(event.target.value) })}><option value="0">ตรงวันกำหนด</option><option value="1">1 วัน</option><option value="2">2 วัน</option><option value="3">3 วัน</option></Select></Field><Field label="เป้าหมายส่วนตัว"><Textarea value={form.personalGoal} onChange={(event) => setForm({ ...form, personalGoal: event.target.value })} placeholder="เช่น ส่งงานให้ตรงเวลาทุกวิชา" /></Field><button className="primary-button button-block" type="button" onClick={save}>บันทึกเป้าหมาย</button>{saved && <p className="local-saved" role="status">บันทึกเป้าหมายบนอุปกรณ์แล้ว</p>}</Card></div>;
}

const faqItems = [{ category: "เริ่มต้นใช้งาน", question: "เริ่มใช้ TALEVO อย่างไร?", answer: "เริ่มจากเพิ่มคาบเรียนและงานที่ต้องทำ ข้อมูลจะถูกบันทึกไว้ในเบราว์เซอร์ของอุปกรณ์นี้" }, { category: "ตารางเรียน", question: "เพิ่มคาบเรียนอย่างไร?", answer: "ไปที่ตารางเรียน แล้วเลือกปุ่มเพิ่มคาบเรียนเพื่อกรอกรายละเอียดได้เลย" }, { category: "งานและกำหนดส่ง", question: "แก้ไขงานที่สร้างแล้วได้อย่างไร?", answer: "เปิดรายละเอียดงานจากหน้ารายการงาน แล้วเลือกแก้ไขจากเมนูการทำงาน" }, { category: "การแจ้งเตือน", question: "ทำไมฉันไม่ได้รับการแจ้งเตือน?", answer: "ตรวจการตั้งค่าการแจ้งเตือนในแอปและสิทธิ์การแจ้งเตือนของเบราว์เซอร์ก่อน" }, { category: "TALEVO AI", question: "TALEVO AI ใช้ข้อมูลอะไรในการตอบ?", answer: "คำถามที่รองรับจะสรุปจากงานและตารางเรียนที่บันทึกไว้ด้วยกฎภายในอุปกรณ์ โดยยังไม่เชื่อมต่อโมเดล AI หรือบริการภายนอก" }, { category: "บัญชีและข้อมูล", question: "ข้อมูลโปรไฟล์ถูกเก็บที่ไหน?", answer: "ข้อมูลถูกบันทึกในเบราว์เซอร์ของอุปกรณ์นี้ ยังไม่มีการจัดเก็บบนเซิร์ฟเวอร์" }];

export function HelpPage() {
  const [query, setQuery] = useState(""); const [open, setOpen] = useState<string | null>(null); const shown = faqItems.filter((item) => `${item.category}${item.question}${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="page help-page"><PageHeader title="ช่วยเหลือ" backHref="/profile" /><Card className="help-hero"><TalevoMascot variant="neutral" crop="head" size="sm" decorative priority /><div><h2>มีอะไรให้ TALEVO ช่วยไหม?</h2><p>ค้นหาวิธีใช้งานหรือดูคำตอบจากคำถามที่พบบ่อย</p></div></Card><label className="help-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาคำถามหรือวิธีใช้งาน" aria-label="ค้นหาคำถามหรือวิธีใช้งาน" /></label><section className="faq-list" aria-label="คำถามที่พบบ่อย">{shown.length ? shown.map((item) => <Card key={item.question}><button type="button" aria-expanded={open === item.question} onClick={() => setOpen(open === item.question ? null : item.question)}><span><small>{item.category}</small><strong>{item.question}</strong></span><ChevronDown /></button>{open === item.question && <p>{item.answer}</p>}</Card>) : <Card className="faq-empty"><p>ไม่พบคำถามที่ตรงกับการค้นหา ลองใช้คำที่กว้างขึ้น</p></Card>}</section></div>;
}
