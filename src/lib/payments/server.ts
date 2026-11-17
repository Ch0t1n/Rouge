/**
 * Mercado Pago (Marketplace) — SOLO servidor.
 *
 * Cada marca conecta SU cuenta de Mercado Pago por OAuth: los pagos de la Barra Express entran a esa cuenta
 * y Mercado Pago le transfiere a ROUGE la comisión (`marketplace_fee`) automáticamente.
 *
 * Variables de entorno (ver .env.example y docs/tecnica/mercadopago.md):
 *   MP_CLIENT_ID / MP_CLIENT_SECRET    aplicación de ROUGE en Mercado Pago Developers (modelo Marketplace)
 *   MP_TOKEN_KEY                       32 bytes (base64 o hex) para cifrar los tokens de las marcas
 *   MP_WEBHOOK_SECRET                  clave secreta de las notificaciones (Webhooks → firma)
 *   MP_MARKETPLACE_FEE_PERCENT         comisión de ROUGE por pedido (ej. 5) — default 0
 *   MP_CURRENCY                        moneda de los cobros (default ARS)
 *   SUPABASE_SERVICE_ROLE_KEY          para guardar tokens y acreditar pagos (nunca NEXT_PUBLIC)
 *   NEXT_PUBLIC_APP_URL                dominio público (redirect_uri = <app>/api/mercadopago/callback)
 * Opcionales (tests / mocks): MP_AUTH_URL, MP_API_URL.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { BarOrder } from "@/lib/types";
import { buildPreference, decryptToken, encryptToken, parseMpToken, parseTokenKey, paymentMatchesOrder, tokenNeedsRefresh, type MpPayment, type MpToken } from "./mp";

export const MP_COOKIE = "rouge_mp_nonce";

export function mpConfig() {
  return {
    clientId: process.env.MP_CLIENT_ID ?? "",
    clientSecret: process.env.MP_CLIENT_SECRET ?? "",
    tokenKey: parseTokenKey(process.env.MP_TOKEN_KEY),
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? "",
    feePercent: Math.max(0, Math.min(50, Number(process.env.MP_MARKETPLACE_FEE_PERCENT ?? 0) || 0)),
    currency: process.env.MP_CURRENCY ?? "ARS",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    authUrl: process.env.MP_AUTH_URL ?? "https://auth.mercadopago.com/authorization",
    apiUrl: (process.env.MP_API_URL ?? "https://api.mercadopago.com").replace(/\/$/, ""),
  };
}

export const mpConfigured = () => {
  const c = mpConfig();
  return !!(c.clientId && c.clientSecret && c.tokenKey && c.supabaseUrl && c.serviceKey);
};

export function siteOrigin(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
}

export const redirectUri = (req: NextRequest) => `${siteOrigin(req)}/api/mercadopago/callback`;

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  const c = mpConfig();
  if (!admin) admin = createClient(c.supabaseUrl, c.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export class MpError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

/** Usuario de Supabase a partir del `Authorization: Bearer <access_token>` del cliente. */
export async function userFromRequest(req: NextRequest): Promise<{ id: string } | null> {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await adminClient().auth.getUser(jwt);
  return error || !data.user ? null : { id: data.user.id };
}

export async function brandOwnedBy(brandId: string, userId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await adminClient().from("brands").select("id,name,owner_id").eq("id", brandId).maybeSingle();
  return data && data.owner_id === userId ? { id: data.id as string, name: data.name as string } : null;
}

async function mpFetch(path: string, init: RequestInit & { token?: string } = {}): Promise<unknown> {
  const { token, ...rest } = init;
  const res = await fetch(`${mpConfig().apiUrl}${path}`, {
    ...rest,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new MpError(res.status === 401 || res.status === 403 ? "mp_token_invalid" : "mp_api_error", res.status === 401 ? 401 : 502);
  return json;
}

// ── OAuth ────────────────────────────────────────────────────────────

export async function exchangeCode(code: string, redirect: string): Promise<MpToken> {
  const c = mpConfig();
  const tok = parseMpToken(await mpFetch("/oauth/token", { method: "POST", body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirect }) }));
  if (!tok) throw new MpError("mp_oauth");
  return tok;
}

async function refresh(refreshToken: string): Promise<MpToken> {
  const c = mpConfig();
  const tok = parseMpToken(await mpFetch("/oauth/token", { method: "POST", body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }) }));
  if (!tok) throw new MpError("mp_token_invalid", 401);
  return tok;
}

/** Apodo o email de la cuenta (lo muestra el panel). */
export async function accountLabel(token: string): Promise<string> {
  const me = (await mpFetch("/users/me", { token }).catch(() => ({}))) as { nickname?: string; email?: string };
  return me.nickname || me.email || "Mercado Pago";
}

