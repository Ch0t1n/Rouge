"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, hasFinePointer, prefersReducedMotion } from "../core/gsap";

const INTERACTIVE = "a, button, [role='button'], [data-cursor], input, select, textarea, label, summary";

/**
 * Cursor dual (desktop): punto que sigue al instante + anillo con retardo, ambos con
 * `mix-blend-difference` (invierten lo que tienen debajo). El anillo crece sobre elementos
 * interactivos y muestra la etiqueta de `data-cursor="Texto"` si existe.
 * En pantallas táctiles no se monta y el cursor nativo queda intacto.
 */
export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setEnabled(hasFinePointer() && !prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!enabled || !dot.current || !ring.current || !label.current) return;
    const root = document.documentElement;
    root.classList.add("rouge-cursor");
    const dx = gsap.quickTo(dot.current, "x", { duration: 0.08, ease: "power3" });
    const dy = gsap.quickTo(dot.current, "y", { duration: 0.08, ease: "power3" });
    const rx = gsap.quickTo(ring.current, "x", { duration: 0.45, ease: "power3" });
    const ry = gsap.quickTo(ring.current, "y", { duration: 0.45, ease: "power3" });
    const ringEl = ring.current;
    const labelEl = label.current;
    const dotEl = dot.current;
    let visible = false;

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!visible) {
        visible = true;
        gsap.to([dotEl, ringEl], { autoAlpha: 1, duration: 0.25 });
      }
      dx(e.clientX);
      dy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);
    };
    const over = (e: PointerEvent) => {
      const t = (e.target as Element | null)?.closest?.(INTERACTIVE) as HTMLElement | null;
      const text = t?.dataset.cursor && t.dataset.cursor !== "true" ? t.dataset.cursor : "";
      labelEl.textContent = text;
      gsap.to(ringEl, { scale: t ? (text ? 2.8 : 1.9) : 1, duration: 0.35, ease: "power3.out" });
      gsap.to(dotEl, { scale: t ? 0 : 1, duration: 0.25 });
      gsap.to(labelEl, { autoAlpha: text ? 1 : 0, duration: 0.2 });
    };
    const leave = () => {
      visible = false;
      gsap.to([dotEl, ringEl], { autoAlpha: 0, duration: 0.2 });
    };
    const down = () => gsap.to(ringEl, { scale: "-=0.25", duration: 0.12, yoyo: true, repeat: 1 });

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      root.classList.remove("rouge-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerleave", leave);
      gsap.killTweensOf([dotEl, ringEl, labelEl]);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] mix-blend-difference">
      <div ref={ring} className="invisible absolute left-0 top-0 -ml-5 -mt-5 grid size-10 place-items-center rounded-full border border-white opacity-0">
        <span ref={label} className="invisible font-mono text-[5px] font-semibold uppercase tracking-[0.2em] text-white opacity-0" />
      </div>
      <div ref={dot} className="invisible absolute left-0 top-0 -ml-1 -mt-1 size-2 rounded-full bg-white opacity-0" />
    </div>
  );
}
