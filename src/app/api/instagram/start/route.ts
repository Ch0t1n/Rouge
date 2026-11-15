import { NextResponse, type NextRequest } from "next/server";
import { newNonce, safeInternalPath, signState, type InstagramMode } from "@/lib/instagram/oauth";
import { IG_COOKIE, IG_SCOPES, igConfig, igConfigured, redirectUri, userFromRequest } from "@/lib/instagram/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Arranca el OAuth de Instagram. Body: { mode: "login" | "link", next?: string }.
 * "link" exige la sesión de Supabase (Authorization: Bearer). Devuelve { url } para navegar.
 */
export async function POST(req: NextRequest) {
  if (!igConfigured()) return NextResponse.json({ error: "ig_not_configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { mode?: InstagramMode; next?: string };
  const mode: InstagramMode = body.mode === "link" ? "link" : "login";
  const user = mode === "link" ? await userFromRequest(req) : null;
  if (mode === "link" && !user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const c = igConfig();
  const nonce = newNonce();
  const state = signState({ mode, userId: user?.id ?? null, nonce, next: safeInternalPath(body.next), exp: Date.now() + 10 * 60_000 }, c.appSecret);
  const url = new URL(c.oauthUrl);
  url.searchParams.set("client_id", c.appId);
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", IG_SCOPES);
  url.searchParams.set("state", state);

  const res = NextResponse.json({ url: url.toString() });
  res.cookies.set(IG_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/instagram", maxAge: 600 });
  return res;
}
