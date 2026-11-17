"use client";

import { useMemo, useState } from "react";
import { Activity, Table2 } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { CURVE_BUCKET_MIN, liveComparison, type CurvePoint } from "@/lib/engine/analytics";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";

/**
 * Tablero minuto a minuto: ingresos en puerta y ventas de barra de ESTA noche en intervalos de 15', contra el promedio
 * de las últimas fechas del boliche. Dos gráficos separados (escalas distintas: nunca doble eje), hover con valores,
 * leyenda + rótulo directo al final de cada línea y vista de tabla accesible.
 */
export function LiveCurvesPanel({ event }: { event: RougeEvent }) {
  const { state } = useRouge();
  const now = useNow(30_000);
  const data = useMemo(() => liveComparison(state, event.id, now), [state, event.id, now]);
  const [table, setTable] = useState(false);
  const delta = (d: number | null) => (d == null ? "sin historial" : `${d > 0 ? "+" : ""}${d}% vs. promedio`);
  return (
    <Panel
      title={<span className="flex items-center gap-2"><Activity className="size-5 text-squad" /> Minuto a minuto</span>}
      action={
        <button type="button" onClick={() => setTable((t) => !t)} aria-pressed={table} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-xs font-semibold text-muted hover:text-primary">
          <Table2 className="size-3.5" /> {table ? "Ver gráfico" : "Ver tabla"}
        </button>
      }
    >
      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Ritmo de ingreso (últimos ${CURVE_BUCKET_MIN}')`} value={`${data.pace.last15}`} sub={data.historyCount ? `promedio ${data.pace.avgLast15}` : "—"} />
        <Kpi label="Ingresos acumulados" value={`${data.entries.now}`} sub={delta(data.entries.deltaPct)} />
        <Kpi label="Ventas de barra" value={formatMoney(data.sales.now)} sub={delta(data.sales.deltaPct)} />
        <Kpi label="Ticket promedio" value={formatMoney(data.avgTicket)} sub="pedidos de la noche" />
      </dl>
      {table ? (
        <CurveTable event={event} current={data.current} average={data.average} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <LineChart title="Ingresos en puerta" unit="personas" event={event} current={data.current} average={data.average} field="entries" color="#00F0FF" format={(v) => `${Math.round(v)}`} />
          <LineChart title="Ventas de barra" unit="$" event={event} current={data.current} average={data.average} field="sales" color="rgb(var(--c-vip))" format={(v) => formatMoney(v)} />
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {data.historyCount ? `Promedio de las últimas ${data.historyCount} fechas de tu organización, alineadas a la hora de inicio.` : "Cuando tengas fechas anteriores terminadas, acá vas a ver su promedio para comparar."}
      </p>
    </Panel>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="metric mt-1 text-2xl text-primary">{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </div>
  );
}

const W = 560;
const H = 220;
const PAD = { l: 52, r: 64, t: 12, b: 28 };

function LineChart({ title, unit, event, current, average, field, color, format }: { title: string; unit: string; event: RougeEvent; current: CurvePoint[]; average: CurvePoint[]; field: "entries" | "sales"; color: string; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = [...current, ...average];
  const minM = Math.min(...all.map((p) => p.m), -60);
  const maxM = Math.max(...all.map((p) => p.m), 0);
  const maxV = Math.max(1, ...all.map((p) => p[field])) * 1.1;
  const x = (m: number) => PAD.l + ((m - minM) / Math.max(1, maxM - minM)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / maxV) * (H - PAD.t - PAD.b);
  const path = (pts: CurvePoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.m).toFixed(1)},${y(p[field]).toFixed(1)}`).join(" ");
  const clock = (m: number) => formatTime(new Date(+new Date(event.starts_at) + m * 60_000).toISOString());
  const ticks = [0, 0.5, 1].map((f) => maxV * f);
  const xTicks = Array.from(new Set(all.map((p) => p.m))).filter((m) => m % 60 === 0);
  const lastCur = current.at(-1);
  const lastAvg = average.at(-1);
  const hoverM = hover;
  const cur = hoverM != null ? current.find((p) => p.m === hoverM) : undefined;
  const avg = hoverM != null ? average.find((p) => p.m === hoverM) : undefined;
  const ms = Array.from(new Set(all.map((p) => p.m))).sort((a, b) => a - b);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-3 text-xs text-muted" aria-label="Leyenda">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: color }} /> Esta noche</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted" /> Promedio</span>
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}: esta noche vs. promedio, en intervalos de 15 minutos`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[10px]">{field === "sales" ? `${Math.round(t / 1000)}k` : Math.round(t)}</text>
            </g>
          ))}
          {xTicks.map((m) => (
            <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">{clock(m)}</text>
          ))}
          <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 3" />
          {average.length > 1 && <path d={path(average)} fill="none" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />}
          {current.length > 1 && <path d={path(current)} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {lastCur && <circle cx={x(lastCur.m)} cy={y(lastCur[field])} r={4} style={{ fill: color }} stroke="#121216" strokeWidth={2} />}
          {/* Rótulos directos al final de cada línea (texto en tinta, no en el color de la serie) */}
          {lastCur && <text x={x(lastCur.m) + 8} y={y(lastCur[field]) + 4} className="fill-primary text-[10px] font-semibold">Hoy</text>}
          {lastAvg && <text x={Math.min(x(lastAvg.m) + 6, W - 4)} y={y(lastAvg[field]) + 4} textAnchor={x(lastAvg.m) + 40 > W ? "end" : "start"} className="fill-muted text-[10px]">Prom.</text>}
          {hoverM != null && <line x1={x(hoverM)} x2={x(hoverM)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.35)" />}
          {/* Zonas de hover más anchas que la marca */}
          {ms.map((m, i) => {
            const next = ms[i + 1] ?? m + CURVE_BUCKET_MIN;
            const prev = ms[i - 1] ?? m - CURVE_BUCKET_MIN;
            const x0 = (x(prev) + x(m)) / 2;
            const x1 = (x(m) + x(next)) / 2;
            return <rect key={m} x={x0} y={PAD.t} width={Math.max(1, x1 - x0)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(m)} onFocus={() => setHover(m)} tabIndex={-1} />;
          })}
        </svg>
        {hoverM != null && (
          <div role="tooltip" className="pointer-events-none absolute top-1 rounded-xl border border-white/10 bg-surface/95 px-3 py-2 text-xs shadow-sheet" style={{ left: `${Math.min(70, (x(hoverM) / W) * 100)}%` }}>
            <p className="font-semibold">{clock(hoverM)}–{clock(hoverM + CURVE_BUCKET_MIN)}</p>
            <p className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: color }} /> Hoy: <b>{cur ? format(cur[field]) : "—"}</b></p>
            <p className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full bg-muted" /> Promedio: {avg ? format(avg[field]) : "—"}</p>
          </div>
        )}
      </div>
      <p className="sr-only">Unidad: {unit}</p>
    </figure>
  );
}

