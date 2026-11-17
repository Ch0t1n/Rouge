"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Lock,
  MapPin,
  Menu,
  PartyPopper,
  QrCode,
  Rocket,
  ScanLine,
  ShieldCheck,
  Snowflake,
  Users,
  X,
} from "lucide-react";
import { B2B_PLANS, LEAD_EVENT_TYPES, recommendPlan, validateLead, type LeadEventType, type LeadField, type PlanId } from "@/lib/leads";
import { cn } from "@/lib/utils";

const DEMO_BASE = (process.env.NEXT_PUBLIC_DEMO_URL ?? "").replace(/\/$/, "");
/** Abre la demo como asistente del encuentro pyme (Modo Corporativo en vivo). */
const LIVE_DEMO = `${DEMO_BASE}/demo/abrir?rol=asistente&a=${encodeURIComponent("/join/PYME26")}`;
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "";

const NAV = [
  { href: "#diferenciales", label: "Diferenciales" },
  { href: "#casos", label: "Casos de uso" },
  { href: "#planes", label: "Planes" },
  { href: "#contacto", label: "Contacto" },
];

const PAINS = [
  { icon: <FileSpreadsheet className="size-5" />, title: "Listas en Excel y filas en la acreditación", text: "Planillas que no coinciden, entradas reenviadas y gente esperando en la puerta." },
  { icon: <Snowflake className="size-5" />, title: "Networking frío", text: "Tarjetas que nadie lee y conversaciones por azar: la mitad se va sin conocer a quien vino a buscar." },
  { icon: <BarChart3 className="size-5" />, title: "Cero datos después", text: "Sin saber quién vino, a qué, con quién habló ni qué funcionó para la próxima edición." },
];

const VALUE = [
  {
    icon: <QrCode className="size-6" />,
    tone: "squad",
    title: "Acreditación instantánea con QR",
    text: "Un código de 1 uso por invitado (o desde tu sistema de registro por API). En la puerta se escanea con el celular: foto, nombre y validación al instante. Anulados, duplicados y pases ajenos se rechazan solos.",
    bullets: ["Escáner con la cámara del celular", "Ingresos en tiempo real", "Lista nominal sin planillas"],
  },
  {
    icon: <CalendarClock className="size-6" />,
    tone: "rouge",
    title: "Networking inteligente y reuniones con sala",
    text: "La app recomienda con quién hablar cruzando lo que cada asistente busca con lo que los demás ofrecen. Piden una reunión 1 a 1 con horario y eligen una sala, una mesa o un pin en el plano; al aceptar se abre el chat.",
    bullets: ["Salas y mesas con cupo, sin doble reserva", "Agenda personal: pendientes, próximas e historial", "Pin en el plano indoor con vencimiento"],
  },
  {
    icon: <ShieldCheck className="size-6" />,
    tone: "vip",
    title: "Privacidad blindada por diseño",
    text: "Nadie ve el teléfono, el email ni la fecha de nacimiento de otro asistente. Cada persona entra con un perfil profesional; su vida personal nunca aparece. Empresa y LinkedIn pueden quedar ocultos hasta aceptar una reunión.",
    bullets: ["Seguridad por fila en la base de datos", "Modo incógnito y ubicación solo para su equipo", "Networking solo para acreditados (opcional)"],
  },
  {
    icon: <BarChart3 className="size-6" />,
    tone: "squad",
    title: "CRM del organizador y analítica",
    text: "Asistencia real (no inscriptos), empresa, cargo y qué busca cada uno, contactos y reuniones del evento en conteos agregados, y export a CSV para tu equipo comercial y tus sponsors.",
    bullets: ["Leads exportables", "Métricas en vivo y Pantalla LED", "Reporte para la próxima edición"],
  },
] as const;

