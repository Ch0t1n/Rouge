"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChefHat, Minus, Plus, ShoppingBag, Users, Wallet, X } from "lucide-react";
import type { BarMenuItem, BarOrder, DeliveryType } from "@/lib/types";
import { ORDER_FLOW, nextOrderStatus } from "@/lib/engine/actions";
import { eventChargesOnline } from "@/lib/engine/payments";
import { MP_ENABLED, mpErrorMessage, payWithMercadoPago, syncOrderPayment } from "@/lib/payments/client";
import { DELIVERY_META, orderQrValue, STATUS_META } from "@/lib/engine/bar";
import { activeEvent, activePinOf, getAttendee, getProfile, isLobbyInteractive, ordersOf, squadMembers, squadOf } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { QrBlock } from "@/components/perks/QrCard";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const CATEGORIES: { id: BarMenuItem["category"]; label: string }[] = [
  { id: "trago", label: "Tragos" },
  { id: "cerveza", label: "Cervezas" },
  { id: "sin_alcohol", label: "Sin alcohol" },
  { id: "combo", label: "Combos" },
  { id: "botella", label: "Botellas VIP" },
];

/** El "compartido" es aparte (con quién se divide): acá solo se elige cómo llega. */
type UserDelivery = Extract<DeliveryType, "fast_pickup" | "pin_delivery">;

export default function BarPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <Suspense>
      <Bar />
    </Suspense>
  );
}

