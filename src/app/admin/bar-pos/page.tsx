"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { ArrowRight, Camera, Clock, PackageCheck, Printer, ScanLine } from "lucide-react";
import { QrScanner } from "@/components/scan/QrScanner";
import type { BarOrder, BarOrderStatus } from "@/lib/types";
import { nextOrderStatus, redeemPickupCode, setOrderStatus } from "@/lib/engine/actions";
import { DELIVERY_META, STATUS_META } from "@/lib/engine/bar";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/AdminChrome";
import { VenueMap } from "@/components/venue/VenueMap";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const COLUMNS: { id: string; title: string; statuses: BarOrderStatus[]; tone: string }[] = [
  { id: "new", title: "Nuevos pedidos", statuses: ["pending"], tone: "border-white/20" },
  { id: "prep", title: "En preparación", statuses: ["preparing"], tone: "border-vip/50" },
  { id: "ready", title: "Listo para retiro QR", statuses: ["ready_qr"], tone: "border-squad/60" },
  { id: "delivery", title: "En camino al pin", statuses: ["delivering"], tone: "border-rouge/60" },
];

const NEXT_LABEL: Partial<Record<BarOrderStatus, string>> = {
  preparing: "Empezar a preparar",
  ready_qr: "Listo · avisar al cliente",
  delivering: "Salir a entregar",
  completed: "Entregado",
};

