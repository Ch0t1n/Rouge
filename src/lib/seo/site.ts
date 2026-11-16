/** Origen público del sitio (canonical, sitemap, Open Graph). Mismo `NEXT_PUBLIC_APP_URL` que usan la API y los OAuth. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
