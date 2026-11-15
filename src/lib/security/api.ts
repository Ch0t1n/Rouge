/**
 * Helpers de las rutas /api (solo servidor): límite de pedidos y lectura acotada del body.
 */
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, RateLimiter, type RateLimitRule } from "./rateLimit";

const limiter = new RateLimiter();

/** Límites por ruta (por IP, o por usuario cuando la ruta exige sesión). */
export const LIMITS = {
  igStart: { limit: 10, windowMs: 60_000 },
  igCallback: { limit: 20, windowMs: 60_000 },
  igList: { limit: 30, windowMs: 60_000 },
  igDownload: { limit: 40, windowMs: 60_000 },
  igDisconnect: { limit: 10, windowMs: 60_000 },
  igDataDeletion: { limit: 30, windowMs: 60_000 },
  cspReport: { limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

/** Devuelve una respuesta 429 si se pasó del límite; null si puede seguir. */
export function rateLimited(req: NextRequest, bucket: keyof typeof LIMITS, id?: string): NextResponse | null {
  const rule = LIMITS[bucket];
  const key = `${bucket}:${id ?? clientIp(req.headers)}`;
  if (limiter.take(key, rule)) return null;
  return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rule.windowMs / 1000)) } });
}

/** Lee un body JSON chico (por defecto ≤ 4 KB). Más grande o inválido → null. */
export async function readJsonBody<T>(req: NextRequest, maxBytes = 4096): Promise<T | null> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return null;
  const text = await req.text().catch(() => "");
  if (!text || text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}
