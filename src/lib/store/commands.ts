/**
 * Comandos de ROUGE: cada acción de usuario/staff definida UNA vez.
 *
 *  - `local`:  la regla pura del motor (src/lib/engine). Valida y produce el
 *              nuevo estado al instante (UI optimista, mismos mensajes de error).
 *  - `remote`: la contraparte en Supabase (RPC o tabla con RLS). Si el servidor
 *              rechaza, el RougeContext revierte al estado real y muestra el error.
 *
 * En Modo Demo solo corre `local`. Las pantallas siempre llaman `exec(C.algo(...))`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, CampaignContact, OrganizationSettings, VipReservation } from "@/lib/types";
import type { EventFeatureFlags } from "@/lib/engine/features";
import type { ApiKey, AttendeeTier, BarOrder, Connection, EventAttendee, EventInviteCode, LatePaymentMethod, MoodTag, PerkRule, Raffle, RaffleFilter, ReportReason, RougeEvent, RougeState, SongRequest, Squad, StaffRole, UUID } from "@/lib/types";
import * as A from "@/lib/engine/actions";
import type { Result } from "@/lib/engine/actions";
import { can, NO_PERMISSION, type Permission } from "@/lib/engine/roles";
import * as B from "@/lib/engine/branding";
import * as P from "@/lib/engine/payments";
import * as T from "@/lib/engine/settle";
import * as E from "@/lib/engine/eventAdmin";
import * as RP from "@/lib/engine/promoters";
import * as D from "@/lib/engine/door";
import * as S from "@/lib/engine/security";
import * as SC from "@/lib/engine/scan";
import * as DO from "@/lib/engine/doorOffline";
import * as CP from "@/lib/engine/campaigns";
import * as SA from "@/lib/engine/superadmin";
// Registra los efectos post-pago (regalo del chat y QR grupal de la Mesa VIP) en confirmOrderPayment.
import * as MO from "@/lib/engine/monetization";
import * as PV from "@/lib/engine/privacy";
import * as MT from "@/lib/engine/meetings";
import { BAR_MENU, CORPORATE_MENU } from "@/lib/mock/seed";

export interface Command<T> {
  name: string;
  local: (s: RougeState) => Result<T>;
  /** Devuelve los datos "reales" del servidor cuando difieren de los locales (ids, códigos). */
  remote?: (sb: SupabaseClient, local: T, before: RougeState) => Promise<T | void>;
  /**
   * false = en Supabase NO se muestra el resultado local antes de que responda el servidor.
   * Para acciones cuyo resultado lo genera el servidor (códigos de Squad o de retiro, códigos de 1 uso,
   * ganador del sorteo): nunca se muestra/comparte un código inventado en el cliente.
   */
  optimistic?: boolean;
}

type PgResult<D> = { data: D; error: { message: string; code?: string } | null };

/** Lanza el error de Supabase para que el contexto lo traduzca y revierta. */
function must<D>(res: PgResult<D>): D {
  if (res.error) throw res.error;
  return res.data;
}

/** Regla de rol (misma que has_staff_role en SQL): solo el equipo con ese permiso ejecuta la acción. */
function guarded<T>(perm: Permission, eventOf: (s: RougeState) => UUID | undefined, fn: (s: RougeState) => Result<T>) {
  return (s: RougeState): Result<T> => {
    const eventId = eventOf(s);
    return eventId && can(s, eventId, s.current_user_id, perm) ? fn(s) : { ok: false, error: NO_PERMISSION };
  };
}

const rpc = async <D = unknown>(sb: SupabaseClient, fn: string, args: Record<string, unknown>) => must<D>((await sb.rpc(fn, args)) as PgResult<D>);

// ── Perfil y privacidad ──────────────────────────────────────────────

export const upsertProfile = (userId: UUID, input: A.ProfileInput): Command<RougeState["profiles"][number]> => ({
  name: "upsertProfile",
  local: (s) => A.upsertProfile(s, userId, input),
  remote: async (sb, p, before) => {
    // Insert la primera vez; después update (los privilegios por columna no permiten UPDATE de `id`).
    const fields = {
      username: p.username,
      full_name: p.full_name,
      birth_date: p.birth_date,
      gender: p.gender,
      phone_normalized: p.phone_normalized,
      bio: p.bio,
      photos: p.photos,
      loop_video_url: p.loop_video_url,
      music_genres: p.music_genres,
      spotify_embed_url: p.spotify_embed_url,
      instagram_username: p.instagram_username,
      ...(p.terms_accepted_at ? { terms_accepted_at: p.terms_accepted_at } : {}),
    };
    const existed = before.profiles.some((x) => x.id === p.id);
    if (existed) must(await sb.from("profiles").update(fields).eq("id", p.id));
    else must(await sb.from("profiles").insert({ id: p.id, ...fields }));
  },
});

/** Modo Demo: simula conectar Instagram (en Supabase la conexión la hace el OAuth en /api/instagram). */
export const linkInstagramDemo = (userId: UUID, username: string): Command<RougeState["instagram_links"][number]> => ({
  name: "linkInstagramDemo",
  local: (s) => A.linkInstagram(s, userId, username),
});

/** Desconecta Instagram: borra el token en el servidor (DELETE /api/instagram) y saca el @ del perfil. */
export const unlinkInstagram = (userId: UUID): Command<undefined> => ({
  name: "unlinkInstagram",
  local: (s) => A.unlinkInstagram(s, userId),
  remote: async () => {
    const { disconnectInstagramRemote } = await import("@/lib/social/client");
    await disconnectInstagramRemote();
  },
});

export const blockUser = (blockerId: UUID, blockedUserId: UUID): Command<undefined> => ({
  name: "blockUser",
  local: (s) => A.blockUser(s, blockerId, blockedUserId),
  remote: async (sb, _d, before) => {
    if (before.user_blocks.some((b) => b.blocker_id === blockerId && b.blocked_user_id === blockedUserId)) return;
    must(await sb.from("user_blocks").insert({ blocker_id: blockerId, blocked_user_id: blockedUserId }));
  },
});

export const blockPhone = (blockerId: UUID, rawPhone: string): Command<string> => ({
  name: "blockPhone",
  local: (s) => A.blockPhone(s, blockerId, rawPhone),
  remote: async (sb, phone, before) => {
    if (before.user_blocks.some((b) => b.blocker_id === blockerId && b.blocked_phone_normalized === phone)) return;
    must(await sb.from("user_blocks").insert({ blocker_id: blockerId, blocked_phone_normalized: phone }));
  },
});

export const unblock = (blockerId: UUID, blockId: UUID): Command<undefined> => ({
  name: "unblock",
  local: (s) => A.unblock(s, blockerId, blockId),
  remote: async (sb) => {
    must(await sb.from("user_blocks").delete().eq("id", blockId).eq("blocker_id", blockerId));
  },
});

// ── Ingreso y ajustes de la noche ────────────────────────────────────

/**
 * `serverEventId`: el código lo resolvió el servidor (resolve_access_code) porque el cliente no puede
 * verlo por RLS (códigos de 1 uso, squads ajenos). Si la regla local no lo encuentra, decide el servidor.
 */
export const joinEvent = (userId: UUID, code: string, mood: MoodTag, serverEventId?: UUID, personaId: UUID | null = null): Command<{ eventId: UUID; squadId?: UUID }> => ({
  name: "joinEvent",
  optimistic: false,
  local: (s) => {
    const r = A.joinEvent(s, userId, code, mood, Date.now(), personaId);
    if (!r.ok && serverEventId && !A.resolveAccessCode(s, code)) return { ok: true, state: s, data: { eventId: serverEventId } };
    return r;
  },
  remote: async (sb, local) => {
    const eventId = await rpc<UUID | null>(sb, "join_event", { p_code: code, p_mood: mood, p_persona: personaId });
    // El servidor devuelve null (en vez de un error) ante un código inexistente para poder registrar el intento.
    if (!eventId) throw new Error("invalid_code");
    return { ...local, eventId };
  },
});

// ── Perfiles adicionales (una cuenta, varias caras) ──────────────────

