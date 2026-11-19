"use client";

import { Check } from "lucide-react";
import { PRO_INTERESTS, type ProInterest } from "@/lib/types";
import { MAX_INTERESTS, WORK_FIELD_MAX, parseLinkedin } from "@/lib/engine/profile";
import { TextField } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface ProfessionalValue {
  company: string;
  jobTitle: string;
  linkedin: string;
  interests: ProInterest[];
}

/** El LinkedIn escrito es válido (vacío también lo es: es opcional). */
export const linkedinValid = (raw: string) => !raw.trim() || !!parseLinkedin(raw);

/** Perfil profesional (opcional): empresa, cargo, LinkedIn y áreas e intereses. Se usa en eventos corporativos. */
export function ProfessionalFields({ value, onChange }: { value: ProfessionalValue; onChange: (v: ProfessionalValue) => void }) {
  const set = (patch: Partial<ProfessionalValue>) => onChange({ ...value, ...patch });
  const slug = parseLinkedin(value.linkedin);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Empresa (opcional)" autoComplete="organization" placeholder="Grupo Vértice" maxLength={WORK_FIELD_MAX} value={value.company} onChange={(e) => set({ company: e.target.value })} />
        <TextField label="Cargo (opcional)" autoComplete="organization-title" placeholder="Diseñadora UX" maxLength={WORK_FIELD_MAX} value={value.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
      </div>
      <TextField
        label="LinkedIn (opcional)"
        placeholder="linkedin.com/in/tu-nombre"
        inputMode="url"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        value={value.linkedin}
        onChange={(e) => set({ linkedin: e.target.value })}
        error={linkedinValid(value.linkedin) ? null : "Pegá el link de tu perfil (linkedin.com/in/…)."}
        hint={slug ? <span className="text-squad">✓ linkedin.com/in/{slug}</span> : "Se muestra en tu perfil para que te contacten después del evento."}
      />
      <div>
        <p className="mb-2 text-sm text-muted">Áreas e intereses</p>
        <InterestPicker value={value.interests} onChange={(interests) => set({ interests })} />
      </div>
    </div>
  );
}

export function InterestPicker({ value, onChange }: { value: ProInterest[]; onChange: (v: ProInterest[]) => void }) {
  const toggle = (g: ProInterest) => {
    if (value.includes(g)) onChange(value.filter((x) => x !== g));
    else if (value.length < MAX_INTERESTS) onChange([...value, g]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Áreas e intereses">
        {PRO_INTERESTS.map((g) => {
          const on = value.includes(g);
          const disabled = !on && value.length >= MAX_INTERESTS;
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(g)}
              className={cn(
                "inline-flex min-h-touch items-center gap-1.5 rounded-full border px-4 font-display text-sm font-semibold transition active:scale-95 disabled:opacity-35",
                on ? "border-rouge bg-rouge text-white shadow-glow-rouge" : "border-white/15 bg-white/[0.04] text-primary hover:border-white/25",
              )}
            >
              {on && <Check className="size-4" />}
              {g}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {value.length}/{MAX_INTERESTS} · En eventos corporativos la grilla te ordena por intereses en común.
      </p>
    </div>
  );
}

export function TagChips({ tags, shared = [] }: { tags: readonly string[]; shared?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((g) => {
        const isShared = shared.includes(g);
        return (
          <span
            key={g}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-xs font-semibold",
              isShared ? "bg-rouge/15 text-rouge ring-1 ring-inset ring-rouge/40" : "bg-white/[0.06] text-primary/90",
            )}
          >
            {g}
          </span>
        );
      })}
    </div>
  );
}
