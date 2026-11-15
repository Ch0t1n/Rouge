"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, prefersReducedMotion, ScrollTrigger } from "./gsap";
import { lenisRef, scrollState } from "./scrollStore";

/**
 * Lenis + GSAP ScrollTrigger sincronizados en un solo reloj (gsap.ticker).
 * También mantiene `scrollState` (avance, velocidad, etapa 3D y puntero).
 * Todo se desarma al desmontar: la app (/app, /admin) no hereda listeners ni rAF.
 */
export function useSmoothScroll() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const lenis = reduce ? null : new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.15 });
    lenisRef.current = lenis;

    const stageEls = () => Array.from(document.querySelectorAll<HTMLElement>("[data-stage]"));
    let els = stageEls();
    let lastY = window.scrollY;

    const measure = () => {
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollState.progress = Math.min(1, Math.max(0, y / max));
      if (!lenis) scrollState.velocity = y - lastY;
      if (y !== lastY) scrollState.direction = y > lastY ? 1 : -1;
      lastY = y;
      // Etapa = sección que cruza el centro de la pantalla.
      const mid = window.innerHeight / 2;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          scrollState.stage = Number(el.dataset.stage) || 0;
          break;
        }
      }
    };

    const tick = (time: number) => {
      if (lenis) {
        lenis.raf(time * 1000);
        scrollState.velocity = lenis.velocity;
      } else {
        scrollState.velocity *= 0.9;
      }
    };

    const onPointer = (e: PointerEvent) => {
      scrollState.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      scrollState.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onRefresh = () => {
      els = stageEls();
      measure();
    };

    lenis?.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    if (lenis) gsap.ticker.lagSmoothing(0);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    ScrollTrigger.addEventListener("refresh", onRefresh);
    measure();
    // Las fuentes y la escena cambian alturas: recalcular una vez asentado el layout.
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 400);

    return () => {
      window.clearTimeout(t);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("pointermove", onPointer);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis?.destroy();
      lenisRef.current = null;
      Object.assign(scrollState, { progress: 0, velocity: 0, direction: 1, stage: 0 });
    };
  }, []);
}