/** Crea o edita un perfil adicional. Mismo id en el insert que en el optimista (no se duplica). */
export const upsertPersona = (userId: UUID, input: A.PersonaInput): Command<RougeState["profile_personas"][number]> => ({
  name: "upsertPersona",
  local: (s) => A.upsertPersona(s, userId, input),
  remote: async (sb, p, before) => {
    const fields = {
      label: p.label,
      display_name: p.display_name,
      bio: p.bio,
      photos: p.photos,
      music_genres: p.music_genres,
      spotify_embed_url: p.spotify_embed_url,
      job_title: p.job_title,
      company: p.company,
      industry: p.industry,
      looking_for: p.looking_for,
      offering: p.offering,
      linkedin_url: p.linkedin_url,
      website_url: p.website_url,
      looking_for_note: p.looking_for_note,
      offering_note: p.offering_note,
      contact_email: p.contact_email,
      contact_phone: p.contact_phone,
      privacy_level: p.privacy_level,
    };
    const existed = before.profile_personas.some((x) => x.id === p.id);
    if (existed) must(await sb.from("profile_personas").update(fields).eq("id", p.id).eq("user_id", userId));
    else must(await sb.from("profile_personas").insert({ id: p.id, user_id: userId, kind: p.kind, ...fields }));
  },
});

// ── Privacidad (v1.8) ────────────────────────────────────────────────

/** Ajustes de privacidad de la cuenta: incógnito por defecto, pin solo Squad, datos profesionales tras reunión. */
export const updatePrivacySettings = (userId: UUID, patch: PV.PrivacyPatch): Command<RougeState["privacy_settings"][number]> => ({
  name: "updatePrivacySettings",
  local: (s) => PV.updatePrivacySettings(s, userId, patch),
  remote: async (sb, p) => {
    must(
      await sb.from("privacy_settings").upsert(
        { user_id: userId, incognito_default: p.incognito_default, pin_share_matches: p.pin_share_matches, pro_details_after_meeting: p.pro_details_after_meeting, updated_at: p.updated_at },
        { onConflict: "user_id" },
      ),
    );
  },
});

// ── Reuniones y puntos de encuentro (v1.8) ───────────────────────────

const locationArgs = (loc: MT.MeetingLocation) => ({
  p_location_kind: loc.kind,
  p_spot: loc.kind === "spot" ? loc.spotId : null,
  p_x: loc.kind === "pin" ? loc.x : null,
  p_y: loc.kind === "pin" ? loc.y : null,
  p_label: loc.kind === "pin" ? (loc.label ?? null) : null,
});

/** Pedir una reunión. El id lo genera el servidor (no optimista). */
export const requestMeeting = (eventId: UUID, requesterId: UUID, inviteeId: UUID, input: MT.MeetingInput): Command<RougeState["meetings"][number]> => ({
  name: "requestMeeting",
  optimistic: false,
  local: (s) => MT.requestMeeting(s, eventId, requesterId, inviteeId, input),
  remote: async (sb) =>
    rpc<RougeState["meetings"][number]>(sb, "request_meeting", {
      p_event: eventId,
      p_invitee: inviteeId,
      p_topic: input.topic.trim(),
      p_starts_at: input.startsAt,
      p_duration: input.duration,
      ...locationArgs(input.location),
    }),
});

/** Aceptar (abre el chat) o rechazar. Si el lugar estaba "a definir", `location` lo fija. */
export const respondMeeting = (meetingId: UUID, userId: UUID, accept: boolean, location?: MT.MeetingLocation): Command<RougeState["meetings"][number]> => ({
  name: "respondMeeting",
  optimistic: false, // al aceptar, el servidor crea la conexión (chat) con su id
  local: (s) => MT.respondMeeting(s, meetingId, userId, accept, location),
  remote: async (sb) =>
    rpc<RougeState["meetings"][number]>(sb, "respond_meeting", { p_meeting: meetingId, p_accept: accept, ...(location ? locationArgs(location) : {}) }),
});

export const rescheduleMeeting = (meetingId: UUID, userId: UUID, input: Omit<MT.MeetingInput, "topic">): Command<RougeState["meetings"][number]> => ({
  name: "rescheduleMeeting",
  local: (s) => MT.rescheduleMeeting(s, meetingId, userId, input),
  remote: async (sb) =>
    rpc<RougeState["meetings"][number]>(sb, "reschedule_meeting", { p_meeting: meetingId, p_starts_at: input.startsAt, p_duration: input.duration, ...locationArgs(input.location) }),
});

export const cancelMeeting = (meetingId: UUID, userId: UUID): Command<RougeState["meetings"][number]> => ({
  name: "cancelMeeting",
  local: (s) => MT.cancelMeeting(s, meetingId, userId),
  remote: async (sb) => rpc<RougeState["meetings"][number]>(sb, "cancel_meeting", { p_meeting: meetingId }),
});

/** Sala / mesa / punto de encuentro del evento (dueño/a o producción). Mismo id en el insert que en el optimista. */
export const upsertVenueSpot = (eventId: UUID, input: MT.VenueSpotInput): Command<RougeState["venue_spots"][number]> => ({
  name: "upsertVenueSpot",
  local: guarded("admin.events", () => eventId, (s) => MT.upsertVenueSpot(s, eventId, input)),
  remote: async (sb, x, before) => {
    const fields = { name: x.name, kind: x.kind, capacity: x.capacity, coord_x: x.coord_x, coord_y: x.coord_y, is_active: x.is_active };
    if (before.venue_spots.some((v) => v.id === x.id)) must(await sb.from("venue_spots").update(fields).eq("id", x.id).eq("event_id", eventId));
    else must(await sb.from("venue_spots").insert({ id: x.id, event_id: eventId, ...fields }));
  },
});

export const deleteVenueSpot = (eventId: UUID, spotId: UUID): Command<undefined> => ({
  name: "deleteVenueSpot",
  local: guarded("admin.events", () => eventId, (s) => MT.deleteVenueSpot(s, spotId)),
  remote: async (sb) => {
    must(await sb.from("venue_spots").delete().eq("id", spotId).eq("event_id", eventId));
  },
});

export const deletePersona = (userId: UUID, personaId: UUID): Command<undefined> => ({
  name: "deletePersona",
  local: (s) => A.deletePersona(s, userId, personaId),
  remote: async (sb) => {
    await rpc(sb, "delete_persona", { p_persona: personaId });
  },
});

export const updateAttendeeSettings = (
  eventId: UUID,
  userId: UUID,
  patch: Partial<Pick<EventAttendee, "mood_tag" | "ghost_mode" | "only_liked_can_icebreak">>,
): Command<undefined> => ({
  name: "updateAttendeeSettings",
  local: (s) => A.updateAttendeeSettings(s, eventId, userId, patch),
  remote: async (sb) => {
    must(await sb.from("event_attendees").update({ ...patch, last_active_at: new Date().toISOString() }).eq("event_id", eventId).eq("user_id", userId));
  },
});

// ── Conexiones ───────────────────────────────────────────────────────

export const sendConnection = (eventId: UUID, senderId: UUID, receiverId: UUID): Command<{ connection: Connection; matched: boolean }> => ({
  name: "sendConnection",
  local: (s) => A.sendConnection(s, eventId, senderId, receiverId),
  remote: async (sb) => {
    const row = await rpc<Connection>(sb, "send_connection", { p_event: eventId, p_receiver: receiverId });
    return { connection: row, matched: row.status === "accepted" };
  },
});

export const respondConnection = (connectionId: UUID, userId: UUID, accept: boolean): Command<Connection> => ({
  name: "respondConnection",
  local: (s) => A.respondConnection(s, connectionId, userId, accept),
  remote: async (sb, c) => {
    must(await sb.from("connections").update({ status: c.status, responded_at: c.responded_at }).eq("id", connectionId).eq("receiver_id", userId));
  },
});

export const sendIcebreaker = (eventId: UUID, senderId: UUID, receiverId: UUID, input: A.IcebreakerInput): Command<Connection> => ({
  name: "sendIcebreaker",
  local: (s) => A.sendIcebreaker(s, eventId, senderId, receiverId, input),
  remote: async (sb) =>
    rpc<Connection>(sb, "send_icebreaker", { p_event: eventId, p_receiver: receiverId, p_message: input.message.trim(), p_gift_item: input.giftDrinkItemId ?? null }),
});

// ── Squads y seguridad ───────────────────────────────────────────────

