"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { ATTENDEE_TIERS, type AttendeeTier, type EventZone, type UUID } from "@/lib/types";
import { ZONE_NAME_MAX, requiredTiersLabel, zonesOf } from "@/lib/engine/door";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

type Draft = { id?: UUID; name: string; kind: EventZone["kind"]; allowed_tiers: AttendeeTier[] };
const EMPTY: Draft = { name: "", kind: "area", allowed_tiers: [] };

/**
 * Zonas de control del evento (dueño/a y producción): puertas que acreditan y áreas con acceso por categoría
 * (Sala VIP: VIP + SPEAKER; Almuerzo ejecutivo; Sala de prensa…). Sin categorías marcadas, pasa cualquiera.
 */
export function ZonesPanel({ eventId }: { eventId: UUID }) {
  const { state, exec, notify } = useRouge();
  const zones = zonesOf(state, eventId, true);
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = async () => {
    if (!draft) return;
    const r = await exec(C.upsertZone(eventId, draft));
    if (!r.ok) return;
    notify({ tone: "vip", title: draft.id ? "Zona actualizada" : `Zona "${r.data.name}" creada`, description: requiredTiersLabel(r.data.allowed_tiers) });
    setDraft(null);
  };
  const remove = async (z: EventZone) => {
    if (!window.confirm(`¿Borrar la zona "${z.name}"? Las lecturas ya registradas quedan en el historial.`)) return;
    const r = await exec(C.deleteZone(eventId, z.id));
    if (r.ok) notify({ tone: "info", title: `Zona "${z.name}" borrada` });
  };
  const toggleTier = (t: AttendeeTier) =>
    draft && setDraft({ ...draft, allowed_tiers: draft.allowed_tiers.includes(t) ? draft.allowed_tiers.filter((x) => x !== t) : [...draft.allowed_tiers, t] });

  return (
    <Panel
      title="Zonas de control"
      action={
        !draft && (
          <Button size="sm" variant="vip" onClick={() => setDraft(EMPTY)}>
            <Plus /> Nueva zona
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-muted">Puertas que acreditan el ingreso y áreas internas con acceso por categoría. El personal elige la zona antes de escanear.</p>
      {zones.length === 0 && !draft && <p className="text-sm text-muted">Sin zonas: el escáner usa la puerta principal, como siempre.</p>}
      <ul className="space-y-2">
        {zones.map((z) => (
          <li key={z.id} className={cn("flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3", !z.is_active && "opacity-50")}>
            {z.kind === "entrance" ? <DoorOpen className="size-5 shrink-0 text-vip" /> : <span className="size-5 shrink-0 rounded-md border border-white/20" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{z.name}</span>
              <span className="block truncate text-xs text-muted">{z.kind === "entrance" ? "Puerta · acredita el ingreso" : requiredTiersLabel(z.allowed_tiers)}</span>
            </span>
            <button
              type="button"
              aria-pressed={z.is_active}
              aria-label={`${z.is_active ? "Pausar" : "Activar"} ${z.name}`}
              onClick={() => void exec(C.upsertZone(eventId, { ...z, is_active: !z.is_active }))}
              className={cn("min-h-[36px] rounded-full px-3 text-xs font-semibold", z.is_active ? "bg-vip/15 text-vip" : "bg-white/[0.06] text-muted")}
            >
              {z.is_active ? "Activa" : "Pausada"}
            </button>
            <Button size="sm" variant="ghost" aria-label={`Editar ${z.name}`} onClick={() => setDraft({ id: z.id, name: z.name, kind: z.kind, allowed_tiers: z.allowed_tiers })}>
              <Pencil />
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Borrar ${z.name}`} onClick={() => void remove(z)}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      {draft && (
        <div className="mt-4 space-y-4 rounded-2xl border border-vip/30 bg-vip/[0.05] p-4">
          <TextField label="Nombre de la zona" value={draft.name} maxLength={ZONE_NAME_MAX} placeholder="Sala VIP, Auditorio A, Almuerzo ejecutivo" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de zona">
            {(
              [
                { id: "entrance", label: "Puerta", hint: "Acredita el ingreso" },
                { id: "area", label: "Área interna", hint: "Valida la categoría" },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={draft.kind === k.id}
                onClick={() => setDraft({ ...draft, kind: k.id })}
                className={cn("min-h-touch rounded-2xl border px-3 py-2 text-left", draft.kind === k.id ? "border-vip bg-vip/15" : "border-white/10 bg-white/[0.03]")}
              >
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="block text-[11px] text-muted">{k.hint}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1.5 font-display text-[13px] font-semibold">Categorías habilitadas</p>
            <div className="flex flex-wrap gap-2">
              {ATTENDEE_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={draft.allowed_tiers.includes(t.id)}
                  onClick={() => toggleTier(t.id)}
                  className={cn("min-h-[40px] rounded-full border px-3.5 font-display text-xs font-bold tracking-wider", draft.allowed_tiers.includes(t.id) ? "border-vip bg-vip/15 text-vip" : "border-white/15 text-muted")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">{draft.allowed_tiers.length ? requiredTiersLabel(draft.allowed_tiers) : "Sin marcar: pasa cualquier categoría."}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="glass" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="vip" onClick={save} disabled={draft.name.trim().length < 2}>
              {draft.id ? "Guardar" : "Crear zona"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
