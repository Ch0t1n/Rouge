/**
 * Login social y conexión con Instagram desde el navegador.
 *
 *  - Google: proveedor nativo de Supabase Auth (signInWithOAuth). Se habilita con NEXT_PUBLIC_AUTH_GOOGLE=1
 *    una vez configurado en Supabase → Authentication → Providers → Google.
 *  - Instagram: OAuth propio en /api/instagram/* (Supabase no lo trae). Se habilita con NEXT_PUBLIC_AUTH_INSTAGRAM=1
 *    cuando el servidor tiene INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / SUPABASE_SERVICE_ROLE_KEY.
 *  - Modo Demo: ambos botones se ven y se simulan (sin salir de la app).
 */
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export const SOCIAL = {
  google: !isSupabaseConfigured || process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1",
  instagram: !isSupabaseConfigured || process.env.NEXT_PUBLIC_AUTH_INSTAGRAM === "1",
};

/** Mensajes para ?ig_error=<código> (vuelta del OAuth). */
export const IG_ERRORS: Record<string, string> = {
  ig_denied: "Cancelaste el acceso a Instagram.",
  ig_state: "El link de Instagram venció. Probá de nuevo.",
  ig_oauth: "Instagram no pudo completar el ingreso. Probá de nuevo.",
  ig_token_exchange: "Instagram no pudo completar el ingreso. Probá de nuevo.",
  ig_profile: "No pudimos leer tu perfil de Instagram.",
  ig_taken: "Esa cuenta de Instagram ya está conectada a otro perfil de ROUGE.",
  ig_session: "No pudimos abrir tu sesión. Probá de nuevo.",
  ig_save: "No pudimos guardar la conexión. Probá de nuevo.",
  ig_not_configured: "El ingreso con Instagram todavía no está habilitado.",
  ig_not_connected: "Conectá tu Instagram primero.",
  ig_token_invalid: "Tu conexión con Instagram venció. Volvé a conectarla.",
  ig_api_error: "Instagram no respondió. Probá en un rato.",
  ig_bad_media: "No pudimos traer esa foto.",
  rate_limited: "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.",
  not_authenticated: "Tu sesión expiró. Volvé a ingresar.",
};

export const igErrorMessage = (code: string | null | undefined) => (code ? (IG_ERRORS[code] ?? IG_ERRORS.ig_oauth) : null);

async function bearer(): Promise<Record<string, string>> {
  const sb = getSupabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function failCode(res: Response) {
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return j.error ?? "ig_api_error";
}

/** Google (Supabase Auth). Vuelve a /login, que redirige según el rol. */
export async function signInWithGoogle(opts: { next?: string | null; as?: string }): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const back = `/login?as=${opts.as ?? "attendee"}${opts.next ? `&next=${encodeURIComponent(opts.next)}` : ""}`;
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${back}`, queryParams: { prompt: "select_account" } } });
  return error ? "No pudimos abrir Google. Probá de nuevo." : null;
}

/** Instagram: "login" (entrar/crear cuenta) o "link" (conectar a mi cuenta). Navega a Instagram; devuelve un error si falla. */
export async function startInstagram(mode: "login" | "link", next?: string | null): Promise<string | null> {
  const res = await fetch("/api/instagram/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(mode === "link" ? await bearer() : {}) },
    body: JSON.stringify({ mode, next }),
  });
  if (!res.ok) return igErrorMessage(await failCode(res));
  const { url } = (await res.json()) as { url: string };
  window.location.assign(url);
  return null;
}

export interface IgPhoto {
  id: string;
  url: string;
  permalink: string | null;
}

/** Feed simulado del Modo Demo. */
const DEMO_FEED: IgPhoto[] = Array.from({ length: 9 }, (_, i) => ({ id: `demo-${i + 1}`, url: `/demo/instagram/post-${i + 1}.webp`, permalink: null }));

export async function fetchInstagramPhotos(): Promise<{ items: IgPhoto[] } | { error: string }> {
  if (!isSupabaseConfigured) return { items: DEMO_FEED };
  const res = await fetch("/api/instagram/media", { headers: await bearer(), cache: "no-store" });
  if (!res.ok) return { error: igErrorMessage(await failCode(res))! };
  return (await res.json()) as { items: IgPhoto[] };
}

/** Descarga una foto propia como File (mismo origen) para pasarla por compressImage → uploadMedia. */
export async function importInstagramPhoto(photo: IgPhoto): Promise<File> {
  const res = isSupabaseConfigured
    ? await fetch("/api/instagram/media", { method: "POST", headers: { "Content-Type": "application/json", ...(await bearer()) }, body: JSON.stringify({ id: photo.id }) })
    : await fetch(photo.url);
  if (!res.ok) throw new Error(igErrorMessage(await failCode(res)) ?? "No pudimos traer esa foto.");
  const blob = await res.blob();
  return new File([blob], `instagram-${photo.id}.${blob.type.split("/")[1] ?? "jpg"}`, { type: blob.type || "image/jpeg" });
}

/** Supabase: borra el token en el servidor. (El estado local lo actualiza el comando unlinkInstagram.) */
export async function disconnectInstagramRemote(): Promise<void> {
  const res = await fetch("/api/instagram", { method: "DELETE", headers: await bearer() });
  if (!res.ok) throw new Error(await failCode(res)); // friendlyError traduce los ig_* (ver errors.ts)
}
