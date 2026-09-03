"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function AdminCopyIdButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return <button className="admin-copy-button" type="button" onClick={() => void copy()} aria-label="คัดลอก User ID">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>;
}

