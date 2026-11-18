/**
 * Algoritmo de Afinidad de ROUGE.
 *
 *   rank = 0.60 · afinidad  +  0.25 · mood  +  0.15 · actividad reciente
 *
 * - afinidad (según la vertical del evento, ver verticals.ts):
 *     · noche: coeficiente de Dice sobre géneros musicales (2·|A∩B| / (|A|+|B|)) → badge "% 🎵".
 *     · corporativo: complementariedad "busco ↔ ofrezco" + rubro en común (businessAffinity) → badge "% 🤝".
 * - mood: matriz de compatibilidad entre moods (de la misma vertical).
 * - actividad: decae linealmente durante 90 min desde la última actividad.
 *
 * Los pesos están centralizados para poder hacer A/B testing desde el admin.
 */
import type { EventAttendee, EventKind, MoodTag, Profile, ProfilePersona } from "@/lib/types";
import { businessAffinity, needLabel } from "./verticals";

export const AFFINITY_WEIGHTS = { music: 0.6, mood: 0.25, activity: 0.15 } as const;
const ACTIVITY_WINDOW_MS = 90 * 60_000;

export function musicAffinity(a: Pick<Profile, "music_genres">, b: Pick<Profile, "music_genres">): number {
  if (!a.music_genres.length || !b.music_genres.length) return 0;
  const setB = new Set(b.music_genres);
  const common = a.music_genres.filter((g) => setB.has(g)).length;
  return (2 * common) / (a.music_genres.length + b.music_genres.length);
}

/** Compatibilidad 0-1 entre moods (simétrica). Moods de verticales distintas no se cruzan nunca. */
const MOOD_MATRIX: Partial<Record<MoodTag, Partial<Record<MoodTag, number>>>> = {
  open_to_meet: { open_to_meet: 1, at_bar: 0.85, after_hunt: 0.8, lost_group: 0.6, just_dance: 0.5, with_friends: 0.55 },
  at_bar: { at_bar: 0.8, after_hunt: 0.6, with_friends: 0.5, just_dance: 0.4, lost_group: 0.5 },
  after_hunt: { after_hunt: 1, with_friends: 0.6, just_dance: 0.5, lost_group: 0.4 },
  with_friends: { with_friends: 0.7, just_dance: 0.6, lost_group: 0.5 },
  just_dance: { just_dance: 0.8, lost_group: 0.4 },
  lost_group: { lost_group: 0.7 },
  // Corporativo: quien vende con quien compra, socios con socios, inversión con networking.
  pro_selling: { pro_buying: 1, pro_networking: 0.7, pro_partners: 0.6, pro_coffee: 0.6, pro_selling: 0.3, pro_learning: 0.4, pro_funding: 0.3, pro_hiring: 0.3 },
  pro_buying: { pro_networking: 0.7, pro_coffee: 0.6, pro_partners: 0.5, pro_buying: 0.3, pro_learning: 0.4, pro_funding: 0.3, pro_hiring: 0.3 },
  pro_partners: { pro_partners: 1, pro_networking: 0.8, pro_funding: 0.6, pro_coffee: 0.6, pro_learning: 0.4, pro_hiring: 0.4 },
  pro_funding: { pro_networking: 0.8, pro_coffee: 0.6, pro_funding: 0.3, pro_learning: 0.4, pro_hiring: 0.3 },
  pro_hiring: { pro_networking: 0.7, pro_learning: 0.7, pro_coffee: 0.6, pro_hiring: 0.3 },
  pro_networking: { pro_networking: 0.9, pro_coffee: 0.8, pro_learning: 0.6 },
  pro_learning: { pro_learning: 0.7, pro_coffee: 0.6 },
  pro_coffee: { pro_coffee: 0.8 },
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
  kind: EventKind;
  /** 0-100, para el badge de la tarjeta (musical en la noche, de negocio en corporativo). */
  percent: number;
  /** 0-1, para ordenar la grilla */
  rank: number;
  /** Noche: géneros en común. Corporativo: lo que se cruza entre "busco" y "ofrezco". */
  highlights: string[];
  sharedGenres: string[];
}

/** Perfil (o cara) para la afinidad: en corporativo usa el perfil profesional (`persona`). */
type AffinityFace = Pick<Profile, "music_genres"> & { persona?: ProfilePersona | null };

export function computeAffinity(
  viewer: AffinityFace,
  viewerAttendee: EventAttendee | undefined,
  other: AffinityFace,
  otherAttendee: EventAttendee,
  now = Date.now(),
  kind: EventKind = "nightlife",
): AffinityResult {
  const mood = moodAffinity(viewerAttendee?.mood_tag ?? null, otherAttendee.mood_tag);
  const activity = activityScore(otherAttendee.last_active_at, now);
  let main: number;
  let highlights: string[];
  let sharedGenres: string[] = [];
  if (kind === "corporate") {
    const b = businessAffinity(viewer.persona, other.persona);
    main = b.score;
    highlights = b.matched.map(needLabel);
  } else {
    main = musicAffinity(viewer, other);
    const setB = new Set(other.music_genres);
    sharedGenres = viewer.music_genres.filter((g) => setB.has(g));
    highlights = sharedGenres;
  }
  return {
    kind,
    percent: Math.round(main * 100),
    rank: AFFINITY_WEIGHTS.music * main + AFFINITY_WEIGHTS.mood * mood + AFFINITY_WEIGHTS.activity * activity,
    highlights,
    sharedGenres,
  };
}