const CASES: { id: string; label: string; icon: React.ReactNode; title: string; text: string; points: string[] }[] = [
  {
    id: "congress",
    label: "Congresos y expos",
    icon: <Building2 className="size-4" />,
    title: "Rondas de negocios que se arman solas",
    text: "Expositores y visitantes llegan con reuniones agendadas en salas con cupo. La agenda de charlas, los avisos y la LED mantienen a todos en el mismo lugar.",
    points: ["Acreditación con QR en varias puertas", "Salas de reunión sin superposiciones", "Leads por stand y por interés"],
  },
  {
    id: "internal",
    label: "Eventos internos y fin de año",
    icon: <PartyPopper className="size-4" />,
    title: "Toda la empresa conectada, y cuidada",
    text: "Mesas por equipo, sorteos en vivo, barra libre con cupos por QR y un botón de rescate con \"Llegué a casa\" para que RR. HH. duerma tranquilo.",
    points: ["Equipos y mesas en el plano", "Sorteos y avisos en vivo", "Seguridad: rescate y llegada a casa"],
  },
  {
    id: "cowork",
    label: "Coworks y comunidades",
    icon: <Users className="size-4" />,
    title: "Una comunidad que se conoce de verdad",
    text: "Cada encuentro suma contactos que quedan para siempre. Los miembros encuentran socios, proveedores y talento dentro de la propia comunidad.",
    points: ["Perfiles profesionales reutilizables", "Contactos y chats que persisten", "Networking antes y después del evento"],
  },
  {
    id: "launch",
    label: "Lanzamientos de marca",
    icon: <Rocket className="size-4" />,
    title: "Una experiencia con tu marca, medible",
    text: "La app se ve con tu logo y tus colores. Prensa, clientes e influencers entran con su QR y vos ves en vivo quién llegó y cómo se movió la noche.",
    points: ["Marca blanca completa", "Lista de invitados nominal", "Métricas para el informe del lanzamiento"],
  },
];

const FAQ = [
  { q: "¿Los asistentes tienen que descargar una app?", a: "No. ROUGE es una app web que se instala desde el navegador: entran con el link o el QR de su invitación en segundos." },
  { q: "¿Qué ven los demás de cada asistente?", a: "Solo su perfil profesional (nombre, foto, rubro y qué busca u ofrece). Teléfono, email y fecha de nacimiento nunca se muestran, y su perfil personal no aparece en eventos de trabajo." },
  { q: "¿Se integra con nuestro sistema de inscripción?", a: "Sí: con la API generás un código por inscripto y lo enviás en tu mail de confirmación, con su QR. También podés cargar la lista o generar códigos desde el panel." },
  { q: "¿Cómo se cotiza?", a: "A medida, según la cantidad de asistentes, los eventos por año y los módulos que uses. Contanos tu evento y te respondemos con una propuesta." },
];

