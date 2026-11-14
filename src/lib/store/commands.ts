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
import type { BarOrder, Connection, EventAttendee, EventInviteCode, MoodTag, PerkRule, Raffle, RaffleFilter, RougeEvent, RougeState, SongRequest, Squad, StaffRole, UUID } from "@/lib/types";
import * as A from "@/lib/engine/actions";
import type { Result } from "@/lib/engine/actions";
import { can, NO_PERMISSION, type Permission } from "@/lib/engine/roles";

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
    };
    const existed = before.profiles.some((x) => x.id === p.id);
    if (existed) must(await sb.from("profiles").update(fields).eq("id", p.id));
    else must(await sb.from("profiles").insert({ id: p.id, ...fields }));
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
export const joinEvent = (userId: UUID, code: string, mood: MoodTag, serverEventId?: UUID): Command<{ eventId: UUID; squadId?: UUID }> => ({
  name: "joinEvent",
  optimistic: false,
  local: (s) => {
    const r = A.joinEvent(s, userId, code, mood);
    if (!r.ok && serverEventId && !A.resolveAccessCode(s, code)) return { ok: true, state: s, data: { eventId: serverEventId } };
    return r;
  },
  remote: async (sb, local) => {
    const eventId = await rpc<UUID>(sb, "join_event", { p_code: code, p_mood: mood });
    return { ...local, eventId };
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
): Command<BarOrder> => ({
  name: "createBarOrder",
  optimistic: false, // el código de retiro (QR) lo genera el servidor
  local: (s) => A.createBarOrder(s, eventId, userId, cart, delivery),
  // El servidor fija precios y código de retiro: se usa SU pedido (el QR tiene que coincidir).
  remote: async (sb) =>
    rpc<BarOrder>(sb, "create_bar_order", { p_event: eventId, p_items: cart.map((c) => ({ item_id: c.itemId, qty: c.qty })), p_delivery: delivery }),
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

export const upsertEvent = (input: Parameters<typeof A.upsertEvent>[1]): Command<RougeEvent> => ({
  name: "upsertEvent",
  // Cualquiera con sesión crea un evento (queda como owner); editar uno existente exige admin.events.
  local: (s) => (input.id && s.events.some((e) => e.id === input.id) && !can(s, input.id, s.current_user_id, "admin.events") ? { ok: false, error: NO_PERMISSION } : A.upsertEvent(s, input)),
  remote: async (sb, e, before) => {
    const isNew = !before.events.some((x) => x.id === e.id);
    const row = {
      id: e.id,
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
      ...(isNew ? { master_invite_code: e.master_invite_code, created_by: e.created_by } : {}),
    };
    if (isNew) {
      must(await sb.from("events").insert(row));
      // Menú base de Barra Express para el evento nuevo (el staff lo puede editar después).
      must(await sb.from("bar_menu_items").insert(before.bar_menu.map((i) => ({ id: i.id, event_id: e.id, name: i.name, category: i.category, price: i.price, emoji: i.emoji }))));
    } else {
      must(await sb.from("events").update(row).eq("id", e.id));
    }
  },
});

export const generateInviteCodes = (eventId: UUID, count: number): Command<EventInviteCode[]> => ({
  name: "generateInviteCodes",
  optimistic: false,
  local: guarded("admin.events", () => eventId, (s) => A.generateInviteCodes(s, eventId, count)),
  remote: async (sb) => rpc<EventInviteCode[]>(sb, "generate_invite_codes", { p_event: eventId, p_count: count }),
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
