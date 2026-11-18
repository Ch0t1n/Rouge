"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Building2, Check, Coffee, Presentation, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRO_USE_CASES } from "./content";
import { ProHeading, ProSection, Soon } from "./ProSection";

const ICONS: Record<string, React.ReactNode> = {
  summits: <Presentation className="size-4" />,
  expos: <Store className="size-4" />,
  offsites: <Coffee className="size-4" />,
  coworks: <Building2 className="size-4" />,
};

/** Pestañas accesibles (flechas ←/→, Inicio/Fin) con cómo se adapta ROUGE PRO a cada formato. */
export function ProUseCases() {
  const [active, setActive] = useState(PRO_USE_CASES[0].id);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = PRO_USE_CASES.findIndex((c) => c.id === active);
  const c = PRO_USE_CASES[idx];

  const onKey = (e: KeyboardEvent) => {
    const last = PRO_USE_CASES.length - 1;
    const next = e.key === "ArrowRight" ? (idx === last ? 0 : idx + 1) : e.key === "ArrowLeft" ? (idx === 0 ? last : idx - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(PRO_USE_CASES[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <ProSection id="casos" tone="light" labelledBy="pro-casos">
      <ProHeading id="pro-casos" tone="light" kicker="Casos de uso" title="Un mismo sistema, cuatro formatos" text="Elegí tu formato y mirá qué activamos para tu evento." />
      <div role="tablist" aria-label="Formatos de evento" onKeyDown={onKey} className="no-scrollbar -mx-4 mt-10 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {PRO_USE_CASES.map((u, i) => (
          <button
            key={u.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`case-tab-${u.id}`}
            type="button"
            role="tab"
            aria-selected={active === u.id}
            aria-controls={`case-panel-${u.id}`}
            tabIndex={active === u.id ? 0 : -1}
            onClick={() => setActive(u.id)}
            className={cn(
              "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-4 font-pro text-sm font-semibold transition",
              active === u.id ? "border-pro-ink bg-pro-ink text-white" : "border-pro-line-light bg-white text-pro-ink-soft hover:border-pro-mist hover:text-pro-ink",
            )}
          >
            {ICONS[u.id]} {u.label}
          </button>
        ))}
      </div>
      <div id={`case-panel-${c.id}`} role="tabpanel" aria-labelledby={`case-tab-${c.id}`} className="mt-6 grid gap-8 rounded-2xl border border-pro-line-light bg-white p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h3 className="font-pro text-2xl font-bold tracking-[-0.02em] sm:text-3xl">{c.title}</h3>
          <p className="mt-3 text-pro-ink-soft">{c.text}</p>
          <div className="mt-8 inline-flex items-baseline gap-3 rounded-xl border border-pro-line-light bg-pro-alabaster px-5 py-4">
            <span className="font-pro-mono text-3xl font-semibold text-pro-cobalt">{c.metric.value}</span>
            <span className="text-sm text-pro-ink-soft">{c.metric.label}</span>
          </div>
        </div>
        <ul className="grid content-start gap-3">
          {c.points.map((p) => (
            <li key={p.text} className="flex items-start gap-3 rounded-xl border border-pro-line-light px-4 py-3.5 text-sm">
              <Check className={cn("mt-0.5 size-4 shrink-0", p.soon ? "text-pro-mist" : "text-pro-emerald")} />
              <span className={cn(p.soon && "text-pro-ink-soft")}>
                {p.text}
                {p.soon && <Soon />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ProSection>
  );
}
