/**
 * Canje en la barra con QR DINÁMICO (perks y vouchers de pedidos) — regla PURA.
 * El QR del teléfono rota cada 20 s; se verifica la firma con el secreto del evento y se consume UNA sola vez
 * (el segundo escaneo, aunque sea simultáneo en otra terminal, recibe "ya canjeado a las HH:MM").
 * Contraparte SQL: redeem_dynamic_qr (con FOR UPDATE).
 */
import type { BarOrder, RougeState, UserPerkQR, UUID } from "@/lib/types";
import { redeemPerk, redeemPickupCode, type Result } from "./actions";
import { eventQrSecret, isDynamicQr, isStaticAppQr, QR_REJECT_MESSAGES, verifyDynamicQr } from "./qr";

export type DynamicRedeem = { kind: "PERK"; perk: UserPerkQR } | { kind: "ORDER"; order: BarOrder };

export function redeemDynamicQr(state: RougeState, eventId: UUID, value: string, now = Date.now()): Result<DynamicRedeem> {
  if (!isDynamicQr(value)) return { ok: false, error: isStaticAppQr(value) ? QR_REJECT_MESSAGES.static : QR_REJECT_MESSAGES.format };
  const secret = eventQrSecret(state, eventId);
  if (!secret) return { ok: false, error: "Esta terminal no tiene la clave del evento: recargá con conexión." };
  const chk = verifyDynamicQr(value, secret, now);
  if (!chk.ok) return { ok: false, error: QR_REJECT_MESSAGES[chk.reason] };
  if (chk.kind === "PERK") {
    const perk = state.user_perks_qrs.find((p) => p.id === chk.ref && p.event_id === eventId);
    if (!perk) return { ok: false, error: "QR inválido." };
    const r = redeemPerk(state, perk.id, now);
    return r.ok ? { ok: true, state: r.state, data: { kind: "PERK", perk: r.data } } : r;
  }
  if (chk.kind === "ORDER") {
    const order = state.bar_orders.find((o) => o.id === chk.ref && o.event_id === eventId);
    if (!order?.pickup_code) return { ok: false, error: "No existe un pedido con ese QR." };
    const r = redeemPickupCode(state, eventId, order.pickup_code, now);
    return r.ok ? { ok: true, state: r.state, data: { kind: "ORDER", order: r.data } } : r;
  }
  return { ok: false, error: "Ese QR es un pase de entrada: escanealo en la puerta." };
}
