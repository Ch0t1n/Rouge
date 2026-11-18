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
  // API v1 (ticketeras): por IP antes de autenticar y por clave después; el QR es público y cuesta CPU.
  apiV1Ip: { limit: 300, windowMs: 60_000 },
  apiV1Key: { limit: 600, windowMs: 60_000 },
  apiQr: { limit: 120, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

/** true si el pedido entra en el límite (por IP, o por `id` si se pasa). */
export function allowRequest(req: NextRequest, bucket: keyof typeof LIMITS, id?: string): boolean {
  return limiter.take(`${bucket}:${id ?? clientIp(req.headers)}`, LIMITS[bucket]);
}

export const retryAfterSeconds = (bucket: keyof typeof LIMITS) => String(Math.ceil(LIMITS[bucket].windowMs / 1000));

/** Devuelve una respuesta 429 si se pasó del límite; null si puede seguir. */
export function rateLimited(req: NextRequest, bucket: keyof typeof LIMITS, id?: string): NextResponse | null {
  if (allowRequest(req, bucket, id)) return null;
  return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": retryAfterSeconds(bucket) } });
}

/**
 * Origen público para armar links, QRs y redirecciones. En producción es SIEMPRE NEXT_PUBLIC_APP_URL: el header
 * Host lo controla quien manda el pedido (un QR cacheado con otro dominio terminaría en los mails de las entradas).
 * Devuelve null si falta en producción: cada ruta responde "no configurado".
 */
export function publicOrigin(req: NextRequest): string | null {
  const fixed = process.env.NEXT_PUBLIC_APP_URL;
  if (fixed) {
    try {
      return new URL(fixed).origin;
    } catch {
      return null;
    }
  }
  return process.env.NODE_ENV === "production" ? null : req.nextUrl.origin;
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
