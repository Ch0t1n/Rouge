/**
 * RRPP (promotores) — reglas PURAS.
 *
 * Cada RRPP del equipo tiene UN link propio por evento (`/join/<código>`, con QR). Quien entra por ese link queda
 * atribuido a ese RRPP (primer contacto: si ya estaba en el evento, no cambia). El RRPP ve SOLO sus números (ingresos,
 * ingresos confirmados en puerta y lo que se le debe); nunca nombres, teléfonos ni consumos de las personas.
 * Dueño/a y producción ven a todos, fijan la comisión por ingreso y liquidan.
 * Contraparte SQL: promoter_links, ensure_promoter_link, set_promoter_commission, promoter_stats, join_event (p_code RP…).
 */
import type { PromoterLink, RougeState, UUID } from "@/lib/types";
import { shortCode, uid } from "@/lib/utils";
import { can, staffRoleOf } from "./roles";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const PROMOTER_CODE_PREFIX = "RP";
export const MAX_COMMISSION = 1_000_000;

export const promoterLinkOf = (s: RougeState, eventId: UUID, userId: UUID) => s.promoter_links.find((l) => l.event_id === eventId && l.user_id === userId);

/**
 * Crea (o devuelve) el link de un RRPP. Lo puede pedir el propio RRPP o dueño/a/producción para cualquier RRPP del
 * equipo. El código lo genera el servidor (en Supabase el comando no es optimista).
 */
export function ensurePromoterLink(state: RougeState, eventId: UUID, promoterId: UUID, actorId: UUID, now = Date.now()): R<PromoterLink> {
  if (staffRoleOf(state, eventId, promoterId) !== "promoter") return fail("Esa persona no es RRPP de este evento: sumala al equipo con el rol RRPP.");
  if (actorId !== promoterId && !can(state, eventId, actorId, "admin.events")) return fail("Tu rol no tiene permiso para esto.");
  const existing = promoterLinkOf(state, eventId, promoterId);
  if (existing) return { ok: true, state, data: existing };
  const taken = new Set(state.promoter_links.map((l) => l.code));
  let code = `${PROMOTER_CODE_PREFIX}${shortCode(6)}`;
  while (taken.has(code)) code = `${PROMOTER_CODE_PREFIX}${shortCode(6)}`;
  const link: PromoterLink = { id: uid(), event_id: eventId, user_id: promoterId, code, commission_per_entry: 0, created_at: new Date(now).toISOString() };
  return { ok: true, state: { ...state, promoter_links: [...state.promoter_links, link] }, data: link };
}

/** Comisión por ingreso de un RRPP (solo dueño/a o producción). */
export function setPromoterCommission(state: RougeState, linkId: UUID, amount: number, actorId: UUID): R<PromoterLink> {
  const link = state.promoter_links.find((l) => l.id === linkId);
  if (!link) return fail("Ese link no existe.");
  if (!can(state, link.event_id, actorId, "admin.events")) return fail("Tu rol no tiene permiso para esto.");
  const value = Math.round(amount * 100) / 100;
  if (!Number.isFinite(value) || value < 0 || value > MAX_COMMISSION) return fail("Ingresá un monto válido.");
  const next = { ...link, commission_per_entry: value };
  return { ok: true, state: { ...state, promoter_links: state.promoter_links.map((l) => (l.id === linkId ? next : l)) }, data: next };
}

export interface PromoterStats {
  user_id: UUID;
  link: PromoterLink | null;
  /** Personas que entraron a la app por su link. */
  entries: number;
  /** De esas, cuántas se escanearon en la puerta. */
  checked_in: number;
  /** Ingresos que cuentan para la comisión: los confirmados en puerta si el evento usa el escáner; si no, los de la app. */
  billable: number;
  to_pay: number;
}

/**
 * Números por RRPP. Si el evento escanea en la puerta, se liquida por ingreso confirmado (no por registrarse en la app).
 * `viewerId` RRPP → solo su fila; dueño/a/producción → todos. Espejo de la RPC promoter_stats.
 */
export function promoterStats(state: RougeState, eventId: UUID, viewerId: UUID): PromoterStats[] {
  // Supabase: el servidor calcula los números (el RRPP no puede leer a los asistentes).
  if (state.promoter_stats) {
    return state.promoter_stats.map((r) => ({ user_id: r.user_id, link: promoterLinkOf(state, eventId, r.user_id) ?? null, entries: r.entries, checked_in: r.checked_in, billable: r.billable, to_pay: r.to_pay }));
  }
  const manager = can(state, eventId, viewerId, "admin.events");
  const promoters = state.event_staff.filter((r) => r.event_id === eventId && r.role === "promoter" && (manager || r.user_id === viewerId)).map((r) => r.user_id);
  const attendees = state.event_attendees.filter((a) => a.event_id === eventId);
  const usesDoor = attendees.some((a) => a.checked_in_at) || state.event_invite_codes.some((c) => c.event_id === eventId && c.checked_in_at);
  return promoters
    .map((uidP) => {
      const mine = attendees.filter((a) => a.referred_by === uidP);
      const link = promoterLinkOf(state, eventId, uidP) ?? null;
      const checked = mine.filter((a) => a.checked_in_at).length;
      const billable = usesDoor ? checked : mine.length;
      return { user_id: uidP, link, entries: mine.length, checked_in: checked, billable, to_pay: Math.round(billable * (link?.commission_per_entry ?? 0) * 100) / 100 };
    })
    .sort((a, b) => b.entries - a.entries);
}
