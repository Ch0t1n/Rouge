/**
 * Helpers PUROS del OAuth de Instagram (sin red, testeables): `state` firmado
 * contra CSRF, parseo del `signed_request` de Meta (borrado de datos) y
 * normalización de las respuestas de la Graph API.
 *
 * Solo servidor (usa node:crypto). Ver src/lib/instagram/server.ts.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export { safeInternalPath } from "@/lib/security/paths";

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

/**
 * Cifrado de los tokens de Instagram en la base (AES-256-GCM, clave = SHA-256 de INSTAGRAM_TOKEN_KEY).
 * Si alguien obtiene un volcado de `instagram_accounts`, los tokens no sirven sin la clave del servidor.
 * Formato: "v1:<iv>.<tag>.<cifrado>" (base64url). Sin clave configurada se guarda en claro (compatibilidad).
 */
const TOKEN_PREFIX = "v1:";
const tokenKey = (secret: string) => createHash("sha256").update(secret, "utf8").digest();

export function sealToken(token: string, secret: string | undefined): string {
  if (!secret) return token;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tokenKey(secret), iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return `${TOKEN_PREFIX}${b64url(iv)}.${b64url(c.getAuthTag())}.${b64url(enc)}`;
}

/** Devuelve el token en claro, o null si está cifrado y la clave no coincide (hay que reconectar). */
export function openToken(stored: string, secret: string | undefined): string | null {
  if (!stored.startsWith(TOKEN_PREFIX)) return stored; // token viejo guardado en claro
  if (!secret) return null;
  const [iv, tag, enc] = stored.slice(TOKEN_PREFIX.length).split(".");
  if (!iv || !tag || !enc) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", tokenKey(secret), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Tipos de imagen que aceptamos de los CDNs de Meta (nunca SVG ni HTML). */
export const IMPORTABLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const isImportableImageType = (ct: string | null | undefined) => !!ct && IMPORTABLE_IMAGE_TYPES.includes(ct.split(";")[0].trim().toLowerCase());
