/**
 * ROUGE Pro · Fase 1 (v1.10): ficha ejecutiva (contacto según privacy_level), categorías (tier), zonas de control
 * multi-zona y tarjeta vCard. Mismas reglas que persona_contact_visible / zone_check_in / set_attendee_tier en SQL.
 */
import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import * as D from "./door";
import { parseContactEmail, parseWebsite, personaContactVisible, sanitizePersonaFor } from "./verticals";
import { buildVCard, escapeVCard, foldLine, personaVCard, vcardFileName } from "@/lib/vcard";

const NOW = Date.now();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = DEMO_IDS.me;
const PRO = DEMO_IDS.proEvent;
const NIGHT = DEMO_IDS.event;
const seed = () => createSeedState(NOW);
const asUser = (s: RougeState, u: string) => ({ ...s, current_user_id: u });
const persona = (s: RougeState, userN: number) => s.profile_personas.find((p) => p.user_id === id(userN) && p.kind === "corporate")!;
const ZONE = { entrance: id(20001), auditorio: id(20002), vip: id(20003) };

describe("ficha ejecutiva", () => {
  it("valida y normaliza sitio, email, teléfono, detalle y nivel de privacidad; bio profesional hasta 240", () => {
    const s = seed();
    const r = A.upsertPersona(s, ME, {
      id: DEMO_IDS.mePro,
      kind: "corporate",
      bio: "x".repeat(240),
      website_url: "EstudioBenitez.com.ar/portfolio/",
      contact_email: "  Sofia@Estudio.COM ",
      contact_phone: "11 4000-1001",
      looking_for_note: "  Pymes   que vendan online ",
      privacy_level: "network",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ website_url: "https://estudiobenitez.com.ar/portfolio", contact_email: "sofia@estudio.com", contact_phone: "+5491140001001", looking_for_note: "Pymes que vendan online", privacy_level: "network" });
    expect(A.upsertPersona(s, ME, { id: DEMO_IDS.mePro, kind: "corporate", bio: "x".repeat(241) })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { id: DEMO_IDS.mePro, kind: "corporate", contact_email: "no-es-mail" })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { id: DEMO_IDS.mePro, kind: "corporate", website_url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { id: DEMO_IDS.mePro, kind: "corporate", offering_note: "y".repeat(121) })).toMatchObject({ ok: false });
    // La noche sigue en 160.
    expect(A.upsertPersona(s, ME, { kind: "nightlife", music_genres: ["House"], bio: "x".repeat(161) })).toMatchObject({ ok: false });
    expect(parseWebsite("http://a.io")).toBe("https://a.io");
    expect(parseWebsite("a b.com")).toBeNull();
    expect(parseContactEmail("a@b")).toBeNull();
  });

  it("strict: el contacto solo tras una reunión o un contacto aceptado entre los dos", () => {
    const s = seed();
    const sofi = persona(s, 1); // strict
    expect(personaContactVisible(s, id(21), sofi)).toBe(true); // Carla: reunión aceptada y contacto aceptado
    expect(personaContactVisible(s, id(22), sofi)).toBe(false); // Ezequiel: reunión pendiente
    expect(sanitizePersonaFor(s, sofi, id(22))).toMatchObject({ contact_email: null, contact_phone: null, website_url: sofi.website_url });
    expect(personaContactVisible(s, DEMO_IDS.organizer, sofi)).toBe(false); // ni la organización
  });

  it("network: lo ven los asistentes del evento, no la organización; public: también la organización", () => {
    const s = seed();
    const carla = persona(s, 21); // network
    expect(sanitizePersonaFor(s, carla, id(22)).contact_email).toBe("carla@textilnorte.com.ar");
    expect(sanitizePersonaFor(s, carla, DEMO_IDS.organizer).contact_email).toBeNull();
    expect(sanitizePersonaFor(s, carla, DEMO_IDS.organizer).company).toBe("Textil Norte"); // el CRM sí ve la ficha
    expect(personaContactVisible(s, id(2), carla)).toBe(false); // Cami: solo va a la fiesta
    const mateo = persona(s, 5); // public
    expect(sanitizePersonaFor(s, mateo, DEMO_IDS.organizer).contact_email).toBe("mateo@logix.com.ar");
    expect(sanitizePersonaFor(s, mateo, DEMO_IDS.security).contact_email).toBe("mateo@logix.com.ar");
  });

  it("un bloqueo cierra el contacto aunque el nivel sea público", () => {
    const s = seed();
    const blocked = A.blockUser(s, id(5), id(22));
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(personaContactVisible(blocked.state, id(22), persona(blocked.state, 5))).toBe(false);
  });
});

