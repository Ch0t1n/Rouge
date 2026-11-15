import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ApiError, codeStatus, decodeCursor, encodeCursor, fromDbError, hashApiKey, parseBearer, parseListQuery, serializeCode, validateIssueBody } from "./v1";
import { openApiSpec } from "./openapi";

const KEY = `rk_live_${"a".repeat(10)}_${"b".repeat(48)}`;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? e.code : "other";
  }
  return null;
};

describe("API v1 · autenticación", () => {
  it("lee la clave Bearer y rechaza formatos raros", () => {
    expect(parseBearer(`Bearer ${KEY}`)).toBe(KEY);
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Basic abc")).toBe("malformed");
    expect(parseBearer("Bearer rk_live_corta")).toBe("malformed");
  });
  it("el hash es el SHA-256 hex (igual que digest() en Postgres)", () => {
    expect(hashApiKey(KEY)).toBe(createHash("sha256").update(KEY).digest("hex"));
  });
});

describe("API v1 · validación del pedido de códigos", () => {
  it("acepta por entrada o por cantidad, no los dos", () => {
    expect(validateIssueBody({ tickets: [{ external_ref: "A" }, { external_ref: "B", label: "VIP" }], label: "General" })).toEqual({ tickets: [{ external_ref: "A" }, { external_ref: "B", label: "VIP" }], label: "General" });
    expect(validateIssueBody({ count: 5 })).toEqual({ count: 5, label: undefined });
    for (const bad of [{}, { count: 1, tickets: [] }, { count: 0 }, { count: 1001 }, { count: 2.5 }, { tickets: [] }, { tickets: [{}] }, { tickets: [{ external_ref: "A" }, { external_ref: "A" }] }, { tickets: [{ external_ref: "x".repeat(121) }] }, { count: 1, label: "x".repeat(61) }, [], null])
      expect(fails(() => validateIssueBody(bad)), JSON.stringify(bad)).toBe("validation_error");
  });
  it("valida filtros y cursor del listado", () => {
    expect(parseListQuery(new URLSearchParams("status=used&limit=10"))).toMatchObject({ status: "used", limit: 10, cursor: null });
    for (const q of ["status=raro", "limit=0", "limit=501", "used_since=ayer", "cursor=basura"]) expect(fails(() => parseListQuery(new URLSearchParams(q))), q).toBe("validation_error");
    const c = { created_at: "2026-11-15T10:00:00.000Z", id: "00000000-0000-4000-8000-000000000001" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
});

describe("API v1 · respuestas", () => {
  const row = { id: "i", code: "K7P2QXMR4A", external_ref: "ORD-1", label: "VIP", is_used: false, used_at: null, revoked_at: null, created_at: "2026-11-15T10:00:00Z", created: true };
  it("serializa con link de ingreso y QR", () => {
    expect(serializeCode(row, "https://app.rouge.ar")).toMatchObject({ status: "unused", join_url: "https://app.rouge.ar/join/K7P2QXMR4A", qr_url: "https://app.rouge.ar/api/v1/qr/K7P2QXMR4A", created: true });
    expect(codeStatus({ is_used: true, revoked_at: null })).toBe("used");
    expect(codeStatus({ is_used: false, revoked_at: "x" })).toBe("revoked");
  });
  it("traduce los errores de SQL a HTTP", () => {
    expect(fromDbError("forbidden").status).toBe(403);
    expect(fromDbError("code_already_used").status).toBe(409);
    expect(fromDbError("duplicate_external_ref").status).toBe(422);
    expect(fromDbError("algo raro").status).toBe(500);
  });
  it("la especificación OpenAPI documenta todas las rutas", () => {
    const spec = openApiSpec("https://app.rouge.ar");
    expect(Object.keys(spec.paths)).toEqual(["/events", "/events/{eventId}/codes", "/events/{eventId}/codes/{code}", "/qr/{code}"]);
    expect(spec.servers[0].url).toBe("https://app.rouge.ar/api/v1");
  });
});