export const createSquad = (eventId: UUID, userId: UUID, name: string): Command<Squad> => ({
  name: "createSquad",
  optimistic: false, // el código de invitación lo genera el servidor
  local: (s) => A.createSquad(s, eventId, userId, name),
  remote: async (sb) => rpc<Squad>(sb, "create_squad", { p_event: eventId, p_name: name }),
});

export const inviteToSquad = (squadId: UUID, inviterId: UUID, inviteeId: UUID): Command<RougeState["squad_members"][number]> => ({
  name: "inviteToSquad",
  local: (s) => A.inviteToSquad(s, squadId, inviterId, inviteeId),
  remote: async (sb) => {
    await rpc(sb, "invite_to_squad", { p_squad: squadId, p_invitee: inviteeId });
  },
});

export const joinSquad = (userId: UUID, squadId: UUID): Command<{ grantedPerks: RougeState["user_perks_qrs"] }> => ({
  name: "joinSquad",
  local: (s) => A.joinSquad(s, userId, squadId),
  remote: async (sb) => {
    await rpc(sb, "join_squad", { p_squad: squadId });
  },
});

export const leaveSquad = (userId: UUID, squadId: UUID): Command<undefined> => ({
  name: "leaveSquad",
  local: (s) => A.leaveSquad(s, userId, squadId),
  remote: async (sb) => {
    must(await sb.from("squad_members").delete().eq("squad_id", squadId).eq("user_id", userId));
  },
});

// Equipos que arma la organización (corporativo). Dueño/a y producción.

/** Crea un equipo vacío; el código de invitación lo genera el servidor. */
export const organizerCreateTeam = (eventId: UUID, name: string): Command<Squad> => ({
  name: "organizerCreateTeam",
  optimistic: false,
  local: guarded("admin.events", () => eventId, (s) => A.organizerCreateTeam(s, eventId, name)),
  remote: async (sb) => rpc<Squad>(sb, "create_team", { p_event: eventId, p_name: name.trim() }),
});

/** Suma (add) o quita a un asistente de un equipo; si estaba en otro equipo del evento, lo mueve. */
export const organizerSetTeamMember = (eventId: UUID, squadId: UUID, userId: UUID, add: boolean): Command<{ moved: boolean; grantedPerks: RougeState["user_perks_qrs"] }> => ({
  name: "organizerSetTeamMember",
  local: guarded("admin.events", () => eventId, (s) => A.organizerSetTeamMember(s, squadId, userId, add)),
  remote: async (sb) => {
    await rpc(sb, "set_team_member", { p_squad: squadId, p_user: userId, p_add: add });
  },
});

export const organizerDeleteTeam = (eventId: UUID, squadId: UUID): Command<undefined> => ({
  name: "organizerDeleteTeam",
  local: guarded("admin.events", () => eventId, (s) => A.organizerDeleteTeam(s, squadId)),
  remote: async (sb) => {
    await rpc(sb, "delete_team", { p_squad: squadId });
  },
});

export const declineSquadInvite = (userId: UUID, memberId: UUID): Command<undefined> => ({
  name: "declineSquadInvite",
  local: (s) => A.declineSquadInvite(s, userId, memberId),
  remote: async (sb) => {
    must(await sb.from("squad_members").delete().eq("id", memberId).eq("user_id", userId));
  },
});

export const updateSquad = (squadId: UUID, userId: UUID, patch: Partial<Pick<Squad, "name" | "has_vip_table_to_share">>): Command<undefined> => ({
  name: "updateSquad",
  local: (s) => A.updateSquad(s, squadId, userId, patch),
  remote: async (sb) => {
    must(await sb.from("squads").update(patch).eq("id", squadId));
  },
});

export const setSquadBasePin = (squadId: UUID, userId: UUID, x: number, y: number, label: string): Command<undefined> => ({
  name: "setSquadBasePin",
  local: (s) => A.setSquadBasePin(s, squadId, userId, x, y, label),
  remote: async (sb) => {
    await rpc(sb, "set_squad_base_pin", { p_squad: squadId, p_x: x, p_y: y, p_label: label });
  },
});

export const announceBaseMeetup = (squadId: UUID, userId: UUID, minutes = 10): Command<undefined> => ({
  name: "announceBaseMeetup",
  local: (s) => A.announceBaseMeetup(s, squadId, userId, minutes),
  remote: async (sb) => {
    await rpc(sb, "announce_base_meetup", { p_squad: squadId, p_minutes: minutes });
  },
});

export const triggerRescue = (eventId: UUID, userId: UUID, coords?: { x: number; y: number }): Command<RougeState["map_pins"][number]> => ({
  name: "triggerRescue",
  local: (s) => A.triggerRescue(s, eventId, userId, coords),
  remote: async (sb, pin) =>
    rpc(sb, "trigger_rescue", { p_event: eventId, p_x: pin.coord_x, p_y: pin.coord_y, p_sector: pin.sector_name }) as Promise<RougeState["map_pins"][number]>,
});

export const resolveRescue = (eventId: UUID, userId: UUID): Command<undefined> => ({
  name: "resolveRescue",
  local: (s) => A.resolveRescue(s, eventId, userId),
  remote: async (sb) => {
    await rpc(sb, "set_safety_status", { p_event: eventId, p_status: "ok" });
  },
});

export const markHomeSafe = (eventId: UUID, userId: UUID): Command<undefined> => ({
  name: "markHomeSafe",
  local: (s) => A.markHomeSafe(s, eventId, userId),
  remote: async (sb) => {
    await rpc(sb, "set_safety_status", { p_event: eventId, p_status: "home_safe" });
  },
});

// ── Plano ────────────────────────────────────────────────────────────

export const dropPin = (eventId: UUID, userId: UUID, input: A.DropPinInput): Command<RougeState["map_pins"][number]> => ({
  name: "dropPin",
  local: (s) => A.dropPin(s, eventId, userId, input),
  remote: async (sb, pin) =>
    rpc(sb, "drop_pin", {
      p_event: eventId,
      p_x: pin.coord_x,
      p_y: pin.coord_y,
      p_sector: pin.sector_name,
      p_share_with_squad: pin.share_with_squad,
      p_match_ids: pin.shared_match_ids,
      p_note: pin.note,
    }) as Promise<RougeState["map_pins"][number]>,
});

export const removePin = (pinId: UUID, userId: UUID, eventId: UUID): Command<undefined> => ({
  name: "removePin",
  local: (s) => A.removePin(s, pinId, userId),
  // 1 pin activo por usuario: se borra por evento+usuario (el id local puede no coincidir aún con el del servidor)
  remote: async (sb) => {
    must(await sb.from("map_pins").delete().eq("event_id", eventId).eq("user_id", userId));
  },
});

// ── Chat ─────────────────────────────────────────────────────────────

export const sendMessage = (senderId: UUID, to: A.ConversationRef, body: Parameters<typeof A.sendMessage>[3]): Command<RougeState["messages"][number]> => ({
  name: "sendMessage",
  local: (s) => A.sendMessage(s, senderId, to, body),
  // Se inserta con el MISMO id que el mensaje optimista: Realtime no lo duplica.
  remote: async (sb, m) => {
    must(
      await sb.from("messages").insert({
        id: m.id,
        event_id: m.event_id,
        conversation_type: m.conversation_type,
        connection_id: m.connection_id,
        squad_id: m.squad_id,
        sender_id: m.sender_id,
        message_type: m.message_type,
        content: m.content,
        media_url: m.media_url,
      }),
    );
  },
});

// ── Line-up ──────────────────────────────────────────────────────────

export const requestSong = (eventId: UUID, userId: UUID, title: string, artist: string): Command<SongRequest> => ({
  name: "requestSong",
  local: (s) => A.requestSong(s, eventId, userId, title, artist),
  remote: async (sb) => {
    await rpc(sb, "vote_song", { p_event: eventId, p_title: title, p_artist: artist });
  },
});

export const toggleSongVote = (eventId: UUID, requestId: UUID, userId: UUID, title: string): Command<SongRequest> => ({
  name: "toggleSongVote",
  local: (s) => A.toggleSongVote(s, requestId, userId),
  remote: async (sb) => {
    await rpc(sb, "vote_song", { p_event: eventId, p_title: title, p_artist: "" });
  },
});

// ── Barra Express ────────────────────────────────────────────────────

