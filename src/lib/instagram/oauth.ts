/**
 * Helpers PUROS del OAuth de Instagram (sin red, testeables): `state` firmado
 * contra CSRF, parseo del `signed_request` de Meta (borrado de datos) y
 * normalización de las respuestas de la Graph API.
 *
 * Solo servidor (usa node:crypto). Ver src/lib/instagram/server.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type InstagramMode = "login" | "link";

export interface OAuthState {
  /** login = entrar/crear cuenta con Instagram · link = conectar a la cuenta ya iniciada */
  mode: InstagramMode;
  /** Usuario de Supabase que conecta (solo en link). */
  userId: string | null;
  /** Debe coincidir con la cookie httpOnly del navegador que empezó el flujo. */
  nonce: string;
  /** Ruta interna a la que se vuelve. */
  next: string | null;
  /** Vencimiento (ms epoch). */
  exp: number;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest();

export const newNonce = () => randomBytes(18).toString("base64url");

export function signState(state: OAuthState, secret: string): string {
  const payload = b64url(JSON.stringify(state));
  return `${payload}.${b64url(sign(payload, secret))}`;
}

/** Devuelve el state si la firma es válida, no venció y el nonce coincide con la cookie. */
export function verifyState(raw: string | null | undefined, secret: string, cookieNonce: string | null | undefined, now = Date.now()): OAuthState | null {
  if (!raw || !cookieNonce) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const st = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (st.exp < now || st.nonce !== cookieNonce || (st.mode !== "login" && st.mode !== "link")) return null;
    if (st.mode === "link" && !st.userId) return null;
    return st;
  } catch {
    return null;
  }
}

/**
 * `signed_request` de Meta (callbacks de desautorización y de borrado de datos):
 * "<firma base64url>.<payload base64url>", firma = HMAC-SHA256(payload, app secret).
 */
export function parseSignedRequest(raw: string | null | undefined, secret: string): { user_id: string; algorithm?: string } | null {
  if (!raw) return null;
  const [sig, payload] = raw.split(".");
  if (!sig || !payload) return null;
  const expected = sign(payload, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number; algorithm?: string };
    if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return data.user_id != null ? { user_id: String(data.user_id), algorithm: data.algorithm } : null;
  } catch {
    return null;
  }
}

/** El intercambio de código puede responder `{access_token, user_id}` o `{data: [{...}]}` según la versión. */
export function parseTokenResponse(json: unknown): { access_token: string; user_id: string } | null {
  const j = json as { access_token?: string; user_id?: string | number; data?: { access_token?: string; user_id?: string | number }[] };
  const row = j?.access_token ? j : j?.data?.[0];
  return row?.access_token && row.user_id != null ? { access_token: row.access_token, user_id: String(row.user_id) } : null;
}

export interface IgMediaRaw {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  children?: { data?: { id?: string; media_type?: string; media_url?: string }[] };
}

/** Fotos importables: imágenes sueltas y la primera imagen de cada carrusel (los videos no). */
export function importablePhotos(items: IgMediaRaw[]): { id: string; url: string; permalink: string | null }[] {
  const out: { id: string; url: string; permalink: string | null }[] = [];
  for (const m of items) {
    if (m.media_type === "IMAGE" && m.media_url) out.push({ id: m.id, url: m.media_url, permalink: m.permalink ?? null });
    else if (m.media_type === "CAROUSEL_ALBUM") {
      const img = m.children?.data?.find((c) => c.media_type === "IMAGE" && c.media_url);
      if (img?.media_url) out.push({ id: m.id, url: img.media_url, permalink: m.permalink ?? null });
    }
  }
  return out;
}

/** Solo se descargan imágenes de los CDNs de Meta (evita usar la API como proxy abierto). */
export function isAllowedMediaHost(url: string, hosts: string[]): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return false;
    return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Ruta interna segura para volver después del OAuth. */
export const safeInternalPath = (n: string | null | undefined): string | null => (n && n.startsWith("/") && !n.startsWith("//") ? n : null);
