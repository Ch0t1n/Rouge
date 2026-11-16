import { NextResponse, type NextRequest } from "next/server";
import { verifyConnectState } from "@/lib/payments/mp";
import { accountLabel, brandOwnedBy, exchangeCode, MP_COOKIE, MpError, mpConfig, mpConfigured, redirectUri, saveBrandAccount, siteOrigin } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vuelta del OAuth de Mercado Pago → /admin/brand?mp=connected (o ?mp_error=<código>). */
export async function GET(req: NextRequest) {
  const site = siteOrigin(req);
  const params = req.nextUrl.searchParams;
  const st = mpConfigured() ? verifyConnectState(params.get("state"), mpConfig().clientSecret, req.cookies.get(MP_COOKIE)?.value) : null;
  const finish = (q: Record<string, string>) => {
    const url = new URL("/admin/brand", site);
    for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(MP_COOKIE, "", { path: "/api/mercadopago", maxAge: 0 });
    return res;
  };

  if (!st) return finish({ mp_error: "mp_state" });
  if (params.get("error")) return finish({ mp_error: "mp_denied" });
  const code = params.get("code");
  if (!code) return finish({ mp_error: "mp_oauth" });
  try {
    // La marca tiene que seguir siendo de quien empezó el flujo.
    if (!(await brandOwnedBy(st.brandId, st.userId))) return finish({ mp_error: "forbidden" });
    const tok = await exchangeCode(code, redirectUri(req));
    await saveBrandAccount(st.brandId, st.userId, tok, await accountLabel(tok.access_token));
    return finish({ mp: "connected" });
  } catch (e) {
    return finish({ mp_error: e instanceof MpError ? e.code : "mp_oauth" });
  }
}