function Bar() {
  const { state, exec, notify, mode, refresh } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const attendee = getAttendee(state, event.id, meId);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [delivery, setDelivery] = useState<UserDelivery>("fast_pickup");
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [qrOrder, setQrOrder] = useState<BarOrder | null>(null);
  const [payOrder, setPayOrder] = useState<BarOrder | null>(null); // checkout simulado (Modo Demo)
  const [busy, setBusy] = useState(false);

  const mine = squadOf(state, event.id, meId);
  const members = mine ? squadMembers(state, mine.squad.id) : [];
  const pin = activePinOf(state, event.id, meId, now);
  const vipBase = mine?.squad.has_vip_table_to_share && mine.squad.base_pin_x != null;
  const online = eventChargesOnline(state, event.id);
  const orders = ordersOf(state, meId, event.id);
  const active = orders.filter((o) => o.status !== "completed");
  const lines = useMemo(() => state.bar_menu.filter((i) => cart[i.id] && i.is_available).map((i) => ({ item: i, qty: cart[i.id] })), [cart, state.bar_menu]);
  const total = lines.reduce((a, l) => a + l.item.price * l.qty, 0);
  const sharing = splitWith.some((u) => u !== meId);
  const each = sharing ? Math.round(total / splitWith.length) : total;

  useReturnFromCheckout(mode, notify, refresh);

  if (!attendee || !isLobbyInteractive(event, now)) {
    return (
      <main>
        <PageHeader title="Barra Express" backHref="/app" />
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
  ];

  const set = (id: string, qty: number) => setCart((c) => {
    const next = { ...c };
    if (qty <= 0) delete next[id];
    else next[id] = Math.min(qty, 20);
    return next;
  });

  const toggleSplit = (uid: string) =>
    setSplitWith((cur) => {
      const base = cur.length ? cur : [meId];
      const next = base.includes(uid) ? base.filter((x) => x !== uid) : [...base, uid];
      return next.some((x) => x !== meId) ? next : [];
    });

  /** Paga un pedido que espera pago: checkout real de Mercado Pago o, en demo, el simulado. */
  const pay = async (order: BarOrder) => {
    if (mode === "demo") return setPayOrder(order);
    if (!MP_ENABLED) return notify({ tone: "rouge", title: "Pago no disponible", description: "Los cobros online no están activados en este sitio." });
    setBusy(true);
    try {
      await payWithMercadoPago(order.id);
    } catch (e) {
      setBusy(false);
      notify({ tone: "rouge", title: "No se pudo abrir Mercado Pago", description: mpErrorMessage(e) });
    }
  };

  const order = async () => {
    const delivered = sharing && delivery === "fast_pickup" ? "squad_split" : delivery;
    const r = await exec(C.createBarOrder(event.id, meId, Object.entries(cart).map(([itemId, qty]) => ({ itemId, qty })), delivered, sharing ? splitWith : []));
    if (!r.ok) return;
    setCart({});
    setSplitWith([]);
    setCheckout(false);
    if (r.data.payment_status === "awaiting_payment") return pay(r.data);
    notify({ tone: "vip", title: "🧾 Pedido enviado a la barra", description: delivery === "pin_delivery" ? "Te lo llevan a tu ubicación. Pagás al recibirlo." : "Pagás al retirar. Te avisamos cuando esté listo." });
    if (r.data.pickup_code) setQrOrder(r.data);
  };

  const confirmDemoPayment = async () => {
    if (!payOrder) return;
    const r = await exec(C.payOrderDemo(payOrder.id));
    setPayOrder(null);
    if (!r.ok) return;
    // El aviso "Pago acreditado" lo muestra LiveNotifications (igual que cuando llega por el webhook).
    if (r.data.pickup_code) setQrOrder(r.data);
  };

  return (
    <main className="pb-32">
      <PageHeader title="Barra Express" subtitle={online ? "Pedí y pagá con Mercado Pago, sin fila" : "Pedí sin hacer fila"} backHref="/app" />
      <div className="space-y-5 px-4">
        {active.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            meId={meId}
            onQr={() => setQrOrder(o)}
            onPay={() => pay(o)}
            onCancel={() => exec(C.cancelUnpaidOrder(o.id, meId))}
            payBusy={busy}
            onSimulate={mode === "demo" ? () => {
              const next = nextOrderStatus(o);
              if (next) void exec(C.advanceOrder(o, { simulate: true }));
            } : undefined}
          />
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
                    <li key={i.id} className={cn("flex items-center gap-3 rounded-2xl border p-3 transition", qty ? "border-vip/50 bg-vip/[0.07]" : "border-white/10 bg-white/[0.03]", !i.is_available && "opacity-55")}>
                      <span className="text-3xl" aria-hidden>{i.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{i.name}</p>
                        <p className="metric text-sm text-vip">{formatMoney(i.price)}</p>
                      </div>
                      {!i.is_available ? (
                        <span className="rounded-full bg-white/10 px-3 py-1.5 font-display text-xs font-semibold uppercase text-muted">Agotado</span>
                      ) : qty ? (
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

        {mine && (
          <Link href="/squad/cuentas" className="glass flex items-center gap-3 rounded-2xl p-4 text-sm">
            <span className="text-2xl">🧾</span>
            <span className="flex-1"><b>Cuentas de la mesa:</b> lo que comparten con el Squad se suma solo, y al final te decimos quién le transfiere a quién.</span>
          </Link>
        )}
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
          <Button block size="lg" variant="vip" onClick={order} disabled={!options.find((o) => o.id === delivery)?.available}>
            {online ? <Wallet /> : <ShoppingBag />}
            {online ? `Pagar ${formatMoney(total)} con Mercado Pago` : `Pedir · pagás ${formatMoney(total)} en la barra`}
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

        {/* Compartir con el Squad: entra en las cuentas de la mesa (quién le transfiere a quién al final). */}
        {members.length > 1 && (
          <section className="mt-4 rounded-2xl border border-squad/25 bg-squad/[0.05] p-3" aria-label="Compartir con el Squad">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-display text-sm font-semibold"><Users className="size-4 text-squad" /> ¿Lo comparten?</p>
              <button type="button" onClick={() => setSplitWith(sharing && splitWith.length === members.length ? [] : members.map((m) => m.user_id))} className="min-h-[36px] rounded-full px-3 text-xs font-semibold text-squad hover:bg-squad/10">
                {sharing && splitWith.length === members.length ? "Solo para mí" : "Todo el Squad"}
              </button>
            </div>
            <ul className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {members.map((m) => {
                const p = getProfile(state, m.user_id);
                const on = sharing ? splitWith.includes(m.user_id) : m.user_id === meId;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSplit(m.user_id)}
                      className={cn("flex min-h-[44px] items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition", on ? "border-squad bg-squad/15 text-primary" : "border-white/10 bg-white/[0.03] text-muted")}
                    >
                      {p && <Avatar profile={p} size={32} />}
                      {m.user_id === meId ? "Yo" : p?.full_name.split(" ")[0]}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-xs text-muted" role="status">
              {sharing
                ? `Pagás vos ${formatMoney(total)} · ${formatMoney(each)} c/u entre ${splitWith.length}. Se suma a las cuentas de la mesa.`
                : "Tocá a quienes lo comparten: al final te decimos cuánto te transfiere cada uno."}
            </p>
          </section>
        )}
        {online && <p className="mt-3 text-center text-xs text-muted">Pagás con la billetera de Mercado Pago, dinero en cuenta o tarjeta. La barra lo prepara apenas se acredita.</p>}
      </BottomSheet>

      {/* Checkout simulado de Mercado Pago (solo Modo Demo: en producción se abre el de Mercado Pago). */}
      <BottomSheet open={!!payOrder} onClose={() => setPayOrder(null)} title="Mercado Pago · demo" description="Así se ve el cobro: en el sitio real se abre el checkout de Mercado Pago.">
        {payOrder && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-muted">Pagás a {state.brands.find((b) => b.id === event.brand_id)?.name ?? event.name}</p>
              <p className="metric mt-1 text-3xl text-primary">{formatMoney(payOrder.total_amount)}</p>
              <p className="mt-1 truncate text-sm text-muted">{payOrder.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
            </div>
            <Button block size="lg" variant="vip" onClick={confirmDemoPayment}>
              <Wallet /> Pagar con dinero en cuenta
            </Button>
            <Button block variant="ghost" onClick={() => setPayOrder(null)}>
              Ahora no (queda esperando pago)
            </Button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={!!qrOrder} onClose={() => setQrOrder(null)} title={`Retiro · código ${qrOrder?.pickup_code ?? ""}`} description="Mostralo en la ventanilla rápida cuando te avisemos.">
        {qrOrder && <QrBlock value={orderQrValue(qrOrder)} label={`Pedido ${qrOrder.pickup_code}`} />}
      </BottomSheet>
    </main>
  );

}

/** Vuelta del checkout de Mercado Pago (/bar?pago=ok&pedido=<id>): concilia y recarga el estado real. */
function useReturnFromCheckout(mode: string, notify: ReturnType<typeof useRouge>["notify"], refresh: () => Promise<void>) {
  const params = useSearchParams();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    const status = params.get("pago");
    const orderId = params.get("pedido");
    if (!status || !orderId || done.current || mode !== "supabase") return;
    done.current = true;
    (async () => {
      if (status === "error") notify({ tone: "rouge", title: "El pago no se completó", description: "Podés reintentarlo desde el pedido." });
      else {
        const st = await syncOrderPayment(orderId).catch(() => "awaiting_payment");
        await refresh();
        if (st !== "paid") notify({ tone: "vip", title: "Confirmando tu pago…", description: "Te avisamos apenas Mercado Pago lo acredite." });
      }
      router.replace("/bar");
    })();
  }, [params, router, mode, notify, refresh]);
}

function OrderCard({ order: o, meId, onQr, onPay, onCancel, payBusy, onSimulate }: { order: BarOrder; meId: string; onQr: () => void; onPay: () => void; onCancel: () => void; payBusy: boolean; onSimulate?: () => void }) {
  const steps = ORDER_FLOW[o.delivery_type];
  const idx = steps.indexOf(o.status);
  const ready = o.status === "ready_qr" || o.status === "delivering";
  if (o.payment_status === "awaiting_payment") {
    return (
      <section className="rounded-3xl border border-dashed border-vip/50 bg-vip/[0.04] p-4" data-testid="order-awaiting">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-vip">Esperando pago</p>
            <p className="truncate text-sm">{o.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
            <p className="text-xs text-muted">La barra lo prepara apenas se acredita.</p>
          </div>
          <span className="metric text-vip">{formatMoney(o.total_amount)}</span>
        </div>
        {o.user_id === meId && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="vip" onClick={onPay} disabled={payBusy}>
              <Wallet /> Pagar con Mercado Pago
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X /> Cancelar
            </Button>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className={cn("rounded-3xl border p-4", ready ? "border-squad bg-squad/10 shadow-glow-squad" : "border-vip/30 bg-vip/[0.05]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-display text-lg font-bold", ready ? "text-squad" : "text-vip")}>{STATUS_META[o.status].label}</p>
          <p className="text-xs text-muted">
            {DELIVERY_META[o.delivery_type].emoji} {DELIVERY_META[o.delivery_type].label} · {formatTime(o.created_at)}
            {o.user_id !== meId && " · compartido"}
            {o.payment_status === "paid" && " · pagado ✓"}
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
