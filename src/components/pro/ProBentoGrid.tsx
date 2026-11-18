import { ArrowDown, BarChart3, CalendarClock, Check, Handshake, Megaphone, MapPinned, MessagesSquare, QrCode, ShieldCheck, UserRound, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRO_ATTENDEE_BENEFITS, PRO_ORGANIZER_MODULES, type ProAudience, type ProModule } from "./content";
import { AudienceTag, ProHeading, ProSection, Soon } from "./ProSection";

const ICONS: Record<ProModule["icon"], React.ReactNode> = {
  access: <QrCode className="size-6" />,
  meetings: <Handshake className="size-6" />,
  map: <MapPinned className="size-6" />,
  leads: <Users2 className="size-6" />,
  comms: <Megaphone className="size-6" />,
  privacy: <ShieldCheck className="size-6" />,
  analytics: <BarChart3 className="size-6" />,
  profile: <UserRound className="size-6" />,
  agenda: <CalendarClock className="size-6" />,
  chat: <MessagesSquare className="size-6" />,
};

const TONE: Record<ProModule["tone"], string> = {
  cobalt: "bg-pro-cobalt/10 text-pro-cobalt",
  gold: "bg-pro-gold/10 text-pro-gold-deep",
  emerald: "bg-pro-emerald/10 text-pro-emerald",
};

