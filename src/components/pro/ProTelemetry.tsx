"use client";

import { useMemo, useState } from "react";
import { Activity, Download, DoorOpen, Handshake, Users } from "lucide-react";
import { cn, toCSV } from "@/lib/utils";
import { AudienceTag, ProHeading, ProSection, Soon } from "./ProSection";

/** Momentos del evento para el simulador (datos de ejemplo, NO métricas de clientes). */
interface Moment {
  id: string;
  label: string;
  invited: number;
  confirmed: number;
  checkedIn: number;
  meetings: number;
  accepted: number;
  rooms: number[];
}
const MOMENTS: Moment[] = [
  { id: "doors", label: "09:00 · Apertura", invited: 520, confirmed: 468, checkedIn: 142, meetings: 38, accepted: 22, rooms: [40, 15, 0, 25] },
  { id: "morning", label: "11:30 · Keynote", invited: 520, confirmed: 476, checkedIn: 384, meetings: 96, accepted: 71, rooms: [75, 60, 45, 70] },
  { id: "afternoon", label: "15:30 · Ronda de negocios", invited: 520, confirmed: 476, checkedIn: 431, meetings: 188, accepted: 152, rooms: [100, 92, 85, 96] },
  { id: "close", label: "19:00 · Cierre", invited: 520, confirmed: 476, checkedIn: 437, meetings: 214, accepted: 176, rooms: [55, 40, 30, 35] },
];
const ROOMS = ["Directorio A", "Directorio B", "Sala 1", "Sala 2"];

/**
 * Centro de comando del organizador (simulador interactivo con datos de ejemplo): embudo de acreditación, reuniones y
 * ocupación de salas por momento del evento. "Exportar CSV" descarga los datos del simulador, igual que el panel real
 * exporta asistentes y leads.
 */
export function ProTelemetry() {
  const [i, setI] = useState(2);
  const m = MOMENTS[i];
  const funnel = useMemo(
    () => [
      { label: "Invitados", value: m.invited, pct: 100 },
      { label: "Confirmados", value: m.confirmed, pct: Math.round((m.confirmed / m.invited) * 100) },
      { label: "Acreditados en puerta", value: m.checkedIn, pct: Math.round((m.checkedIn / m.invited) * 100) },
    ],
    [m],
  );
  const usage = Math.round(m.rooms.reduce((a, b) => a + b, 0) / m.rooms.length);

  const exportCsv = () => {
    const csv = toCSV(MOMENTS.map((x) => ({ momento: x.label, invitados: x.invited, confirmados: x.confirmed, acreditados: x.checkedIn, reuniones_pedidas: x.meetings, reuniones_aceptadas: x.accepted, ocupacion_salas_pct: Math.round(x.rooms.reduce((a: number, b: number) => a + b, 0) / x.rooms.length) })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rouge-pro-simulacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProSection id="simulador" tone="slate" labelledBy="pro-simulador">
      <AudienceTag audience="organizers" dark />
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <ProHeading id="pro-simulador" tone="dark" kicker="Centro de comando" title="Lo que pasa en tu evento, en tiempo real" text="El panel del organizador, pensado para la PC de producción: acreditación, reuniones y salas minuto a minuto. Mové la línea de tiempo." />
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-pro-line px-3 py-1 font-pro-mono text-[11px] uppercase tracking-wider text-pro-mist lg:self-auto">
          <Activity className="size-3.5 text-pro-emerald" /> Simulador · datos de ejemplo
        </span>
      </div>

      <div className="mt-10 rounded-2xl border border-pro-line bg-pro-navy/80 p-4 sm:p-6">
        <div role="radiogroup" aria-label="Momento del evento" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {MOMENTS.map((x, k) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={k === i}
              onClick={() => setI(k)}
              className={cn("min-h-[40px] shrink-0 rounded-lg border px-3 font-pro-mono text-xs transition", k === i ? "border-pro-sapphire bg-pro-cobalt/20 text-white" : "border-pro-line text-pro-mist hover:text-white")}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Embudo */}
          <div className="rounded-xl border border-pro-line bg-pro-panel/70 p-5 lg:col-span-2">
            <p className="flex items-center gap-2 font-pro font-semibold">
              <DoorOpen className="size-4 text-pro-sapphire" /> Embudo de acreditación
            </p>
            <div className="mt-5 space-y-4">
              {funnel.map((f) => (
                <div key={f.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-pro-mist">{f.label}</span>
                    <span className="font-pro-mono text-white tabular-nums">
                      {f.value} <span className="text-pro-mist">· {f.pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-pro-slate">
                    <div className="h-full rounded-full bg-gradient-to-r from-pro-cobalt to-pro-sapphire transition-[width] duration-700" style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* KPIs */}
          <div className="grid gap-4">
            <Kpi icon={<Handshake className="size-4" />} label="Reuniones 1 a 1" value={`${m.accepted}`} sub={`${m.meetings} pedidas · ${Math.round((m.accepted / m.meetings) * 100)}% aceptadas`} />
            <Kpi icon={<Users className="size-4" />} label="Ocupación de salas" value={`${usage}%`} sub="promedio de las 4 salas" />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-pro-line bg-pro-panel/70 p-5">
          <p className="font-pro font-semibold">Uso por sala</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROOMS.map((r, k) => (
              <li key={r}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{r}</span>
                  <span className="font-pro-mono tabular-nums text-pro-mist">{m.rooms[k]}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-pro-slate">
                  <div className={cn("h-full rounded-full transition-[width] duration-700", m.rooms[k] >= 90 ? "bg-pro-gold" : "bg-pro-emerald")} style={{ width: `${m.rooms[k]}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-pro-mist">
            En el panel real exportás asistentes, empresas y leads en CSV. Reporte ejecutivo en PDF
            <Soon dark />
          </p>
          <button type="button" onClick={exportCsv} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-pro-line bg-pro-panel px-4 font-pro text-sm font-semibold text-white transition hover:border-pro-sapphire">
            <Download className="size-4" /> Exportar CSV de la simulación
          </button>
        </div>
      </div>
    </ProSection>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-pro-line bg-pro-panel/70 p-5">
      <p className="flex items-center gap-2 text-sm text-pro-mist">
        <span className="text-pro-sapphire">{icon}</span> {label}
      </p>
      <p className="mt-2 font-pro-mono text-3xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-pro-mist">{sub}</p>
    </div>
  );
}
