/**
 * Agenda multi-track, "Mi Agenda" y Q&A / encuestas en vivo (ROUGE Pro) — reglas PURAS.
 * Espejo de `event_sessions`, `enroll_session`, `ask_question`, `vote_question`, `moderate_question`, `launch_poll`,
 * `vote_poll`… en supabase/schema.sql (mismos mensajes vía supabase/errors.ts).
 *
 *  - Solo en eventos corporativos (`features.agenda`). La organización (dueño/a, producción) carga las charlas con sala,
 *    track, horario y oradores, y las pone "En vivo" para abrir la sala de preguntas y las encuestas.
 *  - Horario local del evento (Argentina, UTC-3, sin horario de verano): `day` + `start_time`/`end_time` "HH:MM".
 *  - Una sala no tiene dos charlas a la vez (`room_busy`), pero sí hay varias salas/tracks en paralelo.
 *  - Mi Agenda: las superposiciones NO se bloquean: la UI avisa ("Se superpone con…") y la persona confirma o reemplaza
 *    (`replaceIds` saca esas charlas en la misma operación). El cupo (`capacity`) sí se respeta.
 *  - Q&A: anónima o "como Nombre · Empresa"; la autoría nunca viaja con la pregunta. Votos ▲ uno por persona (no a la
 *    propia). La moderación destaca (una por charla), marca respondida u oculta.
 *  - Encuestas: una abierta por charla (lanzar otra cierra la anterior); un voto por persona, se puede cambiar mientras
 *    está abierta. Apagar "En vivo" cierra la encuesta abierta.
 */
import type { EventSession, PollOption, QuestionStatus, RougeEvent, RougeState, SessionPoll, SessionQuestion, SessionSpeaker, UUID } from "@/lib/types";
import { uid } from "@/lib/utils";
import { getAttendee, getEvent } from "./selectors";
import { faceOf, hasFeature, NOT_IN_VERTICAL } from "./verticals";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (n: number) => new Date(n).toISOString();
const MIN = 60_000;

/** Zona horaria de las agendas (⇔ 'America/Argentina/Buenos_Aires' en SQL; Argentina no usa horario de verano). */
export const EVENT_UTC_OFFSET = "-03:00";
const OFFSET_MS = -3 * 60 * MIN;

export const SESSION_TITLE_MAX = 120;
export const SESSION_DESCRIPTION_MAX = 600;
export const SESSION_TRACK_MAX = 40;
export const SESSION_ROOM_MAX = 60;
export const SESSION_SPEAKERS_MAX = 6;
export const SPEAKER_FIELD_MAX = 60;
export const SESSIONS_PER_EVENT_MAX = 200;
export const SESSION_CAPACITY_MAX = 5000;
export const QUESTION_MIN = 3;
export const QUESTION_MAX = 280;
/** Preguntas abiertas por persona y charla (evita que una sola persona copie la sala). */
export const OPEN_QUESTIONS_MAX = 5;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_MAX = 60;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 6;

