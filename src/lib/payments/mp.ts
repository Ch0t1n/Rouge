/**
 * Mercado Pago — helpers PUROS (sin red, testeables). Solo servidor (usa node:crypto).
 *
 *  - `state` firmado (HMAC) del OAuth de conexión de una marca, atado a una cookie httpOnly (CSRF).
 *  - Cifrado AES-256-GCM de los tokens de la marca (nunca quedan en claro en la base).
 *  - Verificación de la firma `x-signature` de los webhooks.
 *  - Armado de la preferencia de Checkout Pro (con `marketplace_fee` = comisión de ROUGE).
 *  - Validación del pago contra el pedido (estado, referencia, monto y moneda).
 *
 * Ver src/lib/payments/server.ts (red + Supabase con service role) y docs/tecnica/mercadopago.md.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { BarOrder } from "@/lib/types";
import { marketplaceFee } from "@/lib/engine/payments";

// ── state del OAuth ──────────────────────────────────────────────────

export interface ConnectState {
  brandId: string;
  userId: string;
  /** Debe coincidir con la cookie httpOnly del navegador que empezó el flujo. */
  nonce: string;
  exp: number;
}

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest();
export const newNonce = () => randomBytes(18).toString("base64url");

export function signConnectState(st: ConnectState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(st)).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

export function verifyConnectState(raw: string | null | undefined, secret: string, cookieNonce: string | null | undefined, now = Date.now()): ConnectState | null {
  if (!raw || !cookieNonce || !secret) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const st = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectState;
    if (!st.brandId || !st.userId || st.exp < now || st.nonce !== cookieNonce) return null;
    return st;
  } catch {
    return null;
  }
}

// ── Cifrado de tokens ────────────────────────────────────────────────

/** MP_TOKEN_KEY: 32 bytes en base64 (o 64 caracteres hex). */
export function parseTokenKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** "v1.<iv>.<tag>.<cifrado>" (base64url). */
export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptToken(box: string, key: Buffer): string {
  const [v, iv, tag, enc] = box.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("token_format");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

// ── OAuth ────────────────────────────────────────────────────────────

export interface MpToken {
  access_token: string;
  refresh_token: string | null;
  user_id: string;
  public_key: string | null;
  live_mode: boolean;
  expires_at: string | null;
}

/** Respuesta de POST /oauth/token (authorization_code o refresh_token). */
export function parseMpToken(json: unknown, now = Date.now()): MpToken | null {
  const j = json as { access_token?: string; refresh_token?: string; user_id?: number | string; public_key?: string; live_mode?: boolean; expires_in?: number };
  if (!j?.access_token || j.user_id == null) return null;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? null,
    user_id: String(j.user_id),
    public_key: j.public_key ?? null,
    live_mode: j.live_mode !== false,
    expires_at: typeof j.expires_in === "number" ? new Date(now + j.expires_in * 1000).toISOString() : null,
  };
}

/** ¿Hay que renovar el token? (vence en menos de 7 días). */
export const tokenNeedsRefresh = (expiresAt: string | null, now = Date.now()) => !!expiresAt && +new Date(expiresAt) - now < 7 * 86_400_000;

// ── Webhooks ─────────────────────────────────────────────────────────

/**
 * Firma de las notificaciones de Mercado Pago:
 *   x-signature: "ts=<segundos>,v1=<hmac hex>"
 *   manifest:    "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"   (data.id en minúsculas si es alfanumérico)
 *   v1 = HMAC-SHA256(manifest, clave secreta del webhook) en hex.
 * Partes ausentes se omiten del manifest. `toleranceSec` evita reenvíos viejos (0 = sin control).
 */
