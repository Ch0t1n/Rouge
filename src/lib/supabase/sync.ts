/**
 * Sincronización con Supabase: arma un RougeState completo a partir de las
 * tablas (siempre filtradas por RLS en el servidor) y escucha Realtime.
 *
 * El motor y la UI no saben de dónde viene el estado: Modo Demo y Supabase
 * comparten exactamente la misma forma (`RougeState`).
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { BarMenuItem, Profile, RougeEvent, RougeState, UUID } from "@/lib/types";
import { lobbyPhase } from "@/lib/engine/selectors";
import { BAR_MENU, STATE_VERSION } from "@/lib/mock/seed";

/** Columnas legibles de `profiles` (el teléfono NO: column privileges). */
const PROFILE_COLUMNS = "id,username,full_name,birth_date,gender,bio,photos,loop_video_url,music_genres,spotify_embed_url,is_verified,created_at";

type Row = Record<string, unknown>;

async function q<T = Row>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw error;
  return (data as T[]) ?? [];
}

/** Evento a mostrar: el elegido si existe; si no, uno donde estoy (vigente); si no, el más próximo. */
function pickEvent(events: RougeEvent[], myEventIds: Set<UUID>, staffIds: Set<UUID>, preferred: UUID | null, now: number): RougeEvent | undefined {
  if (preferred) {
    const e = events.find((x) => x.id === preferred);
    if (e) return e;
  }
  const alive = (e: RougeEvent) => lobbyPhase(e, now) !== "expired";
  const byStart = [...events].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  return (
    byStart.find((e) => myEventIds.has(e.id) && alive(e)) ??
    byStart.find((e) => staffIds.has(e.id) && alive(e)) ??
    byStart.find(alive) ??
    byStart.at(-1)
  );
}

export interface RemoteSnapshot {
  state: RougeState;
  isStaff: boolean;
}

