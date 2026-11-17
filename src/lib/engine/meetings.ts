/**
 * Reuniones 1 a 1 y puntos de encuentro — reglas PURAS (espejo de request_meeting, respond_meeting,
 * reschedule_meeting, cancel_meeting, check_meeting_slot y venue_spots en schema.sql).
 *
 *  - Corporativo: "Solicitar reunión" a cualquiera que puedo ver en el evento.
 *  - Noche: "Punto de encuentro" SOLO con matches (nadie recibe una cita de un desconocido).
 *  - Lugar: sala / mesa / punto cargado por el organizador (con cupo), un pin en el plano o "a definir al aceptar".
 *  - Horario: dentro del evento, en franjas de 15 o 30 min; "Ahora" si el evento está en curso.
 *  - Al aceptar: se valida el cupo de la sala y la agenda de los dos, se abre el chat (conexión aceptada) y la reunión
 *    queda fijada en el chat y en el plano. "Completada" se deriva: aceptada y ya terminó.
 */
import type { Connection, Meeting, MeetingDisplayStatus, MeetingLocationKind, Message, RougeEvent, RougeState, UUID, VenueSpot, VenueSpotKind } from "@/lib/types";
import { formatTime, uid } from "@/lib/utils";
import { canSeeAttendee, connectionBetween, getAttendee, getEvent, isBlockedBetween, isLobbyInteractive, isMatch, networkingOpenFor } from "./selectors";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (n: number) => new Date(n).toISOString();
const MIN = 60_000;

export const MEETING_TOPIC_MAX = 140;
export const MEETING_DURATIONS = [15, 30] as const;
export const MAX_PENDING_REQUESTS = 10;
export const SPOT_NAME_MAX = 40;

/** Mensajes (⇔ excepciones de las RPC, traducidas en supabase/errors.ts). */
export const MEETING_ERRORS = {
  match_required: "En la noche, los puntos de encuentro son solo con tus matches.",
  meeting_pending: "Ya hay una reunión pendiente entre ustedes: respondela o esperá la respuesta.",
  too_many_requests: `Tenés ${MAX_PENDING_REQUESTS} pedidos de reunión sin respuesta: esperá que te contesten.`,
  invalid_time: "Elegí un horario dentro del evento (y que todavía no haya pasado).",
  invalid_duration: "La reunión dura 15 o 30 minutos.",
  invalid_spot: "Ese lugar ya no está disponible.",
  spot_busy: "Ese lugar ya está ocupado en ese horario: elegí otro horario u otra sala.",
  invalid_pin: "Marcá el punto dentro del plano.",
  time_conflict: "Ese horario se superpone con otra reunión confirmada.",
  meeting_expired: "Esa reunión ya pasó.",
  final_status: "Esa reunión ya no se puede cambiar.",
  invalid_message: `Contá el motivo en hasta ${MEETING_TOPIC_MAX} caracteres.`,
} as const;

export type MeetingLocation = { kind: "spot"; spotId: UUID } | { kind: "pin"; x: number; y: number; label?: string | null } | { kind: "tbd" };

export interface MeetingInput {
  topic: string;
  startsAt: string;
  duration: 15 | 30;
  location: MeetingLocation;
}

export const meetingEnd = (m: Pick<Meeting, "starts_at" | "duration_min">) => +new Date(m.starts_at) + m.duration_min * MIN;

/** Estado que se muestra (Completada = aceptada y terminada). */
export function displayStatus(m: Meeting, now = Date.now()): MeetingDisplayStatus {
  return m.status === "accepted" && meetingEnd(m) <= now ? "completed" : m.status;
}

