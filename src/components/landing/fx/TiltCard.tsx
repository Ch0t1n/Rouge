"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, hasFinePointer, prefersReducedMotion } from "../core/gsap";
import { cn } from "@/lib/utils";

const GLOW = { rouge: "255,30,86", squad: "0,240,255", vip: "255,184,0" } as const;

/**
 * Tarjeta con inclinación 3D según el puntero y borde luminoso que sigue al cursor
 * (radial-gradient en variables CSS --mx/--my; sin re-render de React).
 */
export function TiltCard({ children, tone = "rouge", className, max = 9 }: { children: ReactNode; tone?: keyof typeof GLOW; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasFinePointer() || prefersReducedMotion()) return;
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.style.setProperty("--glow", "1");
      ry((px - 0.5) * 2 * max);
      rx(-(py - 0.5) * 2 * max);
    };
    const leave = () => {
      el.style.setProperty("--glow", "0");
      rx(0);
      ry(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      gsap.killTweensOf(el);
    };
  }, [max]);

  return (
    <div className="[perspective:1200px]">
      <div
        ref={ref}
        data-cursor
        style={{ ["--rgb" as string]: GLOW[tone] }}
        className={cn("tilt-card group relative h-full rounded-[1.75rem] p-px [transform-style:preserve-3d]", className)}
      >
        <div className="relative h-full overflow-hidden rounded-[calc(1.75rem-1px)] bg-surface/90 backdrop-blur-xl">
          <div aria-hidden className="tilt-sheen pointer-events-none absolute inset-0" />
          <div className="relative h-full [transform:translateZ(30px)]">{children}</div>
        </div>
      </div>
    </div>
  );
}
