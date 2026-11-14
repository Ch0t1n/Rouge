"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Heart, Martini, MapPin, Siren, Ticket, TrendingUp, Users, UsersRound } from "lucide-react";
import { crmRows, eventMetrics, SMART_TAG_META } from "@/lib/engine/analytics";
import { activeEvent, lobbyPhase } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { Badge, LiveDot } from "@/components/ui/badge";
import { cn, formatMoney, whatsappLink } from "@/lib/utils";

export default function AdminOverviewPage() {
  const { state } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const m = useMemo(() => eventMetrics(state, event.id, now), [state, event.id, now]);
  const rows = useMemo(() => crmRows(state, event.id).slice(0, 6), [state, event.id]);
  const codes = state.event_invite_codes.filter((c) => c.event_id === event.id);
  const live = lobbyPhase(event, now) === "live";

  const kpis = [
    { label: "Asistentes en la app", value: m.attendees, sub: `${Math.round(m.femaleShare * 100)}% público femenino`, icon: Users, tone: "rouge" },
    { label: "Matches de la noche", value: m.matches, sub: `${m.icebreakersSent} rompehielos · ${m.pendingConnections} pendientes`, icon: Heart, tone: "rouge" },
    { label: "Squads activos", value: m.squads, sub: `${m.usersInSquads} personas · mayor: ${m.biggestSquad?.size ?? 0}`, icon: UsersRound, tone: "squad" },
    { label: "Pines activos", value: m.activePins, sub: m.rescueAlerts ? `${m.rescueAlerts} alerta(s) de rescate` : "Sin alertas de rescate", icon: MapPin, tone: "squad" },
    { label: "Ventas Barra Express", value: formatMoney(m.barRevenue), sub: `${m.openOrders} pedidos abiertos`, icon: Martini, tone: "vip" },
    { label: "Perks canjeados", value: `${m.perksRedeemed}/${m.perksIssued}`, sub: "QR Drops + sorteos", icon: TrendingUp, tone: "vip" },
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-5 py-6 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone={live ? "live" : "neutral"} size="md">
              {live && <LiveDot />} {live ? "En vivo" : lobbyPhase(event, now)}
            </Badge>
            <span className="text-sm text-muted">{event.venue_name}</span>
          </div>
          <h1 className="mt-2 text-3xl lg:text-4xl">{event.name}</h1>
        </div>
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
          <Ticket className="size-4 text-vip" />
          <span className="text-muted">Link maestro</span>
          <code className="font-display font-semibold text-primary">/join/{event.slug}</code>
          <span className="text-muted">·</span>
          <span className="text-muted">{codes.filter((c) => c.is_used).length}/{codes.length} códigos únicos usados</span>
        </div>
      </div>

      {m.rescueAlerts > 0 && (
        <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl border border-rouge/50 bg-rouge/10 p-4 text-rouge shadow-glow-rouge">
          <Siren className="size-5" /> {m.rescueAlerts} asistente(s) activaron el Botón de Rescate. Avisá a seguridad.
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ label, value, sub, icon: Icon, tone }) => (
          <div key={label} className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{label}</p>
              <span className={cn("grid size-9 place-items-center rounded-xl", { rouge: "bg-rouge/12 text-rouge", squad: "bg-squad/12 text-squad", vip: "bg-vip/12 text-vip" }[tone])}>
                <Icon className="size-[18px]" />
              </span>
            </div>
            <p className="metric mt-3 text-4xl">{value}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-3">
        <div className="glass overflow-hidden rounded-3xl xl:col-span-2">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg">Ranking de consumo</h2>
            <span className="text-xs text-muted">CRM completo + CSV en Fase 5</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Asistente</th>
                  <th className="px-3 py-3 font-semibold">Edad</th>
                  <th className="px-3 py-3 font-semibold">Squad</th>
                  <th className="px-3 py-3 font-semibold">Tags</th>
                  <th className="px-5 py-3 text-right font-semibold">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-t border-white/5">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{r.full_name}</p>
                      <p className="text-xs text-muted">
                        @{r.username}
                        {r.phone && (
                          <>
                            {" · "}
                            <a href={whatsappLink(r.phone)} target="_blank" rel="noreferrer" className="text-squad hover:underline">
                              WhatsApp
                            </a>
                          </>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted">{r.age}</td>
                    <td className="px-3 py-3 tabular-nums text-muted">{r.squad_size || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <Badge key={t} tone={SMART_TAG_META[t].color}>
                            {SMART_TAG_META[t].emoji} {SMART_TAG_META[t].label}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="metric px-5 py-3 text-right text-vip">{formatMoney(r.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass rounded-3xl p-5">
          <h2 className="text-lg">Temas más votados</h2>
          <ol className="mt-4 space-y-3">
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
          <Link href="/" className="mt-6 block text-xs text-muted hover:text-primary lg:hidden">
            ← Volver a la app
          </Link>
        </div>
      </section>
    </main>
  );
}
