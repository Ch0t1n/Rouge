/**
 * Límite de pedidos por clave (IP o usuario) con ventana deslizante, en memoria.
 *
 * Es de "mejor esfuerzo": en serverless cada instancia tiene su propia memoria, así que frena ráfagas
 * y abuso casual pero no reemplaza un límite en el borde (Vercel Firewall / WAF). Ver
 * docs/tecnica/seguridad-y-privacidad.md.
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

/** IP del cliente detrás del proxy de la plataforma (primer valor de x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "unknown";
}
