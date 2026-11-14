"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { ProfilePhoto } from "@/lib/types";
import { useMediaUrl } from "@/lib/media/useMediaUrl";
import { cn } from "@/lib/utils";

/** Imagen a sangre con placeholder de color dominante y fade-in (baja señal). */
export function MediaImage({ photo, alt = "", className, priority }: { photo: Pick<ProfilePhoto, "url" | "blur_color">; alt?: string; className?: string; priority?: boolean }) {
  const { src, missing } = useMediaUrl(photo.url);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-surface-raised", className)} style={{ backgroundColor: photo.blur_color }}>
      {src && !failed && !missing ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      ) : (failed || missing) ? (
        <div className="absolute inset-0 grid place-items-center text-muted/50">
          <ImageOff className="size-6" />
        </div>
      ) : null}
    </div>
  );
}
