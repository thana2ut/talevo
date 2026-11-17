"use client";

import Link from "next/link";
import { GraduationCap, CalendarDays, Check, ChevronLeft, Info, ListTodo, Plus, Send, ShieldCheck, Sparkles, Square, X, type LucideIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BottomSheet, TalevoMascotAvatar } from "@/components/ui";
import { getPendingTasks } from "@/lib/local-ai";
import { formatTaskDateTime } from "@/lib/task-utils";
import { EMPTY_AI_CONTEXT_SELECTION, type AIChatRequest, type AIChatSuccess, type AIContextKey, type AIContextSelection, type AIErrorResponse, type AIHistoryItem, type AIUsageStatusResponse } from "@/lib/ai/types";
import { useAppState } from "@/providers/app-state-provider";
import type { ChatMessage, ClassSchedule, Task } from "@/types";
import { useUiText } from "@/providers/ui-language";


const MAX_MESSAGE_LENGTH = 8_000;
const CHARACTER_WARNING_AT = 7_200;
const LOCAL_MODE_AVAILABLE = true;

const CONTEXT_OPTIONS: Array<{ key: AIContextKey; label: string; description: string; icon: LucideIcon }> = [
  { key: "schedule", label: "ตารางเรียน", description: "ชื่อวิชา วัน และเวลา", icon: CalendarDays },
  { key: "tasks", label: "งาน", description: "ชื่อ กำหนดส่ง และสถานะ", icon: ListTodo },
  { key: "grades", label: "คะแนนรายวิชา", description: "เป้าหมายและคะแนนที่บันทึกไว้", icon: GraduationCap },
  { key: "academic", label: "ภาคเรียน", description: "ชั้นปี ภาคเรียน และปีการศึกษา", icon: CalendarDays },
  { key: "exams", label: "การสอบ", description: "วิชา วันสอบ เวลา และห้องสอบ", icon: GraduationCap },
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
  const uiText = useUiText();

  const items = getPendingTasks(tasks).slice(0, 4);
  return (
    <div className="ai-summary">
      <strong>{uiText("งานที่ยังไม่เสร็จ")}</strong>
      <ol>
        {items.map((task) => (
          <li key={task.id}>
            <Link href={`/tasks/${task.id}`}>
              <span>{task.title}</span>
              <small>{schedules.find((item) => item.courseId === task.courseId)?.name ?? uiText("งานทั่วไป")} · {formatTaskDateTime(task, uiText.language)}</small>
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/tasks" className="secondary-button button-block">{uiText("ดูรายละเอียดทั้งหมด")}</Link>
    </div>
  );
}

function ContextPanel({ selected, onToggle }: { selected: AIContextSelection; onToggle: (key: AIContextKey) => void }) {
  const uiText = useUiText();

  const selectedCount = Object.values(selected).filter(Boolean).length;
  return (
    <section className="ai-context-panel" aria-labelledby="ai-context-title">
      <div className="ai-panel-heading">
        <span><Sparkles /></span>
        <div>
          <h2 id="ai-context-title">{uiText("ข้อมูลที่ให้ AI ใช้")}</h2>
          <p>
            {selectedCount === 0
              ? uiText("เลือกหมวด TALEVO ที่ต้องการให้ AI ใช้")
              : uiText("เลือกแล้ว {0} หมวด · AI ใช้เฉพาะข้อมูลที่เลือก", [selectedCount])}
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
                <strong>{uiText(item.label)}</strong>
                <small>{uiText(item.description)}</small>
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
          {selectedCount === 0 ? uiText("ยังไม่ได้แนบข้อมูล TALEVO") : uiText("เลือกแล้ว {0} หมวด", [selectedCount])}
        </span>
        <p className="ai-context-note">
          {selectedCount === 0
            ? uiText("ยังไม่เลือกหมวด · AI จะไม่ใช้ข้อมูล TALEVO")
            : uiText("AI ใช้เฉพาะหมวดที่เลือก · ข้อมูลส่วนตัวไม่ส่งอัตโนมัติ")}
        </p>
      </div>
    </section>
  );
}

function PrivacyPanel({ mode, onOpen }: { mode: AIChatMode; onOpen: () => void }) {
  const uiText = useUiText();

  return (
    <section className="ai-privacy-panel">
      <button className="ai-privacy-trigger" type="button" onClick={onOpen} aria-label={uiText("อ่านรายละเอียดความเป็นส่วนตัวของ TALEVO AI")}>
        <ShieldCheck />
        <span>
          <strong>{uiText("ความเป็นส่วนตัว")}</strong>
          <small>{mode === "on-device" ? uiText("ใช้ข้อมูลที่เลือกในอุปกรณ์นี้") : uiText("ส่งเฉพาะข้อมูลที่คุณเลือก")}</small>
        </span>
        <span className="ai-privacy-more">{uiText("ดูรายละเอียด")}</span>
      </button>
    </section>
  );
}

function PrivacyDialog() {
  const uiText = useUiText();

  return (
    <div className="ai-privacy-dialog">
      <span><ShieldCheck /></span>
      <p>{uiText("คุณควบคุมได้ว่าจะให้ AI ใช้ข้อมูลส่วนใดในคำถามนี้")}</p>
      <section>
        <h3>{uiText("เลือกก่อนใช้เสมอ")}</h3>
        <p>{uiText("ค่าเริ่มต้นจะไม่แนบข้อมูล TALEVO เพิ่มเติม คุณเลือกตารางเรียนหรืองานได้ก่อนส่งคำถามทุกครั้ง")}</p>
      </section>
      <section>
        <h3>{uiText("เมื่อใช้ AI ออนไลน์")}</h3>
        <p>{uiText("ระบบจะส่งเฉพาะข้อความที่คุณพิมพ์และหมวดข้อมูลที่เลือก เพื่อสร้างคำตอบ ข้อมูลการเงิน โปรไฟล์ อีเมล การแจ้งเตือน โน้ต และไฟล์แนบจะไม่ถูกส่งอัตโนมัติ")}</p>
      </section>
      <section>
        <h3>{uiText("เมื่อใช้โหมดในอุปกรณ์")}</h3>
        <p>{uiText("คำตอบจะประมวลผลในอุปกรณ์นี้ และใช้เฉพาะหมวดข้อมูลที่คุณเลือก โดยไม่ส่งออกไปยังบริการ AI ภายนอก")}</p>
      </section>
    </div>
  );
}

function formatCompactDuration(seconds: number) {
  const totalMinutes = Math.ceil(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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
  quotaReached,
  onlineUnavailable,
  isUnconfigured,
  isLocalMode,
}: {
  usage: AIUsageStatusResponse | null;
  countdown: number | null;
  loading: boolean;
  quotaReached: boolean;
  onlineUnavailable: boolean;
  isUnconfigured: boolean;
  isLocalMode: boolean;
}) {
  const uiText = useUiText();

  const percent = usage && !isUnconfigured && usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  return (
    <section className={`ai-usage-card ${onlineUnavailable || isUnconfigured ? "is-unavailable" : ""} ${isLocalMode ? "is-local-mode" : ""}`} aria-label={uiText("โควตา AI ออนไลน์")}>
      <div className="ai-usage-top">
        <div>
          <span>{uiText("โควตา AI ออนไลน์")}</span>
          <strong>
            {loading
              ? uiText("กำลังตรวจสอบ")
              : isLocalMode
                ? uiText("โหมดในอุปกรณ์")
                : isUnconfigured
                  ? uiText("AI ออนไลน์ยังไม่ได้เชื่อมต่อ")
                  : usage
                    ? uiText("เหลือ {0} ครั้ง", [usage.remaining])
                    : uiText("ตรวจสอบไม่ได้")}
          </strong>
        </div>
      </div>
      <div className="ai-usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={usage?.limit ?? 20} aria-valuenow={isUnconfigured ? 0 : (usage?.used ?? 0)}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="ai-usage-meta">
        <span>
          {isLocalMode
            ? uiText("โหมดในอุปกรณ์ไม่หักโควตา")
            : isUnconfigured
              ? uiText("ระบบจะแสดงโควตาเมื่อเชื่อมต่อ AI ออนไลน์")
              : usage
                ? uiText("{0} / {1} คำตอบ", [usage.used, usage.limit])
                : uiText("ระบบจะตรวจสอบอีกครั้งเมื่อพร้อม")}
        </span>
        <span>
          {isUnconfigured
            ? uiText("กำลังรอการตั้งค่าผู้ให้บริการ AI ใหม่")
            : quotaReached
              ? countdown !== null && countdown > 0
                ? uiText("ใช้ได้อีกใน {0}", [formatCompactDuration(countdown)])
                : uiText("กำลังตรวจสอบโควตารอบใหม่")
            : onlineUnavailable
              ? uiText("รอ AI ออนไลน์กลับมา")
              : usage?.resetAt && countdown !== null
                ? uiText("รีเซ็ต {0} · อีก {1}", [formatResetDate(usage.resetAt), formatCompactDuration(countdown)])
                : uiText("รอบเริ่มเมื่อได้รับคำตอบแรก")}
        </span>
      </div>
    </section>
  );
}

function QuotaUnavailableNotice() {
  const uiText = useUiText();

  return (
    <section className="ai-quota-notice" role="status" aria-live="polite">
      <div>
        <strong>{uiText("โควตาใช้งานไม่พร้อมใช้งาน")}</strong>
        <p>{uiText("ใช้ AI ออนไลน์ครบโควตารอบนี้")}</p>
      </div>
      <span className="ai-quota-notice-count">0 {uiText("ครั้ง")}</span>
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
  const uiText = useUiText();

  const { chat, appendChatMessages, sendChat, tasks, schedules } = useAppState();
  const [input, setInput] = useState("");
  const [selectedContext, setSelectedContext] = useState<AIContextSelection>({ ...EMPTY_AI_CONTEXT_SELECTION });
  const [isLoading, setIsLoading] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [usage, setUsage] = useState<AIUsageStatusResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
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
    setUsageLoading(true);
    try {
      let payload: AIUsageStatusResponse | AIErrorResponse | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8_000);
        try {
          const response = await fetch("/api/ai/status", {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          });
          payload = await response.json().catch(() => null) as AIUsageStatusResponse | AIErrorResponse | null;
          if (response.ok && payload && "remaining" in payload) break;
          if (response.status === 401 || response.status === 403) throw new Error("authentication required");
          payload = null;
        } catch {
          payload = null;
        } finally {
          window.clearTimeout(timeout);
        }
        if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 450));
      }
      if (!payload || !("remaining" in payload)) throw new Error("usage unavailable");
      setUsage(payload);
      setCountdown(payload.resetAt ? payload.retryAfterSeconds : null);
      const isReady = Boolean(payload.providerConfigured);
      setOnlineAvailability(isReady ? "ready" : "unconfigured");
      if (!isReady) {
        setErrorMessage("AI ออนไลน์ยังไม่ได้เชื่อมต่อ");
      }
      return { ready: isReady, payload };
    } catch {
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
    ? "ถามจากข้อมูลที่เลือก..."
    : isRechecking || onlineAvailability === "checking"
      ? "กำลังตรวจสอบ AI ออนไลน์..."
      : onlineAvailability === "unconfigured"
        ? "AI ออนไลน์ยังไม่พร้อม..."
        : quotaReached
          ? "ครบโควตาชั่วคราว..."
          : onlineAvailability === "unavailable"
            ? "AI ออนไลน์ไม่พร้อมชั่วคราว..."
            : "ถามเรื่องเรียนหรืองาน...";

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
  const quotaNotice = quotaReached && !usageLoading ? <QuotaUnavailableNotice /> : null;
  const usageCard = (
    <UsageCard
      usage={usage}
      countdown={countdown}
      loading={usageLoading}
      quotaReached={quotaReached}
      onlineUnavailable={experienceStatus === "online-unavailable" || experienceStatus === "response-error"}
      isUnconfigured={onlineAvailability === "unconfigured" || usage?.providerConfigured === false}
      isLocalMode={mode === "on-device"}
    />
  );

  return (
    <div className="page ai-premium-page">
      <header className="ai-premium-header">
        <button className="ai-phone-context-button icon-button" type="button" onClick={() => setPrivacyOpen(true)} aria-label={uiText("ความเป็นส่วนตัวของ TALEVO AI")} aria-haspopup="dialog" aria-expanded={privacyOpen}>
          <Info aria-hidden="true" />
          {selectedOptions.length > 0 && <span>{selectedOptions.length}</span>}
        </button>
        <div className="ai-header-left">
          <Link href="/today" className="icon-button ai-back-button" aria-label={uiText("ย้อนกลับ")}>
            <ChevronLeft />
          </Link>
          <div className="ai-brand-lockup">
            <TalevoMascotAvatar size="sm" priority />
            <div className="ai-brand-info">
              <div className="ai-title-row">
                <span className="ai-brand-kicker">LEARN • PLAN • GROW</span>
                <span className={`ai-mode-badge mode-${mode} ${onlineAvailability === "ready" && !quotaReached ? "status-online-ready" : isRechecking || onlineAvailability === "checking" ? "status-online-loading" : ""}`}>
                  <i className="ai-badge-dot" />
                  {mode === "on-device"
                    ? uiText("AI ในอุปกรณ์")
                    : quotaReached
                      ? uiText("โควตาออนไลน์หมดแล้ว")
                      : isRechecking || onlineAvailability === "checking"
                      ? uiText("กำลังตรวจสอบ AI ออนไลน์...")
                      : onlineAvailability === "unconfigured"
                        ? uiText("AI ออนไลน์ยังไม่ได้เชื่อมต่อ")
                        : onlineAvailability === "ready"
                          ? uiText("{0} พร้อมใช้งาน", [usage?.providerLabel || "Groq"])
                          : uiText("AI ออนไลน์")}
                </span>
                <button
                  className="icon-button ai-info-button"
                  type="button"
                  aria-label={uiText("ความเป็นส่วนตัวของ TALEVO AI")}
                  aria-haspopup="dialog"
                  aria-expanded={privacyOpen}
                  onClick={() => setPrivacyOpen(true)}
                >
                  <Info />
                </button>
              </div>
              <h1>TALEVO AI</h1>
              <p>{uiText("ผู้ช่วยวางแผนการเรียนของคุณ")}</p>
            </div>
          </div>
        </div>
        <div className="ai-header-right">
          {usageCard}
        </div>
      </header>

      <div className="ai-workbench">
        <div className="ai-mobile-summary">
          {quotaNotice}
          {usageCard}
        </div>

        <section className="ai-conversation-card" aria-label={uiText("การสนทนากับ TALEVO AI")}>
          <div ref={chatScrollRef} className="ai-conversation-scroll" aria-live="polite">
            {(
              <div className={`ai-empty-state${chat.length > 0 || pendingMessage ? " ai-phone-welcome" : ""}`}>
                <div className="ai-empty-orbit">
                  <TalevoMascotAvatar size="lg" priority showSparkle />
                </div>
                <h2>{uiText("วันนี้อยากให้")}<span className="ai-welcome-name">TALEVO</span> {uiText("ช่วยอะไร?")}</h2>
                <p>{uiText("สรุปบทเรียน วางแผนอ่านหนังสือ จัดลำดับงาน หรือเตรียมสอบได้จากตรงนี้")}</p>
                <p className="sr-only">{uiText("ประวัติการสนทนายังว่างอยู่")}</p>
                <small>{chat.length === 0 ? uiText("ประวัติการสนทนายังว่างอยู่ · ") : ""}{uiText("เลือกข้อมูล TALEVO ได้ก่อนส่งคำถาม")}</small>
                <div className="ai-suggestion-grid">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      type="button"
                      key={uiText(suggestion)}
                      disabled={!canSend}
                      onClick={() => {
                        setInput(suggestion);
                        textareaRef.current?.focus();
                      }}
                    >
                      <Sparkles />
                      {uiText(suggestion)}
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
                  <small>{message.role === "assistant" ? "TALEVO AI" : uiText("คุณ")}</small>
                </div>
              </div>
            ))}

            {pendingMessage && (
              <>
                <div className="ai-premium-message user is-pending">
                  <div className="ai-premium-bubble">
                    <AIMessageContent content={pendingMessage} />
                    <small>{uiText("กำลังส่ง...")}</small>
                  </div>
                </div>
                {isLoading && (
                  <div className="ai-premium-message assistant is-loading">
                    <TalevoMascotAvatar size="xs" />
                    <div className="ai-premium-bubble">
                      <span className="ai-thinking-dots" aria-label={uiText("AI กำลังคิด")}>
                        <i /><i /><i />
                      </span>
                      <small>{uiText("กำลังเรียบเรียงคำตอบ")}</small>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <form className="ai-premium-composer" onSubmit={submit}>
            {selectedOptions.length > 0 && (
              <div className="ai-selected-context" aria-label={uiText("บริบทที่กำลังแนบ")}>
                {selectedOptions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button type="button" key={item.key} onClick={() => clearContext(item.key)} aria-label={uiText("ยกเลิก {0}", [item.label])}>
                      <Icon />
                      {uiText(item.label)}
                      <X />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ai-composer-row">
              <button className="ai-context-trigger" type="button" onClick={() => setContextSheetOpen(true)} aria-label={uiText("เลือกข้อมูล TALEVO ที่ให้ AI ใช้")}>
                <Plus />
                <span>{uiText("บริบท")}</span>
                {selectedOptions.length > 0 && <b>{selectedOptions.length}</b>}
              </button>
              <label className="sr-only" htmlFor="talevo-ai-message">{uiText("พิมพ์คำถามถึง TALEVO AI")}</label>
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
                <button className="ai-send-button is-stop" type="button" aria-label={uiText("หยุดสร้างคำตอบ")} onClick={() => abortControllerRef.current?.abort()}>
                  <Square />
                </button>
              ) : (
                <button className="ai-send-button" type="submit" aria-label={uiText("ส่งข้อความ")} disabled={!input.trim() || !canSend}>
                  <Send />
                </button>
              )}
            </div>

            <div className="ai-composer-meta">
              <span>
                {mode === "on-device"
                  ? uiText("AI ในอุปกรณ์ใช้เฉพาะข้อมูลที่เลือก")
                  : selectedOptions.length
                    ? uiText("แนบข้อมูล {0} หมวด", [selectedOptions.length])
                    : uiText("ยังไม่ได้แนบข้อมูล TALEVO")}
              </span>
              {input.length >= CHARACTER_WARNING_AT && (
                <strong className={input.length >= MAX_MESSAGE_LENGTH ? "is-limit" : ""}>
                  {input.length.toLocaleString(uiText.locale)} / {MAX_MESSAGE_LENGTH.toLocaleString(uiText.locale)}
                </strong>
              )}
            </div>
          </form>
        </section>

        <aside className="ai-desktop-sidebar">
          {quotaNotice}
          <ContextPanel selected={selectedContext} onToggle={toggleContext} />
          <PrivacyPanel mode={mode} onOpen={() => setPrivacyOpen(true)} />
        </aside>
      </div>

      <BottomSheet
        open={contextSheetOpen}
        title={uiText("ข้อมูลที่ให้ AI ใช้")}
        onClose={() => setContextSheetOpen(false)}
        closeLabel={uiText("ปิดตัวเลือกบริบท")}
        className="ai-context-sheet"
      >
        <ContextPanel selected={selectedContext} onToggle={toggleContext} />
        <button className="primary-button button-block" type="button" onClick={() => setContextSheetOpen(false)}>
          {uiText("ใช้บริบทที่เลือก (")}{selectedOptions.length})
        </button>
      </BottomSheet>

      <BottomSheet
        open={privacyOpen}
        title={uiText("ความเป็นส่วนตัวของ TALEVO AI")}
        onClose={() => setPrivacyOpen(false)}
        closeLabel={uiText("ปิดรายละเอียด")}
      >
        <PrivacyDialog />
      </BottomSheet>

      <BottomSheet
        open={aboutOpen}
        title={uiText("เกี่ยวกับ TALEVO AI")}
        onClose={() => setAboutOpen(false)}
        closeLabel={uiText("ปิด")}
        className="ai-about-sheet"
      >
        <div className="ai-about-dialog">
          <TalevoMascotAvatar size="md" className="ai-about-mascot" />
          <p className="ai-about-subtitle">{uiText("TALEVO AI ช่วยวางแผนการเรียน ตอบคำถาม และให้คำแนะนำแบบอ่านอย่างเดียว")}</p>
          <section>
            <h3>{uiText("โควตา AI ออนไลน์")}</h3>
            <p>{uiText("จำนวนคำตอบจะนับเมื่อได้รับคำตอบออนไลน์สำเร็จ และไม่เกี่ยวกับประวัติแชต")}</p>
          </section>
          <section>
            <h3>{uiText("คุณควบคุมบริบท")}</h3>
            <p>{uiText("ค่าเริ่มต้นไม่ใช้ข้อมูล TALEVO เพิ่มเติม และจะใช้เฉพาะหมวดที่คุณเปิดเอง")}</p>
          </section>
          <section>
            <h3>{uiText("ตรวจคำตอบสำคัญเสมอ")}</h3>
            <p>{uiText("คำแนะนำจาก AI อาจคลาดเคลื่อนได้ ควรตรวจสอบข้อมูลสำคัญกับแหล่งข้อมูลจริงเสมอ")}</p>
          </section>
          <button className="primary-button button-block" type="button" onClick={() => setAboutOpen(false)}>
            {uiText("เข้าใจแล้ว")}</button>
        </div>
      </BottomSheet>
    </div>
  );
}