export async function saveBrandAccount(brandId: string, userId: string, tok: MpToken, label: string): Promise<void> {
  const key = mpConfig().tokenKey!;
  const sb = adminClient();
  const { error } = await sb.from("brand_payment_accounts").upsert(
    {
      brand_id: brandId,
      provider: "mercadopago",
      provider_user_id: tok.user_id,
      account_label: label,
      live_mode: tok.live_mode,
      access_token_enc: encryptToken(tok.access_token, key),
      refresh_token_enc: tok.refresh_token ? encryptToken(tok.refresh_token, key) : null,
      public_key: tok.public_key,
      expires_at: tok.expires_at,
      connected_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id" },
  );
  if (error) throw new MpError("mp_save_failed", 500);
  await sb.from("brands").update({ payments_enabled: true }).eq("id", brandId);
}

export async function removeBrandAccount(brandId: string): Promise<void> {
  const sb = adminClient();
  await sb.from("brand_payment_accounts").delete().eq("brand_id", brandId);
  await sb.from("brands").update({ payments_enabled: false }).eq("id", brandId);
}

/** Token del vendedor (descifrado), renovándolo si está por vencer, y su id de cuenta (collector_id esperado). */
export async function sellerAccount(brandId: string): Promise<{ token: string; collectorId: string | null }> {
  const key = mpConfig().tokenKey!;
  const sb = adminClient();
  const { data } = await sb.from("brand_payment_accounts").select("access_token_enc,refresh_token_enc,expires_at,connected_by,account_label,provider_user_id").eq("brand_id", brandId).maybeSingle();
  if (!data) throw new MpError("mp_not_connected", 409);
  const collectorId = (data.provider_user_id as string | null) ?? null;
  if (tokenNeedsRefresh(data.expires_at as string | null) && data.refresh_token_enc) {
    const tok = await refresh(decryptToken(data.refresh_token_enc as string, key));
    await saveBrandAccount(brandId, data.connected_by as string, tok, data.account_label as string);
    return { token: tok.access_token, collectorId: tok.user_id || collectorId };
  }
  return { token: decryptToken(data.access_token_enc as string, key), collectorId };
}

export const sellerToken = async (brandId: string) => (await sellerAccount(brandId)).token;

// ── Pedidos ──────────────────────────────────────────────────────────

export interface OrderWithEvent extends BarOrder {
  events: { id: string; name: string; brand_id: string | null } | null;
}

export async function loadOrder(orderId: string): Promise<OrderWithEvent | null> {
  const { data } = await adminClient().from("bar_orders").select("*, events(id,name,brand_id)").eq("id", orderId).maybeSingle();
  return data ? ({ ...(data as OrderWithEvent), total_amount: Number((data as BarOrder).total_amount) } as OrderWithEvent) : null;
}

/** Crea la preferencia de Checkout Pro con el token de la marca y devuelve el link de pago. */
export async function createCheckout(order: OrderWithEvent, site: string): Promise<{ url: string; preferenceId: string }> {
  const c = mpConfig();
  const brandId = order.events?.brand_id;
  if (!brandId) throw new MpError("mp_not_connected", 409);
  const token = await sellerToken(brandId);
  const pref = (await mpFetch("/checkout/preferences", {
    method: "POST",
    token,
    headers: { "X-Idempotency-Key": `rouge-${order.id}-${Math.floor(Date.now() / 60_000)}` },
    body: JSON.stringify(buildPreference(order, { site, brandId, eventName: order.events?.name ?? "Rouge Pass", feePercent: c.feePercent, currency: c.currency })),
  })) as { id?: string; init_point?: string };
  if (!pref.id || !pref.init_point) throw new MpError("mp_api_error", 502);
  await adminClient().from("bar_orders").update({ mp_preference_id: pref.id }).eq("id", order.id);
  return { url: pref.init_point, preferenceId: pref.id };
}

/** Acredita el pedido si el pago (consultado a Mercado Pago con el token de la marca) lo cubre. */
async function confirmIfMatches(order: OrderWithEvent, payment: MpPayment, collectorId: string | null): Promise<boolean> {
  // Verificación server-to-server: estado approved, monto exacto del servidor, moneda y cuenta del organizador.
  if (!paymentMatchesOrder(payment, order, mpConfig().currency, collectorId)) return false;
  const { error } = await adminClient().rpc("confirm_order_payment", { p_order: order.id, p_payment_ref: String(payment.id), p_amount: Number(payment.transaction_amount) });
  if (error) throw new MpError("mp_confirm_failed", 500);
  return true;
}

/** Webhook: el pago `paymentId` de la cuenta de `brandId`. Nunca confía en el cuerpo: lo vuelve a pedir a la API. */
export async function handlePaymentNotification(brandId: string, paymentId: string): Promise<"confirmed" | "ignored"> {
  const { token, collectorId } = await sellerAccount(brandId);
  const payment = (await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, { token })) as MpPayment;
  if (!payment.external_reference) return "ignored";
  const order = await loadOrder(payment.external_reference);
  // El pedido tiene que ser de un evento de ESTA marca (si no, alguien podría acreditar con pagos de otra cuenta).
  if (!order || order.events?.brand_id !== brandId) return "ignored";
  return (await confirmIfMatches(order, payment, collectorId)) ? "confirmed" : "ignored";
}

/** Conciliación a pedido (vuelta del checkout o webhook demorado): busca pagos aprobados del pedido. */
export async function reconcileOrder(order: OrderWithEvent): Promise<BarOrder["payment_status"]> {
  if (order.payment_status !== "awaiting_payment" || !order.events?.brand_id) return order.payment_status;
  const { token, collectorId } = await sellerAccount(order.events.brand_id);
  const res = (await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`, { token })) as { results?: MpPayment[] };
  for (const p of res.results ?? []) if (await confirmIfMatches(order, p, collectorId)) return "paid";
  return "awaiting_payment";
}
