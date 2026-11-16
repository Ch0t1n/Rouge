import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import { deleteEvent, deleteMenuItem, duplicateEvent, removeAttendee, unbanAttendee, upsertMenuItem } from "./eventAdmin";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ORG = DEMO_IDS.organizer;
const ok = <T,>(r: { ok: true; state: RougeState; data: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("menú de la barra", () => {
  it("alta con id único, edición de precio y agotado", () => {
    const s = createSeedState(NOW);
    const add = ok(upsertMenuItem(s, { name: "Gin Pomelo", category: "trago", price: 9000, emoji: "🍹" }));
    expect(add.data).toMatchObject({ id: "gin-pomelo", is_available: true });
    expect(upsertMenuItem(add.state, { name: "gin pomelo", category: "trago", price: 1 }).ok).toBe(false); // nombre repetido
    const off = ok(upsertMenuItem(add.state, { ...add.data, is_available: false }));
    // Agotado: no se puede pedir ni regalar
    expect(A.createBarOrder(off.state, EV, DEMO_IDS.me, [{ itemId: "gin-pomelo", qty: 1 }], "fast_pickup", NOW).ok).toBe(false);
    const gin = ok(upsertMenuItem(s, { ...s.bar_menu.find((i) => i.id === "gin")!, is_available: false }));
    expect(A.sendIcebreaker(gin.state, EV, DEMO_IDS.me, id(8), { message: "hola", giftDrinkItemId: "gin" }, NOW).ok).toBe(false);
  });

  it("valida nombre, precio y categoría; la baja conserva los pedidos viejos", () => {
    const s = createSeedState(NOW);
    expect(upsertMenuItem(s, { name: "X", category: "trago", price: 10 }).ok).toBe(false);
    expect(upsertMenuItem(s, { name: "Agua", category: "trago", price: -1 }).ok).toBe(false);
    expect(upsertMenuItem(s, { name: "Agua 2", category: "postre" as never, price: 10 }).ok).toBe(false);
    const del = ok(deleteMenuItem(s, "gin"));
    expect(del.state.bar_menu.some((i) => i.id === "gin")).toBe(false);
    expect(del.state.bar_orders.filter((o) => o.items_json.some((i) => i.item_id === "gin")).length).toBeGreaterThan(0);
  });
});

describe("nueva edición del evento", () => {
  it("copia y corre fechas, line-up y reglas de perks", () => {
    const s = { ...createSeedState(NOW), current_user_id: ORG };
    const src = s.events[0];
    const start = new Date(NOW + 7 * 86_400_000).toISOString();
    const r = ok(duplicateEvent(s, EV, start, ORG, NOW));
    const delta = +new Date(start) - +new Date(src.starts_at);
    expect(r.data.event.id).not.toBe(EV);
    expect(r.data.event.slug).not.toBe(src.slug);
    expect(r.data.event.master_invite_code).not.toBe(src.master_invite_code);
    expect(+new Date(r.data.event.lobby_expires_at) - +new Date(src.lobby_expires_at)).toBe(delta);
    expect(+new Date(r.data.event.lineup_json[0].starts_at) - +new Date(src.lineup_json[0].starts_at)).toBe(delta);
    expect(r.data.event.brand_id).toBe(src.brand_id);
    expect(r.data.rules).toHaveLength(1);
    expect(+new Date(r.data.rules[0].trigger.before!) - +new Date(s.perk_rules[0].trigger.before!)).toBe(delta);
    expect(duplicateEvent(s, EV, new Date(NOW - 1000).toISOString(), ORG, NOW).ok).toBe(false);
  });
});

describe("asistentes", () => {
  it("expulsar saca del lobby, del Squad y del plano; con bloqueo no puede volver", () => {
    const s = createSeedState(NOW);
    const r = ok(removeAttendee(s, EV, id(2), true, ORG, "Agresivo", NOW));
    expect(r.state.event_attendees.some((a) => a.user_id === id(2))).toBe(false);
    expect(r.state.squad_members.some((m) => m.user_id === id(2))).toBe(false);
    expect(r.state.map_pins.some((p) => p.user_id === id(2))).toBe(false);
    expect(A.joinEvent(r.state, id(2), "BRESH26", "just_dance", NOW).ok).toBe(false);
    expect(r.state.connections.some((c) => c.sender_id === id(2) || c.receiver_id === id(2))).toBe(true); // matches intactos
    const back = ok(unbanAttendee(r.state, EV, id(2)));
    expect(A.joinEvent(back.state, id(2), "BRESH26", "just_dance", NOW).ok).toBe(true);
  });

  it("sin bloqueo puede volver a entrar; al equipo no se lo expulsa", () => {
    const s = createSeedState(NOW);
    const r = ok(removeAttendee(s, EV, id(2), false, ORG, null, NOW));
    expect(A.joinEvent(r.state, id(2), "BRESH26", "just_dance", NOW).ok).toBe(true);
    expect(removeAttendee(s, EV, DEMO_IDS.bartender, true, ORG, null, NOW).ok).toBe(false);
    expect(removeAttendee(s, EV, ORG, true, DEMO_IDS.manager, null, NOW).ok).toBe(false);
  });
});

describe("eliminar evento", () => {
  it("solo quien lo creó y si no entró nadie", () => {
    const s = { ...createSeedState(NOW), current_user_id: ORG };
    expect(deleteEvent(s, EV, ORG).ok).toBe(false); // tiene asistentes y cobros
    const dup = ok(duplicateEvent(s, EV, new Date(NOW + 7 * 86_400_000).toISOString(), ORG, NOW));
    expect(deleteEvent(dup.state, dup.data.event.id, DEMO_IDS.manager).ok).toBe(false);
    const del = ok(deleteEvent(dup.state, dup.data.event.id, ORG));
    expect(del.state.events.some((e) => e.id === dup.data.event.id)).toBe(false);
    expect(del.state.perk_rules.some((r) => r.event_id === dup.data.event.id)).toBe(false);
  });
});
