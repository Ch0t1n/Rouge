/**
 * Sincronización con Supabase: arma un RougeState completo a partir de las
 * tablas (siempre filtradas por RLS en el servidor) y escucha Realtime.
 *
 * El motor y la UI no saben de dónde viene el estado: Modo Demo y Supabase
 * comparten exactamente la misma forma (`RougeState`).
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { BarMenuItem, Profile, ProfilePersona, RougeEvent, RougeState, UUID } from "@/lib/types";
import { lobbyPhase } from "@/lib/engine/selectors";
import { assignmentCovers, PLATFORM_ROLE, withinAccessWindow } from "@/lib/engine/roles";
import { BAR_MENU, STATE_VERSION } from "@/lib/mock/seed";

/**
 * [v1.8] Columnas PÚBLICAS de `event_attendees` (column privileges): sin gasto, origen, RRPP, hora de ingreso ni
 * sectores visitados. Lo privado llega por my_attendances() (lo mío), event_attendance() (equipo) y shared_zones().
 */
export const ATTENDEE_COLUMNS = "id,event_id,user_id,mood_tag,persona_id,ghost_mode,only_liked_can_icebreak,icebreaker_used,last_active_at,joined_at,is_checked_in,tier";

/** Tarjeta pública de otra persona (profile_cards): edad en vez de fecha de nacimiento; sin teléfono. */
type ProfileCard = Omit<Profile, "birth_date" | "phone_normalized" | "username"> & { username: string | null; age: number | null };

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
  const [events, mine, staffRows, assignments] = await Promise.all([
    q<RougeEvent>(sb.from("events").select("*").order("starts_at", { ascending: true })),
    q<{ event_id: UUID }>(sb.from("event_attendees").select("event_id").eq("user_id", userId)),
    q<RougeState["event_staff"][number]>(sb.from("event_staff").select("*").eq("user_id", userId)),
    // RLS: las mías (staff) y las de mi organización (dueño/a). Si la tabla no existe todavía, no rompe la carga.
    q<RougeState["staff_assignments"][number]>(sb.from("staff_assignments").select("*")).catch(() => []),
  ]);
  const myAssignments = assignments.filter((a) => a.user_id === userId);
  // Rol por asignación de la organización (alcance + ventana horaria), igual que staffRoleOf y has_staff_role.
  const assignedRole = (e: RougeEvent) => {
    const a = myAssignments.find((x) => assignmentCovers(x, e));
    return a && (!a.access_window || withinAccessWindow(e, now)) ? a.role : null;
  };
  const staffIds = new Set([...staffRows.map((r) => r.event_id), ...events.filter((e) => e.created_by === userId || assignedRole(e)).map((e) => e.id)]);
  const event = pickEvent(events, new Set(mine.map((r) => r.event_id)), staffIds, preferredEventId, now);
  const eventId = event?.id ?? "";
  const isStaff = !!event && staffIds.has(event.id);
  const myRole = event ? (staffRows.find((r) => r.event_id === event.id)?.role ?? (event.created_by === userId ? "owner" : assignedRole(event))) : null;
  const isManager = myRole === "owner" || myRole === "manager";

  const byEvent = <T,>(table: string, select = "*") => (eventId ? q<T>(sb.from(table).select(select).eq("event_id", eventId)) : Promise.resolve([] as T[]));

  const [attendees, connections, squads, squadMembers, pins, messages, blasts, perks, rules, raffles, songs, menu, orders, blocks, codes, me] = await Promise.all([
    byEvent<RougeState["event_attendees"][number]>("event_attendees", ATTENDEE_COLUMNS),
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
  // Seguridad: invitaciones y auditoría de MI organización (dueño/a; producción ve la auditoría), PINs sin hash,
  // reportes (RLS: los míos o los del evento para seguridad/dueño/producción) y si soy admin global.
  // QR dinámicos: secretos de MIS credenciales; el del evento solo para puerta/barra (validación sin conexión).
  const canScan = myRole === "owner" || myRole === "manager" || myRole === "security" || myRole === "bartender" || myRole === "waiter";
  const [lists, qrSecrets, eventSecret] = await Promise.all([
    byEvent<RougeState["ticket_lists"][number]>("ticket_lists").catch(() => []),
    eventId ? q<NonNullable<RougeState["qr_secrets"]>[number]>(sb.rpc("my_qr_secrets", { p_event: eventId })).catch(() => []) : Promise.resolve([]),
    eventId && canScan ? sb.rpc("event_qr_secret", { p_event: eventId }).then((r) => (r.data as string | null) ?? null, () => null) : Promise.resolve(null),
  ]);
  // Campañas: base de clientes de la organización (con teléfonos) solo para dueño/a y producción.
  const [orgContacts, campaigns, campaignContacts] = eventId && isManager
    ? await Promise.all([
        q<NonNullable<RougeState["org_contacts"]>[number]>(sb.rpc("org_contacts", { p_event: eventId })).catch(() => []),
        q<NonNullable<RougeState["campaigns"]>[number]>(sb.from("campaigns").select("*").eq("event_id", eventId)).catch(() => []),
        q<NonNullable<RougeState["campaign_contacts"]>[number]>(sb.from("campaign_contacts").select("*")).catch(() => []),
      ])
    : [[], [], []];
  // Configuración de organizaciones (la mía; ROUGE HQ ve todas) → autogestión del creador de eventos.
  const orgSettings = await q<NonNullable<RougeState["organization_settings"]>[number]>(sb.from("organization_settings").select("*")).catch(() => []);
  const vipReservations = await byEvent<NonNullable<RougeState["vip_reservations"]>[number]>("vip_reservations").catch(() => []);
  const curves = eventId && isManager ? await q<NonNullable<RougeState["event_curves_history"]>[number]>(sb.rpc("org_event_curves", { p_event: eventId }).then((r) => ({ data: (r.data as unknown[]) ?? [], error: r.error }))).catch(() => []) : [];
  const [invites, terminalPins, audit, reports, platformAdmin] = await Promise.all([
    q<RougeState["staff_invites"][number]>(sb.from("staff_invites").select("id,organization_id,role,scope,event_ids,access_window,expires_at,used_at,used_by,revoked_at,created_by,created_at").eq("organization_id", userId)).catch(() => []),
    q<{ organization_id: UUID; user_id: UUID; updated_at: string }>(sb.rpc("my_terminal_pins")).catch(() => []),
    q<RougeState["audit_log"][number]>(sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300)).catch(() => []),
    q<RougeState["user_reports"][number]>(sb.from("user_reports").select("*").order("created_at", { ascending: false }).limit(200)).catch(() => []),
    sb.rpc("am_platform_admin").then((r) => r.data === true, () => false),
  ]);
  // Mis roles en todos los eventos (selector del panel) + el equipo completo del evento activo si soy staff.
  const teamRows = isStaff ? await byEvent<RougeState["event_staff"][number]>("event_staff") : [];
  const eventStaff = [...staffRows.filter((r) => r.event_id !== eventId || !isStaff), ...teamRows];

  // [v1.8] Reuniones (RLS: solo las mías), salas/puntos de mis eventos y mis ajustes de privacidad.
  const [meetings, spots, privacy] = await Promise.all([
    q<RougeState["meetings"][number]>(sb.from("meetings").select("*").order("starts_at", { ascending: true })).catch(() => []),
    q<RougeState["venue_spots"][number]>(sb.from("venue_spots").select("*")).catch(() => []),
    q<RougeState["privacy_settings"][number]>(sb.from("privacy_settings").select("*").eq("user_id", userId)).catch(() => []),
  ]);
  // [v1.10] Zonas de control (las ve quien está en el evento) y, para el personal de puerta, las últimas lecturas.
  const doorStaff = isManager || myRole === "security";
  const [zones, zoneReads] = await Promise.all([
    q<RougeState["event_zones"][number]>(sb.from("event_zones").select("*")).catch(() => []),
    eventId && doorStaff
      ? q<RougeState["zone_check_ins"][number]>(sb.from("zone_check_ins").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(200)).catch(() => [])
      : Promise.resolve([] as RougeState["zone_check_ins"]),
  ]);

  // Cara de cada contacto en el evento donde se conocieron (chats e inbox de eventos pasados): su fila pública de
  // asistente en esos eventos (persona_id). Solo contrapartes de mis conexiones y reuniones: acotado.
  const otherEventIds = [...new Set([...connections.map((c) => c.event_id), ...meetings.map((m) => m.event_id)].filter((id) => id !== eventId))];
  const counterpartIds = [...new Set([
    ...connections.map((c) => (c.sender_id === userId ? c.receiver_id : c.sender_id)),
    ...meetings.map((m) => (m.requester_id === userId ? m.invitee_id : m.requester_id)),
  ])];
  const pastAttendees = otherEventIds.length && counterpartIds.length
    ? (await Promise.all(chunk(counterpartIds, PROFILE_BATCH).map((part) =>
        q<RougeState["event_attendees"][number]>(sb.from("event_attendees").select(ATTENDEE_COLUMNS).in("event_id", otherEventIds).in("user_id", part)).catch(() => []),
      ))).flat()
    : [];

  // Lo privado de la asistencia: lo mío completo, el equipo lo suyo y, para el resto, solo las zonas EN COMÚN.
  const [myAttendances, staffAttendance, sharedZones] = await Promise.all([
    q<RougeState["event_attendees"][number]>(sb.rpc("my_attendances")).catch(() => []),
    eventId && isStaff && myRole !== "bartender" && myRole !== "waiter" && myRole !== "promoter"
      ? q<{ user_id: UUID; total_spent: number | string; joined_via: RougeState["event_attendees"][number]["joined_via"]; referred_by: UUID | null; checked_in_at: string | null }>(sb.rpc("event_attendance", { p_event: eventId })).catch(() => [])
      : Promise.resolve([]),
    eventId ? q<{ user_id: UUID; zones: string[] | null }>(sb.rpc("shared_zones", { p_event: eventId })).catch(() => []) : Promise.resolve([]),
  ]);
  const mineById = new Map(myAttendances.map((a) => [a.event_id, a]));
  const staffById = new Map(staffAttendance.map((a) => [a.user_id, a]));
  const zonesById = new Map(sharedZones.map((z) => [z.user_id, z.zones ?? []]));
  const allAttendees: RougeState["event_attendees"] = [...attendees, ...pastAttendees].map((a) => {
    if (a.user_id === userId) return { ...a, ...(mineById.get(a.event_id) ?? {}) };
    const st = a.event_id === eventId ? staffById.get(a.user_id) : undefined;
    return {
      ...a,
      total_spent: Number(st?.total_spent ?? 0),
      joined_via: st?.joined_via ?? "master_link",
      referred_by: st?.referred_by ?? null,
      checked_in_at: st?.checked_in_at ?? null,
      visited_sectors: a.event_id === eventId ? (zonesById.get(a.user_id) ?? []) : [],
    };
  });

  // Perfiles: el mío completo (my_profile) y el resto como tarjetas saneadas (profile_cards: edad y no fecha,
  // @usuario y fotos solo si esa persona se mostró con su Perfil principal en un evento de noche que compartimos).
  const ids = new Set<UUID>();
  allAttendees.forEach((a) => ids.add(a.user_id));
  connections.forEach((c) => (ids.add(c.sender_id), ids.add(c.receiver_id)));
  meetings.forEach((m) => (ids.add(m.requester_id), ids.add(m.invitee_id)));
  squadMembers.forEach((m) => ids.add(m.user_id));
  blocks.forEach((b) => b.blocked_user_id && ids.add(b.blocked_user_id));
  raffles.forEach((r) => r.winner_user_id && ids.add(r.winner_user_id));
  orders.forEach((o) => ids.add(o.user_id));
  expenses.forEach((e) => ids.add(e.paid_by));
  bans.forEach((b) => ids.add(b.user_id));
  teamRows.forEach((r) => ids.add(r.user_id));
  ids.delete(userId);
  // Por tandas: listas largas de ids en una sola llamada arman pedidos enormes (evento real = miles de asistentes).
  const cards = (await Promise.all(chunk([...ids], PROFILE_BATCH).map((part) => q<ProfileCard>(sb.rpc("profile_cards", { p_ids: part })).catch(() => [])))).flat();
  const profiles: Profile[] = [
    ...(me[0] ? [me[0]] : []),
    ...cards.map((c) => ({ ...c, username: c.username ?? "", birth_date: null, phone_normalized: null })),
  ];

  // Perfiles adicionales: los míos (tabla, RLS propia) + los de otros saneados por persona_cards().
  const personaIds = [...new Set(allAttendees.filter((a) => a.user_id !== userId).map((a) => a.persona_id).filter((x): x is UUID => !!x))];
  const [myPersonas, usedPersonas] = await Promise.all([
    q<ProfilePersona>(sb.from("profile_personas").select("*").eq("user_id", userId)).catch(() => []),
    personaIds.length
      ? Promise.all(chunk(personaIds, PROFILE_BATCH).map((part) => q<ProfilePersona>(sb.rpc("persona_cards", { p_ids: part })).catch(() => []))).then((r) => r.flat())
      : Promise.resolve([] as ProfilePersona[]),
  ]);
  const personas = [...new Map([...myPersonas, ...usedPersonas].map((p) => [p.id, p])).values()];

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
    profiles: profiles.map((p) => ({ ...p, phone_normalized: phones.get(p.id) ?? null, photos: p.photos ?? [], music_genres: p.music_genres ?? [] })),
    profile_personas: personas.map((p) => ({
      ...p,
      photos: p.photos ?? [],
      music_genres: p.music_genres ?? [],
      looking_for: p.looking_for ?? [],
      offering: p.offering ?? [],
      website_url: p.website_url ?? null,
      looking_for_note: p.looking_for_note ?? "",
      offering_note: p.offering_note ?? "",
      contact_email: p.contact_email ?? null,
      contact_phone: p.contact_phone ?? null,
      privacy_level: p.privacy_level ?? "strict",
    })),
    privacy_settings: privacy,
    venue_spots: spots.map((x) => ({ ...x, capacity: x.capacity ?? null, coord_x: x.coord_x ?? null, coord_y: x.coord_y ?? null })),
    meetings: meetings.map((m) => ({ ...m, pin_x: m.pin_x ?? null, pin_y: m.pin_y ?? null })),
    event_zones: zones.map((z) => ({ ...z, allowed_tiers: z.allowed_tiers ?? [] })),
    zone_check_ins: zoneReads,
    instagram_links: igRows.map((r) => ({ user_id: userId, username: r.username, account_type: r.account_type, connected_at: r.connected_at })),
    user_blocks: blocks,
    events: events.map((e) => ({ ...e, kind: e.kind ?? "nightlife", networking_checkin_only: e.networking_checkin_only ?? false, brand_id: e.brand_id ?? null, logo_url: e.logo_url ?? null, theme_primary: e.theme_primary ?? null, theme_accent: e.theme_accent ?? null, qr_secret: e.id === eventId ? eventSecret : null, features: e.features ?? null, lifecycle_status: e.lifecycle_status ?? "live" })),
    brands,
    brand_payment_accounts: payAccounts,
    event_staff: eventStaff,
    event_invite_codes: codes.map((c) => ({ ...c, checked_in_at: c.checked_in_at ?? null, tier: c.tier ?? null })),
    promoter_links: promoterLinks.map((l) => ({ ...l, commission_per_entry: Number(l.commission_per_entry) })),
    api_keys: apiKeys,
    event_bans: bans,
    event_attendees: allAttendees.map((a) => ({ ...a, persona_id: a.persona_id ?? null, total_spent: Number(a.total_spent), visited_sectors: a.visited_sectors ?? [], referred_by: a.referred_by ?? null, checked_in_at: a.checked_in_at ?? null, tier: a.tier ?? "attendee" })),
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
    staff_assignments: assignments,
    staff_invites: invites.map((i) => ({ ...i, token_hash: "" })),
    terminal_pins: terminalPins.map((p) => ({ ...p, pin_hash: null })),
    audit_log: audit,
    user_reports: reports,
    platform_admin_ids: platformAdmin ? [userId] : [],
    superadmin: platformAdmin
      ? await sb.rpc("superadmin_snapshot").then(
          (r) => {
            const d = r.data as NonNullable<RougeState["superadmin"]> | null;
            return d ? { events: d.events, staff: d.staff.map((x) => ({ ...x, platform: PLATFORM_ROLE[x.role], active_now: !x.revoked_at })) } : null;
          },
          () => null,
        )
      : null,
    ticket_lists: lists.map((l) => ({ ...l, late_price: Number(l.late_price) })),
    qr_secrets: qrSecrets,
    org_contacts: orgContacts.map((c) => ({ ...c, total_spent: Number(c.total_spent) })),
    campaigns,
    campaign_contacts: campaignContacts,
    organization_settings: orgSettings,
    vip_reservations: vipReservations.map((r) => ({ ...r, total_amount: Number(r.total_amount) })),
    event_curves_history: curves.map((c) => ({ ...c, points: c.points.map((p) => ({ m: Number(p.m), entries: Number(p.entries), sales: Number(p.sales) })) })),
  };
  return { state, isStaff };
}

/** Tablas publicadas en `supabase_realtime` (ver schema.sql) que disparan una re-sincronización. */
const REALTIME_TABLES = ["user_reports", "staff_assignments", "messages", "map_pins", "connections", "squad_members", "squads", "blast_deliveries", "user_perks_qrs", "bar_orders", "song_requests", "raffles", "event_attendees", "brands", "squad_expenses", "squad_settlements", "profile_personas", "meetings", "venue_spots", "event_zones", "zone_check_ins"];

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
