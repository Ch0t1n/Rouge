import { NextResponse, type NextRequest } from "next/server";
import { paymentIdFromNotification, verifyWebhookSignature } from "@/lib/payments/mp";
import { handlePaymentNotification, mpConfig, mpConfigured } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notificaciones de Mercado Pago (notification_url de cada preferencia: ?brand=<id>).
 * La firma HMAC x-signature es OBLIGATORIA (sin MP_WEBHOOK_SECRET el webhook responde 503: solo se puede
 * saltear en pruebas locales con MP_ALLOW_UNSIGNED_WEBHOOKS=1 fuera de producción). Nunca se confía en el
 * cuerpo: el pago se vuelve a consultar a la API con el token de la marca y se valida contra el pedido
 * (approved, referencia, monto exacto del servidor, moneda y collector_id de la cuenta del organizador).
 * Responde 200 a lo que no corresponde (Mercado Pago reintenta los errores).
 */
export async function POST(req: NextRequest) {
  if (!mpConfigured()) return NextResponse.json({ error: "mp_not_configured" }, { status: 503 });
  const q = req.nextUrl.searchParams;
  const body = await req.json().catch(() => null);
  const paymentId = paymentIdFromNotification(q, body);
  const secret = mpConfig().webhookSecret;
  const unsignedOk = process.env.MP_ALLOW_UNSIGNED_WEBHOOKS === "1" && process.env.NODE_ENV !== "production";
  if (!secret && !unsignedOk) return NextResponse.json({ error: "webhook_secret_missing" }, { status: 503 });
  if (secret) {
    const dataId = q.get("data.id") ?? paymentId;
    if (!verifyWebhookSignature({ xSignature: req.headers.get("x-signature"), xRequestId: req.headers.get("x-request-id"), dataId, secret })) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }
  const brandId = q.get("brand");
  if (!paymentId || !brandId || !/^[0-9a-f-]{36}$/i.test(brandId)) return NextResponse.json({ data: { result: "ignored" } });
  try {
    return NextResponse.json({ data: { result: await handlePaymentNotification(brandId, paymentId) } });
  } catch {
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
