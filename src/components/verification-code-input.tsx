"use client";

import React, { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

type VerificationCodeInputProps = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  label: string;
  invalid?: boolean;
};

/**
 * One box per digit, backed by a single string. Each box is a real input so
 * password managers, mobile keypads and screen readers behave normally; the
 * group is labelled once rather than per box so a screen reader announces the
 * field, not six anonymous inputs.
 */
export function VerificationCodeInput({
  length,
  value,
  onChange,
  onComplete,
  disabled,
  label,
  invalid,
}: VerificationCodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const completedRef = useRef("");

  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  // Fire onComplete once per distinct full code. Without the guard a re-render
  // after a failed attempt would resubmit the same code in a loop.
  useEffect(() => {
    if (value.length === length && completedRef.current !== value) {
      completedRef.current = value;
      onComplete?.(value);
    }
    if (value.length < length) completedRef.current = "";
  }, [length, onComplete, value]);

  const focusBox = (index: number) => {
    const target = inputsRef.current[Math.min(Math.max(index, 0), length - 1)];
    target?.focus();
    target?.select();
  };

  const writeDigits = (index: number, incoming: string) => {
    const cleaned = incoming.replace(/\D/g, "");
    if (!cleaned) return;
    const next = (value.slice(0, index) + cleaned + value.slice(index + cleaned.length)).slice(0, length);
    onChange(next);
    focusBox(index + cleaned.length);
  };

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
        return;
      }
      // Deleting an already-empty box steps back and clears the one before it,
      // which is what people expect when correcting a typo.
      if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    writeDigits(index, event.clipboardData.getData("text"));
  };

  return (
    <div
      className={`verification-code${invalid ? " verification-code-invalid" : ""}`}
      role="group"
      aria-label={label}
      style={{ "--verification-code-count": length } as React.CSSProperties}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { inputsRef.current[index] = element; }}
          className="verification-code-box"
          value={digit}
          onChange={(event) => writeDigits(index, event.target.value)}
          onKeyDown={handleKeyDown(index)}
          onPaste={handlePaste(index)}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          // maxLength stays above 1 so a keystroke on a filled box still
          // registers and can overwrite it instead of being swallowed.
          maxLength={length}
          aria-label={`${label} หลักที่ ${index + 1}`}
          aria-invalid={invalid || undefined}
        />
      ))}
    </div>
  );
}