export async function fetchRemoteState(sb: SupabaseClient, userId: UUID, preferredEventId: UUID | null): Promise<RemoteSnapshot> {
  const now = Date.now();
  const [events, mine, staffRows] = await Promise.all([
    q<RougeEvent>(sb.from("events").select("*").order("starts_at", { ascending: true })),
    q<{ event_id: UUID }>(sb.from("event_attendees").select("event_id").eq("user_id", userId)),
    q<{ event_id: UUID }>(sb.from("event_staff").select("event_id").eq("user_id", userId)),
  ]);
  const staffIds = new Set([...staffRows.map((r) => r.event_id), ...events.filter((e) => e.created_by === userId).map((e) => e.id)]);
  const event = pickEvent(events, new Set(mine.map((r) => r.event_id)), staffIds, preferredEventId, now);
  const eventId = event?.id ?? "";
  const isStaff = !!event && staffIds.has(event.id);

  const byEvent = <T,>(table: string, select = "*") => (eventId ? q<T>(sb.from(table).select(select).eq("event_id", eventId)) : Promise.resolve([] as T[]));

  const [attendees, connections, squads, squadMembers, pins, messages, blasts, perks, rules, raffles, songs, menu, orders, blocks, codes, me] = await Promise.all([
    byEvent<RougeState["event_attendees"][number]>("event_attendees"),
    q<RougeState["connections"][number]>(sb.from("connections").select("*")), // los matches de TODOS los eventos persisten
    byEvent<RougeState["squads"][number]>("squads"),
    q<RougeState["squad_members"][number]>(sb.from("squad_members").select("*")),
    byEvent<RougeState["map_pins"][number]>("map_pins"),
    q<RougeState["messages"][number]>(sb.from("messages").select("*").order("created_at", { ascending: false }).limit(1500)),
    byEvent<RougeState["event_blasts"][number]>("event_blasts"),
    q<RougeState["user_perks_qrs"][number]>(sb.from("user_perks_qrs").select("*")),
    byEvent<RougeState["perk_rules"][number]>("perk_rules"),
    byEvent<RougeState["raffles"][number]>("raffles"),
    byEvent<RougeState["song_requests"][number]>("song_requests"),
    byEvent<BarMenuItem & { is_available: boolean; price: number | string }>("bar_menu_items"),
    byEvent<RougeState["bar_orders"][number]>("bar_orders"),
    q<RougeState["user_blocks"][number]>(sb.from("user_blocks").select("*")),
    isStaff ? byEvent<RougeState["event_invite_codes"][number]>("event_invite_codes") : Promise.resolve([]),
    q<Profile>(sb.rpc("my_profile")),
  ]);

  // Perfiles necesarios: asistentes, contrapartes de mis conexiones, squads y bloqueados.
  const ids = new Set<UUID>([userId]);
  attendees.forEach((a) => ids.add(a.user_id));
  connections.forEach((c) => (ids.add(c.sender_id), ids.add(c.receiver_id)));
  squadMembers.forEach((m) => ids.add(m.user_id));
  blocks.forEach((b) => b.blocked_user_id && ids.add(b.blocked_user_id));
  raffles.forEach((r) => r.winner_user_id && ids.add(r.winner_user_id));
  orders.forEach((o) => ids.add(o.user_id));
  const profiles = ids.size ? await q<Profile>(sb.from("profiles").select(PROFILE_COLUMNS).in("id", [...ids])) : [];

  // Mi teléfono (my_profile) y, para el staff, los de los asistentes (event_crm) → CRM y bloqueos.
  const phones = new Map<UUID, string | null>();
  if (me[0]) phones.set(userId, me[0].phone_normalized);
  let adminStats: RougeState["admin_stats"] = null;
  if (isStaff && eventId) {
    const crm = await q<{ user_id: UUID; phone: string | null }>(sb.rpc("event_crm", { p_event: eventId })).catch(() => []);
    crm.forEach((r) => phones.set(r.user_id, r.phone));
    const { data: stats } = await sb.rpc("event_stats", { p_event: eventId });
    if (stats) adminStats = { event_id: eventId, ...(stats as Omit<NonNullable<RougeState["admin_stats"]>, "event_id">) };
  }

  const squadIds = new Set(squads.map((s) => s.id));
  const state: RougeState = {
    version: STATE_VERSION,
    seeded_at: new Date(now).toISOString(),
    current_user_id: userId,
    active_event_id: eventId,
    profiles: profiles.map((p) => ({ ...p, phone_normalized: phones.get(p.id) ?? null, photos: p.photos ?? [], music_genres: p.music_genres ?? [] })),
    user_blocks: blocks,
    events,
    event_invite_codes: codes,
    event_attendees: attendees.map((a) => ({ ...a, total_spent: Number(a.total_spent), visited_sectors: a.visited_sectors ?? [] })),
    connections,
    squads,
    squad_members: squadMembers.filter((m) => squadIds.has(m.squad_id)),
    map_pins: pins,
    messages: messages.reverse(),
    event_blasts: blasts,
    user_perks_qrs: perks,
    perk_rules: rules,
    raffles,
    song_requests: songs,
    bar_menu: menu.length
      ? menu.filter((i) => i.is_available !== false).map((i) => ({ id: i.id, name: i.name, category: i.category, price: Number(i.price), emoji: i.emoji }))
      : BAR_MENU,
    bar_orders: orders.map((o) => ({ ...o, total_amount: Number(o.total_amount) })),
    admin_stats: adminStats,
  };
  return { state, isStaff };
}

/** Tablas publicadas en `supabase_realtime` (ver schema.sql) que disparan una re-sincronización. */
const REALTIME_TABLES = ["messages", "map_pins", "connections", "squad_members", "squads", "blast_deliveries", "user_perks_qrs", "bar_orders", "song_requests", "raffles", "event_attendees"];

/**
 * Escucha cambios relevantes. Realtime respeta RLS: cada usuario solo recibe
 * filas que puede ver. Ante cualquier cambio se re-sincroniza (debounced).
 */
export function subscribeRealtime(sb: SupabaseClient, eventId: UUID, onChange: () => void): RealtimeChannel {
  const channel = sb.channel(`rouge:${eventId || "global"}`);
  for (const table of REALTIME_TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange());
  }
  channel.subscribe();
  return channel;
}
