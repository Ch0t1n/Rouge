/**
 * Headers de seguridad de ROUGE (sin dependencias de Next: testeables).
 *
 *  - `buildCsp()` arma la Content-Security-Policy por request con un nonce (la aplica `src/proxy.ts`).
 *    Next.js pone ese nonce en sus propios scripts al renderizar (por eso el layout es dinámico).
 *  - `STATIC_SECURITY_HEADERS` van en TODAS las respuestas (`next.config.ts`).
 *
 * Orígenes externos permitidos (y por qué):
 *  - Supabase (REST, Realtime por WebSocket, Storage para fotos/loops/chat).
 *  - open.spotify.com: iframe del embed (se carga recién al tocar "Escuchar").
 *  - CDNs de Meta: miniaturas del selector "Importar de Instagram" (la foto elegida se re-sube a Storage).
 * Si sumás un origen nuevo, agregalo acá con su motivo y corré `npm test`.
 */

export const INSTAGRAM_IMG_HOSTS = ["https://*.cdninstagram.com", "https://*.fbcdn.net"];
export const SPOTIFY_ORIGIN = "https://open.spotify.com";

/** Origen https de Supabase y su par wss (Realtime). Ignora valores que no sean http(s). */
export function supabaseOrigins(supabaseUrl: string | undefined): { http: string; ws: string } | null {
  if (!supabaseUrl) return null;
  try {
    const u = new URL(supabaseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { http: u.origin, ws: `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}` };
  } catch {
    return null;
  }
}

/** Nonce aleatorio por request (Web Crypto: funciona en Node y en edge). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface CspOptions {
  nonce: string;
  supabaseUrl?: string;
  /** Desarrollo: React necesita 'unsafe-eval' y el HMR usa WebSocket. */
  isDev?: boolean;
  /** Solo si la app se sirve por HTTPS (en localhost por http rompería los recursos). */
  upgradeInsecure?: boolean;
  reportUri?: string;
  /** Modo Demo (sin Supabase): el modo presentador muestra la app en iframes del mismo sitio. */
  allowSelfFraming?: boolean;
}

export function buildCsp({ nonce, supabaseUrl, isDev = false, upgradeInsecure = false, reportUri, allowSelfFraming = false }: CspOptions): string {
  const sb = supabaseOrigins(supabaseUrl);
  const sbHttp = sb ? [sb.http] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic': solo corren los scripts con nonce y los que ellos cargan (chunks de Next).
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Estilos inline: React y Tailwind los usan en atributos `style`; inyectar CSS es de bajo riesgo frente a JS.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", ...sbHttp, ...INSTAGRAM_IMG_HOSTS],
    "media-src": ["'self'", "blob:", ...sbHttp],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...sbHttp, ...(sb ? [sb.ws] : []), ...(isDev ? ["ws:"] : [])],
    "frame-src": [...(allowSelfFraming ? ["'self'"] : []), SPOTIFY_ORIGIN],
    // browser-image-compression comprime en un Worker creado desde un blob (ver compress.ts).
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": [allowSelfFraming ? "'self'" : "'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (upgradeInsecure) parts.push("upgrade-insecure-requests");
  if (reportUri) parts.push(`report-uri ${reportUri}`);
  return parts.join("; ");
}

/** Headers fijos para todas las respuestas. `allowSelfFraming` solo en el Modo Demo (modo presentador). */
export const securityHeadersFor = ({ allowSelfFraming = false } = {}): { key: string; value: string }[] => [
  // 2 años, sin `preload` (comprometerse al preload es difícil de revertir).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Respaldo de `frame-ancestors 'none'` para navegadores viejos (anti-clickjacking).
  { key: "X-Frame-Options", value: allowSelfFraming ? "SAMEORIGIN" : "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cámara solo para el propio sitio: escáner de la puerta y de la barra. Ni GPS (los pines se marcan a mano) ni micrófono.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()",
  },
  // allow-popups: el login con Google/Mercado Pago puede abrir una ventana propia.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

export const STATIC_SECURITY_HEADERS = securityHeadersFor();
