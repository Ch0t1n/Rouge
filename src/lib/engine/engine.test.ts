import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import { normalizePhone } from "@/lib/utils";
import * as A from "./actions";
import * as S from "./selectors";
import { crmRows } from "./analytics";
import { musicAffinity } from "./affinity";
import { parseInstagram } from "./profile";
const { upsertProfile, linkInstagram, unlinkInstagram } = A;

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;

function unwrap<T>(r: A.Result<T>) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("normalizePhone", () => {
  it("unifica formatos argentinos al mismo E.164", () => {
    const expected = "+5491122334455";
    expect(normalizePhone("11 2233-4455")).toBe(expected);
    expect(normalizePhone("+54 9 11 2233 4455")).toBe(expected);
    expect(normalizePhone("011 15 2233-4455")).toBe(expected);
    expect(normalizePhone("+54 11 2233 4455")).toBe(expected);
  });
  it("rechaza basura", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("seed", () => {
  it("arranca con la fiesta en vivo y el DJ invitado en cabina", () => {
    const s = createSeedState(NOW);
    const ev = S.getEvent(s, EV)!;
    expect(S.lobbyPhase(ev, NOW)).toBe("live");
    expect(S.lineupNow(ev, NOW).current?.artist).toContain("Kaleb");
    expect(s.event_attendees.filter((a) => a.event_id === EV)).toHaveLength(13);
  });
});

describe("bloqueos → invisibilidad mutua", () => {
  it("el bloqueo preventivo por teléfono oculta en ambos sentidos", () => {
    const s = createSeedState(NOW);
    const gonza = id(13);
    expect(S.isBlockedBetween(s, ME, gonza)).toBe(true);
    expect(S.visibleAttendees(s, EV, ME).some((g) => g.profile.id === gonza)).toBe(false);
    expect(S.visibleAttendees(s, EV, gonza).some((g) => g.profile.id === ME)).toBe(false);
    expect(S.searchAttendeesByUsername(s, EV, ME, "gonza")).toHaveLength(0);
  });

  it("bloquear a un match corta sus pines compartidos y su chat", () => {
    let s = createSeedState(NOW);
    const mateo = id(5);
    expect(S.visiblePins(s, EV, ME, NOW).some((p) => p.profile.id === mateo && p.audience === "match")).toBe(true);
    s = unwrap(A.blockUser(s, ME, mateo, NOW)).state;
    expect(S.visiblePins(s, EV, ME, NOW).some((p) => p.profile.id === mateo)).toBe(false);
    expect(S.matchesOf(s, ME, EV).some((m) => m.profile.id === mateo)).toBe(false);
    expect(A.sendMessage(s, ME, { type: "direct", connectionId: id(6001) }, { content: "hola" }, NOW).ok).toBe(false);
  });

  it("ghost mode oculta de la grilla", () => {
    const s = createSeedState(NOW);
    expect(S.visibleAttendees(s, EV, ME).some((g) => g.profile.username === "vale.pop")).toBe(false);
  });
});

describe("conexiones", () => {
  it("like recíproco = match inmediato", () => {
    let s = createSeedState(NOW);
    const lucas = id(6); // Lucas ya le dio Conectar a Sofi
    const r = unwrap(A.sendConnection(s, EV, ME, lucas, NOW));
    expect(r.data.matched).toBe(true);
    s = r.state;
    expect(S.isMatch(s, EV, ME, lucas)).toBe(true);
  });

  it("solo 1 Rompehielos por evento", () => {
    let s = createSeedState(NOW);
    s = unwrap(A.sendIcebreaker(s, EV, ME, id(8), { message: "¡Hola!" }, NOW)).state;
    const second = A.sendIcebreaker(s, EV, ME, id(11), { message: "Otro" }, NOW);
    expect(second.ok).toBe(false);
  });

  it("respeta 'solo recibir Rompehielos de quien conecté primero'", () => {
    const s = createSeedState(NOW);
    const fran = id(12);
    expect(A.sendIcebreaker(s, EV, ME, fran, { message: "hey" }, NOW).ok).toBe(false);
    // Fran sí conectó a Mateo → Mateo puede enviarle rompehielos
    expect(A.sendIcebreaker(s, EV, id(5), fran, { message: "hey" }, NOW).ok).toBe(true);
  });

  it("aceptar un rompehielos crea el match y siembra el primer mensaje", () => {
    let s = createSeedState(NOW);
    const ice = S.inboxOf(s, ME, EV)[0];
    expect(ice.connection.type).toBe("icebreaker"); // fijado arriba
    s = unwrap(A.respondConnection(s, ice.connection.id, ME, true, NOW)).state;
    expect(S.directMessages(s, ice.connection.id)[0].content).toBe(ice.connection.icebreaker_message);
  });

  it("rompehielos con trago adjunto genera QR para el receptor y suma gasto al emisor", () => {
    const s = createSeedState(NOW);
    const before = S.getAttendee(s, EV, ME)!.total_spent;
    const r = unwrap(A.sendIcebreaker(s, EV, ME, id(8), { message: "¿Un gin?", giftDrinkItemId: "gin" }, NOW));
    expect(r.data.attached_drink_qr_id).toBeTruthy();
    expect(S.perksOf(r.state, id(8), EV).some((p) => p.perk_type === "gifted_drink")).toBe(true);
    expect(S.getAttendee(r.state, EV, ME)!.total_spent).toBe(before + 8000);
  });
});

describe("squads y seguridad", () => {
  it("la regla 'Squad de 4' otorga 1 QR por integrante, una sola vez", () => {
    let s = createSeedState(NOW);
    s = unwrap(A.createSquad(s, EV, id(5), "Techno Crew", NOW)).state;
    const sq = S.squadOf(s, EV, id(5))!.squad;
    for (const u of [7, 8]) s = unwrap(A.joinSquad(s, id(u), sq.id, NOW)).state;
    expect(S.perksOf(s, id(5), EV).filter((p) => p.source === "perk_rule")).toHaveLength(0);
    const r = unwrap(A.joinSquad(s, id(13), sq.id, NOW)); // 4to miembro
    expect(r.data.grantedPerks).toHaveLength(4);
    const again = A.applySquadPerkRules(r.state, sq.id, NOW);
    expect(again.granted).toHaveLength(0);
  });

  it("no se puede sumar a alguien bloqueado por un miembro", () => {
    const s = createSeedState(NOW);
    expect(A.inviteToSquad(s, DEMO_IDS.squadMain, id(2), id(13), NOW).ok).toBe(false); // Gonza bloqueado por Sofi
  });

  it("botón de rescate: pin rojo para el squad + alerta en el chat", () => {
    const s0 = createSeedState(NOW);
    const r = unwrap(A.triggerRescue(s0, EV, ME, { x: 50, y: 30 }, NOW));
    const cami = id(2);
    const seen = S.visiblePins(r.state, EV, cami, NOW).find((p) => p.profile.id === ME);
    expect(seen?.pin.is_rescue_alert).toBe(true);
    expect(seen?.pin.sector_name).toBe("Pista Principal");
    expect(S.squadMessages(r.state, DEMO_IDS.squadMain).at(-1)?.message_type).toBe("system_alert");
  });
});

describe("plano: pin-drop de 15 min", () => {
  it("nunca comparte con matches no seleccionados y expira a los 15 min", () => {
    let s = createSeedState(NOW);
    s = unwrap(A.dropPin(s, EV, ME, { x: 20, y: 70, shareWithSquad: true, matchIds: [] }, NOW)).state;
    expect(S.visiblePins(s, EV, id(5), NOW).some((p) => p.profile.id === ME)).toBe(false); // Mateo (match) no lo ve
    expect(S.visiblePins(s, EV, id(2), NOW).some((p) => p.profile.id === ME)).toBe(true); // Cami (squad) sí
    expect(S.visiblePins(s, EV, id(2), NOW + 15 * 60_000 + 1).some((p) => p.profile.id === ME)).toBe(false);
  });

  it("no permite compartir con alguien que no es match", () => {
    const s = createSeedState(NOW);
    const r = unwrap(A.dropPin(s, EV, ME, { x: 20, y: 70, shareWithSquad: false, matchIds: [id(5), id(8)] }, NOW));
    expect(r.data.shared_match_ids).toEqual([id(5)]);
  });
});

describe("ingreso al evento", () => {
  it("un código único solo se usa una vez", () => {
    let s = createSeedState(NOW);
    s = unwrap(A.upsertProfile(s, "new-1", { username: "nuevo", full_name: "Nuevo", birth_date: "2000-01-01" }, NOW)).state;
    s = unwrap(A.upsertProfile(s, "new-2", { username: "nuevo2", full_name: "Nuevo 2", birth_date: "2000-01-01" }, NOW)).state;
    const code = s.event_invite_codes.find((c) => !c.is_used)!.code;
    s = unwrap(A.joinEvent(s, "new-1", code, "open_to_meet", NOW)).state;
    expect(A.joinEvent(s, "new-2", code, "open_to_meet", NOW).ok).toBe(false);
  });

  it("el lobby expirado bloquea grilla/plano pero conserva matches", () => {
    const s = createSeedState(NOW);
    const ev = S.getEvent(s, EV)!;
    const after = +new Date(ev.lobby_expires_at) + 1;
    expect(S.isLobbyInteractive(ev, after)).toBe(false);
    expect(A.dropPin(s, EV, ME, { x: 1, y: 1, shareWithSquad: true, matchIds: [] }, after).ok).toBe(false);
    expect(S.matchesOf(s, ME).length).toBeGreaterThan(0);
    expect(A.sendMessage(s, ME, { type: "direct", connectionId: id(6001) }, { content: "¿after?" }, after).ok).toBe(true);
  });
});

describe("B2B", () => {
  it("CRM etiqueta Top Spender y Squad Leader", () => {
    const rows = crmRows(createSeedState(NOW), EV);
    expect(rows[0].username).toBe("tomi.vip");
    expect(rows[0].tags).toContain("top_spender");
    expect(rows.find((r) => r.username === "sofi.noche")?.tags).toContain("squad_leader");
  });

  it("sorteo entre usuarios con pin activo entrega QR al ganador", () => {
    const s = createSeedState(NOW);
    const r = unwrap(A.drawRaffle(s, s.raffles[0].id, () => 0, NOW));
    expect(r.data.pool.length).toBeGreaterThan(0);
    expect(S.perksOf(r.state, r.data.raffle.winner_user_id!, EV).some((p) => p.perk_type === "raffle_prize")).toBe(true);
  });

  it("vaquita de squad reparte el gasto entre miembros", () => {
    const s = createSeedState(NOW);
    const before = S.getAttendee(s, EV, id(2))!.total_spent;
    const r = unwrap(A.createBarOrder(s, EV, ME, [{ itemId: "champagne", qty: 1 }], "squad_split", NOW));
    expect(r.data.split_user_ids).toHaveLength(4);
    expect(S.getAttendee(r.state, EV, id(2))!.total_spent).toBe(before + 15000);
  });
});

describe("afinidad", () => {
  it("Dice sobre géneros", () => {
    const s = createSeedState(NOW);
    const me = S.getProfile(s, ME)!;
    const mateo = S.getProfile(s, id(5))!;
    expect(Math.round(musicAffinity(me, mateo) * 100)).toBe(67);
  });
});

describe("Instagram en el perfil", () => {
  it("parsea el @ desde cualquier formato y rechaza inválidos", () => {
    expect(parseInstagram("@Sofi.Noche")).toBe("sofi.noche");
    expect(parseInstagram("https://www.instagram.com/sofi.noche/?hl=es")).toBe("sofi.noche");
    expect(parseInstagram("instagram.com/sofi_noche")).toBe("sofi_noche");
    for (const bad of ["", ".sofi", "sofi.", "so..fi", "sofi noche", "a".repeat(31), "https://instagram.com/p/abc"]) expect(parseInstagram(bad), bad).toBeNull();
  });
  it("verificado solo si coincide con la cuenta conectada; escrito a mano queda sin verificar", () => {
    const s0 = createSeedState(Date.now());
    const me = DEMO_IDS.me;
    expect(s0.profiles.find((p) => p.id === me)?.instagram_verified).toBe(true);
    const manual = upsertProfile(s0, me, { instagram_username: "@otra.cuenta" });
    expect(manual.ok && manual.data).toMatchObject({ instagram_username: "otra.cuenta", instagram_verified: false });
    const back = upsertProfile(s0, me, { instagram_username: s0.instagram_links.find((l) => l.user_id === me)!.username });
    expect(back.ok && back.data.instagram_verified).toBe(true);
    expect(upsertProfile(s0, me, { instagram_username: "no válido!" })).toMatchObject({ ok: false });
  });
  it("conectar y desconectar; una cuenta de IG no se comparte entre perfiles", () => {
    const s0 = createSeedState(Date.now());
    const nuevo = "nuevo-user";
    const linked = linkInstagram(s0, nuevo, "@noche.123");
    expect(linked.ok).toBe(true);
    // Login con Instagram antes del onboarding: el perfil nace con ese @ verificado
    const created = upsertProfile((linked as { state: typeof s0 }).state, nuevo, { username: "noche123", full_name: "Noche", birth_date: "1999-01-01" });
    expect(created.ok && created.data).toMatchObject({ instagram_username: "noche.123", instagram_verified: true });
    const taken = linkInstagram(s0, DEMO_IDS.me, s0.instagram_links.find((l) => l.user_id !== DEMO_IDS.me)!.username);
    expect(taken).toMatchObject({ ok: false, error: "Esa cuenta de Instagram ya está conectada a otro perfil." });
    const un = unlinkInstagram(s0, DEMO_IDS.me);
    expect(un.ok && un.state.profiles.find((p) => p.id === DEMO_IDS.me)).toMatchObject({ instagram_username: null, instagram_verified: false });
    expect(un.ok && un.state.instagram_links.some((l) => l.user_id === DEMO_IDS.me)).toBe(false);
  });
});
