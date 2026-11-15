import { NextResponse, type NextRequest } from "next/server";
import { verifyState } from "@/lib/instagram/oauth";
import { exchangeCode, fetchMe, IG_COOKIE, IgError, igConfig, igConfigured, redirectUri, saveConnection, sessionForInstagram, siteOrigin } from "@/lib/instagram/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vuelta del OAuth de Instagram.
 *  - link:  guarda la conexión en la cuenta iniciada → /profile/edit?instagram=connected (o `next`)
 *  - login: entra a la cuenta vinculada (o crea una) → /login/instagram#token_hash=… (el navegador abre la sesión)
 * Los errores vuelven a la pantalla de origen con ?ig_error=<código>.
 */
export async function GET(req: NextRequest) {
  const site = siteOrigin(req);
  const params = req.nextUrl.searchParams;
  const st = igConfigured() ? verifyState(params.get("state"), igConfig().appSecret, req.cookies.get(IG_COOKIE)?.value) : null;
  const back = (code: string) => {
    const target = st?.mode === "link" ? (st.next ?? "/profile/edit") : "/login";
    const url = new URL(target, site);
    url.searchParams.set("ig_error", code);
    return done(NextResponse.redirect(url, 303));
  };
  const done = (res: NextResponse) => {
    res.cookies.set(IG_COOKIE, "", { path: "/api/instagram", maxAge: 0 });
    return res;
  };

  if (!st) return back("ig_state");
  if (params.get("error")) return back(params.get("error_reason") === "user_denied" || params.get("error") === "access_denied" ? "ig_denied" : "ig_oauth");
  const code = params.get("code");
  if (!code) return back("ig_oauth");

  try {
    const tok = await exchangeCode(code, redirectUri(req));
    const me = await fetchMe(tok.token);
    const ig = { igUserId: me.igUserId || tok.igUserId, username: me.username, accountType: me.accountType, token: tok.token, expiresAt: tok.expiresAt };
    if (st.mode === "link") {
      await saveConnection(st.userId!, ig);
      const url = new URL(st.next ?? "/profile/edit", site);
      url.searchParams.set("instagram", "connected");
      return done(NextResponse.redirect(url, 303));
    }
    const session = await sessionForInstagram(ig);
    await saveConnection(session.userId, ig);
    // En el fragmento (#): no viaja al servidor ni queda en logs.
    const frag = new URLSearchParams({ token_hash: session.tokenHash, ...(st.next ? { next: st.next } : {}) });
    return done(NextResponse.redirect(`${site}/login/instagram#${frag.toString()}`, 303));
  } catch (e) {
    return back(e instanceof IgError ? e.code : "ig_oauth");
  }
}
