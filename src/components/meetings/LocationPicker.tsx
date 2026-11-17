"use client";

import { DoorOpen, HelpCircle, MapPin } from "lucide-react";
import type { UUID } from "@/lib/types";
import { SPOT_KINDS, spotAvailability, spotsOf, type MeetingLocation } from "@/lib/engine/meetings";
import { getEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { TextField } from "@/components/ui/field";
import { VenueMap } from "@/components/venue/VenueMap";

const OPTIONS: { kind: MeetingLocation["kind"]; label: string; icon: React.ReactNode }[] = [
  { kind: "spot", label: "Sala o mesa", icon: <DoorOpen className="size-4" /> },
  { kind: "pin", label: "Pin en el plano", icon: <MapPin className="size-4" /> },
  { kind: "tbd", label: "A definir", icon: <HelpCircle className="size-4" /> },
];

/**
 * Dónde se encuentran: una sala/mesa/punto del organizador (con disponibilidad para ese horario), un pin tocando el
 * plano, o "a definir al aceptar". La disponibilidad se vuelve a validar en el servidor (spot_busy).
 */
export function LocationPicker({
  eventId,
  startsAt,
  duration,
  value,
  onChange,
  excludeMeetingId,
  allowTbd = true,
}: {
  eventId: UUID;
  startsAt: string | null;
  duration: number;
  value: MeetingLocation;
  onChange: (v: MeetingLocation) => void;
  excludeMeetingId?: UUID;
  allowTbd?: boolean;
}) {
  const { state } = useRouge();
  const event = getEvent(state, eventId);
  const spots = spotsOf(state, eventId);
  if (!event) return null;
  const options = OPTIONS.filter((o) => (o.kind !== "spot" || spots.length > 0) && (o.kind !== "tbd" || allowTbd));

  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Lugar de la reunión">
        {options.map((o) => (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={value.kind === o.kind}
            onClick={() => onChange(o.kind === "spot" ? { kind: "spot", spotId: spots[0]?.id ?? "" } : o.kind === "pin" ? { kind: "pin", x: 50, y: 50, label: "" } : { kind: "tbd" })}
            className={cn(
              "flex min-h-touch flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-xs font-semibold transition",
              value.kind === o.kind ? "border-squad/60 bg-squad/15 text-primary" : "border-white/10 bg-white/[0.03] text-muted hover:text-primary",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>

      {value.kind === "spot" && (
        <ul className="grid grid-cols-2 gap-2">
          {spots.map((sp) => {
            const av = startsAt ? spotAvailability(state, sp, startsAt, duration, excludeMeetingId) : null;
            const full = !!av && !av.free;
            const on = value.spotId === sp.id;
            const kind = SPOT_KINDS.find((k) => k.id === sp.kind);
            return (
              <li key={sp.id}>
                <button
                  type="button"
                  disabled={full}
                  aria-pressed={on}
                  onClick={() => onChange({ kind: "spot", spotId: sp.id })}
                  className={cn(
                    "flex min-h-touch w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition disabled:opacity-40",
                    on ? "border-squad bg-squad/15 text-primary" : "border-white/10 bg-white/[0.03] text-primary/85",
                  )}
                >
                  <span className="text-lg" aria-hidden>
                    {kind?.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{sp.name}</span>
                    <span className="block text-[11px] text-muted">{full ? "Ocupada en ese horario" : sp.capacity ? `Libre · ${sp.capacity} a la vez` : "Sin límite"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {value.kind === "pin" && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Tocá el plano donde se encuentran. El pin se comparte solo con la otra persona y vence cuando termina la reunión.</p>
          <VenueMap
            layout={event.venue_layout_json}
            mapImageUrl={event.venue_map_url}
            compact
            draft={{ x: value.x, y: value.y }}
            onTap={(x, y, sector) => onChange({ kind: "pin", x, y, label: value.label || sector?.name || "" })}
            className="aspect-[3/4] max-h-[46vh]"
          />
          <TextField label="Referencia (opcional)" placeholder="Ej. al lado del stand de café" maxLength={60} value={value.label ?? ""} onChange={(e) => onChange({ ...value, label: e.target.value })} />
        </div>
      )}

      {value.kind === "tbd" && <p className="rounded-2xl border border-dashed border-white/15 p-3 text-xs text-muted">Lo definen al aceptar: quien acepta puede elegir sala o pin.</p>}
    </div>
  );
}
