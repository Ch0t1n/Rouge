"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  counter?: { value: number; max: number };
  htmlFor: string;
  children: ReactNode;
  trailing?: ReactNode;
}

export function FieldShell({ label, hint, error, counter, htmlFor, children, trailing }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={htmlFor} className="font-display text-[13px] font-semibold text-primary">
          {label}
        </label>
        {trailing}
        {counter && (
          <span className={cn("text-[11px] tabular-nums", counter.value > counter.max ? "text-rouge" : "text-muted")}>
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} className="text-xs text-rouge" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-2xl border bg-white/[0.04] px-4 text-[15px] text-primary placeholder:text-muted/50 transition focus:outline-none focus:ring-2 focus:ring-rouge/40";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "prefix"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  prefix?: ReactNode;
  showCounter?: boolean;
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, prefix, showCounter, className, maxLength, value, trailing, ...props }, ref) => {
    const id = useId();
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        htmlFor={id}
        trailing={trailing}
        counter={showCounter && maxLength ? { value: String(value ?? "").length, max: maxLength } : undefined}
      >
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-display text-muted">{prefix}</span>}
          <input
            ref={ref}
            id={id}
            value={value}
            maxLength={maxLength}
            aria-invalid={!!error}
            aria-describedby={error || hint ? `${id}-msg` : undefined}
            className={cn(inputBase, "min-h-[52px]", prefix ? "pl-9" : undefined, error ? "border-rouge/60" : "border-white/10 focus:border-rouge/50", className)}
            {...props}
          />
        </div>
      </FieldShell>
    );
  },
);
TextField.displayName = "TextField";

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextAreaField({ label, hint, error, className, maxLength, value, ...props }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id} counter={maxLength ? { value: String(value ?? "").length, max: maxLength } : undefined}>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={!!error}
        className={cn(inputBase, "min-h-[96px] resize-none py-3 leading-relaxed", error ? "border-rouge/60" : "border-white/10 focus:border-rouge/50", className)}
        {...props}
      />
    </FieldShell>
  );
}

/** Selector segmentado (género, etc.) con targets de 44px. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5" role="radiogroup" aria-labelledby={id}>
      <p id={id} className="font-display text-[13px] font-semibold text-primary">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-touch rounded-2xl border px-3 text-sm font-semibold transition",
              value === o.value ? "border-rouge/60 bg-rouge/15 text-primary" : "border-white/10 bg-white/[0.03] text-muted hover:text-primary",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
