"use client";

import Link from "next/link";
import { Check, Heart, Play, UserPlus } from "lucide-react";
import type { EventType } from "@/lib/types";
import { copyFor, moodMeta } from "@/lib/engine/eventType";
import type { GridCardData } from "@/lib/engine/grid";
import { ageFrom, cn } from "@/lib/utils";
import { MediaImage } from "@/components/media/MediaImage";

/**
 * Tarjeta vertical 3:4 de la grilla: foto a sangre, % afinidad, mood y Conectar.
 * En un evento corporativo muestra cargo y empresa, el % de intereses en común y "sumar contacto" en vez del corazón.
 */
export function GridCard({ card, onConnect, priority, type = "nightlife" }: { card: GridCardData; onConnect: () => void; priority?: boolean; type?: EventType }) {
  const { profile, attendee, affinity, connection, sharedZones } = card;
  const mood = moodMeta(attendee.mood_tag);
  const photo = profile.photos[0];
  const copy = copyFor(type);
  const corporate = type === "corporate";
  const ConnectIcon = corporate ? UserPlus : Heart;
  const work = [profile.job_title, profile.company].filter(Boolean).join(" · ");
  const subtitle = corporate
    ? work || affinity.shared.slice(0, 2).join(" · ") || profile.interests.slice(0, 2).join(" · ")
    : sharedZones.length
      ? `📍 ${sharedZones[0]}`
      : affinity.shared.slice(0, 2).join(" · ") || profile.music_genres.slice(0, 2).join(" · ");

  return (
    <div className="relative aspect-card overflow-hidden rounded-3xl border border-white/10 bg-surface-raised">
      <Link href={`/u/${profile.username}`} className="absolute inset-0" aria-label={`Ver perfil de ${profile.full_name}`}>
        {photo ? <MediaImage photo={photo} className="absolute inset-0" priority={priority} /> : <div className="grid size-full place-items-center font-display text-4xl text-muted/40">{profile.full_name[0]}</div>}
        <div className="card-fade absolute inset-x-0 bottom-0 h-3/5" />
      </Link>

      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1">
        <span className={cn("rounded-full px-2 py-0.5 font-display text-[11px] font-bold", affinity.percent >= 60 ? "bg-rouge text-white shadow-glow-rouge" : "bg-black/60 text-primary backdrop-blur-md")} title={copy.affinityLabel}>
          {affinity.percent}% {copy.affinityEmoji}
        </span>
        {connection === "matched" ? (
          <span className="rounded-full bg-rouge px-2 py-0.5 font-display text-[10px] font-bold uppercase text-white">{copy.match}</span>
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
            <p className="truncate text-[11px] text-muted">{subtitle}</p>
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
              {connection === "sent" ? <Check className="size-5" /> : <ConnectIcon className={cn("size-5", connection === "received" && !corporate && "fill-current")} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
