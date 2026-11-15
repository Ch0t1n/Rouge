/**
 * Motor de reglas de negocio de ROUGE — funciones PURAS.
 *
 *   (state, input, now) → { ok: true, state, data } | { ok: false, error }
 *
 * Nunca mutan el estado recibido. El RougeContext las ejecuta en modo demo
 * (localStorage); el adaptador de Supabase replica las mismas validaciones
 * con RLS + funciones RPC (ver supabase/schema.sql).
 */
import type {
  BarMenuItem,
  BarOrder,
  BarOrderItem,
  BlastSegment,
  Connection,
  DeliveryType,
  EventAttendee,
  EventBlast,
  EventInviteCode,
  InstagramLink,
  MapPin,
  Message,
  MessageType,
  MoodTag,
  PerkRule,
  PerkType,
  Profile,
  Raffle,
  RaffleFilter,
  RougeEvent,
  RougeState,
  SongRequest,
  Squad,
  SquadMember,
  StaffRole,
  UserPerkQR,
  UUID,
} from "@/lib/types";
import { addMs, minutes, normalizePhone, shortCode, uid } from "@/lib/utils";
import { VENUE_LAYOUT } from "@/lib/mock/seed";
import {
  activePinOf,
  connectionBetween,
  getAttendee,
  getEvent,
  getProfile,
  isBlockedBetween,
  isLobbyInteractive,
  isMatch,
  isPinActive,
  lobbyPhase,
  sectorAt,
  squadMembers,
  squadOf,
} from "./selectors";
import { BIO_MAX, MAX_PHOTOS, NAME_MAX, checkBirthDate, checkGenres, checkUsername, parseInstagram, parseSpotify } from "./profile";

export type Result<T = undefined> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };

const ok = <T>(state: RougeState, data: T): Result<T> => ({ ok: true, state, data });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (now: number) => new Date(now).toISOString();

export const PIN_TTL_MS = minutes(15);
export { MAX_PHOTOS };
export const MAX_SQUAD_SIZE = 12;

// Mensaje genérico para no filtrar la existencia de un bloqueo.
const UNAVAILABLE = "Este perfil no está disponible.";

function touch(state: RougeState, eventId: UUID, userId: UUID, now: number): RougeState {
  return {
    ...state,
    event_attendees: state.event_attendees.map((a) =>
      a.event_id === eventId && a.user_id === userId ? { ...a, last_active_at: iso(now) } : a,
    ),
  };
}

/** Agrega el sector a `visited_sectors` (alimenta el filtro "Coincidieron en tu zona"). */
function markVisited(state: RougeState, eventId: UUID, userId: UUID, sector: string | null): RougeState {
  if (!sector) return state;
  return {
    ...state,
    event_attendees: state.event_attendees.map((a) =>
      a.event_id === eventId && a.user_id === userId && !a.visited_sectors.includes(sector) ? { ...a, visited_sectors: [...a.visited_sectors, sector] } : a,
    ),
  };
}

function requireInteractive(state: RougeState, eventId: UUID, now: number) {
  const ev = getEvent(state, eventId);
  if (!ev) return fail("Evento inexistente.");
  if (!isLobbyInteractive(ev, now)) {
    return fail(lobbyPhase(ev, now) === "expired" ? "El lobby de este evento ya cerró." : "El lobby todavía no abrió.");
  }
  return null;
}

function systemMessage(eventId: UUID, squadId: UUID, senderId: UUID, content: string, now: number): Message {
  return {
    id: uid(),
    event_id: eventId,
    conversation_type: "squad",
    connection_id: null,
    squad_id: squadId,
    sender_id: senderId,
    message_type: "system_alert",
    content,
    media_url: null,
    created_at: iso(now),
  };
}

// ═════════════════════════════════════════════════════════════════════
// PERFIL Y PRIVACIDAD
// ═════════════════════════════════════════════════════════════════════

export type ProfileInput = Partial<Omit<Profile, "id" | "created_at" | "is_verified" | "phone_normalized" | "instagram_verified">> & {
  phone?: string | null;
};

// ── Instagram ────────────────────────────────────────────────────────

const linkOf = (s: RougeState, userId: UUID) => s.instagram_links.find((l) => l.user_id === userId);

/** Verificado ⇔ el @ del perfil es el de la cuenta conectada (mismo cálculo que el trigger profile_instagram). */
export function instagramVerified(s: RougeState, userId: UUID, username: string | null): boolean {
  const link = linkOf(s, userId);
  return !!username && !!link && link.username.toLowerCase() === username.toLowerCase();
}

/**
 * Conecta la cuenta de Instagram (en Supabase lo hace /api/instagram/callback con OAuth; acá es la regla
 * y el Modo Demo). El perfil pasa a mostrar ese @ como verificado.
 */
export function linkInstagram(state: RougeState, userId: UUID, username: string, now = Date.now()): Result<InstagramLink> {
  const ig = parseInstagram(username);
  if (!ig) return fail("Ese @ de Instagram no es válido.");
  if (state.instagram_links.some((l) => l.user_id !== userId && l.username.toLowerCase() === ig)) return fail("Esa cuenta de Instagram ya está conectada a otro perfil.");
  const link: InstagramLink = { user_id: userId, username: ig, account_type: linkOf(state, userId)?.account_type ?? "CREATOR", connected_at: iso(now) };
  const links = [...state.instagram_links.filter((l) => l.user_id !== userId), link];
  const profiles = state.profiles.map((p) => (p.id === userId ? { ...p, instagram_username: ig, instagram_verified: true } : p));
  return ok({ ...state, instagram_links: links, profiles }, link);
}

/** Desconecta Instagram: borra el token (servidor) y saca el @ del perfil. */
export function unlinkInstagram(state: RougeState, userId: UUID): Result {
  return ok(
    {
      ...state,
      instagram_links: state.instagram_links.filter((l) => l.user_id !== userId),
      profiles: state.profiles.map((p) => (p.id === userId ? { ...p, instagram_username: null, instagram_verified: false } : p)),
    },
    undefined,
  );
}

