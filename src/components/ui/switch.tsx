"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  tone?: "rouge" | "squad" | "vip";
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const TRACK = { rouge: "bg-rouge shadow-glow-rouge", squad: "bg-squad shadow-glow-squad", vip: "bg-vip shadow-glow-vip" };

/** Switch accesible (role="switch") con área táctil de 44px. */
export function Switch({ checked, onCheckedChange, tone = "rouge", label, description, disabled, id, className }: SwitchProps) {
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label && !description ? label : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? TRACK[tone] : "bg-white/15 ring-1 ring-inset ring-white/25",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
          checked && tone === "squad" && "bg-background",
        )}
      />
    </button>
  );
  if (!label) return control;
  return (
    <label className={cn("flex min-h-touch cursor-pointer items-center justify-between gap-4", className)} htmlFor={id}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      {control}
    </label>
  );
}
