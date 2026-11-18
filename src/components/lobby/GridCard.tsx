"use client";

import Link from "next/link";
import { Check, Heart, Play } from "lucide-react";
import { MOOD_TAGS } from "@/lib/types";
import type { GridCardData } from "@/lib/engine/grid";
import { needLabel, proHeadline, vertical } from "@/lib/engine/verticals";
import { cn } from "@/lib/utils";
import { ageOf, profileHref } from "@/lib/engine/privacy";
import { MediaImage } from "@/components/media/MediaImage";

/**
 * Tarjeta vertical 3:4 de la grilla: foto a sangre, % afinidad, mood y Conectar.
 * Muestra la CARA del evento: en la noche nombre, edad y géneros; en corporativo nombre, cargo, empresa y qué ofrece.
 */
/** `onOpen`: si lo devuelve true, se abre la vista previa (panel derecho en PC) en lugar de navegar al perfil. */
export function GridCard({ card, onConnect, onOpen, priority }: { card: GridCardData; onConnect: () => void; onOpen?: () => boolean; priority?: boolean }) {
  const { profile, attendee, affinity, connection, sharedZones } = card;
  const mood = MOOD_TAGS.find((m) => m.id === attendee.mood_tag);
  const photo = profile.photos[0];
  const v = vertical(profile.face_kind);
  const pro = profile.persona?.kind === "corporate" ? profile.persona : null;
  const subtitle = sharedZones.length
    ? `📍 ${sharedZones[0]}`
    : pro
      ? affinity.highlights.length
        ? `🤝 ${affinity.highlights[0]}`
        : pro.offering.slice(0, 2).map(needLabel).join(" · ")
      : affinity.sharedGenres.slice(0, 2).join(" · ") || profile.music_genres.slice(0, 2).join(" · ");

  return (
    <div className="group relative aspect-card overflow-hidden rounded-3xl border border-white/10 bg-surface-raised transition duration-200 md:hover:-translate-y-0.5 md:hover:border-white/25 md:hover:shadow-glow-rouge">
      <Link
        href={profileHref(profile, attendee.event_id)}
        className="absolute inset-0"
        aria-label={`Ver perfil de ${profile.full_name}`}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey && onOpen?.()) e.preventDefault();
        }}
      >
        {photo ? <MediaImage photo={photo} className="absolute inset-0" priority={priority} /> : <div className="grid size-full place-items-center font-display text-4xl text-muted/40">{profile.full_name[0]}</div>}
        <div className="card-fade absolute inset-x-0 bottom-0 h-3/5" />
      </Link>

      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1">
        <span className={cn("rounded-full px-2 py-0.5 font-display text-[11px] font-bold", affinity.percent >= 60 ? "bg-rouge text-white shadow-glow-rouge" : "bg-black/60 text-primary backdrop-blur-md")}>
          {affinity.percent}% {v.copy.affinityIcon}
        </span>
        {connection === "matched" ? (
          <span className="rounded-full bg-rouge px-2 py-0.5 font-display text-[10px] font-bold uppercase text-white">{v.copy.match}</span>
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
              {profile.full_name.split(" ")[0]} {v.features.showAge && <span className="font-sans font-normal text-primary/80">{ageOf(profile)}</span>}
            </p>
            {pro && <p className="truncate text-[11px] font-semibold text-primary/85">{proHeadline(pro)}</p>}
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
              {connection === "sent" ? <Check className="size-5" /> : <Heart className={cn("size-5", connection === "received" && "fill-current")} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
