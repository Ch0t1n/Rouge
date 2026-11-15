"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "../core/gsap";
import { useEntry } from "../core/entry";
import { Magnetic } from "../fx/Magnetic";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = now?.getHours() ?? 0;
  // "Horario de fiesta": de 23 a 7 la pista está abierta.
  const party = h >= 23 || h < 7;
  return (
    <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
      <p>Hora local</p>
      <p className="metric mt-1 text-3xl text-primary tabular-nums">{now ? now.toLocaleTimeString("es-AR", { hour12: false }) : "--:--:--"}</p>
      <p className={party ? "mt-1 text-rouge" : "mt-1"}>{party ? "● La pista está abierta" : "○ Faltan horas para la próxima"}</p>
    </div>
  );
}

/** Cierre monumental: tipografía de borde a borde, reloj, accesos a cada vista y CTA gigante. */
export function Footer() {
  const root = useRef<HTMLElement>(null);
  const { appHref, staffHref, staffClick } = useEntry();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-giant] span", { yPercent: 100, duration: 1.2, ease: "expo.out", stagger: 0.04, scrollTrigger: { trigger: "[data-giant]", start: "top 92%", once: true } });
    },
    { scope: root },
  );

  const links: { label: string; href: string; staff?: boolean }[] = [
    { label: "Landing", href: "/" },
    { label: "App del asistente", href: appHref },
    { label: "Tengo un código", href: "/join" },
    { label: "Panel /admin", href: "/admin", staff: true },
    { label: "Comandas /admin/bar-pos", href: "/admin/bar-pos", staff: true },
    { label: "Pantalla LED /admin/live-wall", href: "/admin/live-wall", staff: true },
  ];

  return (
    <footer ref={root} data-stage="3" className="relative overflow-hidden border-t border-white/10 px-4 pb-6 pt-24 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr_auto] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-rouge">[ 06 {"//"} ESTA NOCHE ]</p>
          <h2 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-7xl">¿Salís hoy?</h2>
          <p className="mt-4 max-w-md rounded-xl bg-background/60 text-muted backdrop-blur-sm">Entrá con el link de tu entrada o armá tu evento en minutos. Todo link tiene su QR.</p>
        </div>
        <nav aria-label="Vistas de la demo" className="grid gap-1 rounded-2xl bg-background/70 p-3 backdrop-blur-md">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.staff ? staffHref(l.href) : l.href}
              onClick={l.staff ? staffClick(l.href) : undefined}
              className="group flex min-h-touch items-center justify-between border-b border-white/10 font-display text-lg font-semibold transition hover:text-rouge"
            >
              {l.label}
              <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          ))}
        </nav>
        <div className="flex items-end justify-between gap-8 lg:flex-col lg:items-end">
          <Clock />
          <Magnetic strength={0.4}>
            <Link
              href={appHref}
              data-cursor="Go"
              className="grid size-40 place-items-center rounded-full bg-rouge p-6 text-center font-display text-lg font-bold uppercase leading-tight text-white shadow-[0_0_80px_rgba(255,30,86,0.6)] transition hover:scale-105 hover:bg-rouge-hover sm:size-48"
            >
              Entrar a la app ahora
            </Link>
          </Magnetic>
        </div>
      </div>

      <p data-giant aria-label="ROUGE® Nightlife OS" className="mt-20 select-none overflow-hidden whitespace-nowrap text-center font-display text-[28vw] font-bold uppercase leading-[0.8] tracking-tighter">
        {"ROUGE®".split("").map((c, i) => (
          <span key={i} aria-hidden className="inline-block text-rouge text-glow-rouge">
            {c}
          </span>
        ))}
      </p>
      <p aria-hidden className="text-outline select-none whitespace-nowrap text-center font-display text-[16.8vw] font-bold uppercase leading-[0.9] tracking-tighter">
        Nightlife OS
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-white/10 pt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        <span>© {new Date().getFullYear()} ROUGE</span>
        <span>+18 · Tomá con moderación</span>
        <span className="ml-auto">La noche, conectada.</span>
      </div>
    </footer>
  );
}
