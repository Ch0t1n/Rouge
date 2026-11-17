"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { Camera, CameraOff, CheckCircle2, ChefHat, PackageCheck } from "lucide-react";
import type { BarOrder } from "@/lib/types";
import { nextOrderStatus } from "@/lib/engine/actions";
import { DELIVERY_META, STATUS_META } from "@/lib/engine/bar";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatTime } from "@/lib/utils";
import { QrScanner } from "@/components/scan/QrScanner";
import { useKiosk } from "./Kiosk";
import { isDynamicQr, isStaticAppQr, QR_REJECT_MESSAGES } from "@/lib/engine/qr";

/**
 * Barra (plataforma operativa): ventanilla de retiro grande (código, QR o lector tipo teclado) y comandas en dos
 * columnas con un solo botón por pedido. Sin ventas, sin CRM: solo lo que hace falta para despachar.
 */
export function OpsBar() {
  const { state, exec, notify, can } = useRouge();
  const now = useNow(10_000);
  const kiosk = useKiosk();
  const event = activeEvent(state)!;
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [last, setLast] = useState<{ ok: boolean; title: string; detail: string } | null>(null);
  const orders = useMemo(
    () => state.bar_orders.filter((o) => o.event_id === event.id && o.payment_status !== "awaiting_payment" && o.status !== "completed").sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [state.bar_orders, event.id],
  );
  const toPrepare = orders.filter((o) => o.status === "pending" || o.status === "preparing");
  const ready = orders.filter((o) => o.status === "ready_qr" || o.status === "delivering");

  const deliver = async (value: string) => {
    const raw = value.trim();
    if (!raw) return;
    kiosk.touch();
    // QR dinámico (perk o voucher) → se verifica la firma y que esté vivo; se consume una sola vez.
    if (isDynamicQr(raw)) {
      const d = await exec(C.redeemDynamicQr(event.id, raw), { silent: true });
      if (d.ok && d.data.kind === "PERK") {
        setLast({ ok: true, title: `🎁 ${d.data.perk.title}`, detail: `Canjeado para ${getProfile(state, d.data.perk.user_id)?.full_name ?? "el asistente"}` });
        kiosk.audit("perk.redeemed", d.data.perk.id);
      } else if (d.ok && d.data.kind === "ORDER") {
        setLast({ ok: true, title: `Entregar pedido ${d.data.order.pickup_code}`, detail: d.data.order.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ") });
        kiosk.audit("bar.delivered", d.data.order.pickup_code ?? d.data.order.id);
      } else if (!d.ok) setLast({ ok: false, title: "No se puede canjear", detail: d.error });
      navigator.vibrate?.(d.ok ? 80 : [60, 60, 60]);
      setCode("");
      return;
    }
    if (isStaticAppQr(raw)) {
      setLast({ ok: false, title: "QR estático", detail: QR_REJECT_MESSAGES.static });
      navigator.vibrate?.([60, 60, 60]);
      setCode("");
      return;
    }
    if (/^ROUGE:/.test(raw) && !/^ROUGE:ORDER:/.test(raw) && can("perks.redeem")) {
      const p = await exec(C.redeemPerk(raw), { silent: true });
      setLast(p.ok ? { ok: true, title: `🎁 ${p.data.title}`, detail: `Canjeado para ${getProfile(state, p.data.user_id)?.full_name ?? "el asistente"}` } : { ok: false, title: "QR no válido", detail: p.error });
      if (p.ok) kiosk.audit("perk.redeemed", p.data.id);
      navigator.vibrate?.(p.ok ? 80 : [60, 60, 60]);
      setCode("");
      return;
    }
    const r = await exec(C.redeemPickupCode(event.id, raw), { silent: true });
    setLast(r.ok ? { ok: true, title: `Entregar pedido ${r.data.pickup_code}`, detail: r.data.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ") } : { ok: false, title: "No se puede entregar", detail: r.error });
    if (r.ok) kiosk.audit("bar.delivered", r.data.pickup_code ?? r.data.id);
    navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
    setCode("");
  };

  const advance = async (o: BarOrder) => {
    kiosk.touch();
    const r = await exec(C.advanceOrder(o));
    if (r.ok && r.data.status === "completed") kiosk.audit("bar.delivered", o.pickup_code ?? o.id);
    if (r.ok && r.data.status === "ready_qr") notify({ tone: "squad", title: `🔔 ${o.pickup_code ?? "Pedido"} listo`, description: "Le avisamos al cliente para que lo retire.", duration: 1800 });
  };

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
      {/* Ventanilla */}
      <section className="rounded-3xl border-2 border-white/25 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-3xl text-white">Ventanilla</h1>
          <button type="button" onClick={() => setCamera((c) => !c)} className="inline-flex min-h-[56px] items-center gap-2 rounded-2xl bg-white/10 px-4 font-display text-base font-bold text-white hover:bg-white/20">
            {camera ? <CameraOff className="size-6" /> : <Camera className="size-6" />} {camera ? "Apagar cámara" : "Cámara"}
          </button>
        </div>
        {camera && (
          <div className="mt-3 max-w-md">
            <QrScanner onResult={deliver} />
          </div>
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void deliver(code);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Código de retiro o QR</span>
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código de retiro o QR" className="min-h-[64px] w-full rounded-2xl border-2 border-white/40 bg-black px-4 font-display text-2xl tracking-[0.2em] text-white placeholder:tracking-normal placeholder:text-white/40 focus:border-white focus:outline-none" />
          </label>
          <button type="submit" disabled={!code.trim()} className="min-h-[64px] rounded-2xl bg-white px-6 font-display text-xl font-bold text-black disabled:opacity-40">
            Entregar
          </button>
        </form>
        {last && (
          <div role="status" aria-live="assertive" className={cn("mt-3 flex items-center gap-3 rounded-2xl border-2 p-4", last.ok ? "border-squad bg-squad/15" : "border-sos bg-sos/15")}>
            <CheckCircle2 className={cn("size-10 shrink-0", last.ok ? "text-squad" : "text-sos")} />
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold text-white">{last.title}</p>
              <p className="text-base text-white/80">{last.detail}</p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <OrderColumn title="Para preparar" icon={<ChefHat className="size-6" />} tone="vip" orders={toPrepare} now={now} onAdvance={advance} />
        <OrderColumn title="Listos / en camino" icon={<PackageCheck className="size-6" />} tone="squad" orders={ready} now={now} onAdvance={advance} />
      </div>
    </main>
  );
}

const ACTION: Partial<Record<BarOrder["status"], string>> = { preparing: "Preparar", ready_qr: "Listo", delivering: "Salir", completed: "Entregado" };

function OrderColumn({ title, icon, tone, orders, now, onAdvance }: { title: string; icon: React.ReactNode; tone: "vip" | "squad"; orders: BarOrder[]; now: number; onAdvance: (o: BarOrder) => void }) {
  return (
    <section aria-label={title}>
      <h2 className={cn("mb-3 flex items-center gap-2 text-2xl", tone === "vip" ? "text-vip" : "text-squad")}>
        {icon} {title} <span className="font-display text-white/60">· {orders.length}</span>
      </h2>
      <ul className="space-y-3">
        {orders.map((o) => {
          const next = nextOrderStatus(o);
          const waited = Math.max(0, Math.round((now - +new Date(o.created_at)) / 60_000));
          return (
            <li key={o.id} className={cn("flex items-center gap-4 rounded-2xl border-2 bg-white/[0.04] p-4", waited >= 10 && o.status === "pending" ? "border-sos" : "border-white/20")}>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 font-display text-2xl font-bold text-white">
                  {o.pickup_code ?? DELIVERY_META[o.delivery_type].emoji} <span className="text-sm font-normal text-white/60">{STATUS_META[o.status].label} · {formatTime(o.created_at)} · {waited}′</span>
                </p>
                <p className="truncate text-lg text-white/90">{o.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                {o.delivery_type === "pin_delivery" && <p className="text-sm text-white/60">📍 {o.sector_name ?? "Pin del cliente"}</p>}
              </div>
              {next && (
                <button type="button" onClick={() => onAdvance(o)} className={cn("min-h-[64px] min-w-[120px] rounded-2xl px-4 font-display text-lg font-bold", tone === "vip" ? "bg-vip text-black" : "bg-squad text-black")}>
                  {ACTION[next] ?? "Avanzar"}
                </button>
              )}
            </li>
          );
        })}
        {!orders.length && <li className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-lg text-white/50">Nada por acá.</li>}
      </ul>
    </section>
  );
}