export function upsertProfile(state: RougeState, userId: UUID, input: ProfileInput, now = Date.now()): Result<Profile> {
  const existing = getProfile(state, userId);

  if (input.username !== undefined) {
    const u = checkUsername(state, input.username, userId);
    if (!u.ok) return fail(u.error);
    input = { ...input, username: u.value };
  }
  if (input.full_name !== undefined) {
    const name = input.full_name.trim().replace(/\s+/g, " ");
    if (!name) return fail("Ingresá tu nombre.");
    if (name.length > NAME_MAX) return fail(`El nombre tiene un máximo de ${NAME_MAX} caracteres.`);
    input = { ...input, full_name: name };
  }
  if (input.birth_date !== undefined) {
    const err = checkBirthDate(input.birth_date, new Date(now));
    if (err) return fail(err);
  }
  if (input.photos && input.photos.length > MAX_PHOTOS) return fail(`Máximo ${MAX_PHOTOS} fotos.`);
  if (input.music_genres) {
    const err = checkGenres(input.music_genres);
    if (err) return fail(err);
  }
  if (input.bio !== undefined) {
    if (input.bio.length > BIO_MAX) return fail(`La bio tiene un máximo de ${BIO_MAX} caracteres.`);
    input = { ...input, bio: input.bio.trim() };
  }
  if (input.spotify_embed_url) {
    // Acepta el link "compartir" de Spotify y lo guarda como URL de embed limpia.
    const ref = parseSpotify(input.spotify_embed_url);
    if (!ref) return fail("Link de Spotify inválido.");
    input = { ...input, spotify_embed_url: ref.embedUrl };
  }

  if (input.instagram_username !== undefined && input.instagram_username !== null && input.instagram_username !== "") {
    const ig = parseInstagram(input.instagram_username);
    if (!ig) return fail("Ese @ de Instagram no es válido.");
    input = { ...input, instagram_username: ig };
  } else if (input.instagram_username === "") {
    input = { ...input, instagram_username: null };
  }

  let phone_normalized = existing?.phone_normalized ?? null;
  if (input.phone !== undefined) {
    phone_normalized = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !phone_normalized) return fail("Número de teléfono inválido.");
    if (phone_normalized && state.profiles.some((p) => p.id !== userId && p.phone_normalized === phone_normalized)) {
      return fail("Ese teléfono ya está asociado a otra cuenta.");
    }
  }
  const { phone: _phone, ...rest } = input;

  if (!existing) {
    if (!rest.username || !rest.full_name || !rest.birth_date) return fail("Faltan nombre, @username o fecha de nacimiento.");
    const profile: Profile = {
      id: userId,
      username: rest.username,
      full_name: rest.full_name,
      birth_date: rest.birth_date,
      gender: rest.gender ?? "undisclosed",
      phone_normalized,
      bio: rest.bio ?? "",
      photos: rest.photos ?? [],
      loop_video_url: rest.loop_video_url ?? null,
      music_genres: rest.music_genres ?? [],
      spotify_embed_url: rest.spotify_embed_url ?? null,
      // Login con Instagram antes del onboarding: el perfil nace con el @ de la cuenta conectada.
      instagram_username: rest.instagram_username ?? linkOf(state, userId)?.username ?? null,
      instagram_verified: false,
      is_verified: false,
      created_at: iso(now),
    };
    profile.instagram_verified = instagramVerified(state, userId, profile.instagram_username);
    return ok({ ...state, profiles: [...state.profiles, profile] }, profile);
  }

  const merged: Profile = { ...existing, ...rest, phone_normalized };
  const profile: Profile = { ...merged, instagram_verified: instagramVerified(state, userId, merged.instagram_username) };
  return ok({ ...state, profiles: state.profiles.map((p) => (p.id === userId ? profile : p)) }, profile);
}

export function blockUser(state: RougeState, blockerId: UUID, blockedUserId: UUID, now = Date.now()): Result {
  if (blockerId === blockedUserId) return fail("No podés bloquearte a vos mismo.");
  if (state.user_blocks.some((b) => b.blocker_id === blockerId && b.blocked_user_id === blockedUserId)) return ok(state, undefined);
  let next: RougeState = {
    ...state,
    user_blocks: [
      ...state.user_blocks,
      { id: uid(), blocker_id: blockerId, blocked_user_id: blockedUserId, blocked_phone_normalized: null, created_at: iso(now) },
    ],
  };
  next = severTies(next, blockerId, blockedUserId);
  return ok(next, undefined);
}

export function blockPhone(state: RougeState, blockerId: UUID, rawPhone: string, now = Date.now()): Result<string> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return fail("Número de teléfono inválido.");
  const me = getProfile(state, blockerId);
  if (me?.phone_normalized === phone) return fail("Ese es tu propio número.");
  if (state.user_blocks.some((b) => b.blocker_id === blockerId && b.blocked_phone_normalized === phone)) return ok(state, phone);
  let next: RougeState = {
    ...state,
    user_blocks: [
      ...state.user_blocks,
      { id: uid(), blocker_id: blockerId, blocked_user_id: null, blocked_phone_normalized: phone, created_at: iso(now) },
    ],
  };
  const target = state.profiles.find((p) => p.phone_normalized === phone);
  if (target) next = severTies(next, blockerId, target.id);
  return ok(next, phone);
}

export function unblock(state: RougeState, blockerId: UUID, blockId: UUID): Result {
  return ok(
    { ...state, user_blocks: state.user_blocks.filter((b) => !(b.id === blockId && b.blocker_id === blockerId)) },
    undefined,
  );
}

/** Al bloquear: se cancelan solicitudes pendientes y se quitan pines compartidos entre ambos. */
function severTies(state: RougeState, a: UUID, b: UUID): RougeState {
  return {
    ...state,
    connections: state.connections.map((c) =>
      c.status === "pending" &&
      ((c.sender_id === a && c.receiver_id === b) || (c.sender_id === b && c.receiver_id === a))
        ? { ...c, status: "rejected" }
        : c,
    ),
    map_pins: state.map_pins.map((p) =>
      p.user_id === a || p.user_id === b
        ? { ...p, shared_match_ids: p.shared_match_ids.filter((id) => id !== a && id !== b) }
        : p,
    ),
  };
}

// ═════════════════════════════════════════════════════════════════════
// INGRESO AL EVENTO
// ═════════════════════════════════════════════════════════════════════

export interface ResolvedCode {
  event: RougeEvent;
  via: EventAttendee["joined_via"];
  inviteCode?: EventInviteCode;
  squad?: Squad;
}

export function resolveAccessCode(state: RougeState, rawCode: string): ResolvedCode | null {
  const code = rawCode.trim();
  const upper = code.toUpperCase();
  const byMaster = state.events.find((e) => e.master_invite_code.toUpperCase() === upper || e.slug === code.toLowerCase());
  if (byMaster) return { event: byMaster, via: "master_link" };
  const inviteCode = state.event_invite_codes.find((c) => c.code.toUpperCase() === upper);
  if (inviteCode) {
    const event = getEvent(state, inviteCode.event_id);
    return event ? { event, via: "single_use_code", inviteCode } : null;
  }
  const squad = state.squads.find((s) => s.invite_code.toUpperCase() === upper);
  if (squad) {
    const event = getEvent(state, squad.event_id);
    return event ? { event, via: "squad_link", squad } : null;
  }
  return null;
}

export function joinEvent(
  state: RougeState,
  userId: UUID,
  code: string,
  mood: MoodTag,
  now = Date.now(),
): Result<{ eventId: UUID; squadId?: UUID }> {
  if (!getProfile(state, userId)) return fail("Primero creá tu perfil.");
  const resolved = resolveAccessCode(state, code);
  if (!resolved) return fail("Código o link inválido.");
  const { event, via, inviteCode, squad } = resolved;

  const phase = lobbyPhase(event, now);
  if (phase === "upcoming") return fail("El lobby todavía no abrió. Volvé más cerca de la fiesta.");
  if (phase === "expired") return fail("Este lobby ya cerró.");

  const existing = getAttendee(state, event.id, userId);
  let next = state;

  if (existing) {
    next = {
      ...next,
      event_attendees: next.event_attendees.map((a) => (a.id === existing.id ? { ...a, mood_tag: mood, last_active_at: iso(now) } : a)),
    };
  } else {
    const count = state.event_attendees.filter((a) => a.event_id === event.id).length;
    if (via !== "single_use_code" && count >= event.max_capacity) return fail("El evento alcanzó su cupo máximo en la app.");
    if (inviteCode?.is_used && inviteCode.used_by_user_id !== userId) return fail("Este código ya fue utilizado.");

    const attendee: EventAttendee = {
      id: uid(),
      event_id: event.id,
      user_id: userId,
      mood_tag: mood,
      ghost_mode: false,
      visited_sectors: [],
      only_liked_can_icebreak: false,
      icebreaker_used: false,
      total_spent: 0,
      joined_via: via,
      last_active_at: iso(now),
      joined_at: iso(now),
    };
    next = { ...next, event_attendees: [...next.event_attendees, attendee] };
    if (inviteCode) {
      next = {
        ...next,
        event_invite_codes: next.event_invite_codes.map((c) =>
          c.id === inviteCode.id ? { ...c, is_used: true, used_by_user_id: userId, used_at: iso(now) } : c,
        ),
      };
    }
  }
  next = { ...next, active_event_id: event.id };

  if (squad) {
    const r = joinSquad(next, userId, squad.id, now);
    if (r.ok) return ok(r.state, { eventId: event.id, squadId: squad.id });
  }
  return ok(next, { eventId: event.id });
}

