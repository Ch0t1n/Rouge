"use client";

import { useSyncExternalStore } from "react";

/**
 * Media query reactiva (sin parpadeo en SSR: en el servidor siempre es false).
 * Breakpoints de Tailwind: md = 768px (tablet), lg = 1024px (PC/notebook), xl = 1280px.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

export const BREAKPOINTS = { md: "(min-width: 768px)", lg: "(min-width: 1024px)", xl: "(min-width: 1280px)" } as const;

/** PC / notebook (≥ 1024px): vistas divididas, paneles laterales y carrito fijo. */
export const useIsDesktop = () => useMediaQuery(BREAKPOINTS.lg);
/** Tablet o más (≥ 768px): sidebar en lugar de la barra inferior. */
export const useIsTabletUp = () => useMediaQuery(BREAKPOINTS.md);
