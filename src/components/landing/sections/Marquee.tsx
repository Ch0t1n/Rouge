"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../core/gsap";
import { scrollState } from "../core/scrollStore";
import { cn } from "@/lib/utils";

import { useAudience } from "../core/audience";

const PHRASES = {
  public: ["Match por afinidad musical", "Tu grupo en el plano", "1 Rompehielos por noche", "Squads y Rescate", "Tragos sin fila", "Cuentas claras"],
  organizers: ["Cobrás antes de servir", "CRM con Smart Tags", "Text Blast por zona", "Pantalla LED", "RRPP con link propio", "Escáner en la puerta"],
};

function Row({ outline }: { outline?: boolean }) {
  const phrases = PHRASES[useAudience()];
  return (
    <>
      {[0, 1].map((k) => (
        <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 1}>
          {phrases.map((p) => (
            <span key={p} className={cn("flex items-center whitespace-nowrap px-6 font-display text-5xl font-bold uppercase tracking-tighter sm:text-7xl", outline ? "text-outline" : "text-primary")}>
              {p}
              <span className={cn("ml-12 text-4xl sm:text-6xl", outline ? "text-squad" : "text-rouge")}>✦</span>
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Cinta doble infinita: la velocidad sigue al scroll (acelera) y la dirección se invierte
 * cuando el usuario sube. Una fila sólida y otra en contorno, en sentidos opuestos.
 */
export function Marquee() {
  const audience = useAudience();
  const root = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!a.current || !b.current) return;
      const reduce = prefersReducedMotion();
      const wrap = gsap.utils.wrap(-50, 0);
      const pos = { a: 0, b: -25 };
      const setA = gsap.quickSetter(a.current, "xPercent");
      const setB = gsap.quickSetter(b.current, "xPercent");
      const skewA = gsap.quickTo(a.current, "skewX", { duration: 0.4 });
      const skewB = gsap.quickTo(b.current, "skewX", { duration: 0.4 });
      const tick = (_t: number, dt: number) => {
        const v = scrollState.velocity;
        const boost = 1 + Math.min(Math.abs(v) * 0.35, 9);
        const step = (reduce ? 0.004 : 0.012) * boost * (dt / 16.7) * scrollState.direction;
        pos.a = wrap(pos.a - step);
        pos.b = wrap(pos.b + step);
        setA(pos.a);
        setB(pos.b);
        if (!reduce) {
          const sk = gsap.utils.clamp(-8, 8, v * -0.25);
          skewA(sk);
          skewB(-sk);
        }
      };
      gsap.ticker.add(tick);
      return () => gsap.ticker.remove(tick);
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative -rotate-2 overflow-hidden border-y border-white/10 bg-background/70 py-6 backdrop-blur-sm" role="marquee" aria-label={PHRASES[audience].join(", ")}>
      <div ref={a} className="flex w-max will-change-transform">
        <Row />
      </div>
      <div ref={b} className="mt-2 flex w-max will-change-transform">
        <Row outline />
      </div>
    </div>
  );
}
