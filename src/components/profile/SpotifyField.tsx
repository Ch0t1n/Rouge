"use client";

import { parseSpotify } from "@/lib/engine/profile";
import { TextField } from "@/components/ui/field";
import { SpotifyEmbed } from "@/components/media/SpotifyEmbed";

/** Pegá el link de "Compartir" de Spotify y ves el embed al instante. */
export function SpotifyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = parseSpotify(value);
  const invalid = value.trim().length > 0 && !ref;
  return (
    <div className="space-y-3">
      <TextField
        label="Tu tema o playlist de Spotify (opcional)"
        placeholder="https://open.spotify.com/track/…"
        inputMode="url"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={invalid ? "No reconocemos ese link. Usá Compartir → Copiar link en Spotify." : null}
        hint="En Spotify: ••• → Compartir → Copiar enlace."
      />
      {ref && <SpotifyEmbed key={ref.embedUrl} url={ref.embedUrl} autoLoad />}
    </div>
  );
}
