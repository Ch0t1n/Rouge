import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/security/headers";

/** Archivos de /public (íconos, sw.js, manifest, capturas): no son HTML, no necesitan CSP. */
const STATIC_FILE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|js|mjs|css|json|webmanifest|txt|xml|map|woff2?|mp4|webm)$/i;

/**
 * CSP estricta por request: genera un nonce, lo pasa a Next en el header del request (Next lo aplica a
 * sus scripts al renderizar) y lo devuelve en la respuesta. Los demás headers de seguridad están en
 * next.config.ts. Ver src/lib/security/headers.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // /u/<username> puede terminar en ".algo" (los @ admiten puntos): siempre es una página.
  if (STATIC_FILE.test(pathname) && !pathname.startsWith("/u/")) return NextResponse.next();
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecure: request.nextUrl.protocol === "https:",
    reportUri: "/api/csp-report",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Todo menos la API y los estáticos de Next (los archivos de /public se filtran arriba).
      source: "/((?!api/|_next/static|_next/image).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
