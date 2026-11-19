/**
 * Algoritmo de Afinidad de ROUGE.
 *
 *   rank = 0.60 · gustos  +  0.25 · mood  +  0.15 · actividad reciente
 *
 * - gustos: coeficiente de Dice (2·|A∩B| / (|A|+|B|)) sobre los géneros musicales en una fiesta y sobre
 *   las áreas e intereses profesionales en un evento corporativo. Es el número del badge "% afinidad".
 * - mood: matriz de compatibilidad entre los moods del check-in.
 * - actividad: decae linealmente durante 90 min desde la última actividad.
 *
 * Los pesos están centralizados para poder hacer A/B testing desde el admin.
 */
import type { EventAttendee, EventType, MoodTag, Profile } from "@/lib/types";

export const AFFINITY_WEIGHTS = { tags: 0.6, mood: 0.25, activity: 0.15 } as const;
const ACTIVITY_WINDOW_MS = 90 * 60_000;

/** Lo que se compara para la afinidad según el tipo de evento. */
export const affinityTags = (p: Profile, type: EventType = "nightlife"): readonly string[] => (type === "corporate" ? p.interests : p.music_genres);

function dice(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const common = a.filter((g) => setB.has(g)).length;
  return (2 * common) / (a.length + b.length);
}

export const musicAffinity = (a: Profile, b: Profile): number => dice(a.music_genres, b.music_genres);

/** Compatibilidad 0-1 entre moods (simétrica). Moods de tipos distintos: 0.3. */
const MOOD_MATRIX: Partial<Record<MoodTag, Partial<Record<MoodTag, number>>>> = {
  // Noche
  open_to_meet: { open_to_meet: 1, at_bar: 0.85, after_hunt: 0.8, lost_group: 0.6, just_dance: 0.5, with_friends: 0.55 },
  at_bar: { at_bar: 0.8, after_hunt: 0.6, with_friends: 0.5, just_dance: 0.4, lost_group: 0.5 },
  after_hunt: { after_hunt: 1, with_friends: 0.6, just_dance: 0.5, lost_group: 0.4 },
  with_friends: { with_friends: 0.7, just_dance: 0.6, lost_group: 0.5 },
  just_dance: { just_dance: 0.8, lost_group: 0.4 },
  lost_group: { lost_group: 0.7 },
  // Corporativo
  networking: { networking: 1, open_to_chat: 0.9, business: 0.85, other_areas: 0.8, hiring: 0.8, with_team: 0.5 },
  business: { business: 0.7, open_to_chat: 0.75, other_areas: 0.5, hiring: 0.5, with_team: 0.4 },
  other_areas: { other_areas: 0.9, open_to_chat: 0.85, hiring: 0.6, with_team: 0.55 },
  hiring: { hiring: 0.5, open_to_chat: 0.8, with_team: 0.45 },
  open_to_chat: { open_to_chat: 0.9, with_team: 0.6 },
  with_team: { with_team: 0.6 },
};

export function moodAffinity(a: MoodTag | null, b: MoodTag | null): number {
  if (!a || !b) return 0.4;
  return MOOD_MATRIX[a]?.[b] ?? MOOD_MATRIX[b]?.[a] ?? 0.3;
}

export function activityScore(lastActiveAt: string, now = Date.now()): number {
  const elapsed = now - new Date(lastActiveAt).getTime();
  return Math.max(0, 1 - elapsed / ACTIVITY_WINDOW_MS);
}

export interface AffinityResult {
  /** 0-100, para el badge de la tarjeta */
  percent: number;
  /** 0-1, para ordenar la grilla */
  rank: number;
  /** Géneros (fiesta) o áreas e intereses (corporativo) en común */
  shared: string[];
}

export function computeAffinity(
  viewer: Profile,
  viewerAttendee: EventAttendee | undefined,
  other: Profile,
  otherAttendee: EventAttendee,
  now = Date.now(),
  type: EventType = "nightlife",
): AffinityResult {
  const mine = affinityTags(viewer, type);
  const theirs = affinityTags(other, type);
  const tags = dice(mine, theirs);
  const mood = moodAffinity(viewerAttendee?.mood_tag ?? null, otherAttendee.mood_tag);
  const activity = activityScore(otherAttendee.last_active_at, now);
  const setB = new Set(theirs);
  return {
    percent: Math.round(tags * 100),
    rank: AFFINITY_WEIGHTS.tags * tags + AFFINITY_WEIGHTS.mood * mood + AFFINITY_WEIGHTS.activity * activity,
    shared: mine.filter((g) => setB.has(g)),
  };
}
