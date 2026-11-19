import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import { globalAttendeeSearch, globalEventBoard, globalStaffMatrix, saCheckIn, saHideFromLobby, saRemoveAttendee, saRevokeStaff } from "./superadmin";
import { staffRoleOf } from "./roles";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const HQ = DEMO_IDS.platformAdmin;
const joaco = "00000000-0000-4000-8000-000000000008";

describe("consola global (superadmin)", () => {
  it("tablero: aforo, barra, staff y alertas por evento", () => {
    const [row] = globalEventBoard(createSeedState(NOW), NOW);
    expect(row).toMatchObject({ event_id: EV, phase: "live" });
    expect(row.inside).toBeGreaterThan(0);
    expect(row.sold).toBeGreaterThanOrEqual(row.inside);
    expect(row.bar_revenue).toBeGreaterThan(0);
    expect(row.open_reports).toBe(1);
  });

  it("búsqueda transversal y acciones rápidas solo para administradores globales", () => {
    const s = createSeedState(NOW);
    const hit = globalAttendeeSearch(s, "joaq");
    expect(hit[0]).toMatchObject({ user_id: joaco, checked_in_at: null });
    expect(saCheckIn(s, DEMO_IDS.organizer, EV, joaco, NOW).ok).toBe(false);
    const c = saCheckIn(s, HQ, EV, joaco, NOW);
    expect(c.ok && c.state.event_attendees.find((a) => a.user_id === joaco)?.checked_in_terminal).toBe("ROUGE HQ");
    const h = saHideFromLobby(s, HQ, EV, joaco, NOW);
    expect(h.ok && globalAttendeeSearch(h.state, "joaq")[0].visible_in_lobby).toBe(false);
    const r = saRemoveAttendee(s, HQ, EV, joaco, true, NOW);
    expect(r.ok && r.state.event_bans.some((b) => b.user_id === joaco)).toBe(true);
  });

  it("matriz global de staff con baja remota", () => {
    const s = createSeedState(NOW);
    const rows = globalStaffMatrix(s, NOW);
    expect(rows.some((r) => r.user_id === DEMO_IDS.doorScanner && r.organization_id === DEMO_IDS.organizer)).toBe(true);
    const r = saRevokeStaff(s, HQ, DEMO_IDS.organizer, DEMO_IDS.doorScanner, NOW);
    expect(r.ok && staffRoleOf(r.state, EV, DEMO_IDS.doorScanner, NOW)).toBeNull();
    expect(saRevokeStaff(s, DEMO_IDS.manager, DEMO_IDS.organizer, DEMO_IDS.doorScanner, NOW).ok).toBe(false);
  });
});