export function updateAttendeeSettings(
  state: RougeState,
  eventId: UUID,
  userId: UUID,
  patch: Partial<Pick<EventAttendee, "mood_tag" | "ghost_mode" | "only_liked_can_icebreak">>,
  now = Date.now(),
): Result {
  if (!getAttendee(state, eventId, userId)) return fail("No estás en este evento.");
  return ok(
    {
      ...state,
      event_attendees: state.event_attendees.map((a) =>
        a.event_id === eventId && a.user_id === userId ? { ...a, ...patch, last_active_at: iso(now) } : a,
      ),
    },
    undefined,
  );
}

// ═════════════════════════════════════════════════════════════════════
// CONEXIONES, MATCHES Y ROMPEHIELOS
// ═════════════════════════════════════════════════════════════════════

function validatePair(state: RougeState, eventId: UUID, senderId: UUID, receiverId: UUID, now: number) {
  const gate = requireInteractive(state, eventId, now);
  if (gate) return gate;
  if (senderId === receiverId) return fail("No podés conectar con vos mismo.");
  const sender = getAttendee(state, eventId, senderId);
  if (!sender) return fail("No estás en este evento.");
  if (sender.ghost_mode) return fail("Estás en Modo Solo Amigos. Desactivalo para conectar con gente nueva.");
  const receiver = getAttendee(state, eventId, receiverId);
  if (!receiver || isBlockedBetween(state, senderId, receiverId)) return fail(UNAVAILABLE);
  return null;
}

export function sendConnection(
  state: RougeState,
  eventId: UUID,
  senderId: UUID,
  receiverId: UUID,
  now = Date.now(),
): Result<{ connection: Connection; matched: boolean }> {
  const err = validatePair(state, eventId, senderId, receiverId, now);
  if (err) return err;
  const receiver = getAttendee(state, eventId, receiverId)!;

  const existing = connectionBetween(state, eventId, senderId, receiverId);
  if (existing.some((c) => c.status === "accepted")) return fail("Ya hicieron match.");
  if (existing.some((c) => c.sender_id === senderId && c.status === "pending")) return fail("Ya le enviaste una solicitud.");

  // Like recíproco → match inmediato
  const reciprocal = existing.find((c) => c.sender_id === receiverId && c.status === "pending");
  if (reciprocal) {
    const accepted: Connection = { ...reciprocal, status: "accepted", responded_at: iso(now) };
    let next: RougeState = { ...state, connections: state.connections.map((c) => (c.id === reciprocal.id ? accepted : c)) };
    next = seedIcebreakerMessage(next, accepted, now);
    return ok(touch(next, eventId, senderId, now), { connection: accepted, matched: true });
  }

  if (existing.some((c) => c.sender_id === receiverId && c.status === "rejected")) return fail(UNAVAILABLE);
  if (receiver.ghost_mode) return fail(UNAVAILABLE);

  const connection: Connection = {
    id: uid(),
    event_id: eventId,
    sender_id: senderId,
    receiver_id: receiverId,
    type: "regular",
    icebreaker_message: null,
    attached_drink_qr_id: null,
    status: "pending",
    created_at: iso(now),
    responded_at: null,
  };
  return ok(touch({ ...state, connections: [...state.connections, connection] }, eventId, senderId, now), {
    connection,
    matched: false,
  });
}

export function respondConnection(
  state: RougeState,
  connectionId: UUID,
  userId: UUID,
  accept: boolean,
  now = Date.now(),
): Result<Connection> {
  const c = state.connections.find((x) => x.id === connectionId);
  if (!c) return fail("Solicitud inexistente.");
  if (c.receiver_id !== userId) return fail("Esta solicitud no es para vos.");
  if (c.status !== "pending") return fail("Esta solicitud ya fue respondida.");
  if (accept && isBlockedBetween(state, c.sender_id, c.receiver_id)) return fail(UNAVAILABLE);

  const updated: Connection = { ...c, status: accept ? "accepted" : "rejected", responded_at: iso(now) };
  let next: RougeState = { ...state, connections: state.connections.map((x) => (x.id === c.id ? updated : x)) };
  if (accept) next = seedIcebreakerMessage(next, updated, now);
  return ok(touch(next, c.event_id, userId, now), updated);
}

/** El texto del rompehielos se convierte en el primer mensaje del chat al aceptar. */
function seedIcebreakerMessage(state: RougeState, c: Connection, now: number): RougeState {
  if (c.type !== "icebreaker" || !c.icebreaker_message) return state;
  if (state.messages.some((m) => m.connection_id === c.id)) return state;
  const msg: Message = {
    id: uid(),
    event_id: c.event_id,
    conversation_type: "direct",
    connection_id: c.id,
    squad_id: null,
    sender_id: c.sender_id,
    message_type: "text",
    content: c.icebreaker_message,
    media_url: null,
    created_at: c.created_at < iso(now) ? c.created_at : iso(now),
  };
  return { ...state, messages: [...state.messages, msg] };
}

export const ICEBREAKER_MAX = 140;
export const GIFTABLE_CATEGORIES: BarMenuItem["category"][] = ["trago", "cerveza", "sin_alcohol"];

/**
 * ¿Puede `senderId` mandarle su Rompehielos a `receiverId`? Devuelve null si
 * puede o el motivo (para deshabilitar el botón ANTES de que escriba).
 */
export function icebreakerEligibility(state: RougeState, eventId: UUID, senderId: UUID, receiverId: UUID, now = Date.now()): string | null {
  const err = validatePair(state, eventId, senderId, receiverId, now);
  if (err) return err.error;
  const sender = getAttendee(state, eventId, senderId)!;
  const receiver = getAttendee(state, eventId, receiverId)!;
  if (sender.icebreaker_used) return "Ya usaste tu Rompehielos de esta noche.";
  if (receiver.ghost_mode) return UNAVAILABLE;
  const existing = connectionBetween(state, eventId, senderId, receiverId);
  if (existing.some((c) => c.status === "accepted")) return "Ya hicieron match: escribile por chat.";
  if (existing.some((c) => c.status === "rejected")) return UNAVAILABLE;
  if (existing.some((c) => c.sender_id === senderId && c.type === "icebreaker")) return "Ya le enviaste un Rompehielos.";
  if (receiver.only_liked_can_icebreak && !existing.some((c) => c.sender_id === receiverId)) {
    return "Esta persona solo recibe Rompehielos de gente a la que conectó primero.";
  }
  return null;
}

export interface IcebreakerInput {
  message: string;
  /** Fase 2: adjuntar un "Trago Rompehielos" prepago (id de ítem del menú). */
  giftDrinkItemId?: string;
}

