"use client";

import { Check } from "lucide-react";
import { MUSIC_GENRES, type MusicGenre } from "@/lib/types";
import { MAX_GENRES } from "@/lib/engine/profile";
import { cn } from "@/lib/utils";

const EMOJI: Record<MusicGenre, string> = {
  Techno: "⚙️",
  House: "🏠",
  Reggaetón: "🔥",
  Cachengue: "🎉",
  Pop: "💖",
  RKT: "🚀",
  Indie: "🎸",
  Urbano: "🎤",
  Electrónica: "🎛️",
};

export function GenrePicker({ value, onChange, highlight = [] }: { value: MusicGenre[]; onChange: (v: MusicGenre[]) => void; highlight?: MusicGenre[] }) {
  const toggle = (g: MusicGenre) => {
    if (value.includes(g)) onChange(value.filter((x) => x !== g));
    else if (value.length < MAX_GENRES) onChange([...value, g]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Géneros musicales">
        {MUSIC_GENRES.map((g) => {
          const on = value.includes(g);
          const disabled = !on && value.length >= MAX_GENRES;
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(g)}
              className={cn(
                "inline-flex min-h-touch items-center gap-1.5 rounded-full border px-4 font-display text-sm font-semibold transition active:scale-95 disabled:opacity-35",
                on ? "border-rouge bg-rouge text-white shadow-glow-rouge" : "border-white/12 bg-white/[0.04] text-primary hover:border-white/25",
                !on && highlight.includes(g) && "border-rouge/50",
              )}
            >
              {on ? <Check className="size-4" /> : <span aria-hidden>{EMOJI[g]}</span>}
              {g}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {value.length}/{MAX_GENRES} · La grilla te ordena según la afinidad musical con cada asistente.
      </p>
    </div>
  );
}

export function GenreChips({ genres, shared = [] }: { genres: MusicGenre[]; shared?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {genres.map((g) => {
        const isShared = shared.includes(g);
        return (
          <span
            key={g}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-xs font-semibold",
              isShared ? "bg-rouge/15 text-rouge ring-1 ring-inset ring-rouge/40" : "bg-white/[0.06] text-primary/90",
            )}
          >
            <span aria-hidden>{EMOJI[g]}</span> {g}
          </span>
        );
      })}
    </div>
  );
}
