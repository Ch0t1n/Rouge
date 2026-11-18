import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import { checkTiers, ensurePromoterLink, promoterBarSpend, promoterStats, setPromoterCommission, setPromoterScheme, settlePromoter } from "./promoters";
import { doorCheckIn, doorCounts, parseDoorValue, passValue } from "./door";
import { credentialSecret, dynamicQrValue } from "./qr";
import { removeAttendee } from "./eventAdmin";
import { can, roleHome } from "./roles";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ORG = DEMO_IDS.organizer;
const RP = DEMO_IDS.promoter;
const ok = <T,>(r: { ok: true; state: RougeState; data: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("RRPP", () => {
  it("rol con permisos mínimos: su panel y nada más", () => {
    const s = createSeedState(NOW);
    expect(can(s, EV, RP, "admin.rrpp")).toBe(true);
    for (const p of ["admin.crm", "admin.overview", "admin.bar", "door.scan", "admin.events"] as const) expect(can(s, EV, RP, p)).toBe(false);
    expect(roleHome("promoter")).toBe("/admin/rrpp");
  });

  it("el link atribuye a quien entra por él (primer contacto) y entra como el link maestro", () => {
    let s = createSeedState(NOW);
    s = ok(A.upsertProfile(s, "nuevo", { username: "nuevo.user", full_name: "Nuevo Usuario", birth_date: "2000-01-01" }, NOW)).state;
    const r = ok(A.joinEvent(s, "nuevo", "rpvicky7", "open_to_meet", NOW));
    expect(r.data.eventId).toBe(EV);
    const att = r.state.event_attendees.find((a) => a.user_id === "nuevo")!;
    expect(att).toMatchObject({ referred_by: RP, joined_via: "master_link" });
    // Quien ya estaba en el evento no cambia de RRPP
    const again = ok(A.joinEvent(s, DEMO_IDS.me, "RPVICKY7", "just_dance", NOW));
    expect(again.state.event_attendees.find((a) => a.user_id === DEMO_IDS.me)?.referred_by).toBeNull();
  });

  it("números: el RRPP ve solo los suyos; con escáner se liquida por ingreso en puerta", () => {
    const s = createSeedState(NOW);
    const mine = promoterStats(s, EV, RP);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ entries: 4, checked_in: 3, billable: 3, to_pay: 4500 });
    expect(promoterStats(s, EV, DEMO_IDS.me)).toHaveLength(0); // un asistente no ve nada
    expect(promoterStats(s, EV, ORG)).toHaveLength(1);
  });

  it("links y comisión: el RRPP pide el suyo; solo dueño/a o producción fija la comisión", () => {
    const s = createSeedState(NOW);
    expect(ok(ensurePromoterLink(s, EV, RP, RP, NOW)).data.code).toBe("RPVICKY7"); // ya existía
    expect(ensurePromoterLink(s, EV, id(2), ORG, NOW).ok).toBe(false); // no es RRPP
    const team = { ...s, event_staff: [...s.event_staff, { event_id: EV, user_id: id(3), role: "promoter" as const, created_at: "" }] };
    expect(ensurePromoterLink(team, EV, id(3), RP, NOW).ok).toBe(false); // un RRPP no genera el de otro
    const created = ok(ensurePromoterLink(team, EV, id(3), ORG, NOW));
    expect(created.data.code).toMatch(/^RP[A-Z0-9]{6}$/);
    expect(setPromoterCommission(s, s.promoter_links[0].id, 2000, RP).ok).toBe(false);
    expect(ok(setPromoterCommission(s, s.promoter_links[0].id, 2000, ORG)).data.commission_per_entry).toBe(2000);
    expect(setPromoterCommission(s, s.promoter_links[0].id, -1, ORG).ok).toBe(false);
  });
});

