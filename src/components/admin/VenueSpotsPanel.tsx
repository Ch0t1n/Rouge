"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { RougeEvent, VenueSpotKind } from "@/lib/types";
import { SPOT_KINDS, spotsOf } from "@/lib/engine/meetings";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { VenueMap, type MapMark } from "@/components/venue/VenueMap";

/**
 * Salas, mesas y puntos de encuentro del evento (tabla `venue_spots`): los asistentes los eligen al pedir una reunión.
 * Con cupo, el servidor no deja reservar la misma sala dos veces en el mismo horario (spot_busy). Tocá el plano para
 * ubicarlos. Un lugar con reuniones no se borra: se desactiva.
 */
export function VenueSpotsPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const spots = spotsOf(state, event.id, false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<VenueSpotKind>(event.kind === "corporate" ? "room" : "table");
  const [capacity, setCapacity] = useState("1");
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const meetingsBySpot = (id: string) => state.meetings.filter((m) => m.spot_id === id && m.status === "accepted").length;

  const add = async () => {
    const cap = capacity.trim() === "" ? null : Number(capacity);
    const r = await exec(C.upsertVenueSpot(event.id, { name, kind, capacity: cap, coord_x: point?.x ?? null, coord_y: point?.y ?? null }));
    if (!r.ok) return;
    notify({ tone: "squad", title: `${r.data.name} agregado ✓`, duration: 2200 });
    setName("");
    setPoint(null);
  };

  const marks: MapMark[] = spots
    .filter((s) => s.coord_x != null && s.coord_y != null)
    .map((s) => ({ key: s.id, x: s.coord_x!, y: s.coord_y!, label: s.name, icon: SPOT_KINDS.find((k) => k.id === s.kind)?.emoji ?? "📍", tone: s.is_active ? "squad" : "muted" }));

  return (
    <Panel title="Salas, mesas y puntos de encuentro">
      <p className="-mt-2 mb-4 text-sm text-muted">
        {event.kind === "corporate"
          ? "Para la ronda de negocios: quien pide una reunión elige una sala libre o una mesa del coffee. El cupo evita reservas superpuestas."
          : "Mesas VIP y puntos de encuentro para que los matches se encuentren sin perderse."}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <ul className="space-y-2">
            {spots.length === 0 && <li className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">Todavía no cargaste lugares.</li>}
            {spots.map((s) => (
              <li key={s.id} className={cn("flex items-center gap-3 rounded-2xl border border-white/10 p-3", !s.is_active && "opacity-60")}>
                <span className="text-xl" aria-hidden>
                  {SPOT_KINDS.find((k) => k.id === s.kind)?.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">
                    {SPOT_KINDS.find((k) => k.id === s.kind)?.label} · {s.capacity ? `${s.capacity} a la vez` : "sin límite"} · {meetingsBySpot(s.id)} reuniones · {s.coord_x != null ? "en el plano" : "sin ubicar"}
                    {!s.is_active && " · desactivado"}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={s.is_active ? `Desactivar ${s.name}` : `Activar ${s.name}`}
                  title={s.is_active ? "Desactivar" : "Activar"}
                  onClick={() => void exec(C.upsertVenueSpot(event.id, { ...s, is_active: !s.is_active }))}
                >
                  {s.is_active ? <EyeOff /> : <Eye />}
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Borrar ${s.name}`} title="Borrar" onClick={() => void exec(C.deleteVenueSpot(event.id, s.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <div className="space-y-3 rounded-2xl border border-white/10 p-3">
            <TextField label="Nombre" placeholder={event.kind === "corporate" ? "Sala 5" : "Mesa VIP 2"} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de lugar">
              {SPOT_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={cn("min-h-touch rounded-xl border px-2 text-xs font-semibold", kind === k.id ? "border-squad bg-squad/15 text-primary" : "border-white/10 text-muted")}
                >
                  {k.emoji} {k.label}
                </button>
              ))}
            </div>
            <TextField label="Reuniones a la vez (vacío = sin límite)" type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <p className="text-xs text-muted">{point ? `Ubicado en el plano (${Math.round(point.x)}, ${Math.round(point.y)}).` : "Tocá el plano para ubicarlo (opcional)."}</p>
            <Button block onClick={add} disabled={name.trim().length < 2}>
              <Plus /> Agregar lugar
            </Button>
          </div>
        </div>
        <VenueMap layout={event.venue_layout_json} mapImageUrl={event.venue_map_url} marks={marks} draft={point} onTap={(x, y) => setPoint({ x, y })} className="aspect-[3/4] max-h-[520px]" />
      </div>
    </Panel>
  );
}
