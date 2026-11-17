import type { MetadataRoute } from "next";
import { SITE_INDEXABLE, SITE_URL } from "@/lib/brand";

/** sitemap.xml: solo la landing pública ("/organizadores" y "/demo" son noindex a propósito). */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_INDEXABLE) return [];
  return [{ url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
