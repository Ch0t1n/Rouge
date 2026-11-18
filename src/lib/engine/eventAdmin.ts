/**
 * Gestión del evento por el organizador — reglas PURAS.
 *   - Menú de la Barra Express: alta, edición, precio, "Agotado" y baja.
 *   - Duplicar un evento para otra fecha (line-up, marca, menú y reglas de perks corridos).
 *   - Expulsar a un asistente (y opcionalmente bloquear que vuelva a entrar a ESE evento).
 *   - Eliminar un evento (solo quien lo creó y si no tiene cobros registrados).
 * Contraparte SQL: bar_menu_items (RLS de staff), remove_attendee, event_bans, events_delete + trigger.
 */
import type { BarMenuItem, EventBan, PerkRule, RougeEvent, RougeState, UUID } from "@/lib/types";
import { addMs, uid } from "@/lib/utils";
import { upsertEvent } from "./actions";
import { staffRoleOf } from "./roles";
import { BAR_MENU, CORPORATE_MENU } from "@/lib/mock/seed";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (now: number) => new Date(now).toISOString();

export const MENU_CATEGORIES: { id: BarMenuItem["category"]; label: string }[] = [
  { id: "trago", label: "Tragos" },
  { id: "cerveza", label: "Cervezas" },
  { id: "sin_alcohol", label: "Sin alcohol" },
  { id: "combo", label: "Combos" },
  { id: "botella", label: "Botellas VIP" },
];
export const MENU_NAME_MAX = 40;
export const MENU_PRICE_MAX = 10_000_000;

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "item";

// ── Menú ──────────────────────────────────────────────────────────────

export interface MenuItemInput {
  id?: string;
  name: string;
  category: BarMenuItem["category"];
  price: number;
  emoji?: string;
  is_available?: boolean;
}

/** Crea o edita un ítem del menú del evento activo. Espejo de la escritura en bar_menu_items (RLS de staff). */
export function upsertMenuItem(state: RougeState, input: MenuItemInput): R<BarMenuItem> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > MENU_NAME_MAX) return fail(`El nombre tiene que tener entre 2 y ${MENU_NAME_MAX} caracteres.`);
  if (!MENU_CATEGORIES.some((c) => c.id === input.category)) return fail("Elegí una categoría.");
  const price = Math.round(input.price * 100) / 100;
  if (!Number.isFinite(price) || price < 0 || price > MENU_PRICE_MAX) return fail("Ingresá un precio válido.");
  const emoji = (input.emoji ?? "").trim() || "🍸";
  if ([...emoji].length > 4) return fail("Usá un solo emoji.");
  const existing = input.id ? state.bar_menu.find((i) => i.id === input.id) : undefined;
  let id = existing?.id ?? slugify(name);
  if (!existing) {
    const base = id;
    for (let n = 2; state.bar_menu.some((i) => i.id === id); n++) id = `${base}-${n}`;
  }
  if (state.bar_menu.some((i) => i.id !== id && i.name.toLowerCase() === name.toLowerCase())) return fail("Ya hay un ítem con ese nombre.");
  const item: BarMenuItem = { id, name, category: input.category, price, emoji, is_available: input.is_available ?? existing?.is_available ?? true };
  return { ok: true, state: { ...state, bar_menu: existing ? state.bar_menu.map((i) => (i.id === id ? item : i)) : [...state.bar_menu, item] }, data: item };
}

/** Saca un ítem del menú (los pedidos viejos guardan su nombre y precio: no se pierden). */
export function deleteMenuItem(state: RougeState, itemId: string): R<undefined> {
  if (!state.bar_menu.some((i) => i.id === itemId)) return fail("Ese ítem no existe.");
  if (state.bar_menu.length <= 1) return fail("El menú necesita al menos un ítem.");
  return { ok: true, state: { ...state, bar_menu: state.bar_menu.filter((i) => i.id !== itemId) }, data: undefined };
}

/**
 * Modo Demo: `bar_menu` es siempre el menú del evento ACTIVO (igual que en Supabase, donde se carga el del activo).
 * Al cambiar de evento guarda el menú del anterior en `demo_menus` y trae el del nuevo (o el base de su vertical).
 * En Supabase (`bar_menu_event_id` sin definir) no hace nada.
 */