describe("categorías (tier)", () => {
  it("el código de 1 uso da su categoría al entrar y la organización la puede cambiar", () => {
    const s = seed();
    const vipCode = s.event_invite_codes.find((c) => c.event_id === NIGHT && c.tier === "vip" && !c.is_used)!;
    const r = A.joinEvent(s, id(21), vipCode.code, "with_friends", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.event_attendees.find((a) => a.event_id === NIGHT && a.user_id === id(21))?.tier).toBe("vip");
    const t = A.setAttendeeTier(r.state, PRO, ME, "speaker");
    expect(t.ok && t.data.tier).toBe("speaker");
    expect(A.setAttendeeTier(s, PRO, id(2), "vip")).toMatchObject({ ok: false }); // no está en el evento
    const codes = A.generateInviteCodes(s, PRO, 3, NOW, "press");
    expect(codes.ok && codes.data.every((c) => c.tier === "press")).toBe(true);
  });
});

describe("zonas de control (multi-zona)", () => {
  it("sin zonas: una sola opción, la Puerta principal (la noche no cambia); con puerta cargada no se duplica", () => {
    const s = seed();
    expect(D.scannerZones(s, NIGHT)).toEqual([D.MAIN_DOOR]);
    const pro = D.scannerZones(s, PRO);
    expect(pro.map((z) => z.name)).toEqual(["Acreditación", "Auditorio A", "Sala VIP", "Almuerzo Ejecutivo", "Sala de prensa"]);
    expect(D.zonesForTier(s, PRO, "vip").map((z) => z.name)).toEqual(["Auditorio A", "Sala VIP", "Almuerzo Ejecutivo"]);
  });

  it("un área valida la categoría: rechaza a una asistente, deja pasar a VIP con nombre, empresa y categoría", () => {
    const s = asUser(seed(), DEMO_IDS.security);
    const denied = D.zoneCheckIn(s, PRO, ZONE.vip, D.demoPassToken(PRO, ME, NOW), NOW);
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.data).toMatchObject({ status: "zone_denied", tier: "attendee", zone_name: "Sala VIP", allowed_tiers: ["vip", "speaker", "sponsor"], name: "Sofía Benítez", company: "Estudio Benítez", age: null, username: null });
    expect(denied.state.zone_check_ins[0]).toMatchObject({ zone_id: ZONE.vip, user_id: ME, staff_id: DEMO_IDS.security, status: "denied", reason: "zone_denied" });
    expect(D.requiredTiersLabel(denied.data.allowed_tiers ?? [])).toBe("Requiere VIP / SPEAKER / SPONSOR");

    const ok = D.zoneCheckIn(s, PRO, ZONE.vip, D.demoPassToken(PRO, id(10), NOW), NOW);
    expect(ok.ok && ok.data).toMatchObject({ status: "ok", tier: "vip", company: "Aguirre Capital" });
    // Un área no toca la acreditación.
    const before = s.event_attendees.find((a) => a.event_id === PRO && a.user_id === id(10))!.checked_in_at;
    expect(ok.ok && ok.state.event_attendees.find((a) => a.event_id === PRO && a.user_id === id(10))!.checked_in_at).toBe(before);
  });

  it("una puerta acredita; 'ya entró' en la segunda lectura; la vCard no es un pase; cada lectura queda registrada", () => {
    const base = asUser(seed(), DEMO_IDS.security);
    const s = { ...base, event_attendees: base.event_attendees.map((a) => (a.event_id === PRO && a.user_id === id(22) ? { ...a, checked_in_at: null } : a)) };
    const first = D.zoneCheckIn(s, PRO, ZONE.entrance, D.demoPassToken(PRO, id(22), NOW), NOW);
    expect(first.ok && first.data.status).toBe("ok");
    if (!first.ok) return;
    const again = D.zoneCheckIn(first.state, PRO, ZONE.entrance, D.demoPassToken(PRO, id(22), NOW), NOW);
    expect(again.ok && again.data.status).toBe("already");
    if (!again.ok) return;
    const card = D.zoneCheckIn(again.state, PRO, ZONE.auditorio, buildVCard({ fullName: "X" }), NOW);
    expect(card.ok && card.data).toMatchObject({ status: "invalid", kind: "vcard" });
    if (!card.ok) return;
    const logs = D.recentZoneCheckIns(card.state, PRO).slice(0, 3);
    expect(logs.map((l) => l.status)).toEqual(expect.arrayContaining(["granted", "denied", "denied"]));
    expect(card.state.zone_check_ins.length).toBe(s.zone_check_ins.length + 3);
    expect(D.zoneCheckIn(s, PRO, id(20999), "x", NOW)).toMatchObject({ ok: false });
  });

  it("QR rotativo: vence a los ~90 s, no acepta firmas falsas ni el pase fijo; en la noche el pase fijo sigue igual", () => {
    const s = asUser(seed(), DEMO_IDS.security);
    const token = D.demoPassToken(PRO, id(10), NOW);
    expect(D.zoneCheckIn(s, PRO, ZONE.vip, token, NOW + 50_000)).toMatchObject({ ok: true, data: { status: "ok" } }); // dentro del margen
    expect(D.zoneCheckIn(s, PRO, ZONE.vip, token, NOW + 120_000)).toMatchObject({ ok: true, data: { status: "expired_pass", name: null } }); // captura vieja
    const forged = token.replace(/:[0-9a-f]{16}$/, ":0123456789abcdef");
    expect(D.zoneCheckIn(s, PRO, ZONE.vip, forged, NOW)).toMatchObject({ ok: true, data: { status: "expired_pass" } });
    const otherUser = token.replace(id(10), id(1)); // firma de otra persona
    expect(D.zoneCheckIn(s, PRO, ZONE.vip, otherUser, NOW)).toMatchObject({ ok: true, data: { status: "expired_pass" } });
    expect(D.zoneCheckIn(s, PRO, ZONE.vip, D.passValue(PRO, id(10)), NOW)).toMatchObject({ ok: true, data: { status: "expired_pass" } }); // pase fijo
    expect(D.zoneCheckIn(s, PRO, ZONE.vip, token.toUpperCase(), NOW)).toMatchObject({ ok: true, data: { status: "ok" } }); // tipeado en mayúsculas
    expect(D.parseDoorValue(token)).toMatchObject({ kind: "pass", userId: id(10), window: D.passWindow(NOW) });
    expect(D.passSecondsLeft(NOW)).toBeGreaterThan(0);
    expect(D.passSecondsLeft(NOW)).toBeLessThanOrEqual(D.PASS_WINDOW_SECONDS);
    // La noche no usa QR rotativo: el pase fijo sirve como siempre (y uno rotativo vigente también).
    expect(D.doorCheckIn(s, NIGHT, D.demoPassToken(NIGHT, id(8), NOW), NOW).data.status).toBe("ok");
  });

  it("noche: la puerta principal sigue mostrando @ y edad para el control +18", () => {
    const s = asUser(seed(), DEMO_IDS.security);
    const r = D.doorCheckIn(s, NIGHT, D.passValue(NIGHT, id(8)), NOW);
    expect(r.data).toMatchObject({ status: "ok", zone_name: "Puerta principal", username: expect.any(String) });
    expect(r.data.age).toBeGreaterThanOrEqual(18);
  });

  it("alta, validación y baja de zonas", () => {
    const s = seed();
    expect(D.upsertZone(s, PRO, { name: "sala vip", kind: "area", allowed_tiers: ["vip"] })).toMatchObject({ ok: false }); // nombre repetido
    expect(D.upsertZone(s, PRO, { name: "X", kind: "area", allowed_tiers: [] })).toMatchObject({ ok: false });
    expect(D.upsertZone(s, PRO, { name: "Backstage", kind: "area", allowed_tiers: ["nope" as never] })).toMatchObject({ ok: false });
    const r = D.upsertZone(s, PRO, { name: "  Backstage  ", kind: "area", allowed_tiers: ["speaker", "speaker"] });
    expect(r.ok && r.data).toMatchObject({ name: "Backstage", allowed_tiers: ["speaker"], is_active: true });
    const del = D.deleteZone(s, ZONE.vip);
    expect(del.ok && del.state.zone_check_ins.filter((c) => c.zone_id === ZONE.vip)).toEqual([]);
  });
});

