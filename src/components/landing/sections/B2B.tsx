"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Megaphone, MessageCircle, Tv, Users, X } from "lucide-react";
import { gsap } from "../core/gsap";
import { SplitReveal } from "../fx/SplitReveal";
import { cn, formatMoney } from "@/lib/utils";

const COMPARE = {
  before: ["Público prestado: la data queda en la ticketera o en redes", "Filas de 20 minutos que cortan el consumo", "Grupos que se pierden y se van temprano", "Promos a ciegas para todo el boliche"],
  after: ["Tu propio CRM con cada asistente y su consumo", "Pedidos desde la pista y retiro por QR", "Squads que llegan juntos y se quedan más", "Avisos segmentados por zona, mood y Squad"],
};

const TABS = [
  { id: "crm", label: "CRM & Top Spenders", icon: Users },
  { id: "blast", label: "Text Blast por Zona", icon: Megaphone },
  { id: "led", label: "Pantalla Gigante LED", icon: Tv },
] as const;
type TabId = (typeof TABS)[number]["id"];

const CRM_ROWS = [
  { name: "Sofía R.", tag: "Top Spender", phone: "+54 9 11 5•••-•821", spent: 86500, squad: "Las Pibas" },
  { name: "Mateo G.", tag: "Squad Leader", phone: "+54 9 11 6•••-•114", spent: 64200, squad: "After Crew" },
  { name: "Meli P.", tag: "Recurrente", phone: "+54 9 11 4•••-•397", spent: 51800, squad: "Las Pibas" },
  { name: "Lucas D.", tag: "VIP", phone: "+54 9 11 3•••-•002", spent: 47300, squad: "Mesa 4" },
  { name: "Cami B.", tag: "Primera vez", phone: "+54 9 11 2•••-•665", spent: 18900, squad: "—" },
];

