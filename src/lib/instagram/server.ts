/**
 * Instagram (Instagram API with Instagram Login) — SOLO servidor.
 *
 * Variables de entorno (ver .env.example):
 *   INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET   app de Meta (producto "Instagram" → API with Instagram Login)
 *   SUPABASE_SERVICE_ROLE_KEY                 para guardar tokens y crear la sesión (nunca NEXT_PUBLIC)
 *   NEXT_PUBLIC_APP_URL                       dominio público (redirect_uri = <app>/api/instagram/callback)
 *   INSTAGRAM_TOKEN_KEY                       secreto largo para cifrar los tokens en la base (AES-256-GCM)
 * Opcionales (tests / mocks): INSTAGRAM_OAUTH_URL, INSTAGRAM_TOKEN_URL, INSTAGRAM_GRAPH_URL, INSTAGRAM_MEDIA_HOSTS,
 *   INSTAGRAM_PLACEHOLDER_EMAIL_DOMAIN.
 *
 * Los tokens se guardan en public.instagram_accounts (RLS sin políticas: ningún cliente los lee).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/security/api";
import { importablePhotos, isAllowedMediaHost, isImportableImageType, openToken, parseTokenResponse, sealToken, type IgMediaRaw } from "./oauth";

export const IG_COOKIE = "rouge_ig_nonce";
export const IG_SCOPES = "instagram_business_basic";

export function igConfig() {
  return {
    appId: process.env.INSTAGRAM_APP_ID ?? "",
    appSecret: process.env.INSTAGRAM_APP_SECRET ?? "",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    oauthUrl: process.env.INSTAGRAM_OAUTH_URL ?? "https://www.instagram.com/oauth/authorize",
    tokenUrl: process.env.INSTAGRAM_TOKEN_URL ?? "https://api.instagram.com/oauth/access_token",
    graphUrl: (process.env.INSTAGRAM_GRAPH_URL ?? "https://graph.instagram.com").replace(/\/$/, ""),
    mediaHosts: (process.env.INSTAGRAM_MEDIA_HOSTS ?? "cdninstagram.com,fbcdn.net").split(",").map((h) => h.trim()).filter(Boolean),
    emailDomain: process.env.INSTAGRAM_PLACEHOLDER_EMAIL_DOMAIN ?? "instagram.rouge.invalid",
    tokenKey: process.env.INSTAGRAM_TOKEN_KEY || undefined,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  };
}

const isProd = () => process.env.NODE_ENV === "production";

/** En producción exige además NEXT_PUBLIC_APP_URL: el origen nunca se arma con el header Host del request. */
export const igConfigured = () => {
  const c = igConfig();
  return !!(c.appId && c.appSecret && c.supabaseUrl && c.serviceKey && (c.appUrl || !isProd()));
};

/**
 * Origen público para redirect_uri y redirecciones. En producción es SIEMPRE NEXT_PUBLIC_APP_URL
 * (el Host del request lo controla quien manda el pedido: no sirve para armar links con tokens).
 */
export function siteOrigin(req: NextRequest): string {
  const origin = publicOrigin(req);
  if (!origin) throw new IgError("ig_not_configured", 503);
  return origin;
}

export const redirectUri = (req: NextRequest) => `${siteOrigin(req)}/api/instagram/callback`;

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  const c = igConfig();
  if (!admin) admin = createClient(c.supabaseUrl, c.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** Usuario de Supabase a partir del `Authorization: Bearer <access_token>` del cliente. */
export async function userFromRequest(req: NextRequest): Promise<{ id: string; email: string | null } | null> {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await adminClient().auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export class IgError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

/** Tiempo máximo de cada llamada a Meta: una API lenta no deja colgada la función. */
const META_TIMEOUT_MS = 10_000;

async function igJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(META_TIMEOUT_MS) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (json as { error?: { code?: number; type?: string } }).error;
    // 190 = token inválido/revocado → hay que reconectar
    throw new IgError(code?.code === 190 || res.status === 401 ? "ig_token_invalid" : "ig_api_error", res.status === 401 ? 401 : 502);
  }
  return json;
}

/** code → token corto → token largo (60 días). */
export async function exchangeCode(code: string, redirect: string) {
  const c = igConfig();
  const body = new URLSearchParams({ client_id: c.appId, client_secret: c.appSecret, grant_type: "authorization_code", redirect_uri: redirect, code });
  const short = parseTokenResponse(await igJson(c.tokenUrl, { method: "POST", body }));
  if (!short) throw new IgError("ig_token_exchange");
  try {
    const long = (await igJson(`${c.graphUrl}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(c.appSecret)}&access_token=${encodeURIComponent(short.access_token)}`)) as { access_token?: string; expires_in?: number };
    if (long.access_token) return { token: long.access_token, expiresAt: new Date(Date.now() + (long.expires_in ?? 5_184_000) * 1000).toISOString(), igUserId: short.user_id };
  } catch {
    /* si falla el canje, seguimos con el token corto (1 h) */
  }
  return { token: short.access_token, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), igUserId: short.user_id };
}

export async function fetchMe(token: string) {
  const c = igConfig();
  const me = (await igJson(`${c.graphUrl}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(token)}`)) as { user_id?: string | number; id?: string; username?: string; account_type?: string };
  if (!me.username) throw new IgError("ig_profile");
  return { igUserId: String(me.user_id ?? me.id ?? ""), username: me.username.toLowerCase(), accountType: me.account_type ?? null };
}

