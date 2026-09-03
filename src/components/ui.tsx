"use client";

import Link from "next/link";
import Image from "next/image";
import { Bell, ChevronLeft, GraduationCap, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
export { TalevoMascot } from "@/components/talevo-mascot";
export { TalevoMascotAvatar } from "@/components/talevo-mascot-avatar";
import type { SubjectColor } from "@/types";
import { useAppState } from "@/providers/app-state-provider";
import { getUnreadNotificationCount } from "@/lib/alerts/notification-utils";
import { useLanguage } from "@/providers/language-provider";
import { APP_BRAND } from "@/lib/brand";

export function TalevoBrand({ variant = "full" }: { variant?: "compact" | "full" }) {
  return (
    <div className={`brand brand-${variant}`} aria-label={`${APP_BRAND.name} — ${APP_BRAND.tagline}`}>
      <span className="brand-logo brand-logo-image"><Image src="/assets/mascot/talevo-wordmark-upload.png" alt="" width={2172} height={724} sizes="(max-width: 699px) 148px, 170px" priority /></span>
      {variant === "full" && <span className="brand-copy"><small>{APP_BRAND.tagline}</small></span>}
    </div>
  );
}


export function Card({ children, className = "", ...props }: ComponentProps<"div">) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}

export function IconTile({ icon: Icon, children, tone = "purple", className = "", label }: { icon?: LucideIcon; children?: ReactNode; tone?: "purple" | "blue" | "indigo" | "orange" | "green" | "red" | "cyan" | "slate" | "pink"; className?: string; label?: string }) {
  return <span className={`icon-tile icon-tile-${tone} ${className}`} aria-label={label} role={label ? "img" : undefined}>{children ?? (Icon && <Icon aria-hidden="true" />)}</span>;
}

export function IconButton({ label, className = "", children, ...props }: ComponentProps<"button"> & { label: string }) {
  return <button className={`icon-button ${className}`} type="button" aria-label={label} {...props}>{children}</button>;
}

export function StatusIcon({ icon: Icon, tone = "purple", label }: { icon: LucideIcon; tone?: "purple" | "blue" | "orange" | "green" | "red"; label: string }) {
  return <span className={`status-icon status-icon-${tone}`} aria-label={label} role="img"><Icon aria-hidden="true" /></span>;
}

export function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="section-header"><h2>{title}</h2>{action && (href ? <Link href={href}>{action}</Link> : <span>{action}</span>)}</div>
  );
}

export function PageHeader({ title, backHref, action, onAction, onBack }: { title: string; backHref?: string; action?: string; onAction?: () => void; onBack?: () => void }) {
  return (
    <header className="page-header">
      <div className="page-header-side">{backHref && (onBack ? <button className="icon-button" type="button" aria-label="ย้อนกลับ" onClick={onBack}><ChevronLeft /></button> : <Link className="icon-button" href={backHref} aria-label="ย้อนกลับ"><ChevronLeft /></Link>)}</div>
      <h1>{title}</h1>
      <div className="page-header-side right">{action && <button className="text-button" type="button" onClick={onAction}>{action}</button>}</div>
    </header>
  );
}

export function NotificationBell() {
  const { notifications } = useAppState();
  const { language } = useLanguage();
  const count = getUnreadNotificationCount(notifications);
  const label = language === "th" ? `การแจ้งเตือนที่ยังไม่อ่าน ${count} รายการ` : `${count} unread notifications`;
  return <Link href="/notifications" className="icon-button notification-bell" aria-label={label}><Bell aria-hidden="true" />{count > 0 && <span>{count > 99 ? "99+" : count}</span>}</Link>;
}

export function ProgressBar({ value = 0, color = "purple", label }: { value?: number; color?: SubjectColor | string; label?: string }) {
  const isHexColor = /^#[0-9a-f]{6}$/i.test(color);
  return (
    <div className="progress-wrap">
      {label && <div className="progress-label"><span>{label}</span><strong>{value}%</strong></div>}
      <div className="progress-track" aria-label={`${label ?? "ความคืบหน้า"} ${value}%`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span className={`progress-fill ${isHexColor ? "" : `color-${color}`}`} style={{ width: `${value}%`, ...(isHexColor ? { backgroundColor: color } : {}) }} />
      </div>
    </div>
  );
}

export function ProgressRing({ value }: { value: number }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div><strong>{value}%</strong><span>ความคืบหน้า</span></div>
    </div>
  );
}

export function StatusPill({ children, tone = "purple" }: { children: ReactNode; tone?: "purple" | "orange" | "green" | "red" | "blue" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{error && <small className="field-error" role="alert">{error}</small>}</label>;
}

export function Input(props: ComponentProps<"input">) {
  return <input className="input" {...props} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className="input textarea" {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select className="input select" {...props} />;
}

export function BottomSheet({ open, title, onClose, children, className = "", closeLabel = "ปิด" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string; closeLabel?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])
        .filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]")?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className={`bottom-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" />
        <header><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}><X /></button></header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <Card className="empty-state"><div className="empty-icon"><GraduationCap /></div><h3>{title}</h3><p>{description}</p></Card>;
}
