"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { themeVars, type EventTheme, type ThemeColors } from "@/lib/engine/branding";
import { useMediaUrl } from "@/lib/media/useMediaUrl";

/**
 * Aplica los colores de una marca en <html> (variables --c-rouge / --c-vip de globals.css) mientras el
 * componente que lo usa está montado. Así también los overlays fijos (BottomSheet, Toaster) toman el tema.
 * null = colores de ROUGE.
 */
export function useBrandTheme(theme: ThemeColors | null | undefined) {
  const primary = theme?.primary;
  const accent = theme?.accent;
  useEffect(() => {
    if (!primary || !accent) return;
    const root = document.documentElement;
    const vars = themeVars({ primary, accent });
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [primary, accent]);
}

/** Logo de la marca/evento (contenido, sin recortar) o, si no hay, su nombre en tipografía display. */
export function BrandLogo({ theme, className, fallback = true }: { theme: Pick<EventTheme, "logo_url" | "brand_name">; className?: string; fallback?: boolean }) {
  const { src } = useMediaUrl(theme.logo_url);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={theme.brand_name ?? "Logo del evento"} className={cn("h-8 w-auto max-w-[160px] object-contain", className)} decoding="async" />;
  }
  if (!fallback || !theme.brand_name) return null;
  return <span className={cn("font-display text-sm font-bold uppercase tracking-tight text-rouge", className)}>{theme.brand_name}</span>;
}
