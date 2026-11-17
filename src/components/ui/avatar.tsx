"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import { useMediaUrl } from "@/lib/media/useMediaUrl";
import { cn } from "@/lib/utils";

const RING = { none: "", squad: "ring-2 ring-squad shadow-glow-squad", rouge: "ring-2 ring-rouge shadow-glow-rouge", vip: "ring-2 ring-vip shadow-glow-vip" };

/**
 * Avatar con la foto ENTERA: las fotos de perfil son verticales 3:4 (las encuadra la persona al subirlas), así que el
 * avatar tiene esa misma forma, con esquinas suaves, y nunca le corta nada (un círculo le comería los bordes).
 * `size` es el ALTO; el ancho es 3/4. Si queda alguna foto vieja con otra proporción, se ve entera (object-contain)
 * sobre su color dominante. Fallback de iniciales si la foto no carga con mala señal.
 */
export function Avatar({
  profile,
  size = 40,
  ring = "none",
  className,
}: {
  profile: Pick<Profile, "full_name" | "photos">;
  size?: number;
  ring?: keyof typeof RING;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const { src, missing } = useMediaUrl(profile.photos[0]?.url);
  const initials = profile.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden bg-surface-raised font-display font-bold text-muted", RING[ring], className)}
      style={{ width: Math.round(size * 0.75), height: size, fontSize: size * 0.32, borderRadius: Math.round(size * 0.2), backgroundColor: profile.photos[0]?.blur_color }}
    >
      {src && !failed && !missing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-contain" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
