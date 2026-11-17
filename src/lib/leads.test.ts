import { describe, expect, it } from "vitest";
import { isFreeMail, leadNotification, recommendPlan, validateLead } from "./leads";

const base = { name: "Ana Pérez", company: "Cámara Pyme Sur", email: "Ana@CamaraSur.org", whatsapp: "11 2345-6789", event_type: "congress", attendees: "450", message: "Expo de marzo" };

describe("leads B2B (/empresas)", () => {
  it("valida y normaliza (email en minúsculas, WhatsApp E.164, asistentes numéricos)", () => {
    const r = validateLead(base);
    expect(r).toMatchObject({ ok: true, lead: { email: "ana@camarasur.org", whatsapp: "+5491123456789", attendees: 450, event_type: "congress", source: "empresas" } });
  });
  it("rechaza datos inválidos con un mensaje por campo", () => {
    const r = validateLead({ ...base, name: "A", email: "no-es-mail", event_type: "boda", attendees: 3, whatsapp: "123" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["attendees", "email", "event_type", "name", "whatsapp"]);
  });
  it("el honeypot marca spam sin revelar por qué", () => {
    expect(validateLead({ ...base, website: "http://spam" })).toEqual({ ok: false, errors: {}, spam: true });
  });
  it("arma el aviso para el equipo comercial y marca mails personales", () => {
    const r = validateLead({ ...base, email: "ana@gmail.com" });
    if (!r.ok) throw new Error("inválido");
    expect(isFreeMail(r.lead.email)).toBe(true);
    const text = leadNotification(r.lead);
    expect(text).toContain("Cámara Pyme Sur");
    expect(text).toContain("(mail personal)");
    expect(text).toContain("wa.me/5491123456789");
  });
  it("sugiere el plan según tamaño y frecuencia", () => {
    expect(recommendPlan(150, 1)).toBe("starter");
    expect(recommendPlan(800, 1)).toBe("pro");
    expect(recommendPlan(200, 3)).toBe("pro");
    expect(recommendPlan(5000, 1)).toBe("enterprise");
  });
});
