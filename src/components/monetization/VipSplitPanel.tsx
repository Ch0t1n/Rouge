"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Crown, Wallet } from "lucide-react";
import { activeVipReservation, splitEven, vipReservationStatus } from "@/lib/engine/monetization";
import { activeEvent, getProfile, squadMembers, squadOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { MP_ENABLED, mpErrorMessage, payWithMercadoPago } from "@/lib/payments/client";
import { cn, formatMoney } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Mesa VIP dividida (Vaquita): el Squad reserva una botella/mesa del menú, cada integrante paga su parte con su propio
 * link y, al llegar al 100 %, se libera el QR grupal (en los Perks de cada uno).
 */
export function VipSplitPanel() {
  const { state, exec, notify, mode } = useRouge();
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const mine = squadOf(state, event.id, meId);
  const [pick, setPick] = useState<string>("");
  if (!mine) return null;
  const members = squadMembers(state, mine.squad.id);
  const bottles = state.bar_menu.filter((i) => i.category === "botella" && i.is_available !== false);
  const res = activeVipReservation(state, event.id, meId);
  const st = res ? vipReservationStatus(state, res) : null;
  const chosen = bottles.find((b) => b.id === (pick || bottles[0]?.id));

  const pay = async (orderId: string) => {
    if (mode === "demo") {
      const r = await exec(C.payOrderDemo(orderId));
      if (r.ok) notify({ tone: "vip", title: "Tu parte está paga", description: "Pago simulado (Modo Demo)." });
      return;
    }
    if (!MP_ENABLED) return notify({ tone: "rouge", title: "Pago no disponible", description: "Los cobros online no están activados en este sitio." });
    try {
      await payWithMercadoPago(orderId);
    } catch (e) {
      notify({ tone: "rouge", title: "No se pudo abrir Mercado Pago", description: mpErrorMessage(e) });
    }
  };

  if (res && st && !st.complete) {
    const myShare = st.shares.find((x) => x.user_id === meId);
    return (
      <section className="rounded-3xl border border-vip/40 bg-vip/[0.06] p-4" aria-label="Mesa VIP dividida">
        <p className="flex items-center gap-2 font-display font-bold text-vip"><Crown className="size-5" /> Mesa VIP · {res.label}</p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={st.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Pagado">
          <div className="h-full rounded-full bg-vip transition-all" style={{ width: `${st.percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{formatMoney(st.paid)} de {formatMoney(st.total)} · {st.percent}% · el QR grupal se libera al 100 %</p>
        <ul className="mt-3 space-y-1.5">
          {st.shares.map((sh) => {
            const p = getProfile(state, sh.user_id);
            return (
              <li key={sh.order.id} className="flex items-center gap-2 text-sm">
                {p && <Avatar profile={p} size={28} />}
                <span className="flex-1 truncate">{sh.user_id === meId ? "Vos" : p?.full_name.split(" ")[0]}</span>
                <span className="metric text-xs">{formatMoney(sh.amount)}</span>
                {sh.paid ? <CheckCircle2 className="size-4 text-squad" aria-label="Pagó" /> : <span className="text-xs text-muted">pendiente</span>}
              </li>
            );
          })}
        </ul>
        {myShare && !myShare.paid && (
          <Button block variant="vip" className="mt-3" onClick={() => pay(myShare.order.id)}>
            <Wallet /> Pagar mi parte · {formatMoney(myShare.amount)}
          </Button>
        )}
      </section>
    );
  }

  if (res && st?.complete) {
    return (
      <section className="rounded-3xl border border-squad/40 bg-squad/[0.06] p-4" aria-label="Mesa VIP dividida">
        <p className="flex items-center gap-2 font-display font-bold text-squad"><CheckCircle2 className="size-5" /> Mesa VIP · {res.label} — 100 % pagada</p>
        <p className="mt-1 text-sm text-muted">El QR grupal ya está en los Perks de cada integrante.</p>
        <Link href="/perks" className={cn(buttonVariants({ variant: "squad", size: "sm" }), "mt-3")}>Ver mi QR</Link>
      </section>
    );
  }

  if (!bottles.length || members.length < 2) return null;
  const shares = chosen ? splitEven(chosen.price, members.length) : [];
  return (
    <section className="rounded-3xl border border-vip/30 bg-vip/[0.04] p-4" aria-label="Reservar Mesa VIP dividida">
      <p className="flex items-center gap-2 font-display font-bold text-vip"><Crown className="size-5" /> Mesa VIP dividida</p>
      <p className="mt-1 text-sm text-muted">Reservá y que cada uno pague su parte con su link. Al completarse, se libera el QR de la mesa para todos.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={chosen?.id ?? ""} onChange={(e) => setPick(e.target.value)} aria-label="Botella o mesa" className="min-h-touch flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm">
          {bottles.map((b) => (
            <option key={b.id} value={b.id} className="bg-surface">
              {b.emoji} {b.name} · {formatMoney(b.price)}
            </option>
          ))}
        </select>
        <Button variant="vip" onClick={async () => chosen && (await exec(C.createVipReservation(mine.squad.id, chosen.id))).ok && notify({ tone: "vip", title: "Mesa reservada", description: "Cada integrante ya tiene su parte para pagar." })}>
          Reservar · {shares.length ? formatMoney(shares[0]) : ""} c/u
        </Button>
      </div>
    </section>
  );
}
