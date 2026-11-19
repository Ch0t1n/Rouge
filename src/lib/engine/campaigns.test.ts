import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import { birthdayThisWeek, campaignOutbox, contactsOf, createCampaign, markContacted, renderTemplate, segmentAudience } from "./campaigns";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const asOwner = () => ({ ...createSeedState(NOW), current_user_id: DEMO_IDS.organizer });

describe("campañas por WhatsApp", () => {
  it("segmenta cumpleañeros, VIP, inactivos e invitados por RRPP (solo con teléfono)", () => {
    const contacts = contactsOf(asOwner(), EV);
    expect(segmentAudience(contacts, "birthdays_week", NOW).map((c) => c.full_name)).toContain("Melina Duarte");
    const vip = segmentAudience(contacts, "vip_spenders", NOW);
    expect(vip.length).toBeGreaterThan(0);
    expect(vip.every((c) => c.total_spent >= 50_000)).toBe(true);
    const inactive = segmentAudience(contacts, "inactive_30d", NOW).map((c) => c.full_name);
    expect(inactive).toEqual(expect.arrayContaining(["Florencia Vidal", "Ezequiel Romero", "Micaela Suárez", "Lautaro Méndez"]));
    expect(segmentAudience(contacts, "rrpp_guests", NOW, DEMO_IDS.promoter).every((c) => c.referred_by === DEMO_IDS.promoter)).toBe(true);
    expect(segmentAudience([{ ...contacts[0], phone: null }], "all", NOW)).toEqual([]);
  });

  it("detecta cumpleaños de la semana aunque cruce el año", () => {
    expect(birthdayThisWeek("1999-01-02", Date.parse("2026-12-29T12:00:00Z"))).toBe(true);
    expect(birthdayThisWeek("1999-01-20", Date.parse("2026-12-29T12:00:00Z"))).toBe(false);
  });

  it("arma mensajes personalizados con links wa.me y marca contactados", () => {
    expect(renderTemplate("Hola {nombre}, {evento} {beneficio} {link_qr}", { nombre: "Sofía Benítez", evento: "Bresh", beneficio: "2x1", link_qr: "https://x/j" })).toBe("Hola Sofía, Bresh 2x1 https://x/j");
    let s = asOwner();
    const c = createCampaign(s, EV, { name: "Cumples", segment: "birthdays_week", template: "¡Hola {nombre}! {beneficio} en {evento}: {link_qr}", benefit: "un trago de cumple" }, NOW);
    if (!c.ok) throw new Error(c.error);
    s = c.state;
    const box = campaignOutbox(s, c.data, "Bresh", () => "https://rouge.app/join/BRESH26", NOW);
    expect(box[0].href).toMatch(/^https:\/\/wa\.me\/549\d+\?text=/);
    expect(decodeURIComponent(box[0].href.split("text=")[1])).toContain("un trago de cumple");
    const m = markContacted(s, c.data.id, box[0].contact.user_id, true, NOW);
    if (!m.ok) throw new Error(m.error);
    expect(campaignOutbox(m.state, c.data, "Bresh", () => "x", NOW)[0].contacted_at).toBeTruthy();
  });

  it("solo dueño/a o producción; la plantilla exige {nombre}", () => {
    const s = createSeedState(NOW);
    expect(createCampaign({ ...s, current_user_id: DEMO_IDS.bartender }, EV, { name: "x", segment: "all", template: "Hola {nombre}", benefit: "" }).ok).toBe(false);
    expect(createCampaign(asOwner(), EV, { name: "x", segment: "all", template: "Hola che", benefit: "" }).ok).toBe(false);
  });
});