describe("vCard 3.0", () => {
  it("arma una tarjeta válida con nota de networking, escapa y pliega líneas", () => {
    const v = buildVCard({ fullName: "Valeria Ortiz", jobTitle: "Directora; Innovación", company: "Grupo Meridia, S.A.", email: "v@meridia.com", phone: "+5491140001001", linkedinUrl: "https://www.linkedin.com/in/valeria", websiteUrl: "https://meridia.com", eventName: "Cumbre 2026" });
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Ortiz;Valeria;;;\r\nFN:Valeria Ortiz\r\n")).toBe(true);
    expect(v).toContain("ORG:Grupo Meridia\\, S.A.\r\n");
    expect(v).toContain("TITLE:Directora\\; Innovación\r\n");
    expect(v).toContain("EMAIL;TYPE=INTERNET,WORK:v@meridia.com\r\n");
    expect(v).toContain("TEL;TYPE=CELL,VOICE:+5491140001001\r\n");
    expect(v).toContain("NOTE:NETWORKING: Conocido en Cumbre 2026\r\n");
    expect(v.endsWith("END:VCARD\r\n")).toBe(true);
    expect(escapeVCard("a\\b\nc")).toBe("a\\\\b\\nc");
    const long = foldLine(`NOTE:${"á".repeat(80)}`);
    expect(long.split("\r\n ").every((part) => new TextEncoder().encode(part).length <= 75)).toBe(true);
    expect(long.replace(/\r\n /g, "")).toBe(`NOTE:${"á".repeat(80)}`);
    expect(vcardFileName("Sofía Benítez")).toBe("sofia-benitez.vcf");
  });

  it("solo incluye email y teléfono si quien mira los puede ver (ficha saneada)", () => {
    const s = seed();
    const sofi = persona(s, 1);
    const forEzequiel = personaVCard(sanitizePersonaFor(s, sofi, id(22)), "Encuentro Pyme Conecta");
    expect(forEzequiel).not.toContain("EMAIL");
    expect(forEzequiel).not.toContain("TEL");
    const forCarla = personaVCard(sanitizePersonaFor(s, sofi, id(21)), "Encuentro Pyme Conecta");
    expect(forCarla).toContain("EMAIL;TYPE=INTERNET,WORK:sofia@estudiobenitez.com.ar");
    // La propia tarjeta: la persona elige qué incluir.
    expect(personaVCard(sofi, "X", { phone: false })).not.toContain("TEL");
  });
});

