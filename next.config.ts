import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // /empresas fue la primera página corporativa: hoy es ROUGE PRO en /pro.
  async redirects() {
    return [{ source: "/empresas", destination: "/pro", permanent: true }];
  },
  async headers() {
    return [
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