export function syncDemoMenu(state: RougeState): RougeState {
  const from = state.bar_menu_event_id;
  const to = state.active_event_id;
  if (from === undefined || !to || from === to) return state;
  const kind = state.events.find((e) => e.id === to)?.kind ?? "nightlife";
  const menus = { ...(state.demo_menus ?? {}), ...(from ? { [from]: state.bar_menu } : {}) };
  const next = menus[to] ?? (kind === "corporate" ? CORPORATE_MENU : BAR_MENU);
  delete menus[to];
  return { ...state, bar_menu: next, bar_menu_event_id: to, demo_menus: menus };
}

// ── Duplicar evento ───────────────────────────────────────────────────

/**
 * Nueva edición de un evento en otra fecha: mismos datos, marca, colores, plano y cupo; el line-up, el lobby y las
 * reglas de perks se corren la misma cantidad de tiempo. El link (slug) y el código maestro son nuevos.
 */
export function duplicateEvent(state: RougeState, eventId: UUID, newStartsAt: string, userId: UUID, now = Date.now()): R<{ event: RougeEvent; rules: PerkRule[] }> {
  const src = state.events.find((e) => e.id === eventId);
  if (!src) return fail("El evento no existe.");
  const start = +new Date(newStartsAt);
  if (Number.isNaN(start)) return fail("Elegí la fecha de la nueva edición.");
  if (start <= now) return fail("La nueva edición tiene que ser en el futuro.");
  const delta = start - +new Date(src.starts_at);
  const shift = (d: string) => addMs(d, delta);
  const date = new Date(start).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }).replace("/", "-");
  let slug = `${src.slug}-${date}`;
  for (let n = 2; state.events.some((e) => e.slug === slug); n++) slug = `${src.slug}-${date}-${n}`;
  const created = upsertEvent(
    { ...state, current_user_id: userId },
    {
      kind: src.kind,
      name: src.name,
      slug,
      description: src.description,
      venue_name: src.venue_name,
      venue_map_url: src.venue_map_url,
      venue_layout_json: src.venue_layout_json,
      lineup_json: src.lineup_json.map((sl) => ({ ...sl, id: uid(), starts_at: shift(sl.starts_at), ends_at: shift(sl.ends_at) })),
      cover_url: src.cover_url,
      starts_at: shift(src.starts_at),
      ends_at: shift(src.ends_at),
      lobby_opens_at: shift(src.lobby_opens_at),
      lobby_expires_at: shift(src.lobby_expires_at),
      max_capacity: src.max_capacity,
      // La marca solo sigue si es de quien crea la copia (misma regla que el trigger events_brand_owner).
      brand_id: state.brands.find((b) => b.id === src.brand_id)?.owner_id === userId ? src.brand_id : null,
      logo_url: src.logo_url,
      theme_primary: src.theme_primary,
      theme_accent: src.theme_accent,
    },
    now,
  );
  if (!created.ok) return created;
  const rules: PerkRule[] = state.perk_rules
    .filter((r) => r.event_id === eventId)
    .map((r) => ({ ...r, id: uid(), event_id: created.data.id, trigger: { ...r.trigger, before: r.trigger.before ? shift(r.trigger.before) : null }, created_at: iso(now) }));
  return { ok: true, state: { ...created.state, current_user_id: state.current_user_id, perk_rules: [...created.state.perk_rules, ...rules] }, data: { event: created.data, rules } };
}

// ── Asistentes ────────────────────────────────────────────────────────

export const isBanned = (s: RougeState, eventId: UUID, userId: UUID) => s.event_bans.some((b) => b.event_id === eventId && b.user_id === userId);

/**
 * Expulsa a alguien del evento: deja de estar en el lobby, en su Squad de esta noche y en el plano.
 * Con `ban`, no puede volver a entrar a ESTE evento (ni con otro código). Su perfil, matches y chats no se tocan.
 * Espejo de la RPC remove_attendee. No se puede expulsar al equipo del evento.
 */
