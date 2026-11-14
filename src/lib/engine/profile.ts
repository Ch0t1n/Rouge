/**
 * Reglas puras del Perfil Persistente: validaciones, Spotify y privacidad.
 * Las usan el motor (upsertProfile), el onboarding y los tests.
 * Contraparte SQL: checks de la tabla `profiles` en supabase/schema.sql.
 */
import { MUSIC_GENRES, type Gender, type MusicGenre, type Profile, type RougeState, type UUID } from "@/lib/types";
import { ageFrom } from "@/lib/utils";

export const MIN_AGE = 18;
export const MAX_PHOTOS = 4;
export const MAX_GENRES = 5;
export const BIO_MAX = 160;
export const NAME_MAX = 60;
export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Mujer" },
  { value: "male", label: "Hombre" },
  { value: "non_binary", label: "No binarie" },
  { value: "undisclosed", label: "Prefiero no decir" },
];

/** Normaliza lo que tipea el usuario: sin @, minúsculas, sin espacios ni acentos. */
export function cleanUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export type UsernameCheck = { ok: true; value: string } | { ok: false; error: string };

export function checkUsername(state: RougeState, raw: string, selfId: UUID): UsernameCheck {
  const value = cleanUsername(raw);
  if (value.length < 3) return { ok: false, error: "Mínimo 3 caracteres." };
  if (value.length > 20) return { ok: false, error: "Máximo 20 caracteres." };
  if (!USERNAME_RE.test(value)) return { ok: false, error: "Solo letras, números, punto y guion bajo." };
  if (/^[._]|[._]$/.test(value)) return { ok: false, error: "No puede empezar ni terminar con punto o guion bajo." };
  if (state.profiles.some((p) => p.id !== selfId && p.username === value)) return { ok: false, error: "Ese @username ya está en uso." };
  return { ok: true, value };
}

export function checkBirthDate(birthDate: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) return "Fecha de nacimiento inválida.";
  const age = ageFrom(birthDate, now);
  if (age < MIN_AGE) return `ROUGE es solo para mayores de ${MIN_AGE} años.`;
  if (age > 99) return "Revisá la fecha de nacimiento.";
  return null;
}

export function checkGenres(genres: MusicGenre[]): string | null {
  if (genres.some((g) => !MUSIC_GENRES.includes(g))) return "Género musical inválido.";
  if (genres.length > MAX_GENRES) return `Elegí hasta ${MAX_GENRES} géneros.`;
  return null;
}

// ── Spotify ──────────────────────────────────────────────────────────

const SPOTIFY_KINDS = ["track", "album", "playlist", "episode", "artist", "show"] as const;
export type SpotifyKind = (typeof SPOTIFY_KINDS)[number];

export interface SpotifyRef {
  kind: SpotifyKind;
  id: string;
  embedUrl: string;
  /** Alto recomendado del iframe compacto */
  height: number;
}

const EMBED_RE = /^https:\/\/open\.spotify\.com\/embed\/(track|album|playlist|episode|artist|show)\/([A-Za-z0-9]{10,32})/;

/**
 * Acepta cualquier forma en que el usuario comparte desde Spotify:
 *   https://open.spotify.com/track/ID?si=…
 *   https://open.spotify.com/intl-es/track/ID
 *   https://open.spotify.com/embed/playlist/ID
 *   spotify:track:ID
 * Devuelve la URL de embed normalizada (sin tracking) o null.
 */
export function parseSpotify(raw: string | null | undefined): SpotifyRef | null {
  if (!raw) return null;
  const s = raw.trim();
  let kind: string | undefined;
  let id: string | undefined;

  const uri = s.match(/^spotify:(track|album|playlist|episode|artist|show):([A-Za-z0-9]{10,32})$/);
  if (uri) [, kind, id] = uri;
  else {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      return null;
    }
    if (url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean).filter((p) => !/^intl-[a-z]{2}(-[a-z]{2})?$/i.test(p) && p !== "embed");
    const i = parts.findIndex((p) => (SPOTIFY_KINDS as readonly string[]).includes(p));
    if (i < 0) return null;
    kind = parts[i];
    id = parts[i + 1];
  }
  if (!kind || !id || !/^[A-Za-z0-9]{10,32}$/.test(id)) return null;
  const k = kind as SpotifyKind;
  return {
    kind: k,
    id,
    embedUrl: `https://open.spotify.com/embed/${k}/${id}?utm_source=generator&theme=0`,
    height: k === "track" || k === "episode" ? 80 : 152,
  };
}

export const isSpotifyEmbedUrl = (u: string) => EMBED_RE.test(u);

// ── Privacidad ───────────────────────────────────────────────────────

/**
 * +5491150009999 → +54 9 •• ••••-9999. Protege la lista negra de miradas
 * ajenas ("shoulder surfing") en la pista; el dueño reconoce los 4 últimos.
 */
export function maskPhone(e164: string): string {
  if (/^\+549\d{10}$/.test(e164)) return `+54 9 •• ••••-${e164.slice(-4)}`;
  return `${e164.slice(0, 3)} ••• ${e164.slice(-4)}`;
}

/** Formato legible del teléfono propio: +5491122334455 → +54 9 11 2233-4455 */
export function formatPhone(e164: string): string {
  if (e164.startsWith("+54911") && e164.length === 14) return `+54 9 11 ${e164.slice(6, 10)}-${e164.slice(10)}`;
  if (e164.startsWith("+549") && e164.length === 14) return `+54 9 ${e164.slice(4, 7)} ${e164.slice(7, 10)}-${e164.slice(10)}`;
  return e164;
}

export interface BlockList {
  phones: { id: UUID; phone: string; masked: string; created_at: string }[];
  users: { id: UUID; profile: Profile; created_at: string }[];
}

/** Lista negra del usuario. Nunca revela si un teléfono bloqueado tiene cuenta. */
export function blockListOf(state: RougeState, userId: UUID): BlockList {
  const mine = state.user_blocks
    .filter((b) => b.blocker_id === userId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return {
    phones: mine
      .filter((b) => b.blocked_phone_normalized)
      .map((b) => ({ id: b.id, phone: b.blocked_phone_normalized!, masked: maskPhone(b.blocked_phone_normalized!), created_at: b.created_at })),
    users: mine
      .filter((b) => b.blocked_user_id)
      .map((b) => ({ id: b.id, profile: state.profiles.find((p) => p.id === b.blocked_user_id)!, created_at: b.created_at }))
      .filter((x) => !!x.profile),
  };
}

// ── Completitud (nudges de conversión) ───────────────────────────────

export interface CompletenessItem {
  key: "photos" | "bio" | "genres" | "spotify" | "video" | "phone";
  label: string;
  done: boolean;
  weight: number;
}

export function profileCompleteness(p: Profile): { percent: number; items: CompletenessItem[] } {
  const items: CompletenessItem[] = [
    { key: "photos", label: "Subí al menos 2 fotos", done: p.photos.length >= 2, weight: 30 },
    { key: "genres", label: "Elegí 2+ géneros musicales", done: p.music_genres.length >= 2, weight: 20 },
    { key: "bio", label: "Escribí una bio corta", done: p.bio.trim().length >= 10, weight: 15 },
    { key: "phone", label: "Verificá tu teléfono (privado)", done: !!p.phone_normalized, weight: 15 },
    { key: "spotify", label: "Sumá tu tema de Spotify", done: !!p.spotify_embed_url, weight: 10 },
    { key: "video", label: "Grabá tu loop de 5 seg", done: !!p.loop_video_url, weight: 10 },
  ];
  return { percent: items.reduce((a, i) => a + (i.done ? i.weight : 0), 0), items };
}
