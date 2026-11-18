/**
 * Selectores puros sobre RougeState.
 * Toda regla de visibilidad (bloqueos, ghost mode, privacidad de pines)
 * vive acá para que UI, tests y el futuro adaptador de Supabase
 * (donde se replica vía RLS) compartan la misma semántica.
 */
import type {
  Connection,
  EventAttendee,
  LineupSlot,
  MapPin,
  Profile,
  RougeEvent,
  RougeState,
  Squad,
  SquadMember,
  UUID,
  VenueSector,
} from "@/lib/types";
import { faceOf, type Face } from "./verticals";

// ── Lookups ──────────────────────────────────────────────────────────

export const getProfile = (s: RougeState, id: UUID | null | undefined) =>
  id ? s.profiles.find((p) => p.id === id) : undefined;

export const getEvent = (s: RougeState, id: UUID | null | undefined) =>
  id ? s.events.find((e) => e.id === id) : undefined;

export const getAttendee = (s: RougeState, eventId: UUID, userId: UUID) =>
  s.event_attendees.find((a) => a.event_id === eventId && a.user_id === userId);

export const currentUser = (s: RougeState) => getProfile(s, s.current_user_id);
export const activeEvent = (s: RougeState) => getEvent(s, s.active_event_id);

// ── Bloqueos: invisibilidad mutua ────────────────────────────────────

/**
 * true si A bloqueó a B o B bloqueó a A, ya sea por id de usuario
 * o por coincidencia de teléfono normalizado (lista negra preventiva).
 */
export function isBlockedBetween(s: RougeState, a: UUID, b: UUID): boolean {
  if (a === b) return false;
  const pa = getProfile(s, a);
  const pb = getProfile(s, b);
  return s.user_blocks.some((blk) => {
    if (blk.blocker_id === a) {
      return blk.blocked_user_id === b || (!!pb?.phone_normalized && blk.blocked_phone_normalized === pb.phone_normalized);
    }
    if (blk.blocker_id === b) {
      return blk.blocked_user_id === a || (!!pa?.phone_normalized && blk.blocked_phone_normalized === pa.phone_normalized);
    }
    return false;
  });
}

// ── Ciclo de vida del lobby (Efecto Cenicienta) ──────────────────────

export type LobbyPhase = "upcoming" | "open" | "live" | "afterglow" | "expired";

export function lobbyPhase(e: RougeEvent, now = Date.now()): LobbyPhase {
  const t = (iso: string) => new Date(iso).getTime();
  if (now < t(e.lobby_opens_at)) return "upcoming";
  if (now >= t(e.lobby_expires_at)) return "expired";
  if (now < t(e.starts_at)) return "open";
  if (now < t(e.ends_at)) return "live";
  return "afterglow";
}

/** La grilla, el plano y los squads solo funcionan con el lobby abierto. */
export const isLobbyInteractive = (e: RougeEvent, now = Date.now()) => {
  const p = lobbyPhase(e, now);
  return p === "open" || p === "live" || p === "afterglow";
};

export function lineupNow(e: RougeEvent, now = Date.now()): { current?: LineupSlot; next?: LineupSlot } {
  const slots = [...e.lineup_json].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const idx = slots.findIndex((sl) => now >= +new Date(sl.starts_at) && now < +new Date(sl.ends_at));
  if (idx >= 0) return { current: slots[idx], next: slots[idx + 1] };
  return { next: slots.find((sl) => +new Date(sl.starts_at) > now) };
}

// ── Asistentes visibles en la grilla ─────────────────────────────────

export interface GridEntry {
  attendee: EventAttendee;
  /** La cara con la que entró a ESTE evento (perfil principal o el perfil elegido de la vertical). */
  profile: Face;
}

/** Acreditado/a: la persona y el equipo ven la hora (`checked_in_at`); los demás, solo `is_checked_in`. */
export const isCheckedIn = (a: EventAttendee | undefined) => !!a && (a.checked_in_at != null || a.is_checked_in === true);

/** Equipo del evento con acceso a datos (sin RRPP), o quien lo creó. Espejo de public.is_event_staff. */
export const isEventStaff = (s: RougeState, eventId: UUID, userId: UUID) =>
  getEvent(s, eventId)?.created_by === userId || s.event_staff.some((r) => r.event_id === eventId && r.user_id === userId && r.role !== "promoter");