export default function AdminBarPosPage() {
  const { state, exec, notify, can } = useRouge();
  const now = useNow(10_000);
  const event = activeEvent(state)!;
  const [code, setCode] = useState("");
  const all = useMemo(() => state.bar_orders.filter((o) => o.event_id === event.id).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)), [state.bar_orders, event.id]);
  // Los que esperan el pago de Mercado Pago no se preparan: quedan aparte hasta que se acreditan.
  const orders = all.filter((o) => o.payment_status !== "awaiting_payment");
  const awaiting = all.filter((o) => o.payment_status === "awaiting_payment");
  const completed = orders.filter((o) => o.status === "completed").reverse();
  const revenue = orders.reduce((a, o) => a + o.total_amount, 0);
  const paidOnline = orders.filter((o) => o.payment_status === "paid").reduce((a, o) => a + o.total_amount, 0);

  const [scan, setScan] = useState(false);
  /** Entrega por código o QR (tipeado, lector tipo teclado o cámara). Un QR de perk lo canjea quien tenga perks.redeem. */
  const deliver = async (value: string) => {
    const raw = value.trim();
    if (!raw) return;
    if (/^ROUGE:/.test(raw) && !/^ROUGE:ORDER:/.test(raw) && can("perks.redeem")) {
      const p = await exec(C.redeemPerk(raw));
      if (p.ok) {
        notify({ tone: "vip", title: `🎁 ${p.data.title} canjeado`, description: `Para ${getProfile(state, p.data.user_id)?.full_name ?? "el asistente"}.` });
        setCode("");
      }
      return;
    }
    const r = await exec(C.redeemPickupCode(event.id, raw));
    if (r.ok) {
      notify({ tone: "squad", title: `✅ Pedido ${r.data.pickup_code} entregado`, description: r.data.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ") });
      setCode("");
    }
  };

  const advance = async (o: BarOrder) => {
    const next = nextOrderStatus(o);
    if (!next) return;
    const r = await exec(C.advanceOrder(o));
    if (r.ok && next === "ready_qr") notify({ tone: "squad", title: `🔔 Avisamos a ${getProfile(state, o.user_id)?.full_name.split(" ")[0]}`, description: `Código ${o.pickup_code} listo para retirar.`, duration: 2500 });
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="Barra / Comandas"
        subtitle={`${orders.length - completed.length} pedidos abiertos · ${formatMoney(revenue)} vendidos por la app${paidOnline ? ` · ${formatMoney(paidOnline)} cobrados con Mercado Pago` : ""}${awaiting.length ? ` · ${awaiting.length} esperando pago` : ""}`}
        actions={
          <form
            className="flex w-full items-center gap-2 sm:w-auto"
            onSubmit={async (e) => {
              e.preventDefault();
              await deliver(code);
            }}
          >
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <span className="sr-only">Código de retiro</span>
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-squad" />
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={can("perks.redeem") ? "Código de retiro o QR de perk" : "Código o QR de retiro"} className="min-h-touch w-full min-w-0 rounded-2xl border border-squad/40 bg-squad/[0.06] pl-9 pr-3 font-display text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-squad/50" />
            </label>
            <Button type="submit" variant="squad" disabled={!code.trim()}>
              <PackageCheck /> Entregar
            </Button>
            <Button type="button" size="icon" variant={scan ? "squad" : "glass"} aria-label={scan ? "Cerrar cámara" : "Escanear con la cámara"} aria-pressed={scan} onClick={() => setScan((v) => !v)}>
              <Camera />
            </Button>
          </form>
        }
      />
      {scan && (
        <div className="mx-auto max-w-sm">
          <QrScanner onResult={(text) => void deliver(text)} />
          <p className="mt-2 text-center text-xs text-muted">Apuntá al QR de retiro del pedido o al QR de un perk.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.statuses.includes(o.status));
          return (
            <section key={col.id} className={cn("flex min-h-[320px] flex-col rounded-3xl border-t-4 bg-surface/60 p-3", col.tone)} aria-label={col.title}>
              <h2 className="flex items-center justify-between px-1 pb-3 text-base">
                {col.title} <span className="metric rounded-full bg-white/10 px-2.5 py-0.5 text-sm">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-muted">Sin pedidos</p>}
                {list.map((o) => (
                  <OrderTicket key={o.id} order={o} now={now} onAdvance={() => advance(o)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {completed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm text-muted">Entregados · {completed.length}</h2>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {completed.slice(0, 20).map((o) => (
              <span key={o.id} className="glass-pill shrink-0 whitespace-nowrap py-1.5">
                {o.pickup_code ?? "Delivery"} · {formatMoney(o.total_amount)} · {formatTime(o.updated_at)}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function OrderTicket({ order: o, now, onAdvance }: { order: BarOrder; now: number; onAdvance: () => void }) {
  const { state } = useRouge();
  const customer = getProfile(state, o.user_id);
  const event = activeEvent(state)!;
  const next = nextOrderStatus(o);
  const waited = Math.max(0, Math.round((now - +new Date(o.created_at)) / 60_000));
  const late = waited >= 10 && o.status !== "ready_qr";
  return (
    <article className="rounded-2xl border border-white/10 bg-background/70 p-3">
      <div className="flex items-center gap-2">
        {customer && <Avatar profile={customer} size={32} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{customer?.full_name ?? "Cliente"}</p>
          <p className="truncate text-[11px] text-muted">{DELIVERY_META[o.delivery_type].emoji} {DELIVERY_META[o.delivery_type].label}</p>
        </div>
        {o.pickup_code && <span className="metric rounded-lg bg-vip/15 px-2 py-1 text-sm text-vip">{o.pickup_code}</span>}
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {o.items_json.map((i) => (
          <li key={i.item_id} className="flex justify-between">
            <span><b>{i.qty}×</b> {i.name}</span>
          </li>
        ))}
      </ul>
      {o.split_user_ids.length > 0 && <p className="mt-1 text-[11px] text-squad">🐮 Compartido entre {o.split_user_ids.length}</p>}
      <p className={cn("mt-1 text-[11px] font-semibold", o.payment_status === "paid" ? "text-squad" : "text-vip")}>{o.payment_status === "paid" ? "✓ Pagado con Mercado Pago" : "💵 Cobrar al entregar"}</p>
      {(o.status === "delivering" || o.delivery_type === "pin_delivery") && o.pin_coord_x != null && o.pin_coord_y != null && (
        <div className="mt-2">
          <VenueMap
            layout={event.venue_layout_json}
            mapImageUrl={event.venue_map_url}
            compact
            basePin={{ x: o.pin_coord_x, y: o.pin_coord_y, label: o.sector_name ?? "Entrega" }}
            className="mx-auto max-w-[130px]"
          />
          <p className="mt-1 text-center text-[11px] text-muted">📍 {o.sector_name ?? "Ubicación del pin"}</p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1 text-xs", late ? "font-bold text-rouge" : "text-muted")}>
          <Clock className="size-3.5" /> {waited} min · {formatMoney(o.total_amount)}
        </span>
        <a
          href={`/admin/print-ticket?order=${o.id}`}
          target="_blank"
          rel="noopener"
          aria-label={`Imprimir ticket del pedido ${o.pickup_code ?? ""}`.trim()}
          title="Imprimir ticket"
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/10 hover:text-primary"
        >
          <Printer className="size-4" />
        </a>
        {next && (
          <Button size="sm" variant={next === "completed" ? "squad" : "vip"} onClick={onAdvance} aria-label={`${NEXT_LABEL[next]} (${STATUS_META[o.status].label})`}>
            {NEXT_LABEL[next]} <ArrowRight />
          </Button>
        )}
      </div>
    </article>
  );
}
