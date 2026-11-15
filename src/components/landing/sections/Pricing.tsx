"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Plus } from "lucide-react";
import { useEntry } from "../core/entry";
import { SplitReveal } from "../fx/SplitReveal";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Event Pass",
    model: "Fee por fiesta única",
    tone: "rouge" as const,
    features: ["Lobby social por afinidad", "Squads, Rescate y Punto Base", "Plano Pin-Drop 15 min", "QR Drops por Squad", "CRM básico + export CSV"],
    cta: "Crear mi evento",
    next: "/admin/events",
  },
  {
    name: "Club Pro",
    model: "Suscripción mensual + Smart Bar",
    tone: "vip" as const,
    highlight: true,
    features: ["Todo Event Pass", "Comandas de barra sin fila (Kanban + ventanilla)", "Delivery al Pin y a la Mesa VIP", "Text Blasts y Flash Promos ilimitados", "Pantalla Gigante LED y sorteos"],
    cta: "Empezar con Club Pro",
    next: "/admin/events",
  },
  {
    name: "Festival / Enterprise",
    model: "Acuerdo a medida",
    tone: "squad" as const,
    features: ["API v1 para ticketeras: un código por entrada, anulación y check-in", "Claves por evento o por organizador", "Marca blanca parcial", "Equipo con roles: barra, mozos, seguridad", "Soporte dedicado"],
    cta: "Ver la API",
    next: "/api/v1/openapi.json",
  },
];

const FAQ = [
  { q: "¿Tengo que descargar una app?", a: "No. ROUGE es una PWA: abrís el link o el QR de tu entrada y funciona en el navegador. Si querés, la agregás a la pantalla de inicio." },
  { q: "¿Quién ve mi número de teléfono?", a: "Ningún otro asistente. Solo lo usa el equipo del evento en su CRM. Y si bloqueás un número, nunca te revelamos si esa persona tiene cuenta." },
  { q: "¿Qué pasa cuando termina la fiesta?", a: "Efecto Cenicienta: el lobby, el plano y los Squads se cierran a la hora que fijó el organizador. Tus Matches y sus chats quedan para siempre." },
  { q: "¿Cómo me ubican si adentro no hay GPS?", a: "Con el Pin-Drop: tocás el plano real del lugar y tu pin dura 15 minutos. Lo ven solo tu Squad y los Matches que elijas." },
  { q: "¿Cómo se integra con mi ticketera?", a: "Con la API v1: generás un código de 1 uso por entrada (idempotente), lo anulás si hay reembolso y consultás el check-in. Cada código tiene su QR listo para el mail." },
  { q: "¿Cómo cobra ROUGE?", a: "Según tu operación: fee por evento, por asistente activo o comisión sobre barra y VIP. ROUGE gana cuando tu fiesta funciona." },
  { q: "¿Los datos del CRM son míos?", a: "Sí: tus asistentes, su consumo y sus Smart Tags se exportan a CSV cuando quieras. Las conexiones entre asistentes son privadas y el staff no las ve." },
];

const TONE = {
  rouge: { text: "text-rouge", border: "border-rouge/40", btn: "bg-rouge text-white hover:bg-rouge-hover" },
  vip: { text: "text-vip", border: "border-vip/60", btn: "bg-vip text-background hover:bg-vip-hover" },
  squad: { text: "text-squad", border: "border-squad/40", btn: "bg-squad text-background hover:bg-squad-hover" },
};

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-white/10 rounded-2xl border-y border-white/10 bg-background/70 px-4 backdrop-blur-md sm:px-6">
      {FAQ.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex min-h-[72px] w-full items-center gap-4 py-4 text-left">
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 font-display text-lg font-semibold sm:text-2xl">{f.q}</span>
              <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.3 }} className={cn("grid size-10 shrink-0 place-items-center rounded-full border", isOpen ? "border-rouge bg-rouge text-white" : "border-white/20")}>
                <Plus className="size-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
                  <p className="max-w-2xl pb-6 pl-9 text-muted">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function Pricing() {
  const { staffHref } = useEntry();
  return (
    <section id="planes" data-stage="3" className="relative scroll-mt-20 px-4 py-28 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">[ 05 {"//"} MODELOS DE CONTRATACIÓN ]</p>
      <SplitReveal lines={["ELEGÍ CÓMO", { text: "ARRANCAR.", className: "text-outline" }]} className="mt-4 font-display text-[14vw] font-bold uppercase leading-[0.84] tracking-tighter lg:text-[8vw]" />

      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const t = TONE[p.tone];
          const api = p.next.startsWith("/api");
          return (
            <article key={p.name} className={cn("relative flex flex-col rounded-[2rem] border bg-surface/80 p-7 backdrop-blur-xl", t.border, p.highlight && "lg:-translate-y-4 shadow-[0_0_90px_rgba(255,184,0,0.16)]")}>
              {p.highlight && <span className="absolute -top-3 left-7 rounded-full bg-vip px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-background">Para clubs</span>}
              <p className={cn("font-mono text-xs uppercase tracking-[0.2em]", t.text)}>{p.model}</p>
              <h3 className="mt-3 font-display text-4xl font-bold uppercase tracking-tighter">{p.name}</h3>
              <ul className="mt-6 grid gap-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className={cn("mt-0.5 size-4 shrink-0", t.text)} /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                {api ? (
                  <a href={p.next} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl font-display font-semibold transition", t.btn)}>
                    {p.cta} <ArrowRight className="size-4" />
                  </a>
                ) : (
                  <Link href={staffHref(p.next)} className={cn("inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl font-display font-semibold transition", t.btn)}>
                    {p.cta} <ArrowRight className="size-4" />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-muted">Precio a medida según capacidad y operación: fee por evento, por asistente activo o comisión sobre barra y VIP.</p>

      <div className="mt-24 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">[ FAQ ]</p>
          <h3 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-6xl">Preguntas de la noche.</h3>
        </div>
        <Faq />
      </div>
    </section>
  );
}
