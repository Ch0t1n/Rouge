"use client";

import { useState } from "react";
import { Ban, CalendarCheck, Check, CopyX, Eye, EyeOff, Lock, MessageSquare, ScanLine, Search, ShieldCheck, UserCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudienceTag, ProHeading, ProSection, Soon } from "./ProSection";

// ── Networking & Salas ────────────────────────────────────────────────

const ROOMS = ["Directorio A", "Directorio B", "Sala 1", "Sala 2"] as const;
const SLOTS = ["15:00", "15:15", "15:30", "15:45", "16:00", "16:15"] as const;
/** Ocupación de ejemplo: [sala, franja]. */
const TAKEN = new Set(["Directorio A|15:00", "Directorio A|15:15", "Directorio B|15:30", "Sala 1|16:00", "Sala 2|15:00", "Sala 2|15:45"]);

export function ProNetworking() {
  const [mine, setMine] = useState<string | null>("Directorio B|16:00");
  const [msg, setMsg] = useState<string>("Tocá una franja libre para reservarla.");
  const pick = (room: string, slot: string) => {
    const key = `${room}|${slot}`;
    if (TAKEN.has(key)) {
      setMsg(`${room} ya está reservada a las ${slot}: el sistema no permite la doble reserva.`);
      return;
    }
    setMine(key);
    setMsg(`Reunión propuesta en ${room} a las ${slot} hs. Cuando la otra persona acepta, la sala queda reservada y se abre el chat.`);
  };
  const steps = [
    { icon: <Search className="size-5" />, title: "Recomendación", text: "Cada asistente ve primero a quienes buscan lo que ofrece, y al revés, con su rubro y objetivo del día." },
    { icon: <CalendarCheck className="size-5" />, title: "Solicitud con sala o pin", text: "Motivo, horario de 15 o 30 minutos y lugar: sala con cupo, mesa, un pin en el plano o a definir." },
    { icon: <MessageSquare className="size-5" />, title: "Confirmación", text: "Al aceptar se reserva el lugar, se abre el chat 1 a 1 y la reunión aparece en el mapa de los dos." },
  ];
  return (
    <ProSection id="networking" tone="dark" labelledBy="pro-networking">
      {/* [&>*]:min-w-0: el tablero de salas scrollea dentro de su caja en el celular (no ensancha la grilla). */}
      <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] [&>*]:min-w-0">
        <div>
          <AudienceTag audience="attendees" dark />
          <div className="mt-4" />
          <ProHeading id="pro-networking" tone="dark" kicker="Networking & Salas" title="Reuniones 1 a 1 que se agendan solas" text="Sin planillas compartidas ni salas pisadas: el sistema valida el cupo de cada sala y la agenda de cada asistente." />
          <ol className="mt-10 space-y-5">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-pro-line bg-pro-panel/70 text-pro-gold">{s.icon}</span>
                <div>
                  <p className="font-pro font-semibold">
                    <span className="mr-2 font-pro-mono text-xs text-pro-mist">0{i + 1}</span>
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm text-pro-mist">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-pro-line bg-pro-panel/70 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-pro font-semibold">Disponibilidad de salas</p>
            <div className="flex items-center gap-3 font-pro-mono text-[11px] text-pro-mist">
              <Legend className="bg-pro-slate ring-1 ring-pro-line" label="Libre" />
              <Legend className="bg-pro-mist/30" label="Ocupada" />
              <Legend className="bg-pro-cobalt" label="Tu reunión" />
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] border-separate border-spacing-1 font-pro-mono text-xs">
              <thead>
                <tr>
                  <th className="w-28 text-left font-normal text-pro-mist">Sala</th>
                  {SLOTS.map((s) => (
                    <th key={s} className="font-normal text-pro-mist">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROOMS.map((room) => (
                  <tr key={room}>
                    <th scope="row" className="pr-2 text-left font-pro text-sm font-medium text-white">
                      {room}
                    </th>
                    {SLOTS.map((slot) => {
                      const key = `${room}|${slot}`;
                      const taken = TAKEN.has(key);
                      const own = mine === key;
                      return (
                        <td key={slot}>
                          <button
                            type="button"
                            onClick={() => pick(room, slot)}
                            aria-label={`${room} ${slot}: ${own ? "tu reunión" : taken ? "ocupada" : "libre"}`}
                            className={cn(
                              "h-9 w-full rounded-md transition",
                              own ? "bg-pro-cobalt shadow-[0_0_0_2px_rgba(37,99,235,0.45)]" : taken ? "cursor-not-allowed bg-pro-mist/30" : "bg-pro-slate ring-1 ring-pro-line hover:ring-pro-sapphire",
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p aria-live="polite" className="mt-4 rounded-xl border border-pro-line bg-pro-slate px-4 py-3 text-sm text-pro-mist">
            {msg}
          </p>
          <p className="mt-2 font-pro-mono text-[10px] uppercase tracking-wider text-pro-mist/70">Simulación con datos de ejemplo</p>
        </div>
      </div>
    </ProSection>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} /> {label}
    </span>
  );
}

// ── Control de acceso ─────────────────────────────────────────────────

const SCANS = [
  { id: "ok", label: "Pase válido", icon: <UserCheck className="size-5" />, tone: "emerald", title: "Martín Sosa · SPONSOR", text: "Foto, nombre y categoría para comparar con quien entra. Queda acreditado con la hora." },
  { id: "dup", label: "Ya ingresó", icon: <CopyX className="size-5" />, tone: "gold", title: "Este pase ya entró a las 09:12", text: "Un QR de un solo uso no sirve dos veces: el staff ve cuándo se usó." },
  { id: "void", label: "Anulado", icon: <Ban className="size-5" />, tone: "red", title: "Pase anulado", text: "Entradas reembolsadas o dadas de baja desde el panel o por API se rechazan al instante." },
] as const;

export function ProAccess() {
  const [scan, setScan] = useState<(typeof SCANS)[number]["id"]>("ok");
  const s = SCANS.find((x) => x.id === scan)!;
  const flow = ["Lista de invitados", "Pase con QR por mail", "Escaneo en la puerta", "Acreditado en vivo"];
  return (
    <ProSection id="acceso" tone="light" labelledBy="pro-acceso">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <div className="rounded-2xl border border-pro-line-light bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-pro font-semibold">
                <ScanLine className="size-5 text-pro-cobalt" /> Escáner del staff
              </p>
              <span className="font-pro-mono text-xs text-pro-ink-soft">PUERTA A</span>
            </div>
            <div className="mt-4 flex gap-2" role="tablist" aria-label="Resultado del escaneo">
              {SCANS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={scan === x.id}
                  onClick={() => setScan(x.id)}
                  className={cn("min-h-[40px] flex-1 rounded-lg border px-2 font-pro text-xs font-semibold transition", scan === x.id ? "border-pro-cobalt bg-pro-cobalt text-white" : "border-pro-line-light text-pro-ink-soft hover:border-pro-mist")}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              className={cn(
                "mt-4 flex gap-4 rounded-xl border p-4",
                s.tone === "emerald" && "border-pro-emerald/30 bg-pro-emerald/5",
                s.tone === "gold" && "border-pro-gold/30 bg-pro-gold/5",
                s.tone === "red" && "border-red-500/30 bg-red-500/5",
              )}
            >
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", s.tone === "emerald" ? "bg-pro-emerald/15 text-pro-emerald" : s.tone === "gold" ? "bg-pro-gold/15 text-pro-gold-deep" : "bg-red-500/15 text-red-600")}>{s.icon}</span>
              <div>
                <p className="font-pro font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-pro-ink-soft">{s.text}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center font-pro-mono">
              {[
                ["384", "adentro"],
                ["520", "invitados"],
                ["7", "rechazados"],
              ].map(([n, l]) => (
                <div key={l} className="rounded-lg bg-pro-alabaster p-3">
                  <p className="text-xl font-semibold text-pro-ink">{n}</p>
                  <p className="text-[11px] text-pro-ink-soft">{l}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-pro-mono text-[10px] uppercase tracking-wider text-pro-mist">Simulación con datos de ejemplo</p>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <AudienceTag audience="organizers" />
          <div className="mt-4" />
          <ProHeading id="pro-acceso" tone="light" kicker="Control de Acceso" title="Acreditación en segundos, sin listas en papel" text="Cada invitado recibe un pase de un solo uso con su categoría. El staff escanea con su celular, sin lectores dedicados ni descargas." />
          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {flow.map((f, i) => (
              <li key={f} className="flex items-center gap-3 rounded-xl border border-pro-line-light bg-white px-4 py-3 text-sm font-medium">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pro-cobalt/10 font-pro-mono text-xs text-pro-cobalt">{i + 1}</span>
                {f}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-pro-ink-soft">
            Integración por API con tu sistema de inscripción o ticketera: un código por inscripto, anulación de bajas y sincronización de ingresos.
          </p>
        </div>
      </div>
    </ProSection>
  );
}

// ── Seguridad & privacidad ────────────────────────────────────────────

const VISIBILITY = [
  { field: "Nombre, foto y rubro", before: true, after: true },
  { field: "Qué busca y qué ofrece", before: true, after: true },
  { field: "Empresa y cargo", before: "opt", after: true },
  { field: "LinkedIn", before: false, after: true },
  { field: "Teléfono, email y fecha de nacimiento", before: false, after: false },
] as const;

const ROLES = [
  { role: "Dirección / Producción", data: "Asistentes, CRM y métricas" },
  { role: "Seguridad", data: "Acreditación y control por zonas" },
  { role: "Barra y catering", data: "Solo pedidos" },
  { role: "Asistentes", data: "Solo perfiles profesionales" },
];

export function ProPrivacy() {
  return (
    <ProSection id="privacidad" tone="slate" labelledBy="pro-privacidad">
      <ProHeading id="pro-privacidad" tone="dark" kicker="Seguridad & Privacidad" title="Privacidad blindada por diseño" text="Tus asistentes deciden qué ven los demás, y cada persona del staff accede solo a lo que su rol necesita. Las reglas se aplican en la base de datos, no solo en la pantalla." />
      <div className="mt-12 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] [&>*]:min-w-0">
        <div className="space-y-3">
        <AudienceTag audience="attendees" dark />
        <div className="overflow-hidden rounded-2xl border border-pro-line bg-pro-panel/70">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-pro-line px-5 py-3 font-pro-mono text-[11px] uppercase tracking-wider text-pro-mist">
            <span>Qué ve otro asistente</span>
            <span className="w-24 text-center">Antes</span>
            <span className="w-24 text-center">Tras la reunión</span>
          </div>
          <ul>
            {VISIBILITY.map((v) => (
              <li key={v.field} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-pro-line/60 px-5 py-3.5 text-sm last:border-0">
                <span>{v.field}</span>
                <Cell v={v.before} />
                <Cell v={v.after} />
              </li>
            ))}
          </ul>
          <p className="border-t border-pro-line px-5 py-3 text-xs text-pro-mist">
            <EyeOff className="mr-1.5 inline size-3.5" /> &quot;Opcional&quot;: cada asistente puede mostrar empresa y cargo recién después de aceptar una reunión.
          </p>
        </div>
        </div>
        <div className="space-y-4">
          <AudienceTag audience="organizers" dark />
          <div className="rounded-2xl border border-pro-line bg-pro-panel/70 p-5">
            <p className="font-pro font-semibold">Permisos por rol</p>
            <ul className="mt-3 space-y-2.5">
              {ROLES.map((r) => (
                <li key={r.role} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-white">{r.role}</span>
                  <span className="text-right text-pro-mist">{r.data}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="grid gap-2">
            {[
              { icon: <Lock className="size-4" />, text: "Seguridad por fila en la base de datos" },
              { icon: <ShieldCheck className="size-4" />, text: "Modo incógnito y ubicación solo para su equipo" },
              { icon: <Eye className="size-4" />, text: "Networking solo para acreditados (opcional)" },
              { icon: <Check className="size-4" />, text: "Registro de auditoría", soon: true },
            ].map((b) => (
              <li key={b.text} className="flex items-center gap-3 rounded-xl border border-pro-line px-4 py-3 text-sm">
                <span className="text-pro-emerald">{b.icon}</span>
                {b.text}
                {b.soon && <Soon dark />}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ProSection>
  );
}

function Cell({ v }: { v: boolean | "opt" }) {
  return (
    <span className="grid w-24 place-items-center">
      {v === true ? (
        <span className="grid size-6 place-items-center rounded-full bg-pro-emerald/15 text-pro-emerald" aria-label="Visible">
          <Check className="size-3.5" />
        </span>
      ) : v === "opt" ? (
        <span className="font-pro-mono text-[10px] uppercase tracking-wider text-pro-gold">Opcional</span>
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-pro-mist/15 text-pro-mist" aria-label="Oculto">
          <X className="size-3.5" />
        </span>
      )}
    </span>
  );
}