function CrmPanel() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs text-muted">🔍 Buscar asistente…</span>
        {["Top Spender", "Squad Leader", "Recurrente"].map((t) => (
          <span key={t} className="rounded-full bg-vip/15 px-2.5 py-1 text-xs font-semibold text-vip">
            {t}
          </span>
        ))}
        <span className="ml-auto rounded-lg bg-vip px-3 py-2 font-display text-xs font-bold text-background">Exportar CSV</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
            <tr>
              <th className="py-2 font-normal">Asistente</th>
              <th className="font-normal">Smart Tag</th>
              <th className="font-normal">Teléfono</th>
              <th className="font-normal">Squad</th>
              <th className="text-right font-normal">Consumo</th>
            </tr>
          </thead>
          <tbody>
            {CRM_ROWS.map((r) => (
              <tr key={r.name} className="border-t border-white/5">
                <td className="py-2.5 font-semibold">{r.name}</td>
                <td>
                  <span className="rounded-full border border-vip/30 px-2 py-0.5 text-[11px] text-vip">{r.tag}</span>
                </td>
                <td className="font-mono text-xs text-muted">{r.phone}</td>
                <td className="text-muted">{r.squad}</td>
                <td className="metric text-right text-vip">{formatMoney(r.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlastPanel() {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {["Barra Central: colapsada", "Patio: 188 personas", "Mood: 🔥 A full"].map((s, i) => (
            <span key={s} className={cn("rounded-full px-2.5 py-1 font-semibold", i === 0 ? "bg-rouge/15 text-rouge" : "bg-white/[0.06] text-muted")}>
              {s}
            </span>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Flash Promo · 15 min</p>
          <p className="mt-2 font-display text-lg font-semibold">⚡ 2x1 en gin en la Barra Patio hasta las 02:00</p>
          <p className="mt-3 text-sm text-muted">
            Alcance en vivo: <span className="metric text-vip">412</span> asistentes en Pista Principal y Barra Central
          </p>
        </div>
        <ol className="grid gap-2 text-sm text-muted">
          <li>1. Ves en el resumen qué barra está colapsada.</li>
          <li>2. Mandás la promo solo a quienes están cerca de ella.</li>
          <li>3. La otra barra se llena y la fila se vacía.</li>
        </ol>
      </div>
      <div className="mx-auto w-full max-w-[260px] rounded-[2rem] border border-white/10 bg-background p-3">
        <div className="glass rounded-2xl p-3 shadow-glow-vip">
          <p className="flex items-center gap-2 text-xs font-semibold text-vip">
            <MessageCircle className="size-4" /> Aviso del organizador
          </p>
          <p className="mt-1 text-sm">⚡ 2x1 en gin en la Barra Patio hasta las 02:00</p>
        </div>
      </div>
    </div>
  );
}

function LedPanel() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black p-6">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,30,86,0.25),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(0,240,255,0.18),transparent_50%)]" />
      <div className="relative grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-rouge/40 bg-rouge/10 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-rouge">Matches de la noche</p>
          <p className="metric mt-2 text-6xl text-rouge text-glow-rouge">147</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Más votados para el DJ</p>
          {["Innerbloom", "Losing It", "Cola"].map((t, i) => (
            <div key={t} className="mt-2 flex items-center gap-2 text-sm">
              <span className="metric w-4 text-squad">{i + 1}</span>
              <span className="flex-1">{t}</span>
              <span className="h-1.5 rounded-full bg-squad" style={{ width: `${60 - i * 15}px` }} />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-vip/40 bg-vip/10 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-vip">Sorteo en vivo</p>
          <p className="mt-2 font-display text-2xl font-bold">🏆 Ganó @meli.house</p>
          <p className="text-sm text-muted">Botella de espumante · retirá en barra</p>
        </div>
      </div>
      <p className="relative mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">/admin/live-wall · se adapta a cualquier proyector</p>
    </div>
  );
}

/** Número que interpola suave hacia el nuevo valor (GSAP sobre un objeto, sin re-render por frame). */
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef({ v: value });
  useEffect(() => {
    const t = gsap.to(current.current, {
      v: value,
      duration: 0.6,
      ease: "power3.out",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = format(current.current.v);
      },
    });
    return () => void t.kill();
  }, [value, format]);
  return <span ref={ref}>{format(value)}</span>;
}

const fmtMoney = (n: number) => formatMoney(Math.round(n));
const fmtInt = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n));

// Supuestos de la calculadora (ilustrativos y a la vista del usuario).
const DRINKS_PER_PERSON = 2.5;
const BAR_UPLIFT = 0.22;
const PEOPLE_PER_TABLE = 120;
const VAQUITA_TABLE_UPLIFT = 0.3;
const TABLE_MIN_DRINKS = 10;
const PROFILE_RATE = 0.65;

function RoiCalculator() {
  const [capacity, setCapacity] = useState(1200);
  const [price, setPrice] = useState(8000);
  const barBase = capacity * DRINKS_PER_PERSON * price;
  const barExtra = barBase * BAR_UPLIFT;
  const extraTables = Math.max(1, Math.round((capacity / PEOPLE_PER_TABLE) * VAQUITA_TABLE_UPLIFT));
  const tablesRevenue = extraTables * TABLE_MIN_DRINKS * price;
  const contacts = capacity * PROFILE_RATE;

  return (
    <div className="grid gap-6 rounded-[2rem] border border-vip/30 bg-surface/80 p-6 backdrop-blur-xl sm:p-9 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-vip">[ CALCULADORA DE ROI ]</p>
        <h3 className="mt-3 font-display text-3xl font-bold uppercase tracking-tighter sm:text-4xl">¿Cuánto deja tu noche?</h3>
        <label className="mt-8 block">
          <span className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Capacidad del evento</span>
            <span className="metric text-2xl">{fmtInt(capacity)} personas</span>
          </span>
          <input type="range" min={300} max={5000} step={50} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="roi-range mt-3 w-full" aria-label="Capacidad del evento" />
        </label>
        <label className="mt-6 block">
          <span className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Precio promedio del trago</span>
            <span className="metric text-2xl">{fmtMoney(price)}</span>
          </span>
          <input type="range" min={3000} max={30000} step={500} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="roi-range mt-3 w-full" aria-label="Precio promedio del trago" />
        </label>
        <p className="mt-6 text-xs text-muted">
          Estimación ilustrativa, no una promesa de resultados. Supuestos: {DRINKS_PER_PERSON} tragos por persona, +{BAR_UPLIFT * 100}% de consumo al eliminar filas, 1 mesa VIP cada {PEOPLE_PER_TABLE} personas con +{VAQUITA_TABLE_UPLIFT * 100}% gracias a la Vaquita (mínimo {TABLE_MIN_DRINKS} tragos por mesa) y {PROFILE_RATE * 100}% de asistentes con perfil activo.
        </p>
      </div>
      <div className="grid gap-3">
        {[
          { k: "Ingresos extra en barra por eliminar filas", v: <AnimatedNumber value={barExtra} format={fmtMoney} />, sub: `+${BAR_UPLIFT * 100}% sobre ${fmtMoney(barBase)} de consumo base`, c: "text-vip" },
          { k: "Mesas VIP adicionales con Vaquita de Squad", v: <AnimatedNumber value={extraTables} format={fmtInt} />, sub: `≈ ${fmtMoney(tablesRevenue)} en mínimos de mesa`, c: "text-rouge" },
          { k: "Contactos calificados en tu propio CRM", v: <AnimatedNumber value={contacts} format={fmtInt} />, sub: "Con consumo, Squad y Smart Tags · exportables", c: "text-squad" },
        ].map((r) => (
          <div key={r.k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-muted">{r.k}</p>
            <p className={cn("metric mt-1 text-4xl sm:text-5xl", r.c)}>{r.v}</p>
            <p className="mt-1 text-xs text-muted">{r.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sección B2B: cambio de ritmo en Amber Gold para dueños de clubs, productoras y festivales. */
export function B2B() {
  const [tab, setTab] = useState<TabId>("crm");
  return (
    <section id="organizadores" data-stage="3" className="relative scroll-mt-20 px-4 py-28 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-vip to-transparent" />
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-vip">[ 04 {"//"} PARA DUEÑOS DE CLUBS, PRODUCTORAS Y FESTIVALES ]</p>
      <SplitReveal
        lines={["DEJÁ DE ALQUILAR PÚBLICO.", { text: "CONSTRUÍ TU COMUNIDAD", className: "text-vip text-glow-vip" }, { text: "Y MULTIPLICÁ TU BARRA.", className: "text-outline" }]}
        className="mt-4 font-display text-[9.5vw] font-bold uppercase leading-[0.88] tracking-tighter lg:text-[6.2vw]"
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-white/10 bg-surface/70 p-7 backdrop-blur-xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Sin Rouge Pass</p>
          <ul className="mt-5 grid gap-3">
            {COMPARE.before.map((t) => (
              <li key={t} className="flex gap-3 text-muted">
                <X className="mt-0.5 size-4 shrink-0 text-rouge" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[2rem] border border-vip/40 bg-vip/[0.07] p-7 shadow-[0_0_80px_rgba(255,184,0,0.12)] backdrop-blur-xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-vip">Con Rouge Pass</p>
          <ul className="mt-5 grid gap-3">
            {COMPARE.after.map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-vip" /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-vip/20 pt-4 text-sm text-muted">
            Cuando la gente conecta de verdad y no pierde a su grupo, la noche sale bien. Y una noche que sale bien es la razón número uno para <span className="text-vip">volver a comprar entrada</span>.
          </p>
        </div>
      </div>

      <div className="mt-16">
        <div role="tablist" aria-label="Panel del organizador" className="flex flex-wrap gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("inline-flex min-h-touch items-center gap-2 rounded-full border px-4 font-display text-sm font-semibold transition", tab === id ? "border-vip bg-vip text-background" : "border-white/15 text-muted hover:text-primary")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <div className="relative mt-4 min-h-[340px] rounded-[2rem] border border-white/10 bg-surface/80 p-5 backdrop-blur-xl sm:p-7" role="tabpanel">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
              {tab === "crm" ? <CrmPanel /> : tab === "blast" ? <BlastPanel /> : <LedPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-16">
        <RoiCalculator />
      </div>
    </section>
  );
}
