"use client";

/**
 * Mercado Pago desde el navegador: conectar/desconectar la cuenta de una marca y pagar un pedido.
 * Todo pasa por /api/mercadopago (servidor): el cliente nunca ve tokens ni crea preferencias.
 * Visible con NEXT_PUBLIC_PAYMENTS_MP=1 (en el Modo Demo se simula).
 */
import { getSupabase } from "@/lib/supabase/client";

export const MP_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_MP === "1";

export const MP_ERRORS: Record<string, string> = {
  mp_not_configured: "Los cobros con Mercado Pago todavía no están activados en este sitio.",
  mp_state: "La conexión con Mercado Pago venció. Probá de nuevo.",
  mp_denied: "Cancelaste la conexión con Mercado Pago.",
  mp_oauth: "Mercado Pago no pudo completar la conexión. Probá de nuevo.",
  mp_token_invalid: "La conexión con Mercado Pago venció. Volvé a conectarla.",
  mp_not_connected: "La marca no tiene Mercado Pago conectado.",
  mp_api_error: "Mercado Pago no respondió. Probá en un rato.",
  mp_save_failed: "No pudimos guardar la conexión. Probá de nuevo.",
  forbidden: "Solo quien creó la marca puede conectar su cuenta de cobro.",
  already_paid: "Ese pedido ya está pago.",
  not_found: "No encontramos ese pedido.",
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sb = getSupabase();
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const json = (await res.json().catch(() => ({}))) as { data?: T; url?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "mp_api_error");
  return (json.data ?? json) as T;
}

/** Va a Mercado Pago a autorizar la cuenta de cobro de la marca (vuelve a /admin/brand). */
export async function connectMercadoPago(brandId: string): Promise<void> {
  const { url } = await call<{ url: string }>("/api/mercadopago/connect", { method: "POST", body: JSON.stringify({ brandId }) });
  window.location.assign(url);
}

export async function disconnectMercadoPago(brandId: string): Promise<void> {
  await call("/api/mercadopago/connect", { method: "DELETE", body: JSON.stringify({ brandId }) });
}

/** Abre el checkout de Mercado Pago del pedido (billetera, tarjetas, dinero en cuenta). */
export async function payWithMercadoPago(orderId: string): Promise<void> {
  const { url } = await call<{ url: string }>("/api/mercadopago/checkout", { method: "POST", body: JSON.stringify({ orderId }) });
  window.location.assign(url);
}

/** Concilia el pago del pedido con Mercado Pago (vuelta del checkout). */
export async function syncOrderPayment(orderId: string): Promise<string> {
  const { payment_status } = await call<{ payment_status: string }>(`/api/mercadopago/orders/${orderId}`);
  return payment_status;
}

export const mpErrorMessage = (e: unknown) => MP_ERRORS[e instanceof Error ? e.message : String(e)] ?? "Algo salió mal con Mercado Pago. Probá de nuevo.";
