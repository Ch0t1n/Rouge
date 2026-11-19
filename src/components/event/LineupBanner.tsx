"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { ChevronUp, Music2, Send } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { lineupNow, topSongs } from "@/lib/engine/selectors";
import { requestSong, toggleSongVote } from "@/lib/engine/actions";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn, formatTime } from "@/lib/utils";
import { vertical } from "@/lib/engine/verticals";

/** 🔊 En cabina: DJ (02:00 - 03:30) | Sigue: Main Set — con pedido/voto de temas. */
export function LineupBanner({ event, className }: { event: RougeEvent; className?: string }) {
  const now = useNow(30_000);
  const { state, exec, notify } = useRouge();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const { current, next } = lineupNow(event, now);
  const songs = topSongs(state, event.id, 8);
  const me = state.current_user_id;
  // Corporativo: "Agenda" (charla actual y la que sigue), sin pedido de temas.
  const v = vertical(event.kind);
  const songsOn = v.features.songRequests;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await exec(C.requestSong(event.id, me, title, artist));
    if (r.ok) {
      setTitle("");
      setArtist("");
      notify({ tone: "squad", title: "🎶 Pedido enviado a cabina", description: "Si suma votos, aparece en la pantalla gigante." });
    }
  };

  return (
    <>
      <div className={cn("glass flex items-center gap-3 rounded-2xl px-3 py-2", className)}>
        <div className="flex h-5 items-end gap-[3px]" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-full w-[3px] origin-bottom rounded-full bg-rouge animate-eq-bar" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <div className="min-w-0 flex-1 text-[12px] leading-tight">
          {current ? (
            <p className="truncate">
              <span className="font-display font-semibold text-muted">{songsOn ? "🔊 En cabina:" : "🎤 Ahora:"}</span>{" "}
              <span className="font-display font-bold text-primary">{current.artist}</span>{" "}
              <span className="text-muted tabular-nums">
                ({formatTime(current.starts_at)} - {formatTime(current.ends_at)})
              </span>
            </p>
          ) : (
            <p className="truncate font-display font-semibold text-muted">{songsOn ? "🔊 La cabina abre pronto" : `🗓️ ${v.copy.lineup}: empieza pronto`}</p>
          )}
          {next && (
            <p className="truncate text-muted">
              Sigue: <span className="text-primary/90">{next.artist}</span> · {formatTime(next.starts_at)}
            </p>
          )}
        </div>
        {songsOn && (
          <Button size="sm" variant="glass" onClick={() => setOpen(true)} className="shrink-0 gap-1.5 px-3 text-rouge">
            <Music2 /> Pedir tema
          </Button>
        )}
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Pedile un tema al DJ" description="Votá los pedidos de la pista o sumá el tuyo.">
        <ul className="space-y-2">
          {songs.map((sng, i) => {
            const voted = sng.voter_ids.includes(me);
            return (
              <li key={sng.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-2 pl-3">
                <span className="metric w-5 text-center text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{sng.title}</p>
                  <p className="truncate text-xs text-muted">{sng.artist || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void exec(C.toggleSongVote(event.id, sng.id, me, sng.title))}
                  aria-pressed={voted}
                  aria-label={voted ? `Quitar voto a ${sng.title}` : `Votar ${sng.title}`}
                  className={cn(
                    "flex min-h-touch min-w-[56px] flex-col items-center justify-center rounded-xl font-display text-xs font-bold transition",
                    voted ? "bg-rouge text-white shadow-glow-rouge" : "bg-white/5 text-muted hover:text-primary",
                  )}
                >
                  <ChevronUp className="size-4" />
                  {sng.voter_ids.length}
                </button>
              </li>
            );
          })}
        </ul>
        <form onSubmit={submit} className="mt-4 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tema"
            className="min-h-touch w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm placeholder:text-muted/60 focus:border-rouge/60"
            maxLength={80}
          />
          <div className="flex gap-2">
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artista (opcional)"
              className="min-h-touch flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm placeholder:text-muted/60 focus:border-rouge/60"
              maxLength={60}
            />
            <Button type="submit" size="icon" aria-label="Enviar pedido" disabled={!title.trim()}>
              <Send />
            </Button>
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