/**
 * ¿`viewer` puede ver la asistencia de `target`? (⇔ public.can_see_attendee, base de la RLS de event_attendees)
 * Uno mismo y el equipo siempre. Otro asistente: sin bloqueo; si está en Modo Solo Amigos solo su Squad y sus matches;
 * si el evento limita el networking a acreditados, los dos tienen que haber pasado por la puerta.
 */
export function canSeeAttendee(s: RougeState, eventId: UUID, viewer: UUID, target: UUID): boolean {
  if (viewer === target || isEventStaff(s, eventId, viewer)) return true;
  const t = getAttendee(s, eventId, target);
  const v = getAttendee(s, eventId, viewer);
  if (!t || !v || isBlockedBetween(s, viewer, target)) return false;
  if (areSquadmates(s, eventId, viewer, target) || isMatch(s, eventId, viewer, target)) return true;
  if (t.ghost_mode) return false;
  if (getEvent(s, eventId)?.networking_checkin_only && !(isCheckedIn(t) && isCheckedIn(v))) return false;
  return true;
}

/** ¿Puede hacer networking nuevo (conectar, rompehielos, reuniones)? Si el evento lo limita, solo acreditados. */
export function networkingOpenFor(s: RougeState, eventId: UUID, userId: UUID): boolean {
  const a = getAttendee(s, eventId, userId);
  return !!a && (!getEvent(s, eventId)?.networking_checkin_only || isCheckedIn(a));
}

/** Asistentes que el viewer puede ver en la grilla: sin bloqueos, sin ghost mode, sin sí mismo (canSeeAttendee). */
export function visibleAttendees(s: RougeState, eventId: UUID, viewerId: UUID): GridEntry[] {
  const out: GridEntry[] = [];
  for (const a of s.event_attendees) {
    if (a.event_id !== eventId || a.user_id === viewerId || a.ghost_mode) continue;
    if (!canSeeAttendee(s, eventId, viewerId, a.user_id)) continue;
    const profile = faceOf(s, a.user_id, eventId);
    if (profile) out.push({ attendee: a, profile });
  }
  return out;
}

/** Búsqueda por @username (para invitar al squad). Respeta bloqueos; no respeta ghost (es para amigos). */
export function searchAttendeesByUsername(s: RougeState, eventId: UUID, viewerId: UUID, q: string): Face[] {
  const needle = q.trim().replace(/^@/, "").toLowerCase();
  if (!needle) return [];
  return s.event_attendees
    .filter((a) => a.event_id === eventId && a.user_id !== viewerId && !isBlockedBetween(s, viewerId, a.user_id))
    .map((a) => faceOf(s, a.user_id, eventId))
    .filter((p): p is Face => !!p && (p.username.toLowerCase().includes(needle) || p.full_name.toLowerCase().includes(needle)));
}

// ── Conexiones y matches ─────────────────────────────────────────────

export function connectionBetween(s: RougeState, eventId: UUID, a: UUID, b: UUID): Connection[] {
  return s.connections.filter(
    (c) =>
      c.event_id === eventId &&
      ((c.sender_id === a && c.receiver_id === b) || (c.sender_id === b && c.receiver_id === a)),
  );
}

export function isMatch(s: RougeState, eventId: UUID, a: UUID, b: UUID) {
  return connectionBetween(s, eventId, a, b).some((c) => c.status === "accepted");
}

export type ConnectionState = "none" | "sent" | "received" | "matched" | "rejected";

export function connectionStateFor(s: RougeState, eventId: UUID, viewer: UUID, other: UUID): ConnectionState {
  const cs = connectionBetween(s, eventId, viewer, other);
  if (cs.some((c) => c.status === "accepted")) return "matched";
  if (cs.some((c) => c.status === "pending" && c.receiver_id === viewer)) return "received";
  if (cs.some((c) => c.status === "pending" && c.sender_id === viewer)) return "sent";
  if (cs.some((c) => c.status === "rejected")) return "rejected";
  return "none";
}

/**
 * Matches de un usuario. Si se pasa eventId filtra por evento; si no,
 * devuelve todos (los matches sobreviven a la caducidad del lobby).
 */
