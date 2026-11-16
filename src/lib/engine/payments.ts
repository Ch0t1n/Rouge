/**
 * Cobros de Barra Express — reglas PURAS.
 *
 * Si la marca del evento conectó Mercado Pago (`brands.payments_enabled`), cada pedido nace
 * `awaiting_payment`: la barra no lo ve para preparar hasta que el servidor confirma el pago con la API
 * de Mercado Pago (webhook o conciliación → RPC confirm_order_payment). Sin cobros online, el pedido nace
 * `pay_at_bar` y se cobra al retirar, como siempre.
 *
 * El gasto (total_spent, CRM) se suma cuando el pago se acredita, no cuando se crea el pedido.
 */
import type { BarOrder, BrandPaymentAccount, PaymentStatus, RougeState, UUID } from "@/lib/types";
import { brandOfEvent, getBrand } from "./branding";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const NOT_PAID = "El pedido todavía no está pago.";

/** ¿El evento cobra online? */
export const eventChargesOnline = (s: RougeState, eventId: UUID) => !!brandOfEvent(s, eventId)?.payments_enabled;

export const initialPaymentStatus = (s: RougeState, eventId: UUID): PaymentStatus => (eventChargesOnline(s, eventId) ? "awaiting_payment" : "pay_at_bar");

/** Pedidos que la barra puede preparar/entregar (los que esperan pago no). */
export const isPayable = (o: BarOrder) => o.payment_status !== "awaiting_payment";

/** Quién consume y cuánto (para total_spent): el compartido se reparte, el individual es de quien pidió. */
export function spendShares(o: Pick<BarOrder, "user_id" | "split_user_ids" | "total_amount">): [UUID, number][] {
  if (o.split_user_ids.length > 0) {
    const share = Math.round(o.total_amount / o.split_user_ids.length);
    return o.split_user_ids.map((u) => [u, share]);
  }
  return [[o.user_id, o.total_amount]];
}

export function addSpend(state: RougeState, eventId: UUID, shares: [UUID, number][]): RougeState {
  const map = new Map(shares);
  return {
    ...state,
    event_attendees: state.event_attendees.map((a) => (a.event_id === eventId && map.has(a.user_id) ? { ...a, total_spent: a.total_spent + (map.get(a.user_id) ?? 0) } : a)),
  };
}

/**
 * Acredita el pago de un pedido. Espejo de confirm_order_payment (que solo ejecuta el servidor con la
 * respuesta de Mercado Pago). En el Modo Demo lo dispara el checkout simulado.
 * Idempotente: un pedido ya pago devuelve el mismo pedido sin sumar dos veces.
 */
export function confirmOrderPayment(state: RougeState, orderId: UUID, ref: string, amount: number, now = Date.now()): R<BarOrder> {
  const o = state.bar_orders.find((x) => x.id === orderId);
  if (!o) return fail("Pedido inexistente.");
  if (o.payment_status === "paid") return { ok: true, state, data: o };
  if (o.payment_status !== "awaiting_payment") return fail("Este pedido se paga en la barra.");
  if (Math.abs(amount - o.total_amount) > 0.009) return fail("El monto pagado no coincide con el pedido.");
  const iso = new Date(now).toISOString();
  const paid: BarOrder = { ...o, payment_status: "paid", payment_ref: ref, paid_at: iso, updated_at: iso };
  const next = addSpend({ ...state, bar_orders: state.bar_orders.map((x) => (x.id === orderId ? paid : x)) }, o.event_id, spendShares(o));
  return { ok: true, state: next, data: paid };
}

/** Quien pidió puede cancelar un pedido que todavía no pagó (espejo de cancel_unpaid_order). */
export function cancelUnpaidOrder(state: RougeState, orderId: UUID, userId: UUID): R<undefined> {
  const o = state.bar_orders.find((x) => x.id === orderId);
  if (!o || o.user_id !== userId) return fail("Pedido inexistente.");
  if (o.payment_status !== "awaiting_payment") return fail("Ese pedido ya está pago: pedile a la barra que lo anule.");
  return { ok: true, state: { ...state, bar_orders: state.bar_orders.filter((x) => x.id !== orderId) }, data: undefined };
}

// ── Cuenta de cobro de la marca (Modo Demo) ─────────────────────────
// En Supabase la conexión real la hace el OAuth de /api/mercadopago (solo servidor, con tokens cifrados).

export function connectPaymentsDemo(state: RougeState, userId: UUID, brandId: UUID, now = Date.now()): R<BrandPaymentAccount> {
  const b = getBrand(state, brandId);
  if (!b || b.owner_id !== userId) return fail("Solo quien creó la marca puede conectar la cuenta de cobro.");
  const account: BrandPaymentAccount = { brand_id: brandId, provider: "mercadopago", account_label: `${b.name} (demo)`, live_mode: false, connected_at: new Date(now).toISOString() };
  return {
    ok: true,
    state: {
      ...state,
      brands: state.brands.map((x) => (x.id === brandId ? { ...x, payments_enabled: true } : x)),
      brand_payment_accounts: [...state.brand_payment_accounts.filter((a) => a.brand_id !== brandId), account],
    },
    data: account,
  };
}

export function disconnectPayments(state: RougeState, userId: UUID, brandId: UUID): R<undefined> {
  const b = getBrand(state, brandId);
  if (!b || b.owner_id !== userId) return fail("Solo quien creó la marca puede desconectar la cuenta de cobro.");
  return {
    ok: true,
    state: {
      ...state,
      brands: state.brands.map((x) => (x.id === brandId ? { ...x, payments_enabled: false } : x)),
      brand_payment_accounts: state.brand_payment_accounts.filter((a) => a.brand_id !== brandId),
    },
    data: undefined,
  };
}

/** Comisión de ROUGE por pedido (marketplace_fee de Mercado Pago), redondeada a centavos. */
export function marketplaceFee(total: number, percent: number): number {
  if (!(percent > 0)) return 0;
  return Math.round(total * percent) / 100;
}