function CurveTable({ event, current, average }: { event: RougeEvent; current: CurvePoint[]; average: CurvePoint[] }) {
  const ms = Array.from(new Set([...current, ...average].map((p) => p.m))).sort((a, b) => a - b);
  const clock = (m: number) => formatTime(new Date(+new Date(event.starts_at) + m * 60_000).toISOString());
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="py-2 pr-3">Intervalo</th>
            <th className="px-3 text-right">Ingresos hoy</th>
            <th className="px-3 text-right">Ingresos prom.</th>
            <th className="px-3 text-right">Barra hoy</th>
            <th className="pl-3 text-right">Barra prom.</th>
          </tr>
        </thead>
        <tbody>
          {ms.map((m) => {
            const c = current.find((p) => p.m === m);
            const a = average.find((p) => p.m === m);
            return (
              <tr key={m} className={cn("border-t border-white/5", !c && "text-muted")}>
                <td className="py-1.5 pr-3">{clock(m)}</td>
                <td className="metric px-3 text-right">{c ? c.entries : "—"}</td>
                <td className="px-3 text-right text-muted">{a ? a.entries : "—"}</td>
                <td className="metric px-3 text-right">{c ? formatMoney(c.sales) : "—"}</td>
                <td className="pl-3 text-right text-muted">{a ? formatMoney(a.sales) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
