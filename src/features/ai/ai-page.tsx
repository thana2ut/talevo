"use client";

import Link from "next/link";
import { AlertCircle, CalendarDays, Check, ChevronLeft, Info, ListTodo, Plus, RefreshCw, Send, ShieldCheck, Sparkles, Square, WifiOff, X, type LucideIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BottomSheet, TalevoMascotAvatar } from "@/components/ui";
import { getPendingTasks } from "@/lib/local-ai";
import { formatTaskDateTime } from "@/lib/task-utils";
import { EMPTY_AI_CONTEXT_SELECTION, type AIChatRequest, type AIChatSuccess, type AIContextKey, type AIContextSelection, type AIErrorResponse, type AIHistoryItem, type AIUsageStatusResponse } from "@/lib/ai/types";
import { useAppState } from "@/providers/app-state-provider";
import type { ChatMessage, ClassSchedule, Task } from "@/types";

const MAX_MESSAGE_LENGTH = 8_000;
const CHARACTER_WARNING_AT = 7_200;
const LOCAL_MODE_AVAILABLE = true;

const CONTEXT_OPTIONS: Array<{ key: AIContextKey; label: string; description: string; icon: LucideIcon }> = [
  { key: "schedule", label: "ตารางเรียน", description: "ชื่อวิชา วัน และเวลา", icon: CalendarDays },
  { key: "tasks", label: "งาน", description: "ชื่อ กำหนดส่ง และสถานะ", icon: ListTodo },
];

const SUGGESTIONS = [
  "วันนี้ต้องทำอะไรบ้าง?",
  "วันนี้มีเรียนอะไร?",
  "งานอะไรใกล้ส่ง?",
  "ช่วยจัดลำดับงานสำคัญ",
];

type OnlineAvailability = "unconfigured" | "checking" | "ready" | "unavailable";
type AIChatMode = "online" | "on-device";
type AIExperienceStatus =
  | "online-unconfigured"
  | "online-ready"
  | "online-loading"
  | "online-unavailable"
  | "on-device-ready"
  | "fully-unavailable"
  | "sending"
  | "response-error";

const FRAGMENT_THRESHOLD_PX = 28;

function adjustScrollForClippedFragments(container: HTMLElement | null, threshold = FRAGMENT_THRESHOLD_PX) {
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const messages = container.querySelectorAll<HTMLElement>(".ai-premium-message");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgRect = msg.getBoundingClientRect();

    if (msgRect.top < containerRect.top && msgRect.bottom > containerRect.top) {
      const visibleHeight = msgRect.bottom - containerRect.top;
      if (visibleHeight > 0 && visibleHeight <= threshold) {
        container.scrollTop += Math.ceil(visibleHeight) + 4;
      }
      break;
    }
  }
}

function getAIExperienceStatus({
  mode,
  onlineAvailability,
  isSending,
  hasResponseError,
  quotaReached,
  localModeAvailable,
  isRechecking,
}: {
  mode: AIChatMode;
  onlineAvailability: OnlineAvailability;
  isSending: boolean;
  hasResponseError: boolean;
  quotaReached: boolean;
  localModeAvailable: boolean;
  isRechecking?: boolean;
}): AIExperienceStatus {
  if (isSending) return "sending";
  if (isRechecking || onlineAvailability === "checking") return "online-loading";
  if (mode === "on-device" && localModeAvailable) return "on-device-ready";
  if (onlineAvailability === "unconfigured") return "online-unconfigured";
  if (onlineAvailability === "unavailable") {
    return localModeAvailable ? "online-unavailable" : "fully-unavailable";
  }
  if (hasResponseError) return "response-error";
  if (onlineAvailability === "ready" && !quotaReached) return "online-ready";
  return localModeAvailable ? "online-unavailable" : "fully-unavailable";
}

