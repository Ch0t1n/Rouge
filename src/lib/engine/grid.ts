/**
 * Grilla del lobby: asistentes visibles + afinidad + estado de conexión + filtros.
 * Orden: rank del algoritmo de afinidad (gustos 60% · mood 25% · actividad 15%). Los "gustos" son los géneros
 * musicales en una fiesta y las áreas e intereses en un evento corporativo (ver eventType.ts).
 */
import type { EventAttendee, MoodTag, Profile, RougeState, UUID } from "@/lib/types";
import { affinityTags, computeAffinity, type AffinityResult } from "./affinity";
import { eventTypeOf } from "./eventType";
import { connectionStateFor, getAttendee, getEvent, getProfile, visibleAttendees, type ConnectionState } from "./selectors";

export interface GridFilters {
  /** Géneros musicales (fiesta) o áreas e intereses (corporativo). */
  tags: string[];
  moods: MoodTag[];
  /** "Coincidieron en tu misma zona del plano" (sectores visitados en común) */
  sameZone: boolean;
}

export const EMPTY_FILTERS: GridFilters = { tags: [], moods: [], sameZone: false };

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
  const type = eventTypeOf(getEvent(state, eventId));

  return visibleAttendees(state, eventId, viewerId)
    .map(({ profile, attendee }) => ({
      profile,
      attendee,
      affinity: computeAffinity(viewer, mine, profile, attendee, now, type),
      connection: connectionStateFor(state, eventId, viewerId, profile.id),
      sharedZones: attendee.visited_sectors.filter((z) => myZones.has(z)),
    }))
    .filter((c) => c.connection !== "rejected")
    .filter((c) => !filters.tags.length || affinityTags(c.profile, type).some((g) => filters.tags.includes(g)))
    .filter((c) => !filters.moods.length || (c.attendee.mood_tag !== null && filters.moods.includes(c.attendee.mood_tag)))
    .filter((c) => !filters.sameZone || c.sharedZones.length > 0)
    .sort((a, b) => b.affinity.rank - a.affinity.rank);
}

export const activeFilterCount = (f: GridFilters) => f.tags.length + f.moods.length + (f.sameZone ? 1 : 0);
