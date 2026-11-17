import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import { builderInputOf, canManageModules, deleteEvent, deleteMenuItem, duplicateEvent, removeAttendee, saveEventFromBuilder, setEventFeatures, setOwnerSelfService, unbanAttendee, upsertMenuItem } from "./eventAdmin";
import { ALL_FEATURES, enabledNav, eventFeatures, FEATURE_PRESETS, isPathEnabled, matchingPreset, resolveFeatures, toggleFeature } from "./features";
import { doorCheckIn } from "./door";
import { createVipReservation, giftDrinkInChat } from "./monetization";

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

// ── Creador modular y módulos por evento (v1.8) ──────────────────────

describe("creador modular de eventos", () => {
  const T0 = Date.parse("2026-11-14T03:00:00.000Z");
  const HQ = DEMO_IDS.platformAdmin;
  const OWNER = DEMO_IDS.organizer;
  const base = (preset: (typeof FEATURE_PRESETS)[number]["id"]) => ({
    organization_id: OWNER,
    name: "Techno Bunker",
    starts_at: new Date(T0 + 86_400_000).toISOString(),
    ends_at: new Date(T0 + 86_400_000 + 6 * 3_600_000).toISOString(),
    lifecycle_status: "presale" as const,
    max_capacity: 800,
    features: FEATURE_PRESETS.find((p) => p.id === preset)!.flags,
    lists: [{ name: "Lista Free", free_until: new Date(T0 + 86_400_000 + 3_600_000).toISOString(), late_price: 8000 }],
  });

  it("ROUGE HQ crea un evento con un preset y lo asigna a la organización", () => {
    const s = createSeedState(T0);
    const r = saveEventFromBuilder({ ...s, current_user_id: HQ }, HQ, base("ticketing_door"), T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.event).toMatchObject({ created_by: OWNER, lifecycle_status: "presale", max_capacity: 800 });
    const f = eventFeatures(r.state, r.data.event.id);
    expect(f).toMatchObject({ enableTicketing: true, enableRrpp: true, enableSocialLobby: false, enableSmartBar: false });
    expect(matchingPreset(f)).toBe("ticketing_door");
    expect(r.data.lists[0]).toMatchObject({ name: "Lista Free", late_price: 8000 });
    expect(r.state.current_user_id).toBe(HQ);
    // Sin slug, el link se arma con el nombre
    const noSlug = saveEventFromBuilder({ ...s, current_user_id: HQ }, HQ, { ...base("full"), name: "Neon Club", slug: "" }, T0);
    expect(noSlug.ok && noSlug.data.event.slug).toBe("neon-club");
  });

  it("el dueño/a solo usa el creador con autogestión habilitada por ROUGE HQ", () => {
    const s = createSeedState(T0);
    expect(canManageModules(s, OWNER, OWNER)).toBe(false);
    expect(saveEventFromBuilder(s, OWNER, base("full"), T0).ok).toBe(false);
    expect(setOwnerSelfService(s, OWNER, OWNER, true).ok).toBe(false); // solo ROUGE HQ
    const on = setOwnerSelfService({ ...s, current_user_id: HQ }, HQ, OWNER, true, T0);
    if (!on.ok) throw new Error(on.error);
    expect(canManageModules(on.state, OWNER, OWNER)).toBe(true);
    expect(saveEventFromBuilder(on.state, OWNER, base("full"), T0).ok).toBe(true);
    // con autogestión no puede crear para OTRA organización
    expect(saveEventFromBuilder(on.state, OWNER, { ...base("full"), organization_id: DEMO_IDS.manager }, T0).ok).toBe(false);
  });

  it("edita un evento existente (datos, estado y módulos) sin perder lo demás", () => {
    const s = { ...createSeedState(T0), current_user_id: HQ };
    const ev = s.events[0];
    const r = saveEventFromBuilder(s, HQ, { ...builderInputOf(s, ev), name: "Bresh XL", lifecycle_status: "live", features: { ...ALL_FEATURES, enableLiveWall: false } }, T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.event).toMatchObject({ id: ev.id, name: "Bresh XL", master_invite_code: ev.master_invite_code });
    expect(eventFeatures(r.state, ev.id).enableLiveWall).toBe(false);
  });

  it("resuelve dependencias: sin Barra (o sin Chat) no hay regalo de tragos; sin Squads no hay Vaquita", () => {
    const off = resolveFeatures({ ...ALL_FEATURES, enableSmartBar: false });
    expect(off.enableChatDrinkGifting).toBe(false);
    expect(resolveFeatures({ ...ALL_FEATURES, enableDirectChat: false }).enableChatDrinkGifting).toBe(false);
    expect(resolveFeatures({ ...ALL_FEATURES, enableSquads: false }).enableSquadBillSplit).toBe(false);
    expect(resolveFeatures({ ...ALL_FEATURES, enableTicketing: false }).enableFreeCutoffConversion).toBe(false);
    // Prender el regalo prende sus dependencias
    const back = toggleFeature(off, "enableChatDrinkGifting", true);
    expect(back).toMatchObject({ enableChatDrinkGifting: true, enableSmartBar: true, enableDirectChat: true });
    // un evento sin configuración tiene todo prendido; los presets ya vienen resueltos
    expect(resolveFeatures(null)).toEqual(ALL_FEATURES);
    for (const p of FEATURE_PRESETS) expect(resolveFeatures(p.flags)).toEqual(resolveFeatures(resolveFeatures(p.flags)));
  });

  it("filtra rutas y navegación según los módulos activos", () => {
    const f = resolveFeatures({ ...ALL_FEATURES, enableSocialLobby: false, enableDirectChat: false });
    expect(isPathEnabled(f, "/lobby")).toBe(false);
    expect(isPathEnabled(f, "/chat/abc")).toBe(false);
    expect(isPathEnabled(f, "/inbox")).toBe(false);
    expect(isPathEnabled(f, "/bar")).toBe(true);
    expect(isPathEnabled(f, "/app")).toBe(true);
    expect(isPathEnabled(resolveFeatures({ enableSquadBillSplit: false }), "/squad/cuentas")).toBe(false);
    expect(isPathEnabled(resolveFeatures({ enableSquadBillSplit: false }), "/squad")).toBe(true);
    expect(isPathEnabled(resolveFeatures({ enableSmartBar: false }), "/admin/bar-pos")).toBe(false);
    expect(isPathEnabled(resolveFeatures({ enableSmartBar: false }), "/admin/menu")).toBe(false);
    const nav = [{ href: "/app" }, { href: "/lobby" }, { href: "/map" }, { href: "/squad" }, { href: "/inbox" }];
    expect(enabledNav(nav, f).map((n) => n.href)).toEqual(["/app", "/map", "/squad"]);
  });

  it("las acciones validan su módulo antes de procesarse", () => {
    const s0 = createSeedState(T0);
    const s = setEventFeatures({ ...s0, current_user_id: HQ }, HQ, EV, { ...ALL_FEATURES, enableSmartBar: false, enableSquads: false, enableSocialLobby: false, enableTicketing: false, enableVenueMap: false });
    if (!s.ok) throw new Error(s.error);
    const st = { ...s.state, current_user_id: DEMO_IDS.me };
    const notOn = { ok: false, error: "Esta función no está activa en este evento." };
    expect(A.createBarOrder(st, EV, DEMO_IDS.me, [{ itemId: "gin", qty: 1 }], "fast_pickup", T0)).toEqual(notOn);
    expect(A.createSquad(st, EV, "00000000-0000-4000-8000-000000000005", "Nuevo", T0)).toEqual(notOn);
    expect(A.sendConnection(st, EV, DEMO_IDS.me, "00000000-0000-4000-8000-000000000011", T0)).toEqual(notOn);
    expect(A.dropPin(st, EV, DEMO_IDS.me, { x: 10, y: 10, shareWithSquad: true, matchIds: [] }, T0)).toEqual(notOn);
    expect(doorCheckIn(st, EV, st.event_invite_codes[10].code, T0).data.status).toBe("module_off");
    const conn = st.connections.find((c) => c.status === "accepted" && (c.sender_id === DEMO_IDS.me || c.receiver_id === DEMO_IDS.me))!;
    expect(giftDrinkInChat(st, DEMO_IDS.me, conn.id, "gin", T0)).toEqual(notOn);
    expect(createVipReservation(st, DEMO_IDS.squadMain, DEMO_IDS.me, "botella-vodka", T0).ok).toBe(false);
    // los chats 1 a 1 siguen funcionando (su módulo está prendido)
    expect(A.sendMessage(st, DEMO_IDS.me, { type: "direct", connectionId: conn.id }, { content: "hola" }, T0).ok).toBe(true);
  });

  it("un evento en borrador no deja entrar", () => {
    const s = createSeedState(T0);
    const draft = { ...s, events: s.events.map((e) => ({ ...e, lifecycle_status: "draft" as const })) };
    expect(A.joinEvent(draft, "00000000-0000-4000-8000-000000000013", "BRESH26", "open_to_meet", T0)).toMatchObject({ ok: false, error: expect.stringContaining("publicado") });
  });
});