/** Mensajes (⇔ excepciones de las RPC, traducidas en supabase/errors.ts). */
export const SCHEDULE_ERRORS = {
  invalid_title: `El título tiene que tener entre 3 y ${SESSION_TITLE_MAX} caracteres.`,
  invalid_description: `La descripción admite hasta ${SESSION_DESCRIPTION_MAX} caracteres.`,
  invalid_track: `Elegí un track (hasta ${SESSION_TRACK_MAX} caracteres).`,
  invalid_room: `Indicá la sala (hasta ${SESSION_ROOM_MAX} caracteres).`,
  invalid_session_time: "El horario va en formato HH:MM y la charla tiene que terminar después de empezar (el mismo día).",
  outside_event: "La charla tiene que caer en los días del evento.",
  invalid_session_spot: "Ese pin del plano ya no está disponible.",
  invalid_speaker: `Cada orador/a necesita nombre (hasta ${SPEAKER_FIELD_MAX} caracteres); máximo ${SESSION_SPEAKERS_MAX} por charla.`,
  invalid_capacity: `El cupo es de 1 a ${SESSION_CAPACITY_MAX} lugares (o sin límite).`,
  capacity_below_enrolled: "Ya hay más personas agendadas que ese cupo: elegí uno mayor.",
  room_busy: "Esa sala ya tiene otra charla en ese horario.",
  too_many_sessions: `Un evento admite hasta ${SESSIONS_PER_EVENT_MAX} charlas.`,
  session_not_found: "Esa charla ya no está en la agenda.",
  agenda_not_attendee: "Entrá al evento para armar tu agenda y participar.",
  session_full: "No quedan lugares en esta charla.",
  session_over: "Esa charla ya terminó.",
  not_live: "La sala de preguntas y las encuestas se abren cuando la charla está en vivo.",
  invalid_question: `Escribí la pregunta en ${QUESTION_MIN} a ${QUESTION_MAX} caracteres.`,
  too_many_questions: `Ya tenés ${OPEN_QUESTIONS_MAX} preguntas sin responder en esta charla: esperá a que las respondan.`,
  question_not_found: "Esa pregunta ya no está disponible.",
  own_question: "No podés votar tu propia pregunta.",
  invalid_poll: `La encuesta necesita una pregunta (hasta ${POLL_QUESTION_MAX} caracteres) y de ${POLL_OPTIONS_MIN} a ${POLL_OPTIONS_MAX} opciones distintas.`,
  poll_closed: "Esta encuesta ya cerró.",
  invalid_option: "Elegí una de las opciones de la encuesta.",
} as const;

// ── Horarios ─────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const isValidTime = (t: string) => TIME_RE.test(t);
export const isValidDay = (d: string) => DAY_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
/** "14:30" → 870 (minutos desde la medianoche). */
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Instante (ms) de un día + hora locales del evento. */
export const localToMs = (day: string, time: string) => Date.parse(`${day}T${time}:00${EVENT_UTC_OFFSET}`);
/** Día y hora locales del evento para un instante: { day: "2026-11-18", time: "14:30" }. */
export function localParts(ms: number): { day: string; time: string } {
  const d = new Date(ms + OFFSET_MS).toISOString();
  return { day: d.slice(0, 10), time: d.slice(11, 16) };
}

export const sessionStart = (x: Pick<EventSession, "day" | "start_time">) => localToMs(x.day, x.start_time);
export const sessionEnd = (x: Pick<EventSession, "day" | "end_time">) => localToMs(x.day, x.end_time);
export const sessionMinutes = (x: Pick<EventSession, "start_time" | "end_time">) => toMinutes(x.end_time) - toMinutes(x.start_time);

