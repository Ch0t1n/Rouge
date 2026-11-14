"use client";

import { Lock } from "lucide-react";
import { formatPhone } from "@/lib/engine/profile";
import { normalizePhone } from "@/lib/utils";
import { TextField } from "@/components/ui/field";

/** Teléfono con normalización en vivo a E.164 (clave para bloqueos y CRM). */
export function PhoneField({ value, onChange, label = "Tu teléfono", required }: { value: string; onChange: (v: string) => void; label?: string; required?: boolean }) {
  const normalized = value.trim() ? normalizePhone(value) : null;
  const invalid = value.trim().length >= 6 && !normalized;
  return (
    <TextField
      label={label}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="11 2233-4455"
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      error={invalid ? "Número inválido. Probá con código de área, ej: 11 2233-4455." : null}
      hint={
        <span className="inline-flex items-center gap-1">
          <Lock className="size-3" />
          {normalized ? <>Se guarda como <b className="font-semibold text-primary/90">{formatPhone(normalized)}</b> · nunca es visible para otros.</> : "Nunca es visible para otros asistentes. Sirve para que nadie que bloqueaste te vea."}
        </span>
      }
    />
  );
}
