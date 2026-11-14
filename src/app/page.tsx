"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Check, Clock3, Crown, Flag, Gift, Heart, LayoutDashboard, MapPin, Martini, Ticket, Users, Zap } from "lucide-react";
import { MOOD_TAGS } from "@/lib/types";
import {
  activeEvent,
  currentUser,
  getAttendee,
  inboxOf,
  lobbyPhase,
  matchesOf,
  ordersOf,
  perksOf,
  squadMembers,
  squadOf,
  visibleAttendees,
  visiblePins,
  type LobbyPhase,
} from "@/lib/engine/selectors";
import { blastsFor } from "@/lib/engine/actions";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { LineupBanner } from "@/components/event/LineupBanner";
import { PersonaSwitcher } from "@/components/layout/PersonaSwitcher";
import { VenueMap } from "@/components/venue/VenueMap";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveDot } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";

const PHASE_LABEL: Record<LobbyPhase, string> = {
  upcoming: "Próximamente",
  open: "Lobby abierto",
  live: "En vivo",
  afterglow: "After · lobby abierto",
  expired: "Lobby cerrado",
};

const ROADMAP = [
  { n: 1, title: "Cimientos, identidad, SQL y Mock Data", done: true },
  { n: 2, title: "Onboarding, perfil, Spotify y bloqueo por teléfono", done: false },
  { n: 3, title: "Lobby: grilla por afinidad, Ghost Mode, Rompehielos", done: false },
  { n: 4, title: "Squads, seguridad, Pin-Drop 15m, chat y perks", done: false },
  { n: 5, title: "Suite B2B: CRM, Blasts, sorteos, barra y LED", done: false },
];