export const createBarOrder = (
  eventId: UUID,
  userId: UUID,
  cart: { itemId: string; qty: number }[],
  delivery: Exclude<BarOrder["delivery_type"], "icebreaker_gift">,
  splitWith: UUID[] = [],
): Command<BarOrder> => ({
  name: "createBarOrder",
  optimistic: false, // el código de retiro (QR) y el estado de pago los fija el servidor
  local: (s) => A.createBarOrder(s, eventId, userId, cart, delivery, Date.now(), { splitWith }),
  // El servidor fija precios y código de retiro: se usa SU pedido (el QR tiene que coincidir).
  remote: async (sb) =>
    rpc<BarOrder>(sb, "create_bar_order", {
      p_event: eventId,
      p_items: cart.map((c) => ({ item_id: c.itemId, qty: c.qty })),
      p_delivery: delivery,
      p_split: splitWith.length ? splitWith : null,
    }),
});

/** Modo Demo: el checkout simulado de Mercado Pago acredita el pago (en Supabase lo hace SOLO el servidor). */
export const payOrderDemo = (orderId: UUID): Command<BarOrder> => ({
  name: "payOrderDemo",
  local: (s) => {
    const o = s.bar_orders.find((x) => x.id === orderId);
    return o ? P.confirmOrderPayment(s, orderId, `demo-${Date.now().toString(36)}`, o.total_amount) : { ok: false, error: "Pedido inexistente." };
  },
});

export const cancelUnpaidOrder = (orderId: UUID, userId: UUID): Command<undefined> => ({
  name: "cancelUnpaidOrder",
  local: (s) => P.cancelUnpaidOrder(s, orderId, userId),
  remote: async (sb) => {
    await rpc(sb, "cancel_unpaid_order", { p_order: orderId });
  },
});

/** `simulate`: botón "Simular barra" del Modo Demo (lo aprieta el asistente para probar el flujo). */
export const advanceOrder = (order: BarOrder, opts: { simulate?: boolean } = {}): Command<BarOrder> => {
  const step = (s: RougeState): Result<BarOrder> => {
    const next = A.nextOrderStatus(order);
    return next ? A.setOrderStatus(s, order.id, next) : { ok: false, error: "Ese pedido ya está en su estado final." };
  };
  return {
  name: "advanceOrder",
  local: opts.simulate ? step : guarded("bar.operate", () => order.event_id, step),
  remote: async (sb) => rpc<BarOrder>(sb, "advance_bar_order", { p_order: order.id }),
  };
};

export const redeemPickupCode = (eventId: UUID, code: string): Command<BarOrder> => ({
  name: "redeemPickupCode",
  local: guarded("bar.operate", () => eventId, (s) => A.redeemPickupCode(s, eventId, code)),
  remote: async (sb) => rpc<BarOrder>(sb, "redeem_pickup_code", { p_event: eventId, p_code: code }),
});

// ── Perks, sorteos y blasts (staff) ──────────────────────────────────

/** `simulate`: botón "Simular escaneo del bartender" del Modo Demo (lo aprieta el asistente). */
export const redeemPerk = (qrOrId: string, opts: { simulate?: boolean } = {}): Command<RougeState["user_perks_qrs"][number]> => ({
  name: "redeemPerk",
  local: opts.simulate
    ? (s) => A.redeemPerk(s, qrOrId)
    : guarded("perks.redeem", (s) => s.user_perks_qrs.find((p) => p.id === qrOrId || p.qr_code_string === qrOrId)?.event_id ?? s.active_event_id, (s) => A.redeemPerk(s, qrOrId)),
  remote: async (sb, perk) => rpc(sb, "redeem_perk", { p_qr: perk.qr_code_string }) as Promise<RougeState["user_perks_qrs"][number]>,
});

export const upsertPerkRule = (rule: Omit<PerkRule, "id" | "created_at"> & { id?: UUID }): Command<PerkRule> => ({
  name: "upsertPerkRule",
  local: guarded("admin.perks", () => rule.event_id, (s) => A.upsertPerkRule(s, rule)),
  remote: async (sb, r) => {
    must(await sb.from("perk_rules").upsert({ id: r.id, event_id: r.event_id, title: r.title, perk_type: r.perk_type, trigger: r.trigger, is_active: r.is_active }, { onConflict: "id" }));
  },
});

export const createRaffle = (eventId: UUID, prize: string, filter: RaffleFilter): Command<Raffle> => ({
  name: "createRaffle",
  local: guarded("admin.perks", () => eventId, (s) => A.createRaffle(s, eventId, prize, filter)),
  remote: async (sb, r) => {
    must(await sb.from("raffles").insert({ id: r.id, event_id: r.event_id, prize_title: r.prize_title, filter: r.filter }));
  },
});

/** El ganador lo decide el servidor (random() en draw_raffle); la ruleta anima hacia ESE ganador. */
export const drawRaffle = (raffleId: UUID, rng: () => number): Command<{ raffle: Raffle; perk: RougeState["user_perks_qrs"][number]; pool: UUID[] }> => ({
  name: "drawRaffle",
  optimistic: false, // el ganador lo elige el servidor
  local: guarded("admin.perks", (s) => s.raffles.find((r) => r.id === raffleId)?.event_id, (s) => A.drawRaffle(s, raffleId, rng)),
  remote: async (sb, local) => {
    const winner = await rpc<UUID>(sb, "draw_raffle", { p_raffle: raffleId });
    return { ...local, raffle: { ...local.raffle, winner_user_id: winner } };
  },
});

export const sendBlast = (eventId: UUID, input: A.BlastInput): Command<{ blast: RougeState["event_blasts"][number]; reach: number }> => ({
  name: "sendBlast",
  local: guarded("admin.blasts", () => eventId, (s) => A.sendBlast(s, eventId, input)),
  remote: async (sb, local) => {
    const reach = await rpc<number>(sb, "send_blast", {
      p_event: eventId,
      p_title: input.title.trim(),
      p_message: input.message.trim(),
      p_segment: input.segment,
      p_cta_label: input.ctaLabel?.trim() || null,
      p_cta_link: input.ctaLink?.trim() || null,
      p_flash_minutes: input.flashMinutes ?? null,
    });
    return { ...local, reach };
  },
});

// ── Eventos (staff) ──────────────────────────────────────────────────

export const CREATE_EVENT_LOCKED = "La creación de eventos la gestiona ROUGE. Pedí que activen la autogestión de tu organización.";

export const upsertEvent = (input: Parameters<typeof A.upsertEvent>[1]): Command<RougeEvent> => ({
  name: "upsertEvent",
  // v1.8: crear un evento nuevo es de ROUGE HQ (o del dueño/a con autogestión, ver el creador modular);
  // editar los datos de uno existente exige admin.events.
  local: (s) => {
    const exists = !!input.id && s.events.some((e) => e.id === input.id);
    if (exists && !can(s, input.id!, s.current_user_id, "admin.events")) return { ok: false, error: NO_PERMISSION };
    if (!exists && !E.canManageModules(s, s.current_user_id, s.current_user_id)) return { ok: false, error: CREATE_EVENT_LOCKED };
    return A.upsertEvent(s, input);
  },
  remote: async (sb, e, before) => {
    const isNew = !before.events.some((x) => x.id === e.id);
    const row = {
      id: e.id,
      kind: e.kind,
      slug: e.slug,
      name: e.name,
      description: e.description,
      venue_name: e.venue_name,
      venue_map_url: e.venue_map_url,
      venue_layout_json: e.venue_layout_json,
      lineup_json: e.lineup_json,
      cover_url: e.cover_url,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      lobby_opens_at: e.lobby_opens_at,
      lobby_expires_at: e.lobby_expires_at,
      max_capacity: e.max_capacity,
      brand_id: e.brand_id,
      logo_url: e.logo_url,
      theme_primary: e.theme_primary,
      theme_accent: e.theme_accent,
      require_checkin_for_lobby: e.require_checkin_for_lobby ?? false,
      networking_checkin_only: e.networking_checkin_only,
      ...(isNew ? { master_invite_code: e.master_invite_code, created_by: e.created_by } : {}),
    };
    if (isNew) {
      must(await sb.from("events").insert(row));
      // Menú base para el evento nuevo según su vertical (el staff lo puede editar después).
      const sameKind = before.events.find((x) => x.id === before.active_event_id)?.kind === e.kind;
      const menu = sameKind && before.bar_menu.length ? before.bar_menu : e.kind === "corporate" ? CORPORATE_MENU : BAR_MENU;
      must(await sb.from("bar_menu_items").insert(menu.map((i) => ({ id: i.id, event_id: e.id, name: i.name, category: i.category, price: i.price, emoji: i.emoji }))));
    } else {
      must(await sb.from("events").update(row).eq("id", e.id));
    }
  },
});

