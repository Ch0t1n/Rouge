"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarCog, Gift, Heart, MapPin, Martini, Megaphone, Ticket, Timer, TrendingUp, Tv, Users, UsersRound } from "lucide-react";
import { crmRows, eventMetrics, SMART_TAG_META } from "@/lib/engine/analytics";
import { activeEvent, lobbyPhase, squadOf } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney, whatsappLink } from "@/lib/utils";
import { AdminHeader, Panel } from "@/components/admin/AdminChrome";
import { SecurityPanel } from "@/components/admin/SecurityPanel";
import { ReportsPanel } from "@/components/admin/ReportsPanel";
import { LiveCurvesPanel } from "@/components/admin/LiveCurvesPanel";
import { permissionForPath } from "@/lib/engine/roles";
import { Badge, LiveDot } from "@/components/ui/badge";

/** Minutos de fila que se estima ahorra cada pedido por Barra Express (supuesto comercial). */
const QUEUE_MINUTES_SAVED = 12;

export default function AdminOverviewPage() {
  const { state, role, can } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const m = useMemo(() => eventMetrics(state, event.id, now), [state, event.id, now]);
  const rows = useMemo(() => crmRows(state, event.id), [state, event.id]);
  const codes = state.event_invite_codes.filter((c) => c.event_id === event.id);
  const orders = state.bar_orders.filter((o) => o.event_id === event.id);
  const phase = lobbyPhase(event, now);
  const live = phase === "live";

  const buyers = new Set(orders.flatMap((o) => [o.user_id, ...o.split_user_ids])).size;
  const withMatch = new Set(state.connections.filter((c) => c.event_id === event.id && c.status === "accepted").flatMap((c) => [c.sender_id, c.receiver_id])).size;
  const inSquad = state.event_attendees.filter((a) => a.event_id === event.id && squadOf(state, event.id, a.user_id)).length;
  const avgTicket = orders.length ? m.barRevenue / orders.length : 0;
  const funnel = [
    { label: "Entraron a la app", value: m.attendees, color: "bg-rouge" },
    { label: "Armaron o se sumaron a un Squad", value: inSquad, color: "bg-squad" },
    { label: "Hicieron al menos un Match", value: withMatch, color: "bg-rouge" },
    { label: "Compraron por Barra Express", value: buyers, color: "bg-vip" },
  ];

  const kpis = [
    { label: "Ventas por la app", value: formatMoney(m.barRevenue), sub: `Ticket promedio ${formatMoney(avgTicket)} · ${orders.length} pedidos`, icon: TrendingUp, tone: "vip" },
    { label: "Asistentes en la app", value: m.attendees, sub: `${Math.round((m.attendees / event.max_capacity) * 100)}% del cupo · ${Math.round(m.femaleShare * 100)}% público femenino`, icon: Users, tone: "rouge" },
    { label: "Matches de la noche", value: m.matches, sub: `${m.icebreakersSent} rompehielos · ${m.pendingConnections} solicitudes pendientes`, icon: Heart, tone: "rouge" },
    { label: "Squads activos", value: m.squads, sub: `${m.usersInSquads} personas · el más grande: ${m.biggestSquad?.size ?? 0}`, icon: UsersRound, tone: "squad" },
    { label: "Filas evitadas", value: `${Math.round((orders.length * QUEUE_MINUTES_SAVED) / 60)} h`, sub: `≈${QUEUE_MINUTES_SAVED} min por pedido · ${m.openOrders} pedidos abiertos`, icon: Timer, tone: "squad" },
    { label: "Perks canjeados", value: `${m.perksRedeemed}/${m.perksIssued}`, sub: `${m.activePins} pines activos en el plano`, icon: Gift, tone: "vip" },
  ] as const;

  const modules = [
    { href: "/admin/events", label: "Eventos y accesos", sub: `${codes.filter((c) => !c.is_used && !c.revoked_at).length} códigos libres`, icon: CalendarCog },
    { href: "/admin/blasts", label: "Text Blast / Flash Promo", sub: "Avisos push segmentados", icon: Megaphone },
    { href: "/admin/perks", label: "Perks y sorteo en vivo", sub: `${state.raffles.filter((r) => r.event_id === event.id && !r.winner_user_id).length} sorteos pendientes`, icon: Gift },
    { href: "/admin/bar-pos", label: "Comandas de barra", sub: `${m.openOrders} pedidos abiertos`, icon: Martini },
    { href: "/admin/live-wall", label: "Pantalla gigante LED", sub: "Para conectar por HDMI", icon: Tv },
  ].filter((x) => can(permissionForPath(x.href)!));
  const security = role === "security";

  return (
    <main className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-8 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title={event.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={live ? "live" : "neutral"} size="md">
              {live && <LiveDot />} {live ? "En vivo" : phase === "upcoming" ? "Próximo" : phase === "expired" ? "Finalizado" : "Lobby abierto"}
            </Badge>
            {event.venue_name}
          </span>
        }
        actions={
          security ? undefined : <Link href="/admin/events" className="glass flex min-h-touch items-center gap-2 rounded-2xl px-4 text-sm">
            <Ticket className="size-4 text-vip" /> <code className="font-display font-semibold">/join/{event.slug}</code>
            <span className="text-muted">· {codes.filter((c) => c.is_used).length}/{codes.length} códigos usados</span>
          </Link>
        }
      />

      {(security || m.rescueAlerts > 0) && <SecurityPanel event={event} />}
      <ReportsPanel event={event} />

      {security ? (
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Asistentes en la app", value: m.attendees, sub: `${Math.round((m.attendees / event.max_capacity) * 100)}% del cupo`, icon: Users },
            { label: "Squads activos", value: m.squads, sub: `${m.usersInSquads} personas cuidándose entre sí`, icon: UsersRound },
            { label: "Pines en el plano", value: m.activePins, sub: "Se borran solos a los 15 min", icon: MapPin },
          ].map(({ label, value, sub, icon: Icon }) => (
            <div key={label} className="glass rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{label}</p>
                <Icon className="size-[18px] text-squad" />
              </div>
              <p className="metric mt-3 text-4xl">{value}</p>
              <p className="mt-1 text-xs text-muted">{sub}</p>
            </div>
          ))}
        </section>
      ) : (
        <>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ label, value, sub, icon: Icon, tone }) => (
          <div key={label} className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{label}</p>
              <span className={cn("grid size-9 place-items-center rounded-xl", { rouge: "bg-rouge/15 text-rouge", squad: "bg-squad/15 text-squad", vip: "bg-vip/15 text-vip" }[tone])}>
                <Icon className="size-[18px]" />
              </span>
            </div>
            <p className="metric mt-3 text-4xl">{value}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </div>
        ))}
      </section>

      {!security && <LiveCurvesPanel event={event} />}

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Embudo de la noche" className="xl:col-span-2">
          <ul className="space-y-3">
            {funnel.map((f) => (
              <li key={f.label}>
                <div className="flex justify-between text-sm">
                  <span>{f.label}</span>
                  <span className="metric">
                    {f.value} <span className="text-xs font-normal text-muted">({m.attendees ? Math.round((f.value / m.attendees) * 100) : 0}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cn("h-full rounded-full", f.color)} style={{ width: `${m.attendees ? (f.value / m.attendees) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Cada paso es una persona que conectó, no se perdió o consumió sin fila: lo que hace que vuelvan a comprar entrada.</p>
        </Panel>

        <Panel title="Módulos">
          <ul className="space-y-1">
            {modules.map(({ href, label, sub, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-touch items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5">
                  <Icon className="size-5 text-vip" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block truncate text-xs text-muted">{sub}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Top consumo" action={<Link href="/admin/crm" className="text-xs font-semibold text-vip">CRM completo →</Link>} className="overflow-hidden p-0 xl:col-span-2 [&>div:first-child]:px-5 [&>div:first-child]:pt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <tbody>
                {rows.slice(0, 5).map((r) => (
                  <tr key={r.user_id} className="border-t border-white/5">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{r.full_name}</p>
                      <p className="text-xs text-muted">
                        @{r.username}
                        {r.phone && (
                          <>
                            {" · "}
                            <a href={whatsappLink(r.phone)} target="_blank" rel="noreferrer" className="text-squad hover:underline">WhatsApp</a>
                          </>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <Badge key={t} tone={SMART_TAG_META[t].color}>{SMART_TAG_META[t].emoji} {SMART_TAG_META[t].label}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="metric px-5 py-3 text-right text-vip">{formatMoney(r.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Temas más votados">
          <ol className="space-y-3">
            {m.topSongs.map((sng, i) => (
              <li key={sng.id} className="flex items-center gap-3">
                <span className="metric w-6 text-xl text-rouge">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{sng.title}</p>
                  <p className="truncate text-xs text-muted">{sng.artist}</p>
                </div>
                <span className="metric text-muted">{sng.voter_ids.length}▲</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5" /> {m.activePins} pines activos ahora</p>
        </Panel>
      </section>
        </>
      )}
    </main>
  );
}
