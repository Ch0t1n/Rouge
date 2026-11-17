import type { NextConfig } from "next";
import { securityHeadersFor } from "./src/lib/security/headers";

/**
 * El modo presentador de la demo (/demo/presentador) muestra la app en iframes del MISMO sitio: solo en el Modo Demo
 * (sin Supabase) se permite enmarcar páginas propias. En producción (con Supabase) nada se puede enmarcar (DENY).
 */
const demoFrames = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    return [
      // Headers de seguridad en TODAS las respuestas (la CSP con nonce la pone src/proxy.ts).
      { source: "/:path*", headers: securityHeadersFor({ allowSelfFraming: demoFrames }) },
      {
        // La API nunca se cachea (respuestas por usuario, tokens, fotos privadas). El QR público queda afuera: su ruta
        // decide (inmutable si sale bien, no-store si falla). Ojo: estos headers PISAN a los que pone la ruta.
        source: "/api/:path((?!v1/qr/).*)",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        // QRs de entradas y especificación OpenAPI: se embeben desde webs y mails de las ticketeras (otro origen).
        // Va DESPUÉS de los anteriores: en Next gana el último header que coincide.
        source: "/api/v1/qr/:code",
        headers: [
          // La caché la pone la ruta (inmutable solo si el QR se generó bien).
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/api/v1/openapi.json",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        // The service worker must never be served stale, or PWA updates get stuck.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