export function matchesOf(s: RougeState, userId: UUID, eventId?: UUID) {
  return s.connections
    .filter(
      (c) =>
        c.status === "accepted" &&
        (c.sender_id === userId || c.receiver_id === userId) &&
        (!eventId || c.event_id === eventId),
    )
    .map((c) => ({ connection: c, otherId: c.sender_id === userId ? c.receiver_id : c.sender_id }))
    .filter(({ otherId }) => !isBlockedBetween(s, userId, otherId))
    // Cada match se muestra con la cara del evento donde se conocieron.
    .map(({ connection, otherId }) => ({ connection, profile: faceOf(s, otherId, connection.event_id)! }))
    .filter((m) => !!m.profile);
}

/** Bandeja de entrada: solicitudes pendientes (rompehielos fijados arriba). */
export function inboxOf(s: RougeState, userId: UUID, eventId: UUID) {
  return s.connections
    .filter((c) => c.event_id === eventId && c.receiver_id === userId && c.status === "pending")
    .filter((c) => !isBlockedBetween(s, userId, c.sender_id))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "icebreaker" ? -1 : 1;
      return +new Date(b.created_at) - +new Date(a.created_at);
    })
    .map((c) => ({ connection: c, profile: faceOf(s, c.sender_id, c.event_id)! }))
    .filter((x) => !!x.profile);
}

// ── Squads ───────────────────────────────────────────────────────────

export function squadOf(s: RougeState, eventId: UUID, userId: UUID): { squad: Squad; member: SquadMember } | undefined {
  for (const m of s.squad_members) {
    if (m.user_id !== userId || m.status !== "joined") continue;
    const squad = s.squads.find((sq) => sq.id === m.squad_id && sq.event_id === eventId);
    if (squad) return { squad, member: m };
  }
  return undefined;
}

export const squadMembers = (s: RougeState, squadId: UUID, status: "joined" | "invited" | "any" = "joined") =>
  s.squad_members.filter((m) => m.squad_id === squadId && (status === "any" || m.status === status));

export const squadSize = (s: RougeState, squadId: UUID) => squadMembers(s, squadId).length;

export function pendingSquadInvites(s: RougeState, eventId: UUID, userId: UUID) {
  return s.squad_members
    .filter((m) => m.user_id === userId && m.status === "invited")
    .map((m) => ({ member: m, squad: s.squads.find((sq) => sq.id === m.squad_id && sq.event_id === eventId)! }))
    .filter((x) => !!x.squad);
}

export function areSquadmates(s: RougeState, eventId: UUID, a: UUID, b: UUID) {
  const sa = squadOf(s, eventId, a);
  const sb = squadOf(s, eventId, b);
  return !!sa && !!sb && sa.squad.id === sb.squad.id;
}

// ── Plano: pines visibles ────────────────────────────────────────────

export type PinAudience = "self" | "squad" | "match";

export interface VisiblePin {
  pin: MapPin;
  profile: Face;
  audience: PinAudience;
  minutesLeft: number;
}

export const isPinActive = (p: MapPin, now = Date.now()) => +new Date(p.expires_at) > now;

/**
 * Un pin es visible si: no expiró, no hay bloqueo, y el viewer es el dueño,
 * o comparte squad (y el pin se compartió con el squad), o es un match
 * seleccionado MANUALMENTE en shared_match_ids. Nunca hay difusión implícita.
 */
export function visiblePins(s: RougeState, eventId: UUID, viewerId: UUID, now = Date.now()): VisiblePin[] {
  const out: VisiblePin[] = [];
  for (const pin of s.map_pins) {
    if (pin.event_id !== eventId || !isPinActive(pin, now)) continue;
    const profile = faceOf(s, pin.user_id, eventId);
    if (!profile) continue;
    let audience: PinAudience | null = null;
    if (pin.user_id === viewerId) audience = "self";
    else if (isBlockedBetween(s, viewerId, pin.user_id)) continue;
    else if (pin.share_with_squad && areSquadmates(s, eventId, viewerId, pin.user_id)) audience = "squad";
    else if (pin.shared_match_ids.includes(viewerId) && isMatch(s, eventId, viewerId, pin.user_id)) audience = "match";
    if (!audience) continue;
    out.push({ pin, profile, audience, minutesLeft: Math.max(0, Math.ceil((+new Date(pin.expires_at) - now) / 60_000)) });
  }
  return out;
}

