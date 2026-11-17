/**
 * RRPP (promotores) — reglas PURAS.
 *
 * Cada RRPP del equipo tiene UN link propio por evento (`/join/<código>`, con QR). Quien entra por ese link queda
 * atribuido a ese RRPP (primer contacto: si ya estaba en el evento, no cambia). El RRPP ve SOLO sus números (ingresos,
 * ingresos confirmados en puerta y lo que se le debe); nunca nombres, teléfonos ni consumos de las personas.
 * Dueño/a y producción ven a todos, fijan la comisión por ingreso y liquidan.
 * Contraparte SQL: promoter_links, ensure_promoter_link, set_promoter_commission, promoter_stats, join_event (p_code RP…).
 */
import type { CommissionTier, PromoterLink, RougeState, UUID } from "@/lib/types";
import { shortCode, uid } from "@/lib/utils";
import { can, staffRoleOf } from "./roles";
import { FEATURE_DISABLED, featureOn } from "./features";

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
  if (!featureOn(state, eventId, "enableRrpp")) return fail(FEATURE_DISABLED);
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

// ── Liquidación escalonada (v1.7) ────────────────────────────────────

export const MAX_TIERS = 6;

/** Esquema por defecto sugerido: 1–30 al 15 %, desde la 31 al 20 %. */
export const DEFAULT_TIERS: CommissionTier[] = [
  { from: 1, percent: 15 },
  { from: 31, percent: 20 },
];

export function checkTiers(tiers: CommissionTier[]): string | null {
  if (tiers.length > MAX_TIERS) return `Máximo ${MAX_TIERS} tramos.`;
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  if (sorted.length && sorted[0].from !== 1) return "El primer tramo tiene que empezar en la entrada 1.";
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (!Number.isInteger(t.from) || t.from < 1) return "Cada tramo empieza en una entrada (1, 31, 61…).";
    if (!Number.isFinite(t.percent) || t.percent < 0 || t.percent > 100) return "El porcentaje va de 0 a 100.";
    if (i && t.from === sorted[i - 1].from) return "Dos tramos no pueden empezar en la misma entrada.";
  }
  return null;
}

export interface PromoterSettlement {
  /** Ingresos liquidables (en puerta si se escanea; si no, en la app). */
  billable: number;
  fixed: number;
  /** Detalle por tramo: cuántas entradas cayeron en cada uno y cuánto suman. */
  tiers: { from: number; to: number | null; percent: number; entries: number; amount: number }[];
  tickets: number;
  bar_spend: number;
  bar: number;
  total: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Liquidación de un RRPP: fijo por ingreso + tramos MARGINALES sobre el precio de la entrada (las primeras 30 al 15 %,
 * de la 31 en adelante al 20 %) + % sobre el consumo en barra de quienes entraron por su link.
 */
export function settlePromoter(link: Pick<PromoterLink, "commission_per_entry" | "ticket_price" | "commission_tiers" | "bar_commission_percent"> | null, billable: number, barSpend: number): PromoterSettlement {
  const price = link?.ticket_price ?? 0;
  const tiers = [...(link?.commission_tiers ?? [])].sort((a, b) => a.from - b.from);
  const rows = tiers.map((t, i) => {
    const to = tiers[i + 1] ? tiers[i + 1].from - 1 : null;
    const entries = Math.max(0, Math.min(billable, to ?? billable) - t.from + 1);
    return { from: t.from, to, percent: t.percent, entries, amount: money((entries * price * t.percent) / 100) };
  });
  const fixed = money(billable * (link?.commission_per_entry ?? 0));
  const tickets = money(rows.reduce((a, r) => a + r.amount, 0));
  const bar = money((barSpend * (link?.bar_commission_percent ?? 0)) / 100);
  return { billable, fixed, tiers: rows, tickets, bar_spend: barSpend, bar, total: money(fixed + tickets + bar) };
}

/** Consumo en barra de las personas que entraron por el link de un RRPP (demo; en Supabase lo da promoter_stats). */
export function promoterBarSpend(state: RougeState, eventId: UUID, promoterId: UUID): number {
  const fromServer = state.promoter_stats?.find((r) => r.user_id === promoterId)?.bar_spend;
  if (fromServer != null) return Number(fromServer);
  return state.event_attendees.filter((a) => a.event_id === eventId && a.referred_by === promoterId).reduce((a, x) => a + x.total_spent, 0);
}

export interface PromoterSchemeInput {
  ticket_price: number;
  tiers: CommissionTier[];
  bar_percent: number;
}

/** Dueño/a o producción configuran el esquema escalonado de un RRPP. */
export function setPromoterScheme(state: RougeState, linkId: UUID, input: PromoterSchemeInput, actorId: UUID): R<PromoterLink> {
  const link = state.promoter_links.find((l) => l.id === linkId);
  if (!link) return fail("Ese link no existe.");
  if (!can(state, link.event_id, actorId, "admin.events")) return fail("Tu rol no tiene permiso para esto.");
  if (!Number.isFinite(input.ticket_price) || input.ticket_price < 0 || input.ticket_price > MAX_COMMISSION) return fail("Ingresá un precio de entrada válido.");
  if (!Number.isFinite(input.bar_percent) || input.bar_percent < 0 || input.bar_percent > 100) return fail("El % de barra va de 0 a 100.");
  const err = checkTiers(input.tiers);
  if (err) return fail(err);
  const next: PromoterLink = { ...link, ticket_price: money(input.ticket_price), commission_tiers: [...input.tiers].sort((a, b) => a.from - b.from), bar_commission_percent: money(input.bar_percent) };
  return { ok: true, state: { ...state, promoter_links: state.promoter_links.map((l) => (l.id === linkId ? next : l)) }, data: next };
}
