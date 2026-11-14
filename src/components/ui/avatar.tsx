"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import { useMediaUrl } from "@/lib/media/useMediaUrl";
import { cn } from "@/lib/utils";

const RING = { none: "", squad: "ring-2 ring-squad shadow-glow-squad", rouge: "ring-2 ring-rouge shadow-glow-rouge", vip: "ring-2 ring-vip shadow-glow-vip" };

/** Avatar circular con fallback de iniciales (si la foto no carga con mala señal). */
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
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-raised font-display font-bold text-muted", RING[ring], className)}
      style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: profile.photos[0]?.blur_color }}
    >
      {src && !failed && !missing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
