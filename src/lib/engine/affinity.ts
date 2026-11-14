/**
 * Algoritmo de Afinidad de ROUGE.
 *
 *   rank = 0.60 · música  +  0.25 · mood  +  0.15 · actividad reciente
 *
 * - música: coeficiente de Dice sobre géneros (2·|A∩B| / (|A|+|B|)).
 *   Es el número que se muestra en el badge "% afinidad musical".
 * - mood: matriz de compatibilidad entre los "Mood de la noche".
 * - actividad: decae linealmente durante 90 min desde la última actividad.
 *
 * Los pesos están centralizados para poder hacer A/B testing desde el admin.
 */
import type { EventAttendee, MoodTag, Profile } from "@/lib/types";

export const AFFINITY_WEIGHTS = { music: 0.6, mood: 0.25, activity: 0.15 } as const;
const ACTIVITY_WINDOW_MS = 90 * 60_000;

export function musicAffinity(a: Profile, b: Profile): number {
  if (!a.music_genres.length || !b.music_genres.length) return 0;
  const setB = new Set(b.music_genres);
  const common = a.music_genres.filter((g) => setB.has(g)).length;
  return (2 * common) / (a.music_genres.length + b.music_genres.length);
}

/** Compatibilidad 0-1 entre moods (simétrica). */
const MOOD_MATRIX: Record<MoodTag, Partial<Record<MoodTag, number>>> = {
  open_to_meet: { open_to_meet: 1, at_bar: 0.85, after_hunt: 0.8, lost_group: 0.6, just_dance: 0.5, with_friends: 0.55 },
  at_bar: { at_bar: 0.8, after_hunt: 0.6, with_friends: 0.5, just_dance: 0.4, lost_group: 0.5 },
  after_hunt: { after_hunt: 1, with_friends: 0.6, just_dance: 0.5, lost_group: 0.4 },
  with_friends: { with_friends: 0.7, just_dance: 0.6, lost_group: 0.5 },
  just_dance: { just_dance: 0.8, lost_group: 0.4 },
  lost_group: { lost_group: 0.7 },
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
  musicPercent: number;
  /** 0-1, para ordenar la grilla */
  rank: number;
  sharedGenres: string[];
}

export function computeAffinity(
  viewer: Profile,
  viewerAttendee: EventAttendee | undefined,
  other: Profile,
  otherAttendee: EventAttendee,
  now = Date.now(),
): AffinityResult {
  const music = musicAffinity(viewer, other);
  const mood = moodAffinity(viewerAttendee?.mood_tag ?? null, otherAttendee.mood_tag);
  const activity = activityScore(otherAttendee.last_active_at, now);
  const setB = new Set(other.music_genres);
  return {
    musicPercent: Math.round(music * 100),
    rank: AFFINITY_WEIGHTS.music * music + AFFINITY_WEIGHTS.mood * mood + AFFINITY_WEIGHTS.activity * activity,
    sharedGenres: viewer.music_genres.filter((g) => setB.has(g)),
  };
}