/** Token guardado del usuario (lo renueva si vence en menos de 7 días). */
export async function tokenFor(userId: string): Promise<string> {
  const db = adminClient();
  const { data } = await db.from("instagram_accounts").select("access_token, token_expires_at").eq("user_id", userId).maybeSingle();
  if (!data) throw new IgError("ig_not_connected", 404);
  const c = igConfig();
  const token = openToken(data.access_token, c.tokenKey);
  if (!token) throw new IgError("ig_token_invalid", 401); // cifrado con otra clave: hay que reconectar
  const exp = data.token_expires_at ? +new Date(data.token_expires_at) : 0;
  if (exp && exp < Date.now()) throw new IgError("ig_token_invalid", 401);
  if (exp && exp - Date.now() < 7 * 86_400_000) {
    try {
      const r = (await igJson(`${c.graphUrl}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)) as { access_token?: string; expires_in?: number };
      if (r.access_token) {
        await db.from("instagram_accounts").update({ access_token: sealToken(r.access_token, c.tokenKey), token_expires_at: new Date(Date.now() + (r.expires_in ?? 5_184_000) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId);
        return r.access_token;
      }
    } catch {
      /* usa el actual mientras siga vigente */
    }
  }
  return token;
}

export async function listPhotos(token: string) {
  const c = igConfig();
  const fields = "id,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url}";
  const res = (await igJson(`${c.graphUrl}/me/media?fields=${encodeURIComponent(fields)}&limit=40&access_token=${encodeURIComponent(token)}`)) as { data?: IgMediaRaw[] };
  return importablePhotos(res.data ?? []).slice(0, 30);
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * Bytes de una foto propia (por id de media) para recomprimirla y subirla a nuestro Storage.
 * Anti-SSRF: solo hosts de Meta, también en cada redirección; solo tipos de imagen conocidos; tamaño acotado.
 */
export async function downloadPhoto(token: string, mediaId: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  if (!/^[0-9A-Za-z_]{1,64}$/.test(mediaId)) throw new IgError("ig_bad_media");
  const c = igConfig();
  const m = (await igJson(`${c.graphUrl}/${mediaId}?fields=${encodeURIComponent("id,media_type,media_url,children{media_type,media_url}")}&access_token=${encodeURIComponent(token)}`)) as IgMediaRaw;
  const photo = importablePhotos([m])[0];
  let url = photo?.url;
  let res: Response | null = null;
  for (let hop = 0; hop < 3 && url; hop++) {
    if (!isAllowedMediaHost(url, c.mediaHosts)) throw new IgError("ig_bad_media");
    res = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(META_TIMEOUT_MS) });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) break;
    url = new URL(loc, url).toString();
    res = null;
  }
  if (!res || !res.ok) throw new IgError("ig_bad_media", 502);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!isImportableImageType(type)) throw new IgError("ig_bad_media", 502);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) throw new IgError("ig_bad_media", 413);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new IgError("ig_bad_media", 413);
  return { bytes, type };
}

/** Guarda la conexión y refleja el @ en el perfil (el trigger profile_instagram marca "verificado"). */
export async function saveConnection(userId: string, ig: { igUserId: string; username: string; accountType: string | null; token: string; expiresAt: string }) {
  const db = adminClient();
  const { data: owner } = await db.from("instagram_accounts").select("user_id").eq("ig_user_id", ig.igUserId).maybeSingle();
  if (owner && owner.user_id !== userId) throw new IgError("ig_taken", 409);
  const { error } = await db.from("instagram_accounts").upsert(
    { user_id: userId, ig_user_id: ig.igUserId, username: ig.username, account_type: ig.accountType, access_token: sealToken(ig.token, igConfig().tokenKey), token_expires_at: ig.expiresAt, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new IgError("ig_save", 500);
  await db.from("profiles").update({ instagram_username: ig.username }).eq("id", userId);
}

export async function removeConnection(where: { userId?: string; igUserId?: string }) {
  const db = adminClient();
  let q = db.from("instagram_accounts").delete();
  q = where.userId ? q.eq("user_id", where.userId) : q.eq("ig_user_id", where.igUserId!);
  const { data } = await q.select("user_id");
  for (const r of (data as { user_id: string }[] | null) ?? []) await db.from("profiles").update({ instagram_username: null }).eq("id", r.user_id);
  return (data as unknown[] | null)?.length ?? 0;
}

/**
 * Login con Instagram: busca la cuenta de ROUGE vinculada a ese Instagram o crea una nueva
 * (email interno no entregable), y devuelve un token de magic link para abrir la sesión en el navegador.
 */
export async function sessionForInstagram(ig: { igUserId: string; username: string }): Promise<{ userId: string; tokenHash: string }> {
  const db = adminClient();
  const c = igConfig();
  const { data: linked } = await db.from("instagram_accounts").select("user_id").eq("ig_user_id", ig.igUserId).maybeSingle();
  let email: string | null = null;
  if (linked) {
    const { data } = await db.auth.admin.getUserById(linked.user_id);
    email = data.user?.email ?? null;
  }
  if (!email) {
    email = `ig-${ig.igUserId}@${c.emailDomain}`;
    // Si ya existe (login anterior) el alta falla y seguimos: generateLink devuelve el usuario igual.
    await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { provider: "instagram", instagram_username: ig.username } });
  }
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token || !data.user) throw new IgError("ig_session", 500);
  return { userId: data.user.id, tokenHash: data.properties.hashed_token };
}