/** Lote de códigos de 1 uso. `tier`: categoría de esas entradas (VIP, SPEAKER…), que pasa a quien la use. */
export const generateInviteCodes = (eventId: UUID, count: number, tier: AttendeeTier | null = null): Command<EventInviteCode[]> => ({
  name: "generateInviteCodes",
  optimistic: false,
  local: guarded("admin.events", () => eventId, (s) => A.generateInviteCodes(s, eventId, count, Date.now(), tier)),
  remote: async (sb) => rpc<EventInviteCode[]>(sb, "generate_invite_codes", { p_event: eventId, p_count: count, p_tier: tier }),
});

/** Categoría de un asistente (dueño/a y producción). */
export const setAttendeeTier = (eventId: UUID, userId: UUID, tier: AttendeeTier): Command<EventAttendee> => ({
  name: "setAttendeeTier",
  local: guarded("admin.events", () => eventId, (s) => A.setAttendeeTier(s, eventId, userId, tier)),
  remote: async (sb) => rpc<EventAttendee>(sb, "set_attendee_tier", { p_event: eventId, p_user: userId, p_tier: tier }),
});

/** Lista free con horario límite y precio de conversión tardía (dueño/a o producción). */
export const upsertTicketList = (eventId: UUID, input: E.TicketListInput): Command<RougeState["ticket_lists"][number]> => ({
  name: "upsertTicketList",
  local: guarded("admin.events", () => eventId, (s) => E.upsertTicketList(s, eventId, input)),
  remote: async (sb, l) => {
    must(await sb.from("ticket_lists").upsert({ id: l.id, event_id: l.event_id, name: l.name, free_until: l.free_until, late_price: l.late_price }));
  },
});

export const assignCodesToList = (eventId: UUID, codeIds: UUID[], listId: UUID | null): Command<number> => ({
  name: "assignCodesToList",
  local: guarded("admin.events", () => eventId, (s) => E.assignCodesToList(s, eventId, codeIds, listId)),
  remote: async (sb) => {
    must(await sb.from("event_invite_codes").update({ list_id: listId }).eq("event_id", eventId).in("id", codeIds));
  },
});

// ── Equipo del evento (solo dueño/a) ─────────────────────────────────

/**
 * Suma/cambia/quita (role null) a alguien del equipo por @username.
 * `serverLookup`: en Supabase el perfil puede no estar cargado en el cliente → la RPC lo busca.
 */
export const setStaffRole = (eventId: UUID, username: string, role: StaffRole | null, opts: { serverLookup?: boolean } = {}): Command<{ user_id: UUID }> => ({
  name: "setStaffRole",
  optimistic: false,
  local: guarded("admin.team", () => eventId, (s) => {
    const r = A.setStaffRole(s, eventId, username, role);
    // El servidor resuelve el @username que el cliente no tiene cargado.
    if (!r.ok && opts.serverLookup && r.error.startsWith("No encontramos")) return { ok: true, state: s, data: { user_id: "" } };
    return r;
  }),
  remote: async (sb) => ({ user_id: await rpc<UUID>(sb, "set_staff_role", { p_event: eventId, p_username: username, p_role: role }) }),
});

// ── Accesos: anular códigos y claves de la API v1 ────────────────────

/** Anular un código de 1 uso que no se usó (entrada reembolsada). Dueño/a o producción. */
export const revokeInviteCode = (code: EventInviteCode): Command<EventInviteCode> => ({
  name: "revokeInviteCode",
  local: guarded("admin.events", () => code.event_id, (s) => A.revokeInviteCode(s, code.id)),
  remote: async (sb, c) => {
    must(await sb.from("event_invite_codes").update({ revoked_at: c.revoked_at }).eq("id", code.id).eq("is_used", false));
  },
});

/**
 * Clave de la API para una ticketera (eventId = un evento, null = todos los que administro).
 * La clave completa solo existe en la respuesta: la UI la muestra UNA vez.
 */
export const createApiKey = (name: string, eventId: UUID | null): Command<{ key: ApiKey; secret: string }> => ({
  name: "createApiKey",
  optimistic: false,
  local: (s) => {
    const allowed = eventId ? can(s, eventId, s.current_user_id, "admin.events") : s.events.some((e) => can(s, e.id, s.current_user_id, "admin.events"));
    return allowed ? A.createApiKey(s, s.current_user_id, { name, eventId }) : { ok: false, error: NO_PERMISSION };
  },
  remote: async (sb, local) => {
    const r = await rpc<{ id: UUID; key: string; prefix: string }>(sb, "create_api_key", { p_name: name.trim(), p_event: eventId });
    return { key: { ...local.key, id: r.id, prefix: r.prefix }, secret: r.key };
  },
});

export const revokeApiKey = (keyId: UUID): Command<undefined> => ({
  name: "revokeApiKey",
  local: (s) => A.revokeApiKey(s, s.current_user_id, keyId),
  remote: async (sb) => {
    await rpc(sb, "revoke_api_key", { p_id: keyId });
  },
});

// ── Marca y cobros ───────────────────────────────────────────────────

/** Crear o editar una marca propia (logo + colores). payments_enabled no se escribe desde el cliente. */
export const upsertBrand = (input: B.BrandInput): Command<RougeState["brands"][number]> => ({
  name: "upsertBrand",
  local: (s) => B.upsertBrand(s, s.current_user_id, input),
  remote: async (sb, b, before) => {
    const fields = { name: b.name, logo_url: b.logo_url, primary_color: b.primary_color, accent_color: b.accent_color };
    if (before.brands.some((x) => x.id === b.id)) must(await sb.from("brands").update(fields).eq("id", b.id));
    else must(await sb.from("brands").insert({ id: b.id, owner_id: b.owner_id, ...fields }));
  },
});

/** Modo Demo: simula conectar Mercado Pago (en Supabase lo hace el OAuth de /api/mercadopago, solo servidor). */
export const connectPaymentsDemo = (brandId: UUID): Command<RougeState["brand_payment_accounts"][number]> => ({
  name: "connectPaymentsDemo",
  local: (s) => P.connectPaymentsDemo(s, s.current_user_id, brandId),
});

/** Desconecta la cuenta de cobro: el servidor borra los tokens y apaga payments_enabled. */
export const disconnectPayments = (brandId: UUID): Command<undefined> => ({
  name: "disconnectPayments",
  local: (s) => P.disconnectPayments(s, s.current_user_id, brandId),
  remote: async () => {
    const { disconnectMercadoPago } = await import("@/lib/payments/client");
    await disconnectMercadoPago(brandId);
  },
});

// ── Cuentas de la mesa ───────────────────────────────────────────────

export const addSquadExpense = (squadId: UUID, userId: UUID, input: T.ExpenseInput): Command<RougeState["squad_expenses"][number]> => ({
  name: "addSquadExpense",
  local: (s) => T.addSquadExpense(s, squadId, userId, input),
  remote: async (sb) =>
    rpc<RougeState["squad_expenses"][number]>(sb, "add_squad_expense", {
      p_squad: squadId,
      p_description: input.description.trim(),
      p_amount: input.amount,
      p_participants: input.participantIds,
    }),
});

export const deleteSquadExpense = (expenseId: UUID, userId: UUID): Command<undefined> => ({
  name: "deleteSquadExpense",
  local: (s) => T.deleteSquadExpense(s, expenseId, userId),
  remote: async (sb) => {
    must(await sb.from("squad_expenses").delete().eq("id", expenseId));
  },
});

export const recordSettlement = (squadId: UUID, fromUser: UUID, toUser: UUID, amount: number, method: RougeState["squad_settlements"][number]["method"]): Command<RougeState["squad_settlements"][number]> => ({
  name: "recordSettlement",
  local: (s) => T.recordSettlement(s, squadId, fromUser, toUser, amount, method),
  remote: async (sb) => rpc<RougeState["squad_settlements"][number]>(sb, "record_settlement", { p_squad: squadId, p_to: toUser, p_amount: amount, p_method: method }),
});

