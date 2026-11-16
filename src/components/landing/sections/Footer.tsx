"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "../core/gsap";
import { useEntry } from "../core/entry";
import { DEMO_HREF, useAudience } from "../core/audience";
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
  const { appHref, staffHref } = useEntry();
  const org = useAudience() === "organizers";

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-giant] span", { yPercent: 100, duration: 1.2, ease: "expo.out", stagger: 0.04, scrollTrigger: { trigger: "[data-giant]", start: "top 92%", once: true } });
    },
    { scope: root },
  );

  // El público no ve nada de la operación (solo un acceso discreto para el equipo, abajo); los organizadores, todo.
  const links: { label: string; href: string; staff?: boolean; external?: boolean }[] = org
    ? [
        { label: "Ver la demo en vivo", href: DEMO_HREF, external: true },
        { label: "Entrar al panel", href: "/admin", staff: true },
        { label: "Crear mi evento", href: "/admin/events", staff: true },
        { label: "API para ticketeras", href: "/api/v1/openapi.json", external: true },
      ]
    : [
        { label: "Tengo una entrada", href: appHref },
        { label: "Entrar con mi cuenta", href: "/login" },
        { label: "Ingresar un código", href: "/join" },
      ];

  return (
    <footer ref={root} data-stage="3" className="relative overflow-hidden border-t border-white/10 px-4 pb-6 pt-24 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr_auto] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-rouge">[ 06 {"//"} ESTA NOCHE ]</p>
          <h2 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-7xl">{org ? "¿Arrancamos?" : "¿Salís hoy?"}</h2>
          <p className="mt-4 max-w-md rounded-xl bg-background/60 text-muted backdrop-blur-sm">
            {org ? "Mirá la demo en vivo o creá tu evento: link maestro, códigos de 1 uso, RRPP y barra listos en minutos." : "Entrá a tu fiesta con el link o el QR de tu entrada. Sin descargar nada."}
          </p>
        </div>
        <nav aria-label="Accesos" className="grid gap-1 rounded-2xl bg-background/70 p-3 backdrop-blur-md">
          {links.map((l) =>
            l.external ? (
              <a key={l.label} href={l.href} className="group flex min-h-touch items-center justify-between border-b border-white/10 font-display text-lg font-semibold transition hover:text-rouge">
                {l.label}
                <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            ) : (
              <Link
                key={l.label}
                href={l.staff ? staffHref(l.href) : l.href}
                className="group flex min-h-touch items-center justify-between border-b border-white/10 font-display text-lg font-semibold transition hover:text-rouge"
              >
                {l.label}
                <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-end justify-between gap-8 lg:flex-col lg:items-end">
          <Clock />
          <Magnetic strength={0.4}>
            <Link
              href={org ? staffHref("/admin/events") : appHref}
              data-cursor="Go"
              className="grid size-40 place-items-center rounded-full bg-rouge p-6 text-center font-display text-lg font-bold uppercase leading-tight text-white shadow-[0_0_80px_rgba(255,30,86,0.6)] transition hover:scale-105 hover:bg-rouge-hover sm:size-48"
            >
              {org ? "Crear mi evento" : "Entrar a la app ahora"}
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
        {!org && (
          <Link href="/login?as=staff" className="min-h-[32px] content-center hover:text-primary">
            Acceso equipo
          </Link>
        )}
        <span className="ml-auto">La noche, conectada.</span>
      </div>
    </footer>
  );
}
