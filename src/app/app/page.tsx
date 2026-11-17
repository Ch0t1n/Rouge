"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, ArrowRight, ChevronRight, Clock3, Crown, DoorOpen, Flag, Gift, Heart, LayoutDashboard, MapPin, Martini, QrCode, ShieldCheck, Users, Zap } from "lucide-react";
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
import { useRequireProfile } from "@/lib/store/hooks";
import { buttonVariants } from "@/components/ui/button";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { LineupBanner } from "@/components/event/LineupBanner";
import { PersonaSwitcher } from "@/components/layout/PersonaSwitcher";
import { VenueMap } from "@/components/venue/VenueMap";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveDot } from "@/components/ui/badge";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import { useShare } from "@/components/share/ShareSheet";
import { ROLE_META, roleHome } from "@/lib/engine/roles";
import { eventTheme } from "@/lib/engine/branding";
import { squadAccount } from "@/lib/engine/settle";
import { BrandLogo } from "@/components/brand/BrandTheme";
import { DynamicQr } from "@/components/perks/DynamicQr";
import { BottomSheet } from "@/components/ui/bottom-sheet";

const PHASE_LABEL: Record<LobbyPhase, string> = {
  upcoming: "Próximamente",
  open: "Lobby abierto",
  live: "En vivo",
  afterglow: "After · lobby abierto",
  expired: "Lobby cerrado",
};

export default function HomePage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Home />;
}

