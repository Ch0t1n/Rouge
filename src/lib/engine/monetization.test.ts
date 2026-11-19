import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import { confirmOrderPayment } from "./payments";
import { createVipReservation, giftDrinkInChat, queuePosition, splitEven, vipReservationStatus, wrappedFor } from "./monetization";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;
const ok = <T,>(r: { ok: true; state: RougeState; data: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("invitar un trago desde el chat", () => {
  it("con cobro online el QR llega recién al acreditarse el pago (una sola vez)", () => {
    const s = createSeedState(NOW);
    const conn = s.connections.find((c) => c.status === "accepted" && (c.sender_id === ME || c.receiver_id === ME) && c.event_id === EV)!;
    const to = conn.sender_id === ME ? conn.receiver_id : conn.sender_id;
    const g = ok(giftDrinkInChat(s, ME, conn.id, "gin", NOW));
    expect(g.data.order).toMatchObject({ gift_to: to, payment_status: "awaiting_payment" });
    expect(g.data.perk).toBeNull();
    expect(g.state.messages.at(-1)).toMatchObject({ connection_id: conn.id, message_type: "system_alert" });
    const paid = ok(confirmOrderPayment(g.state, g.data.order.id, "mp-1", g.data.order.total_amount, NOW));
    const perks = paid.state.user_perks_qrs.filter((p) => p.source_ref_id === g.data.order.id);
    expect(perks).toHaveLength(1);
    expect(perks[0]).toMatchObject({ user_id: to, perk_type: "gifted_drink" });
    const again = ok(confirmOrderPayment(paid.state, g.data.order.id, "mp-1", g.data.order.total_amount, NOW));
    expect(again.state.user_perks_qrs.filter((p) => p.source_ref_id === g.data.order.id)).toHaveLength(1);
  });

  it("no se puede regalar una botella ni en un chat ajeno", () => {
    const s = createSeedState(NOW);
    const conn = s.connections.find((c) => c.status === "accepted" && (c.sender_id === ME || c.receiver_id === ME))!;
    const bottle = s.bar_menu.find((i) => i.category === "botella")!;
    expect(giftDrinkInChat(s, ME, conn.id, bottle.id, NOW).ok).toBe(false);
    expect(giftDrinkInChat(s, DEMO_IDS.organizer, conn.id, "gin", NOW).ok).toBe(false);
  });
});

describe("Mesa VIP dividida (Vaquita)", () => {
  it("una cuota por integrante; el QR grupal se libera al 100 %", () => {
    expect(splitEven(100, 3)).toEqual([34, 33, 33]);
    let s = createSeedState(NOW);
    const bottle = s.bar_menu.find((i) => i.category === "botella")!;
    const r = ok(createVipReservation(s, DEMO_IDS.squadMain, ME, bottle.id, NOW));
    s = r.state;
    const st = vipReservationStatus(s, r.data);
    expect(st.shares.length).toBeGreaterThanOrEqual(2);
    expect(st.shares.reduce((a, x) => a + x.amount, 0)).toBe(bottle.price);
    expect(st.complete).toBe(false);
    expect(createVipReservation(s, DEMO_IDS.squadMain, ME, bottle.id, NOW).ok).toBe(false); // una en curso a la vez
    for (const sh of st.shares.slice(0, -1)) s = ok(confirmOrderPayment(s, sh.order.id, "mp", sh.amount, NOW)).state;
    expect(s.user_perks_qrs.some((p) => p.source_ref_id === r.data.id)).toBe(false);
    const last = st.shares.at(-1)!;
    s = ok(confirmOrderPayment(s, last.order.id, "mp", last.amount, NOW)).state;
    expect(vipReservationStatus(s, r.data)).toMatchObject({ complete: true, percent: 100 });
    expect(s.user_perks_qrs.filter((p) => p.source_ref_id === r.data.id)).toHaveLength(st.shares.length);
  });
});

describe("cola virtual y Wrapped", () => {
  it("posición en la cola de la barra", () => {
    const s = createSeedState(NOW);
    const open = s.bar_orders.filter((o) => o.event_id === EV && (o.status === "pending" || o.status === "preparing") && o.payment_status !== "awaiting_payment").sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    expect(queuePosition(s, open[0])).toBe(1);
    if (open[1]) expect(queuePosition(s, open[1])).toBe(2);
  });
  it("arma el resumen de la noche con datos propios", () => {
    const w = wrappedFor(createSeedState(NOW), ME, EV, NOW)!;
    expect(w.name).toBe("Sofía");
    expect(w.matches).toBeGreaterThan(0);
    expect(w.squad?.size).toBeGreaterThan(1);
    expect(w.photos.length).toBeGreaterThan(0);
  });
});
