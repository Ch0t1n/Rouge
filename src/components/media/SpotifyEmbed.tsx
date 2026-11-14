"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { parseSpotify } from "@/lib/engine/profile";
import { cn } from "@/lib/utils";

const KIND_LABEL = { track: "Tema", album: "Álbum", playlist: "Playlist", episode: "Episodio", artist: "Artista", show: "Podcast" } as const;

/**
 * Embed compacto de Spotify. Por defecto NO carga el iframe (≈1 MB de JS de
 * terceros) hasta que el usuario toca "Escuchar": clave con señal saturada.
 */
export function SpotifyEmbed({ url, autoLoad = false, className }: { url: string; autoLoad?: boolean; className?: string }) {
  const ref = parseSpotify(url);
  const [load, setLoad] = useState(autoLoad);
  if (!ref) return null;

  if (!load) {
    return (
      <button
        type="button"
        onClick={() => setLoad(true)}
        className={cn("glass flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-3 text-left transition hover:bg-white/10", className)}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rouge text-white shadow-glow-rouge">
          <Play className="size-4 translate-x-px fill-current" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-primary">Escuchar en Spotify</span>
          <span className="block text-xs text-muted">{KIND_LABEL[ref.kind]} · se carga al tocar para ahorrar datos</span>
        </span>
      </button>
    );
  }

  return (
    <iframe
      title={`Spotify ${KIND_LABEL[ref.kind]}`}
      src={ref.embedUrl}
      width="100%"
      height={ref.height}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      className={cn("rounded-2xl border-0 bg-surface-raised", className)}
    />
  );
}