export function sendIcebreaker(
  state: RougeState,
  eventId: UUID,
  senderId: UUID,
  receiverId: UUID,
  input: IcebreakerInput,
  now = Date.now(),
): Result<Connection> {
  const blocked = icebreakerEligibility(state, eventId, senderId, receiverId, now);
  if (blocked) return fail(blocked);
  const sender = getAttendee(state, eventId, senderId)!;
  const text = input.message.trim();
  if (!text) return fail("Escribí un mensaje para romper el hielo.");
  if (text.length > ICEBREAKER_MAX) return fail(`Máximo ${ICEBREAKER_MAX} caracteres.`);

  let next = state;
  let drinkPerkId: UUID | null = null;

  if (input.giftDrinkItemId) {
    const item = state.bar_menu.find((i) => i.id === input.giftDrinkItemId);
    if (!item) return fail("Trago inexistente.");
    if (!GIFTABLE_CATEGORIES.includes(item.category)) return fail("Solo se pueden regalar tragos individuales.");
    const order = makeOrder(state, eventId, senderId, "icebreaker_gift", [{ item_id: item.id, name: item.name, qty: 1, unit_price: item.price }], {}, now);
    const perk = makePerk(eventId, receiverId, null, `${item.emoji} ${item.name} — regalo Rompehielos`, "gifted_drink", "icebreaker_gift", order.id, now);
    drinkPerkId = perk.id;
    next = addSpend({ ...next, bar_orders: [...next.bar_orders, order], user_perks_qrs: [...next.user_perks_qrs, perk] }, eventId, [[senderId, item.price]]);
  }

  // Si ya había una solicitud regular mía pendiente, el rompehielos la reemplaza.
  const connection: Connection = {
    id: uid(),
    event_id: eventId,
    sender_id: senderId,
    receiver_id: receiverId,
    type: "icebreaker",
    icebreaker_message: text,
    attached_drink_qr_id: drinkPerkId,
    status: "pending",
    created_at: iso(now),
    responded_at: null,
  };
  next = {
    ...next,
    connections: [
      ...next.connections.filter(
        (c) => !(c.event_id === eventId && c.sender_id === senderId && c.receiver_id === receiverId && c.status === "pending"),
      ),
      connection,
    ],
    event_attendees: next.event_attendees.map((a) => (a.id === sender.id ? { ...a, icebreaker_used: true } : a)),
  };
  return ok(touch(next, eventId, senderId, now), connection);
}

// ═════════════════════════════════════════════════════════════════════
// SQUADS Y SEGURIDAD
// ═════════════════════════════════════════════════════════════════════

export function createSquad(state: RougeState, eventId: UUID, userId: UUID, name: string, now = Date.now()): Result<Squad> {
  const gate = requireInteractive(state, eventId, now);
  if (gate) return gate;
  if (!getAttendee(state, eventId, userId)) return fail("No estás en este evento.");
  if (squadOf(state, eventId, userId)) return fail("Ya estás en un Squad para este evento.");
  const clean = name.trim() || "Mi Squad";
  const squad: Squad = {
    id: uid(),
    event_id: eventId,
    name: clean.slice(0, 32),
    invite_code: shortCode(6, "SQ"),
    has_vip_table_to_share: false,
    base_pin_x: null,
    base_pin_y: null,
    base_pin_label: null,
    created_by: userId,
    created_at: iso(now),
  };
  const member: SquadMember = {
    id: uid(),
    squad_id: squad.id,
    user_id: userId,
    invited_by: null,
    status: "joined",
    safety_status: "ok",
    joined_at: iso(now),
  };
  return ok({ ...state, squads: [...state.squads, squad], squad_members: [...state.squad_members, member] }, squad);
}

export function inviteToSquad(state: RougeState, squadId: UUID, inviterId: UUID, inviteeId: UUID, now = Date.now()): Result<SquadMember> {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return fail("Squad inexistente.");
  const gate = requireInteractive(state, squad.event_id, now);
  if (gate) return gate;
  const members = squadMembers(state, squadId, "any");
  if (!members.some((m) => m.user_id === inviterId && m.status === "joined")) return fail("No sos parte de este Squad.");
  if (!getAttendee(state, squad.event_id, inviteeId)) return fail("Esa persona no está en el evento.");
  if (members.some((m) => isBlockedBetween(state, m.user_id, inviteeId))) return fail(UNAVAILABLE);
  if (members.some((m) => m.user_id === inviteeId)) return fail("Ya está en el Squad o tiene una invitación pendiente.");
  if (squadOf(state, squad.event_id, inviteeId)) return fail("Esa persona ya está en otro Squad.");
  if (members.filter((m) => m.status === "joined").length >= MAX_SQUAD_SIZE) return fail("El Squad está completo.");

  const member: SquadMember = {
    id: uid(),
    squad_id: squadId,
    user_id: inviteeId,
    invited_by: inviterId,
    status: "invited",
    safety_status: "ok",
    joined_at: null,
  };
  return ok({ ...state, squad_members: [...state.squad_members, member] }, member);
}

export function joinSquad(state: RougeState, userId: UUID, squadId: UUID, now = Date.now()): Result<{ grantedPerks: UserPerkQR[] }> {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return fail("Squad inexistente.");
  const gate = requireInteractive(state, squad.event_id, now);
  if (gate) return gate;
  if (!getAttendee(state, squad.event_id, userId)) return fail("Primero entrá al evento.");
  const current = squadOf(state, squad.event_id, userId);
  if (current?.squad.id === squadId) return ok(state, { grantedPerks: [] });
  if (current) return fail("Ya estás en otro Squad. Salí primero.");
  const joined = squadMembers(state, squadId);
  if (joined.some((m) => isBlockedBetween(state, m.user_id, userId))) return fail(UNAVAILABLE);
  if (joined.length >= MAX_SQUAD_SIZE) return fail("El Squad está completo.");

  const invite = state.squad_members.find((m) => m.squad_id === squadId && m.user_id === userId);
  let next: RougeState = invite
    ? {
        ...state,
        squad_members: state.squad_members.map((m) => (m.id === invite.id ? { ...m, status: "joined", joined_at: iso(now) } : m)),
      }
    : {
        ...state,
        squad_members: [
          ...state.squad_members,
          { id: uid(), squad_id: squadId, user_id: userId, invited_by: null, status: "joined", safety_status: "ok", joined_at: iso(now) },
        ],
      };
  // Invitaciones a otros squads del mismo evento quedan sin efecto
  next = {
    ...next,
    squad_members: next.squad_members.filter(
      (m) => !(m.user_id === userId && m.status === "invited" && m.squad_id !== squadId && state.squads.find((s) => s.id === m.squad_id)?.event_id === squad.event_id),
    ),
  };
  const name = getProfile(state, userId)?.full_name.split(" ")[0] ?? "Alguien";
  next = { ...next, messages: [...next.messages, systemMessage(squad.event_id, squadId, userId, `👋 ${name} se sumó al Squad`, now)] };

  const r = applySquadPerkRules(next, squadId, now);
  return ok(r.state, { grantedPerks: r.granted });
}

export function leaveSquad(state: RougeState, userId: UUID, squadId: UUID): Result {
  return ok({ ...state, squad_members: state.squad_members.filter((m) => !(m.squad_id === squadId && m.user_id === userId)) }, undefined);
}

export function declineSquadInvite(state: RougeState, userId: UUID, memberId: UUID): Result {
  return ok({ ...state, squad_members: state.squad_members.filter((m) => !(m.id === memberId && m.user_id === userId && m.status === "invited")) }, undefined);
}

export function updateSquad(
  state: RougeState,
  squadId: UUID,
  userId: UUID,
  patch: Partial<Pick<Squad, "name" | "has_vip_table_to_share">>,
): Result {
  if (!squadMembers(state, squadId).some((m) => m.user_id === userId)) return fail("No sos parte de este Squad.");
  return ok({ ...state, squads: state.squads.map((s) => (s.id === squadId ? { ...s, ...patch } : s)) }, undefined);
}

