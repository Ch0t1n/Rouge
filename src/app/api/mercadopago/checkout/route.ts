import { NextResponse, type NextRequest } from "next/server";
import { createCheckout, loadOrder, MpError, mpConfigured, siteOrigin, userFromRequest } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Link de pago (Checkout Pro) de un pedido propio que espera pago. Body: { orderId } → { url }. */
export async function POST(req: NextRequest) {
  if (!mpConfigured()) return NextResponse.json({ error: "mp_not_configured" }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  const order = orderId ? await loadOrder(orderId) : null;
  if (!order || order.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.payment_status !== "awaiting_payment") return NextResponse.json({ error: "already_paid" }, { status: 409 });
  try {
    const { url } = await createCheckout(order, siteOrigin(req));
    return NextResponse.json({ data: { url } });
  } catch (e) {
    const err = e instanceof MpError ? e : new MpError("mp_api_error", 502);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
