import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
const dev = process.env.NODE_ENV !== "production";
/**
 * El modo presentador de la demo (/demo/presentador) muestra la app en iframes del MISMO sitio: solo en el Modo Demo
 * (sin Supabase) se permite enmarcar páginas propias. En producción (con Supabase) nada se puede enmarcar (DENY).
 */
const demoFrames = !supabaseUrl;

/** Content-Security-Policy: solo orígenes que la app usa de verdad. */
const csp = [
  "default-src 'self'",
  // Next inyecta scripts inline de arranque; 'unsafe-eval' solo en desarrollo (React Refresh).
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Fotos: Storage de Supabase, CDN de Instagram (importar), avatares demo, blobs/data de la compresión local.
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ""}${dev ? " ws: http://localhost:*" : ""}`,
  "frame-src 'self' https://open.spotify.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://auth.mercadopago.com https://www.mercadopago.com.ar https://api.instagram.com https://www.instagram.com",
  `frame-ancestors ${demoFrames ? "'self'" : "'none'"}`,
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: demoFrames ? "SAMEORIGIN" : "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cámara solo para el propio sitio (escáner de puerta y barra, loop del perfil); nada de geolocalización ni micrófono de terceros.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(self), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

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
      { source: "/:path*", headers: securityHeaders },
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
