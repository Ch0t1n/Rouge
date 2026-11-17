"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Clock, ListPlus, Ticket } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Listas Free con conversión automática: hasta la hora límite entra gratis; después, la puerta muestra "Fuera de
 * horario Free" con el diferencial y lo cobra en el acto (efectivo, Mercado Pago o transferencia).
 */
export function TicketListsPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const now = useNow(30_000);
  const lists = (state.ticket_lists ?? []).filter((l) => l.event_id === event.id);
  const [name, setName] = useState("Lista Free");
  const [until, setUntil] = useState(toLocal(new Date(+new Date(event.starts_at) + 90 * 60_000).toISOString()));
  const [price, setPrice] = useState("8000");
  const [count, setCount] = useState("20");
  const [target, setTarget] = useState<string>(lists[0]?.id ?? "");

  const create = async () => {
    const r = await exec(C.upsertTicketList(event.id, { name, free_until: new Date(until).toISOString(), late_price: Number(price) }));
    if (r.ok) {
      setTarget(r.data.id);
      notify({ tone: "vip", title: `${r.data.name} creada`, description: `Free hasta las ${formatTime(r.data.free_until!)} · después ${formatMoney(r.data.late_price)}` });
    }
  };

  /** Genera códigos de 1 uso y los asigna a la lista elegida. */
  const issue = async () => {
    if (!target) return;
    const g = await exec(C.generateInviteCodes(event.id, Number(count)));
    if (!g.ok) return;
    const a = await exec(C.assignCodesToList(event.id, g.data.map((c) => c.id), target));
    if (a.ok) notify({ tone: "squad", title: `${a.data} entradas en la lista`, description: "Las imprimís o compartís desde Códigos de 1 uso." });
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><Ticket className="size-5 text-vip" /> Listas Free con horario</span>}>
      <p className="text-sm text-muted">Hasta la hora límite entran gratis; después la puerta cobra el diferencial y deja pasar sin discusiones.</p>
      <ul className="mt-4 space-y-2">
        {lists.map((l) => {
          const late = l.free_until ? now > +new Date(l.free_until) : false;
          const codes = state.event_invite_codes.filter((c) => c.list_id === l.id);
          return (
            <li key={l.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-3", late ? "border-vip/40 bg-vip/[0.05]" : "border-white/10")}>
              <Clock className={cn("size-5", late ? "text-vip" : "text-squad")} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-muted">
                  Free hasta {l.free_until ? formatTime(l.free_until) : "—"} · después {formatMoney(l.late_price)} · {codes.length} entradas · {codes.filter((c) => c.checked_in_at).length} adentro · {codes.filter((c) => c.late_paid_at).length} pagaron diferencial
                </p>
              </div>
              <Badge tone={late ? "vip" : "squad"}>{late ? "Fuera de horario" : "Free ahora"}</Badge>
            </li>
          );
        })}
        {!lists.length && <li className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">Todavía no hay listas.</li>}
      </ul>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-3">
        <TextField label="Nombre" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <TextField label="Free hasta" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        <TextField label="Diferencial tardío ($)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
        <Button variant="vip" className="sm:col-span-3" onClick={create} disabled={!name.trim()}>
          <ListPlus /> Crear lista
        </Button>
      </div>

      {lists.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Lista</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-touch rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold">
              {lists.map((l) => (
                <option key={l.id} value={l.id} className="bg-surface">
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="w-28">
            <TextField label="Cantidad" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
          </div>
          <Button variant="glass" onClick={issue} disabled={!target || !Number(count)}>
            Generar entradas de la lista
          </Button>
        </div>
      )}
    </Panel>
  );
}
