"use client";

import { Input } from "@/components/ui";
import { useUiText } from "@/providers/ui-language";


export function AcademicEndTimeInput({ value, onChange, ariaLabel = "เวลาสิ้นสุด" }: { value: string; onChange: (value: string) => void; ariaLabel?: string }) {
  const uiText = useUiText();

  const isEndOfDay = value === "24:00";
  return <div className="academic-end-time-input">
    <Input aria-label={uiText(ariaLabel)} type="time" value={isEndOfDay ? "" : value} disabled={isEndOfDay} onChange={(event) => onChange(event.target.value)} />
    <label>
      <input type="checkbox" checked={isEndOfDay} onChange={(event) => onChange(event.target.checked ? "24:00" : "23:59")} />
      <span>{uiText("สิ้นวัน 24:00")}</span>
    </label>
  </div>;
}
