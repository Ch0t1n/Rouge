import { NextResponse, type NextRequest } from "next/server";
import { clientIp, hit, ruleFor } from "@/lib/security/rateLimit";

/**
 * Proxy de Next 16 (ex middleware): rate limiting por IP en rutas sensibles (API v1, OAuth, cobros, login,
 * /join y /equipo). Las cabeceras de seguridad (CSP, HSTS, X-Frame-Options…) se aplican en next.config.ts.
 * La autorización real vive en el servidor (RLS + RPCs con has_staff_role / is_platform_admin).
 */
const store = new Map<string, { count: number; prev: number; start: number }>();

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = ruleFor(pathname, req.method);
  if (!rule) return NextResponse.next();
  const d = hit(store, `${rule.id}:${clientIp(req.headers)}`, rule);
  if (d.ok) {
    const res = NextResponse.next();
    res.headers.set("RateLimit-Limit", String(d.limit));
    res.headers.set("RateLimit-Remaining", String(d.remaining));
    return res;
  }
  const headers = { "Retry-After": String(d.retryAfterSec), "RateLimit-Limit": String(d.limit), "RateLimit-Remaining": "0" };
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "rate_limited", message: "Demasiados pedidos. Probá de nuevo en un momento." } }, { status: 429, headers });
  return new NextResponse("Demasiados intentos. Esperá un momento y volvé a probar.", { status: 429, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

export const config = {
  matcher: ["/api/:path*", "/login/:path*", "/login", "/join/:path*", "/join", "/equipo/:path*"],
};