export function verifyWebhookSignature(opts: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string; now?: number; toleranceSec?: number }): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts;
  if (!xSignature || !secret) return false;
  const parts = Object.fromEntries(xSignature.split(",").map((p) => p.trim().split("=") as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  const tol = opts.toleranceSec ?? 600;
  if (tol > 0) {
    const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs((opts.now ?? Date.now()) - tsMs) > tol * 1000) return false;
  }
  const id = dataId ? (/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId) : null;
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const given = Buffer.from(v1.toLowerCase(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Id del pago en una notificación (Webhooks v2: body.data.id · IPN viejo: ?id=&topic=payment). */
export function paymentIdFromNotification(query: URLSearchParams, body: unknown): string | null {
  const b = body as { type?: string; action?: string; data?: { id?: string | number } } | null;
  const type = b?.type ?? query.get("type") ?? query.get("topic");
  if (type && type !== "payment") return null;
  const id = b?.data?.id ?? query.get("data.id") ?? query.get("id");
  return id != null && /^[A-Za-z0-9-]{1,64}$/.test(String(id)) ? String(id) : null;
}

// ── Checkout Pro ─────────────────────────────────────────────────────

export interface PreferenceOptions {
  site: string;
  brandId: string;
  eventName: string;
  feePercent: number;
  currency: string;
  /** Minutos hasta que vence el link de pago. */
  expiresInMin?: number;
  now?: number;
}

/**
 * Preferencia de Checkout Pro para un pedido. El pago lo cobra la marca (token del vendedor) y Mercado Pago
 * le transfiere a ROUGE el `marketplace_fee`. `external_reference` = id del pedido (así se concilia).
 */
export function buildPreference(order: Pick<BarOrder, "id" | "items_json" | "total_amount" | "pickup_code">, o: PreferenceOptions) {
  const now = o.now ?? Date.now();
  const back = (status: string) => `${o.site}/bar?pago=${status}&pedido=${order.id}`;
  return {
    items: order.items_json.map((i) => ({ id: i.item_id, title: i.name.slice(0, 120), quantity: i.qty, unit_price: Number(i.unit_price), currency_id: o.currency })),
    external_reference: order.id,
    statement_descriptor:
      o.eventName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 13)
        .trim() || "ROUGE",
    marketplace_fee: marketplaceFee(order.total_amount, o.feePercent),
    notification_url: `${o.site}/api/mercadopago/webhook?brand=${encodeURIComponent(o.brandId)}`,
    back_urls: { success: back("ok"), pending: back("pendiente"), failure: back("error") },
    auto_return: "approved",
    binary_mode: true, // aprobado o rechazado al instante: en la barra no sirve un pago "pendiente" de horas
    expires: true,
    expiration_date_from: new Date(now).toISOString(),
    expiration_date_to: new Date(now + (o.expiresInMin ?? 30) * 60_000).toISOString(),
    metadata: { rouge_order_id: order.id, rouge_brand_id: o.brandId },
  };
}

export interface MpPayment {
  id: number | string;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  /** Cuenta que cobró (el vendedor). Tiene que ser la cuenta conectada de la marca del evento. */
  collector_id?: number | string | null;
}

/**
 * El pago acredita ESTE pedido: aprobado, misma referencia, mismo monto (el del servidor) y moneda, y cobrado por
 * la cuenta de Mercado Pago del organizador (`collectorId` = provider_user_id de la marca). Si se pasa
 * `collectorId`, un pago aprobado de OTRA cuenta (aunque traiga la misma referencia) no acredita nada.
 */
export function paymentMatchesOrder(p: MpPayment, order: Pick<BarOrder, "id" | "total_amount">, currency: string, collectorId?: string | null): boolean {
  if (collectorId != null && String(p.collector_id ?? "") !== String(collectorId)) return false;
  return p.status === "approved" && p.external_reference === order.id && p.currency_id === currency && Math.abs(Number(p.transaction_amount) - order.total_amount) < 0.01;
}

/** Cifrado opcional en reposo para tokens de terceros (Instagram): "v1.…" si hay clave; texto plano heredado se lee igual. */
export const isEncryptedToken = (box: string | null | undefined) => !!box && /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/.test(box);