export const respondSettlement = (settlementId: UUID, userId: UUID, received: boolean): Command<RougeState["squad_settlements"][number] | null> => ({
  name: "respondSettlement",
  local: (s) => T.respondSettlement(s, settlementId, userId, received),
  remote: async (sb) => {
    await rpc(sb, "respond_settlement", { p_settlement: settlementId, p_received: received });
  },
});

/** Mi alias o CBU/CVU para cobrar (vacío = lo borra). */
export const setPayoutAlias = (userId: UUID, raw: string): Command<RougeState["payout_aliases"][number] | null> => ({
  name: "setPayoutAlias",
  local: (s) => T.setPayoutAlias(s, userId, raw),
  remote: async (sb, row) => {
    if (row) must(await sb.from("payout_aliases").upsert({ user_id: userId, alias: row.alias }, { onConflict: "user_id" }));
    else must(await sb.from("payout_aliases").delete().eq("user_id", userId));
  },
});

// ── Gestión del evento (organizador) ─────────────────────────────────

/** Ítem del menú de la Barra Express del evento (alta, edición, precio, "Agotado"). */
export const upsertMenuItem = (eventId: UUID, input: E.MenuItemInput): Command<RougeState["bar_menu"][number]> => ({
  name: "upsertMenuItem",
  local: guarded("admin.events", () => eventId, (s) => E.upsertMenuItem(s, input)),
  remote: async (sb, i) => {
    must(await sb.from("bar_menu_items").upsert({ id: i.id, event_id: eventId, name: i.name, category: i.category, price: i.price, emoji: i.emoji, is_available: i.is_available }, { onConflict: "event_id,id" }));
  },
});

export const deleteMenuItem = (eventId: UUID, itemId: string): Command<undefined> => ({
  name: "deleteMenuItem",
  local: guarded("admin.events", () => eventId, (s) => E.deleteMenuItem(s, itemId)),
  remote: async (sb) => {
    must(await sb.from("bar_menu_items").delete().eq("event_id", eventId).eq("id", itemId));
  },
});

/** Nueva edición del evento en otra fecha (con su menú y sus reglas de perks). */
export const duplicateEvent = (eventId: UUID, startsAt: string): Command<{ event: RougeEvent; rules: PerkRule[] }> => ({
  name: "duplicateEvent",
  local: guarded("admin.events", () => eventId, (s) => E.duplicateEvent(s, eventId, startsAt, s.current_user_id)),
  remote: async (sb, { event: e, rules }, before) => {
    must(
      await sb.from("events").insert({
        id: e.id, kind: e.kind, slug: e.slug, name: e.name, description: e.description, venue_name: e.venue_name, venue_map_url: e.venue_map_url,
        venue_layout_json: e.venue_layout_json, lineup_json: e.lineup_json, cover_url: e.cover_url, starts_at: e.starts_at, ends_at: e.ends_at,
        lobby_opens_at: e.lobby_opens_at, lobby_expires_at: e.lobby_expires_at, max_capacity: e.max_capacity, master_invite_code: e.master_invite_code,
        created_by: e.created_by, brand_id: e.brand_id, logo_url: e.logo_url, theme_primary: e.theme_primary, theme_accent: e.theme_accent,
        networking_checkin_only: e.networking_checkin_only,
      }),
    );
    must(await sb.from("bar_menu_items").insert(before.bar_menu.map((i) => ({ id: i.id, event_id: e.id, name: i.name, category: i.category, price: i.price, emoji: i.emoji, is_available: i.is_available }))));
    if (rules.length) must(await sb.from("perk_rules").insert(rules.map((r) => ({ id: r.id, event_id: r.event_id, title: r.title, perk_type: r.perk_type, trigger: r.trigger, is_active: r.is_active }))));
  },
});

/** Expulsa a alguien del evento; con `ban` no puede volver a entrar a este evento. */
export const removeAttendee = (eventId: UUID, userId: UUID, ban: boolean, reason: string | null = null): Command<{ banned: boolean }> => ({
  name: "removeAttendee",
  local: guarded("admin.events", () => eventId, (s) => E.removeAttendee(s, eventId, userId, ban, s.current_user_id, reason)),
  remote: async (sb) => {
    await rpc(sb, "remove_attendee", { p_event: eventId, p_user: userId, p_ban: ban, p_reason: reason });
  },
});

export const unbanAttendee = (eventId: UUID, userId: UUID): Command<undefined> => ({
  name: "unbanAttendee",
  local: guarded("admin.events", () => eventId, (s) => E.unbanAttendee(s, eventId, userId)),
  remote: async (sb) => {
    must(await sb.from("event_bans").delete().eq("event_id", eventId).eq("user_id", userId));
  },
});

/** Elimina un evento creado por error o de prueba (solo quien lo creó y si no entró nadie). */
export const deleteEvent = (eventId: UUID): Command<undefined> => ({
  name: "deleteEvent",
  local: (s) => E.deleteEvent(s, eventId, s.current_user_id),
  remote: async (sb) => {
    must(await sb.from("events").delete().eq("id", eventId));
  },
});

// ── RRPP y puerta ────────────────────────────────────────────────────

/** Link propio de un RRPP (lo pide el RRPP o dueño/a/producción). El código lo genera el servidor. */
export const ensurePromoterLink = (eventId: UUID, promoterId: UUID): Command<RougeState["promoter_links"][number]> => ({
  name: "ensurePromoterLink",
  optimistic: false,
  local: (s) => RP.ensurePromoterLink(s, eventId, promoterId, s.current_user_id),
  remote: async (sb) => rpc<RougeState["promoter_links"][number]>(sb, "ensure_promoter_link", { p_event: eventId, p_user: promoterId }),
});

export const setPromoterCommission = (linkId: UUID, amount: number): Command<RougeState["promoter_links"][number]> => ({
  name: "setPromoterCommission",
  local: (s) => RP.setPromoterCommission(s, linkId, amount, s.current_user_id),
  remote: async (sb) => rpc<RougeState["promoter_links"][number]>(sb, "set_promoter_commission", { p_link: linkId, p_amount: amount }),
});

/** Escaneo en la puerta: el servidor decide (código anulado, ya entró, expulsado…) y devuelve quién es. */
/**
 * Escaneo en la puerta. `terminal`: nombre del dispositivo (si otra terminal ya lo hizo entrar, se ve cuál).
 * Atómico en el servidor (door_scan con FOR UPDATE): con dos escaneos simultáneos, solo el primero entra.
 */
/** Esquema escalonado del RRPP: tramos por cantidad + % sobre la barra (dueño/a o producción). */
export const setPromoterScheme = (linkId: UUID, input: RP.PromoterSchemeInput): Command<RougeState["promoter_links"][number]> => ({
  name: "setPromoterScheme",
  local: (s) => RP.setPromoterScheme(s, linkId, input, s.current_user_id),
  remote: async (sb) => void (await rpc(sb, "set_promoter_scheme", { p_link: linkId, p_ticket_price: input.ticket_price, p_tiers: input.tiers, p_bar_percent: input.bar_percent })),
});

export const doorCheckIn = (eventId: UUID, value: string, terminal: string | null = null): Command<D.DoorResult> => ({
  name: "doorCheckIn",
  optimistic: false,
  local: guarded("door.scan", () => eventId, (s) => D.doorCheckIn(s, eventId, value, Date.now(), { terminal })),
  remote: async (sb) => rpc<D.DoorResult>(sb, "door_scan", { p_event: eventId, p_value: value, p_terminal: terminal }),
});

/** Sube los ingresos registrados sin conexión; devuelve cuántos se aplicaron y los conflictos (doble uso). */
export const doorReconcile = (eventId: UUID, items: DO.OfflineCheckIn[]): Command<DO.ReconcileResult> => ({
  name: "doorReconcile",
  optimistic: false,
  local: guarded("door.scan", () => eventId, (s) => DO.reconcileOffline(s, eventId, items)),
  remote: async (sb) => rpc<DO.ReconcileResult>(sb, "door_reconcile", { p_event: eventId, p_items: items }),
});

