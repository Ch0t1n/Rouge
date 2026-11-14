"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  BarChart3,
  Flag,
  Heart,
  House,
  Megaphone,
  MessageCircle,
  QrCode,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Ticket,
  Tv,
  UserX,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { destinationFor, ROLE_META, type Role } from "@/lib/engine/roles";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** Imagen de una pantalla real de la app (capturas en public/landing). */
function Phone({ src, alt, className, glow = "rouge" }: { src: string; alt: string; className?: string; glow?: "rouge" | "squad" | "vip" }) {
  return (
    <div
      className={cn(
        "relative aspect-[390/844] overflow-hidden rounded-[2.4rem] border-[6px] border-surface-raised bg-background",
        { rouge: "shadow-[0_0_80px_rgba(255,30,86,0.28)]", squad: "shadow-[0_0_80px_rgba(0,240,255,0.22)]", vip: "shadow-[0_0_80px_rgba(255,184,0,0.22)]" }[glow],
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover object-top" />
    </div>
  );
}

function Eyebrow({ children, tone = "rouge" }: { children: ReactNode; tone?: "rouge" | "squad" | "vip" }) {
  return <p className={cn("font-display text-xs font-semibold uppercase tracking-[0.2em]", { rouge: "text-rouge", squad: "text-squad", vip: "text-vip" }[tone])}>{children}</p>;
}

const STEPS = [
  { n: "01", title: "Entrá con tu link o QR", text: "El organizador te manda tu acceso: link maestro, código de 1 uso o el QR de tu Squad. Sin descargar nada: es una PWA.", icon: Ticket, img: "/landing/home.webp", tone: "rouge" as const },
  { n: "02", title: "Conectá por afinidad", text: "Una grilla ordenada por lo que escuchás. Conectar es mutuo y tenés un solo Rompehielos por noche (con trago de regalo, si querés).", icon: Heart, img: "/landing/lobby.webp", tone: "rouge" as const },
  { n: "03", title: "No pierdas a tu Squad", text: "Pines de 15 minutos en el plano solo para quien elijas, Punto Base dorado y chat grupal con fotos.", icon: UsersRound, img: "/landing/map.webp", tone: "squad" as const },
  { n: "04", title: "Pedí sin hacer fila", text: "Barra Express con delivery a tu pin o a la Mesa VIP, retiro con QR y Vaquita para dividir entre el Squad.", icon: Zap, img: "/landing/bar.webp", tone: "vip" as const },
];

const SAFETY = [
  { icon: ShieldAlert, title: "Rescate en 1 toque", text: "Pin rojo para tu Squad, alerta en el chat y aviso a seguridad del evento." },
  { icon: Flag, title: "Punto Base", text: "Un lugar fijo de encuentro en el plano para cuando se dispersan." },
  { icon: House, title: "Llegué a casa", text: "Borra tus pines y avisa a tu grupo que estás bien." },
  { icon: UserX, title: "Lista negra por teléfono", text: "Bloqueá números antes de que lleguen: invisibilidad mutua total." },
];

const B2B = [
  { icon: Ticket, title: "Link maestro y códigos de 1 uso", text: "Con QR imprimible para la puerta, las redes o la ticketera." },
  { icon: Users, title: "CRM con Smart Tags", text: "Quién vino, cuánto consumió, con quién llegó. Exportable a CSV." },
  { icon: Megaphone, title: "Text Blasts y Flash Promos", text: "Avisos segmentados por sector, mood, Squad o top consumo." },
  { icon: ScanLine, title: "Barra / POS", text: "Kanban de comandas, entrega por código y canje de QRs." },
  { icon: Sparkles, title: "Perks y sorteos en vivo", text: "QR Drops automáticos y ruleta con ganador definido por el servidor." },
  { icon: Tv, title: "Pantalla LED", text: "Matches, temas más votados y line-up en el proyector del boliche." },
];

const ROLES: Role[] = ["owner", "manager", "bartender", "waiter", "security", "attendee"];

export function Landing() {
  const { state, mode, signedIn, role } = useRouge();
  const me = getProfile(state, state.current_user_id);
  const event = activeEvent(state);
  const loggedIn = mode === "supabase" && signedIn && !!me;
  const myScreen = destinationFor(state, state.active_event_id, state.current_user_id, null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = event ? `${origin}/join/${event.slug}` : `${origin}/join`;

  return (
    <div className="relative overflow-x-clip">
      {/* Ambiente: luces de pista */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px]">
        <div className="absolute -top-40 left-[10%] size-[520px] rounded-full bg-rouge/25 blur-[160px]" />
        <div className="absolute right-[5%] top-[20%] size-[420px] rounded-full bg-squad/15 blur-[150px]" />
      </div>

      {/* Navegación */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6" aria-label="Principal">
          <Link href="/" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
            ROUGE
          </Link>
          <div className="ml-6 hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#como-funciona" className="hover:text-primary">Cómo funciona</a>
            <a href="#seguridad" className="hover:text-primary">Seguridad</a>
            <a href="#organizadores" className="hover:text-primary">Organizadores</a>
            <a href="#roles" className="hover:text-primary">Equipo</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {loggedIn ? (
              <Link href={myScreen} className={buttonVariants({ size: "sm" })}>
                {ROLE_META[role].emoji} Mi pantalla
              </Link>
            ) : (
              <>
                <Link href="/login?as=staff" className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "hidden sm:inline-flex")}>
                  Soy del equipo
                </Link>
                <Link href="/login" className={buttonVariants({ size: "sm" })}>
                  Entrar
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <p className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-pin-pulse rounded-full bg-rouge" />
                <span className="relative inline-flex size-2 rounded-full bg-rouge" />
              </span>
              {event ? `En vivo: ${event.name}` : "La app de tu próxima fiesta"}
            </p>
            <h1 className="mt-6 font-display text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              La noche, <span className="text-rouge text-glow-rouge">conectada.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              El lobby privado de tu evento: conectá con gente afín, <span className="text-squad">no pierdas a tu grupo</span> y <span className="text-vip">pedí en la barra sin filas</span>.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/join" className={buttonVariants({ size: "lg" })}>
                <Ticket /> Tengo una entrada
              </Link>
              <Link href={loggedIn ? myScreen : "/login"} className={buttonVariants({ size: "lg", variant: "glass" })}>
                {loggedIn ? "Ir a mi pantalla" : mode === "demo" ? "Probar la demo" : "Entrar"} <ArrowRight />
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[
                ["15 min", "dura un pin", "text-squad"],
                ["1", "Rompehielos por noche", "text-rouge"],
                ["0", "filas en la barra", "text-vip"],
              ].map(([v, l, c]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className={cn("metric text-3xl", c)}>{v}</dd>
                  <dd className="text-xs text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[360px]">
            <Phone src="/landing/lobby.webp" alt="Grilla del lobby ordenada por afinidad musical" />
            <div className="glass absolute -left-6 top-24 hidden w-48 rounded-2xl p-3 shadow-glow-rouge sm:block lg:-left-16">
              <p className="flex items-center gap-2 font-display text-sm font-semibold">
                <Heart className="size-4 fill-rouge text-rouge" /> ¡Es un match!
              </p>
              <p className="mt-1 text-xs text-muted">80% de afinidad · Techno</p>
            </div>
            <div className="glass absolute -right-4 top-1/2 hidden w-48 rounded-2xl p-3 shadow-glow-squad sm:block lg:-right-14">
              <p className="flex items-center gap-2 font-display text-sm font-semibold text-squad">
                <UsersRound className="size-4" /> Tu Squad está en
              </p>
              <p className="mt-1 text-xs text-muted">📍 Pista Principal · hace 2 min</p>
            </div>
            <div className="glass absolute -left-4 bottom-20 hidden w-44 rounded-2xl p-3 shadow-glow-vip sm:block lg:-left-12">
              <p className="flex items-center gap-2 font-display text-sm font-semibold text-vip">
                <Zap className="size-4" /> Pedido listo
              </p>
              <p className="mt-1 text-xs text-muted">Retirá con tu QR · K7P2</p>
            </div>
          </div>
        </section>

        {/* Marquesina */}
        <div className="border-y border-white/5 bg-surface/50 py-4" aria-hidden>
          <div className="flex w-max animate-marquee gap-10 font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-10">
                {["Lobby por afinidad", "Squads", "Pin-Drop 15 min", "Rescate 🚨", "Barra Express", "Mesa VIP", "QR Drops", "Sorteos en vivo", "Pantalla LED", "Line-up"].map((w) => (
                  <span key={w + k} className="flex items-center gap-10">
                    {w} <span className="text-rouge">●</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Cómo funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">De la puerta a la pista en cuatro toques.</h2>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ n, title, text, icon: Icon, img, tone }) => (
              <article key={n} className="glass flex flex-col rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <span className="metric text-sm text-muted">{n}</span>
                  <span className={cn("grid size-10 place-items-center rounded-xl", { rouge: "bg-rouge/12 text-rouge", squad: "bg-squad/12 text-squad", vip: "bg-vip/12 text-vip" }[tone])}>
                    <Icon className="size-5" />
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted">{text}</p>
                <Phone src={img} alt={title} glow={tone} className="mx-auto mt-6 w-full max-w-[220px] rounded-[1.8rem] border-4" />
              </article>
            ))}
          </div>
        </section>

        {/* Seguridad */}
        <section id="seguridad" className="relative scroll-mt-20 border-y border-white/5 bg-surface/40">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div className="order-2 mx-auto w-full max-w-[320px] lg:order-1">
              <Phone src="/landing/squad.webp" alt="Pantalla del Squad con botón de Rescate y Punto Base" glow="squad" />
            </div>
            <div className="order-1 lg:order-2">
              <Eyebrow tone="squad">Seguridad grupal</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Nadie se queda solo.</h2>
              <p className="mt-4 max-w-lg text-muted">Tu Squad te ve en el plano solo cuando vos querés. Si algo pasa, un toque alcanza: el equipo de seguridad del evento recibe la alerta con tu ubicación.</p>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {SAFETY.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                    <Icon className="size-5 text-squad" />
                    <p className="mt-3 font-display font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-muted">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Organizadores */}
        <section id="organizadores" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
            <div>
              <Eyebrow tone="vip">Para organizadores y boliches</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Más consumo, menos filas, gente que vuelve.</h2>
            </div>
            <p className="text-muted lg:pb-2">
              Operá toda la noche desde un panel: accesos, CRM, avisos, perks, comandas y la pantalla del boliche. Pagás por evento, por asistente activo o con comisión sobre barra y VIP: ROUGE gana cuando tu fiesta funciona.
            </p>
          </div>
          <div className="relative mt-12 overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_100px_rgba(255,184,0,0.12)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/admin.webp" alt="Panel del organizador con ventas, asistentes, matches y embudo de la noche" loading="lazy" className="w-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {B2B.map(({ icon: Icon, title, text }) => (
              <div key={title} className="glass rounded-2xl p-5">
                <Icon className="size-5 text-vip" />
                <p className="mt-3 font-display font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="scroll-mt-20 border-y border-white/5 bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Eyebrow tone="vip">Un login, cada uno a lo suyo</Eyebrow>
            <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">Cada tipo de usuario entra a su pantalla.</h2>
            <p className="mt-4 max-w-2xl text-muted">El dueño/a suma al equipo por @usuario y elige el rol. El servidor exige el permiso de cada acción: la barra no ve el CRM y seguridad no toca la caja.</p>
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((r) => (
                <li key={r}>
                  <Link
                    href={r === "attendee" ? "/login" : "/login?as=staff"}
                    className={cn("glass group flex min-h-[96px] items-center gap-4 rounded-3xl p-5 transition hover:bg-white/10", r === "attendee" && "ring-1 ring-rouge/40")}
                  >
                    <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-2xl", r === "attendee" ? "bg-rouge/12" : "bg-vip/12")} aria-hidden>
                      {ROLE_META[r].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-semibold">{ROLE_META[r].label}</span>
                      <span className="block text-sm text-muted">{ROLE_META[r].description}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* QR */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <Eyebrow>Todo se comparte con QR</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Un link, un QR. Mandalo como quieras.</h2>
            <p className="mt-4 max-w-lg text-muted">La entrada al evento, cada código de 1 uso, la invitación a tu Squad y tu perfil: todos tienen su QR para mostrar en la puerta, mandar por WhatsApp o imprimir.</p>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                [QrCode, "Escaneá y entrás al lobby"],
                [MessageCircle, "Compartí por WhatsApp en un toque"],
                [BarChart3, "Imprimí lotes de códigos para la puerta"],
              ].map(([Icon, t], i) => {
                const I = Icon as typeof QrCode;
                return (
                  <li key={i} className="flex items-center gap-3">
                    <I className="size-4 text-rouge" /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mx-auto flex flex-col items-center gap-4">
            <div className="rounded-[2rem] bg-white p-5 shadow-glow-rouge">
              <QRCodeSVG value={joinLink} size={220} level="M" bgColor="#FFFFFF" fgColor="#070709" aria-label="QR para entrar al evento" />
            </div>
            <p className="text-center text-sm text-muted">
              {event ? (
                <>
                  Escaneá para entrar a <span className="font-semibold text-primary">{event.name}</span>
                </>
              ) : (
                "Escaneá para ingresar tu código"
              )}
            </p>
          </div>
        </section>

        {/* CTA final */}
        <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] border border-rouge/30 bg-rouge/10 px-6 py-14 text-center sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-[360px] -translate-x-1/2 rounded-full bg-rouge/30 blur-[120px]" />
            <h2 className="relative font-display text-4xl font-bold tracking-tight sm:text-5xl">¿Esta noche salís?</h2>
            <p className="relative mx-auto mt-3 max-w-md text-muted">Entrá con el link de tu entrada o armá tu evento en minutos.</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/join" className={buttonVariants({ size: "lg" })}>
                <Ticket /> Tengo una entrada
              </Link>
              <Link href="/login?as=staff&next=/admin/events" className={buttonVariants({ size: "lg", variant: "vip" })}>
                Organizar un evento <ArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <span className="font-display text-lg font-bold text-rouge">ROUGE</span>
          <span>La noche, conectada. +18.</span>
          <div className="ml-auto flex gap-5">
            <Link href="/login" className="hover:text-primary">Entrar</Link>
            <Link href="/login?as=staff" className="hover:text-primary">Equipo</Link>
            <Link href="/join" className="hover:text-primary">Tengo un código</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
