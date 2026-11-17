/**
 * Monetización cruzada y retención post-fiesta — reglas PURAS.
 *
 *   - Invitar un trago desde el chat 1:1: se elige un trago del menú, se paga (Mercado Pago o en la barra) y le llega
 *     a la otra persona como QR dinámico para retirar. Con cobro online, el QR se emite recién al acreditarse.
 *   - Mesa VIP dividida (Vaquita): la reserva se parte en una cuota por integrante del Squad; cada uno paga la suya y
 *     al completarse el 100 % se libera el QR grupal (un "Mesa VIP · acceso" para cada integrante).
 *   - Cola virtual de la barra: posición de tu pedido entre los que se están preparando.
 *   - Rouge Wrapped: resumen de la noche para compartir en Stories.
 * Contraparte SQL: gift_drink, create_vip_reservation, confirm_order_payment (emite el regalo y el QR grupal).
 */
import type { BarOrder, RougeState, UserPerkQR, UUID, VipReservation } from "@/lib/types";
import { uid } from "@/lib/utils";
import { GIFTABLE_CATEGORIES, type Result } from "./actions";
import { addSpend, initialPaymentStatus, paymentHooks } from "./payments";
import { getEvent, getProfile, isBlockedBetween, isLobbyInteractive, squadMembers, squadOf } from "./selectors";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (now: number) => new Date(now).toISOString();

