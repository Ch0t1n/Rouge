import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import * as S from "./selectors";
import { cancelUnpaidOrder, confirmOrderPayment, connectPaymentsDemo, disconnectPayments, marketplaceFee } from "./payments";
import { addSquadExpense, parsePayoutAlias, recordSettlement, respondSettlement, setPayoutAlias, settleTransfers, splitCents, squadAccount, squadBalances } from "./settle";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;
const SQ = DEMO_IDS.squadMain;
const ok = <T,>(r: { ok: true; state: RougeState; data: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const net = (s: RougeState, u: string) => squadBalances(s, SQ).find((b) => b.user_id === u)?.net;

describe("cobros de la barra", () => {
  it("con Mercado Pago el pedido espera el pago; sin cobro online se paga en la barra", () => {
    const s = createSeedState(NOW);
    const o = ok(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW));
    expect(o.data.payment_status).toBe("awaiting_payment");
    const off = ok(disconnectPayments(s, DEMO_IDS.organizer, DEMO_IDS.brand));
    const o2 = ok(A.createBarOrder(off.state, EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW));
    expect(o2.data.payment_status).toBe("pay_at_bar");
    expect(S.getAttendee(o2.state, EV, ME)!.total_spent).toBe(S.getAttendee(s, EV, ME)!.total_spent + 8000);
  });

  it("acreditar es idempotente y exige el monto exacto", () => {
    const s = createSeedState(NOW);
    const o = ok(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 2 }], "fast_pickup", NOW));
    expect(confirmOrderPayment(o.state, o.data.id, "mp-1", 100, NOW).ok).toBe(false);
    const p1 = ok(confirmOrderPayment(o.state, o.data.id, "mp-1", 16000, NOW));
    const p2 = ok(confirmOrderPayment(p1.state, o.data.id, "mp-1", 16000, NOW));
    expect(S.getAttendee(p2.state, EV, ME)!.total_spent).toBe(S.getAttendee(s, EV, ME)!.total_spent + 16000);
    expect(p2.data.payment_status).toBe("paid");
  });

  it("solo quien pidió cancela un pedido sin pagar", () => {
    const s = createSeedState(NOW);
    const o = ok(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW));
    expect(cancelUnpaidOrder(o.state, o.data.id, id(2)).ok).toBe(false);
    expect(ok(cancelUnpaidOrder(o.state, o.data.id, ME)).state.bar_orders.some((x) => x.id === o.data.id)).toBe(false);
    const paid = ok(confirmOrderPayment(o.state, o.data.id, "mp", 8000, NOW));
    expect(cancelUnpaidOrder(paid.state, o.data.id, ME).ok).toBe(false);
  });

  it("solo la dueña de la marca conecta o desconecta la cuenta de cobro", () => {
    const s = createSeedState(NOW);
    expect(connectPaymentsDemo(s, ME, DEMO_IDS.brand).ok).toBe(false);
    expect(disconnectPayments(s, ME, DEMO_IDS.brand).ok).toBe(false);
    const off = ok(disconnectPayments(s, DEMO_IDS.organizer, DEMO_IDS.brand));
    expect(off.state.brand_payment_accounts).toHaveLength(0);
    const on = ok(connectPaymentsDemo(off.state, DEMO_IDS.organizer, DEMO_IDS.brand));
    expect(on.state.brands[0].payments_enabled).toBe(true);
  });

  it("comisión de ROUGE en centavos", () => {
    expect(marketplaceFee(8000, 5)).toBe(400);
    expect(marketplaceFee(8000.5, 5)).toBe(400.03);
    expect(marketplaceFee(8000, 0)).toBe(0);
  });

  it("pedido compartido con integrantes elegidos (botella para la mesa con delivery)", () => {
    const s = createSeedState(NOW);
    const sub = ok(A.createBarOrder(s, EV, ME, [{ itemId: "fernet", qty: 2 }], "fast_pickup", NOW, { splitWith: [ME, id(2)] }));
    expect(sub.data.delivery_type).toBe("squad_split");
    expect(sub.data.split_user_ids).toEqual([ME, id(2)]);
    expect(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW, { splitWith: [ME] }).ok).toBe(false);
    expect(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW, { splitWith: [ME, id(8)] }).ok).toBe(false); // no es del Squad
  });
});

