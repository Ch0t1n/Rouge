"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, Laptop, MonitorPlay, RotateCcw, Smartphone, Tv } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { DEMO_SCENARIOS, demoRoles, demoScript, openAs, type DemoRole } from "@/lib/demo/script";
import type { DemoScenario } from "@/lib/mock/seed";
import { activeEvent } from "@/lib/engine/selectors";
import { eventTypeOf } from "@/lib/engine/eventType";
import { ShareButton } from "@/components/share/ShareSheet";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL;

type View = { role: DemoRole; path?: string; title: string; text: string; tone: "rouge" | "squad" | "vip" };

/** Accesos directos: cada vista abre en una pestaña nueva, ya "como" esa persona. */
const VIEWS: View[] = [
  { role: "asistente", title: "App del asistente", text: "Sofía: lobby, Squad, plano, barra y perks.", tone: "rouge" },
  { role: "amiga", title: "Segunda asistente", text: "Camila, del mismo Squad: para mostrar el rescate y el chat en vivo.", tone: "squad" },
  { role: "duena", title: "Panel de la dueña", text: "Resumen con ventas, accesos, CRM, avisos y sorteos.", tone: "vip" },
  { role: "barra", title: "Barra / comandas", text: "Kanban de pedidos y ventanilla rápida con QR.", tone: "vip" },
  { role: "seguridad", title: "Seguridad", text: "Alertas de rescate en vivo con la ubicación en el plano.", tone: "squad" },
  { role: "seguridad", path: "/admin/door", title: "Puerta", text: "Escáner de entradas y pases con foto y edad, desde el celular.", tone: "squad" },
  { role: "rrpp", title: "RRPP", text: "Link y QR propios para invitar y cuánta gente entró por cada RRPP.", tone: "vip" },
  { role: "duena", path: "/admin/live-wall", title: "Pantalla LED", text: "Para la TV o el proyector del lugar (pantalla completa).", tone: "rouge" },
];

const VIEWS_CORPORATE: View[] = [
  { role: "asistente", title: "App del invitado", text: "Sofía, diseñadora: agenda, networking por áreas, catering y perks.", tone: "rouge" },
  { role: "amiga", title: "Compañera de equipo", text: "Camila, del mismo equipo: para mostrar el rescate y el chat en vivo.", tone: "squad" },
  { role: "duena", title: "Panel de la organizadora", text: "Resumen, acreditaciones, CRM con empresa y cargo, avisos y sorteos.", tone: "vip" },
  { role: "duena", path: "/admin/door", title: "Acreditación", text: "Escáner de invitaciones con foto y nombre, desde el celular.", tone: "squad" },
  { role: "barra", title: "Catering / comandas", text: "Pedidos de café, tragos y comida con retiro por QR.", tone: "vip" },
  { role: "seguridad", title: "Seguridad", text: "Alertas de rescate del after office con la ubicación en el plano.", tone: "squad" },
  { role: "duena", path: "/admin/live-wall", title: "Pantalla LED", text: "Para la pantalla del plenario: agenda, sorteos y actividad en vivo.", tone: "rouge" },
];

const TONE = { rouge: "bg-rouge/15 text-rouge", squad: "bg-squad/15 text-squad", vip: "bg-vip/15 text-vip" } as const;

