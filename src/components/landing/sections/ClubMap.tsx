"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flag, Flame, Heart, Users, X } from "lucide-react";
import { SplitReveal } from "../fx/SplitReveal";
import { cn } from "@/lib/utils";

type SectorId = "dj" | "pista" | "barra" | "vip" | "patio" | "barra-patio";
type Filter = "squad" | "match" | "base" | "heat";

/** Sectores del plano demo (coordenadas en % del lienzo). */
const SECTORS: { id: SectorId; label: string; x: number; y: number; w: number; h: number; tone?: "vip" }[] = [
  { id: "dj", label: "Cabina DJ", x: 34, y: 4, w: 32, h: 14 },
  { id: "pista", label: "Pista Principal", x: 22, y: 22, w: 56, h: 40 },
  { id: "barra", label: "Barra Central", x: 3, y: 22, w: 15, h: 52 },
  { id: "vip", label: "VIP", x: 82, y: 22, w: 15, h: 40, tone: "vip" },
  { id: "patio", label: "Patio", x: 50, y: 68, w: 47, h: 28 },
  { id: "barra-patio", label: "Barra Patio", x: 22, y: 78, w: 24, h: 18 },
];

const PINS: { kind: "squad" | "match"; x: number; y: number; who: string }[] = [
  { kind: "squad", x: 40, y: 38, who: "Meli" },
  { kind: "squad", x: 46, y: 44, who: "Cami" },
  { kind: "squad", x: 62, y: 80, who: "Juli" },
  { kind: "match", x: 64, y: 34, who: "Mateo" },
  { kind: "match", x: 89, y: 40, who: "Lucas" },
];

const BASE = { x: 88, y: 52 };
const HEAT: { x: number; y: number; level: number }[] = [
  { x: 10, y: 48, level: 1 },
  { x: 34, y: 87, level: 0.35 },
];

const FILTERS: { id: Filter; label: string; cls: string; icon: typeof Users }[] = [
  { id: "squad", label: "Ver Pines de mi Squad", cls: "border-squad/50 text-squad data-[on=true]:bg-squad data-[on=true]:text-background", icon: Users },
  { id: "match", label: "Ver Matches", cls: "border-rouge/50 text-rouge data-[on=true]:bg-rouge data-[on=true]:text-white", icon: Heart },
  { id: "base", label: "Ver Punto Base VIP", cls: "border-vip/50 text-vip data-[on=true]:bg-vip data-[on=true]:text-background", icon: Flag },
  { id: "heat", label: "Ver Mapa de Calor de Barras", cls: "border-white/25 text-primary data-[on=true]:bg-white data-[on=true]:text-background", icon: Flame },
];

/** Datos "en vivo" del demo: varían cada pocos segundos para que el plano respire. */
function useLive() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((v) => v + 1), 3000);
    return () => window.clearInterval(id);
  }, []);
  const wob = (base: number, amp: number, k: number) => base + Math.round(Math.sin(t * 0.9 + k) * amp);
  return {
    dj: { now: "Mia K — Techno", next: "03:30 · Dúo Fractal", votes: wob(214, 9, 1) },
    pista: { people: wob(612, 24, 2), squads: wob(38, 3, 3), mood: "🔥 A full" },
    barra: { wait: Math.max(1, wob(9, 3, 4)), orders: wob(41, 4, 5) },
    vip: { table: "Mesa 4 · Squad Los Pibes", vaquita: `${Math.min(5, Math.max(3, wob(4, 1, 6)))}/5 pagaron` },
    patio: { people: wob(188, 12, 7), squad: 1 },
    "barra-patio": { wait: Math.max(1, wob(2, 1, 8)), promo: "2x1 en gin hasta 02:00" },
  };
}

function SectorCard({ id, live, onClose }: { id: SectorId; live: ReturnType<typeof useLive>; onClose: () => void }) {
  const sector = SECTORS.find((s) => s.id === id)!;
  type Row = [string, string, string?];
  const table: Record<SectorId, Row[]> = {
    dj: [["Ahora", live.dj.now], ["Sigue", live.dj.next], ["Votos al DJ", String(live.dj.votes), "text-rouge"]],
    pista: [["Personas", String(live.pista.people)], ["Squads activos", String(live.pista.squads), "text-squad"], ["Mood dominante", live.pista.mood]],
    barra: [["Espera", `${live.barra.wait} min`, live.barra.wait > 7 ? "text-rouge" : "text-squad"], ["Pedidos / 15 min", String(live.barra.orders)], ["Sugerencia", "Flash Promo → Barra Patio", "text-vip"]],
    vip: [["Reserva", live.vip.table], ["Vaquita", live.vip.vaquita, "text-vip"], ["Punto Base", "Bandera dorada activa", "text-vip"]],
    patio: [["Personas", String(live.patio.people)], ["De tu Squad", `${live.patio.squad} (Juli)`, "text-squad"], ["Pin vence en", "11 min"]],
    "barra-patio": [["Espera", `${live["barra-patio"].wait} min`, "text-squad"], ["Promo activa", live["barra-patio"].promo, "text-vip"], ["Retiro", "Fast-Pickup QR"]],
  };
  const rows = table[id];
  const left = sector.x + sector.w / 2 > 55;
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className={cn("glass absolute top-3 z-20 w-[min(280px,80%)] rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)]", left ? "left-3" : "right-3")}
      role="status"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-rouge align-middle" />
          En vivo
        </p>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/5">
          <X className="size-4" />
        </button>
      </div>
      <p className="font-display text-xl font-bold">{sector.label}</p>
      <dl className="mt-3 grid gap-2">
        {rows.map(([k, v, c]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-2 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className={cn("text-right font-display font-semibold", c)}>{v}</dd>
          </div>
        ))}
      </dl>
    </motion.div>
  );
}