function Home() {
  const { state, mode, notify, isStaff, role } = useRouge();
  const shareSheet = useShare();
  const router = useRouter();
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
  const theme = eventTheme(state, event.id);
  const [pass, setPass] = useState(false);
  const account = data.squad ? squadAccount(state, data.squad.squad.id, me.id) : null;
  const flashLeft = data.flash?.expires_at ? Math.max(0, Math.ceil((+new Date(data.flash.expires_at) - now) / 60_000)) : 0;

  return (
    <main className="safe-top pb-10">
      {shareSheet.sheet}
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-background/80 px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {theme.logo_url ? (
            <BrandLogo theme={theme} className="h-9 max-w-[150px]" />
          ) : (
            <span className="font-display text-[26px] font-bold leading-none tracking-tight text-rouge text-glow-rouge">ROUGE</span>
          )}
          <Badge tone={mode === "demo" ? "vip" : "squad"}>{mode === "demo" ? "Modo Demo" : "Supabase"}</Badge>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <Link href="/profile" aria-label="Mi perfil" className="glass grid size-11 place-items-center rounded-full">
            <UserRound className="size-5" />
          </Link>
          <PersonaSwitcher />
        </div>
      </header>

      <div className="space-y-4 px-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <div className="lg:col-span-2">
          <LineupBanner event={event} />
        </div>

        {/* Hero del evento */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rouge/25 via-surface to-squad/10 p-5 lg:col-span-2">
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
              <button
                type="button"
                onClick={() => shareSheet.open({ url: `/join/${event.slug}`, title: `Invitá a ${event.name}`, text: `Entrá al lobby de ${event.name} en ROUGE 🔴`, fileName: `rouge-${event.slug}`, accent: "rouge" })}
                className="glass-pill inline-flex min-h-[32px] items-center gap-1 hover:bg-white/10"
                aria-label="QR para invitar al evento"
              >
                <QrCode className="size-3.5" /> /join/{event.slug}
              </button>
              <span className="glass-pill inline-flex items-center gap-1 text-vip">⏳ Lobby cierra en {hoursToClose} h</span>
            </div>
            <Link href="/profile" className="mt-4 flex min-h-touch items-center justify-between gap-3 rounded-2xl bg-black/30 p-3 transition hover:bg-black/40">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar profile={me} size={44} ring="rouge" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Hola, {me.full_name.split(" ")[0]}</p>
                  <p className="truncate text-xs text-muted">{attendee ? (mood ? `${mood.emoji} ${mood.label}` : "Elegí tu mood de la noche") : "Todavía no entraste al lobby"}</p>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
                {attendee?.ghost_mode && <Badge>👻 Ghost</Badge>} Mi perfil <ChevronRight className="size-4" />
              </span>
            </Link>
            {phase !== "expired" && phase !== "upcoming" && (
              <Link href={attendee ? "/lobby" : `/join/${event.slug}`} className={cn(buttonVariants({ size: "lg", block: true }), "mt-3")}>
                <DoorOpen /> {attendee ? "Ir al lobby" : "Entrar al lobby"}
              </Link>
            )}
          </div>
        </section>

        {/* Mi entrada: pase para escanear en la puerta */}
        {attendee && phase !== "expired" && (
          <button type="button" onClick={() => setPass(true)} className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left transition hover:bg-white/10" data-testid="my-pass">
            <QrCode className="size-6 shrink-0 text-squad" />
            <span className="min-w-0 flex-1 text-sm">
              <b className="block">Mi entrada</b>
              <span className="text-muted">{attendee.checked_in_at ? `Ya entraste a las ${new Date(attendee.checked_in_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} ✓` : "Mostrá este QR en la puerta"}</span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </button>
        )}
        <BottomSheet open={pass} onClose={() => setPass(false)} title="Mi entrada" description="Mostralo en la puerta: el personal ve tu foto y tu nombre.">
          <div className="space-y-3 text-center">
            <DynamicQr eventId={event.id} kind="PASS" refId={me.id} label={`${me.full_name} · ${event.name}`} tone="squad" />
            <p className="text-xs text-muted">Si tenés la entrada de la ticketera, también sirve su QR.</p>
          </div>
        </BottomSheet>

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
        <section className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
          <StatTile href="/lobby" icon={<Users />} tone="rouge" value={data.grid.length} label="Asistentes visibles" hint="Ir a la grilla →" />
          <StatTile href="/inbox" icon={<Heart />} tone="rouge" value={data.matches.length} label="Matches" hint={`${data.inbox.length} en tu bandeja`} />
          <StatTile href="/perks" icon={<Gift />} tone="vip" value={data.perks.length} label="Perks & QRs" hint="listos para canjear" />
          <StatTile href="/bar" icon={<Martini />} tone="vip" value={data.orders.length} label="Barra Express" hint="Pedí sin hacer fila →" />
        </section>

        {/* Squad */}
        {data.squad ? (
          <Link href="/squad" className="glass block rounded-3xl p-4 transition hover:bg-white/10">
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
          </Link>
        ) : null}
        {/* Cuentas de la mesa: quién pagó qué y cuánto transferir (sigue visible después del cierre). */}
        {account && account.ledger.length > 0 && (
          <Link href="/squad/cuentas" className="flex items-center gap-3 rounded-3xl border border-vip/30 bg-vip/[0.06] p-4" data-testid="home-cuentas">
            <span className="text-2xl" aria-hidden>🧾</span>
            <span className="min-w-0 flex-1 text-sm">
              <b className="block">Cuentas de la mesa</b>
              <span className="text-muted">
                {account.iOwe.length
                  ? `Te toca transferir ${formatMoney(account.iOwe.reduce((a, t) => a + t.amount, 0))}`
                  : account.owedToMe.length
                    ? `Te tienen que pasar ${formatMoney(account.owedToMe.reduce((a, t) => a + t.amount, 0))}`
                    : "Están a mano 🙌"}
                {" · "}
                {formatMoney(account.total)} en total
              </span>
            </span>
            <ArrowRight className="size-5 text-muted" />
          </Link>
        )}
        {!data.squad && (
          attendee && (
            <Link href="/squad" className="flex items-center gap-3 rounded-3xl border border-squad/30 bg-squad/[0.06] p-4">
              <Users className="size-6 text-squad" />
              <span className="flex-1 text-sm"><b>Armá tu Squad</b> · se ven en el plano, botón de rescate y perks para el grupo.</span>
              <ArrowRight className="size-5 text-muted" />
            </Link>
          )
        )}

        {/* Plano */}
        <section>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="text-lg">Plano en vivo</h2>
              <Link href="/map" className="-my-3 inline-flex min-h-touch items-center text-xs font-semibold text-squad">Abrir plano y dejar mi pin →</Link>
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
            onTap={() => router.push("/map")}
            onPinClick={(vp) =>
              notify({
                tone: vp.audience === "match" ? "rouge" : vp.audience === "squad" ? "squad" : "info",
                title: `${vp.profile.full_name.split(" ")[0]} · ${vp.pin.sector_name ?? "Plano"}`,
                description: `${vp.pin.note ?? "Sin nota"} — expira en ${vp.minutesLeft} min`,
              })
            }
          />
        </section>

        <Link href="/settings/privacy" className="glass flex min-h-touch items-center gap-3 rounded-2xl p-4 transition hover:bg-white/5">
          <span className="grid size-10 place-items-center rounded-xl bg-squad/15 text-squad">
            <ShieldCheck className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-display font-semibold">Privacidad y lista negra</p>
            <p className="text-xs text-muted">Bloqueá números o perfiles · invisibilidad mutua</p>
          </div>
          <ArrowRight className="size-5 text-muted" />
        </Link>

        {/* Rouge Wrapped: tu noche en una tarjeta para Stories */}
        <Link href="/wrapped" className="glass flex min-h-touch items-center gap-3 rounded-2xl border-rouge/30 p-4 transition hover:bg-white/5">
          <span className="grid size-10 place-items-center rounded-xl bg-rouge/15 text-xl">✨</span>
          <div className="flex-1">
            <p className="font-display font-semibold">Tu Rouge Wrapped</p>
            <p className="text-xs text-muted">Tu noche en una tarjeta para Instagram Stories</p>
          </div>
          <ArrowRight className="size-5 text-muted" />
        </Link>

        {isStaff && (
          <Link href={roleHome(role)} className="glass flex min-h-touch items-center gap-3 rounded-2xl p-4 transition hover:bg-white/5">
            <span className="grid size-10 place-items-center rounded-xl bg-vip/15 text-vip">
              <LayoutDashboard className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-display font-semibold">Panel del equipo</p>
              <p className="text-xs text-muted">
                Entrás como {ROLE_META[role].emoji} {ROLE_META[role].label}
              </p>
            </div>
            <ArrowRight className="size-5 text-muted" />
          </Link>
        )}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-muted/70">
          <Crown className="size-3" /> {state.event_attendees.filter((a) => a.event_id === event.id).length} asistentes en la app ·{" "}
          <MapPin className="size-3" /> {data.pins.length} pines visibles para vos
        </p>
      </div>

    </main>
  );
}

function StatTile({ href, icon, value, label, hint, tone }: { href: string; icon: React.ReactNode; value: number; label: string; hint: string; tone: "rouge" | "squad" | "vip" }) {
  const color = { rouge: "text-rouge bg-rouge/15", squad: "text-squad bg-squad/15", vip: "text-vip bg-vip/15" }[tone];
  return (
    <Link href={href} className="glass block rounded-2xl p-3.5 transition hover:bg-white/10 active:scale-[0.98]">
      <span className={cn("grid size-9 place-items-center rounded-xl [&_svg]:size-[18px]", color)}>{icon}</span>
      <p className="metric mt-3 text-3xl leading-none">{value}</p>
      <p className="mt-1 text-[13px] font-semibold">{label}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </Link>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted">
      <span className={cn("size-2 rounded-full", className)} /> {label}
    </span>
  );
}
