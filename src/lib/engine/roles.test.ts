import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import { can, destinationFor, permissionForPath, roleHome, roleOf } from "./roles";

const s = createSeedState(Date.now());
const EV = DEMO_IDS.event;

describe("roles", () => {
  it("identifica cada tipo de usuario", () => {
    expect(roleOf(s, EV, DEMO_IDS.organizer)).toBe("owner"); // creó el evento
    expect(roleOf(s, EV, DEMO_IDS.manager)).toBe("manager");
    expect(roleOf(s, EV, DEMO_IDS.bartender)).toBe("bartender");
    expect(roleOf(s, EV, DEMO_IDS.waiter)).toBe("waiter");
    expect(roleOf(s, EV, DEMO_IDS.security)).toBe("security");
    expect(roleOf(s, EV, DEMO_IDS.me)).toBe("attendee");
    expect(roleOf(s, EV, "")).toBe("guest");
    expect(roleOf(s, EV, "sin-perfil")).toBe("guest");
  });
  it("lleva a cada rol a su pantalla", () => {
    expect(roleHome("attendee")).toBe("/app");
    expect(roleHome("owner")).toBe("/admin");
    expect(roleHome("bartender")).toBe("/ops/bar");
    expect(roleHome("waiter")).toBe("/ops/bar");
    expect(roleHome("security")).toBe("/ops/door");
  });
  it("cada ruta del admin exige su permiso", () => {
    expect(permissionForPath("/admin")).toBe("admin.overview");
    expect(permissionForPath("/admin/crm")).toBe("admin.crm");
    expect(permissionForPath("/admin/bar-pos")).toBe("admin.bar");
    expect(can(s, EV, DEMO_IDS.bartender, "admin.crm")).toBe(false);
    expect(can(s, EV, DEMO_IDS.security, "admin.overview")).toBe(true);
    expect(can(s, EV, DEMO_IDS.me, "admin.overview")).toBe(false);
  });
});

describe("destino después del login", () => {
  it("respeta el next si el rol lo permite; si no, va a su pantalla", () => {
    expect(destinationFor(s, EV, DEMO_IDS.bartender, "/admin/crm")).toBe("/ops/bar");
    expect(destinationFor(s, EV, DEMO_IDS.organizer, "/admin/crm")).toBe("/admin/crm");
    expect(destinationFor(s, EV, DEMO_IDS.me, "/join/BRESH26")).toBe("/join/BRESH26");
    expect(destinationFor(s, EV, DEMO_IDS.me, null)).toBe("/app");
    expect(destinationFor(s, EV, DEMO_IDS.security, "/")).toBe("/ops/door");
    expect(destinationFor(s, EV, DEMO_IDS.me, "//evil.com")).toBe("/app");
  });
});
