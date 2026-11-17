/**
 * Vercel Web Analytics: qué URL sale del navegador.
 *
 * Las URLs de ROUGE llevan secretos y datos personales: códigos de 1 uso, links de Squad y de RRPP
 * (`/join/<código>`), @usernames (`/u/<username>`), ids de conexión (`/chat/<id>`), ids en la query
 * (`?focus=`, `?order=`, `?event=`, `?next=/join/…`) y el `#token_hash` del login con Instagram.
 * Se manda solo la ruta, con esos segmentos reemplazados por el nombre del parámetro.
 */
const DYNAMIC_ROUTES: ReadonlyArray<readonly [prefix: string, param: string]> = [
  ["join", "[code]"],
  ["u", "[username]"],
  ["chat", "[connectionId]"],
];

export function redactAnalyticsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "/";
  }
  const parts = url.pathname.split("/");
  for (const [prefix, param] of DYNAMIC_ROUTES) {
    if (parts[1] === prefix && parts.length > 2 && parts[2] !== "") parts[2] = param;
  }
  // Sin query ni fragmento: nunca viajan ids, códigos ni tokens.
  return `${url.origin}${parts.join("/")}`;
}
