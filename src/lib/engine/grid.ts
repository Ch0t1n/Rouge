/**
 * Grilla del lobby: asistentes visibles + afinidad + estado de conexión + filtros.
 * Orden: rank del algoritmo de afinidad (música 60% · mood 25% · actividad 15%).
 */
import type { EventAttendee, MoodTag, MusicGenre, Profile, RougeState, UUID } from "@/lib/types";
import { computeAffinity, type AffinityResult } from "./affinity";
import { connectionStateFor, getAttendee, getProfile, visibleAttendees, type ConnectionState } from "./selectors";

export interface GridFilters {
  genres: MusicGenre[];
  moods: MoodTag[];
  /** "Coincidieron en tu misma zona del plano" (sectores visitados en común) */
  sameZone: boolean;
  /** Búsqueda por nombre o @username (vista de escritorio). */
  query?: string;
}

export const EMPTY_FILTERS: GridFilters = { genres: [], moods: [], sameZone: false, query: "" };

/** Normaliza para buscar sin tildes ni mayúsculas ("Sofía" ⇔ "sofia"). */
const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export interface GridCardData {
  profile: Profile;
  attendee: EventAttendee;
  affinity: AffinityResult;
  connection: ConnectionState;
  sharedZones: string[];
}

export function lobbyGrid(state: RougeState, eventId: UUID, viewerId: UUID, filters: GridFilters = EMPTY_FILTERS, now = Date.now()): GridCardData[] {
  const viewer = getProfile(state, viewerId);
  if (!viewer) return [];
  const mine = getAttendee(state, eventId, viewerId);
  const myZones = new Set(mine?.visited_sectors ?? []);

  return visibleAttendees(state, eventId, viewerId)
    .map(({ profile, attendee }) => ({
      profile,
      attendee,
      affinity: computeAffinity(viewer, mine, profile, attendee, now),
      connection: connectionStateFor(state, eventId, viewerId, profile.id),
      sharedZones: attendee.visited_sectors.filter((z) => myZones.has(z)),
    }))
    .filter((c) => c.connection !== "rejected")
    .filter((c) => !filters.genres.length || c.profile.music_genres.some((g) => filters.genres.includes(g)))
    .filter((c) => !filters.moods.length || (c.attendee.mood_tag !== null && filters.moods.includes(c.attendee.mood_tag)))
    .filter((c) => !filters.sameZone || c.sharedZones.length > 0)
    .filter((c) => {
      const q = fold(filters.query ?? "").replace(/^@/, "");
      return !q || fold(c.profile.full_name).includes(q) || c.profile.username.includes(q);
    })
    .sort((a, b) => b.affinity.rank - a.affinity.rank);
}

export const activeFilterCount = (f: GridFilters) => f.genres.length + f.moods.length + (f.sameZone ? 1 : 0) + (f.query?.trim() ? 1 : 0);
