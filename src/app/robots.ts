import type { MetadataRoute } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/brand";

/**
 * robots.txt. Sitio real: solo la landing pública se indexa; la app (con sesión), el panel y la API quedan fuera del
 * rastreo. /organizadores, /demo, /join y /login NO se bloquean acá a propósito: llevan `noindex` y el buscador tiene
 * que poder leerlo (si se bloquean, la URL puede indexarse sin contenido).
 * Sitio de demostración y previews: no se indexa nada.
 */
export default function robots(): MetadataRoute.Robots {
  if (!SITE_INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/ops", "/superadmin", "/api/", "/app", "/lobby", "/inbox", "/chat/", "/map", "/squad", "/perks", "/bar", "/profile", "/settings", "/u/", "/onboarding", "/wrapped"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
