import type Lenis from "lenis";

/**
 * Estado mutable compartido entre el DOM (Lenis/ScrollTrigger) y la escena 3D.
 * No es estado de React a propósito: se escribe en cada frame de scroll y se lee en
 * `useFrame`, sin provocar renders.
 */
export const scrollState = {
  /** Avance global de la página (0 → 1). */
  progress: 0,
  /** Velocidad del scroll (px/frame, con signo). La da Lenis; sin Lenis se estima. */
  velocity: 0,
  /** 1 = bajando, -1 = subiendo. */
  direction: 1 as 1 | -1,
  /** Etapa de la coreografía 3D según la sección en el centro de la pantalla (0–3). */
  stage: 0,
  /** Puntero normalizado (-1 → 1), +y hacia arriba como en WebGL. */
  pointerX: 0,
  pointerY: 0,
};

/** Instancia viva de Lenis (null con `prefers-reduced-motion` o fuera de la landing). */
export const lenisRef: { current: Lenis | null } = { current: null };

/** Scroll suave a un ancla (#id) respetando el navbar flotante. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -72, duration: 1.4 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export const STAGES = 4;
