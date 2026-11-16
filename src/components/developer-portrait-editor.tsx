"use client";
import { useRef, useState } from "react";
import { BottomSheet } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useUiText } from "@/providers/ui-language";

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function makeAvatarBlob(canvas: HTMLCanvasElement, uiText: ReturnType<typeof useUiText>) {
  const webp = await canvasBlob(canvas, "image/webp", 0.86);
  if (webp?.type === "image/webp") return webp;

  // Safari versions without WebP encoding silently return PNG for a WebP request.
  // JPEG is supported consistently and the storage bucket explicitly allows it.
  const jpeg = await canvasBlob(canvas, "image/jpeg", 0.9);
  if (jpeg?.type === "image/jpeg") return jpeg;
  throw new Error(uiText("เบราว์เซอร์นี้ยังบันทึกรูปภาพไม่ได้ กรุณาลองใช้เบราว์เซอร์อื่น"));
}

export function PortraitImageEditor({ onSaved, buttonLabel = "เปลี่ยนรูปภาพ" }: { onSaved: (value: Blob) => Promise<void> | void; buttonLabel?: string }) {
  const uiText = useUiText();
  const fileInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draw = (z: number, horizontal: number, vertical: number) => {
    const image = source.current;
    const context = canvas.current?.getContext("2d");
    if (!image || !context) return;
    const size = Math.min(image.naturalWidth, image.naturalHeight) / z;
    context.clearRect(0, 0, 512, 512);
    context.drawImage(image, (image.naturalWidth-size)*horizontal/100, (image.naturalHeight-size)*vertical/100, size, size, 0, 0, 512, 512);
  };
  return <><button type="button" className="developer-change-photo" onClick={() => fileInput.current?.click()}>{uiText(buttonLabel)}</button><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10*1024*1024) { setError(uiText("กรุณาใช้รูป PNG, JPG หรือ WebP ขนาดไม่เกิน 10 MB")); return; }
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => { source.current = image; setZoom(1); setX(50); setY(50); setError(""); setOpen(true); URL.revokeObjectURL(url); };
    image.onerror = () => { URL.revokeObjectURL(url); setError(uiText("เปิดรูปภาพไม่ได้ กรุณาเลือกรูปใหม่")); };
    image.src = url;
  }}/>{!open && error && <p role="alert">{error}</p>}<BottomSheet open={open} className="portrait-crop-sheet" title={uiText("ปรับรูปภาพ")} onClose={() => { if (!busy) setOpen(false); }}><div className="developer-crop"><canvas width={512} height={512} ref={node => { canvas.current = node; if (node) draw(zoom,x,y); }} aria-label={uiText("ตัวอย่างรูปภาพวงกลม")}/><label htmlFor="portrait-zoom">{uiText("ขยายรูป")}<input id="portrait-zoom" style={{ background: `linear-gradient(to right, #7656f6 ${(zoom - 1) * 50}%, var(--crop-track, #e4e4e7) ${(zoom - 1) * 50}%)` }} type="range" min="1" max="3" step="any" value={zoom} onChange={e => { const value=Number(e.target.value);setZoom(value);draw(value,x,y); }}/></label><label htmlFor="portrait-horizontal">{uiText("ตำแหน่งแนวนอน")}<input id="portrait-horizontal" style={{ background: `linear-gradient(to right, #7656f6 ${x}%, var(--crop-track, #e4e4e7) ${x}%)` }} type="range" min="0" max="100" step="any" value={x} onChange={e => { const value=Number(e.target.value);setX(value);draw(zoom,value,y); }}/></label><label htmlFor="portrait-vertical">{uiText("ตำแหน่งแนวตั้ง")}<input id="portrait-vertical" style={{ background: `linear-gradient(to right, #7656f6 ${y}%, var(--crop-track, #e4e4e7) ${y}%)` }} type="range" min="0" max="100" step="any" value={y} onChange={e => { const value=Number(e.target.value);setY(value);draw(zoom,x,value); }}/></label>{error && <p role="alert">{error}</p>}<button type="button" className="primary-button" disabled={busy} onClick={async () => { if (!canvas.current) return;setBusy(true);setError("");try { const avatar=await makeAvatarBlob(canvas.current, uiText);await onSaved(avatar);setOpen(false); } catch (caught) {setError(caught instanceof Error ? caught.message : uiText("บันทึกรูปไม่สำเร็จ กรุณาลองใหม่"));}finally{setBusy(false);} }}>{busy ? uiText("กำลังบันทึก…") : uiText("เสร็จสิ้น")}</button></div></BottomSheet></>;
}

export function DeveloperPortraitEditor({ onSaved }: { onSaved: (value: string) => void }) {
  return <PortraitImageEditor onSaved={async (avatar) => { const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("อ่านรูปภาพไม่ได้")); reader.onerror = () => reject(new Error("อ่านรูปภาพไม่ได้")); reader.readAsDataURL(avatar); }); const { data: auth } = await createClient().auth.getUser(); if (!auth.user) throw new Error("กรุณาเข้าสู่ระบบใหม่"); const { error } = await createClient().from("developer_profile").upsert({ id: true, owner_id: auth.user.id, avatar: dataUrl }); if (error) throw error; onSaved(dataUrl); }} />;
}
