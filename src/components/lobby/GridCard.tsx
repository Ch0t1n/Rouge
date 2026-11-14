"use client";

import Link from "next/link";
import { Check, Heart, Play } from "lucide-react";
import { MOOD_TAGS } from "@/lib/types";
import type { GridCardData } from "@/lib/engine/grid";
import { ageFrom, cn } from "@/lib/utils";
import { MediaImage } from "@/components/media/MediaImage";

/** Tarjeta vertical 3:4 de la grilla: foto a sangre, % afinidad, mood y Conectar. */
export function GridCard({ card, onConnect, priority }: { card: GridCardData; onConnect: () => void; priority?: boolean }) {
  const { profile, attendee, affinity, connection, sharedZones } = card;
  const mood = MOOD_TAGS.find((m) => m.id === attendee.mood_tag);
  const photo = profile.photos[0];

  return (
    <div className="relative aspect-card overflow-hidden rounded-3xl border border-white/10 bg-surface-raised">
      <Link href={`/u/${profile.username}`} className="absolute inset-0" aria-label={`Ver perfil de ${profile.full_name}`}>
        {photo ? <MediaImage photo={photo} className="absolute inset-0" priority={priority} /> : <div className="grid size-full place-items-center font-display text-4xl text-muted/40">{profile.full_name[0]}</div>}
        <div className="card-fade absolute inset-x-0 bottom-0 h-3/5" />
      </Link>

      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1">
        <span className={cn("rounded-full px-2 py-0.5 font-display text-[11px] font-bold", affinity.musicPercent >= 60 ? "bg-rouge text-white shadow-glow-rouge" : "bg-black/60 text-primary backdrop-blur-md")}>
          {affinity.musicPercent}% 🎵
        </span>
        {connection === "matched" ? (
          <span className="rounded-full bg-rouge px-2 py-0.5 font-display text-[10px] font-bold uppercase text-white">Match</span>
        ) : connection === "received" ? (
          <span className="animate-pulse rounded-full bg-white px-2 py-0.5 font-display text-[10px] font-bold uppercase text-background">Te conectó</span>
        ) : profile.loop_video_url ? (
          <span className="grid size-6 place-items-center rounded-full bg-black/60 backdrop-blur-md" title="Tiene loop">
            <Play className="size-3 fill-current" />
          </span>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5">
        {mood && (
          <span className="glass-pill mb-1.5 inline-flex max-w-full items-center gap-1 truncate px-2 py-0.5 text-[10px]">
            {mood.emoji} {mood.label}
          </span>
        )}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-bold leading-tight">
              {profile.full_name.split(" ")[0]} <span className="font-sans font-normal text-primary/80">{ageFrom(profile.birth_date)}</span>
            </p>
            <p className="truncate text-[11px] text-muted">{sharedZones.length ? `📍 ${sharedZones[0]}` : affinity.sharedGenres.slice(0, 2).join(" · ") || profile.music_genres.slice(0, 2).join(" · ")}</p>
          </div>
          {connection !== "matched" && (
            <button
              type="button"
              onClick={onConnect}
              disabled={connection === "sent"}
              aria-label={connection === "sent" ? "Solicitud enviada" : connection === "received" ? `Aceptar a ${profile.full_name}` : `Conectar con ${profile.full_name}`}
              className={cn(
                "pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90",
                connection === "sent" ? "bg-white/15 text-primary" : "bg-rouge text-white shadow-glow-rouge",
              )}
            >
              {connection === "sent" ? <Check className="size-5" /> : <Heart className={cn("size-5", connection === "received" && "fill-current")} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