describe("corporativo: sin Rescate y equipos armados por la organización", () => {
  it("Rescate, 'Ya estoy bien' y 'Llegué a casa' no existen en corporativo; en la noche siguen igual", () => {
    const s = seed();
    expect(A.triggerRescue(s, PRO, ME)).toMatchObject({ ok: false });
    expect(A.markHomeSafe(s, PRO, ME)).toMatchObject({ ok: false });
    expect(A.resolveRescue(s, PRO, ME)).toMatchObject({ ok: false });
    expect(A.triggerRescue(s, NIGHT, ME).ok).toBe(true);
  });

  it("los asistentes no crean equipos ni invitan; la organización crea, suma, mueve, quita y borra", () => {
    const s = asUser(seed(), DEMO_IDS.organizer);
    expect(A.createSquad(asUser(s, id(25)), PRO, id(25), "Mi equipo")).toMatchObject({ ok: false });
    expect(A.inviteToSquad(s, DEMO_IDS.proTeam, ME, id(25))).toMatchObject({ ok: false });
    expect(A.organizerCreateTeam(s, PRO, "Mesa 12 · Ronda de negocios")).toMatchObject({ ok: false }); // nombre repetido
    const created = A.organizerCreateTeam(s, PRO, "  Logística  ");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const team = created.data;
    expect(team).toMatchObject({ name: "Logística", created_by: DEMO_IDS.organizer });
    // Héctor (sin equipo) se suma; Sofía se MUEVE desde la Mesa 12.
    const add = A.organizerSetTeamMember(created.state, team.id, id(25), true);
    expect(add.ok && add.data.moved).toBe(false);
    if (!add.ok) return;
    const move = A.organizerSetTeamMember(add.state, team.id, ME, true);
    expect(move.ok && move.data.moved).toBe(true);
    if (!move.ok) return;
    const inTeam = (st: RougeState, sq: string) => st.squad_members.filter((m) => m.squad_id === sq && m.status === "joined").map((m) => m.user_id);
    expect(inTeam(move.state, team.id).sort()).toEqual([ME, id(25)].sort());
    expect(inTeam(move.state, DEMO_IDS.proTeam)).not.toContain(ME);
    expect(A.organizerSetTeamMember(move.state, team.id, id(2), true)).toMatchObject({ ok: false }); // no está en el evento
    const out = A.organizerSetTeamMember(move.state, team.id, id(25), false);
    expect(out.ok && inTeam(out.state, team.id)).toEqual([ME]);
    if (!out.ok) return;
    const del = A.organizerDeleteTeam(out.state, team.id);
    expect(del.ok && del.state.squads.some((x) => x.id === team.id)).toBe(false);
    // Unirse con el link del equipo sigue funcionando para el asistente.
    expect(A.joinSquad(asUser(s, id(25)), id(25), DEMO_IDS.proTeam).ok).toBe(true);
  });
});