export function setSquadBasePin(state: RougeState, squadId: UUID, userId: UUID, x: number, y: number, label: string, now = Date.now()): Result {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return fail("Squad inexistente.");
  if (!squadMembers(state, squadId).some((m) => m.user_id === userId)) return fail("No sos parte de este Squad.");
  const lbl = label.trim() || "Nuestro Punto de Encuentro";
  const next: RougeState = {
    ...state,
    squads: state.squads.map((s) => (s.id === squadId ? { ...s, base_pin_x: x, base_pin_y: y, base_pin_label: lbl } : s)),
    messages: [...state.messages, systemMessage(squad.event_id, squadId, userId, `🚩 Nuevo Punto Base: ${lbl}`, now)],
  };
  return ok(next, undefined);
}

export function announceBaseMeetup(state: RougeState, squadId: UUID, userId: UUID, inMinutes = 10, now = Date.now()): Result {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return fail("Squad inexistente.");
  if (squad.base_pin_x == null) return fail("Primero fijá un Punto Base en el plano.");
  return ok(
    { ...state, messages: [...state.messages, systemMessage(squad.event_id, squadId, userId, `🚩 ¡Nos vemos en el Punto Base en ${inMinutes} min!`, now)] },
    undefined,
  );
}

/**
 * 🚨 Botón de Rescate: clava el pin del usuario (o usa su último pin activo),
 * lo comparte con su Squad, marca safety_status y dispara alerta en el chat.
 */
export function triggerRescue(
  state: RougeState,
  eventId: UUID,
  userId: UUID,
  coords?: { x: number; y: number },
  now = Date.now(),
): Result<MapPin> {
  const sq = squadOf(state, eventId, userId);
  if (!sq) return fail("Necesitás un Squad para usar el Botón de Rescate.");
  const last = activePinOf(state, eventId, userId, now);
  const ev = getEvent(state, eventId)!;
  const x = coords?.x ?? last?.coord_x ?? 50;
  const y = coords?.y ?? last?.coord_y ?? 50;
  const sector = sectorAt(ev.venue_layout_json.sectors, x, y)?.name ?? null;
  const pin: MapPin = {
    id: uid(),
    event_id: eventId,
    user_id: userId,
    coord_x: x,
    coord_y: y,
    sector_name: sector,
    note: "🚨 Necesito ayuda — vengan a mi pin",
    is_rescue_alert: true,
    share_with_squad: true,
    shared_match_ids: last?.shared_match_ids ?? [],
    expires_at: addMs(iso(now), PIN_TTL_MS),
    created_at: iso(now),
  };
  const name = getProfile(state, userId)?.full_name.split(" ")[0] ?? "Alguien";
  const next: RougeState = {
    ...state,
    map_pins: [...state.map_pins.filter((p) => !(p.event_id === eventId && p.user_id === userId && isPinActive(p, now))), pin],
    squad_members: state.squad_members.map((m) => (m.id === sq.member.id ? { ...m, safety_status: "rescue_needed" } : m)),
    messages: [
      ...state.messages,
      systemMessage(eventId, sq.squad.id, userId, `🚨 RESCATE: ${name} necesita que vayan a su pin${sector ? ` (${sector})` : ""}`, now),
    ],
  };
  return ok(markVisited(next, eventId, userId, sector), pin);
}

export function resolveRescue(state: RougeState, eventId: UUID, userId: UUID, now = Date.now()): Result {
  const sq = squadOf(state, eventId, userId);
  if (!sq) return fail("No estás en un Squad.");
  const name = getProfile(state, userId)?.full_name.split(" ")[0] ?? "Alguien";
  return ok(
    {
      ...state,
      squad_members: state.squad_members.map((m) => (m.id === sq.member.id ? { ...m, safety_status: "ok" } : m)),
      map_pins: state.map_pins.map((p) =>
        p.event_id === eventId && p.user_id === userId && p.is_rescue_alert ? { ...p, is_rescue_alert: false } : p,
      ),
      messages: [...state.messages, systemMessage(eventId, sq.squad.id, userId, `✅ ${name} ya está bien`, now)],
    },
    undefined,
  );
}

export function markHomeSafe(state: RougeState, eventId: UUID, userId: UUID, now = Date.now()): Result {
  const sq = squadOf(state, eventId, userId);
  if (!sq) return fail("No estás en un Squad.");
  const name = getProfile(state, userId)?.full_name.split(" ")[0] ?? "Alguien";
  return ok(
    {
      ...state,
      squad_members: state.squad_members.map((m) => (m.id === sq.member.id ? { ...m, safety_status: "home_safe" } : m)),
      map_pins: state.map_pins.filter((p) => !(p.event_id === eventId && p.user_id === userId)),
      messages: [...state.messages, systemMessage(eventId, sq.squad.id, userId, `🏠 ${name} llegó bien a casa`, now)],
    },
    undefined,
  );
}

// ═════════════════════════════════════════════════════════════════════
// PLANO: PIN-DROP DE 15 MINUTOS
// ═════════════════════════════════════════════════════════════════════

export interface DropPinInput {
  x: number;
  y: number;
  shareWithSquad: boolean;
  matchIds: UUID[];
  note?: string;
}

export function dropPin(state: RougeState, eventId: UUID, userId: UUID, input: DropPinInput, now = Date.now()): Result<MapPin> {
  const gate = requireInteractive(state, eventId, now);
  if (gate) return gate;
  if (!getAttendee(state, eventId, userId)) return fail("No estás en este evento.");
  if (input.x < 0 || input.x > 100 || input.y < 0 || input.y > 100) return fail("Ubicación fuera del plano.");
  const sq = squadOf(state, eventId, userId);
  const shareWithSquad = input.shareWithSquad && !!sq;
  const matchIds = [...new Set(input.matchIds)].filter((id) => isMatch(state, eventId, userId, id) && !isBlockedBetween(state, userId, id));
  if (!shareWithSquad && matchIds.length === 0) return fail("Elegí con quién compartir tu pin.");

  const ev = getEvent(state, eventId)!;
  const pin: MapPin = {
    id: uid(),
    event_id: eventId,
    user_id: userId,
    coord_x: input.x,
    coord_y: input.y,
    sector_name: sectorAt(ev.venue_layout_json.sectors, input.x, input.y)?.name ?? null,
    note: input.note?.trim().slice(0, 60) || null,
    is_rescue_alert: false,
    share_with_squad: shareWithSquad,
    shared_match_ids: matchIds,
    expires_at: addMs(iso(now), PIN_TTL_MS),
    created_at: iso(now),
  };
  // 1 pin activo por usuario: el nuevo reemplaza al anterior
  const next: RougeState = markVisited(
    { ...state, map_pins: [...state.map_pins.filter((p) => !(p.event_id === eventId && p.user_id === userId)), pin] },
    eventId,
    userId,
    pin.sector_name,
  );
  return ok(touch(next, eventId, userId, now), pin);
}

export function removePin(state: RougeState, pinId: UUID, userId: UUID): Result {
  return ok({ ...state, map_pins: state.map_pins.filter((p) => !(p.id === pinId && p.user_id === userId)) }, undefined);
}

export function purgeExpiredPins(state: RougeState, now = Date.now()): RougeState {
  const keep = state.map_pins.filter((p) => isPinActive(p, now));
  return keep.length === state.map_pins.length ? state : { ...state, map_pins: keep };
}

// ═════════════════════════════════════════════════════════════════════
// CHAT
// ═════════════════════════════════════════════════════════════════════

