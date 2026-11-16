import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Solo la landing pública se indexa. La app (privada, con sesión), el panel y la API quedan fuera del rastreo.
 * /organizadores, /demo, /join y /login NO se bloquean acá a propósito: llevan `noindex` y el buscador tiene que poder
 * leerlo (si se bloquean en robots.txt, la URL puede indexarse sin contenido).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/app", "/lobby", "/inbox", "/chat/", "/map", "/squad", "/perks", "/bar", "/profile", "/settings", "/u/", "/onboarding"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