export const MEETING_STATUS_META: Record<MeetingDisplayStatus, { label: string; tone: "vip" | "squad" | "rouge" | "muted" }> = {
  pending: { label: "Pendiente", tone: "vip" },
  rescheduled: { label: "Reprogramada", tone: "vip" },
  accepted: { label: "Aceptada", tone: "squad" },
  completed: { label: "Completada", tone: "muted" },
  declined: { label: "Rechazada", tone: "muted" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

const overlaps = (aStart: number, aMin: number, bStart: number, bMin: number) => aStart < bStart + bMin * MIN && bStart < aStart + aMin * MIN;

/** Reuniones aceptadas en esa sala que pisan el horario (⇔ public.spot_busy). */
export function spotBusy(s: RougeState, spotId: UUID, startsAt: string, minutes: number, excludeId?: UUID): number {
  const start = +new Date(startsAt);
  return s.meetings.filter((m) => m.spot_id === spotId && m.status === "accepted" && m.id !== excludeId && overlaps(+new Date(m.starts_at), m.duration_min, start, minutes)).length;
}

/** ¿La persona ya tiene una reunión aceptada que se superpone? (⇔ public.meeting_conflict) */
export function hasConflict(s: RougeState, userId: UUID, startsAt: string, minutes: number, excludeId?: UUID): boolean {
  const start = +new Date(startsAt);
  return s.meetings.some(
    (m) => m.status === "accepted" && m.id !== excludeId && (m.requester_id === userId || m.invitee_id === userId) && overlaps(+new Date(m.starts_at), m.duration_min, start, minutes),
  );
}

export function spotAvailability(s: RougeState, spot: VenueSpot, startsAt: string, minutes: number, excludeId?: UUID) {
  const busy = spotBusy(s, spot.id, startsAt, minutes, excludeId);
  return { busy, capacity: spot.capacity, free: spot.capacity === null || busy < spot.capacity };
}

/** Valida horario y lugar (⇔ public.check_meeting_slot). */
export function checkSlot(s: RougeState, eventId: UUID, startsAt: string, minutes: number, loc: MeetingLocation, now = Date.now(), excludeId?: UUID): string | null {
  const ev = getEvent(s, eventId);
  if (!ev) return "Evento inexistente.";
  if (!MEETING_DURATIONS.includes(minutes as 15 | 30)) return MEETING_ERRORS.invalid_duration;
  const start = +new Date(startsAt);
  if (Number.isNaN(start) || start < now - 2 * MIN || start < +new Date(ev.starts_at) - MIN || start + minutes * MIN > +new Date(ev.ends_at)) return MEETING_ERRORS.invalid_time;
  if (loc.kind === "spot") {
    const spot = s.venue_spots.find((x) => x.id === loc.spotId && x.event_id === eventId && x.is_active);
    if (!spot) return MEETING_ERRORS.invalid_spot;
    if (!spotAvailability(s, spot, startsAt, minutes, excludeId).free) return MEETING_ERRORS.spot_busy;
  } else if (loc.kind === "pin") {
    if (![loc.x, loc.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) return MEETING_ERRORS.invalid_pin;
  }
  return null;
}

/**
 * Horarios para elegir: "Ahora" (si el evento está en curso) y franjas de 15 min hasta el cierre.
 * `now` se redondea al cuarto de hora siguiente.
 */
export function meetingSlots(ev: Pick<RougeEvent, "starts_at" | "ends_at">, now = Date.now(), duration = 15, limit = 24): { value: string; label: string; now?: boolean }[] {
  const start = +new Date(ev.starts_at);
  const end = +new Date(ev.ends_at);
  const out: { value: string; label: string; now?: boolean }[] = [];
  if (now >= start && now + duration * MIN <= end) out.push({ value: iso(now), label: "Ahora · próximos 15 min", now: true });
  const q = 15 * MIN;
  let t = Math.ceil(Math.max(now + MIN, start) / q) * q;
  while (t + duration * MIN <= end && out.length < limit) {
    out.push({ value: iso(t), label: formatTime(iso(t)) });
    t += q;
  }
  return out;
}

/** ¿Puede `viewer` pedirle una reunión a `target` en este evento? Devuelve el motivo si no. */
export function meetingEligibility(s: RougeState, eventId: UUID, viewer: UUID, target: UUID, now = Date.now()): string | null {
  const ev = getEvent(s, eventId);
  if (!ev) return "Evento inexistente.";
  if (!isLobbyInteractive(ev, now)) return "El lobby de este evento está cerrado.";
  if (viewer === target) return "No podés pedirte una reunión a vos.";
  const mine = getAttendee(s, eventId, viewer);
  if (!mine || !getAttendee(s, eventId, target)) return "Tienen que estar los dos en el evento.";
  if (!canSeeAttendee(s, eventId, viewer, target)) return "Este perfil no está disponible.";
  if (!networkingOpenFor(s, eventId, viewer)) return "En este evento el networking es para quienes ya se acreditaron en la puerta.";
  const matched = isMatch(s, eventId, viewer, target);
  if (ev.kind === "nightlife" && !matched) return MEETING_ERRORS.match_required;
  if (mine.ghost_mode && !matched) return "Estás en modo incógnito: solo podés pedir reuniones a tus contactos.";
  if (s.meetings.some((m) => m.event_id === eventId && (m.status === "pending" || m.status === "rescheduled") && pairOf(m, viewer, target))) return MEETING_ERRORS.meeting_pending;
  if (s.meetings.filter((m) => m.event_id === eventId && m.requester_id === viewer && m.status === "pending").length >= MAX_PENDING_REQUESTS) return MEETING_ERRORS.too_many_requests;
  return null;
}

const pairOf = (m: Pick<Meeting, "requester_id" | "invitee_id">, a: UUID, b: UUID) =>
  (m.requester_id === a && m.invitee_id === b) || (m.requester_id === b && m.invitee_id === a);

const locationFields = (loc: MeetingLocation): Pick<Meeting, "location_kind" | "spot_id" | "pin_x" | "pin_y" | "pin_label"> => ({
  location_kind: loc.kind,
  spot_id: loc.kind === "spot" ? loc.spotId : null,
  pin_x: loc.kind === "pin" ? loc.x : null,
  pin_y: loc.kind === "pin" ? loc.y : null,
  pin_label: loc.kind === "pin" ? loc.label?.trim().slice(0, 60) || null : null,
});

/** Pedir una reunión (⇔ public.request_meeting). */
export function requestMeeting(s: RougeState, eventId: UUID, requesterId: UUID, inviteeId: UUID, input: MeetingInput, now = Date.now()): R<Meeting> {
  const why = meetingEligibility(s, eventId, requesterId, inviteeId, now);
  if (why) return fail(why);
  const topic = input.topic.trim();
  if (!topic || topic.length > MEETING_TOPIC_MAX) return fail(MEETING_ERRORS.invalid_message);
  const slot = checkSlot(s, eventId, input.startsAt, input.duration, input.location, now);
  if (slot) return fail(slot);
  if (hasConflict(s, requesterId, input.startsAt, input.duration)) return fail(MEETING_ERRORS.time_conflict);
  const meeting: Meeting = {
    id: uid(),
    event_id: eventId,
    requester_id: requesterId,
    invitee_id: inviteeId,
    topic,
    starts_at: input.startsAt,
    duration_min: input.duration,
    ...locationFields(input.location),
    status: "pending",
    proposed_by: requesterId,
    connection_id: null,
    created_at: iso(now),
    updated_at: iso(now),
  };
  return { ok: true, state: { ...s, meetings: [...s.meetings, meeting] }, data: meeting };
}

/** Texto del lugar: nombre de la sala, etiqueta del pin o "A definir". */
export function meetingPlace(s: RougeState, m: Pick<Meeting, "location_kind" | "spot_id" | "pin_label">): string {
  if (m.location_kind === "spot") return s.venue_spots.find((x) => x.id === m.spot_id)?.name ?? "Sala";
  if (m.location_kind === "pin") return m.pin_label || "Pin en el plano";
  return "Lugar a definir";
}

/** Coordenadas para el plano (sala con posición o pin). */
export function meetingPoint(s: RougeState, m: Meeting): { x: number; y: number } | null {
  if (m.location_kind === "pin" && m.pin_x != null && m.pin_y != null) return { x: m.pin_x, y: m.pin_y };
  const spot = m.spot_id ? s.venue_spots.find((x) => x.id === m.spot_id) : undefined;
  return spot && spot.coord_x != null && spot.coord_y != null ? { x: spot.coord_x, y: spot.coord_y } : null;
}

/**
 * Aceptar o rechazar (responde quien no hizo la última propuesta; ⇔ public.respond_meeting). Al aceptar se abre el chat
 * (conexión aceptada) con la reunión fijada como aviso del sistema.
 */
export function respondMeeting(s: RougeState, meetingId: UUID, userId: UUID, accept: boolean, location?: MeetingLocation, now = Date.now()): R<Meeting> {
  const m = s.meetings.find((x) => x.id === meetingId);
  if (!m || (m.requester_id !== userId && m.invitee_id !== userId)) return fail("Esa reunión no existe.");
  if (m.status !== "pending" && m.status !== "rescheduled") return fail(MEETING_ERRORS.final_status);
  if (m.proposed_by === userId) return fail("Esperá la respuesta de la otra persona.");
  if (isBlockedBetween(s, m.requester_id, m.invitee_id)) return fail("Este perfil no está disponible.");
  if (!accept) return save(s, { ...m, status: "declined", updated_at: iso(now) });

  let next: Meeting = { ...m };
  if (m.location_kind === "tbd" && location && location.kind !== "tbd") next = { ...next, ...locationFields(location) };
  if (meetingEnd(next) <= now) return fail(MEETING_ERRORS.meeting_expired);
  const loc: MeetingLocation =
    next.location_kind === "spot" ? { kind: "spot", spotId: next.spot_id! } : next.location_kind === "pin" ? { kind: "pin", x: next.pin_x!, y: next.pin_y! } : { kind: "tbd" };
  const startCheck = iso(Math.max(+new Date(next.starts_at), now));
  const slot = checkSlot(s, next.event_id, startCheck, next.duration_min, loc, now, m.id);
  if (slot) return fail(slot);
  if (hasConflict(s, m.requester_id, m.starts_at, m.duration_min, m.id) || hasConflict(s, m.invitee_id, m.starts_at, m.duration_min, m.id)) return fail(MEETING_ERRORS.time_conflict);

  // Canal de chat: conexión aceptada entre los dos.
  let connections = s.connections;
  const existing = connectionBetween(s, m.event_id, m.requester_id, m.invitee_id).sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted"))[0];
  let conn: Connection;
  if (!existing) {
    conn = { id: uid(), event_id: m.event_id, sender_id: m.requester_id, receiver_id: m.invitee_id, type: "regular", icebreaker_message: null, attached_drink_qr_id: null, status: "accepted", created_at: iso(now), responded_at: iso(now) };
    connections = [...connections, conn];
  } else if (existing.status !== "accepted") {
    conn = { ...existing, status: "accepted", responded_at: iso(now) };
    connections = connections.map((c) => (c.id === conn.id ? conn : c));
  } else conn = existing;

  next = { ...next, status: "accepted", connection_id: conn.id, updated_at: iso(now) };
  const note: Message = {
    id: uid(),
    event_id: m.event_id,
    conversation_type: "direct",
    connection_id: conn.id,
    squad_id: null,
    sender_id: userId,
    message_type: "system_alert",
    content: `📅 Reunión confirmada · ${formatTime(next.starts_at)} · ${meetingPlace(s, next)}`,
    media_url: null,
    created_at: iso(now),
  };
  const r = save({ ...s, connections, messages: [...s.messages, note] }, next);
  return r;
}

/** Reprogramar: nueva propuesta (horario y lugar) que la otra persona tiene que aceptar (⇔ public.reschedule_meeting). */
export function rescheduleMeeting(s: RougeState, meetingId: UUID, userId: UUID, input: Omit<MeetingInput, "topic">, now = Date.now()): R<Meeting> {
  const m = s.meetings.find((x) => x.id === meetingId);
  if (!m || (m.requester_id !== userId && m.invitee_id !== userId)) return fail("Esa reunión no existe.");
  if (!["pending", "accepted", "rescheduled"].includes(m.status)) return fail(MEETING_ERRORS.final_status);
  const ev = getEvent(s, m.event_id);
  if (!ev || !isLobbyInteractive(ev, now)) return fail("El lobby de este evento está cerrado.");
  const slot = checkSlot(s, m.event_id, input.startsAt, input.duration, input.location, now, m.id);
  if (slot) return fail(slot);
  if (hasConflict(s, userId, input.startsAt, input.duration, m.id)) return fail(MEETING_ERRORS.time_conflict);
  return save(s, { ...m, ...locationFields(input.location), status: "rescheduled", proposed_by: userId, starts_at: input.startsAt, duration_min: input.duration, updated_at: iso(now) });
}

/** Cancelar (cualquiera de los dos; ⇔ public.cancel_meeting). */
export function cancelMeeting(s: RougeState, meetingId: UUID, userId: UUID, now = Date.now()): R<Meeting> {
  const m = s.meetings.find((x) => x.id === meetingId);
  if (!m || (m.requester_id !== userId && m.invitee_id !== userId)) return fail("Esa reunión no existe.");
  if (!["pending", "accepted", "rescheduled"].includes(m.status)) return fail(MEETING_ERRORS.final_status);
  return save(s, { ...m, status: "cancelled", updated_at: iso(now) });
}

function save(s: RougeState, m: Meeting): R<Meeting> {
  return { ok: true, state: { ...s, meetings: s.meetings.map((x) => (x.id === m.id ? m : x)) }, data: m };
}

/** Mis reuniones (de un evento o de todos), sin las de personas bloqueadas, ordenadas por horario. */
export function meetingsOf(s: RougeState, userId: UUID, eventId?: UUID): Meeting[] {
  return s.meetings
    .filter((m) => (m.requester_id === userId || m.invitee_id === userId) && (!eventId || m.event_id === eventId))
    .filter((m) => !isBlockedBetween(s, m.requester_id, m.invitee_id))
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
}

/** La otra persona de la reunión. */
export const otherOf = (m: Pick<Meeting, "requester_id" | "invitee_id">, me: UUID) => (m.requester_id === me ? m.invitee_id : m.requester_id);
/** ¿Me toca responder? (pendiente o reprogramada por la otra persona) */
export const awaitsMe = (m: Meeting, me: UUID) => (m.status === "pending" || m.status === "rescheduled") && m.proposed_by !== me;

// ── Salas, mesas y puntos de encuentro (organizador) ─────────────────

export const SPOT_KINDS: { id: VenueSpotKind; label: string; emoji: string }[] = [
  { id: "room", label: "Sala", emoji: "🚪" },
  { id: "table", label: "Mesa", emoji: "🪑" },
  { id: "point", label: "Punto de encuentro", emoji: "📍" },
];

export interface VenueSpotInput {
  id?: UUID;
  name: string;
  kind: VenueSpotKind;
  capacity: number | null;
  coord_x: number | null;
  coord_y: number | null;
  is_active?: boolean;
}

/** Alta o edición de una sala / mesa / punto (⇔ venue_spots con RLS de dueño/a o producción). */
export function upsertVenueSpot(s: RougeState, eventId: UUID, input: VenueSpotInput, now = Date.now()): R<VenueSpot> {
  if (!getEvent(s, eventId)) return fail("Evento inexistente.");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > SPOT_NAME_MAX) return fail(`El nombre tiene que tener entre 2 y ${SPOT_NAME_MAX} caracteres.`);
  if (!SPOT_KINDS.some((k) => k.id === input.kind)) return fail("Tipo de lugar inválido.");
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 50)) return fail("El cupo es de 1 a 50 reuniones a la vez (o sin límite).");
  const coords = [input.coord_x, input.coord_y];
  if (coords.some((v) => v !== null && (!Number.isFinite(v) || v < 0 || v > 100)) || (input.coord_x === null) !== (input.coord_y === null)) return fail("Ubicación fuera del plano.");
  const existing = input.id ? s.venue_spots.find((x) => x.id === input.id && x.event_id === eventId) : undefined;
  if (s.venue_spots.some((x) => x.event_id === eventId && x.id !== existing?.id && x.name.toLowerCase() === name.toLowerCase())) return fail("Ya hay un lugar con ese nombre.");
  const spot: VenueSpot = {
    id: existing?.id ?? input.id ?? uid(),
    event_id: eventId,
    name,
    kind: input.kind,
    capacity: input.capacity,
    coord_x: input.coord_x,
    coord_y: input.coord_y,
    is_active: input.is_active ?? existing?.is_active ?? true,
    created_at: existing?.created_at ?? iso(now),
  };
  return { ok: true, state: { ...s, venue_spots: existing ? s.venue_spots.map((x) => (x.id === spot.id ? spot : x)) : [...s.venue_spots, spot] }, data: spot };
}

/** Borra un lugar sin reuniones; si ya tiene, hay que desactivarlo (las reuniones viejas conservan su sala). */
export function deleteVenueSpot(s: RougeState, spotId: UUID): R<undefined> {
  if (!s.venue_spots.some((x) => x.id === spotId)) return fail("Ese lugar no existe.");
  if (s.meetings.some((m) => m.spot_id === spotId)) return fail("Ese lugar ya tiene reuniones: desactivalo en vez de borrarlo.");
  return { ok: true, state: { ...s, venue_spots: s.venue_spots.filter((x) => x.id !== spotId) }, data: undefined };
}

export const spotsOf = (s: RougeState, eventId: UUID, activeOnly = true) => s.venue_spots.filter((x) => x.event_id === eventId && (!activeOnly || x.is_active));
export type { MeetingLocationKind };