describe("cuentas de la mesa", () => {
  it("reparte centavos sin perder ninguno", () => {
    const parts = splitCents(10000, ["a", "b", "c"]);
    expect([...parts.values()]).toEqual([3334, 3333, 3333]);
    expect([...parts.values()].reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("saldos del seed: pedido compartido + gastos cargados", () => {
    const s = createSeedState(NOW);
    // Sofía pagó el combo (22.000), Cami el Uber (12.000) y Juli la previa (18.000), entre las 4 → 13.000 c/u.
    expect(net(s, ME)).toBe(9000);
    expect(net(s, id(2))).toBe(-1000);
    expect(net(s, id(3))).toBe(5000);
    expect(net(s, id(4))).toBe(-13000);
    expect(squadBalances(s, SQ).reduce((a, b) => a + b.net, 0)).toBe(0);
  });

  it("transferencias mínimas para quedar a mano", () => {
    const t = settleTransfers(squadBalances(createSeedState(NOW), SQ));
    expect(t).toEqual([
      { from: id(4), to: ME, amount: 9000 },
      { from: id(4), to: id(3), amount: 4000 },
      { from: id(2), to: id(3), amount: 1000 },
    ]);
    expect(settleTransfers([{ user_id: "a", net: 0 }])).toEqual([]);
  });

  it("los pedidos que esperan pago no entran en la cuenta", () => {
    const s = createSeedState(NOW);
    const o = ok(A.createBarOrder(s, EV, id(4), [{ itemId: "champagne", qty: 1 }], "squad_split", NOW));
    expect(net(o.state, id(4))).toBe(-13000);
    const paid = ok(confirmOrderPayment(o.state, o.data.id, "mp", 60000, NOW));
    expect(net(paid.state, id(4))).toBe(-13000 + 60000 - 15000);
  });

  it("gasto cargado a mano: solo integrantes, montos válidos", () => {
    const s = createSeedState(NOW);
    expect(addSquadExpense(s, SQ, id(8), { description: "Taxi", amount: 1000, participantIds: [ME] }, NOW).ok).toBe(false); // no es del Squad
    expect(addSquadExpense(s, SQ, ME, { description: "", amount: 1000, participantIds: [ME] }, NOW).ok).toBe(false);
    expect(addSquadExpense(s, SQ, ME, { description: "Taxi", amount: -5, participantIds: [ME] }, NOW).ok).toBe(false);
    expect(addSquadExpense(s, SQ, ME, { description: "Taxi", amount: 100, participantIds: [id(8)] }, NOW).ok).toBe(false);
    const r = ok(addSquadExpense(s, SQ, id(4), { description: "Mesa", amount: 26000, participantIds: [ME, id(2), id(3), id(4)] }, NOW));
    expect(net(r.state, id(4))).toBe(-13000 + 26000 - 6500);
  });

  it("'Ya te pagué': cuenta al registrarse; quien recibe confirma o la rechaza", () => {
    const s = createSeedState(NOW);
    const t = ok(recordSettlement(s, SQ, id(4), ME, 9000, "mercadopago", NOW));
    expect(net(t.state, id(4))).toBe(-4000);
    expect(net(t.state, ME)).toBe(0);
    expect(squadAccount(t.state, SQ, ME).pendingConfirm).toHaveLength(1);
    expect(respondSettlement(t.state, t.data.id, id(2), true, NOW).ok).toBe(false); // no es quien recibe
    const conf = ok(respondSettlement(t.state, t.data.id, ME, true, NOW));
    expect(conf.data?.confirmed_at).toBeTruthy();
    expect(respondSettlement(conf.state, t.data.id, ME, false, NOW).ok).toBe(false); // ya confirmada
    const rej = ok(respondSettlement(t.state, t.data.id, ME, false, NOW));
    expect(net(rej.state, id(4))).toBe(-13000);
    expect(recordSettlement(s, SQ, ME, ME, 10, "cash", NOW).ok).toBe(false);
  });

  it("alias para cobrar: alias de Mercado Pago o CBU/CVU", () => {
    expect(parsePayoutAlias("Sofi.Noche.MP")).toBe("sofi.noche.mp");
    expect(parsePayoutAlias("0000003100012345678901")).toBe("0000003100012345678901");
    expect(parsePayoutAlias("abc")).toBeNull();
    expect(parsePayoutAlias("1234567")).toBeNull();
    const s = createSeedState(NOW);
    expect(setPayoutAlias(s, ME, "x").ok).toBe(false);
    const r = ok(setPayoutAlias(s, ME, "sofi.noche.mp"));
    expect(r.state.payout_aliases.find((a) => a.user_id === ME)?.alias).toBe("sofi.noche.mp");
    expect(ok(setPayoutAlias(r.state, ME, "")).state.payout_aliases.some((a) => a.user_id === ME)).toBe(false);
  });
});