export type ConversationRef = { type: "direct"; connectionId: UUID } | { type: "squad"; squadId: UUID };

export function sendMessage(
  state: RougeState,
  senderId: UUID,
  to: ConversationRef,
  body: { type?: MessageType; content: string; mediaUrl?: string | null },
  now = Date.now(),
): Result<Message> {
  const type = body.type ?? "text";
  const content = body.content.trim();
  if (type === "text" && !content) return fail("Mensaje vacío.");
  if (type === "image" && !body.mediaUrl) return fail("Falta la imagen.");
  if (content.length > 1000) return fail("Mensaje demasiado largo.");

  let eventId: UUID;
  if (to.type === "direct") {
    const c = state.connections.find((x) => x.id === to.connectionId);
    if (!c || c.status !== "accepted") return fail("Solo podés chatear con tus matches.");
    if (c.sender_id !== senderId && c.receiver_id !== senderId) return fail("No sos parte de esta conversación.");
    if (isBlockedBetween(state, c.sender_id, c.receiver_id)) return fail(UNAVAILABLE);
    eventId = c.event_id;
  } else {
    const sq = state.squads.find((s) => s.id === to.squadId);
    if (!sq) return fail("Squad inexistente.");
    if (!squadMembers(state, sq.id).some((m) => m.user_id === senderId)) return fail("No sos parte de este Squad.");
    eventId = sq.event_id;
  }

  const msg: Message = {
    id: uid(),
    event_id: eventId,
    conversation_type: to.type,
    connection_id: to.type === "direct" ? to.connectionId : null,
    squad_id: to.type === "squad" ? to.squadId : null,
    sender_id: senderId,
    message_type: type,
    content,
    media_url: body.mediaUrl ?? null,
    created_at: iso(now),
  };
  return ok(touch({ ...state, messages: [...state.messages, msg] }, eventId, senderId, now), msg);
}

// ═════════════════════════════════════════════════════════════════════
// PERKS, SORTEOS Y QR DROPS
// ═════════════════════════════════════════════════════════════════════

function makePerk(
  eventId: UUID,
  userId: UUID,
  squadId: UUID | null,
  title: string,
  perkType: PerkType,
  source: UserPerkQR["source"],
  sourceRef: UUID | null,
  now: number,
): UserPerkQR {
  return {
    id: uid(),
    event_id: eventId,
    user_id: userId,
    squad_id: squadId,
    title,
    perk_type: perkType,
    qr_code_string: `ROUGE:${perkType.toUpperCase()}:${shortCode(10)}`,
    status: "available",
    source,
    source_ref_id: sourceRef,
    redeemed_at: null,
    created_at: iso(now),
  };
}

/** Aplica reglas "Squad de N miembros antes de HH:MM" → 1 QR por integrante (idempotente). */
export function applySquadPerkRules(state: RougeState, squadId: UUID, now = Date.now()): { state: RougeState; granted: UserPerkQR[] } {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return { state, granted: [] };
  const members = squadMembers(state, squadId);
  const granted: UserPerkQR[] = [];
  for (const rule of state.perk_rules) {
    if (rule.event_id !== squad.event_id || !rule.is_active || rule.trigger.kind !== "squad_size") continue;
    if (members.length < rule.trigger.min_members) continue;
    if (rule.trigger.before && now > +new Date(rule.trigger.before)) continue;
    for (const m of members) {
      const already = state.user_perks_qrs.some((p) => p.user_id === m.user_id && p.source_ref_id === rule.id);
      if (!already) granted.push(makePerk(squad.event_id, m.user_id, squadId, rule.title, rule.perk_type, "perk_rule", rule.id, now));
    }
  }
  return granted.length ? { state: { ...state, user_perks_qrs: [...state.user_perks_qrs, ...granted] }, granted } : { state, granted };
}

export function grantPerk(
  state: RougeState,
  eventId: UUID,
  userId: UUID,
  title: string,
  perkType: PerkType,
  now = Date.now(),
): Result<UserPerkQR> {
  const perk = makePerk(eventId, userId, squadOf(state, eventId, userId)?.squad.id ?? null, title, perkType, "manual", null, now);
  return ok({ ...state, user_perks_qrs: [...state.user_perks_qrs, perk] }, perk);
}

export function redeemPerk(state: RougeState, qrOrId: string, now = Date.now()): Result<UserPerkQR> {
  const perk = state.user_perks_qrs.find((p) => p.id === qrOrId || p.qr_code_string === qrOrId);
  if (!perk) return fail("QR inválido.");
  if (perk.status === "redeemed") return fail("Este QR ya fue canjeado.");
  const updated: UserPerkQR = { ...perk, status: "redeemed", redeemed_at: iso(now) };
  return ok({ ...state, user_perks_qrs: state.user_perks_qrs.map((p) => (p.id === perk.id ? updated : p)) }, updated);
}

export function upsertPerkRule(state: RougeState, rule: Omit<PerkRule, "id" | "created_at"> & { id?: UUID }, now = Date.now()): Result<PerkRule> {
  if (rule.trigger.min_members < 2) return fail("El Squad mínimo es de 2 personas.");
  const full: PerkRule = { ...rule, id: rule.id ?? uid(), created_at: iso(now) };
  const exists = state.perk_rules.some((r) => r.id === full.id);
  let next: RougeState = {
    ...state,
    perk_rules: exists ? state.perk_rules.map((r) => (r.id === full.id ? { ...full, created_at: r.created_at } : r)) : [...state.perk_rules, full],
  };
  // Retroactivo: squads que ya cumplen la regla reciben su QR
  for (const sq of next.squads.filter((s) => s.event_id === rule.event_id)) next = applySquadPerkRules(next, sq.id, now).state;
  return ok(next, full);
}

export function raffleEligible(state: RougeState, eventId: UUID, filter: RaffleFilter, now = Date.now()): UUID[] {
  return state.event_attendees
    .filter((a) => a.event_id === eventId)
    .map((a) => a.user_id)
    .filter((uidv) => {
      if (filter === "active_pin") return !!activePinOf(state, eventId, uidv, now);
      if (filter === "in_squad") return !!squadOf(state, eventId, uidv);
      if (filter === "female") return getProfile(state, uidv)?.gender === "female";
      return true;
    });
}

export function createRaffle(state: RougeState, eventId: UUID, prizeTitle: string, filter: RaffleFilter, now = Date.now()): Result<Raffle> {
  if (!prizeTitle.trim()) return fail("Definí el premio.");
  const raffle: Raffle = {
    id: uid(),
    event_id: eventId,
    prize_title: prizeTitle.trim(),
    filter,
    winner_user_id: null,
    winner_perk_id: null,
    drawn_at: null,
    created_at: iso(now),
  };
  return ok({ ...state, raffles: [...state.raffles, raffle] }, raffle);
}

export function drawRaffle(
  state: RougeState,
  raffleId: UUID,
  rng: () => number = Math.random,
  now = Date.now(),
): Result<{ raffle: Raffle; perk: UserPerkQR; pool: UUID[] }> {
  const raffle = state.raffles.find((r) => r.id === raffleId);
  if (!raffle) return fail("Sorteo inexistente.");
  if (raffle.winner_user_id) return fail("Este sorteo ya tiene ganador.");
  const pool = raffleEligible(state, raffle.event_id, raffle.filter, now);
  if (!pool.length) return fail("No hay participantes que cumplan el filtro.");
  const winner = pool[Math.floor(rng() * pool.length)];
  const perk = makePerk(raffle.event_id, winner, squadOf(state, raffle.event_id, winner)?.squad.id ?? null, `🏆 ${raffle.prize_title}`, "raffle_prize", "raffle", raffle.id, now);
  const updated: Raffle = { ...raffle, winner_user_id: winner, winner_perk_id: perk.id, drawn_at: iso(now) };
  return ok(
    { ...state, raffles: state.raffles.map((r) => (r.id === raffle.id ? updated : r)), user_perks_qrs: [...state.user_perks_qrs, perk] },
    { raffle: updated, perk, pool },
  );
}

