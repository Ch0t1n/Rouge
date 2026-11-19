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
const PROFILE_COLUMNS = "id,username,full_name,birth_date,gender,bio,photos,loop_video_url,music_genres,spotify_embed_url,instagram_username,instagram_verified,company,job_title,interests,linkedin_username,is_verified,created_at";

type Row = Record<string, unknown>;

/** Ids por pedido al cargar perfiles (≈ 2,3 KB de URL: entra holgado en cualquier gateway). */
export const PROFILE_BATCH = 60;
export const chunk = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

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
    q<RougeState["event_staff"][number]>(sb.from("event_staff").select("*").eq("user_id", userId)),
  ]);
  const staffIds = new Set([...staffRows.map((r) => r.event_id), ...events.filter((e) => e.created_by === userId).map((e) => e.id)]);
  const event = pickEvent(events, new Set(mine.map((r) => r.event_id)), staffIds, preferredEventId, now);
  const eventId = event?.id ?? "";
  const isStaff = !!event && staffIds.has(event.id);
  const myRole = event ? (staffRows.find((r) => r.event_id === event.id)?.role ?? (event.created_by === userId ? "owner" : null)) : null;
  const isManager = myRole === "owner" || myRole === "manager";

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
    isManager ? byEvent<RougeState["event_invite_codes"][number]>("event_invite_codes") : Promise.resolve([]),
    q<Profile>(sb.rpc("my_profile")),
  ]);
  // Mi Instagram conectado (sin token). Si la RPC no existe todavía (esquema viejo), no rompe la carga.
  // Mis claves de la API (la columna key_hash no es legible por clientes).
  const apiKeys = await q<RougeState["api_keys"][number]>(sb.from("api_keys").select("id,name,prefix,created_by,event_id,scopes,last_used_at,revoked_at,created_at").eq("created_by", userId).order("created_at", { ascending: false })).catch(() => []);
  const igRows = await q<{ username: string; account_type: string | null; connected_at: string }>(sb.rpc("my_instagram")).catch(() => []);
  // Marcas: las mías (panel) + las de los eventos cargados (logo y colores). Cuenta de cobro: solo las mías, sin tokens.
  // Cuentas de la mesa del evento activo y alias de quienes comparten Squad conmigo (RLS).
  const eventBrandIds = [...new Set(events.map((e) => e.brand_id).filter((x): x is UUID => !!x))];
  const [myBrands, eventBrands, payAccounts, expenses, settlements, aliases] = await Promise.all([
    q<RougeState["brands"][number]>(sb.from("brands").select("*").eq("owner_id", userId)).catch(() => []),
    eventBrandIds.length ? q<RougeState["brands"][number]>(sb.from("brands").select("*").in("id", eventBrandIds)).catch(() => []) : Promise.resolve([]),
    q<RougeState["brand_payment_accounts"][number]>(sb.rpc("my_brand_payments")).catch(() => []),
    byEvent<RougeState["squad_expenses"][number]>("squad_expenses").catch(() => []),
    byEvent<RougeState["squad_settlements"][number]>("squad_settlements").catch(() => []),
    q<RougeState["payout_aliases"][number]>(sb.from("payout_aliases").select("user_id,alias")).catch(() => []),
  ]);
  // Expulsados del evento (RLS: el staff ve los del evento; cada uno, el propio).
  const bans = await byEvent<RougeState["event_bans"][number]>("event_bans").catch(() => []);
  // Links de RRPP (RLS: dueño/a y producción ven todos los del evento; el RRPP, el suyo).
  const promoterLinks = await byEvent<RougeState["promoter_links"][number]>("promoter_links").catch(() => []);
  const promoterStats =
    eventId && (isManager || myRole === "promoter")
      ? (await q<NonNullable<RougeState["promoter_stats"]>[number]>(sb.rpc("promoter_stats", { p_event: eventId })).catch(() => [])).map((r) => ({ ...r, commission_per_entry: Number(r.commission_per_entry), to_pay: Number(r.to_pay) }))
      : null;
  const brands = [...new Map([...myBrands, ...eventBrands].map((b) => [b.id, b])).values()];
  // Mis roles en todos los eventos (selector del panel) + el equipo completo del evento activo si soy staff.
  const teamRows = isStaff ? await byEvent<RougeState["event_staff"][number]>("event_staff") : [];
  const eventStaff = [...staffRows.filter((r) => r.event_id !== eventId || !isStaff), ...teamRows];

  // Perfiles necesarios: asistentes, contrapartes de mis conexiones, squads y bloqueados.
  const ids = new Set<UUID>([userId]);
  attendees.forEach((a) => ids.add(a.user_id));
  connections.forEach((c) => (ids.add(c.sender_id), ids.add(c.receiver_id)));
  squadMembers.forEach((m) => ids.add(m.user_id));
  blocks.forEach((b) => b.blocked_user_id && ids.add(b.blocked_user_id));
  raffles.forEach((r) => r.winner_user_id && ids.add(r.winner_user_id));
  orders.forEach((o) => ids.add(o.user_id));
  expenses.forEach((e) => ids.add(e.paid_by));
  bans.forEach((b) => ids.add(b.user_id));
  teamRows.forEach((r) => ids.add(r.user_id));
  // Por tandas: un `in (...)` con cientos de ids arma una URL que los gateways rechazan (evento real = miles de asistentes).
  const profiles = (await Promise.all(chunk([...ids], PROFILE_BATCH).map((part) => q<Profile>(sb.from("profiles").select(PROFILE_COLUMNS).in("id", part))))).flat();

  // Mi teléfono (my_profile) y, para el staff, los de los asistentes (event_crm) → CRM y bloqueos.
  const phones = new Map<UUID, string | null>();
  if (me[0]) phones.set(userId, me[0].phone_normalized);
  let adminStats: RougeState["admin_stats"] = null;
  if (isStaff && eventId) {
    // Teléfonos (CRM) solo para dueño/a y producción; métricas también para seguridad (resumen).
    if (isManager) {
      const crm = await q<{ user_id: UUID; phone: string | null }>(sb.rpc("event_crm", { p_event: eventId })).catch(() => []);
      crm.forEach((r) => phones.set(r.user_id, r.phone));
    }
    const { data: stats } = myRole === "bartender" || myRole === "waiter" || myRole === "promoter" ? { data: null } : await sb.rpc("event_stats", { p_event: eventId });
    if (stats) adminStats = { event_id: eventId, ...(stats as Omit<NonNullable<RougeState["admin_stats"]>, "event_id">) };
  }

  const squadIds = new Set(squads.map((s) => s.id));
  const state: RougeState = {
    version: STATE_VERSION,
    seeded_at: new Date(now).toISOString(),
    current_user_id: userId,
    active_event_id: eventId,
    profiles: profiles.map((p) => ({ ...p, phone_normalized: phones.get(p.id) ?? null, photos: p.photos ?? [], music_genres: p.music_genres ?? [], interests: p.interests ?? [], company: p.company ?? null, job_title: p.job_title ?? null, linkedin_username: p.linkedin_username ?? null })),
    instagram_links: igRows.map((r) => ({ user_id: userId, username: r.username, account_type: r.account_type, connected_at: r.connected_at })),
    user_blocks: blocks,
    events: events.map((e) => ({ ...e, event_type: e.event_type ?? "nightlife", brand_id: e.brand_id ?? null, logo_url: e.logo_url ?? null, theme_primary: e.theme_primary ?? null, theme_accent: e.theme_accent ?? null })),
    brands,
    brand_payment_accounts: payAccounts,
    event_staff: eventStaff,
    event_invite_codes: codes.map((c) => ({ ...c, checked_in_at: c.checked_in_at ?? null })),
    promoter_links: promoterLinks.map((l) => ({ ...l, commission_per_entry: Number(l.commission_per_entry) })),
    api_keys: apiKeys,
    event_bans: bans,
    event_attendees: attendees.map((a) => ({ ...a, total_spent: Number(a.total_spent), visited_sectors: a.visited_sectors ?? [], referred_by: a.referred_by ?? null, checked_in_at: a.checked_in_at ?? null })),
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
      ? menu.map((i) => ({ id: i.id, name: i.name, category: i.category, price: Number(i.price), emoji: i.emoji, is_available: i.is_available !== false }))
      : BAR_MENU,
    bar_orders: orders.map((o) => ({ ...o, total_amount: Number(o.total_amount), payment_status: o.payment_status ?? "pay_at_bar", payment_ref: o.payment_ref ?? null, paid_at: o.paid_at ?? null })),
    squad_expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) })),
    squad_settlements: settlements.map((t) => ({ ...t, amount: Number(t.amount) })),
    payout_aliases: aliases,
    admin_stats: adminStats,
    promoter_stats: promoterStats,
  };
  return { state, isStaff };
}

/** Tablas publicadas en `supabase_realtime` (ver schema.sql) que disparan una re-sincronización. */
const REALTIME_TABLES = ["messages", "map_pins", "connections", "squad_members", "squads", "blast_deliveries", "user_perks_qrs", "bar_orders", "song_requests", "raffles", "event_attendees", "brands", "squad_expenses", "squad_settlements"];

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