export function DemoHub() {
  const { mode, state, resetDemo, notify } = useRouge();
  const scenario: DemoScenario = eventTypeOf(activeEvent(state));
  const roles = demoRoles(scenario);
  const script = demoScript(scenario);
  const views = scenario === "corporate" ? VIEWS_CORPORATE : VIEWS;

  if (mode !== "demo")
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 text-center">
        <div className="glass rounded-3xl p-8">
          <MonitorPlay className="mx-auto size-10 text-vip" />
          <h1 className="mt-4 text-2xl">La demo en vivo corre en el sitio de demostración</h1>
          <p className="mt-2 text-sm text-muted">Este sitio está conectado a datos reales. La fiesta de ejemplo, las personas y los roles para mostrar están en la versión de demostración.</p>
          {DEMO_URL ? (
            <a href={`${DEMO_URL.replace(/\/$/, "")}/demo`} className={cn(buttonVariants({ variant: "vip", block: true }), "mt-6")}>
              Ir a la demo <ArrowUpRight />
            </a>
          ) : (
            <p className="mt-4 text-xs text-muted">Configurá NEXT_PUBLIC_DEMO_URL con la URL del despliegue de demostración.</p>
          )}
        </div>
      </main>
    );

  const reset = () => {
    resetDemo();
    notify({ tone: "squad", title: "Demo reiniciada", description: "El evento vuelve al estado inicial en todas las pestañas." });
  };
  const switchTo = (next: DemoScenario) => {
    if (next === scenario) return;
    resetDemo(next);
    notify({ tone: "squad", title: next === "corporate" ? "💼 Evento corporativo listo" : "🪩 Fiesta lista", description: "Las vistas que abras ahora muestran este escenario. Cerrá las pestañas viejas." });
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span className="font-display text-xl font-bold tracking-tight text-rouge text-glow-rouge">ROUGE</span>
          <Badge tone="vip" size="md">Demo para anfitriones</Badge>
          <div className="ml-auto flex flex-wrap gap-2">
            <ShareButton size="sm" label="Compartir" target={{ url: "/demo", title: "Demo en vivo de ROUGE", text: "Mirá ROUGE en vivo: la app de la fiesta y el panel del organizador.", fileName: "rouge-demo", accent: "vip" }} />
            <Link href="/demo/presentador" className={buttonVariants({ size: "sm", variant: "vip" })}>
              <MonitorPlay /> Modo presentador
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
        <section className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-tight [text-wrap:balance] sm:text-5xl">
              Mostrá ROUGE en vivo <span className="text-rouge">en 7 minutos.</span>
            </h1>
            <p className="mt-4 max-w-xl text-muted">
              {scenario === "corporate"
                ? "Un kickoff de empresa funcionando ahora mismo: invitados con empresa y cargo, agenda, networking por áreas, catering y el equipo completo. Seguí el guion, abrí cada vista con un toque y, si hay pantalla, sumá la LED."
                : "Una fiesta de ejemplo funcionando ahora mismo: asistentes, Squads, pedidos y el equipo completo. Seguí el guion, abrí cada vista con un toque y, si tenés una TV, sumá la Pantalla LED."}
            </p>
            <div className="mt-6" role="radiogroup" aria-label="Escenario de la demo">
              <p className="mb-2 text-sm text-muted">¿A quién se la mostrás?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEMO_SCENARIOS.map((o) => {
                  const on = o.value === scenario;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => switchTo(o.value)}
                      className={cn(
                        "flex min-h-[64px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                        on ? "border-vip bg-vip/15 text-primary" : "border-white/10 bg-white/[0.03] text-primary/85 hover:border-white/20",
                      )}
                    >
                      <span className="text-2xl" aria-hidden>
                        {o.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display font-semibold">{o.label}</span>
                        <span className="block text-xs text-muted">{o.pitch}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="glass rounded-3xl p-5">
            <p className="font-display font-semibold">Antes de empezar</p>
            <ul className="mt-3 space-y-2.5 text-sm text-muted">
              <li className="flex gap-2.5">
                <Laptop className="mt-0.5 size-4 shrink-0 text-squad" />
                <span>
                  Notebook con el <b className="text-primary">Modo presentador</b>: teléfono y panel lado a lado.
                </span>
              </li>
              <li className="flex gap-2.5">
                <Tv className="mt-0.5 size-4 shrink-0 text-vip" />
                <span>Opcional: TV por HDMI con la Pantalla LED.</span>
              </li>
              <li className="flex gap-2.5">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-rouge" />
                <span>Todo se sincroniza entre pestañas de este navegador (no entre dos teléfonos distintos).</span>
              </li>
            </ul>
            <Button variant="glass" block className="mt-4" onClick={reset}>
              <RotateCcw /> Reiniciar la demo
            </Button>
          </div>
        </section>

        <section aria-labelledby="guion">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="guion" className="text-2xl">Guion</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Clock3 className="size-4" /> 7 minutos · cada paso abre la vista justa
            </p>
          </div>
          <ol className="mt-5 grid gap-3">
            {script.map((s, i) => {
              const panel = roles[s.panelRole];
              return (
                <li key={s.title} className="glass grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-3xl p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
                  <span className="grid size-10 place-items-center rounded-2xl bg-rouge/15 font-display text-lg font-bold text-rouge">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold">
                      {s.title} <span className="font-sans text-xs font-normal text-muted">{s.minutes}</span>
                    </p>
                    <p className="mt-1.5 text-[15px] text-primary/90">“{s.say}”</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted">
                      {s.do.map((d) => (
                        <li key={d}>· {d}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-1 md:w-52 md:grid-cols-1">
                    <a href={openAs("asistente", s.phone)} target="_blank" rel="noopener" className={cn(buttonVariants({ size: "sm", variant: "glass" }), "justify-start")}>
                      <Smartphone /> Teléfono
                    </a>
                    <a href={openAs(s.panelRole, s.panel)} target="_blank" rel="noopener" className={cn(buttonVariants({ size: "sm", variant: "glass" }), "justify-start")}>
                      {panel.emoji} Panel · {panel.label}
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="vistas">
          <h2 id="vistas" className="text-2xl">Abrir cualquier vista</h2>
          <p className="mt-1 text-sm text-muted">Cada una abre en una pestaña nueva, ya con la persona correcta. Sin contraseñas.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {views.map((v) => {
              const r = roles[v.role];
              return (
                <li key={v.title}>
                  <a href={openAs(v.role, v.path)} target="_blank" rel="noopener" className="glass group flex min-h-[96px] items-center gap-4 rounded-3xl p-5 transition hover:bg-white/10">
                    <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-2xl", TONE[v.tone])} aria-hidden>
                      {v.path === "/admin/live-wall" ? "📺" : v.path === "/admin/door" ? "🚪" : r.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-semibold">{v.title}</span>
                      <span className="block text-sm text-muted">{v.text}</span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted transition group-hover:text-primary" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