// ═════════════════════════════════════════════════════════════════════
// TEXT BLASTS
// ═════════════════════════════════════════════════════════════════════

export function blastAudience(state: RougeState, eventId: UUID, segment: BlastSegment, now = Date.now()): UUID[] {
  const attendees = state.event_attendees.filter((a) => a.event_id === eventId);
  switch (segment.kind) {
    case "all":
      return attendees.map((a) => a.user_id);
    case "squad_min_size":
      return attendees
        .map((a) => a.user_id)
        .filter((u) => {
          const sq = squadOf(state, eventId, u);
          return !!sq && squadMembers(state, sq.squad.id).length >= segment.min;
        });
    case "sector":
      return attendees.map((a) => a.user_id).filter((u) => activePinOf(state, eventId, u, now)?.sector_name === segment.sector_name);
    case "mood":
      return attendees.filter((a) => a.mood_tag === segment.mood).map((a) => a.user_id);
    case "top_spenders":
      return [...attendees].sort((a, b) => b.total_spent - a.total_spent).slice(0, segment.limit).map((a) => a.user_id);
  }
}

export interface BlastInput {
  title: string;
  message: string;
  segment: BlastSegment;
  ctaLabel?: string;
  ctaLink?: string;
  flashMinutes?: number; // Flash Promo (ej. 20 min)
}

export function sendBlast(state: RougeState, eventId: UUID, input: BlastInput, now = Date.now()): Result<{ blast: EventBlast; reach: number }> {
  if (!input.title.trim() || !input.message.trim()) return fail("Completá título y mensaje.");
  const blast: EventBlast = {
    id: uid(),
    event_id: eventId,
    title: input.title.trim(),
    message: input.message.trim(),
    target_segment: input.segment,
    cta_label: input.ctaLabel?.trim() || null,
    cta_link: input.ctaLink?.trim() || null,
    is_flash_promo: !!input.flashMinutes,
    expires_at: input.flashMinutes ? addMs(iso(now), minutes(input.flashMinutes)) : null,
    created_at: iso(now),
  };
  return ok({ ...state, event_blasts: [...state.event_blasts, blast] }, { blast, reach: blastAudience(state, eventId, input.segment, now).length });
}

/**
 * Audiencia "congelada" al momento del envío: en Supabase se materializa en
 * una tabla de entregas; en el demo se recalcula, lo cual es suficiente.
 */
