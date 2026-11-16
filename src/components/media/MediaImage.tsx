"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { ProfilePhoto } from "@/lib/types";
import { useMediaUrl } from "@/lib/media/useMediaUrl";
import { cn } from "@/lib/utils";

/**
 * Foto ENTERA, tal como la publicó la persona: nunca se recorta (object-contain), sea vertical, cuadrada o
 * apaisada. El espacio que sobra se rellena con la misma foto difuminada (misma descarga, sin red extra) sobre
 * su color dominante, así el marco se ve lleno sin cortar caras. Placeholder de color + fade-in (baja señal).
 */
export function MediaImage({ photo, alt = "", className, priority }: { photo: Pick<ProfilePhoto, "url" | "blur_color">; alt?: string; className?: string; priority?: boolean }) {
  const { src, missing } = useMediaUrl(photo.url);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-surface-raised", className)} style={{ backgroundColor: photo.blur_color }}>
      {src && !failed && !missing ? (
        <>
          {/* Relleno decorativo: la misma foto, ampliada y difuminada (no es la foto que se muestra). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            aria-hidden
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            className={cn("absolute inset-0 size-full scale-125 object-cover blur-2xl transition-opacity duration-300", loaded ? "opacity-50" : "opacity-0")}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn("absolute inset-0 size-full object-contain transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
          />
        </>
      ) : (failed || missing) ? (
        <div className="absolute inset-0 grid place-items-center text-muted/50">
          <ImageOff className="size-6" />
        </div>
      ) : null}
    </div>
  );
}
