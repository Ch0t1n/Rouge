import { NextResponse, type NextRequest } from "next/server";
import { loadOrder, MpError, mpConfigured, reconcileOrder, userFromRequest } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de pago de un pedido propio, conciliado con Mercado Pago (vuelta del checkout o webhook demorado).
 * → { data: { payment_status } }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  if (!mpConfigured()) return NextResponse.json({ error: "mp_not_configured" }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { orderId } = await ctx.params;
  const order = await loadOrder(orderId);
  if (!order || order.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return NextResponse.json({ data: { payment_status: await reconcileOrder(order) } });
  } catch (e) {
    const err = e instanceof MpError ? e : new MpError("mp_api_error", 502);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
