"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChefHat, Minus, Plus, ShoppingBag } from "lucide-react";
import type { BarMenuItem, BarOrder, DeliveryType } from "@/lib/types";
import { ORDER_FLOW, createBarOrder, nextOrderStatus, setOrderStatus } from "@/lib/engine/actions";
import { DELIVERY_META, orderQrValue, STATUS_META } from "@/lib/engine/bar";
import { activeEvent, activePinOf, getAttendee, isLobbyInteractive, ordersOf, squadMembers, squadOf } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { QrBlock } from "@/components/perks/QrCard";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

const CATEGORIES: { id: BarMenuItem["category"]; label: string }[] = [
  { id: "trago", label: "Tragos" },
  { id: "cerveza", label: "Cervezas" },
  { id: "sin_alcohol", label: "Sin alcohol" },
  { id: "combo", label: "Combos" },
  { id: "botella", label: "Botellas VIP" },
];

type UserDelivery = Exclude<DeliveryType, "icebreaker_gift">;

export default function BarPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Bar />;
}

function Bar() {
  const { state, exec, notify, mode } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const attendee = getAttendee(state, event.id, meId);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [delivery, setDelivery] = useState<UserDelivery>("fast_pickup");
  const [qrOrder, setQrOrder] = useState<BarOrder | null>(null);

  const mine = squadOf(state, event.id, meId);
  const pin = activePinOf(state, event.id, meId, now);
  const vipBase = mine?.squad.has_vip_table_to_share && mine.squad.base_pin_x != null;
  const orders = ordersOf(state, meId, event.id);
  const active = orders.filter((o) => o.status !== "completed");
  const lines = useMemo(() => state.bar_menu.filter((i) => cart[i.id]).map((i) => ({ item: i, qty: cart[i.id] })), [cart, state.bar_menu]);
  const total = lines.reduce((a, l) => a + l.item.price * l.qty, 0);
  const splitN = mine ? squadMembers(state, mine.squad.id).length : 1;

  if (!attendee || !isLobbyInteractive(event, now)) {
    return (
      <main>
        <PageHeader title="Barra Express" backHref="/" />
        <p className="mx-4 mt-10 rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">La Barra Express funciona mientras el lobby del evento está abierto.</p>
      </main>
    );
  }

  const options: { id: UserDelivery; available: boolean; detail: string }[] = [
    { id: "fast_pickup", available: true, detail: "Retirás por la ventanilla rápida mostrando tu QR." },
    {
      id: "pin_delivery",
      available: !!pin || !!vipBase,
      detail: pin ? `A tu pin en ${pin.sector_name ?? "el plano"}` : vipBase ? `A la mesa: ${mine!.squad.base_pin_label}` : "Necesitás un pin activo en el plano o Mesa VIP con Punto Base.",
    },
    {
      id: "squad_split",
      available: !!mine && splitN > 1,
      detail: mine ? `${formatMoney(Math.round(total / splitN))} c/u entre ${splitN} del Squad` : "Necesitás un Squad.",
    },
  ];

  const set = (id: string, qty: number) => setCart((c) => {
    const next = { ...c };
    if (qty <= 0) delete next[id];
    else next[id] = Math.min(qty, 20);
    return next;
  });

  const pay = async () => {
    const r = await exec(
      C.createBarOrder(event.id, meId, Object.entries(cart).map(([itemId, qty]) => ({ itemId, qty })), delivery),
    );
    if (!r.ok) return;
    setCart({});
    setCheckout(false);
    notify({ tone: "vip", title: "🧾 Pedido enviado a la barra", description: delivery === "pin_delivery" ? "Te lo llevan a tu ubicación." : "Te avisamos cuando esté listo para retirar." });
    if (r.data.pickup_code) setQrOrder(r.data);
  };

  return (
    <main className="pb-32">
      <PageHeader title="Barra Express" subtitle="Pedí sin hacer fila" backHref="/" />
      <div className="space-y-5 px-4">
        {active.map((o) => (
          <OrderCard key={o.id} order={o} meId={meId} onQr={() => setQrOrder(o)} onSimulate={mode === "demo" ? () => {
            const next = nextOrderStatus(o);
            if (next) void exec(C.advanceOrder(o));
          } : undefined} />
        ))}

        {CATEGORIES.map((cat) => {
          const items = state.bar_menu.filter((i) => i.category === cat.id);
          if (!items.length) return null;
          return (
            <section key={cat.id}>
              <h2 className={cn("mb-2 text-base", cat.id === "botella" && "text-vip")}>{cat.label}</h2>
              <ul className="space-y-2">
                {items.map((i) => {
                  const qty = cart[i.id] ?? 0;
                  return (
                    <li key={i.id} className={cn("flex items-center gap-3 rounded-2xl border p-3 transition", qty ? "border-vip/50 bg-vip/[0.07]" : "border-white/10 bg-white/[0.03]")}>
                      <span className="text-3xl" aria-hidden>{i.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{i.name}</p>
                        <p className="metric text-sm text-vip">{formatMoney(i.price)}</p>
                      </div>
                      {qty ? (
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label={`Quitar ${i.name}`} onClick={() => set(i.id, qty - 1)} className="grid size-11 place-items-center rounded-full bg-white/10"><Minus className="size-4" /></button>
                          <span className="metric w-6 text-center text-lg">{qty}</span>
                          <button type="button" aria-label={`Agregar ${i.name}`} onClick={() => set(i.id, qty + 1)} className="grid size-11 place-items-center rounded-full bg-vip text-background"><Plus className="size-4" /></button>
                        </div>
                      ) : (
                        <button type="button" aria-label={`Agregar ${i.name}`} onClick={() => set(i.id, 1)} className="grid size-11 place-items-center rounded-full bg-vip/15 text-vip"><Plus className="size-5" /></button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <Link href="/lobby" className="glass flex items-center gap-3 rounded-2xl p-4 text-sm">
          <span className="text-2xl">🍸</span>
          <span className="flex-1"><b>Trago Rompehielos:</b> regalale un trago a alguien al mandarle tu Rompehielos desde su perfil.</span>
        </Link>
      </div>

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/10 bg-background/90 px-4 pb-[max(1rem,var(--safe-bottom))] pt-3 backdrop-blur-xl">
          <Button block size="lg" variant="vip" onClick={() => setCheckout(true)}>
            <ShoppingBag /> Ver pedido · {lines.reduce((a, l) => a + l.qty, 0)} ítems · {formatMoney(total)}
          </Button>
        </div>
      )}

      <BottomSheet
        open={checkout}
        onClose={() => setCheckout(false)}
        title="¿Cómo lo querés?"
        footer={
          <Button block size="lg" variant="vip" onClick={pay} disabled={!options.find((o) => o.id === delivery)?.available}>
            Pagar {delivery === "squad_split" ? `mi parte ${formatMoney(Math.round(total / splitN))}` : formatMoney(total)}
            <span className="text-xs font-medium opacity-70">(simulado)</span>
          </Button>
        }
      >
        <ul className="mb-4 space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.item.id} className="flex justify-between">
              <span>{l.qty}× {l.item.emoji} {l.item.name}</span>
              <span className="metric text-muted">{formatMoney(l.item.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-2" role="radiogroup" aria-label="Modalidad de entrega">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={delivery === o.id}
              disabled={!o.available}
              onClick={() => setDelivery(o.id)}
              className={cn("flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-45", delivery === o.id ? "border-vip bg-vip/10 shadow-glow-vip" : "border-white/10 bg-white/[0.03]")}
            >
              <span className="text-2xl">{DELIVERY_META[o.id].emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-semibold">{DELIVERY_META[o.id].label}</span>
                <span className="block text-xs text-muted">{o.detail}</span>
              </span>
              {delivery === o.id && <Check className="size-5 text-vip" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={!!qrOrder} onClose={() => setQrOrder(null)} title={`Retiro · código ${qrOrder?.pickup_code ?? ""}`} description="Mostralo en la ventanilla rápida cuando te avisemos.">
        {qrOrder && <QrBlock value={orderQrValue(qrOrder)} label={`Pedido ${qrOrder.pickup_code}`} />}
      </BottomSheet>
    </main>
  );
}


function OrderCard({ order: o, meId, onQr, onSimulate }: { order: BarOrder; meId: string; onQr: () => void; onSimulate?: () => void }) {
  const steps = ORDER_FLOW[o.delivery_type];
  const idx = steps.indexOf(o.status);
  const ready = o.status === "ready_qr" || o.status === "delivering";
  return (
    <section className={cn("rounded-3xl border p-4", ready ? "border-squad bg-squad/10 shadow-glow-squad" : "border-vip/30 bg-vip/[0.05]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-display text-lg font-bold", ready ? "text-squad" : "text-vip")}>{STATUS_META[o.status].label}</p>
          <p className="text-xs text-muted">
            {DELIVERY_META[o.delivery_type].emoji} {DELIVERY_META[o.delivery_type].label} · {formatTime(o.created_at)}
            {o.user_id !== meId && " · vaquita"}
          </p>
        </div>
        <span className="metric text-vip">{formatMoney(o.total_amount)}</span>
      </div>
      <p className="mt-2 truncate text-sm">{o.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
      <ol className="mt-3 flex gap-1" aria-label="Progreso del pedido">
        {steps.slice(0, -1).map((st, i) => (
          <li key={st} className={cn("h-1.5 flex-1 rounded-full", i <= idx ? (ready ? "bg-squad" : "bg-vip") : "bg-white/10")} title={STATUS_META[st].label} />
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        {o.pickup_code && (
          <Button size="sm" variant={ready ? "squad" : "glass"} onClick={onQr}>
            Ver QR · {o.pickup_code}
          </Button>
        )}
        {o.delivery_type === "pin_delivery" && <span className="self-center text-xs text-muted">📍 {o.sector_name ?? "Tu ubicación"}</span>}
        {onSimulate && o.user_id === meId && (
          <Button size="sm" variant="ghost" onClick={onSimulate}>
            <ChefHat /> Simular barra
          </Button>
        )}
      </div>
    </section>
  );
}
