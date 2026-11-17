/**
 * Nombre de la plataforma. Un solo lugar para los textos visibles (metadata, mensajes, PDF, API).
 * Lo interno NO cambia con el nombre: el token de color `rouge`, los QR `ROUGE:ORDER:` / `ROUGE:PASS:`,
 * las claves `rouge:*` de localStorage y el email interno de Instagram (ya hay datos reales con esos valores).
 */
export const APP_NAME = "Rouge Pass";
/** Versión en mayúsculas para el wordmark y piezas gráficas. */
export const APP_WORDMARK = "ROUGE PASS";
/** Lema corto (PWA, <title>). */
export const APP_TAGLINE = "La noche, conectada";

/** Dominio público canónico (SEO: canonical, sitemap, Open Graph). `NEXT_PUBLIC_SITE_URL` lo pisa. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.rougepass.com").replace(/\/$/, "");

/**
 * ¿Este despliegue se deja indexar? Solo el sitio real (con Supabase) y nunca un preview de Vercel.
 * El sitio de demostración (Modo Demo) y los previews piden a Google que no los indexe.
 */
export const SITE_INDEXABLE = !!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.VERCEL_ENV !== "preview";