/** "45 min" · "1 h" · "1 h 30". */
export function durationLabel(x: Pick<EventSession, "start_time" | "end_time">): string {
  const m = sessionMinutes(x);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${h} h`;
}

export type SessionPhase = "upcoming" | "now" | "past";
export function sessionPhase(x: Pick<EventSession, "day" | "start_time" | "end_time">, now = Date.now()): SessionPhase {
  if (now < sessionStart(x)) return "upcoming";
  return now < sessionEnd(x) ? "now" : "past";
}

/** ¿Se pisan dos charlas? (mismo día y rangos [inicio, fin) que se cruzan; ⇔ public.sessions_overlap). */
export const sessionsOverlap = (a: Pick<EventSession, "day" | "start_time" | "end_time">, b: Pick<EventSession, "day" | "start_time" | "end_time">) =>
  a.day === b.day && a.start_time < b.end_time && b.start_time < a.end_time;

/** Días locales que cubre el evento ("2026-11-18", …). */
export function eventDays(ev: Pick<RougeEvent, "starts_at" | "ends_at">): string[] {
  const first = localParts(+new Date(ev.starts_at)).day;
  const last = localParts(+new Date(ev.ends_at) - 1).day;
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 31; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.push(d);
  return out;
}

/** "Mié 18 nov" (día de la agenda, sin depender de la zona del navegador). */
export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\.$/, "").replace(/^./, (c) => c.toUpperCase());
}

// ── Lectura ──────────────────────────────────────────────────────────

/** Charlas del evento ordenadas por día, hora y sala. */
export function sessionsOf(s: RougeState, eventId: UUID): EventSession[] {
  return s.event_sessions
    .filter((x) => x.event_id === eventId)
    .sort((a, b) => a.day.localeCompare(b.day) || a.start_time.localeCompare(b.start_time) || a.room_name.localeCompare(b.room_name) || a.title.localeCompare(b.title));
}

export const getSession = (s: RougeState, sessionId: UUID | null | undefined) => (sessionId ? s.event_sessions.find((x) => x.id === sessionId) : undefined);

export const isEnrolled = (s: RougeState, userId: UUID, sessionId: UUID) => s.session_enrollments.some((e) => e.session_id === sessionId && e.user_id === userId);

/** Ids de las charlas en "Mi Agenda". */
export const myAgendaIds = (s: RougeState, userId: UUID, eventId: UUID) => new Set(s.session_enrollments.filter((e) => e.event_id === eventId && e.user_id === userId).map((e) => e.session_id));

/** Charlas de MI agenda que se superponen con `session` (para el aviso antes de agendar). */
export function agendaConflicts(s: RougeState, userId: UUID, session: EventSession): EventSession[] {
  const mine = myAgendaIds(s, userId, session.event_id);
  return sessionsOf(s, session.event_id).filter((x) => x.id !== session.id && mine.has(x.id) && sessionsOverlap(x, session));
}

/** Texto del aviso: "Se superpone con «Financiamiento…» a las 15:00 hs". */
export const conflictMessage = (other: Pick<EventSession, "title" | "start_time">) => `Se superpone con «${other.title}» a las ${other.start_time} hs`;

export const seatsLeft = (x: Pick<EventSession, "capacity" | "enrolled_count">) => (x.capacity === null ? null : Math.max(0, x.capacity - x.enrolled_count));

export interface ScheduleFilter {
  day?: string | null;
  room?: string | null;
  track?: string | null;
  mineOnly?: boolean;
}

export function filterSessions(s: RougeState, eventId: UUID, userId: UUID, f: ScheduleFilter): EventSession[] {
  const mine = f.mineOnly ? myAgendaIds(s, userId, eventId) : null;
  return sessionsOf(s, eventId).filter((x) => (!f.day || x.day === f.day) && (!f.room || x.room_name === f.room) && (!f.track || x.track === f.track) && (!mine || mine.has(x.id)));
}

/** Opciones de los filtros (días, salas y tracks en uso, en orden de aparición). */
export function scheduleFacets(sessions: EventSession[]) {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    days: uniq(sessions.map((x) => x.day)).sort(),
    rooms: uniq(sessions.map((x) => x.room_name)).sort((a, b) => a.localeCompare(b)),
    tracks: uniq(sessions.map((x) => x.track)).sort((a, b) => a.localeCompare(b)),
  };
}

/** Tonos formales para los badges de track (paleta pro-*): estables por orden alfabético del track en el evento. */
export const TRACK_TONES = ["cobalt", "emerald", "gold", "sapphire", "mist"] as const;
export type TrackTone = (typeof TRACK_TONES)[number];
export function trackTone(allTracks: string[], track: string): TrackTone {
  const i = [...new Set(allTracks)].sort((a, b) => a.localeCompare(b)).indexOf(track);
  return TRACK_TONES[(i < 0 ? 0 : i) % TRACK_TONES.length];
}

/** Charlas en vivo del evento (para el inicio y el banner). */
export const liveSessions = (s: RougeState, eventId: UUID) => sessionsOf(s, eventId).filter((x) => x.is_live_now);

// ── Gestión (dueño/a y producción; el rol lo valida el comando con guarded) ──────────────────

export interface SpeakerInput {
  user_id?: UUID | null;
  name: string;
  role?: string;
  company?: string;
  avatar_url?: string | null;
}

export interface SessionInput {
  id?: UUID;
  title: string;
  description?: string;
  track: string;
  room_name: string;
  spot_id?: UUID | null;
  day: string;
  start_time: string;
  end_time: string;
  speakers?: SpeakerInput[];
  capacity?: number | null;
}

const clean = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

function cleanSpeakers(list: SpeakerInput[]): SessionSpeaker[] | null {
  if (list.length > SESSION_SPEAKERS_MAX) return null;
  const out: SessionSpeaker[] = [];
  for (const sp of list) {
    const name = clean(sp.name);
    const role = clean(sp.role);
    const company = clean(sp.company);
    const avatar = clean(sp.avatar_url) || null;
    if (name.length < 2 || [name, role, company].some((v) => v.length > SPEAKER_FIELD_MAX)) return null;
    if (avatar && (avatar.length > 500 || !/^(https:\/\/|\/|idb:)/.test(avatar))) return null;
    out.push({ user_id: sp.user_id ?? null, name, role, company, avatar_url: avatar });
  }
  return out;
}

/** Alta o edición de una charla (⇔ insert/update de event_sessions + trigger session_check). */
export function upsertSession(s: RougeState, eventId: UUID, input: SessionInput, now = Date.now()): R<EventSession> {
  const ev = getEvent(s, eventId);
  if (!ev) return fail("Evento inexistente.");
  if (!hasFeature(s, eventId, "agenda")) return fail(NOT_IN_VERTICAL);
  const existing = input.id ? s.event_sessions.find((x) => x.id === input.id && x.event_id === eventId) : undefined;
  if (!existing && s.event_sessions.filter((x) => x.event_id === eventId).length >= SESSIONS_PER_EVENT_MAX) return fail(SCHEDULE_ERRORS.too_many_sessions);
  const title = clean(input.title);
  if (title.length < 3 || title.length > SESSION_TITLE_MAX) return fail(SCHEDULE_ERRORS.invalid_title);
  const description = (input.description ?? "").trim();
  if (description.length > SESSION_DESCRIPTION_MAX) return fail(SCHEDULE_ERRORS.invalid_description);
  const track = clean(input.track);
  if (track.length < 2 || track.length > SESSION_TRACK_MAX) return fail(SCHEDULE_ERRORS.invalid_track);
  const spotId = input.spot_id ?? null;
  const spot = spotId ? s.venue_spots.find((x) => x.id === spotId && x.event_id === eventId && x.is_active) : undefined;
  if (spotId && !spot) return fail(SCHEDULE_ERRORS.invalid_session_spot);
  const room = clean(input.room_name) || spot?.name || "";
  if (room.length < 2 || room.length > SESSION_ROOM_MAX) return fail(SCHEDULE_ERRORS.invalid_room);
  if (!isValidDay(input.day) || !isValidTime(input.start_time) || !isValidTime(input.end_time) || input.end_time <= input.start_time) return fail(SCHEDULE_ERRORS.invalid_session_time);
  if (!eventDays(ev).includes(input.day)) return fail(SCHEDULE_ERRORS.outside_event);
  const speakers = cleanSpeakers(input.speakers ?? []);
  if (!speakers) return fail(SCHEDULE_ERRORS.invalid_speaker);
  const capacity = input.capacity ?? null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > SESSION_CAPACITY_MAX)) return fail(SCHEDULE_ERRORS.invalid_capacity);
  const enrolled = existing?.enrolled_count ?? 0;
  if (capacity !== null && capacity < enrolled) return fail(SCHEDULE_ERRORS.capacity_below_enrolled);
  const slot = { day: input.day, start_time: input.start_time, end_time: input.end_time };
  if (s.event_sessions.some((x) => x.event_id === eventId && x.id !== existing?.id && x.room_name.toLowerCase() === room.toLowerCase() && sessionsOverlap(x, slot))) return fail(SCHEDULE_ERRORS.room_busy);

  const session: EventSession = {
    id: existing?.id ?? input.id ?? uid(),
    event_id: eventId,
    title,
    description,
    track,
    room_name: room,
    spot_id: spotId,
    ...slot,
    speakers,
    capacity,
    enrolled_count: enrolled,
    is_live_now: existing?.is_live_now ?? false,
    created_at: existing?.created_at ?? iso(now),
    updated_at: iso(now),
  };
  return {
    ok: true,
    state: { ...s, event_sessions: existing ? s.event_sessions.map((x) => (x.id === session.id ? session : x)) : [...s.event_sessions, session] },
    data: session,
  };
}

/** Borra la charla con su agenda, preguntas y encuestas (⇔ on delete cascade). */
export function deleteSession(s: RougeState, sessionId: UUID): R<undefined> {
  if (!getSession(s, sessionId)) return fail(SCHEDULE_ERRORS.session_not_found);
  const questionIds = new Set(s.session_questions.filter((q) => q.session_id === sessionId).map((q) => q.id));
  const pollIds = new Set(s.session_polls.filter((p) => p.session_id === sessionId).map((p) => p.id));
  return {
    ok: true,
    state: {
      ...s,
      event_sessions: s.event_sessions.filter((x) => x.id !== sessionId),
      session_enrollments: s.session_enrollments.filter((e) => e.session_id !== sessionId),
      session_questions: s.session_questions.filter((q) => q.session_id !== sessionId),
      session_question_authors: s.session_question_authors.filter((a) => !questionIds.has(a.question_id)),
      session_question_votes: s.session_question_votes.filter((v) => !questionIds.has(v.question_id)),
      session_polls: s.session_polls.filter((p) => p.session_id !== sessionId),
      session_poll_votes: s.session_poll_votes.filter((v) => !pollIds.has(v.poll_id)),
    },
    data: undefined,
  };
}

/** "Activar En Vivo" / "Terminar": abre o cierra la sala de Q&A y encuestas (⇔ public.set_session_live). */
export function setSessionLive(s: RougeState, sessionId: UUID, live: boolean, now = Date.now()): R<EventSession> {
  const se = getSession(s, sessionId);
  if (!se) return fail(SCHEDULE_ERRORS.session_not_found);
  const next: EventSession = { ...se, is_live_now: live, updated_at: iso(now) };
  return {
    ok: true,
    state: {
      ...s,
      event_sessions: s.event_sessions.map((x) => (x.id === sessionId ? next : x)),
      // Al terminar, la encuesta abierta se cierra: nadie vota fuera de la charla.
      session_polls: live ? s.session_polls : s.session_polls.map((p) => (p.session_id === sessionId && p.status === "open" ? { ...p, status: "closed", closed_at: iso(now) } : p)),
    },
    data: next,
  };
}

// ── Mi Agenda ────────────────────────────────────────────────────────

function participantCheck(s: RougeState, userId: UUID, se: EventSession | undefined): string | null {
  if (!se) return SCHEDULE_ERRORS.session_not_found;
  if (!hasFeature(s, se.event_id, "agenda")) return NOT_IN_VERTICAL;
  if (!getAttendee(s, se.event_id, userId)) return SCHEDULE_ERRORS.agenda_not_attendee;
  return null;
}

/**
 * Agendar una charla (⇔ public.enroll_session). `replaceIds` = charlas de mi agenda que salen en la misma operación
 * ("Reemplazar"). Sin `replaceIds`, una superposición se acepta (la persona ya confirmó el aviso).
 */
export function enrollSession(s: RougeState, userId: UUID, sessionId: UUID, replaceIds: UUID[] = [], now = Date.now()): R<{ session: EventSession; replaced: UUID[] }> {
  const se = getSession(s, sessionId);
  const why = participantCheck(s, userId, se);
  if (why) return fail(why);
  if (sessionEnd(se!) <= now) return fail(SCHEDULE_ERRORS.session_over);
  if (isEnrolled(s, userId, sessionId)) return { ok: true, state: s, data: { session: se!, replaced: [] } };
  if (se!.capacity !== null && se!.enrolled_count >= se!.capacity) return fail(SCHEDULE_ERRORS.session_full);
  const replaced = [...new Set(replaceIds)].filter((id) => id !== sessionId && isEnrolled(s, userId, id) && getSession(s, id)?.event_id === se!.event_id);
  const drop = new Set(replaced);
  const sessions = s.event_sessions.map((x) =>
    x.id === sessionId ? { ...x, enrolled_count: x.enrolled_count + 1 } : drop.has(x.id) ? { ...x, enrolled_count: Math.max(0, x.enrolled_count - 1) } : x,
  );
  return {
    ok: true,
    state: {
      ...s,
      event_sessions: sessions,
      session_enrollments: [
        ...s.session_enrollments.filter((e) => !(e.user_id === userId && drop.has(e.session_id))),
        { session_id: sessionId, event_id: se!.event_id, user_id: userId, created_at: iso(now) },
      ],
    },
    data: { session: sessions.find((x) => x.id === sessionId)!, replaced },
  };
}

/** Sacar una charla de Mi Agenda (⇔ public.unenroll_session). */
export function unenrollSession(s: RougeState, userId: UUID, sessionId: UUID): R<EventSession> {
  const se = getSession(s, sessionId);
  if (!se) return fail(SCHEDULE_ERRORS.session_not_found);
  if (!isEnrolled(s, userId, sessionId)) return { ok: true, state: s, data: se };
  const next = { ...se, enrolled_count: Math.max(0, se.enrolled_count - 1) };
  return {
    ok: true,
    state: {
      ...s,
      event_sessions: s.event_sessions.map((x) => (x.id === sessionId ? next : x)),
      session_enrollments: s.session_enrollments.filter((e) => !(e.session_id === sessionId && e.user_id === userId)),
    },
    data: next,
  };
}

// ── Preguntas al orador (Q&A) ────────────────────────────────────────

export const questionAuthorOf = (s: RougeState, questionId: UUID) => s.session_question_authors.find((a) => a.question_id === questionId)?.user_id ?? null;
export const isMyQuestion = (s: RougeState, userId: UUID, questionId: UUID) => questionAuthorOf(s, questionId) === userId;
export const hasVoted = (s: RougeState, userId: UUID, questionId: UUID) => s.session_question_votes.some((v) => v.question_id === questionId && v.user_id === userId);

/** "Sofía Benítez · Estudio Benítez": cómo firma una pregunta no anónima (⇔ public.question_author_label). */
export function authorLabel(s: RougeState, eventId: UUID, userId: UUID): string {
  const face = faceOf(s, userId, eventId);
  const name = clean(face?.persona?.display_name) || clean(face?.full_name) || "Asistente";
  const company = clean(face?.persona?.company);
  return company ? `${name} · ${company}` : name;
}

const STATUS_ORDER: Record<QuestionStatus, number> = { open: 0, answered: 1, hidden: 2 };

/**
 * Preguntas de una charla para quien mira: destacada primero, después abiertas por votos ▲ (y antigüedad), después
 * respondidas. Las ocultas solo las ve la moderación (y su autor/a, que ve que quedó oculta).
 */
export function questionsFor(s: RougeState, sessionId: UUID, viewerId: UUID, moderator: boolean): SessionQuestion[] {
  return s.session_questions
    .filter((q) => q.session_id === sessionId && (q.status !== "hidden" || moderator || isMyQuestion(s, viewerId, q.id)))
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.upvotes - a.upvotes || a.created_at.localeCompare(b.created_at));
}

function liveCheck(s: RougeState, userId: UUID, sessionId: UUID): string | null {
  const se = getSession(s, sessionId);
  const why = participantCheck(s, userId, se);
  if (why) return why;
  return se!.is_live_now ? null : SCHEDULE_ERRORS.not_live;
}

/** Enviar una pregunta (⇔ public.ask_question). La autoría queda aparte, nunca en la pregunta. */
export function askQuestion(s: RougeState, userId: UUID, sessionId: UUID, body: string, anonymous: boolean, now = Date.now()): R<SessionQuestion> {
  const why = liveCheck(s, userId, sessionId);
  if (why) return fail(why);
  const text = body.trim().replace(/[ \t]+/g, " ");
  if (text.length < QUESTION_MIN || text.length > QUESTION_MAX) return fail(SCHEDULE_ERRORS.invalid_question);
  const mineOpen = s.session_questions.filter((q) => q.session_id === sessionId && q.status === "open" && isMyQuestion(s, userId, q.id)).length;
  if (mineOpen >= OPEN_QUESTIONS_MAX) return fail(SCHEDULE_ERRORS.too_many_questions);
  const se = getSession(s, sessionId)!;
  const q: SessionQuestion = {
    id: uid(),
    session_id: sessionId,
    event_id: se.event_id,
    body: text,
    is_anonymous: anonymous,
    author_label: anonymous ? null : authorLabel(s, se.event_id, userId),
    status: "open",
    is_featured: false,
    upvotes: 0,
    created_at: iso(now),
    answered_at: null,
  };
  return {
    ok: true,
    state: { ...s, session_questions: [...s.session_questions, q], session_question_authors: [...s.session_question_authors, { question_id: q.id, user_id: userId }] },
    data: q,
  };
}

/** Votar ▲ / sacar el voto (⇔ public.vote_question). */
export function toggleQuestionVote(s: RougeState, userId: UUID, questionId: UUID, now = Date.now()): R<{ voted: boolean; upvotes: number }> {
  const q = s.session_questions.find((x) => x.id === questionId);
  if (!q || q.status === "hidden") return fail(SCHEDULE_ERRORS.question_not_found);
  const why = liveCheck(s, userId, q.session_id);
  if (why) return fail(why);
  if (isMyQuestion(s, userId, questionId)) return fail(SCHEDULE_ERRORS.own_question);
  const voted = !hasVoted(s, userId, questionId);
  const upvotes = Math.max(0, q.upvotes + (voted ? 1 : -1));
  return {
    ok: true,
    state: {
      ...s,
      session_questions: s.session_questions.map((x) => (x.id === questionId ? { ...x, upvotes } : x)),
      session_question_votes: voted
        ? [...s.session_question_votes, { question_id: questionId, user_id: userId, created_at: iso(now) }]
        : s.session_question_votes.filter((v) => !(v.question_id === questionId && v.user_id === userId)),
    },
    data: { voted, upvotes },
  };
}

export type ModerationAction = "feature" | "unfeature" | "answer" | "reopen" | "hide" | "unhide";
export const MODERATION_ACTIONS: ModerationAction[] = ["feature", "unfeature", "answer", "reopen", "hide", "unhide"];

/**
 * Moderar (⇔ public.moderate_question): destacar (una sola por charla: la anterior deja de estarlo), marcar como
 * respondida, reabrir u ocultar. Respondida y oculta dejan de estar destacadas.
 */
export function moderateQuestion(s: RougeState, questionId: UUID, action: ModerationAction, now = Date.now()): R<SessionQuestion> {
  const q = s.session_questions.find((x) => x.id === questionId);
  if (!q) return fail(SCHEDULE_ERRORS.question_not_found);
  if (!MODERATION_ACTIONS.includes(action)) return fail("Acción de moderación inválida.");
  const patch: Partial<SessionQuestion> =
    action === "feature"
      ? { is_featured: true, status: "open", answered_at: null }
      : action === "unfeature"
        ? { is_featured: false }
        : action === "answer"
          ? { status: "answered", is_featured: false, answered_at: iso(now) }
          : action === "hide"
            ? { status: "hidden", is_featured: false }
            : { status: "open", answered_at: null }; // reopen / unhide
  const next: SessionQuestion = { ...q, ...patch };
  return {
    ok: true,
    state: {
      ...s,
      session_questions: s.session_questions.map((x) =>
        x.id === questionId ? next : action === "feature" && x.session_id === q.session_id && x.is_featured ? { ...x, is_featured: false } : x,
      ),
    },
    data: next,
  };
}

// ── Encuestas en vivo ────────────────────────────────────────────────

export const pollsOf = (s: RougeState, sessionId: UUID) => s.session_polls.filter((p) => p.session_id === sessionId).sort((a, b) => b.created_at.localeCompare(a.created_at));
export const openPoll = (s: RougeState, sessionId: UUID) => pollsOf(s, sessionId).find((p) => p.status === "open");
export const myPollVote = (s: RougeState, userId: UUID, pollId: UUID) => s.session_poll_votes.find((v) => v.poll_id === pollId && v.user_id === userId)?.option_id ?? null;

/** Totales y porcentajes enteros que suman 100 (mayor resto). */
export function pollTotals(p: Pick<SessionPoll, "options" | "results">): { total: number; rows: { option: PollOption; votes: number; pct: number }[] } {
  const votes = p.options.map((o) => Math.max(0, Math.floor(p.results[o.id] ?? 0)));
  const total = votes.reduce((a, b) => a + b, 0);
  if (!total) return { total, rows: p.options.map((option) => ({ option, votes: 0, pct: 0 })) };
  const raw = votes.map((v) => (v * 100) / total);
  const pct = raw.map(Math.floor);
  let left = 100 - pct.reduce((a, b) => a + b, 0);
  for (const i of raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest).map((x) => x.i)) {
    if (left <= 0) break;
    if (votes[i] > 0) (pct[i] += 1), left--;
  }
  return { total, rows: p.options.map((option, i) => ({ option, votes: votes[i], pct: pct[i] })) };
}

/** Lanzar una encuesta (⇔ public.launch_poll): cierra la que estaba abierta en esa charla. */
export function launchPoll(s: RougeState, sessionId: UUID, question: string, options: string[], now = Date.now()): R<SessionPoll> {
  const se = getSession(s, sessionId);
  if (!se) return fail(SCHEDULE_ERRORS.session_not_found);
  if (!hasFeature(s, se.event_id, "agenda")) return fail(NOT_IN_VERTICAL);
  if (!se.is_live_now) return fail(SCHEDULE_ERRORS.not_live);
  const text = clean(question);
  const labels = options.map(clean).filter(Boolean);
  const distinct = new Set(labels.map((l) => l.toLowerCase()));
  if (text.length < 3 || text.length > POLL_QUESTION_MAX || labels.length < POLL_OPTIONS_MIN || labels.length > POLL_OPTIONS_MAX || distinct.size !== labels.length || labels.some((l) => l.length > POLL_OPTION_MAX))
    return fail(SCHEDULE_ERRORS.invalid_poll);
  const opts: PollOption[] = labels.map((label, i) => ({ id: `o${i + 1}`, label }));
  const poll: SessionPoll = {
    id: uid(),
    session_id: sessionId,
    event_id: se.event_id,
    question: text,
    options: opts,
    results: Object.fromEntries(opts.map((o) => [o.id, 0])),
    status: "open",
    created_at: iso(now),
    closed_at: null,
  };
  return {
    ok: true,
    state: { ...s, session_polls: [...s.session_polls.map((p) => (p.session_id === sessionId && p.status === "open" ? { ...p, status: "closed" as const, closed_at: iso(now) } : p)), poll] },
    data: poll,
  };
}

/** Cerrar la encuesta (⇔ public.close_poll). */
export function closePoll(s: RougeState, pollId: UUID, now = Date.now()): R<SessionPoll> {
  const p = s.session_polls.find((x) => x.id === pollId);
  if (!p) return fail("Esa encuesta ya no existe.");
  const next: SessionPoll = p.status === "closed" ? p : { ...p, status: "closed", closed_at: iso(now) };
  return { ok: true, state: { ...s, session_polls: s.session_polls.map((x) => (x.id === pollId ? next : x)) }, data: next };
}

/** Votar en un toque (⇔ public.vote_poll). Mientras está abierta se puede cambiar el voto. */
export function votePoll(s: RougeState, userId: UUID, pollId: UUID, optionId: string, now = Date.now()): R<SessionPoll> {
  const p = s.session_polls.find((x) => x.id === pollId);
  if (!p) return fail("Esa encuesta ya no existe.");
  const why = liveCheck(s, userId, p.session_id);
  if (why) return fail(why);
  if (p.status !== "open") return fail(SCHEDULE_ERRORS.poll_closed);
  if (!p.options.some((o) => o.id === optionId)) return fail(SCHEDULE_ERRORS.invalid_option);
  const prev = myPollVote(s, userId, pollId);
  if (prev === optionId) return { ok: true, state: s, data: p };
  const results = { ...p.results, [optionId]: (p.results[optionId] ?? 0) + 1 };
  if (prev) results[prev] = Math.max(0, (results[prev] ?? 0) - 1);
  const next: SessionPoll = { ...p, results };
  return {
    ok: true,
    state: {
      ...s,
      session_polls: s.session_polls.map((x) => (x.id === pollId ? next : x)),
      session_poll_votes: [...s.session_poll_votes.filter((v) => !(v.poll_id === pollId && v.user_id === userId)), { poll_id: pollId, user_id: userId, option_id: optionId, created_at: iso(now) }],
    },
    data: next,
  };
}