export function CorporateLanding() {
  const [menu, setMenu] = useState(false);
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-primary">
      {/* Fondo ejecutivo: grilla técnica + halos de marca */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(248,250,252,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(248,250,252,.6)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute -left-40 top-[-10%] size-[520px] rounded-full bg-squad/15 blur-[150px]" />
        <div className="absolute -right-40 top-[30%] size-[520px] rounded-full bg-rouge/15 blur-[160px]" />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/empresas" className="flex items-baseline gap-1.5 font-display text-xl font-bold tracking-tight">
            <span className="text-rouge text-glow-rouge">ROUGE</span>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary/80">Pro</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Secciones">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-primary">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="#contacto" className="hidden min-h-touch items-center rounded-2xl bg-rouge px-4 text-sm font-semibold text-white shadow-glow-rouge transition hover:bg-rouge-hover sm:inline-flex">
              Agendar demo
            </a>
            <button type="button" className="grid size-11 place-items-center rounded-full md:hidden" aria-label={menu ? "Cerrar menú" : "Abrir menú"} aria-expanded={menu} onClick={() => setMenu(!menu)}>
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="border-t border-white/10 px-4 pb-4 md:hidden" aria-label="Secciones">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="flex min-h-touch items-center text-sm text-primary/90">
                {n.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-squad/30 bg-squad/10 px-3 py-1 font-display text-xs font-semibold uppercase tracking-wider text-squad">
              <ShieldCheck className="size-3.5" /> Para empresas, congresos y comunidades
            </p>
            <h1 className="mt-5 font-display text-[clamp(2.1rem,5.4vw,3.6rem)] font-bold leading-[1.04] tracking-tight">
              Transformá tus eventos corporativos, congresos y after-office en experiencias <span className="text-rouge">conectadas</span> y{" "}
              <span className="text-squad">medibles</span>.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
              Acreditación con QR, networking que recomienda con quién hablar, reuniones con sala y un CRM con lo que realmente pasó. Con la privacidad de cada
              asistente cuidada de punta a punta.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#contacto" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-rouge px-6 font-semibold text-white shadow-glow-rouge transition hover:bg-rouge-hover">
                Agendar demo / Cotizar evento <ArrowRight className="size-4" />
              </a>
              <a href={LIVE_DEMO} target="_blank" rel="noreferrer" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-6 font-semibold transition hover:bg-white/10">
                Ver Modo Corporativo en vivo
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">Sin descargas: tus invitados entran con el link o el QR de su invitación.</p>
          </div>
          <HeroMock />
        </section>

        {/* Dolores */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="dolores">
          <h2 id="dolores" className="sr-only">
            Lo que resolvemos
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {PAINS.map((p) => (
              <div key={p.title} className="rounded-3xl border border-white/10 bg-surface/70 p-5">
                <span className="grid size-10 place-items-center rounded-2xl bg-white/[0.06] text-muted">{p.icon}</span>
                <h3 className="mt-3 font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Diferenciales */}
        <section id="diferenciales" className="scroll-mt-20 border-y border-white/10 bg-surface/40 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle kicker="Diferenciales" title="Todo el evento en una sola plataforma" text="Lo operativo para tu equipo y lo social para tus asistentes, conectado en tiempo real." />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {VALUE.map((v) => (
                <article key={v.title} className="glass rounded-3xl p-6">
                  <span className={cn("grid size-12 place-items-center rounded-2xl", v.tone === "squad" ? "bg-squad/15 text-squad" : v.tone === "rouge" ? "bg-rouge/15 text-rouge" : "bg-vip/15 text-vip")}>{v.icon}</span>
                  <h3 className="mt-4 font-display text-xl font-semibold">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{v.text}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {v.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-squad" /> {b}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <Steps />
          </div>
        </section>

        <UseCases />
        <Plans />
        <Faq />
        <ContactForm />
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            <span className="font-display font-bold text-rouge">ROUGE</span> <span className="font-display font-semibold text-primary/80">Pro</span> · eventos conectados y medibles
          </p>
          <div className="flex gap-5">
            <a href="#contacto" className="hover:text-primary">
              Cotizar
            </a>
            <a href={LIVE_DEMO} target="_blank" rel="noreferrer" className="hover:text-primary">
              Demo en vivo
            </a>
            <Link href="/login" className="hover:text-primary">
              Acceso equipo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-squad">{kicker}</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-muted">{text}</p>}
    </div>
  );
}

/** Maqueta del producto (ilustrativa): recomendación de networking + reunión confirmada + puerta. */
function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-sm lg:max-w-none" aria-hidden>
      <div className="glass rounded-[28px] p-4 shadow-2xl">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-display font-semibold uppercase tracking-wider text-squad">Networking</span>
          <span>Recomendados para vos</span>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { n: "C", name: "Carla · Textil Norte", sub: "Busca: software y marketing", pct: 64 },
            { n: "J", name: "Joaquín · Vera Alimentos", sub: "Busca: inversión y exportación", pct: 52 },
            { n: "R", name: "Romina · Fletes Sur", sub: "Ofrece: logística y distribución", pct: 52 },
          ].map((p) => (
            <div key={p.name} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
              <span className="grid size-10 place-items-center rounded-full bg-white/10 font-display font-bold">{p.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-muted">{p.sub}</span>
              </span>
              <span className="rounded-full bg-rouge px-2 py-0.5 font-display text-[11px] font-bold text-white">{p.pct}% 🤝</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-squad/40 bg-squad/[0.08] p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-squad" /> Reunión confirmada · 16:30
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <MapPin className="size-3.5" /> Sala 3 · 30 min · chat abierto
          </p>
        </div>
      </div>
      <div className="glass absolute -bottom-14 -left-4 hidden w-52 rounded-2xl p-3 sm:block">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <ScanLine className="size-4 text-squad" /> Puerta · pase válido
        </p>
        <p className="mt-1 text-[11px] text-muted">Acreditación en 2 segundos</p>
      </div>
      <div className="glass absolute -right-3 -top-12 hidden w-48 rounded-2xl p-3 sm:block">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <Lock className="size-4 text-vip" /> Privacidad
        </p>
        <p className="mt-1 text-[11px] text-muted">Sin teléfonos ni datos personales a la vista</p>
      </div>
    </div>
  );
}

function Steps() {
  const steps = [
    { n: "1", title: "Cargás el evento", text: "Agenda, plano, salas y tu marca. La lista de invitados por panel, CSV o API." },
    { n: "2", title: "Tus invitados entran", text: "Con su QR crean un perfil profesional en 1 minuto y ven a quién les conviene conocer." },
    { n: "3", title: "Medís todo", text: "Ingresos, contactos y reuniones en vivo; después, CRM y reporte para la próxima edición." },
  ];
  return (
    <ol className="mt-10 grid gap-4 md:grid-cols-3">
      {steps.map((s) => (
        <li key={s.n} className="flex gap-4 rounded-3xl border border-white/10 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rouge font-display font-bold text-white">{s.n}</span>
          <span>
            <span className="block font-display font-semibold">{s.title}</span>
            <span className="mt-1 block text-sm text-muted">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function UseCases() {
  const [tab, setTab] = useState(CASES[0].id);
  const current = CASES.find((c) => c.id === tab)!;
  return (
    <section id="casos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <SectionTitle kicker="Casos de uso" title="Un mismo producto, cada tipo de evento" />
      <div className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Casos de uso">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            id={`tab-${c.id}`}
            aria-selected={tab === c.id}
            aria-controls={`panel-${c.id}`}
            onClick={() => setTab(c.id)}
            className={cn(
              "inline-flex min-h-touch shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
              tab === c.id ? "border-rouge bg-rouge/15 text-primary" : "border-white/15 bg-white/[0.04] text-muted hover:text-primary",
            )}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>
      <div id={`panel-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} className="glass mt-6 grid gap-6 rounded-3xl p-6 md:grid-cols-[1.2fr_1fr] md:p-8">
        <div>
          <h3 className="font-display text-2xl font-bold">{current.title}</h3>
          <p className="mt-3 text-muted">{current.text}</p>
        </div>
        <ul className="space-y-2">
          {current.points.map((p) => (
            <li key={p} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-squad" /> {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ATTENDEE_STEPS = [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];

function Plans() {
  const [idx, setIdx] = useState(2);
  const [perYear, setPerYear] = useState(1);
  const attendees = ATTENDEE_STEPS[idx];
  const plan = recommendPlan(attendees, perYear);
  return (
    <section id="planes" className="scroll-mt-20 border-y border-white/10 bg-surface/40 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle kicker="Planes" title="Elegí según el tamaño de tu evento" text="Cotizamos a medida según asistentes, eventos por año y módulos. Usá el estimador para ver qué plan te conviene." />
        <div className="glass mt-8 grid gap-6 rounded-3xl p-6 md:grid-cols-2">
          <div>
            <label htmlFor="attendees-range" className="flex items-baseline justify-between text-sm font-semibold">
              Asistentes por evento <span className="font-display text-2xl font-bold text-rouge">{attendees === 5000 ? "+5.000" : attendees.toLocaleString("es-AR")}</span>
            </label>
            <input
              id="attendees-range"
              type="range"
              min={0}
              max={ATTENDEE_STEPS.length - 1}
              value={idx}
              onChange={(e) => setIdx(Number(e.target.value))}
              className="mt-3 w-full accent-rouge"
              aria-valuetext={`${attendees} asistentes`}
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>100</span>
              <span>+5.000</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Eventos por año</p>
            <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Eventos por año">
              {[1, 2, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={perYear === n}
                  onClick={() => setPerYear(n)}
                  className={cn("min-h-touch rounded-xl border text-sm font-semibold", perYear === n ? "border-squad bg-squad/15 text-primary" : "border-white/10 text-muted")}
                >
                  {n === 6 ? "6+" : n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {B2B_PLANS.map((p) => (
            <article key={p.id} className={cn("relative flex flex-col rounded-3xl border p-6 transition", p.id === plan ? "border-rouge bg-rouge/[0.07] shadow-glow-rouge" : "border-white/10 bg-surface/70")}>
              {p.id === plan && <span className="absolute -top-3 left-6 rounded-full bg-rouge px-3 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-white">Recomendado</span>}
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.forWho}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-squad" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href={`#contacto`}
                onClick={() => window.dispatchEvent(new CustomEvent<PlanPreset>("rouge:plan", { detail: { plan: p.id, attendees } }))}
                className={cn("mt-6 inline-flex min-h-touch items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition", p.id === plan ? "bg-rouge text-white hover:bg-rouge-hover" : "border border-white/15 hover:bg-white/5")}
              >
                Cotizar {p.name} <ArrowRight className="size-4" />
              </a>
            </article>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted">Precio a medida, sin costos ocultos. La propuesta incluye implementación y soporte el día del evento.</p>
      </div>
    </section>
  );
}

type PlanPreset = { plan: PlanId; attendees: number };

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <SectionTitle kicker="Preguntas frecuentes" title="Lo que nos preguntan los organizadores" />
      <div className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/10">
        {FAQ.map((f, i) => (
          <div key={f.q}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex min-h-touch w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold">
              {f.q}
              <ChevronDown className={cn("size-5 shrink-0 text-muted transition", open === i && "rotate-180")} />
            </button>
            {open === i && <p className="px-5 pb-5 text-sm text-muted">{f.a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

type FormState = { name: string; company: string; email: string; whatsapp: string; event_type: LeadEventType | ""; attendees: string; message: string; website: string };
const EMPTY: FormState = { name: "", company: "", email: "", whatsapp: "", event_type: "", attendees: "", message: "", website: "" };

function ContactForm() {
  const [f, setF] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);

  // El botón "Cotizar" de un plan precarga la cantidad de asistentes.
  useEffect(() => {
    const onPlan = (e: Event) => {
      const d = (e as CustomEvent<PlanPreset>).detail;
      setF((x) => ({ ...x, attendees: String(d.attendees) }));
      setPlanNote(B2B_PLANS.find((p) => p.id === d.plan)?.name ?? null);
    };
    window.addEventListener("rouge:plan", onPlan);
    return () => window.removeEventListener("rouge:plan", onPlan);
  }, []);

  const v = validateLead({ ...f, attendees: f.attendees, source: planNote ? `empresas · ${planNote}` : "empresas" });
  const errors: Partial<Record<LeadField, string>> = !v.ok && touched ? v.errors : {};
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!v.ok) return;
    setStatus("sending");
    setServerError(null);
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, attendees: Number(f.attendees), source: planNote ? `empresas · ${planNote}` : "empresas" }) });
      if (res.ok) {
        setStatus("sent");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setServerError(body?.error?.message ?? "No pudimos enviar tu pedido. Probá de nuevo.");
      setStatus("error");
    } catch {
      setServerError("Sin conexión. Probá de nuevo en un momento.");
      setStatus("error");
    }
  };

  return (
    <section id="contacto" className="scroll-mt-20 border-t border-white/10 py-16">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionTitle kicker="Contacto" title="Contanos tu evento" text="Te mostramos la plataforma con tu caso y te enviamos una propuesta. Respondemos en el día hábil." />
          <ul className="mt-6 space-y-3 text-sm text-primary/90">
            <li className="flex gap-3">
              <CalendarClock className="size-5 shrink-0 text-squad" /> Demo de 20 minutos con tu agenda y tu plano
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="size-5 shrink-0 text-squad" /> Usamos tus datos solo para responderte
            </li>
          </ul>
          {SALES_EMAIL && (
            <p className="mt-6 text-sm text-muted">
              ¿Preferís escribirnos? <a className="text-squad underline-offset-4 hover:underline" href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            </p>
          )}
        </div>

        {status === "sent" ? (
          <div className="glass flex flex-col items-center justify-center rounded-3xl p-10 text-center" role="status">
            <span className="grid size-14 place-items-center rounded-full bg-squad/15 text-squad">
              <Check className="size-7" />
            </span>
            <h3 className="mt-4 font-display text-2xl font-bold">¡Gracias, {f.name.split(" ")[0]}!</h3>
            <p className="mt-2 text-sm text-muted">Recibimos tu pedido. Te escribimos a {f.email} para coordinar la demo.</p>
            <a href={LIVE_DEMO} target="_blank" rel="noreferrer" className="mt-6 inline-flex min-h-touch items-center gap-2 rounded-2xl border border-white/15 px-4 text-sm font-semibold hover:bg-white/5">
              Mientras tanto, mirá el Modo Corporativo en vivo <ArrowRight className="size-4" />
            </a>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="glass grid gap-4 rounded-3xl p-6 sm:grid-cols-2">
            {planNote && <p className="rounded-2xl bg-rouge/10 px-3 py-2 text-sm sm:col-span-2">Plan elegido: <b>{planNote}</b></p>}
            <Field label="Nombre y apellido" error={errors.name}>
              <input autoComplete="name" value={f.name} onChange={set("name")} className={input(!!errors.name)} />
            </Field>
            <Field label="Empresa u organización" error={errors.company}>
              <input autoComplete="organization" value={f.company} onChange={set("company")} className={input(!!errors.company)} />
            </Field>
            <Field label="Email corporativo" error={errors.email}>
              <input type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} className={input(!!errors.email)} />
            </Field>
            <Field label="WhatsApp (opcional)" error={errors.whatsapp}>
              <input type="tel" autoComplete="tel" inputMode="tel" placeholder="11 2345-6789" value={f.whatsapp} onChange={set("whatsapp")} className={input(!!errors.whatsapp)} />
            </Field>
            <Field label="Tipo de evento" error={errors.event_type}>
              <select value={f.event_type} onChange={set("event_type")} className={input(!!errors.event_type)}>
                <option value="" className="bg-surface">
                  Elegí una opción
                </option>
                {LEAD_EVENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-surface">
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Asistentes estimados" error={errors.attendees}>
              <input type="number" inputMode="numeric" min={10} placeholder="Ej. 400" value={f.attendees} onChange={set("attendees")} className={input(!!errors.attendees)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Contanos un poco más (opcional)" error={errors.message}>
                <textarea rows={3} maxLength={1000} value={f.message} onChange={set("message")} placeholder="Fecha, lugar, qué te gustaría resolver…" className={cn(input(!!errors.message), "min-h-[96px] py-3")} />
              </Field>
            </div>
            {/* Honeypot anti-spam: invisible para personas */}
            <div aria-hidden className="absolute left-[-9999px] top-auto size-px overflow-hidden">
              <label>
                Sitio web
                <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
              </label>
            </div>
            {serverError && (
              <p className="text-sm text-rouge sm:col-span-2" role="alert">
                {serverError}
                {SALES_EMAIL && (
                  <>
                    {" "}
                    También podés escribirnos a <a className="underline" href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
                  </>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-rouge px-6 font-semibold text-white shadow-glow-rouge transition hover:bg-rouge-hover disabled:opacity-60 sm:col-span-2"
            >
              {status === "sending" ? "Enviando…" : "Agendar demo / Cotizar evento"} <ArrowRight className="size-4" />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

const input = (bad: boolean) =>
  cn(
    "min-h-touch w-full rounded-2xl border bg-white/[0.04] px-4 text-[15px] text-primary placeholder:text-muted/60 focus:outline-none focus:ring-2",
    bad ? "border-rouge/60 focus:ring-rouge/40" : "border-white/10 focus:ring-squad/40",
  );

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-display text-[13px] font-semibold">{label}</span>
      {children}
      {error && <span className="block text-xs text-rouge">{error}</span>}
    </label>
  );
}
