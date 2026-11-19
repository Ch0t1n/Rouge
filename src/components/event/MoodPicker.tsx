"use client";

import type { EventKind, MoodTag } from "@/lib/types";
import { moodsFor, vertical } from "@/lib/engine/verticals";
import { cn } from "@/lib/utils";

/** Check-in rápido del "Mood de la noche" / "¿A qué venís hoy?" (un toque): solo los moods de la vertical del evento. */
export function MoodPicker({ value, onChange, kind = "nightlife" }: { value: MoodTag | null; onChange: (m: MoodTag) => void; kind?: EventKind }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={vertical(kind).copy.moodTitle}>
      {moodsFor(kind).map((m) => {
        const on = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex min-h-[64px] items-center gap-2.5 rounded-2xl border px-3 text-left text-sm font-semibold transition active:scale-[0.98]",
              on ? "border-rouge bg-rouge/15 text-primary shadow-glow-rouge" : "border-white/10 bg-white/[0.03] text-primary/85 hover:border-white/20",
            )}
          >
            <span className="text-2xl" aria-hidden>
              {m.emoji}
            </span>
            <span className="leading-tight">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
