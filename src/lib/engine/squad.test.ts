import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import * as A from "./actions";
import * as S from "./selectors";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;
const ok = <T,>(r: A.Result<T>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("seguridad del squad", () => {
  it("el rescate aparece como alerta para las amigas, no para mí ni para otros squads", () => {
    let s = createSeedState(NOW);
    s = ok(A.triggerRescue(s, EV, id(3), { x: 14, y: 70 }, NOW)).state; // Juli
    expect(S.rescueAlertsFor(s, EV, ME, NOW).map((a) => a.profile.username)).toEqual(["juli.rkt"]);
    expect(S.rescueAlertsFor(s, EV, id(3), NOW)).toHaveLength(0);
    expect(S.rescueAlertsFor(s, EV, id(10), NOW)).toHaveLength(0); // squad VIP
    s = ok(A.resolveRescue(s, EV, id(3), NOW)).state;
    expect(S.rescueAlertsFor(s, EV, ME, NOW)).toHaveLength(0);
  });

  it("'llegué a casa' borra el pin y avisa al chat", () => {
    let s = createSeedState(NOW);
    s = ok(A.markHomeSafe(s, EV, id(2), NOW)).state;
    expect(S.activePinOf(s, EV, id(2), NOW)).toBeUndefined();
    expect(S.squadMessages(s, DEMO_IDS.squadMain).at(-1)?.content).toMatch(/llegó bien a casa/);
  });

  it("lista las mesas VIP abiertas de otros squads", () => {
    const s = createSeedState(NOW);
    const vip = S.openVipSquads(s, EV, ME);
    expect(vip.map((v) => v.squad.name)).toEqual(["Mesa 7 · Los del Fondo"]);
    expect(S.openVipSquads(s, EV, id(10))).toHaveLength(0); // es la propia
  });

  it("el Punto Base exige pertenecer al squad y notifica", () => {
    let s = createSeedState(NOW);
    expect(A.setSquadBasePin(s, DEMO_IDS.squadMain, id(10), 10, 10, "x", NOW).ok).toBe(false);
    s = ok(A.setSquadBasePin(s, DEMO_IDS.squadMain, ME, 85, 60, "Mesa VIP", NOW)).state;
    expect(s.squads.find((q) => q.id === DEMO_IDS.squadMain)?.base_pin_label).toBe("Mesa VIP");
    s = ok(A.announceBaseMeetup(s, DEMO_IDS.squadMain, ME, 10, NOW)).state;
    expect(S.squadMessages(s, DEMO_IDS.squadMain).at(-1)?.content).toMatch(/Punto Base en 10 min/);
  });

  it("invitar por @username y aceptar la invitación", () => {
    let s = createSeedState(NOW);
    s = ok(A.inviteToSquad(s, DEMO_IDS.squadMain, ME, id(8), NOW)).state;
    expect(S.pendingSquadInvites(s, EV, id(8))).toHaveLength(1);
    s = ok(A.joinSquad(s, id(8), DEMO_IDS.squadMain, NOW)).state;
    expect(S.squadSize(s, DEMO_IDS.squadMain)).toBe(5);
    expect(S.perksOf(s, id(8), EV).some((p) => p.source === "perk_rule")).toBe(true); // regla Squad 4+ antes de la 01:00 (seed: aún vigente)
  });
});

describe("chat", () => {
  it("envía fotos en el chat del squad y en directos", () => {
    let s = createSeedState(NOW);
    s = ok(A.sendMessage(s, ME, { type: "squad", squadId: DEMO_IDS.squadMain }, { type: "image", content: "", mediaUrl: "idb:abc" }, NOW)).state;
    expect(S.squadMessages(s, DEMO_IDS.squadMain).at(-1)?.message_type).toBe("image");
    expect(A.sendMessage(s, ME, { type: "squad", squadId: DEMO_IDS.squadMain }, { type: "image", content: "" }, NOW).ok).toBe(false);
    expect(A.sendMessage(s, id(10), { type: "squad", squadId: DEMO_IDS.squadMain }, { content: "hola" }, NOW).ok).toBe(false);
  });
});

describe("barra express", () => {
  it("delivery exige pin activo o Mesa VIP con Punto Base", () => {
    let s = createSeedState(NOW);
    expect(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 1 }], "pin_delivery", NOW).ok).toBe(false);
    s = ok(A.dropPin(s, EV, ME, { x: 40, y: 30, shareWithSquad: true, matchIds: [] }, NOW)).state;
    const r = ok(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 2 }], "pin_delivery", NOW));
    expect(r.data.sector_name).toBe("Pista Principal");
    expect(r.data.total_amount).toBe(16000);
    // Tomi tiene Mesa VIP con Punto Base: delivery sin pin propio
    expect(A.createBarOrder(createSeedState(NOW), EV, id(11), [{ itemId: "ipa", qty: 1 }], "pin_delivery", NOW + 20 * 60_000).ok).toBe(true);
  });

  it("los pedidos avanzan por su flujo", () => {
    const s = createSeedState(NOW);
    const r = ok(A.createBarOrder(s, EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW));
    expect(r.data.pickup_code).toBeTruthy();
    expect(A.nextOrderStatus(r.data)).toBe("preparing");
    expect(A.setOrderStatus(r.state, r.data.id, "delivering", NOW).ok).toBe(false);
  });
});
