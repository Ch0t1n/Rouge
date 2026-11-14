"use client";

import { ShieldCheck, Siren } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { eventRescueAlerts, type VisiblePin } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, timeAgo } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { VenueMap } from "@/components/venue/VenueMap";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveDot } from "@/components/ui/badge";

/**
 * Alertas de rescate activas del evento (rol Seguridad y producción).
 * Muestra quién, en qué sector y con qué Squad; el plano marca cada pin rojo.
 */
export function SecurityPanel({ event, className }: { event: RougeEvent; className?: string }) {
  const { state } = useRouge();
  const now = useNow(10_000);
  const alerts = eventRescueAlerts(state, event.id, now);
  const pins: VisiblePin[] = alerts.filter((a) => a.pin).map((a) => ({ pin: a.pin!, profile: a.profile, audience: "squad", minutesLeft: Math.max(0, Math.round((+new Date(a.pin!.expires_at) - now) / 60_000)) }));

  return (
    <Panel
      className={cn(alerts.length && "border-rouge/50 shadow-glow-rouge", className)}
      title={
        <span className="flex items-center gap-2">
          <Siren className={cn("size-5", alerts.length ? "text-rouge" : "text-muted")} /> Alertas de rescate
        </span>
      }
      action={alerts.length ? <Badge tone="live" size="md"><LiveDot /> {alerts.length} activa{alerts.length > 1 && "s"}</Badge> : <Badge tone="squad" size="md">Todo tranquilo</Badge>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <VenueMap layout={event.venue_layout_json} mapImageUrl={event.venue_map_url} pins={pins} compact className="mx-auto w-full max-w-sm" />
        {alerts.length ? (
          <ul className="space-y-2" role="alert">
            {alerts.map((a) => (
              <li key={a.member.id} className="flex items-center gap-3 rounded-2xl border border-rouge/30 bg-rouge/10 p-3">
                <Avatar profile={a.profile} size={44} ring="rouge" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.profile.full_name}</p>
                  <p className="truncate text-xs text-muted">
                    Squad {a.squad.name}
                    {a.pin ? ` · ${timeAgo(a.pin.created_at, now)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-bold text-rouge">📍 {a.pin?.sector_name ?? a.squad.base_pin_label ?? "Sin ubicación"}</p>
                  {!a.pin && a.squad.base_pin_label && <p className="text-[11px] text-muted">Punto Base</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid place-items-center rounded-2xl border border-white/5 p-6 text-center text-sm text-muted">
            <ShieldCheck className="mb-2 size-8 text-squad" />
            Sin alertas. Cuando alguien toque 🚨 Rescate, aparece acá con su ubicación en el plano.
          </div>
        )}
      </div>
    </Panel>
  );
}
