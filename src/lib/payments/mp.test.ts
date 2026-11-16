import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildPreference,
  decryptToken,
  encryptToken,
  parseMpToken,
  parseTokenKey,
  paymentIdFromNotification,
  paymentMatchesOrder,
  signConnectState,
  tokenNeedsRefresh,
  verifyConnectState,
  verifyWebhookSignature,
} from "./mp";

const SECRET = "test-secret";
const NOW = Date.parse("2026-11-14T03:00:00.000Z");

describe("state del OAuth", () => {
  const st = { brandId: "b1", userId: "u1", nonce: "n1", exp: NOW + 60_000 };
  it("acepta el state firmado con la cookie correcta", () => {
    expect(verifyConnectState(signConnectState(st, SECRET), SECRET, "n1", NOW)).toEqual(st);
  });
  it("rechaza firma alterada, otra cookie o vencido", () => {
    const raw = signConnectState(st, SECRET);
    const [p] = raw.split(".");
    const forged = `${Buffer.from(JSON.stringify({ ...st, brandId: "otra" })).toString("base64url")}.${raw.split(".")[1]}`;
    expect(verifyConnectState(forged, SECRET, "n1", NOW)).toBeNull();
    expect(verifyConnectState(raw, SECRET, "otra-cookie", NOW)).toBeNull();
    expect(verifyConnectState(raw, SECRET, "n1", NOW + 120_000)).toBeNull();
    expect(verifyConnectState(`${p}.`, SECRET, "n1", NOW)).toBeNull();
    expect(verifyConnectState(raw, "otro-secreto", "n1", NOW)).toBeNull();
  });
});

describe("tokens cifrados", () => {
  const key = parseTokenKey(Buffer.alloc(32, 7).toString("base64"))!;
  it("ida y vuelta con AES-256-GCM", () => {
    const box = encryptToken("APP_USR-123", key);
    expect(box).not.toContain("APP_USR");
    expect(decryptToken(box, key)).toBe("APP_USR-123");
  });
  it("un token alterado no se descifra", () => {
    const box = encryptToken("APP_USR-123", key).split(".");
    box[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptToken(box.join("."), key)).toThrow();
  });
  it("valida la clave", () => {
    expect(parseTokenKey("corta")).toBeNull();
    expect(parseTokenKey("ab".repeat(32))).toHaveLength(32);
    expect(parseTokenKey(undefined)).toBeNull();
  });
});

describe("OAuth", () => {
  it("parsea la respuesta de /oauth/token", () => {
    const t = parseMpToken({ access_token: "APP_USR-1", refresh_token: "TG-1", user_id: 123, public_key: "APP_USR-pk", live_mode: false, expires_in: 15552000 }, NOW)!;
    expect(t).toMatchObject({ access_token: "APP_USR-1", refresh_token: "TG-1", user_id: "123", live_mode: false });
    expect(+new Date(t.expires_at!)).toBe(NOW + 15552000 * 1000);
    expect(parseMpToken({ error: "invalid_grant" })).toBeNull();
  });
  it("renueva cuando faltan menos de 7 días", () => {
    expect(tokenNeedsRefresh(new Date(NOW + 3 * 86_400_000).toISOString(), NOW)).toBe(true);
    expect(tokenNeedsRefresh(new Date(NOW + 30 * 86_400_000).toISOString(), NOW)).toBe(false);
    expect(tokenNeedsRefresh(null, NOW)).toBe(false);
  });
});

describe("webhooks", () => {
  const ts = String(Math.floor(NOW / 1000));
  const sig = (manifest: string, secret = SECRET) => createHmac("sha256", secret).update(manifest).digest("hex");
  it("verifica la firma x-signature (manifest id;request-id;ts)", () => {
    const v1 = sig(`id:123456;request-id:req-1;ts:${ts};`);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret: SECRET, now: NOW })).toBe(true);
  });
  it("rechaza otra clave, otro pago, sin firma o una notificación vieja", () => {
    const v1 = sig(`id:123456;request-id:req-1;ts:${ts};`);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${sig(`id:123456;request-id:req-1;ts:${ts};`, "otra")}`, xRequestId: "req-1", dataId: "123456", secret: SECRET, now: NOW })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "999", secret: SECRET, now: NOW })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: null, xRequestId: "req-1", dataId: "123456", secret: SECRET, now: NOW })).toBe(false);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret: SECRET, now: NOW + 3_600_000 })).toBe(false);
  });
  it("omite del manifest lo que no viene y pasa a minúsculas ids alfanuméricos", () => {
    const v1 = sig(`id:abc123;ts:${ts};`);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: null, dataId: "ABC123", secret: SECRET, now: NOW })).toBe(true);
  });
  it("encuentra el id del pago en Webhooks v2 e IPN", () => {
    expect(paymentIdFromNotification(new URLSearchParams(), { type: "payment", data: { id: 42 } })).toBe("42");
    expect(paymentIdFromNotification(new URLSearchParams("topic=payment&id=77"), null)).toBe("77");
    expect(paymentIdFromNotification(new URLSearchParams("type=merchant_order&data.id=9"), null)).toBeNull();
    expect(paymentIdFromNotification(new URLSearchParams(), { type: "payment", data: { id: "1;drop table" } })).toBeNull();
  });
});

describe("checkout", () => {
  const order = { id: "ord-1", items_json: [{ item_id: "gin", name: "🍸 Gin Tonic", qty: 2, unit_price: 8000 }], total_amount: 16000, pickup_code: "AB12" };
  it("arma la preferencia con la comisión de ROUGE y vuelve a la barra", () => {
    const p = buildPreference(order, { site: "https://rouge.app", brandId: "b-1", eventName: "Noche Neón × Club", feePercent: 5, currency: "ARS", now: NOW });
    expect(p.external_reference).toBe("ord-1");
    expect(p.marketplace_fee).toBe(800);
    expect(p.items[0]).toMatchObject({ quantity: 2, unit_price: 8000, currency_id: "ARS" });
    expect(p.notification_url).toBe("https://rouge.app/api/mercadopago/webhook?brand=b-1");
    expect(p.back_urls.success).toBe("https://rouge.app/bar?pago=ok&pedido=ord-1");
    expect(p.statement_descriptor).toBe("Noche Neon Cl"); // sin tildes ni símbolos, máx. 13 (resumen de la tarjeta)
    expect(+new Date(p.expiration_date_to) - NOW).toBe(30 * 60_000);
  });
  it("un pago acredita el pedido solo si coincide todo", () => {
    const pay = { id: 1, status: "approved", external_reference: "ord-1", transaction_amount: 16000, currency_id: "ARS" };
    expect(paymentMatchesOrder(pay, order, "ARS")).toBe(true);
    expect(paymentMatchesOrder({ ...pay, status: "pending" }, order, "ARS")).toBe(false);
    expect(paymentMatchesOrder({ ...pay, transaction_amount: 100 }, order, "ARS")).toBe(false);
    expect(paymentMatchesOrder({ ...pay, external_reference: "otro" }, order, "ARS")).toBe(false);
    expect(paymentMatchesOrder({ ...pay, currency_id: "USD" }, order, "ARS")).toBe(false);
  });
});