/** "Tocá el club": plano miniatura interactivo con filtros y tarjetas por sector. */
export function ClubMap() {
  const [on, setOn] = useState<Record<Filter, boolean>>({ squad: true, match: true, base: true, heat: false });
  const [sel, setSel] = useState<SectorId | null>("pista");
  const live = useLive();
  const toggle = (f: Filter) => setOn((s) => ({ ...s, [f]: !s[f] }));

  return (
    <section id="plano" data-stage="2" className="relative scroll-mt-20 px-4 py-28 sm:px-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-squad">[ 02 {"//"} DEMO EN VIVO ]</p>
          <SplitReveal lines={["TOCÁ", { text: "EL CLUB.", className: "text-squad text-glow-squad" }]} className="mt-4 font-display text-[16vw] font-bold uppercase leading-[0.84] tracking-tighter lg:text-[9vw]" />
        </div>
        <p className="max-w-sm text-muted lg:pb-4">Así ve el plano un asistente. Prendé y apagá capas, y tocá un sector para ver qué está pasando ahí ahora.</p>
      </div>

      <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Capas del plano">
        {FILTERS.map(({ id, label, cls, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={on[id]}
            data-on={on[id]}
            onClick={() => toggle(id)}
            className={cn("inline-flex min-h-touch items-center gap-2 rounded-full border px-4 font-display text-sm font-semibold transition", cls)}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="relative mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-surface-sunken/80 backdrop-blur-md">
        <div className="relative aspect-[4/5] sm:aspect-[16/9]">
          {/* grilla holográfica */}
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />
          {/* mapa de calor */}
          <AnimatePresence>
            {on.heat &&
              HEAT.map((h, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 0.35 + h.level * 0.55, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="absolute size-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
                  style={{ left: `${h.x}%`, top: `${h.y}%`, background: `radial-gradient(circle, rgba(255,30,86,${h.level}) 0%, rgba(255,184,0,${h.level * 0.6}) 40%, transparent 70%)` }}
                />
              ))}
          </AnimatePresence>
          {SECTORS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-cursor="Ver"
              onClick={() => setSel((v) => (v === s.id ? null : s.id))}
              aria-pressed={sel === s.id}
              className={cn(
                "absolute rounded-xl border text-left transition duration-300",
                s.tone === "vip" ? "border-vip/40 bg-vip/[0.06]" : "border-white/15 bg-white/[0.025]",
                sel === s.id ? "border-squad bg-squad/10 shadow-[inset_0_0_40px_rgba(0,240,255,0.15)]" : "hover:border-white/40 hover:bg-white/[0.05]",
              )}
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}
            >
              <span className={cn("absolute left-2 top-2 font-mono text-[9px] uppercase tracking-[0.15em] sm:text-[11px]", s.tone === "vip" ? "text-vip" : "text-muted")}>{s.label}</span>
              {on.heat && (s.id === "barra" || s.id === "barra-patio") && (
                <span className={cn("absolute bottom-2 left-2 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold", s.id === "barra" ? "bg-rouge text-white" : "bg-squad text-background")}>
                  {s.id === "barra" ? `${live.barra.wait} min` : `${live["barra-patio"].wait} min`}
                </span>
              )}
            </button>
          ))}
          {/* pines */}
          {PINS.filter((p) => on[p.kind]).map((p) => (
            <span key={p.who} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <span className={cn("absolute inset-0 animate-pin-pulse rounded-full", p.kind === "squad" ? "bg-squad" : "bg-rouge")} />
              <span className={cn("relative block size-3.5 rounded-full ring-2 ring-background sm:size-4", p.kind === "squad" ? "bg-squad shadow-glow-squad" : "bg-rouge shadow-glow-rouge")} />
              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap font-display text-[10px] font-semibold sm:text-xs">{p.who}</span>
            </span>
          ))}
          {on.base && (
            <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={{ left: `${BASE.x}%`, top: `${BASE.y}%` }}>
              <Flag className="size-6 fill-vip/40 text-vip drop-shadow-[0_0_10px_rgba(255,184,0,0.8)]" />
            </span>
          )}
          <AnimatePresence mode="wait">{sel && <SectorCard id={sel} live={live} onClose={() => setSel(null)} />}</AnimatePresence>
          <p className="absolute bottom-3 right-4 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted sm:block">Neon Sunday · plano subido por el organizador</p>
        </div>
      </div>
    </section>
  );
}
