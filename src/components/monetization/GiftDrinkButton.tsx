"use client";

import * as C from "@/lib/store/commands";
import { useEffect, useState } from "react";
import { Gift, Wallet } from "lucide-react";
import { GIFTABLE_CATEGORIES } from "@/lib/engine/actions";
import { useRouge } from "@/lib/store/RougeContext";
import { MP_ENABLED, mpErrorMessage, payWithMercadoPago } from "@/lib/payments/client";
import { cn, formatMoney } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

/**
 * "Invitar un trago" desde el chat 1:1: se elige del menú, se paga (Mercado Pago o en la barra) y a la otra persona le
 * llega un QR dinámico para retirarlo. `autoOpen`: viene de la celebración del match (?regalo=1).
 */
export function GiftDrinkButton({ connectionId, toName, autoOpen = false }: { connectionId: string; toName: string; autoOpen?: boolean }) {
  const { state, exec, notify, mode } = useRouge();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  const items = state.bar_menu.filter((i) => GIFTABLE_CATEGORIES.includes(i.category) && i.is_available !== false);
  const chosen = items.find((i) => i.id === pick);

  const send = async () => {
    if (!pick) return;
    setBusy(true);
    const r = await exec(C.giftDrink(connectionId, pick));
    if (!r.ok) return setBusy(false);
    if (r.data.order.payment_status === "awaiting_payment") {
      if (mode === "demo") {
        // Checkout simulado: en producción se abre el de Mercado Pago y el QR se emite al acreditarse.
        const p = await exec(C.payOrderDemo(r.data.order.id));
        if (p.ok) notify({ tone: "vip", title: `🎁 Le invitaste un ${chosen?.name}`, description: `A ${toName} le llegó el QR para retirarlo (pago simulado).` });
      } else if (MP_ENABLED) {
        try {
          await payWithMercadoPago(r.data.order.id);
          return;
        } catch (e) {
          notify({ tone: "rouge", title: "No se pudo abrir Mercado Pago", description: mpErrorMessage(e) });
        }
      }
    } else notify({ tone: "vip", title: `🎁 Le invitaste un ${chosen?.name}`, description: `${toName} lo retira con su QR; se paga en la barra.` });
    setBusy(false);
    setOpen(false);
    setPick(null);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-vip/15 px-3 text-xs font-semibold text-vip hover:bg-vip/25" aria-label={`Invitarle un trago a ${toName}`}>
        <Gift className="size-4" /> <span>Invitar un trago</span>
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Invitale un trago a ${toName}`}
        description="Le llega como QR en vivo para retirar en la barra. Solo tragos individuales."
        footer={
          <Button block size="lg" variant="vip" disabled={!pick || busy} onClick={send}>
            <Wallet /> {chosen ? `Invitar ${chosen.name} · ${formatMoney(chosen.price)}` : "Elegí un trago"}
          </Button>
        }
      >
        <ul className="grid grid-cols-2 gap-2">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" aria-pressed={pick === i.id} onClick={() => setPick(i.id)} className={cn("flex w-full items-center gap-2 rounded-2xl border p-3 text-left transition", pick === i.id ? "border-vip bg-vip/10 shadow-glow-vip" : "border-white/10 bg-white/[0.03]")}>
                <span className="text-2xl" aria-hidden>{i.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{i.name}</span>
                  <span className="metric text-xs text-vip">{formatMoney(i.price)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