export function removeAttendee(state: RougeState, eventId: UUID, userId: UUID, ban: boolean, actorId: UUID, reason: string | null = null, now = Date.now()): R<{ banned: boolean }> {
  if (!state.events.some((e) => e.id === eventId)) return fail("El evento no existe.");
  if (staffRoleOf(state, eventId, userId)) return fail("No podés expulsar a alguien del equipo: primero sacalo del equipo.");
  const attending = state.event_attendees.some((a) => a.event_id === eventId && a.user_id === userId);
  if (!attending && !ban) return fail("Esa persona no está en el evento.");
  const squadIds = new Set(state.squads.filter((q) => q.event_id === eventId).map((q) => q.id));
  const row: EventBan = { event_id: eventId, user_id: userId, banned_by: actorId, reason: reason?.trim() || null, created_at: iso(now) };
  return {
    ok: true,
    state: {
      ...state,
      event_attendees: state.event_attendees.filter((a) => !(a.event_id === eventId && a.user_id === userId)),
      squad_members: state.squad_members.filter((m) => !(m.user_id === userId && squadIds.has(m.squad_id))),
      map_pins: state.map_pins.filter((p) => !(p.event_id === eventId && p.user_id === userId)),
      event_bans: ban && !isBanned(state, eventId, userId) ? [...state.event_bans, row] : state.event_bans,
    },
    data: { banned: ban },
  };
}

/** Le vuelve a permitir la entrada a alguien que fue bloqueado. */
export function unbanAttendee(state: RougeState, eventId: UUID, userId: UUID): R<undefined> {
  if (!isBanned(state, eventId, userId)) return fail("Esa persona no está bloqueada.");
  return { ok: true, state: { ...state, event_bans: state.event_bans.filter((b) => !(b.event_id === eventId && b.user_id === userId)) }, data: undefined };
}

// ── Eliminar evento ───────────────────────────────────────────────────

/**
 * Elimina un evento creado por error o de prueba. Solo quien lo creó y solo si todavía no entró nadie (los matches y
 * chats de un evento real quedan para siempre) ni tiene cobros registrados. Espejo de events_delete + trigger.
 */
export function deleteEvent(state: RougeState, eventId: UUID, userId: UUID): R<undefined> {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return fail("El evento no existe.");
  if (ev.created_by !== userId) return fail("Solo quien creó el evento lo puede eliminar.");
  if (state.bar_orders.some((o) => o.event_id === eventId && o.payment_status === "paid")) return fail("Este evento tiene cobros registrados con Mercado Pago: no se puede eliminar.");
  if (state.event_attendees.some((a) => a.event_id === eventId)) return fail("Ya entró gente a este evento: no se puede eliminar (sus matches y chats se conservan). Podés cerrar el lobby desde el editor.");
  const squadIds = new Set(state.squads.filter((q) => q.event_id === eventId).map((q) => q.id));
  const events = state.events.filter((e) => e.id !== eventId);
  const by = <T extends { event_id: UUID }>(list: T[]) => list.filter((x) => x.event_id !== eventId);
  return {
    ok: true,
    state: {
      ...state,
      events,
      active_event_id: state.active_event_id === eventId ? (events[0]?.id ?? "") : state.active_event_id,
      event_staff: by(state.event_staff),
      event_invite_codes: by(state.event_invite_codes),
      event_attendees: by(state.event_attendees),
      event_bans: by(state.event_bans),
      connections: state.connections.filter((c) => c.event_id !== eventId),
      squads: by(state.squads),
      squad_members: state.squad_members.filter((m) => !squadIds.has(m.squad_id)),
      map_pins: by(state.map_pins),
      messages: state.messages.filter((m) => !(m.squad_id && squadIds.has(m.squad_id))),
      // [v1.11] Agenda del evento (en SQL: on delete cascade).
      event_sessions: by(state.event_sessions),
      session_enrollments: by(state.session_enrollments),
      session_questions: by(state.session_questions),
      session_polls: by(state.session_polls),
      event_blasts: by(state.event_blasts),
      user_perks_qrs: by(state.user_perks_qrs),
      perk_rules: by(state.perk_rules),
      raffles: by(state.raffles),
      song_requests: by(state.song_requests),
      bar_orders: by(state.bar_orders),
      squad_expenses: by(state.squad_expenses),
      squad_settlements: by(state.squad_settlements),
    },
    data: undefined,
  };
}
