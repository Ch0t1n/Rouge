"use client";

import { useEffect, useRef } from "react";
import { useMediaUrl } from "@/lib/media/useMediaUrl";
import { cn } from "@/lib/utils";

/**
 * Loop de perfil tipo GIF: autoplay, muted, sin controles, en bucle.
 * Se pausa fuera de pantalla para ahorrar batería y datos en la pista.
 */
export function LoopVideo({ url, poster, className }: { url: string; poster?: string | null; className?: string }) {
  const { src } = useMediaUrl(url);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  if (!src) return <div className={cn("bg-surface-raised", className)} />;
  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      disablePictureInPicture
      aria-hidden
      className={cn("bg-black object-contain", className)}
    />
  );
}