/** Lista free fuera de horario: cobra el diferencial (efectivo, Mercado Pago o transferencia) y deja pasar. */
export const doorSettleLate = (eventId: UUID, codeId: UUID, method: LatePaymentMethod, terminal: string | null = null): Command<D.DoorResult> => ({
  name: "doorSettleLate",
  optimistic: false,
  local: guarded("door.scan", () => eventId, (s) => D.doorSettleLate(s, eventId, codeId, method, Date.now(), { terminal })),
  remote: async (sb) => rpc<D.DoorResult>(sb, "door_settle_late", { p_event: eventId, p_code: codeId, p_method: method, p_terminal: terminal }),
});

/** Canje en la barra con QR dinámico (perk o voucher de pedido). Un QR vencido o estático se rechaza. */
export const redeemDynamicQr = (eventId: UUID, value: string): Command<SC.DynamicRedeem> => ({
  name: "redeemDynamicQr",
  optimistic: false,
  local: guarded("bar.operate", () => eventId, (s) => {
    const r = SC.redeemDynamicQr(s, eventId, value);
    // Un perk lo canjea quien tenga perks.redeem (barra, gestores); mozo/a solo entrega pedidos.
    if (r.ok && r.data.kind === "PERK" && !can(s, eventId, s.current_user_id, "perks.redeem")) return { ok: false, error: NO_PERMISSION };
    return r;
  }),
  remote: async (sb, local) => {
    await rpc(sb, "redeem_dynamic_qr", { p_event: eventId, p_value: value });
    return local;
  },
});

// ── Seguridad operativa (v1.7) ───────────────────────────────────────

