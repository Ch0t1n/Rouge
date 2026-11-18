/**
 * ROUGE Pro · Fase 1 (v1.10): ficha ejecutiva (contacto según privacy_level), categorías (tier), zonas de control
 * multi-zona y tarjeta vCard. Mismas reglas que persona_contact_visible / zone_check_in / set_attendee_tier en SQL.
 */
import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import * as D from "./door";
import { credentialSecret, dynamicQrValue } from "./qr";
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

/** Pase EN VIVO (QR dinámico TOTP), como lo muestra la app: el pase fijo `ROUGE:PASS:` se rechaza como captura. */
const live = (s: RougeState, eventId: string, userId: string) => dynamicQrValue(credentialSecret(s.events.find((e) => e.id === eventId)!.qr_secret!, "PASS", userId), "PASS", userId, NOW);

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
    const denied = D.zoneCheckIn(s, PRO, ZONE.vip, live(s, PRO, ME), NOW);
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.data).toMatchObject({ status: "zone_denied", tier: "attendee", zone_name: "Sala VIP", allowed_tiers: ["vip", "speaker", "sponsor"], name: "Sofía Benítez", company: "Estudio Benítez", age: null, username: null });
    expect(denied.state.zone_check_ins[0]).toMatchObject({ zone_id: ZONE.vip, user_id: ME, staff_id: DEMO_IDS.security, status: "denied", reason: "zone_denied" });
    expect(D.requiredTiersLabel(denied.data.allowed_tiers ?? [])).toBe("Requiere VIP / SPEAKER / SPONSOR");

    const ok = D.zoneCheckIn(s, PRO, ZONE.vip, live(s, PRO, id(10)), NOW);
    expect(ok.ok && ok.data).toMatchObject({ status: "ok", tier: "vip", company: "Aguirre Capital" });
    // Un área no toca la acreditación.
    const before = s.event_attendees.find((a) => a.event_id === PRO && a.user_id === id(10))!.checked_in_at;
    expect(ok.ok && ok.state.event_attendees.find((a) => a.event_id === PRO && a.user_id === id(10))!.checked_in_at).toBe(before);
  });

  it("una puerta acredita; 'ya entró' en la segunda lectura; la vCard no es un pase; cada lectura queda registrada", () => {
    const base = asUser(seed(), DEMO_IDS.security);
    const s = { ...base, event_attendees: base.event_attendees.map((a) => (a.event_id === PRO && a.user_id === id(22) ? { ...a, checked_in_at: null } : a)) };
    const first = D.zoneCheckIn(s, PRO, ZONE.entrance, live(s, PRO, id(22)), NOW);
    expect(first.ok && first.data.status).toBe("ok");
    if (!first.ok) return;
    const again = D.zoneCheckIn(first.state, PRO, ZONE.entrance, live(s, PRO, id(22)), NOW);
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

  it("noche: la puerta principal sigue mostrando @ y edad para el control +18", () => {
    const s = asUser(seed(), DEMO_IDS.security);
    const r = D.zoneCheckIn(s, NIGHT, null, live(s, NIGHT, id(8)), NOW);
    expect(r.ok && r.data).toMatchObject({ status: "ok", zone_name: "Puerta principal", username: expect.any(String) });
    expect(r.ok && r.data.age).toBeGreaterThanOrEqual(18);
  });

  it("el pase fijo (captura) no sirve en ninguna zona y se registra como rechazado", () => {
    const s = asUser(seed(), DEMO_IDS.security);
    const r = D.zoneCheckIn(s, PRO, ZONE.vip, D.passValue(PRO, id(10)), NOW);
    expect(r.ok && r.data).toMatchObject({ status: "static_qr", zone_name: "Sala VIP" });
    expect(r.ok && r.state.zone_check_ins[0]).toMatchObject({ status: "denied", reason: "static_qr" });
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
