"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowDownRight, ArrowRight, Play } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "../core/gsap";
import { scrollState } from "../core/scrollStore";
import { useEntry } from "../core/entry";
import { Magnetic } from "../fx/Magnetic";
import { SplitReveal } from "../fx/SplitReveal";

const TITLE = [
  { text: "NO VAYAS", className: "" },
  { text: "A CIEGAS.", className: "text-outline pl-[4vw] sm:pl-[8vw]" },
  { text: "DOMINA", className: "" },
  { text: "LA NOCHE.", className: "pl-[2vw] sm:pl-[14vw] text-rouge text-glow-rouge" },
];

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const { appHref, staffHref, staffClick, eventName } = useEntry();

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      // Paralaje: cada línea del título viaja a su propia velocidad al salir del hero.
      if (!reduce) {
        gsap.utils.toArray<HTMLElement>("[data-speed]", root.current).forEach((el) => {
          gsap.to(el, {
            yPercent: () => Number(el.dataset.speed) * -100,
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
          });
        });
        gsap.from("[data-hero-fade]", { autoAlpha: 0, y: 24, duration: 1, ease: "expo.out", stagger: 0.08, delay: 0.55 });
      }
      // Indicador de avance de toda la página.
      const update = () => {
        const v = Math.round(scrollState.progress * 100);
        if (pct.current) pct.current.textContent = String(v).padStart(2, "0");
        if (bar.current) bar.current.style.transform = `scaleX(${scrollState.progress})`;
      };
      gsap.ticker.add(update);
      return () => gsap.ticker.remove(update);
    },
    { scope: root },
  );

  return (
    <section ref={root} data-stage="0" className="relative flex min-h-[100svh] flex-col justify-end px-4 pb-10 pt-28 sm:px-8 lg:pb-14">
      {/* En celular, dos renglones alineados (sin sangría ni "B2B2C ]" huérfano); desde sm, en una línea. */}
      <p data-hero-fade className="flex flex-col items-start gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:text-xs sm:tracking-[0.25em]">
        <span className="[text-wrap:balance]">
          [ NEXT-GEN NIGHTLIFE ECOSYSTEM <span className="text-rouge">{"//"}</span> B2B2C ]
        </span>
        {eventName && (
          <span className="inline-flex items-center gap-1.5 text-squad">
            <span className="size-1.5 animate-pulse rounded-full bg-squad" /> EN VIVO: {eventName.toUpperCase()}
          </span>
        )}
      </p>

      <h1 aria-label="No vayas a ciegas. Domina la noche." className="mt-6">
        {TITLE.map((line, i) => (
          <span key={line.text} aria-hidden className="block" data-speed={[0.15, 0.32, 0.22, 0.45][i]}>
            <SplitReveal
              as="span"
              lines={[line]}
              by="chars"
              trigger="load"
              delay={0.1 + i * 0.12}
              className="block font-display text-[15vw] font-bold uppercase leading-[0.84] tracking-tighter sm:text-[12.5vw] lg:text-[min(10.2vw,15.5vh)]"
            />
          </span>
        ))}
      </h1>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <p data-hero-fade className="max-w-xl text-base text-muted sm:text-lg">
          El link de tu entrada desbloquea el <span className="text-primary">lobby privado de la fiesta</span>: conectás con gente que escucha lo mismo, ves a{" "}
          <span className="text-squad">tu grupo en el plano</span> y pedís en la <span className="text-vip">barra sin filas</span>. Sin descargar nada.
        </p>
        <div data-hero-fade className="flex flex-wrap gap-3 lg:justify-end">
          <Magnetic>
            <Link href={appHref} data-cursor="Play" className="group inline-flex min-h-[56px] items-center gap-3 rounded-full bg-rouge px-6 font-display text-base font-semibold text-white shadow-[0_0_40px_rgba(255,30,86,0.55)] transition hover:bg-rouge-hover">
              <Play className="size-4 fill-white" /> Probar App en Vivo <span className="font-mono text-xs opacity-80">(Demo Fiesta)</span>
            </Link>
          </Magnetic>
          <Magnetic>
            <Link
              href={staffHref("/admin")}
              onClick={staffClick("/admin")}
              data-cursor="Admin"
              className="inline-flex min-h-[56px] items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 font-display text-base font-semibold backdrop-blur-md transition hover:border-vip/60 hover:text-vip"
            >
              Soy Organizador / Dueño de Club <ArrowRight className="size-4" />
            </Link>
          </Magnetic>
        </div>
      </div>

      <div data-hero-fade className="mt-12 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        <ArrowDownRight className="size-4 animate-bounce text-rouge" />
        <span>Scroll</span>
        <span className="relative h-px w-28 overflow-hidden bg-white/15 sm:w-44">
          <span ref={bar} className="absolute inset-0 origin-left scale-x-0 bg-rouge" />
        </span>
        <span>
          <span ref={pct}>00</span>%
        </span>
        <span className="ml-auto hidden sm:inline">Buenos Aires · Madrid · CDMX</span>
      </div>
    </section>
  );
}