export default function HomePage() {
  const { state, mode, notify } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const me = currentUser(state)!;
  const attendee = getAttendee(state, event.id, me.id);
  const phase = lobbyPhase(event, now);

  const data = useMemo(() => {
    const sq = squadOf(state, event.id, me.id);
    return {
      grid: visibleAttendees(state, event.id, me.id),
      matches: matchesOf(state, me.id, event.id),
      inbox: inboxOf(state, me.id, event.id),
      squad: sq ? { ...sq, members: squadMembers(state, sq.squad.id) } : null,
      perks: perksOf(state, me.id, event.id).filter((p) => p.status === "available"),
      orders: ordersOf(state, me.id, event.id).filter((o) => o.status !== "completed"),
      pins: visiblePins(state, event.id, me.id, now),
      flash: blastsFor(state, event.id, me.id, now).find((b) => b.is_flash_promo && b.expires_at && +new Date(b.expires_at) > now),
    };
  }, [state, event.id, me.id, now]);

  const hoursToClose = Math.max(0, Math.round((+new Date(event.lobby_expires_at) - now) / 3_600_000));
  const mood = MOOD_TAGS.find((m) => m.id === attendee?.mood_tag);
  const flashLeft = data.flash?.expires_at ? Math.max(0, Math.ceil((+new Date(data.flash.expires_at) - now) / 60_000)) : 0;

  return (
    <main className="safe-top pb-10">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-background/80 px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="font-display text-[26px] font-bold leading-none tracking-tight text-rouge text-glow-rouge">ROUGE</span>
          <Badge tone={mode === "demo" ? "vip" : "squad"}>{mode === "demo" ? "Modo Demo" : "Supabase"}</Badge>
        </div>
        <PersonaSwitcher />
      </header>

      <div className="space-y-4 px-4">
        <LineupBanner event={event} />

        {/* Hero del evento */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rouge/25 via-surface to-squad/10 p-5">
          <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-rouge/30 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Badge tone={phase === "live" ? "live" : "neutral"} size="md">
                {phase === "live" && <LiveDot />} {PHASE_LABEL[phase]}
              </Badge>
              <span className="text-xs text-muted">{event.venue_name}</span>
            </div>
            <h1 className="mt-3 text-[28px] leading-[1.05]">{event.name}</h1>
            <p className="mt-2 text-sm text-muted">{event.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="glass-pill inline-flex items-center gap-1">
                <Clock3 className="size-3.5" /> {formatDateTime(event.starts_at)}
              </span>
              <span className="glass-pill inline-flex items-center gap-1">
                <Ticket className="size-3.5" /> /join/{event.slug}
              </span>
              <span className="glass-pill inline-flex items-center gap-1 text-vip">⏳ Lobby cierra en {hoursToClose} h</span>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-black/30 p-3">
              <div className="flex items-center gap-3">
                <Avatar profile={me} size={44} ring="rouge" />
                <div>
                  <p className="text-sm font-semibold">Hola, {me.full_name.split(" ")[0]}</p>
                  <p className="text-xs text-muted">{mood ? `${mood.emoji} ${mood.label}` : "Elegí tu mood de la noche"}</p>
                </div>
              </div>
              {attendee?.ghost_mode && <Badge>👻 Ghost</Badge>}
            </div>
          </div>
        </section>

        {/* Flash promo (Text Blast) */}
        {data.flash && (
          <section className="relative overflow-hidden rounded-2xl border border-vip/40 bg-vip/10 p-4 shadow-glow-vip">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-vip text-background">
                <Zap className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-vip">{data.flash.title}</p>
                <p className="mt-0.5 text-sm text-primary/90">{data.flash.message}</p>
              </div>
              <span className="metric shrink-0 text-lg text-vip">{flashLeft}′</span>
            </div>
          </section>
        )}

        {/* Métricas personales */}
        <section className="grid grid-cols-2 gap-3">
          <StatTile icon={<Users />} tone="rouge" value={data.grid.length} label="Asistentes visibles" hint="sin bloqueados ni ghost" />
          <StatTile icon={<Heart />} tone="rouge" value={data.matches.length} label="Matches" hint={`${data.inbox.length} en tu bandeja`} />
          <StatTile icon={<Gift />} tone="vip" value={data.perks.length} label="Perks & QRs" hint="listos para canjear" />
          <StatTile icon={<Martini />} tone="squad" value={data.orders.length} label="Pedidos activos" hint="Barra Express" />
        </section>

        {/* Squad */}
        {data.squad && (
          <section className="glass rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-squad">Tu Squad</p>
                <h2 className="text-lg">{data.squad.squad.name}</h2>
              </div>
              {data.squad.squad.has_vip_table_to_share && <Badge tone="vip">🍾 Mesa VIP</Badge>}
            </div>
            <div className="mt-3 flex -space-x-2">
              {data.squad.members.map((m) => {
                const p = state.profiles.find((x) => x.id === m.user_id);
                return p ? <Avatar key={m.id} profile={p} size={40} ring="squad" className="ring-offset-2 ring-offset-surface" /> : null;
              })}
            </div>
            {data.squad.squad.base_pin_label && (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                <Flag className="mt-0.5 size-4 shrink-0 text-vip" />
                <span>
                  Punto Base: <span className="text-primary">{data.squad.squad.base_pin_label}</span>
                </span>
              </p>
            )}
          </section>
        )}

        {/* Plano */}
        <section>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="text-lg">Plano en vivo</h2>
              <p className="text-xs text-muted">Pellizcá para hacer zoom · tocá un sector</p>
            </div>
            <div className="flex gap-3 text-[11px] font-semibold">
              <Legend className="bg-squad" label="Squad" />
              <Legend className="bg-rouge" label="Match" />
              <Legend className="bg-vip" label="Base" />
            </div>
          </div>
          <VenueMap
            layout={event.venue_layout_json}
            pins={data.pins}
            basePin={
              data.squad?.squad.base_pin_x != null
                ? { x: data.squad.squad.base_pin_x, y: data.squad.squad.base_pin_y!, label: data.squad.squad.base_pin_label ?? "Punto Base" }
                : null
            }
            onTap={(_x, _y, sector) => notify({ tone: "info", title: sector ? `📍 ${sector.name}` : "Fuera de los sectores", description: "El Pin-Drop de 15 min llega en la Fase 4.", duration: 2200 })}
            onPinClick={(vp) =>
              notify({
                tone: vp.audience === "match" ? "rouge" : vp.audience === "squad" ? "squad" : "info",
                title: `${vp.profile.full_name.split(" ")[0]} · ${vp.pin.sector_name ?? "Plano"}`,
                description: `${vp.pin.note ?? "Sin nota"} — expira en ${vp.minutesLeft} min`,
              })
            }
          />
        </section>

        {/* Roadmap */}
        <section className="glass rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Roadmap del MVP</h2>
            <Badge tone="squad">Fase 1/5</Badge>
          </div>
          <ol className="mt-3 space-y-2">
            {ROADMAP.map((f) => (
              <li key={f.n} className="flex items-center gap-3 text-sm">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-bold", f.done ? "bg-squad text-background" : "bg-white/5 text-muted")}>
                  {f.done ? <Check className="size-4" /> : f.n}
                </span>
                <span className={f.done ? "text-primary" : "text-muted"}>{f.title}</span>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/admin" className="glass flex min-h-touch items-center gap-3 rounded-2xl p-4 transition hover:bg-white/5">
          <span className="grid size-10 place-items-center rounded-xl bg-vip/15 text-vip">
            <LayoutDashboard className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-display font-semibold">Panel del Organizador</p>
            <p className="text-xs text-muted">Vista expandida para desktop · métricas en vivo</p>
          </div>
          <ArrowRight className="size-5 text-muted" />
        </Link>

        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-muted/70">
          <Crown className="size-3" /> {state.event_attendees.filter((a) => a.event_id === event.id).length} asistentes en la app ·{" "}
          <MapPin className="size-3" /> {data.pins.length} pines visibles para vos
        </p>
      </div>
    </main>
  );
}

function StatTile({ icon, value, label, hint, tone }: { icon: React.ReactNode; value: number; label: string; hint: string; tone: "rouge" | "squad" | "vip" }) {
  const color = { rouge: "text-rouge bg-rouge/12", squad: "text-squad bg-squad/12", vip: "text-vip bg-vip/12" }[tone];
  return (
    <div className="glass rounded-2xl p-3.5">
      <span className={cn("grid size-9 place-items-center rounded-xl [&_svg]:size-[18px]", color)}>{icon}</span>
      <p className="metric mt-3 text-3xl leading-none">{value}</p>
      <p className="mt-1 text-[13px] font-semibold">{label}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted">
      <span className={cn("size-2 rounded-full", className)} /> {label}
    </span>
  );
}
