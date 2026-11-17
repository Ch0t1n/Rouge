"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { FEATURE_CATEGORIES, FEATURE_PRESETS, FEATURES, featureMeta, matchingPreset, resolveFeatures, toggleFeature, type EventFeatureFlags, type FeatureKey } from "@/lib/engine/features";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/**
 * Interruptores de módulos por evento: presets de 1 clic + switches por categoría. Las dependencias se resuelven solas
 * (prender "Regalar tragos" prende Barra y Chat; apagar Barra apaga el regalo) y se avisa qué cambió.
 */
export function FeatureModulesPanel({ value, onChange, disabled = false, compact = false }: { value: EventFeatureFlags; onChange: (f: EventFeatureFlags) => void; disabled?: boolean; compact?: boolean }) {
  const flags = resolveFeatures(value);
  const preset = matchingPreset(flags);
  const [note, setNote] = useState<string | null>(null);

  const set = (key: FeatureKey, on: boolean) => {
    const next = toggleFeature(flags, key, on);
    const changed = FEATURES.filter((f) => f.key !== key && next[f.key] !== flags[f.key]).map((f) => `${f.label} (${next[f.key] ? "prendido" : "apagado"})`);
    setNote(changed.length ? `También: ${changed.join(", ")}.` : null);
    onChange(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Presets rápidos</p>
        <div className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-5")}>
          {FEATURE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              aria-pressed={preset === p.id}
              onClick={() => {
                setNote(null);
                onChange(resolveFeatures(p.flags));
              }}
              className={cn("rounded-2xl border p-3 text-left transition disabled:opacity-50", preset === p.id ? "border-vip bg-vip/10 shadow-glow-vip" : "border-white/10 bg-white/[0.03] hover:border-white/25")}
            >
              <span className="block font-display text-sm font-semibold">{p.emoji} {p.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{p.description}</span>
            </button>
          ))}
        </div>
        {!preset && <p className="mt-2 text-xs text-muted">Configuración personalizada.</p>}
      </div>

      <div className={cn("grid gap-4", compact ? "" : "lg:grid-cols-2")}>
        {FEATURE_CATEGORIES.map((c) => (
          <fieldset key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-2">
            <legend className="px-1 font-display text-sm font-semibold">{c.emoji} {c.label}</legend>
            {FEATURES.filter((f) => f.category === c.id).map((f) => {
              const missing = f.requires.filter((r) => !flags[r]);
              return (
                <div key={f.key} className="border-b border-white/5 last:border-0">
                  <Switch
                    id={`feat-${f.key}`}
                    tone={c.id === "bar" ? "vip" : "squad"}
                    checked={flags[f.key]}
                    disabled={disabled}
                    onCheckedChange={(v) => set(f.key, v)}
                    label={f.label}
                    description={f.description}
                  />
                  {f.requires.length > 0 && (
                    <p className={cn("-mt-1 mb-2 flex items-center gap-1 text-[11px]", missing.length ? "text-vip" : "text-muted/70")}>
                      <Link2 className="size-3" /> Requiere {f.requires.map((r) => featureMeta(r).label).join(" + ")}
                      {missing.length ? " (se prende al activarlo)" : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
      {note && <p role="status" className="rounded-xl bg-vip/10 px-3 py-2 text-xs text-vip">{note}</p>}
    </div>
  );
}
