"use client";

import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, BadgeCheck, CalendarCheck, Radio, ShieldCheck } from "lucide-react";
import { gsap, hasFinePointer, prefersReducedMotion, useGSAP } from "@/components/landing/core/gsap";
import { useDemoRequest } from "./ProDemoForm";

/**
 * Hero de ROUGE PRO: propuesta de valor + maqueta en capas (pase digital, reunión confirmada y telemetría de ingreso).
 * La maqueta usa transformaciones 3D de CSS animadas con GSAP (entrada escalonada, contador e inclinación con el mouse);
 * con "reducir movimiento" queda estática.
 */
export function ProHero() {
  const demo = useDemoRequest();
  return (
    <section className="relative overflow-hidden bg-pro-navy text-white" aria-labelledby="pro-hero-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(#94A3B8_1px,transparent_1px),linear-gradient(90deg,#94A3B8_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-32 -top-40 size-[560px] rounded-full bg-pro-cobalt/25 blur-[140px]" />
        <div className="absolute -right-24 bottom-[-30%] size-[480px] rounded-full bg-pro-gold/10 blur-[140px]" />
      </div>
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-pro-line bg-pro-panel/70 px-3 py-1 font-pro-mono text-[11px] uppercase tracking-[0.18em] text-pro-mist">
            <span className="size-1.5 rounded-full bg-pro-emerald" /> Plataforma para eventos corporativos
          </p>
          <h1 id="pro-hero-title" className="mt-6 font-pro text-[clamp(2.2rem,4.8vw,3.75rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            El sistema operativo para eventos corporativos, congresos y networking de alto nivel.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-pro-mist sm:text-lg">
            Acreditación instantánea con QR, agenda de reuniones 1 a 1 con asignación de salas, mapas indoor interactivos y analítica en tiempo real. Sin fricción, sin apps pesadas.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => demo.open("pro · hero")} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-pro-cobalt px-6 font-pro font-semibold shadow-[0_10px_40px_rgba(29,78,216,0.45)] transition hover:bg-pro-sapphire">
              Agendar Demo Ejecutiva <ArrowRight className="size-4" />
            </button>
            <a href="#simulador" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-pro-line bg-pro-panel/60 px-6 font-pro font-semibold text-white transition hover:border-pro-mist/40">
              Explorar Simulador de Evento
            </a>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-pro-mist">
            {["Sin descargas: app web instalable", "Marca blanca de tu empresa", "Datos personales protegidos"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <BadgeCheck className="size-4 text-pro-emerald" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroStack />
      </div>
    </section>
  );
}

function HeroStack() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-layer]", { y: 40, opacity: 0, rotateX: 12, duration: 0.9, stagger: 0.14 });
      if (counter.current) {
        const obj = { n: 0 };
        tl.to(obj, { n: 384, duration: 1.6, ease: "power2.out", onUpdate: () => counter.current && (counter.current.textContent = Math.round(obj.n).toString()) }, 0.4);
      }
      if (!hasFinePointer() || !stage.current) return;
      const el = stage.current;
      const rx = gsap.quickTo(el, "rotateX", { duration: 0.6, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotateY", { duration: 0.6, ease: "power3.out" });
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        rx(((e.clientY - r.top) / r.height - 0.5) * -10);
        ry(((e.clientX - r.left) / r.width - 0.5) * 12);
      };
      const onLeave = () => {
        rx(0);
        ry(0);
      };
      root.current?.addEventListener("pointermove", onMove);
      root.current?.addEventListener("pointerleave", onLeave);
      return () => {
        root.current?.removeEventListener("pointermove", onMove);
        root.current?.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative mx-auto w-full max-w-md [perspective:1400px] lg:max-w-none" aria-label="Vista ilustrativa de la plataforma" role="img">
      <div ref={stage} className="relative h-[460px] [transform-style:preserve-3d] sm:h-[500px]">
        {/* Capa 1: pase digital */}
        <div data-layer className="absolute left-0 top-6 w-[66%] rounded-2xl border border-pro-line bg-gradient-to-b from-pro-panel to-pro-slate p-5 shadow-2xl [transform:translateZ(20px)]">
          <div className="flex items-center justify-between">
            <span className="font-pro text-sm font-bold tracking-[-0.02em]">
              ROUGE <span className="font-pro-mono text-[10px] text-pro-gold">PRO</span>
            </span>
            <span className="rounded-full border border-pro-gold/40 bg-pro-gold/15 px-2 py-0.5 font-pro-mono text-[10px] font-semibold tracking-wider text-pro-gold">SPEAKER</span>
          </div>
          <p className="mt-4 font-pro text-lg font-semibold">Valeria Ortiz</p>
          <p className="text-xs text-pro-mist">Directora de Innovación · Grupo Meridia</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="rounded-xl bg-white p-2">
              <QRCodeSVG value="https://rougepass.com/pro" size={96} level="M" bgColor="#FFFFFF" fgColor="#0B1120" />
            </div>
            <div className="text-right font-pro-mono text-[10px] leading-relaxed text-pro-mist">
              <p>PASE DE 1 USO</p>
              <p className="text-white">CUMBRE-2026</p>
              <p>PUERTA A · 08:30</p>
            </div>
          </div>
        </div>
        {/* Capa 2: reunión confirmada */}
        <div data-layer className="absolute right-0 top-40 w-[64%] rounded-2xl border border-pro-line bg-pro-panel/90 p-4 shadow-2xl backdrop-blur-xl [transform:translateZ(60px)]">
          <p className="flex items-center gap-2 font-pro-mono text-[10px] uppercase tracking-[0.18em] text-pro-emerald">
            <CalendarCheck className="size-3.5" /> Reunión confirmada
          </p>
          <p className="mt-2 font-pro font-semibold">Sala Directorio B · 15:30 hs</p>
          <p className="text-xs text-pro-mist">Valeria Ortiz ↔ Martín Sosa (Logix) · 30 min</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-pro-line bg-pro-slate px-3 py-2 font-pro-mono text-[11px] text-pro-mist">
            <span className="size-2 rounded-full bg-pro-sapphire" /> PIN · PLANTA 2 · X 72 · Y 41
          </div>
        </div>
        {/* Capa 3: telemetría de ingreso */}
        <div data-layer className="absolute bottom-0 left-[8%] w-[60%] rounded-2xl border border-pro-line bg-pro-slate/95 p-4 shadow-2xl [transform:translateZ(100px)]">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-pro-mono text-[10px] uppercase tracking-[0.18em] text-pro-mist">
              <Radio className="size-3.5 text-pro-emerald" /> Check-in en vivo
            </p>
            <ShieldCheck className="size-4 text-pro-emerald" />
          </div>
          <p className="mt-2 font-pro-mono text-3xl font-semibold tabular-nums">
            <span ref={counter}>384</span>
            <span className="text-base text-pro-mist"> / 520</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pro-panel">
            <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-pro-cobalt to-pro-emerald" />
          </div>
          <p className="mt-2 text-[11px] text-pro-mist">Datos de ejemplo · acreditados / invitados</p>
        </div>
      </div>
    </div>
  );
}
