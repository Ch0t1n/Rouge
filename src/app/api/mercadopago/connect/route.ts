import { NextResponse, type NextRequest } from "next/server";
import { newNonce, signConnectState } from "@/lib/payments/mp";
import { brandOwnedBy, MP_COOKIE, mpConfig, mpConfigured, redirectUri, removeBrandAccount, userFromRequest } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conectar la cuenta de Mercado Pago de una marca. Body: { brandId }. Exige la sesión de Supabase
 * (Authorization: Bearer) de quien creó la marca. Devuelve { url } para ir a autorizar en Mercado Pago.
 */
export async function POST(req: NextRequest) {
  if (!mpConfigured()) return NextResponse.json({ error: "mp_not_configured" }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { brandId } = (await req.json().catch(() => ({}))) as { brandId?: string };
  if (!brandId || !(await brandOwnedBy(brandId, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const c = mpConfig();
  const nonce = newNonce();
  const state = signConnectState({ brandId, userId: user.id, nonce, exp: Date.now() + 10 * 60_000 }, c.clientSecret);
  const url = new URL(c.authUrl);
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri(req));

  const res = NextResponse.json({ url: url.toString() });
  res.cookies.set(MP_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/mercadopago", maxAge: 600 });
  return res;
}

/** Desconectar: borra los tokens y deja de cobrar online. Body: { brandId }. */
export async function DELETE(req: NextRequest) {
  if (!mpConfigured()) return NextResponse.json({ error: "mp_not_configured" }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { brandId } = (await req.json().catch(() => ({}))) as { brandId?: string };
  if (!brandId || !(await brandOwnedBy(brandId, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await removeBrandAccount(brandId);
  return NextResponse.json({ data: { disconnected: true } });
}