function renderInlineMarkdown(content: string) {
  return content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function AIMessageContent({ content }: { content: string }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const expression = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
      const items: string[] = [];
      while (index < lines.length && expression.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(expression, ""));
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`${ordered ? "ol" : "ul"}-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}</List>);
      continue;
    }
    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(line)}</p>);
    index += 1;
  }
  return <div className="ai-markdown">{blocks}</div>;
}

function TaskSummaryMessage({ tasks, schedules }: { tasks: Task[]; schedules: ClassSchedule[] }) {
  const items = getPendingTasks(tasks).slice(0, 4);
  return (
    <div className="ai-summary">
      <strong>งานที่ยังไม่เสร็จ</strong>
      <ol>
        {items.map((task) => (
          <li key={task.id}>
            <Link href={`/tasks/${task.id}`}>
              <span>{task.title}</span>
              <small>{schedules.find((item) => item.courseId === task.courseId)?.name ?? "งานทั่วไป"} · {formatTaskDateTime(task)}</small>
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/tasks" className="secondary-button button-block">ดูรายละเอียดทั้งหมด</Link>
    </div>
  );
}

function ContextPanel({ selected, onToggle }: { selected: AIContextSelection; onToggle: (key: AIContextKey) => void }) {
  const selectedCount = Object.values(selected).filter(Boolean).length;
  return (
    <section className="ai-context-panel" aria-labelledby="ai-context-title">
      <div className="ai-panel-heading">
        <span><Sparkles /></span>
        <div>
          <h2 id="ai-context-title">ข้อมูลที่ให้ AI ใช้</h2>
          <p>
            {selectedCount === 0
              ? "ยังไม่ได้แนบข้อมูล TALEVO · AI ใช้เฉพาะหมวดที่คุณเลือกในคำถามนี้"
              : `เลือกแล้ว ${selectedCount} หมวด · AI ใช้เฉพาะหมวดที่คุณเลือกในคำถามนี้`}
          </p>
        </div>
      </div>
      <div className="ai-context-options">
        {CONTEXT_OPTIONS.map((item) => {
          const Icon = item.icon;
          const isChecked = selected[item.key];
          return (
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              className={`ai-context-item ${isChecked ? "is-selected" : ""}`}
              key={item.key}
              onClick={() => onToggle(item.key)}
            >
              <span className="ai-context-icon"><Icon /></span>
              <span className="ai-context-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <span className="ai-context-check" aria-hidden="true">
                {isChecked && <Check />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ai-context-summary">
        <span className="ai-context-badge">
          {selectedCount === 0 ? "ยังไม่ได้แนบข้อมูล TALEVO" : `เลือกแล้ว ${selectedCount} หมวด`}
        </span>
        <p className="ai-context-note">
          {selectedCount === 0
            ? "ยังไม่ได้แนบข้อมูล TALEVO · หากยังไม่เลือก ระบบจะไม่ใช้ข้อมูล TALEVO เพิ่มเติม"
            : "AI ใช้เฉพาะหมวดที่คุณเลือก · ข้อมูลการเงิน โน้ต และข้อมูลส่วนตัวจะไม่ถูกส่งอัตโนมัติ"}
        </p>
      </div>
    </section>
  );
}

function PrivacyPanel({ mode, onOpen }: { mode: AIChatMode; onOpen: () => void }) {
  return (
    <section className="ai-privacy-panel">
      <button className="ai-privacy-trigger" type="button" onClick={onOpen} aria-label="อ่านรายละเอียดความเป็นส่วนตัวของ TALEVO AI">
        <ShieldCheck />
        <span>
          <strong>ความเป็นส่วนตัว</strong>
          <small>{mode === "on-device" ? "ใช้ข้อมูลที่เลือกในอุปกรณ์นี้" : "ส่งเฉพาะข้อมูลที่คุณเลือก"}</small>
        </span>
        <span className="ai-privacy-more">ดูรายละเอียด</span>
      </button>
    </section>
  );
}

function PrivacyDialog() {
  return (
    <div className="ai-privacy-dialog">
      <span><ShieldCheck /></span>
      <p>คุณควบคุมได้ว่าจะให้ AI ใช้ข้อมูลส่วนใดในคำถามนี้</p>
      <section>
        <h3>เลือกก่อนใช้เสมอ</h3>
        <p>ค่าเริ่มต้นจะไม่แนบข้อมูล TALEVO เพิ่มเติม คุณเลือกตารางเรียนหรืองานได้ก่อนส่งคำถามทุกครั้ง</p>
      </section>
      <section>
        <h3>เมื่อใช้ AI ออนไลน์</h3>
        <p>ระบบจะส่งเฉพาะข้อความที่คุณพิมพ์และหมวดข้อมูลที่เลือก เพื่อสร้างคำตอบ ข้อมูลการเงิน โปรไฟล์ อีเมล การแจ้งเตือน โน้ต และไฟล์แนบจะไม่ถูกส่งอัตโนมัติ</p>
      </section>
      <section>
        <h3>เมื่อใช้โหมดในอุปกรณ์</h3>
        <p>คำตอบจะประมวลผลในอุปกรณ์นี้ และใช้เฉพาะหมวดข้อมูลที่คุณเลือก โดยไม่ส่งออกไปยังบริการ AI ภายนอก</p>
      </section>
    </div>
  );
}

function formatCompactDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

function formatResetDate(resetAt: string) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(resetAt));
}

function UsageCard({
  usage,
  countdown,
  loading,
  error,
  onlineUnavailable,
  isUnconfigured,
  isLocalMode,
  onRefresh,
}: {
  usage: AIUsageStatusResponse | null;
  countdown: number | null;
  loading: boolean;
  error: string;
  onlineUnavailable: boolean;
  isUnconfigured: boolean;
  isLocalMode: boolean;
  onRefresh: () => void;
}) {
  const percent = usage && !isUnconfigured && usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  return (
    <section className={`ai-usage-card ${onlineUnavailable || isUnconfigured ? "is-unavailable" : ""} ${isLocalMode ? "is-local-mode" : ""}`} aria-label="โควตา AI ออนไลน์">
      <div className="ai-usage-top">
        <div>
          <span>โควตา AI ออนไลน์</span>
          <strong>
            {loading
              ? "กำลังตรวจสอบ"
              : isLocalMode
                ? "โหมดในอุปกรณ์"
                : isUnconfigured
                  ? "AI ออนไลน์ยังไม่ได้เชื่อมต่อ"
                  : usage
                    ? `เหลือ ${usage.remaining} ครั้ง`
                    : "ตรวจสอบไม่ได้"}
          </strong>
        </div>
        {(error || onlineUnavailable) && !isUnconfigured && (
          <button type="button" onClick={onRefresh} aria-label="ตรวจสอบโควตาอีกครั้ง">
            <RefreshCw />
          </button>
        )}
      </div>
      <div className="ai-usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={usage?.limit ?? 40} aria-valuenow={isUnconfigured ? 0 : (usage?.used ?? 0)}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="ai-usage-meta">
        <span>
          {isLocalMode
            ? "โหมดในอุปกรณ์ไม่หักโควตา"
            : isUnconfigured
              ? "ระบบจะแสดงโควตาเมื่อเชื่อมต่อ AI ออนไลน์"
              : usage
                ? `${usage.used} / ${usage.limit} คำตอบ`
                : "ระบบจะตรวจสอบอีกครั้งเมื่อพร้อม"}
        </span>
        <span>
          {isUnconfigured
            ? "กำลังรอการตั้งค่าผู้ให้บริการ AI ใหม่"
            : onlineUnavailable
              ? "สิทธิ์คงเหลือจะใช้ได้เมื่อ AI ออนไลน์กลับมาพร้อม"
              : usage?.resetAt && countdown !== null
                ? `รีเซ็ต ${formatResetDate(usage.resetAt)} · อีก ${formatCompactDuration(countdown)}`
                : "รอบเริ่มเมื่อได้รับคำตอบแรก"}
        </span>
      </div>
    </section>
  );
}

function AIStatusCard({
  status,
  message,
  isRechecking = false,
  canUseOnDevice,
  canReturnOnline,
  canRetryMessage,
  onUseOnDevice,
  onReturnOnline,
  onRetry,
}: {
  status: AIExperienceStatus;
  message: string;
  isRechecking?: boolean;
  canUseOnDevice: boolean;
  canReturnOnline: boolean;
  canRetryMessage: boolean;
  onUseOnDevice: () => void;
  onReturnOnline: () => void;
  onRetry: () => void;
}) {
  const copy: Record<AIExperienceStatus, { title: string; detail: string; tone: string }> = {
    "online-unconfigured": {
      title: "AI ออนไลน์ยังไม่ได้เชื่อมต่อ",
      detail: "กำลังรอการตั้งค่าผู้ให้บริการ AI ใหม่",
      tone: "unconfigured",
    },
    "online-ready": { title: "AI ออนไลน์พร้อมใช้งาน", detail: "พร้อมช่วยสรุปบทเรียน วางแผน และเตรียมสอบ", tone: "ready" },
    "online-loading": {
      title: "กำลังตรวจสอบ AI ออนไลน์",
      detail: "กำลังเชื่อมต่อเพื่อตรวจสอบความพร้อมของระบบ...",
      tone: "checking",
    },
    "online-unavailable": {
      title: "AI ออนไลน์ไม่พร้อมใช้งานชั่วคราว",
      detail: message ? "ส่งคำถามล่าสุดไม่สำเร็จ คุณสามารถใช้โหมดในอุปกรณ์หรือลองใหม่ได้" : "คุณยังสามารถใช้โหมดในอุปกรณ์ได้",
      tone: "warning",
    },
    "on-device-ready": { title: "AI ในอุปกรณ์พร้อมใช้งาน", detail: "ช่วยตอบคำถามการเรียนจากข้อมูลที่คุณเลือก โดยไม่ส่งข้อมูลออกไป", tone: "local" },
    "fully-unavailable": { title: "AI ยังไม่พร้อมใช้งาน", detail: message || "ขณะนี้ยังไม่สามารถเริ่มคำถามได้ กรุณาลองใหม่ภายหลัง", tone: "blocked" },
    sending: { title: "กำลังส่งคำถาม", detail: "TALEVO กำลังเรียบเรียงคำตอบให้คุณ", tone: "checking" },
    "response-error": { title: "ส่งคำถามไม่สำเร็จ", detail: message || "ลองอีกครั้ง หรือใช้โหมดในอุปกรณ์แทนได้", tone: "warning" },
  };
  const current = copy[status];
  const showFallback = (status === "online-unavailable" || status === "response-error" || status === "online-unconfigured" || (status === "online-loading" && isRechecking)) && canUseOnDevice;

  const renderIcon = () => {
    switch (status) {
      case "online-ready":
        return <Sparkles />;
      case "online-loading":
      case "sending":
        return <RefreshCw className="is-spinning" />;
      case "on-device-ready":
        return <ShieldCheck />;
      case "response-error":
        return <AlertCircle />;
      case "online-unconfigured":
      case "online-unavailable":
      case "fully-unavailable":
      default:
        return <WifiOff />;
    }
  };

  return (
    <section className={`ai-status-card tone-${current.tone}`} role={status === "response-error" || status === "fully-unavailable" ? "alert" : "status"}>
      <span className="ai-status-icon">{renderIcon()}</span>
      <div>
        <strong>{current.title}</strong>
        <p>{current.detail}</p>
      </div>
      {showFallback && (
        <div className="ai-status-actions">
          <button type="button" className="primary-button" onClick={onUseOnDevice} disabled={isRechecking}>ใช้โหมดในอุปกรณ์</button>
          {status !== "online-unconfigured" && (
            <button
              type="button"
              className="secondary-button"
              onClick={onRetry}
              disabled={isRechecking}
              aria-busy={isRechecking}
            >
              <RefreshCw className={isRechecking ? "is-spinning" : undefined} />
              {isRechecking ? "กำลังตรวจสอบ..." : canRetryMessage ? "ลองส่งอีกครั้ง" : "ลองตรวจสอบอีกครั้ง"}
            </button>
          )}
        </div>
      )}
      {status === "on-device-ready" && canReturnOnline && (
        <button type="button" className="text-button ai-return-online" onClick={onReturnOnline}>กลับไปใช้ AI ออนไลน์</button>
      )}
    </section>
  );
}

function createBoundedHistory(chat: ChatMessage[]): AIHistoryItem[] {
  const selected: AIHistoryItem[] = [];
  let total = 0;
  for (const message of chat.slice(-6).reverse()) {
    const content = message.content.trim().slice(0, 2_000);
    if (!content || total + content.length > 8_000) continue;
    selected.unshift({ role: message.role, content });
    total += content.length;
  }
  return selected;
}

export function AIPage() {
  const { chat, appendChatMessages, sendChat, tasks, schedules } = useAppState();
  const [input, setInput] = useState("");
  const [selectedContext, setSelectedContext] = useState<AIContextSelection>({ ...EMPTY_AI_CONTEXT_SELECTION });
  const [isLoading, setIsLoading] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryRequest, setRetryRequest] = useState<AIChatRequest | null>(null);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [usage, setUsage] = useState<AIUsageStatusResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [onlineAvailability, setOnlineAvailability] = useState<OnlineAvailability>("checking");
  const [mode, setMode] = useState<AIChatMode>("online");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);

  const recheckOnlineStatus = useCallback(async (): Promise<{ ready: boolean; payload: AIUsageStatusResponse | null }> => {
    setIsRechecking(true);
    setOnlineAvailability("checking");
    setErrorMessage("");
    setUsageError("");
    setUsageLoading(true);
    try {
      const response = await fetch("/api/ai/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null) as AIUsageStatusResponse | AIErrorResponse | null;
      if (!response.ok || !payload || !("remaining" in payload)) throw new Error("usage unavailable");
      setUsage(payload);
      setCountdown(payload.resetAt ? payload.retryAfterSeconds : null);
      const isReady = Boolean(payload.providerConfigured);
      setOnlineAvailability(isReady ? "ready" : "unconfigured");
      if (!isReady) {
        setErrorMessage("AI ออนไลน์ยังไม่ได้เชื่อมต่อ");
      }
      return { ready: isReady, payload };
    } catch {
      setUsageError("ตรวจสอบสถานะ AI ออนไลน์ไม่สำเร็จ");
      setOnlineAvailability("unavailable");
      setErrorMessage("AI ออนไลน์ไม่พร้อมใช้งานชั่วคราว");
      return { ready: false, payload: null };
    } finally {
      setUsageLoading(false);
      setIsRechecking(false);
    }
  }, []);

  const refreshUsage = useCallback(() => void recheckOnlineStatus(), [recheckOnlineStatus]);

  useEffect(() => {
    const task = window.setTimeout(() => void recheckOnlineStatus(), 0);
    return () => window.clearTimeout(task);
  }, [recheckOnlineStatus]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (!chatScroll) return;
    chatScroll.scrollTop = chatScroll.scrollHeight;
    const task = window.setTimeout(() => {
      chatScroll.scrollTop = chatScroll.scrollHeight;
      adjustScrollForClippedFragments(chatScroll);
    }, 60);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (!chatScroll) return;
    const scrollToBottomAndAdjust = () => {
      chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: "smooth" });
    };
    const frame = requestAnimationFrame(scrollToBottomAndAdjust);
    const timer1 = window.setTimeout(() => {
      adjustScrollForClippedFragments(chatScroll);
    }, 120);
    const timer2 = window.setTimeout(() => {
      adjustScrollForClippedFragments(chatScroll);
    }, 360);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
    };
  }, [chat.length, pendingMessage, isLoading]);

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (!chatScroll) return;
    const onResize = () => adjustScrollForClippedFragments(chatScroll);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!usage?.resetAt) return;
    const initialSeconds = Math.max(0, usage.retryAfterSeconds);
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil(initialSeconds - (performance.now() - startedAt) / 1_000));
      setCountdown(next);
      if (next === 0) void refreshUsage();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [refreshUsage, usage?.resetAt, usage?.retryAfterSeconds]);

  const getErrorMessage = (response: AIErrorResponse | null, status: number) => {
    if (status === 401) return "กรุณาเข้าสู่ระบบใหม่ก่อนใช้ TALEVO AI";
    if (response?.code === "AI_RATE_LIMIT") return response.message || "ใช้ AI ออนไลน์ครบโควตาในรอบนี้แล้ว";
    if (response?.code === "AI_PROVIDER_QUOTA") return "โควตา AI ออนไลน์เต็มชั่วคราว กรุณาลองใหม่ภายหลัง";
    if (response?.code === "AI_BUSY") return "มีคำถามที่กำลังประมวลผลอยู่ กรุณารอให้เสร็จก่อน";
    if (response?.code === "AI_TIMEOUT") return "AI ใช้เวลาตอบนานเกินไป ลองส่งข้อความที่สั้นลงได้ครับ";
    if (response?.code === "AI_CANCELLED") return "หยุดการสร้างคำตอบแล้ว คุณสามารถลองอีกครั้งได้";
    return response?.message ?? "เชื่อมต่อ AI ออนไลน์ไม่สำเร็จ กรุณาลองใหม่";
  };

  const sendOnlineRequest = async (requestBody: AIChatRequest, bypassAvailabilityCheck = false) => {
    if (requestInFlightRef.current || isLoading || usage?.remaining === 0) return;
    if (!bypassAvailabilityCheck && onlineAvailability !== "ready") return;
    requestInFlightRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setPendingMessage(requestBody.message);
    setErrorMessage("");
    setRetryRequest(requestBody);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as AIChatSuccess | AIErrorResponse | null;
      if (!response.ok) {
        const errorPayload = payload as AIErrorResponse | null;
        setErrorMessage(getErrorMessage(errorPayload, response.status));
        if (response.status === 429) void refreshUsage();
        if (errorPayload?.code === "AI_PROVIDER_QUOTA" || errorPayload?.code === "AI_PROVIDER_UNAVAILABLE" || errorPayload?.code === "AI_TIMEOUT") {
          setOnlineAvailability("unavailable");
        }
        return;
      }
      const success = payload as AIChatSuccess;
      if (!success?.message?.trim() || !success.usage) {
        setErrorMessage("AI ไม่ได้ส่งคำตอบกลับมา กรุณาลองใหม่");
        return;
      }
      appendChatMessages([
        { id: `chat-user-${crypto.randomUUID()}`, role: "user", content: requestBody.message },
        { id: `chat-ai-${crypto.randomUUID()}`, role: "assistant", content: success.message.trim(), kind: "text" },
      ]);
      setUsage({ ...success.usage, providerConfigured: true });
      setCountdown(success.usage.resetAt ? success.usage.retryAfterSeconds : null);
      setOnlineAvailability("ready");
      setRetryRequest(null);
    } catch (error) {
      const wasCancelled = error instanceof DOMException && error.name === "AbortError";
      setErrorMessage(wasCancelled ? "หยุดการสร้างคำตอบแล้ว คุณสามารถลองอีกครั้งได้" : "เชื่อมต่อ AI ออนไลน์ไม่สำเร็จ กรุณาลองใหม่");
      if (!wasCancelled) setOnlineAvailability("unavailable");
      void refreshUsage();
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      requestInFlightRef.current = false;
      setPendingMessage("");
      setIsLoading(false);
    }
  };

  const activateOnDeviceMode = (message?: string) => {
    if (!LOCAL_MODE_AVAILABLE) return;
    setMode("on-device");
    setErrorMessage("");
    setRetryRequest(null);
    const localMessage = message?.trim();
    if (!localMessage) return;
    sendChat(localMessage, { ...selectedContext });
    setInput("");
  };

  const quotaReached = usage?.remaining === 0;
  const experienceStatus = getAIExperienceStatus({
    mode,
    onlineAvailability,
    isSending: isLoading,
    isRechecking,
    hasResponseError: Boolean(errorMessage),
    quotaReached,
    localModeAvailable: LOCAL_MODE_AVAILABLE,
  });
  const onlineCanSend = onlineAvailability === "ready" && !quotaReached && !isRechecking;
  const canSend = !isLoading && !isRechecking && (mode === "on-device" ? LOCAL_MODE_AVAILABLE : onlineCanSend);
  const selectedOptions = CONTEXT_OPTIONS.filter((item) => selectedContext[item.key]);
  const placeholder = mode === "on-device"
    ? "ถามเรื่องงานหรือตารางเรียนจากข้อมูลที่เลือก..."
    : isRechecking || onlineAvailability === "checking"
      ? "กำลังตรวจสอบ AI ออนไลน์..."
      : onlineAvailability === "unconfigured"
        ? "AI ออนไลน์ยังไม่ได้เชื่อมต่อ · เลือกโหมดในอุปกรณ์เพื่อถามต่อ"
        : quotaReached
          ? "AI ออนไลน์ครบโควตาชั่วคราว เลือกโหมดในอุปกรณ์เพื่อถามต่อ"
          : onlineAvailability === "unavailable"
            ? "AI ออนไลน์ไม่พร้อมใช้งานชั่วคราว เลือกโหมดในอุปกรณ์เพื่อถามต่อ"
            : "พิมพ์คำถามเกี่ยวกับการเรียนหรืองาน...";

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || !canSend) return;
    setInput("");
    if (mode === "on-device") {
      activateOnDeviceMode(message);
      return;
    }
    void sendOnlineRequest({ message, selectedContext: { ...selectedContext }, history: createBoundedHistory(chat) });
  };

  const toggleContext = (key: AIContextKey) => setSelectedContext((current) => ({ ...current, [key]: !current[key] }));
  const clearContext = (key: AIContextKey) => setSelectedContext((current) => ({ ...current, [key]: false }));
  const retryOnline = async () => {
    if (isRechecking || isLoading) return;
    if (retryRequest) {
      const { ready } = await recheckOnlineStatus();
      if (ready) {
        void sendOnlineRequest(retryRequest, true);
      }
      return;
    }
    void recheckOnlineStatus();
  };
  const switchToOnDevice = () => activateOnDeviceMode(retryRequest?.message);
  const statusCard = (
    <AIStatusCard
      status={experienceStatus}
      message={errorMessage}
      isRechecking={isRechecking}
      canUseOnDevice={LOCAL_MODE_AVAILABLE}
      canReturnOnline={onlineAvailability === "ready" && mode === "on-device"}
      canRetryMessage={Boolean(retryRequest)}
      onUseOnDevice={switchToOnDevice}
      onReturnOnline={() => {
        setMode("online");
        setErrorMessage("");
      }}
      onRetry={() => void retryOnline()}
    />
  );
  const usageCard = (
    <UsageCard
      usage={usage}
      countdown={countdown}
      loading={usageLoading}
      error={usageError}
      onlineUnavailable={experienceStatus === "online-unavailable" || experienceStatus === "response-error"}
      isUnconfigured={onlineAvailability === "unconfigured" || usage?.providerConfigured === false}
      isLocalMode={mode === "on-device"}
      onRefresh={() => void refreshUsage()}
    />
  );

  return (
    <div className="page ai-premium-page">
      <header className="ai-premium-header">
        <div className="ai-header-left">
          <Link href="/today" className="icon-button ai-back-button" aria-label="ย้อนกลับ">
            <ChevronLeft />
          </Link>
          <div className="ai-brand-lockup">
            <TalevoMascotAvatar size="sm" priority />
            <div className="ai-brand-info">
              <div className="ai-title-row">
                <span className="ai-brand-kicker">LEARN • PLAN • GROW</span>
                <span className={`ai-mode-badge mode-${mode} status-${experienceStatus}`}>
                  <i className="ai-badge-dot" />
                  {mode === "on-device"
                    ? "AI ในอุปกรณ์"
                    : isRechecking || onlineAvailability === "checking"
                      ? "กำลังตรวจสอบ AI ออนไลน์..."
                      : onlineAvailability === "unconfigured"
                        ? "AI ออนไลน์ยังไม่ได้เชื่อมต่อ"
                        : onlineAvailability === "ready"
                          ? `${usage?.providerLabel || "Groq"} พร้อมใช้งาน`
                          : "AI ออนไลน์ไม่พร้อมใช้งานชั่วคราว"}
                </span>
                <button
                  className="icon-button ai-info-button"
                  type="button"
                  aria-label="เกี่ยวกับ TALEVO AI"
                  onClick={() => setAboutOpen(true)}
                >
                  <Info />
                </button>
              </div>
              <h1>TALEVO AI</h1>
              <p>ผู้ช่วยวางแผนการเรียนของคุณ</p>
            </div>
          </div>
        </div>
        <div className="ai-header-right">
          {usageCard}
        </div>
      </header>

      <div className="ai-workbench">
        <div className="ai-mobile-summary">
          {experienceStatus !== "online-ready" && statusCard}
          {usageCard}
        </div>

        <section className="ai-conversation-card" aria-label="การสนทนากับ TALEVO AI">
          <div ref={chatScrollRef} className="ai-conversation-scroll" aria-live="polite">
            {chat.length === 0 && !pendingMessage && (
              <div className="ai-empty-state">
                <div className="ai-empty-orbit">
                  <TalevoMascotAvatar size="lg" priority showSparkle />
                </div>
                <h2>วันนี้อยากให้ TALEVO ช่วยอะไร?</h2>
                <p>สรุปบทเรียน วางแผนอ่านหนังสือ จัดลำดับงาน หรือเตรียมสอบได้จากตรงนี้</p>
                <p className="sr-only">ประวัติการสนทนายังว่างอยู่</p>
                <small>ประวัติการสนทนายังว่างอยู่ · เลือกข้อมูล TALEVO ได้ก่อนส่งคำถาม</small>
                <div className="ai-suggestion-grid">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      disabled={!canSend}
                      onClick={() => {
                        setInput(suggestion);
                        textareaRef.current?.focus();
                      }}
                    >
                      <Sparkles />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.map((message, index) => (
              <div key={message.id} className={`ai-premium-message ${message.role}`}>
                {message.role === "assistant" && (
                  <TalevoMascotAvatar size="xs" priority={index === 0} />
                )}
                <div className="ai-premium-bubble">
                  <AIMessageContent content={message.content} />
                  {message.kind === "task-summary" && <TaskSummaryMessage tasks={tasks} schedules={schedules} />}
                  <small>{message.role === "assistant" ? "TALEVO AI" : "คุณ"}</small>
                </div>
              </div>
            ))}

            {pendingMessage && (
              <>
                <div className="ai-premium-message user is-pending">
                  <div className="ai-premium-bubble">
                    <AIMessageContent content={pendingMessage} />
                    <small>กำลังส่ง...</small>
                  </div>
                </div>
                {isLoading && (
                  <div className="ai-premium-message assistant is-loading">
                    <TalevoMascotAvatar size="xs" />
                    <div className="ai-premium-bubble">
                      <span className="ai-thinking-dots" aria-label="AI กำลังคิด">
                        <i /><i /><i />
                      </span>
                      <small>กำลังเรียบเรียงคำตอบ</small>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <form className="ai-premium-composer" onSubmit={submit}>
            {selectedOptions.length > 0 && (
              <div className="ai-selected-context" aria-label="บริบทที่กำลังแนบ">
                {selectedOptions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button type="button" key={item.key} onClick={() => clearContext(item.key)} aria-label={`ยกเลิก ${item.label}`}>
                      <Icon />
                      {item.label}
                      <X />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ai-composer-row">
              <button className="ai-context-trigger" type="button" onClick={() => setContextSheetOpen(true)} aria-label="เลือกข้อมูล TALEVO ที่ให้ AI ใช้">
                <Plus />
                <span>บริบท</span>
                {selectedOptions.length > 0 && <b>{selectedOptions.length}</b>}
              </button>
              <label className="sr-only" htmlFor="talevo-ai-message">พิมพ์คำถามถึง TALEVO AI</label>
              <textarea
                ref={textareaRef}
                id="talevo-ai-message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={placeholder}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={1}
                disabled={!canSend}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              {isLoading ? (
                <button className="ai-send-button is-stop" type="button" aria-label="หยุดสร้างคำตอบ" onClick={() => abortControllerRef.current?.abort()}>
                  <Square />
                </button>
              ) : (
                <button className="ai-send-button" type="submit" aria-label="ส่งข้อความ" disabled={!input.trim() || !canSend}>
                  <Send />
                </button>
              )}
            </div>

            <div className="ai-composer-meta">
              <span>
                {mode === "on-device"
                  ? "AI ในอุปกรณ์ใช้เฉพาะข้อมูลที่เลือก"
                  : selectedOptions.length
                    ? `แนบข้อมูล ${selectedOptions.length} หมวด`
                    : "ยังไม่ได้แนบข้อมูล TALEVO"}
              </span>
              {input.length >= CHARACTER_WARNING_AT && (
                <strong className={input.length >= MAX_MESSAGE_LENGTH ? "is-limit" : ""}>
                  {input.length.toLocaleString("th-TH")} / {MAX_MESSAGE_LENGTH.toLocaleString("th-TH")}
                </strong>
              )}
            </div>
          </form>
        </section>

        <aside className="ai-desktop-sidebar">
          {experienceStatus !== "online-ready" && statusCard}
          <ContextPanel selected={selectedContext} onToggle={toggleContext} />
          <PrivacyPanel mode={mode} onOpen={() => setPrivacyOpen(true)} />
        </aside>
      </div>

      <BottomSheet
        open={contextSheetOpen}
        title="ข้อมูลที่ให้ AI ใช้"
        onClose={() => setContextSheetOpen(false)}
        closeLabel="ปิดตัวเลือกบริบท"
        className="ai-context-sheet"
      >
        <ContextPanel selected={selectedContext} onToggle={toggleContext} />
        <PrivacyPanel mode={mode} onOpen={() => setPrivacyOpen(true)} />
        <button className="primary-button button-block" type="button" onClick={() => setContextSheetOpen(false)}>
          ใช้บริบทที่เลือก ({selectedOptions.length})
        </button>
      </BottomSheet>

      <BottomSheet
        open={privacyOpen}
        title="ความเป็นส่วนตัวของ TALEVO AI"
        onClose={() => setPrivacyOpen(false)}
        closeLabel="ปิดรายละเอียด"
      >
        <PrivacyDialog />
      </BottomSheet>

      <BottomSheet
        open={aboutOpen}
        title="เกี่ยวกับ TALEVO AI"
        onClose={() => setAboutOpen(false)}
        closeLabel="ปิด"
        className="ai-about-sheet"
      >
        <div className="ai-about-dialog">
          <TalevoMascotAvatar size="md" className="ai-about-mascot" />
          <p className="ai-about-subtitle">TALEVO AI ช่วยวางแผนการเรียน ตอบคำถาม และให้คำแนะนำแบบอ่านอย่างเดียว</p>
          <section>
            <h3>โควตา AI ออนไลน์</h3>
            <p>จำนวนคำตอบจะนับเมื่อได้รับคำตอบออนไลน์สำเร็จ และไม่เกี่ยวกับประวัติแชต</p>
          </section>
          <section>
            <h3>คุณควบคุมบริบท</h3>
            <p>ค่าเริ่มต้นไม่ใช้ข้อมูล TALEVO เพิ่มเติม และจะใช้เฉพาะหมวดที่คุณเปิดเอง</p>
          </section>
          <section>
            <h3>ตรวจคำตอบสำคัญเสมอ</h3>
            <p>คำแนะนำจาก AI อาจคลาดเคลื่อนได้ ควรตรวจสอบข้อมูลสำคัญกับแหล่งข้อมูลจริงเสมอ</p>
          </section>
          <button className="primary-button button-block" type="button" onClick={() => setAboutOpen(false)}>
            เข้าใจแล้ว
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
