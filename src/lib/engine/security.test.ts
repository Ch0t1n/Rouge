import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS, DEMO_PINS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import { canAccessPath, PLATFORM_ROLE, roleOf, staffRoleOf, surfaceForPath, withinAccessWindow } from "./roles";
import * as S from "./security";
import { lobbyGrid } from "./grid";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const ORG = DEMO_IDS.organizer;
const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUV";
const ok = <T,>(r: { ok: true; state: RougeState; data: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const seed = () => createSeedState(NOW);
const ev = (s: RougeState) => s.events.find((e) => e.id === EV)!;

describe("superficies de plataforma (aislamiento)", () => {
  it("clasifica cada ruta en su superficie", () => {
    expect(surfaceForPath("/lobby")).toBe("client_app");
    expect(surfaceForPath("/chat/x")).toBe("client_app");
    expect(surfaceForPath("/ops/door")).toBe("staff_ops");
    expect(surfaceForPath("/admin/crm")).toBe("owner_admin");
    expect(surfaceForPath("/superadmin")).toBe("super_admin");
    expect(surfaceForPath("/")).toBeNull();
    expect(surfaceForPath("/join/ABC")).toBeNull();
  });

  it("mapea los roles de la base a roles de plataforma", () => {
    expect(PLATFORM_ROLE.security).toBe("door_scanner");
    expect(PLATFORM_ROLE.bartender).toBe("bar_pos");
    expect(PLATFORM_ROLE.waiter).toBe("bar_pos");
    expect(PLATFORM_ROLE.promoter).toBe("rrpp");
  });

  it("puerta y barra: solo /ops (ni lobby, ni CRM, ni finanzas)", () => {
    const s = seed();
    for (const u of [DEMO_IDS.bartender, DEMO_IDS.security]) {
      expect(canAccessPath(s, EV, u, "/lobby", NOW).ok).toBe(false);
      expect(canAccessPath(s, EV, u, "/admin/crm", NOW).ok).toBe(false);
      expect(canAccessPath(s, EV, u, "/admin", NOW).ok).toBe(false);
      expect(canAccessPath(s, EV, u, "/superadmin", NOW).ok).toBe(false);
    }
    expect(canAccessPath(s, EV, DEMO_IDS.bartender, "/ops/bar", NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, DEMO_IDS.bartender, "/ops/door", NOW).ok).toBe(false);
    expect(canAccessPath(s, EV, DEMO_IDS.security, "/ops/door", NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, DEMO_IDS.security, "/ops/bar", NOW).ok).toBe(false);
    // La pantalla LED sigue disponible para la barra (es una pantalla, no datos)
    expect(canAccessPath(s, EV, DEMO_IDS.bartender, "/admin/live-wall", NOW).ok).toBe(true);
    const d = canAccessPath(s, EV, DEMO_IDS.security, "/lobby", NOW);
    expect(!d.ok && d.redirect).toBe("/ops/door");
  });

  it("asistentes: solo la app (más crear SU evento con autogestión); dueño/a: panel, ops y app; ROUGE HQ: consola global", () => {
    const s = seed();
    expect(canAccessPath(s, EV, DEMO_IDS.me, "/lobby", NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, DEMO_IDS.me, "/ops/door", NOW).ok).toBe(false);
    expect(canAccessPath(s, EV, DEMO_IDS.me, "/admin/crm", NOW).ok).toBe(false);
    // v1.8: solo con autogestión habilitada por ROUGE HQ
    expect(canAccessPath(s, EV, DEMO_IDS.me, "/admin/events", NOW).ok).toBe(false);
    expect(canAccessPath({ ...s, organization_settings: [{ organization_id: DEMO_IDS.me, allow_owner_self_service: true, updated_at: "" }] }, EV, DEMO_IDS.me, "/admin/events", NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, DEMO_IDS.me, "/superadmin", NOW).ok).toBe(false);
    for (const p of ["/admin/crm", "/ops/door", "/ops/bar", "/lobby"]) expect(canAccessPath(s, EV, ORG, p, NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, ORG, "/superadmin", NOW).ok).toBe(false);
    expect(canAccessPath(s, EV, DEMO_IDS.platformAdmin, "/superadmin", NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, DEMO_IDS.promoter, "/admin/rrpp", NOW).ok).toBe(true);
    expect(canAccessPath(s, EV, DEMO_IDS.promoter, "/admin/crm", NOW).ok).toBe(false);
  });
});

describe("ventana horaria automática", () => {
  it("la puerta asignada por la organización solo opera de 2 h antes a 1 h después", () => {
    const s = seed();
    const e = ev(s);
    const start = +new Date(e.starts_at);
    const end = +new Date(e.ends_at);
    expect(staffRoleOf(s, EV, DEMO_IDS.doorScanner, NOW)).toBe("security");
    expect(staffRoleOf(s, EV, DEMO_IDS.doorScanner, start - 2 * 3_600_000 + 1000)).toBe("security");
    expect(staffRoleOf(s, EV, DEMO_IDS.doorScanner, start - 2 * 3_600_000 - 1000)).toBeNull();
    expect(staffRoleOf(s, EV, DEMO_IDS.doorScanner, end + 3_600_000 - 1000)).toBe("security");
    expect(staffRoleOf(s, EV, DEMO_IDS.doorScanner, end + 3_600_000 + 1000)).toBeNull();
    expect(withinAccessWindow(e, end + 2 * 3_600_000)).toBe(false);
    // Fuera de horario es un asistente más (no ve /ops)
    expect(roleOf(s, EV, DEMO_IDS.doorScanner, end + 5 * 3_600_000)).toBe("attendee");
    expect(canAccessPath(s, EV, DEMO_IDS.doorScanner, "/ops/door", end + 5 * 3_600_000).ok).toBe(false);
  });

  it("sin ventana, la asignación vale todo el tiempo; solo cubre eventos de SU organización", () => {
    let s = seed();
    s = { ...s, staff_assignments: s.staff_assignments.map((a) => ({ ...a, access_window: false })) };
    expect(staffRoleOf(s, EV, DEMO_IDS.doorScanner, NOW + 30 * 86_400_000)).toBe("security");
    const otherOrg = { ...s, events: s.events.map((e) => ({ ...e, created_by: DEMO_IDS.manager })) };
    expect(staffRoleOf(otherOrg, EV, DEMO_IDS.doorScanner, NOW)).toBeNull();
  });
});

describe("invitaciones de staff (1 uso, 2 h, atadas a la organización)", () => {
  it("el dueño/a invita, alguien acepta y queda con rol, alcance y ventana", () => {
    let s = seed();
    const inv = ok(S.createStaffInvite(s, ORG, { role: "bartender", scope: "specific_events", eventIds: [EV] }, TOKEN, NOW));
    expect(inv.data.invite.access_window).toBe(true);
    expect(inv.data.invite.token_hash).not.toContain(TOKEN);
    expect(inv.data.invite.expires_at).toBe(new Date(NOW + S.STAFF_INVITE_TTL_MS).toISOString());
    s = inv.state;
    const acc = ok(S.acceptStaffInvite(s, DEMO_IDS.me, TOKEN, NOW + 60_000));
    expect(staffRoleOf(acc.state, EV, DEMO_IDS.me, NOW)).toBe("bartender");
    expect(S.auditFor(acc.state, ORG).map((a) => a.action)).toEqual(expect.arrayContaining(["staff.invited", "staff.joined"]));
    // un solo uso
    expect(S.acceptStaffInvite(acc.state, DEMO_IDS.manager, TOKEN, NOW + 120_000)).toMatchObject({ ok: false, error: expect.stringContaining("ya se usó") });
  });

  it("vence a las 2 h, se puede anular y no acepta tokens inventados ni eventos ajenos", () => {
    const s = seed();
    const inv = ok(S.createStaffInvite(s, ORG, { role: "security", scope: "all_org_events" }, TOKEN, NOW));
    expect(S.acceptStaffInvite(inv.state, DEMO_IDS.me, TOKEN, NOW + S.STAFF_INVITE_TTL_MS + 1)).toMatchObject({ ok: false, error: expect.stringContaining("venció") });
    expect(S.acceptStaffInvite(inv.state, DEMO_IDS.me, "tok_otro_token_inventado_123", NOW)).toMatchObject({ ok: false, error: "Esta invitación no existe." });
    const rev = ok(S.revokeStaffInvite(inv.state, ORG, inv.data.invite.id, NOW));
    expect(S.acceptStaffInvite(rev.state, DEMO_IDS.me, TOKEN, NOW)).toMatchObject({ ok: false, error: "Esta invitación fue anulada." });
    expect(S.createStaffInvite(s, DEMO_IDS.me, { role: "security", scope: "all_org_events" }, TOKEN, NOW).ok).toBe(false); // sin eventos propios
    expect(S.createStaffInvite(s, ORG, { role: "security", scope: "specific_events", eventIds: ["evento-ajeno"] }, TOKEN, NOW).ok).toBe(false);
    expect(S.createStaffInvite(s, ORG, { role: "owner" as "manager", scope: "all_org_events" }, TOKEN, NOW).ok).toBe(false);
  });
});

describe("kill switch", () => {
  it("revoca en el acto en toda la organización (asignación, equipo del evento y PIN)", () => {
    const s = seed();
    const a = ok(S.revokeStaffAccess(s, ORG, DEMO_IDS.doorScanner, NOW));
    expect(staffRoleOf(a.state, EV, DEMO_IDS.doorScanner, NOW)).toBeNull();
    expect(a.state.terminal_pins.some((p) => p.user_id === DEMO_IDS.doorScanner)).toBe(false);
    const b = ok(S.revokeStaffAccess(s, ORG, DEMO_IDS.bartender, NOW));
    expect(staffRoleOf(b.state, EV, DEMO_IDS.bartender, NOW)).toBeNull();
    expect(S.auditFor(b.state, ORG)[0]).toMatchObject({ action: "staff.revoked", target: DEMO_IDS.bartender });
    expect(S.revokeStaffAccess(s, ORG, ORG, NOW).ok).toBe(false);
    expect(S.revokeStaffAccess(s, ORG, DEMO_IDS.me, NOW).ok).toBe(false);
  });

  it("la matriz de staff muestra plataforma, alcance y si está activo ahora", () => {
    const rows = S.staffMatrix(seed(), ORG, NOW);
    const door = rows.find((r) => r.user_id === DEMO_IDS.doorScanner)!;
    expect(door).toMatchObject({ platform: "door_scanner", source: "assignment", scope: "all_org_events", active_now: true, has_pin: true });
    expect(rows.find((r) => r.user_id === DEMO_IDS.bartender)).toMatchObject({ platform: "bar_pos", source: "event" });
  });
});

describe("Modo Kiosco (PIN personal)", () => {
  const deviceState = () => ({ ...seed(), current_user_id: DEMO_IDS.manager });
  it("identifica a quien opera por su PIN y lo deja en la auditoría", () => {
    const r = ok(S.kioskUnlock(deviceState(), EV, DEMO_IDS.manager, DEMO_PINS.bartender, NOW));
    expect(r.data).toEqual({ operatorId: DEMO_IDS.bartender, role: "bartender" });
    expect(r.state.audit_log.at(-1)).toMatchObject({ action: "kiosk.unlocked", operator_id: DEMO_IDS.bartender, actor_id: DEMO_IDS.manager });
  });
  it("la terminal tiene que ser de dueño/a o producción; PIN mal = intento fallido; 5 seguidos bloquean", () => {
    expect(S.kioskUnlock(seed(), EV, DEMO_IDS.bartender, DEMO_PINS.bartender, NOW).ok).toBe(false);
    let s: RougeState = deviceState();
    for (let i = 0; i < S.KIOSK_MAX_FAILS; i++) {
      const a = S.kioskAttempt(s, EV, DEMO_IDS.manager, "9999", NOW + i * 1000);
      expect(a.result.ok).toBe(false);
      s = a.state;
    }
    const locked = S.kioskUnlock(s, EV, DEMO_IDS.manager, DEMO_PINS.bartender, NOW + 10_000);
    expect(locked).toMatchObject({ ok: false, error: expect.stringContaining("bloqueada") });
    expect(S.kioskUnlock(s, EV, DEMO_IDS.manager, DEMO_PINS.bartender, NOW + S.KIOSK_LOCK_MS + 10_000).ok).toBe(true);
  });
  it("un PIN de alguien fuera de su ventana horaria no abre la terminal", () => {
    const e = ev(seed());
    const late = +new Date(e.ends_at) + 3 * 3_600_000;
    expect(S.kioskUnlock(deviceState(), EV, DEMO_IDS.manager, DEMO_PINS.doorScanner, NOW).ok).toBe(true);
    // fuera de horario el manager tampoco… pero el de puerta asignado con ventana sí queda afuera
    expect(S.kioskUnlock(deviceState(), EV, DEMO_IDS.manager, DEMO_PINS.doorScanner, late).ok).toBe(false);
  });
  it("valida el formato y rechaza PINs triviales", () => {
    const s = seed();
    expect(S.setTerminalPin(s, DEMO_IDS.bartender, ORG, "12", NOW).ok).toBe(false);
    for (const weak of ["1234", "0000", "9876", "123456"]) expect(S.setTerminalPin(s, DEMO_IDS.bartender, ORG, weak, NOW).ok).toBe(false);
    expect(S.setTerminalPin(s, DEMO_IDS.bartender, ORG, "4071", NOW).ok).toBe(true);
    expect(S.setTerminalPin(s, DEMO_IDS.me, ORG, "4071", NOW).ok).toBe(false); // no es staff
  });
});

describe("reportes, privacidad del lobby y borrado de cuenta", () => {
  it("reportar llega abierto a seguridad, sin duplicados; seguridad lo marca revisado", () => {
    const s = seed();
    const r = ok(S.reportUser(s, DEMO_IDS.me, "00000000-0000-4000-8000-000000000005", EV, "harassment", "  me sigue  ", NOW));
    expect(r.data.details).toBe("me sigue");
    expect(S.openReports(r.state, EV).map((x) => x.id)).toContain(r.data.id);
    expect(S.reportUser(r.state, DEMO_IDS.me, "00000000-0000-4000-8000-000000000005", EV, "spam", "", NOW).ok).toBe(false);
    expect(S.reportUser(s, DEMO_IDS.me, DEMO_IDS.me, EV, "spam", "", NOW).ok).toBe(false);
    expect(S.reviewReport(r.state, DEMO_IDS.me, r.data.id).ok).toBe(false);
    const rev = ok(S.reviewReport(r.state, DEMO_IDS.security, r.data.id));
    expect(S.openReports(rev.state, EV).map((x) => x.id)).not.toContain(r.data.id);
  });

  it("con check-in obligatorio, solo aparece en la grilla quien ya entró por la puerta", () => {
    const s = seed();
    const strict = { ...s, events: s.events.map((e) => ({ ...e, require_checkin_for_lobby: true })) };
    const all = lobbyGrid(s, EV, DEMO_IDS.me, undefined, NOW);
    const grid = lobbyGrid(strict, EV, DEMO_IDS.me, undefined, NOW);
    expect(grid.length).toBeLessThan(all.length);
    for (const c of grid) expect(c.attendee.checked_in_at).toBeTruthy();
  });

  it("el borrado de cuenta exige confirmar el @usuario y elimina los datos personales", () => {
    const s = seed();
    expect(S.deleteAccount(s, DEMO_IDS.me, "otro", NOW).ok).toBe(false);
    const me = s.profiles.find((p) => p.id === DEMO_IDS.me)!;
    const r = ok(S.deleteAccount(s, DEMO_IDS.me, "@" + me.username, NOW));
    expect(r.state.profiles.some((p) => p.id === DEMO_IDS.me)).toBe(false);
    expect(r.state.event_attendees.some((a) => a.user_id === DEMO_IDS.me)).toBe(false);
    expect(r.state.connections.some((c) => c.sender_id === DEMO_IDS.me || c.receiver_id === DEMO_IDS.me)).toBe(false);
    expect(r.state.messages.some((m) => m.sender_id === DEMO_IDS.me)).toBe(false);
    // quien creó un evento con asistentes no se puede borrar sin transferirlo
    expect(S.deleteAccount(s, ORG, s.profiles.find((p) => p.id === ORG)!.username, NOW).ok).toBe(false);
  });
});
