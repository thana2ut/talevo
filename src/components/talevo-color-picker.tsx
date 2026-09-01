"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { BottomSheet, Input } from "@/components/ui";
import { getContrastTextColor, isValidTalevoHex, normalizeTalevoColor, talevoPresetColors } from "@/lib/talevo-color-utils";
import { useLanguage } from "@/providers/language-provider";

type TalevoColorPickerProps = { value: string; onChange: (color: string) => void; title: string; previewLabel: string; triggerLabel: string };

export function TalevoColorPicker({ value, onChange, title, previewLabel, triggerLabel }: TalevoColorPickerProps) {
  const { t, language } = useLanguage();
  const selected = normalizeTalevoColor(value);
  const [open, setOpen] = useState(false);
  const [draftColor, setDraftColor] = useState(selected);
  const [hex, setHex] = useState(selected);
  const [error, setError] = useState("");
  const setDraft = (next: string) => { const normalized = normalizeTalevoColor(next); setDraftColor(normalized); setHex(normalized); setError(""); };
  const close = () => { setOpen(false); setDraftColor(selected); setHex(selected); setError(""); };
  const openPicker = () => { setDraftColor(selected); setHex(selected); setError(""); setOpen(true); };
  const closeLabel = language === "th" ? "ปิดหน้าต่างเลือกสี" : "Close color picker";
  const currentColorLabel = language === "th" ? "สีปัจจุบัน" : "Current color";
  const presetLabel = language === "th" ? "สีแนะนำ" : "Recommended colors";
  const customColorLabel = language === "th" ? "เลือกสีเอง" : "Choose a custom color";
  const selectedColorLabel = language === "th" ? "สีที่เลือก" : "Selected color";
  const hexLabel = language === "th" ? "รหัส HEX" : "HEX code";
  const invalidHexMessage = language === "th" ? "กรุณากรอกรหัสสี HEX ให้ถูกต้อง เช่น #7656F6" : "Enter a valid HEX color such as #7656F6";
  const applyHex = () => { const candidate = hex.startsWith("#") ? hex : `#${hex}`; if (!isValidTalevoHex(candidate)) { setError(invalidHexMessage); return false; } setDraft(candidate); return true; };
  const apply = () => { if (!applyHex()) return; onChange(normalizeTalevoColor(hex.startsWith("#") ? hex : `#${hex}`)); setOpen(false); };

  return <>
    <button className="task-color-trigger" type="button" onClick={openPicker} aria-haspopup="dialog" aria-expanded={open} aria-label={`${triggerLabel} ${previewLabel} ${currentColorLabel} ${selected}`}>
      <i aria-hidden="true" style={{ backgroundColor: selected }} />
      <span className="task-color-hex">{selected}</span>
      <span className="task-color-action"><b>{triggerLabel}</b><ChevronDown aria-hidden="true" /></span>
    </button>
    <BottomSheet open={open} title={title} onClose={close} closeLabel={closeLabel} className="task-color-sheet">
      <div className="task-color-panel">
        <section>
          <h3>{presetLabel}</h3>
          <div className="task-color-presets" role="radiogroup" aria-label={presetLabel}>
            {talevoPresetColors.map((color) => <button key={color} type="button" role="radio" aria-checked={draftColor === color} className={draftColor === color ? "selected" : ""} aria-label={`${title} ${color}`} style={{ backgroundColor: color, color: getContrastTextColor(color) }} onClick={() => setDraft(color)}>{draftColor === color && <Check aria-hidden="true" />}</button>)}
          </div>
        </section>
        <section className="task-custom-color">
          <h3>{customColorLabel}</h3>
          <label className="task-native-color-control">
            <i aria-hidden="true" style={{ backgroundColor: draftColor }} />
            <span><strong>{selectedColorLabel}</strong><small>{draftColor}</small></span>
            <b>{customColorLabel}</b>
            <input type="color" value={draftColor} onChange={(event) => setDraft(event.target.value)} aria-label={`${customColorLabel} ${draftColor}`} />
          </label>
          <label className="task-hex-field"><span>{hexLabel}</span><Input value={hex} maxLength={7} aria-invalid={Boolean(error)} onChange={(event) => { const next = event.target.value; const candidate = next.startsWith("#") ? next : `#${next}`; setHex(next); setError(""); if (isValidTalevoHex(candidate)) setDraft(candidate); }} onBlur={applyHex} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyHex(); } }} placeholder="#7656F6" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
        <div className="task-color-actions"><button className="secondary-button" type="button" onClick={close}>{t("common.cancel")}</button><button className="primary-button" type="button" onClick={apply}>{t("tasks.applyColor")}</button></div>
      </div>
    </BottomSheet>
  </>;
}
