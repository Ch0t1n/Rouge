import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import * as A from "./actions";
import { crmRows, liveWallData } from "./analytics";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const ok = <T,>(r: A.Result<T>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

describe("eventos", () => {
  it("crea un evento con slug normalizado y lobby por defecto (48 h antes / 24 h después)", () => {
    const r = ok(A.upsertEvent(createSeedState(NOW), { name: "Fiesta Neón Ñandú", starts_at: at(72), ends_at: at(78) }, NOW));
    expect(r.data.slug).toBe("fiesta-neon-nandu");
    expect(+new Date(r.data.lobby_opens_at)).toBe(NOW + 24 * 3_600_000);
    expect(+new Date(r.data.lobby_expires_at)).toBe(NOW + 102 * 3_600_000);
  });
  it("valida horarios, cupo, slug duplicado y line-up", () => {
    const s = createSeedState(NOW);
    expect(A.upsertEvent(s, { name: "X", starts_at: at(5), ends_at: at(4) }, NOW).ok).toBe(false);
    expect(A.upsertEvent(s, { name: "Otra", starts_at: at(5), ends_at: at(9), lobby_opens_at: at(6) }, NOW).ok).toBe(false);
    expect(A.upsertEvent(s, { name: "Otra", starts_at: at(5), ends_at: at(9), max_capacity: 0 }, NOW).ok).toBe(false);
    expect(A.upsertEvent(s, { name: "Bresh Sábado", slug: "bresh-sabado", starts_at: at(5), ends_at: at(9) }, NOW).ok).toBe(false);
    expect(A.upsertEvent(s, { name: "Otra", starts_at: at(5), ends_at: at(9), lineup_json: [{ id: "a", artist: "", starts_at: at(5), ends_at: at(6) }] }, NOW).ok).toBe(false);
  });
  it("genera lotes de códigos únicos sin repetir", () => {
    const r = ok(A.generateInviteCodes(createSeedState(NOW), EV, 200, NOW));
    expect(new Set(r.data.map((c) => c.code)).size).toBe(200);
  });
});

describe("barra / POS", () => {
  it("canjea el código de retiro solo cuando está listo", () => {
    let s = createSeedState(NOW);
    const o = ok(A.createBarOrder(s, EV, DEMO_IDS.me, [{ itemId: "gin", qty: 1 }], "fast_pickup", NOW));
    s = o.state;
    expect(A.redeemPickupCode(s, EV, o.data.pickup_code!, NOW).ok).toBe(false); // pending
    s = ok(A.setOrderStatus(s, o.data.id, "preparing", NOW)).state;
    s = ok(A.setOrderStatus(s, o.data.id, "ready_qr", NOW)).state;
    const r = ok(A.redeemPickupCode(s, EV, `ROUGE:ORDER:${o.data.id}:${o.data.pickup_code}`, NOW));
    expect(r.data.status).toBe("completed");
    expect(A.redeemPickupCode(r.state, EV, o.data.pickup_code!, NOW).ok).toBe(false); // ya entregado
  });
});

describe("blasts segmentados", () => {
  it("calcula el alcance por segmento", () => {
    const s = createSeedState(NOW);
    expect(A.blastAudience(s, EV, { kind: "all" }, NOW)).toHaveLength(13);
    expect(A.blastAudience(s, EV, { kind: "squad_min_size", min: 4 }, NOW)).toHaveLength(4);
    expect(A.blastAudience(s, EV, { kind: "top_spenders", limit: 3 }, NOW)).toHaveLength(3);
    const r = ok(A.sendBlast(s, EV, { title: "2x1", message: "Barra Terraza", segment: { kind: "all" }, flashMinutes: 20 }, NOW));
    expect(r.data.blast.is_flash_promo).toBe(true);
    expect(liveWallData(r.state, EV, NOW).flash?.id).toBe(r.data.blast.id);
  });
});

describe("live wall", () => {
  it("muestra el último ganador del sorteo", () => {
    let s = createSeedState(NOW);
    s = ok(A.drawRaffle(s, s.raffles[0].id, () => 0, NOW)).state;
    expect(liveWallData(s, EV, NOW).lastRaffle?.winner).toBeTruthy();
    expect(crmRows(s, EV).length).toBe(13);
  });
});