const perkFor = (eventId: UUID, userId: UUID, squadId: UUID | null, title: string, type: UserPerkQR["perk_type"], source: UserPerkQR["source"], ref: UUID, now: number): UserPerkQR => ({
  id: uid(),
  event_id: eventId,
  user_id: userId,
  squad_id: squadId,
  title,
  perk_type: type,
  qr_code_string: `ROUGE:${type.toUpperCase()}:${uid().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
  status: "available",
  source,
  source_ref_id: ref,
  redeemed_at: null,
  created_at: iso(now),
});

const baseOrder = (eventId: UUID, userId: UUID, now: number, extra: Partial<BarOrder>): BarOrder => ({
  id: uid(),
  event_id: eventId,
  user_id: userId,
  squad_id: null,
  delivery_type: "icebreaker_gift",
  items_json: [],
  total_amount: 0,
  split_user_ids: [],
  pickup_code: null,
  pin_coord_x: null,
  pin_coord_y: null,
  sector_name: null,
  status: "completed",
  payment_status: "pay_at_bar",
  payment_ref: null,
  paid_at: null,
  created_at: iso(now),
  updated_at: iso(now),
  ...extra,
});

// ── Invitar un trago desde el chat ───────────────────────────────────

export function giftDrinkInChat(state: RougeState, senderId: UUID, connectionId: UUID, itemId: string, now = Date.now()): Result<{ order: BarOrder; perk: UserPerkQR | null }> {
  const c = state.connections.find((x) => x.id === connectionId);
  if (!c || c.status !== "accepted" || (c.sender_id !== senderId && c.receiver_id !== senderId)) return fail("Esta conversación no está disponible.");
  const to = c.sender_id === senderId ? c.receiver_id : c.sender_id;
  if (isBlockedBetween(state, senderId, to)) return fail("Este perfil no está disponible");
  const ev = getEvent(state, c.event_id);
  if (!ev || !isLobbyInteractive(ev, now)) return fail("Los tragos se regalan mientras la fiesta está abierta.");
  if (!state.event_attendees.some((a) => a.event_id === ev.id && a.user_id === to)) return fail("Esa persona no está en esta fiesta.");
  const item = state.bar_menu.find((i) => i.id === itemId);
  if (!item || item.is_available === false) return fail("Ese trago no está disponible.");
  if (!GIFTABLE_CATEGORIES.includes(item.category)) return fail("Solo se pueden regalar tragos individuales.");
  const payment = initialPaymentStatus(state, ev.id);
  const order = baseOrder(ev.id, senderId, now, { delivery_type: "icebreaker_gift", items_json: [{ item_id: item.id, name: item.name, qty: 1, unit_price: item.price }], total_amount: item.price, payment_status: payment, gift_to: to });
  let next: RougeState = { ...state, bar_orders: [...state.bar_orders, order] };
  let perk: UserPerkQR | null = null;
  if (payment === "pay_at_bar") {
    // Sin cobro online, el regalo sale al instante (se paga en la barra al retirarlo, como el trago del Rompehielos).
    perk = perkFor(ev.id, to, null, `${item.emoji} ${item.name} — te lo invitó ${getProfile(state, senderId)?.full_name.split(" ")[0] ?? "tu match"}`, "gifted_drink", "manual", order.id, now);
    next = addSpend({ ...next, user_perks_qrs: [...next.user_perks_qrs, perk] }, ev.id, [[senderId, item.price]]);
  }
  next = {
    ...next,
    messages: [
      ...next.messages,
      { id: uid(), event_id: ev.id, conversation_type: "direct", connection_id: c.id, squad_id: null, sender_id: senderId, message_type: "system_alert", content: payment === "pay_at_bar" ? `🎁 Te invitó un ${item.name}: el QR está en tus Perks para retirarlo en la barra.` : `🎁 Te está invitando un ${item.name} (se confirma con el pago).`, media_url: null, created_at: iso(now) },
    ],
  };
  return { ok: true, state: next, data: { order, perk } };
}

/**
 * Al acreditarse un pago: emite el trago regalado y, si se completó una Mesa VIP, el QR grupal. Idempotente
 * (por `source_ref_id`). Lo usa confirmOrderPayment (espejo del bloque nuevo de confirm_order_payment en SQL).
 */
export function afterPayment(state: RougeState, order: BarOrder, now = Date.now()): RougeState {
  let next = state;
  if (order.gift_to && !next.user_perks_qrs.some((p) => p.source_ref_id === order.id)) {
    const item = order.items_json[0];
    next = { ...next, user_perks_qrs: [...next.user_perks_qrs, perkFor(order.event_id, order.gift_to, null, `🎁 ${item?.name ?? "Trago"} — te lo invitó ${getProfile(state, order.user_id)?.full_name.split(" ")[0] ?? "tu match"}`, "gifted_drink", "manual", order.id, now)] };
  }
  if (order.vip_reservation_id) {
    const r = (next.vip_reservations ?? []).find((x) => x.id === order.vip_reservation_id);
    const st = r ? vipReservationStatus(next, r) : null;
    if (r && st?.complete && !next.user_perks_qrs.some((p) => p.source_ref_id === r.id)) {
      const perks = st.shares.map((sh) => perkFor(r.event_id, sh.user_id, r.squad_id, `🍾 Mesa VIP · ${r.label} — acceso grupal`, "fast_pass", "manual", r.id, now));
      next = { ...next, user_perks_qrs: [...next.user_perks_qrs, ...perks] };
    }
  }
  return next;
}

// ── Mesa VIP dividida (Vaquita) ──────────────────────────────────────

/** Reparte el total en partes enteras; los primeros absorben el resto (la suma da exacto). */
export function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Reserva de Mesa VIP: el precio sale del menú (Botellas VIP), una cuota por integrante del Squad. */
export function createVipReservation(state: RougeState, squadId: UUID, userId: UUID, itemId: string, now = Date.now()): Result<VipReservation> {
  const sq = state.squads.find((x) => x.id === squadId);
  if (!sq) return fail("Ese Squad no existe.");
  const members = squadMembers(state, squadId);
  if (!members.some((m) => m.user_id === userId)) return fail("No sos parte de este Squad.");
  if (members.length < 2) return fail("La mesa dividida necesita al menos 2 integrantes en el Squad.");
  const ev = getEvent(state, sq.event_id);
  if (!ev || !isLobbyInteractive(ev, now)) return fail("Las reservas se hacen mientras la fiesta está abierta.");
  if ((state.vip_reservations ?? []).some((r) => r.squad_id === squadId && !vipReservationStatus(state, r).complete)) return fail("Ya tienen una reserva en curso: completen esa primero.");
  const item = state.bar_menu.find((i) => i.id === itemId);
  if (!item || item.category !== "botella" || item.is_available === false) return fail("Elegí una botella / mesa VIP disponible del menú.");
  const reservation: VipReservation = { id: uid(), event_id: ev.id, squad_id: squadId, item_id: item.id, label: item.name, total_amount: item.price, created_by: userId, created_at: iso(now) };
  const payment = initialPaymentStatus(state, ev.id);
  const shares = splitEven(item.price, members.length);
  const orders = members.map((m, i) =>
    baseOrder(ev.id, m.user_id, now, {
      squad_id: squadId,
      delivery_type: "squad_split",
      items_json: [{ item_id: item.id, name: `${item.name} · parte ${i + 1}/${members.length}`, qty: 1, unit_price: shares[i] }],
      total_amount: shares[i],
      payment_status: payment,
      vip_reservation_id: reservation.id,
    }),
  );
  return { ok: true, state: { ...state, vip_reservations: [...(state.vip_reservations ?? []), reservation], bar_orders: [...state.bar_orders, ...orders] }, data: reservation };
}

export function vipReservationStatus(state: RougeState, r: VipReservation) {
  const shares = state.bar_orders.filter((o) => o.vip_reservation_id === r.id).map((o) => ({ order: o, user_id: o.user_id, amount: o.total_amount, paid: o.payment_status === "paid" }));
  const paid = shares.filter((x) => x.paid).reduce((a, x) => a + x.amount, 0);
  // Sin cobro online la mesa se paga en la barra: se considera completa al reservar (no hay cuotas online).
  const offline = shares.length > 0 && shares.every((x) => x.order.payment_status === "pay_at_bar");
  return { shares, paid, total: r.total_amount, percent: r.total_amount ? Math.round((paid / r.total_amount) * 100) : 0, complete: offline || (shares.length > 0 && shares.every((x) => x.paid)) };
}

export const activeVipReservation = (state: RougeState, eventId: UUID, userId: UUID) => {
  const mine = squadOf(state, eventId, userId);
  return mine ? (state.vip_reservations ?? []).filter((r) => r.squad_id === mine.squad.id).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] : undefined;
};

// ── Cola virtual de la barra ─────────────────────────────────────────

/** Posición del pedido entre los que la barra todavía no terminó (1 = el próximo). null si ya está listo. */
export function queuePosition(state: RougeState, order: BarOrder): number | null {
  if (order.status !== "pending" && order.status !== "preparing") return null;
  const ahead = state.bar_orders.filter((o) => o.event_id === order.event_id && o.payment_status !== "awaiting_payment" && (o.status === "pending" || o.status === "preparing") && +new Date(o.created_at) < +new Date(order.created_at));
  return ahead.length + 1;
}

// ── Rouge Wrapped ────────────────────────────────────────────────────

export interface Wrapped {
  event: string;
  venue: string;
  date: string;
  name: string;
  matches: number;
  connections_sent: number;
  squad: { name: string; size: number } | null;
  drinks: number;
  spent: number;
  songs_voted: number;
  top_genres: string[];
  hours: number | null;
  photos: string[];
  afterglow_until: string;
}

/** Resumen de la noche para la tarjeta 9:16 (Stories). Solo datos propios o agregados: nada de terceros sin match. */
export function wrappedFor(state: RougeState, userId: UUID, eventId: UUID, now = Date.now()): Wrapped | null {
  const ev = getEvent(state, eventId);
  const me = getProfile(state, userId);
  const att = state.event_attendees.find((a) => a.event_id === eventId && a.user_id === userId);
  if (!ev || !me || !att) return null;
  const conns = state.connections.filter((c) => c.event_id === eventId && (c.sender_id === userId || c.receiver_id === userId));
  const matches = conns.filter((c) => c.status === "accepted");
  const mine = squadOf(state, eventId, userId);
  const orders = state.bar_orders.filter((o) => o.event_id === eventId && (o.user_id === userId || o.split_user_ids.includes(userId)) && o.payment_status !== "awaiting_payment");
  const photos = matches
    .map((c) => getProfile(state, c.sender_id === userId ? c.receiver_id : c.sender_id)?.photos[0]?.url)
    .filter((x): x is string => !!x)
    .slice(0, 4);
  const end = Math.min(now, +new Date(ev.ends_at));
  return {
    event: ev.name,
    venue: ev.venue_name,
    date: ev.starts_at,
    name: me.full_name.split(" ")[0],
    matches: matches.length,
    connections_sent: conns.filter((c) => c.sender_id === userId).length,
    squad: mine ? { name: mine.squad.name, size: squadMembers(state, mine.squad.id).length } : null,
    drinks: orders.reduce((a, o) => a + o.items_json.reduce((b, i) => b + i.qty, 0), 0),
    spent: att.total_spent,
    songs_voted: state.song_requests.filter((r) => r.event_id === eventId && r.voter_ids.includes(userId)).length,
    top_genres: me.music_genres.slice(0, 3),
    hours: att.checked_in_at ? Math.max(0, Math.round(((end - +new Date(att.checked_in_at)) / 3_600_000) * 10) / 10) : null,
    photos: [me.photos[0]?.url, ...photos].filter((x): x is string => !!x).slice(0, 4),
    afterglow_until: ev.lobby_expires_at,
  };
}

paymentHooks.after = afterPayment;