const SPAN: Record<ProModule["span"], string> = { 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4", 6: "lg:col-span-6" };

/**
 * Entrada a las dos audiencias: lo que gana QUIEN ORGANIZA y lo que gana QUIEN ASISTE, separado desde el principio
 * (cada tarjeta lleva a su bloque).
 */
export function ProAudienceSplit() {
  const cards: { audience: ProAudience; href: string; title: string; text: string; items: string[] }[] = [
    {
      audience: "organizers",
      href: "#organizadores",
      title: "Para quien organiza",
      text: "Dirección del evento, producción, sponsors y equipo.",
      items: ["Acreditación con QR y escáner en la puerta", "Centro de comando y CRM de asistentes", "Leads para sponsors y avisos segmentados", "Salas con cupo y permisos por rol"],
    },
    {
      audience: "attendees",
      href: "#asistentes",
      title: "Para quien asiste",
      text: "Participantes, expositores y speakers.",
      items: ["Recomendaciones de con quién hablar", "Reuniones 1 a 1 con sala o pin", "Mapa del predio y agenda en vivo", "Control total de sus datos"],
    },
  ];
  return (
    <ProSection id="soluciones" tone="light" labelledBy="pro-soluciones">
      <ProHeading id="pro-soluciones" tone="light" kicker="Soluciones" title="Dos experiencias, una sola plataforma" text="Tu equipo opera el evento desde el panel; tus asistentes lo viven desde el celular. Cada uno con sus propias herramientas." />
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {cards.map((c) => (
          <a key={c.audience} href={c.href} className="pro-reveal group flex flex-col rounded-2xl border border-pro-line-light bg-white p-7 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]">
            <AudienceTag audience={c.audience} />
            <h3 className="mt-4 font-pro text-2xl font-bold tracking-[-0.02em]">{c.title}</h3>
            <p className="mt-1 text-sm text-pro-ink-soft">{c.text}</p>
            <ul className="mt-5 grid gap-2.5 text-sm">
              {c.items.map((it) => (
                <li key={it} className="flex items-start gap-2">
                  <Check className={cn("mt-0.5 size-4 shrink-0", c.audience === "organizers" ? "text-pro-cobalt" : "text-pro-emerald")} /> {it}
                </li>
              ))}
            </ul>
            <span className="mt-6 inline-flex items-center gap-1.5 font-pro text-sm font-semibold text-pro-cobalt">
              Ver el detalle <ArrowDown className="size-4 transition group-hover:translate-y-0.5" />
            </span>
          </a>
        ))}
      </div>
    </ProSection>
  );
}

/** Bloque de ventajas para QUIEN ORGANIZA (oscuro). */
export function ProOrganizerGrid() {
  return (
    <ProSection id="organizadores" tone="dark" labelledBy="pro-organizadores">
      <AudienceTag audience="organizers" dark />
      <div className="mt-4">
        <ProHeading id="pro-organizadores" tone="dark" kicker="Para quien organiza" title="Control total de tu evento, desde una sola consola" text="Puerta, salas, comunicaciones, sponsors y métricas: todo conectado y en tiempo real." />
      </div>
      <ModuleGrid modules={PRO_ORGANIZER_MODULES} dark highlightFirst />
    </ProSection>
  );
}

/** Bloque de ventajas para QUIEN ASISTE (claro). */
export function ProAttendeeGrid() {
  return (
    <ProSection id="asistentes" tone="light" labelledBy="pro-asistentes">
      <AudienceTag audience="attendees" />
      <div className="mt-4">
        <ProHeading id="pro-asistentes" tone="light" kicker="Para quien asiste" title="Un evento que vale la pena para cada participante" text="Llegan sabiendo con quién hablar, encuentran las salas sin perderse y deciden qué datos comparten." />
      </div>
      <ModuleGrid modules={PRO_ATTENDEE_BENEFITS} />
    </ProSection>
  );
}

function ModuleGrid({ modules, dark, highlightFirst }: { modules: ProModule[]; dark?: boolean; highlightFirst?: boolean }) {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {modules.map((m, i) => (
        <article
          key={m.id}
          className={cn(
            "pro-reveal flex flex-col overflow-hidden rounded-2xl border p-6 transition hover:-translate-y-0.5",
            dark ? "border-pro-line bg-pro-panel/70 backdrop-blur-xl" : "border-pro-line-light bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]",
            SPAN[m.span],
            (m.span >= 4 || (highlightFirst && i === 0)) && "sm:col-span-2",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <span className={cn("grid size-12 place-items-center rounded-xl", dark ? "bg-pro-slate text-pro-gold" : TONE[m.tone])}>{ICONS[m.icon]}</span>
            <span className={cn("font-pro-mono text-xs", dark ? "text-pro-mist/70" : "text-pro-mist")}>0{i + 1}</span>
          </div>
          <h3 className="mt-5 font-pro text-xl font-semibold tracking-[-0.02em]">{m.title}</h3>
          <p className={cn("mt-2 text-sm leading-relaxed", dark ? "text-pro-mist" : "text-pro-ink-soft")}>{m.text}</p>
          <ul className={cn("mt-5 grid gap-2 text-sm", m.span >= 4 && "sm:grid-cols-2")}>
            {m.points.map((p) => (
              <li key={p.text} className={cn("flex items-start gap-2", p.soon && (dark ? "text-pro-mist" : "text-pro-ink-soft"))}>
                <Check className={cn("mt-0.5 size-4 shrink-0", p.soon ? "text-pro-mist" : "text-pro-emerald")} />
                <span>
                  {p.text}
                  {p.soon && <Soon dark={dark} />}
                </span>
              </li>
            ))}
          </ul>
          {highlightFirst && i === 0 && <AccessStrip dark={dark} />}
        </article>
      ))}
    </div>
  );
}

/** Tira de la tarjeta principal: lo que ve el staff en la puerta (ilustrativa). */
function AccessStrip({ dark }: { dark?: boolean }) {
  const rows = [
    { name: "Martín Sosa", tag: "SPONSOR", ok: true },
    { name: "Lucía Pereyra", tag: "PRENSA", ok: true },
    { name: "Pase anulado", tag: "RECHAZADO", ok: false },
  ];
  return (
    <div className={cn("mt-6 grid gap-2 rounded-xl border p-3 sm:grid-cols-3", dark ? "border-pro-line bg-pro-slate" : "border-pro-line-light bg-pro-alabaster")} aria-hidden>
      {rows.map((r) => (
        <div key={r.name} className={cn("flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-pro-mono text-[11px]", dark ? "bg-pro-panel" : "bg-white")}>
          <span className={cn("truncate", dark ? "text-white" : "text-pro-ink")}>{r.name}</span>
          <span className={cn("rounded px-1.5 py-0.5 font-semibold", r.ok ? "bg-pro-emerald/15 text-pro-emerald" : "bg-red-500/15 text-red-400")}>{r.tag}</span>
        </div>
      ))}
    </div>
  );
}