/** Token aleatorio de invitación (solo Modo Demo: en Supabase lo genera el servidor). */
const randomToken = () => {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Dueño/a: invitación de 1 uso (link/QR, 2 h) a su organización. El token sale del servidor y se muestra UNA vez. */
export const createStaffInvite = (input: S.StaffInviteInput): Command<{ invite: RougeState["staff_invites"][number]; token: string }> => ({
  name: "createStaffInvite",
  optimistic: false,
  local: (s) => S.createStaffInvite(s, s.current_user_id, input, randomToken()),
  remote: async (sb, local) => {
    const r = await rpc<{ id: UUID; token: string }>(sb, "create_staff_invite", { p_role: input.role, p_scope: input.scope, p_event_ids: input.eventIds ?? [], p_access_window: input.accessWindow ?? null });
    return { invite: { ...local.invite, id: r.id }, token: r.token };
  },
});

export const acceptStaffInvite = (token: string): Command<RougeState["staff_assignments"][number]> => ({
  name: "acceptStaffInvite",
  optimistic: false,
  local: (s) => S.acceptStaffInvite(s, s.current_user_id, token),
  remote: async (sb, local) => {
    const r = await rpc<{ id: UUID; organization_id: UUID }>(sb, "accept_staff_invite", { p_token: token });
    return { ...local, id: r.id, organization_id: r.organization_id };
  },
});

/** En Supabase el cliente no ve los tokens: la invitación se valida en el servidor (la regla local se saltea). */
export const acceptStaffInviteRemoteOnly = (token: string): Command<{ ok: true }> => ({
  name: "acceptStaffInvite",
  optimistic: false,
  local: (s) => ({ ok: true, state: s, data: { ok: true } }),
  remote: async (sb) => {
    await rpc(sb, "accept_staff_invite", { p_token: token });
    return { ok: true };
  },
});

export const revokeStaffInvite = (inviteId: UUID): Command<undefined> => ({
  name: "revokeStaffInvite",
  local: (s) => S.revokeStaffInvite(s, s.current_user_id, inviteId),
  remote: async (sb) => void (await rpc(sb, "revoke_staff_invite", { p_invite: inviteId })),
});

/** Kill switch: baja inmediata de un integrante en toda la organización. */
export const revokeStaffAccess = (userId: UUID): Command<{ removed: number }> => ({
  name: "revokeStaffAccess",
  local: (s) => S.revokeStaffAccess(s, s.current_user_id, userId),
  remote: async (sb) => ({ removed: await rpc<number>(sb, "revoke_staff_access", { p_user: userId }) }),
});

export const setTerminalPin = (orgId: UUID, pin: string): Command<undefined> => ({
  name: "setTerminalPin",
  local: (s) => S.setTerminalPin(s, s.current_user_id, orgId, pin),
  remote: async (sb) => void (await rpc(sb, "set_terminal_pin", { p_org: orgId, p_pin: pin })),
});

export type KioskResult = { operatorId: UUID; role: StaffRole } | { error: string };

/**
 * Desbloqueo del kiosco con el PIN de quien opera. Un PIN incorrecto NO es un error de `exec`: devuelve
 * `{ error }` y deja registrado el intento (5 fallidos → terminal bloqueada 5 minutos).
 */
export const kioskUnlock = (eventId: UUID, pin: string): Command<KioskResult> => ({
  name: "kioskUnlock",
  optimistic: false,
  local: (s) => {
    const { state, result } = S.kioskAttempt(s, eventId, s.current_user_id, pin);
    return { ok: true, state, data: result.ok ? result.data : { error: result.error } };
  },
  remote: async (sb) => {
    const { data, error } = await sb.rpc("kiosk_unlock", { p_event: eventId, p_pin: pin });
    if (error) {
      if (/kiosk_bad_pin/.test(error.message)) return { error: "PIN incorrecto." };
      throw error;
    }
    const r = data as { operator_id: UUID; role: StaffRole };
    return { operatorId: r.operator_id, role: r.role };
  },
});

/** Registra en la auditoría quién operó la terminal en una acción de puerta o barra. */
export const kioskAudit = (eventId: UUID, operatorId: UUID, action: "door.check_in" | "door.rejected" | "bar.delivered" | "perk.redeemed", target: string): Command<undefined> => ({
  name: "kioskAudit",
  local: (s) => ({ ok: true, state: S.appendAudit(s, { organization_id: s.events.find((e) => e.id === eventId)?.created_by ?? null, event_id: eventId, actor_id: s.current_user_id, operator_id: operatorId, action, target }), data: undefined }),
  remote: async (sb) => void (await rpc(sb, "kiosk_audit", { p_event: eventId, p_operator: operatorId, p_action: action, p_target: target })),
});

/** Reportar a alguien (alerta en vivo a seguridad). `block`: bloqueo mutuo inmediato en el mismo paso. */
export const reportUser = (reportedId: UUID, eventId: UUID | null, reason: ReportReason, details: string, block: boolean): Command<RougeState["user_reports"][number]> => ({
  name: "reportUser",
  local: (s) => {
    const r = S.reportUser(s, s.current_user_id, reportedId, eventId, reason, details);
    if (!r.ok || !block) return r;
    const b = A.blockUser(r.state, s.current_user_id, reportedId);
    return b.ok ? { ok: true, state: b.state, data: r.data } : r;
  },
  remote: async (sb, local) => {
    const id = await rpc<UUID>(sb, "report_user", { p_reported: reportedId, p_event: eventId, p_reason: reason, p_details: details, p_block: block });
    return { ...local, id };
  },
});

export const reviewReport = (reportId: UUID): Command<RougeState["user_reports"][number]> => ({
  name: "reviewReport",
  local: (s) => S.reviewReport(s, s.current_user_id, reportId),
  remote: async (sb) => void (await rpc(sb, "review_report", { p_report: reportId })),
});

/** Borrado REAL de la cuenta: datos en la base (RPC) y usuario de Auth (servidor, /api/account). */
export const deleteAccount = (confirmUsername: string): Command<undefined> => ({
  name: "deleteAccount",
  optimistic: false,
  local: (s) => S.deleteAccount(s, s.current_user_id, confirmUsername),
  remote: async (sb) => {
    await rpc(sb, "delete_my_account", { p_confirm_username: confirmUsername });
    const { data } = (await sb.auth?.getSession?.()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (token && typeof fetch === "function") await fetch("/api/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  },
});

// ── Campañas por WhatsApp (v1.7) ─────────────────────────────────────

export const createCampaign = (eventId: UUID, input: Parameters<typeof CP.createCampaign>[2]): Command<Campaign> => ({
  name: "createCampaign",
  local: (s) => CP.createCampaign(s, eventId, input),
  remote: async (sb, c) => {
    must(await sb.from("campaigns").insert({ id: c.id, organization_id: c.organization_id, event_id: c.event_id, name: c.name, segment: c.segment, promoter_id: c.promoter_id, template: c.template, benefit: c.benefit, created_by: c.created_by }));
  },
});

/** Marca a alguien como contactado (después de abrir su chat de WhatsApp con el mensaje). */
export const markContacted = (campaignId: UUID, userId: UUID, contacted: boolean): Command<CampaignContact | null> => ({
  name: "markContacted",
  local: (s) => CP.markContacted(s, campaignId, userId, contacted),
  remote: async (sb, row) => {
    if (row) must(await sb.from("campaign_contacts").upsert({ campaign_id: row.campaign_id, user_id: row.user_id, contacted_at: row.contacted_at, contacted_by: row.contacted_by }));
    else must(await sb.from("campaign_contacts").delete().eq("campaign_id", campaignId).eq("user_id", userId));
  },
});

// ── Consola global (solo administradores de ROUGE) ───────────────────

export const saCheckIn = (eventId: UUID, userId: UUID): Command<undefined> => ({
  name: "saCheckIn",
  local: (s) => SA.saCheckIn(s, s.current_user_id, eventId, userId),
  remote: async (sb) => void (await rpc(sb, "sa_check_in", { p_event: eventId, p_user: userId })),
});

export const saHideFromLobby = (eventId: UUID, userId: UUID): Command<undefined> => ({
  name: "saHideFromLobby",
  local: (s) => SA.saHideFromLobby(s, s.current_user_id, eventId, userId),
  remote: async (sb) => void (await rpc(sb, "sa_hide_from_lobby", { p_event: eventId, p_user: userId })),
});

export const saRemoveAttendee = (eventId: UUID, userId: UUID, ban: boolean): Command<{ banned: boolean }> => ({
  name: "saRemoveAttendee",
  local: (s) => SA.saRemoveAttendee(s, s.current_user_id, eventId, userId, ban),
  remote: async (sb, d) => {
    await rpc(sb, "sa_remove_attendee", { p_event: eventId, p_user: userId, p_ban: ban });
    return d;
  },
});

export const saRevokeCode = (codeId: UUID): Command<undefined> => ({
  name: "saRevokeCode",
  local: (s) => SA.saRevokeCode(s, s.current_user_id, codeId),
  remote: async (sb) => void (await rpc(sb, "sa_revoke_code", { p_code: codeId })),
});

export const saRevokeStaff = (orgId: UUID, userId: UUID): Command<{ removed: number }> => ({
  name: "saRevokeStaff",
  local: (s) => SA.saRevokeStaff(s, s.current_user_id, orgId, userId),
  remote: async (sb) => ({ removed: await rpc<number>(sb, "sa_revoke_staff", { p_org: orgId, p_user: userId }) }),
});

// ── Monetización (v1.7) ──────────────────────────────────────────────

/** Invitar un trago desde el chat 1:1 (el QR le llega a la otra persona; con cobro online, al acreditarse el pago). */
export const giftDrink = (connectionId: UUID, itemId: string): Command<{ order: BarOrder; perk: RougeState["user_perks_qrs"][number] | null }> => ({
  name: "giftDrink",
  optimistic: false,
  local: (s) => MO.giftDrinkInChat(s, s.current_user_id, connectionId, itemId),
  remote: async (sb, local) => {
    const r = await rpc<{ order_id: UUID }>(sb, "gift_drink", { p_connection: connectionId, p_item: itemId });
    return { ...local, order: { ...local.order, id: r.order_id } };
  },
});

/** Mesa VIP dividida entre el Squad: una cuota por integrante; al 100 % pagado se libera el QR grupal. */
export const createVipReservation = (squadId: UUID, itemId: string): Command<VipReservation> => ({
  name: "createVipReservation",
  optimistic: false,
  local: (s) => MO.createVipReservation(s, squadId, s.current_user_id, itemId),
  remote: async (sb, local) => ({ ...local, id: await rpc<UUID>(sb, "create_vip_reservation", { p_squad: squadId, p_item: itemId }) }),
});

// ── Creador modular de eventos y módulos (v1.8) ──────────────────────

/**
 * Crea o edita un evento desde el creador (ROUGE HQ, o el dueño/a con autogestión). No optimista: el id y el código
 * maestro de un evento nuevo los genera el servidor.
 */
export const saveEventFromBuilder = (input: E.EventBuilderInput): Command<{ event: RougeEvent; lists: RougeState["ticket_lists"] }> => ({
  name: "saveEventFromBuilder",
  optimistic: false,
  local: (s) => E.saveEventFromBuilder(s, s.current_user_id, input),
  remote: async (sb, local, before) => {
    const e = local.event;
    const isNew = !before.events.some((x) => x.id === e.id);
    const id = await rpc<UUID>(sb, "builder_save_event", {
      p_event: {
        id: isNew ? null : e.id,
        organization_id: input.organization_id,
        slug: e.slug,
        name: e.name,
        description: e.description,
        venue_name: e.venue_name,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        lobby_opens_at: e.lobby_opens_at,
        lobby_expires_at: e.lobby_expires_at,
        max_capacity: e.max_capacity,
        lineup_json: e.lineup_json,
        brand_id: e.brand_id,
        logo_url: e.logo_url,
        theme_primary: e.theme_primary,
        theme_accent: e.theme_accent,
        features: e.features,
        lifecycle_status: e.lifecycle_status,
      },
      p_lists: local.lists.map((l) => ({ id: l.id, name: l.name, free_until: l.free_until, late_price: l.late_price })),
      p_menu: isNew ? before.bar_menu.map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.price, emoji: i.emoji })) : [],
    });
    return { ...local, event: { ...e, id } };
  },
});

/** Prende / apaga módulos de un evento (dependencias resueltas en el motor y en SQL). */
export const setEventFeatures = (eventId: UUID, flags: Partial<EventFeatureFlags>): Command<EventFeatureFlags> => ({
  name: "setEventFeatures",
  local: (s) => E.setEventFeatures(s, s.current_user_id, eventId, flags),
  remote: async (sb, f) => {
    await rpc(sb, "set_event_features", { p_event: eventId, p_features: f });
    return f;
  },
});

/** ROUGE HQ: habilitar que el dueño/a use el creador por su cuenta (/admin/events). */
export const setOwnerSelfService = (orgId: UUID, allow: boolean): Command<OrganizationSettings> => ({
  name: "setOwnerSelfService",
  local: (s) => E.setOwnerSelfService(s, s.current_user_id, orgId, allow),
  remote: async (sb) => void (await rpc(sb, "sa_set_owner_self_service", { p_org: orgId, p_allow: allow })),
});

/**
 * Escaneo en una zona de control (v1.10). `zoneId` null = puerta principal. El servidor valida la categoría para la
 * zona, acredita si es una puerta y registra la lectura (zone_check_ins).
 */
export const zoneCheckIn = (eventId: UUID, zoneId: UUID | null, value: string, terminal: string | null = null): Command<D.DoorResult> => ({
  name: "zoneCheckIn",
  optimistic: false,
  local: guarded("door.scan", () => eventId, (s) => D.zoneCheckIn(s, eventId, zoneId, value, Date.now(), { terminal })),
  remote: async (sb) => rpc<D.DoorResult>(sb, "zone_check_in", { p_event: eventId, p_zone: zoneId, p_value: value, p_terminal: terminal }),
});

/** Alta o edición de una zona de control (dueño/a y producción). Mismo id que el optimista. */
export const upsertZone = (eventId: UUID, input: D.ZoneInput): Command<RougeState["event_zones"][number]> => ({
  name: "upsertZone",
  local: guarded("admin.events", () => eventId, (s) => D.upsertZone(s, eventId, input)),
  remote: async (sb, z, before) => {
    const fields = { name: z.name, kind: z.kind, allowed_tiers: z.allowed_tiers, sort_order: z.sort_order, is_active: z.is_active };
    if (before.event_zones.some((x) => x.id === z.id)) must(await sb.from("event_zones").update(fields).eq("id", z.id).eq("event_id", eventId));
    else must(await sb.from("event_zones").insert({ id: z.id, event_id: eventId, ...fields }));
  },
});

export const deleteZone = (eventId: UUID, zoneId: UUID): Command<undefined> => ({
  name: "deleteZone",
  local: guarded("admin.events", () => eventId, (s) => D.deleteZone(s, zoneId)),
  remote: async (sb) => {
    must(await sb.from("event_zones").delete().eq("id", zoneId).eq("event_id", eventId));
  },
});
