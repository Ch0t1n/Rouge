import type { MetadataRoute } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/brand";

/**
 * robots.txt. Sitio real: se rastrea todo menos la API; lo que no es la landing lleva `noindex` en la metadata
 * (layout raíz), que Google solo respeta si puede rastrear la página, por eso no se bloquea acá.
 * Sitio de demostración y previews: no se indexa nada.
 */
export default function robots(): MetadataRoute.Robots {
  if (!SITE_INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
