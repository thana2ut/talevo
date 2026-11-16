"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useUiText } from "@/providers/ui-language";


type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type Gesture = { id: number; start: Point; origin: Point; moved: boolean };
const storageKey = "talevo:ai-assistive-touch:position:v1";

export function AiAssistiveTouch({ hidden, onOpen }: { hidden: boolean; onOpen: () => void }) {
  const instructionId = useId();
  const uiText = useUiText();

  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [active, setActive] = useState(true);
  const point = useRef<Point | null>(null);
  const ratio = useRef<Point | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const idleTimer = useRef<number | null>(null);

  const bounds = (): Bounds => {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const size = button.current?.offsetWidth || 64;
    const style = button.current ? getComputedStyle(button.current) : null;
    const inset = (edge: string) => Number.parseFloat(style?.getPropertyValue(`--assistive-safe-${edge}`) ?? "0") || 0;
    const minX = left + inset("left") + 8;
    const minY = top + inset("top") + 8;
    const navigation = document.querySelector<HTMLElement>(".mobile-bottom-nav")?.getBoundingClientRect();
    const bottomEdge = navigation && navigation.height > 0
      ? Math.min(top + height - inset("bottom"), navigation.top)
      : top + height - inset("bottom");
    return { left: minX, top: minY, right: Math.max(minX, left + width - inset("right") - size - 8), bottom: Math.max(minY, bottomEdge - size - 12) };
  };
  const clamp = (next: Point, area = bounds()): Point => ({ x: Math.max(area.left, Math.min(area.right, next.x)), y: Math.max(area.top, Math.min(area.bottom, next.y)) });
  const move = (next: Point) => { point.current = next; setPosition(next); };
  const remember = (next: Point) => {
    const area = bounds();
    ratio.current = { x: (next.x - area.left) / Math.max(1, area.right - area.left), y: (next.y - area.top) / Math.max(1, area.bottom - area.top) };
    try { localStorage.setItem(storageKey, JSON.stringify(ratio.current)); } catch { /* Position remains usable when device storage is unavailable. */ }
  };
  const wake = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    setActive(true);
  };
  const rest = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setActive(false), 1800);
  };

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (stored && typeof stored === "object" && "x" in stored && "y" in stored && typeof stored.x === "number" && typeof stored.y === "number" && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        ratio.current = { x: Math.max(0, Math.min(1, stored.x)), y: Math.max(0, Math.min(1, stored.y)) };
      }
    } catch { /* Ignore invalid or unavailable position storage. */ }
    const reflow = () => {
      const area = bounds();
      const saved = ratio.current;
      const tabletPortrait = window.matchMedia("(min-width: 700px) and (max-width: 1199px) and (orientation: portrait)").matches;
      const next = saved
        ? { x: tabletPortrait ? area.right : area.left + saved.x * (area.right - area.left), y: area.top + saved.y * (area.bottom - area.top) }
        : { x: area.right, y: Math.max(area.top, area.bottom - 112) };
      move(clamp(next, area));
      if (!saved) remember(clamp(next, area));
      if (gesture.current) { gesture.current = null; suppressClick.current = true; rest(); }
    };
    reflow();
    rest();
    window.addEventListener("resize", reflow);
    window.visualViewport?.addEventListener("resize", reflow);
    window.visualViewport?.addEventListener("scroll", reflow);
    return () => {
      window.removeEventListener("resize", reflow);
      window.visualViewport?.removeEventListener("resize", reflow);
      window.visualViewport?.removeEventListener("scroll", reflow);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
    // Viewport listeners use stable refs; no account or server data is involved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || !point.current) return;
    wake();
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: point.current, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (Math.hypot(dx, dy) > 6) current.moved = true;
    if (current.moved) move(clamp({ x: current.origin.x + dx, y: current.origin.y + dy }));
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    suppressClick.current = cancelled || current.moved;
    gesture.current = null;
    if (point.current && current.moved) remember(point.current);
    rest();
  };
  const keyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") { suppressClick.current = false; return; }
    const delta = event.shiftKey ? 36 : 12;
    const directions: Record<string, Point> = { ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 }, ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta } };
    const offset = directions[event.key];
    if (!offset || !point.current) return;
    event.preventDefault();
    wake();
    const next = clamp({ x: point.current.x + offset.x, y: point.current.y + offset.y });
    move(next); remember(next); rest();
  };

  return <button ref={button} type="button" className="ai-assistive-touch" hidden={hidden} data-active={active} data-ready={Boolean(position)} style={position ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` } : undefined}
    aria-label={uiText("Talevo AI AssistiveTouch — เพิ่มด้วยเสียง")} aria-describedby={instructionId} aria-haspopup="dialog" title={uiText("Talevo AI AssistiveTouch · เพิ่มด้วยเสียง")}
    onPointerDown={start} onPointerMove={drag} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
    onClick={() => { if (!suppressClick.current) { wake(); onOpen(); rest(); } suppressClick.current = false; }} onKeyDown={keyboardMove} onFocus={wake} onBlur={rest} onDragStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>
    <Image src="/assets/ai/talevo-assistive-touch-violet.jpg" alt="" fill sizes="72px" draggable={false} />
    <span id={instructionId} className="visually-hidden">{uiText("แตะเพื่อเพิ่มด้วยเสียง ลากเพื่อย้าย หรือใช้ปุ่มลูกศรเมื่อเลือกด้วยคีย์บอร์ด")}</span>
  </button>;
}