describe("puerta", () => {
  it("lee QR de URL, código tipeado y pase de la app", () => {
    expect(parseDoorValue("https://rouge.app/join/RG7337QB")).toEqual({ kind: "code", code: "RG7337QB" });
    expect(parseDoorValue(" rg7337qb ")).toEqual({ kind: "code", code: "RG7337QB" });
    expect(parseDoorValue(passValue(EV, id(2)))).toEqual({ kind: "pass", eventId: EV, userId: id(2) });
    expect(parseDoorValue("")).toBeNull();
  });

  it("entrada de 1 uso: primera vez adelante, segunda 'ya entró'; anulada y link general se rechazan", () => {
    const s = createSeedState(NOW);
    const code = s.event_invite_codes.find((c) => !c.checked_in_at && c.used_by_user_id)!;
    const first = doorCheckIn(s, EV, `https://x.app/join/${code.code}`, NOW);
    expect(first.data).toMatchObject({ status: "ok", kind: "code", user_id: code.used_by_user_id });
    expect(first.data.age).toBeGreaterThanOrEqual(18);
    expect(doorCheckIn(first.state, EV, code.code, NOW).data.status).toBe("already");
    const revoked = { ...s, event_invite_codes: s.event_invite_codes.map((c) => (c.id === code.id ? { ...c, revoked_at: new Date(NOW).toISOString() } : c)) };
    expect(doorCheckIn(revoked, EV, code.code, NOW).data.status).toBe("revoked");
    expect(doorCheckIn(s, EV, "BRESH26", NOW).data.status).toBe("general_link");
    expect(doorCheckIn(s, EV, "RPVICKY7", NOW).data.status).toBe("general_link");
    expect(doorCheckIn(s, EV, "NOEXISTE1", NOW).data.status).toBe("invalid");
  });

  it("pase de la app: registra el ingreso; otro evento, no asistente o expulsado se rechazan", () => {
    const s = createSeedState(NOW);
    const joaco = id(8); // todavía no pasó por la puerta
    // El pase fijo ya no sirve (captura): ahora es un QR dinámico TOTP.
    expect(doorCheckIn(s, EV, passValue(EV, joaco), NOW).data.status).toBe("static_qr");
    const live = (u: string) => dynamicQrValue(credentialSecret(s.events[0].qr_secret!, "PASS", u), "PASS", u, NOW);
    const r = doorCheckIn(s, EV, live(joaco), NOW);
    expect(r.data).toMatchObject({ status: "ok", kind: "pass", name: expect.any(String) });
    expect(r.state.event_attendees.find((a) => a.user_id === joaco)?.checked_in_at).toBeTruthy();
    expect(doorCounts(r.state, EV).inside).toBe(doorCounts(s, EV).inside + 1);
    expect(doorCheckIn(s, EV, passValue("otro-evento", joaco), NOW).data.status).toBe("static_qr");
    expect(doorCheckIn(s, EV, live(DEMO_IDS.bartender), NOW).data.status).toBe("not_attendee");
    const out = ok(removeAttendee(s, EV, joaco, true, ORG, null, NOW));
    expect(doorCheckIn(out.state, EV, live(joaco), NOW).data.status).toBe("banned");
  });
});

describe("liquidación escalonada de RRPP", () => {
  it("tramos marginales: 1–30 al 15 %, desde la 31 al 20 %, más % de barra y fijo", () => {
    const link = { commission_per_entry: 100, ticket_price: 10000, commission_tiers: [{ from: 31, percent: 20 }, { from: 1, percent: 15 }], bar_commission_percent: 5 };
    const r = settlePromoter(link, 40, 200000);
    expect(r.tiers).toEqual([
      { from: 1, to: 30, percent: 15, entries: 30, amount: 45000 },
      { from: 31, to: null, percent: 20, entries: 10, amount: 20000 },
    ]);
    expect(r.tickets).toBe(65000);
    expect(r.fixed).toBe(4000);
    expect(r.bar).toBe(10000);
    expect(r.total).toBe(79000);
    // Si no llega al segundo tramo, ese tramo queda en 0
    expect(settlePromoter(link, 12, 0).tiers[1].entries).toBe(0);
    expect(settlePromoter(null, 10, 1000).total).toBe(0);
  });

  it("valida los tramos y solo dueño/a o producción configuran el esquema", () => {
    expect(checkTiers([{ from: 2, percent: 10 }])).toMatch(/entrada 1/);
    expect(checkTiers([{ from: 1, percent: 120 }])).toMatch(/0 a 100/);
    expect(checkTiers([{ from: 1, percent: 10 }, { from: 1, percent: 20 }])).toMatch(/misma entrada/);
    const s = createSeedState(NOW);
    const link = s.promoter_links[0];
    const input = { ticket_price: 10000, tiers: [{ from: 1, percent: 15 }], bar_percent: 5 };
    expect(setPromoterScheme(s, link.id, input, RP).ok).toBe(false);
    expect(setPromoterScheme(s, link.id, input, ORG).ok).toBe(true);
    // el consumo en barra que cuenta es el de quienes entraron por su link
    expect(promoterBarSpend(s, EV, RP)).toBe(s.event_attendees.filter((a) => a.referred_by === RP).reduce((a, x) => a + x.total_spent, 0));
  });
});
