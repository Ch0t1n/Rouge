import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/** Única página indexable: la landing pública. /organizadores y /demo son ocultas (noindex, sin links desde "/"). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
