import { describe, expect, it } from "vitest";
import { clientIp, hit, ruleFor } from "./rateLimit";

describe("rate limiting", () => {
  it("elige la regla más específica por ruta", () => {
    expect(ruleFor("/api/v1/events")?.id).toBe("api-v1");
    expect(ruleFor("/api/mercadopago/webhook")?.id).toBe("webhook");
    expect(ruleFor("/api/mercadopago/checkout")?.id).toBe("money");
    expect(ruleFor("/join/ABC123")?.id).toBe("join");
    expect(ruleFor("/login")?.id).toBe("login");
    expect(ruleFor("/equipo/tok")?.id).toBe("staff-invite");
    expect(ruleFor("/lobby")).toBeNull();
  });

  it("corta al pasar el límite y vuelve a habilitar con la ventana nueva", () => {
    const store = new Map();
    const rule = { limit: 3, windowMs: 60_000 };
    const t0 = 1_000_000_020_000;
    expect([1, 2, 3].map(() => hit(store, "ip", rule, t0).ok)).toEqual([true, true, true]);
    const blocked = hit(store, "ip", rule, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.retryAfterSec).toBeGreaterThan(0);
    // otra IP no se ve afectada
    expect(hit(store, "otra", rule, t0).ok).toBe(true);
    // dos ventanas después, limpio
    expect(hit(store, "ip", rule, t0 + 130_000).ok).toBe(true);
  });

  it("la ventana anterior pesa (no se puede ráfaga en el borde)", () => {
    const store = new Map();
    const rule = { limit: 10, windowMs: 60_000 };
    const ws = 1_000_000_020_000 - (1_000_000_020_000 % 60_000);
    for (let i = 0; i < 10; i++) hit(store, "ip", rule, ws + 59_000);
    // recién empezó la ventana nueva: la anterior todavía pesa ~98% → como mucho 1 pedido más, no 10
    const burst = [0, 1, 2, 3].map(() => hit(store, "ip", rule, ws + 61_000).ok).filter(Boolean).length;
    expect(burst).toBeLessThanOrEqual(1);
  });

  it("toma la IP real detrás del proxy", () => {
    const h = new Map([["x-forwarded-for", "203.0.113.9, 10.0.0.1"]]);
    expect(clientIp({ get: (k) => h.get(k) ?? null })).toBe("203.0.113.9");
  });
});
