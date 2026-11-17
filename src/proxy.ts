import { NextResponse, type NextRequest } from "next/server";
import { clientIp, hit, ruleFor } from "@/lib/security/rateLimit";
import { buildCsp, newNonce } from "@/lib/security/headers";

/**
 * Proxy de Next 16 (ex middleware). Dos trabajos:
 *  1. Rate limiting por IP en rutas sensibles (API v1, OAuth, cobros, login, /join y /equipo).
 *  2. CSP estricta por request en las páginas: genera un nonce, se lo pasa a Next en el header del request (Next lo
 *     aplica a sus scripts al renderizar) y lo devuelve en la respuesta. El resto de los headers está en next.config.ts.
 * La autorización real vive en el servidor (RLS + RPCs con has_staff_role / is_platform_admin).
 */
const store = new Map<string, { count: number; prev: number; start: number }>();

/** Archivos de /public (íconos, sw.js, manifest, capturas): no son HTML, no necesitan CSP. */
const STATIC_FILE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|js|mjs|css|json|webmanifest|txt|xml|map|woff2?|mp4|webm)$/i;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const rule = ruleFor(pathname, req.method);
  const d = rule ? hit(store, `${rule.id}:${clientIp(req.headers)}`, rule) : null;
  if (d && !d.ok) {
    const headers = { "Retry-After": String(d.retryAfterSec), "RateLimit-Limit": String(d.limit), "RateLimit-Remaining": "0" };
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "rate_limited", message: "Demasiados pedidos. Probá de nuevo en un momento." } }, { status: 429, headers });
    return new NextResponse("Demasiados intentos. Esperá un momento y volvé a probar.", { status: 429, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const withRate = (res: NextResponse) => {
    if (d?.ok) {
      res.headers.set("RateLimit-Limit", String(d.limit));
      res.headers.set("RateLimit-Remaining", String(d.remaining));
    }
    return res;
  };

  // API y archivos estáticos: sin CSP de página. /u/<username> puede terminar en ".algo": siempre es una página.
  const prefetch = req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch";
  if (pathname.startsWith("/api/") || prefetch || (STATIC_FILE.test(pathname) && !pathname.startsWith("/u/"))) return withRate(NextResponse.next());

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl,
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecure: req.nextUrl.protocol === "https:",
    reportUri: "/api/csp-report",
    // Modo Demo (sin Supabase): el modo presentador enmarca la app del mismo sitio.
    allowSelfFraming: !supabaseUrl,
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return withRate(res);
}

export const config = {
  // Todo menos los estáticos de Next (los archivos de /public se filtran arriba).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