export function blastsFor(state: RougeState, eventId: UUID, userId: UUID, now = Date.now()): EventBlast[] {
  return state.event_blasts
    .filter((b) => b.event_id === eventId && blastAudience(state, eventId, b.target_segment, now).includes(userId))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

// ═════════════════════════════════════════════════════════════════════
// BARRA EXPRESS
// ═════════════════════════════════════════════════════════════════════

function makeOrder(
  state: RougeState,
  eventId: UUID,
  userId: UUID,
  type: DeliveryType,
  items: BarOrderItem[],
  extra: Partial<Pick<BarOrder, "squad_id" | "split_user_ids" | "pin_coord_x" | "pin_coord_y" | "sector_name">>,
  now: number,
): BarOrder {
  return {
    id: uid(),
    event_id: eventId,
    user_id: userId,
    squad_id: extra.squad_id ?? null,
    delivery_type: type,
    items_json: items,
    total_amount: items.reduce((acc, i) => acc + i.qty * i.unit_price, 0),
    split_user_ids: extra.split_user_ids ?? [],
    pickup_code: type === "fast_pickup" || type === "squad_split" ? shortCode(4) : null,
    pin_coord_x: extra.pin_coord_x ?? null,
    pin_coord_y: extra.pin_coord_y ?? null,
    sector_name: extra.sector_name ?? null,
    status: "pending",
    created_at: iso(now),
    updated_at: iso(now),
  };
}

function addSpend(state: RougeState, eventId: UUID, shares: [UUID, number][]): RougeState {
  const map = new Map(shares);
  return {
    ...state,
    event_attendees: state.event_attendees.map((a) =>
      a.event_id === eventId && map.has(a.user_id) ? { ...a, total_spent: a.total_spent + (map.get(a.user_id) ?? 0) } : a,
    ),
  };
}

export function createBarOrder(
  state: RougeState,
  eventId: UUID,
  userId: UUID,
  cart: { itemId: string; qty: number }[],
  deliveryType: Exclude<DeliveryType, "icebreaker_gift">,
  now = Date.now(),
): Result<BarOrder> {
  const gate = requireInteractive(state, eventId, now);
  if (gate) return gate;
  if (!getAttendee(state, eventId, userId)) return fail("No estás en este evento.");
  const items: BarOrderItem[] = [];
  for (const line of cart) {
    const item = state.bar_menu.find((i) => i.id === line.itemId);
    if (!item || line.qty < 1) continue;
    items.push({ item_id: item.id, name: `${item.emoji} ${item.name}`, qty: Math.min(line.qty, 20), unit_price: item.price });
  }
  if (!items.length) return fail("El pedido está vacío.");

  const sq = squadOf(state, eventId, userId);
  const extra: Parameters<typeof makeOrder>[5] = { squad_id: sq?.squad.id ?? null };

  if (deliveryType === "pin_delivery") {
    const pin = activePinOf(state, eventId, userId, now);
    const base = sq?.squad.has_vip_table_to_share && sq.squad.base_pin_x != null ? sq.squad : null;
    if (!pin && !base) return fail("Para delivery necesitás un pin activo en el plano o una Mesa VIP con Punto Base.");
    const x = pin?.coord_x ?? base!.base_pin_x!;
    const y = pin?.coord_y ?? base!.base_pin_y!;
    const ev = getEvent(state, eventId)!;
    Object.assign(extra, { pin_coord_x: x, pin_coord_y: y, sector_name: pin?.sector_name ?? sectorAt(ev.venue_layout_json.sectors, x, y)?.name ?? null });
  }

  let shares: [UUID, number][];
  const total = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  if (deliveryType === "squad_split") {
    if (!sq) return fail("La Vaquita requiere un Squad.");
    const members = squadMembers(state, sq.squad.id).map((m) => m.user_id);
    extra.split_user_ids = members;
    const share = Math.round(total / members.length);
    shares = members.map((m) => [m, share]);
  } else {
    shares = [[userId, total]];
  }

  const order = makeOrder(state, eventId, userId, deliveryType, items, extra, now);
  const next = addSpend({ ...state, bar_orders: [...state.bar_orders, order] }, eventId, shares);
  return ok(touch(next, eventId, userId, now), order);
}

export const ORDER_FLOW: Record<BarOrder["delivery_type"], BarOrder["status"][]> = {
  pin_delivery: ["pending", "preparing", "delivering", "completed"],
  fast_pickup: ["pending", "preparing", "ready_qr", "completed"],
  squad_split: ["pending", "preparing", "ready_qr", "completed"],
  icebreaker_gift: ["pending", "preparing", "ready_qr", "completed"],
};

export function nextOrderStatus(order: BarOrder): BarOrder["status"] | null {
  const flow = ORDER_FLOW[order.delivery_type];
  const i = flow.indexOf(order.status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

export function setOrderStatus(state: RougeState, orderId: UUID, status: BarOrder["status"], now = Date.now()): Result<BarOrder> {
  const o = state.bar_orders.find((x) => x.id === orderId);
  if (!o) return fail("Pedido inexistente.");
  if (!ORDER_FLOW[o.delivery_type].includes(status)) return fail("Estado inválido para este tipo de pedido.");
  const updated = { ...o, status, updated_at: iso(now) };
  return ok({ ...state, bar_orders: state.bar_orders.map((x) => (x.id === orderId ? updated : x)) }, updated);
}

// ═════════════════════════════════════════════════════════════════════
// LINE-UP: PEDIDOS DE TEMAS
// ═════════════════════════════════════════════════════════════════════

export function requestSong(state: RougeState, eventId: UUID, userId: UUID, title: string, artist: string, now = Date.now()): Result<SongRequest> {
  const t = title.trim();
  if (!t) return fail("¿Qué tema querés pedir?");
  const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const existing = state.song_requests.find((r) => r.event_id === eventId && key(r.title) === key(t));
  if (existing) return toggleSongVote(state, existing.id, userId, true);
  const req = { id: uid(), event_id: eventId, requested_by: userId, title: t.slice(0, 80), artist: artist.trim().slice(0, 60), voter_ids: [userId], created_at: iso(now) };
  return ok({ ...state, song_requests: [...state.song_requests, req] }, req);
}

export function toggleSongVote(state: RougeState, requestId: UUID, userId: UUID, forceOn = false): Result<SongRequest> {
  const r = state.song_requests.find((x) => x.id === requestId);
  if (!r) return fail("Pedido inexistente.");
  const has = r.voter_ids.includes(userId);
  const voter_ids = has && !forceOn ? r.voter_ids.filter((v) => v !== userId) : has ? r.voter_ids : [...r.voter_ids, userId];
  const updated = { ...r, voter_ids };
  return ok({ ...state, song_requests: state.song_requests.map((x) => (x.id === requestId ? updated : x)) }, updated);
}

// ═════════════════════════════════════════════════════════════════════
// ADMIN: EVENTOS Y CÓDIGOS
// ═════════════════════════════════════════════════════════════════════

export function upsertEvent(state: RougeState, input: Partial<RougeEvent> & Pick<RougeEvent, "name" | "starts_at" | "ends_at">, now = Date.now()): Result<RougeEvent> {
  const t = (iso?: string) => (iso ? +new Date(iso) : NaN);
  if (!input.name.trim()) return fail("El evento necesita un nombre.");
  if (Number.isNaN(t(input.starts_at)) || Number.isNaN(t(input.ends_at))) return fail("Revisá las fechas del evento.");
  if (t(input.ends_at) <= t(input.starts_at)) return fail("La fiesta debe terminar después de empezar.");
  // Mismo check que events_time_chk en SQL: apertura ≤ inicio < fin ≤ cierre del lobby
  if (input.lobby_opens_at && t(input.lobby_opens_at) > t(input.starts_at)) return fail("El lobby tiene que abrir antes de que empiece la fiesta.");
  if (input.lobby_expires_at && t(input.lobby_expires_at) < t(input.ends_at)) return fail("El lobby tiene que cerrar después de que termine la fiesta.");
  if (input.max_capacity !== undefined && (!Number.isInteger(input.max_capacity) || input.max_capacity < 1)) return fail("El cupo tiene que ser un número mayor a 0.");
  if (input.lineup_json?.some((sl) => !sl.artist.trim() || t(sl.ends_at) <= t(sl.starts_at))) return fail("Cada set del line-up necesita artista y horario válido.");
  const slug = (input.slug ?? input.name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length < 3) return fail("El link del evento necesita al menos 3 caracteres.");
  if (state.events.some((e) => e.slug === slug && e.id !== input.id)) return fail("Ya existe un evento con ese link.");
  const existing = input.id ? getEvent(state, input.id) : undefined;
  const base: RougeEvent = existing ?? {
    id: uid(),
    slug,
    name: input.name,
    description: "",
    venue_name: "",
    venue_map_url: null,
    venue_layout_json: state.events[0]?.venue_layout_json ?? VENUE_LAYOUT,
    lineup_json: [],
    cover_url: null,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    lobby_opens_at: addMs(input.starts_at, -48 * 3_600_000),
    lobby_expires_at: addMs(input.ends_at, 24 * 3_600_000),
    max_capacity: 1500,
    master_invite_code: shortCode(6, "RG"),
    created_by: state.current_user_id,
    created_at: iso(now),
  };
  const event: RougeEvent = { ...base, ...input, slug } as RougeEvent;
  return ok({ ...state, events: existing ? state.events.map((e) => (e.id === event.id ? event : e)) : [...state.events, event] }, event);
}

export function generateInviteCodes(state: RougeState, eventId: UUID, count: number, now = Date.now()): Result<EventInviteCode[]> {
  if (!getEvent(state, eventId)) return fail("Evento inexistente.");
  if (count < 1 || count > 1000) return fail("Generá entre 1 y 1000 códigos por lote.");
  const taken = new Set(state.event_invite_codes.map((c) => c.code));
  const codes: EventInviteCode[] = [];
  while (codes.length < count) {
    const code = shortCode(8);
    if (taken.has(code)) continue;
    taken.add(code);
    codes.push({ id: uid(), event_id: eventId, code, is_used: false, used_by_user_id: null, used_at: null, created_at: iso(now) });
  }
  return ok({ ...state, event_invite_codes: [...state.event_invite_codes, ...codes] }, codes);
}

// ═════════════════════════════════════════════════════════════════════
// ADMIN: VALIDACIÓN EN BARRA
// ═════════════════════════════════════════════════════════════════════

/**
 * El bartender escanea o tipea el código de retiro. Solo se entrega si el
 * pedido está "Listo para retiro"; si no, explica en qué estado está.
 */
export function redeemPickupCode(state: RougeState, eventId: UUID, rawCode: string, now = Date.now()): Result<BarOrder> {
  const code = rawCode.trim().toUpperCase().replace(/^ROUGE:ORDER:[^:]+:/, "");
  const order = state.bar_orders.find((o) => o.event_id === eventId && o.pickup_code?.toUpperCase() === code);
  if (!order) return fail("No existe un pedido con ese código.");
  if (order.status === "completed") return fail("Ese pedido ya fue entregado.");
  if (order.status !== "ready_qr") return fail("El pedido todavía no está listo para retirar.");
  return setOrderStatus(state, order.id, "completed", now);
}

// ── Equipo del evento ────────────────────────────────────────────────

/**
 * Suma, cambia o quita (role = null) a alguien del equipo por @username.
 * Espejo de la RPC set_staff_role: solo dueño/a; quien creó el evento no se puede quitar ni degradar.
 */
export function setStaffRole(state: RougeState, eventId: UUID, username: string, role: StaffRole | null, now = Date.now()): Result<{ user_id: UUID }> {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return fail("El evento no existe.");
  const uname = username.trim().replace(/^@/, "").toLowerCase();
  const target = state.profiles.find((p) => p.username === uname);
  if (!target) return fail("No encontramos a nadie con ese @usuario.");
  if (target.id === event.created_by) return fail("Quien creó el evento siempre es dueño/a.");
  const rest = state.event_staff.filter((r) => !(r.event_id === eventId && r.user_id === target.id));
  const next = role ? [...rest, { event_id: eventId, user_id: target.id, role, created_at: iso(now) }] : rest;
  return ok({ ...state, event_staff: next }, { user_id: target.id });
}
