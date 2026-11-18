"use client";

import { useRef } from "react";
import { ArrowUpRight, CalendarClock, ShieldCheck } from "lucide-react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/components/landing/core/gsap";
import { ProAttendeeGrid, ProAudienceSplit, ProOrganizerGrid } from "./ProBentoGrid";
import { ProDemoForm, ProDemoProvider, PRO_SALES_EMAIL } from "./ProDemoForm";
import { ProFooter } from "./ProFooter";
import { ProHero } from "./ProHero";
import { ProNavbar } from "./ProNavbar";
import { ProHeading, ProSection } from "./ProSection";
import { ProAccess, ProNetworking, ProPrivacy } from "./ProSpotlights";
import { ProTelemetry } from "./ProTelemetry";
import { ProUseCases } from "./ProUseCases";

const DEMO_BASE = (process.env.NEXT_PUBLIC_DEMO_URL ?? "").replace(/\/$/, "");
/** Demo en vivo como asistente del encuentro pyme (evento corporativo del Modo Demo). */
export const PRO_LIVE_DEMO = `${DEMO_BASE}/demo/abrir?rol=asistente&a=${encodeURIComponent("/join/PYME26")}`;

/**
 * ROUGE PRO (/pro): identidad ejecutiva propia (paleta `pro-*`, Inter + JetBrains Mono), sin colores de la noche.
 * Las tarjetas aparecen al hacer scroll (GSAP ScrollTrigger, una vez); con "reducir movimiento" no hay animación.
 */
export function ProLanding() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      ScrollTrigger.batch(".pro-reveal", {
        start: "top 88%",
        once: true,
        onEnter: (els) => gsap.fromTo(els, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.08, overwrite: true }),
      });
    },
    { scope: root },
  );

  return (
    <ProDemoProvider>
      <div ref={root} className="min-h-screen bg-pro-navy font-pro antialiased">
        <a href="#pro-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-pro-ink">
          Saltar al contenido
        </a>
        <ProNavbar />
        <main id="pro-main">
          <ProHero />
          {/* Las ventajas para quien ORGANIZA y para quien ASISTE van siempre en bloques separados. */}
          <ProAudienceSplit />
          {/* ── Para quien organiza ── */}
          <ProOrganizerGrid />
          <ProAccess />
          <ProTelemetry />
          {/* ── Para quien asiste ── */}
          <ProAttendeeGrid />
          <ProNetworking />
          {/* ── Ambos: cada columna rotulada ── */}
          <ProPrivacy />
          <ProUseCases />
          <ProSection id="demo" tone="dark" labelledBy="pro-demo">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <ProHeading id="pro-demo" tone="dark" kicker="Demo ejecutiva" title="Veamos tu próximo evento" text="Contanos el formato y la cantidad de asistentes. Te mostramos la plataforma con tu caso y te enviamos una propuesta a medida." />
                <ul className="mt-8 space-y-3 text-sm text-white">
                  <li className="flex gap-3">
                    <CalendarClock className="size-5 shrink-0 text-pro-gold" /> 20 minutos, con tu agenda, tu plano y tus salas
                  </li>
                  <li className="flex gap-3">
                    <ShieldCheck className="size-5 shrink-0 text-pro-gold" /> Respuesta en el día hábil
                  </li>
                </ul>
                <a href={PRO_LIVE_DEMO} target="_blank" rel="noreferrer" className="mt-8 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-pro-line bg-pro-panel/70 px-4 font-pro text-sm font-semibold text-white transition hover:border-pro-mist/50">
                  Probar la vista del asistente en vivo <ArrowUpRight className="size-4" />
                </a>
                {PRO_SALES_EMAIL && (
                  <p className="mt-4 text-sm text-pro-mist">
                    ¿Preferís escribirnos?{" "}
                    <a href={`mailto:${PRO_SALES_EMAIL}`} className="font-semibold text-white underline-offset-4 hover:underline">
                      {PRO_SALES_EMAIL}
                    </a>
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-pro-line-light bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.3)] sm:p-8">
                <ProDemoForm source="pro · formulario" />
              </div>
            </div>
          </ProSection>
        </main>
        <ProFooter />
      </div>
    </ProDemoProvider>
  );
}
