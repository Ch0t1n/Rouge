"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import Link from "next/link";
import { Copy, Palette, Trash2, UtensilsCrossed } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { useRouge } from "@/lib/store/RougeContext";
import { Panel } from "@/components/admin/AdminChrome";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accessWindowOf } from "@/lib/engine/roles";
import { formatDateTime } from "@/lib/utils";

/** ISO → valor de <input type="datetime-local"> en hora local. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Todo lo del evento en un lugar: marca y colores, menú de la barra, nueva edición (duplicar para otra fecha) y
 * eliminar un evento creado por error (solo quien lo creó y si todavía no entró nadie).
 */
export function EventLifecyclePanel({ event, onDuplicated, onDeleted }: { event: RougeEvent; onDuplicated: (id: string) => void; onDeleted: () => void }) {
  const { state, exec, notify } = useRouge();
  const nextWeek = toLocal(new Date(+new Date(event.starts_at) + 7 * 86_400_000 > Date.now() ? +new Date(event.starts_at) + 7 * 86_400_000 : Date.now() + 7 * 86_400_000).toISOString());
  const [when, setWhen] = useState(nextWeek);
  const isCreator = event.created_by === state.current_user_id;
  const attendees = state.event_attendees.filter((a) => a.event_id === event.id).length;

  const duplicate = async () => {
    const r = await exec(C.duplicateEvent(event.id, new Date(when).toISOString()));
    if (!r.ok) return;
    notify({ tone: "squad", title: "Nueva edición creada", description: `${r.data.event.name} · link /join/${r.data.event.slug}` });
    onDuplicated(r.data.event.id);
  };

  const remove = async () => {
    const typed = window.prompt(`Para eliminar "${event.name}" escribí su link: ${event.slug}`);
    if (typed?.trim() !== event.slug) return;
    const r = await exec(C.deleteEvent(event.id));
    if (!r.ok) return;
    notify({ tone: "vip", title: "Evento eliminado" });
    onDeleted();
  };

  return (
    <Panel title="Más del evento">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-display font-semibold">Identidad y barra</p>
          <p className="text-xs text-muted">Logo, colores, cuenta de cobro y precios del menú.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/brand" className={buttonVariants({ size: "sm", variant: "glass" })}>
              <Palette /> Marca y cobros
            </Link>
            <Link href="/admin/menu" className={buttonVariants({ size: "sm", variant: "glass" })}>
              <UtensilsCrossed /> Menú
            </Link>
          </div>
        </div>
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-display font-semibold">Nueva edición</p>
          <p className="text-xs text-muted">Copia datos, marca, plano, line-up, menú y reglas de perks a otra fecha (con link y código nuevos).</p>
          <label className="block text-xs text-muted">
            Empieza
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 min-h-touch w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-primary [color-scheme:dark]" />
          </label>
          <Button size="sm" variant="vip" onClick={duplicate} disabled={!when}>
            <Copy /> Duplicar para esa fecha
          </Button>
        </div>
        <div className="space-y-2 rounded-2xl border border-rouge/25 bg-rouge/[0.04] p-4">
          <p className="font-display font-semibold">Eliminar evento</p>
          <p className="text-xs text-muted">
            {!isCreator
              ? "Solo quien creó el evento lo puede eliminar."
              : attendees
                ? `Ya entraron ${attendees} personas: se conserva el historial (matches y chats). Para terminarlo, cerrá el lobby desde el editor.`
                : "Para eventos creados por error o de prueba. No se puede deshacer."}
          </p>
          <Button size="sm" variant="danger" onClick={remove} disabled={!isCreator || attendees > 0}>
            <Trash2 /> Eliminar
          </Button>
        </div>
      </div>
      {/* Seguridad y privacidad de la noche */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4">
          <Switch
            tone="squad"
            id="checkin-lobby"
            checked={!!event.require_checkin_for_lobby}
            onCheckedChange={async (v) => {
              const r = await exec(C.upsertEvent({ ...event, require_checkin_for_lobby: v }));
              if (r.ok) notify({ tone: "squad", title: v ? "Grilla solo para quien ya entró" : "Grilla para todos los que tienen entrada", duration: 2000 });
            }}
            label="Lobby solo para quienes ya ingresaron"
            description="Privacidad: aparecés en la grilla recién cuando te escanean en la puerta (tu Squad y tus matches te ven igual)."
          />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <p className="font-semibold">Ventana horaria del staff de puerta y barra</p>
          <p className="mt-1 text-muted">
            Activos del {formatDateTime(new Date(accessWindowOf(event).from).toISOString())} al {formatDateTime(new Date(accessWindowOf(event).to).toISOString())} (2 h antes de abrir · 1 h después del cierre). Fuera de ese rango no pueden operar ni ver nada.
          </p>
        </div>
      </div>
    </Panel>
  );
}