export const activePinOf = (s: RougeState, eventId: UUID, userId: UUID, now = Date.now()) =>
  s.map_pins.find((p) => p.event_id === eventId && p.user_id === userId && isPinActive(p, now));

export function sectorAt(sectors: VenueSector[], x: number, y: number): VenueSector | undefined {
  // El sector más chico que contiene el punto (para sectores anidados, ej. Barra dentro de Terraza)
  return sectors
    .filter((sc) => x >= sc.x && x <= sc.x + sc.w && y >= sc.y && y <= sc.y + sc.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

// ── Conversaciones ───────────────────────────────────────────────────

export const directMessages = (s: RougeState, connectionId: UUID) =>
  s.messages
    .filter((m) => m.conversation_type === "direct" && m.connection_id === connectionId)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

export const squadMessages = (s: RougeState, squadId: UUID) =>
  s.messages
    .filter((m) => m.conversation_type === "squad" && m.squad_id === squadId)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

// ── Perks / Barra ────────────────────────────────────────────────────

export const perksOf = (s: RougeState, userId: UUID, eventId?: UUID) =>
  s.user_perks_qrs
    .filter((p) => p.user_id === userId && (!eventId || p.event_id === eventId))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

export const ordersOf = (s: RougeState, userId: UUID, eventId: UUID) =>
  s.bar_orders
    .filter((o) => o.event_id === eventId && (o.user_id === userId || o.split_user_ids.includes(userId)))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

export const topSongs = (s: RougeState, eventId: UUID, limit = 5) =>
  s.song_requests
    .filter((r) => r.event_id === eventId)
    .sort((a, b) => b.voter_ids.length - a.voter_ids.length || +new Date(a.created_at) - +new Date(b.created_at))
    .slice(0, limit);

// ── Seguridad del Squad ──────────────────────────────────────────────

export interface RescueAlert {
  profile: Face;
  member: SquadMember;
  pin: MapPin | undefined;
}

/** Amigas/os de MI squad que pidieron rescate (con su pin activo si lo hay). */
export function rescueAlertsFor(s: RougeState, eventId: UUID, userId: UUID, now = Date.now()): RescueAlert[] {
  const mine = squadOf(s, eventId, userId);
  if (!mine) return [];
  return squadMembers(s, mine.squad.id)
    .filter((m) => m.user_id !== userId && m.safety_status === "rescue_needed")
    .map((m) => ({ member: m, profile: faceOf(s, m.user_id, eventId)!, pin: activePinOf(s, eventId, m.user_id, now) }))
    .filter((r) => !!r.profile);
}

/** Para seguridad / staff: todas las alertas de rescate activas del evento, la más reciente primero. */
export function eventRescueAlerts(s: RougeState, eventId: UUID, now = Date.now()): (RescueAlert & { squad: Squad })[] {
  return s.squads
    .filter((sq) => sq.event_id === eventId)
    .flatMap((sq) =>
      squadMembers(s, sq.id)
        .filter((m) => m.safety_status === "rescue_needed")
        .map((m) => ({ squad: sq, member: m, profile: faceOf(s, m.user_id, eventId)!, pin: s.map_pins.find((p) => p.event_id === eventId && p.user_id === m.user_id && p.is_rescue_alert && isPinActive(p, now)) ?? activePinOf(s, eventId, m.user_id, now) })),
    )
    .filter((r) => !!r.profile)
    .sort((a, b) => +new Date(b.pin?.created_at ?? 0) - +new Date(a.pin?.created_at ?? 0));
}

/** Squads con "🍾 Tenemos Mesa VIP · abiertos a sumar otro grupo" (sin el mío ni bloqueados). */
export function openVipSquads(s: RougeState, eventId: UUID, viewerId: UUID) {
  const mine = squadOf(s, eventId, viewerId)?.squad.id;
  return s.squads
    .filter((sq) => sq.event_id === eventId && sq.has_vip_table_to_share && sq.id !== mine)
    .filter((sq) => !squadMembers(s, sq.id).some((m) => isBlockedBetween(s, viewerId, m.user_id)))
    .map((sq) => ({ squad: sq, members: squadMembers(s, sq.id).map((m) => getProfile(s, m.user_id)!).filter(Boolean) }));
}
