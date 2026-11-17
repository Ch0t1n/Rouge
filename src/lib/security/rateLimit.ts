/**
 * Rate limiting por ventana deslizante (aproximada con dos ventanas fijas), puro y testeable.
 *
 * Lo usa `src/proxy.ts` (Next 16) en memoria por instancia: frena fuerza bruta y enumeración de códigos
 * (/join, /equipo, /api/v1) y abuso de endpoints caros. En despliegues con muchas instancias conviene un store
 * compartido (Redis/Upstash) con la misma interfaz `RateStore`; las RPCs sensibles además tienen sus propios
 * límites en SQL (kiosco: 5 PIN fallidos → 5 min bloqueado).
 */
export interface RateRule {
  /** Identificador del grupo (ej. "api-v1"). */
  id: string;
  /** Rutas que cubre (prefijos). */
  prefixes: string[];
  /** Pedidos permitidos por ventana. */
  limit: number;
  windowMs: number;
  /** Métodos alcanzados (por defecto todos). */
  methods?: string[];
}

export const RATE_RULES: RateRule[] = [
  { id: "webhook", prefixes: ["/api/mercadopago/webhook"], limit: 600, windowMs: 60_000 },
  { id: "api-v1", prefixes: ["/api/v1"], limit: 120, windowMs: 60_000 },
  { id: "auth", prefixes: ["/api/instagram/start", "/api/instagram/callback", "/api/mercadopago/connect", "/api/mercadopago/callback"], limit: 20, windowMs: 60_000 },
  { id: "money", prefixes: ["/api/mercadopago/checkout", "/api/mercadopago/orders", "/api/account"], limit: 30, windowMs: 60_000 },
  { id: "api", prefixes: ["/api/"], limit: 90, windowMs: 60_000 },
  { id: "login", prefixes: ["/login"], limit: 30, windowMs: 60_000 },
  { id: "join", prefixes: ["/join"], limit: 40, windowMs: 60_000 },
  { id: "staff-invite", prefixes: ["/equipo"], limit: 15, windowMs: 60_000 },
];

export const ruleFor = (pathname: string, method = "GET"): RateRule | null =>
  RATE_RULES.find((r) => r.prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/") || pathname === p.replace(/\/$/, "")) && (!r.methods || r.methods.includes(method))) ?? null;

export interface RateStore {
  get(key: string): { count: number; prev: number; start: number } | undefined;
  set(key: string, v: { count: number; prev: number; start: number }): void;
  delete(key: string): void;
  keys(): IterableIterator<string>;
  size: number;
}

export type RateDecision = { ok: true; remaining: number; limit: number } | { ok: false; retryAfterSec: number; limit: number };

/**
 * Cuenta un pedido. Ventana deslizante aproximada: peso de la ventana anterior proporcional al tiempo que falta.
 */
export function hit(store: RateStore, key: string, rule: Pick<RateRule, "limit" | "windowMs">, now = Date.now()): RateDecision {
  const winStart = now - (now % rule.windowMs);
  let e = store.get(key);
  if (!e || e.start < winStart - rule.windowMs) e = { count: 0, prev: 0, start: winStart };
  else if (e.start < winStart) e = { count: 0, prev: e.count, start: winStart };
  const weight = 1 - (now - winStart) / rule.windowMs;
  const used = e.count + e.prev * weight;
  if (used >= rule.limit) {
    store.set(key, e);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((winStart + rule.windowMs - now) / 1000)), limit: rule.limit };
  }
  e.count += 1;
  store.set(key, e);
  // Limpieza perezosa para no crecer sin límite.
  if (store.size > 20_000) for (const k of store.keys()) if ((store.get(k)?.start ?? 0) < winStart - rule.windowMs) store.delete(k);
  return { ok: true, remaining: Math.max(0, Math.floor(rule.limit - used - 1)), limit: rule.limit };
}

/** IP del cliente detrás de proxy/CDN (primer valor de x-forwarded-for). */
export function clientIp(headers: { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * Límite por clave (IP o usuario) con ventana deslizante exacta, en memoria: lo usan las rutas de la API para frenar
 * por clave de API o por usuario (además del límite por IP de `src/proxy.ts`). De "mejor esfuerzo" en serverless
 * (cada instancia tiene su memoria): no reemplaza un límite en el borde (Vercel Firewall / WAF).
 */
export interface RateLimitRule {
  /** Pedidos permitidos por ventana. */
  limit: number;
  /** Duración de la ventana en ms. */
  windowMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private maxKeys = 10_000) {}

  /** true si el pedido entra; false si superó el límite. */
  take(key: string, rule: RateLimitRule, now = Date.now()): boolean {
    const from = now - rule.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    const ok = list.length < rule.limit;
    if (ok) list.push(now);
    this.hits.delete(key); // re-inserta al final: el Map queda ordenado por uso reciente
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value as string);
    return ok;
  }
}
