"use client";

import type { EventType, MoodTag } from "@/lib/types";
import { copyFor, moodsFor } from "@/lib/engine/eventType";
import { cn } from "@/lib/utils";

/** Check-in rápido del mood (un toque): "Mood de la noche" en una fiesta, "Qué venís a buscar" en un evento corporativo. */
export function MoodPicker({ value, onChange, type = "nightlife" }: { value: MoodTag | null; onChange: (m: MoodTag) => void; type?: EventType }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={copyFor(type).moodTitle}>
      {moodsFor(type).map((m) => {
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
