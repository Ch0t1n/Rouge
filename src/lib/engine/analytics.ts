/**
 * Métricas B2B para el panel del organizador, CRM y Pantalla LED.
 */
import type { Gender, RougeState, UUID } from "@/lib/types";
import { ageFrom } from "@/lib/utils";
import { activePinOf, getEvent, getProfile, lineupNow, squadMembers, squadOf, topSongs } from "./selectors";

export type SmartTag = "top_spender" | "squad_leader" | "power_matcher";

export const SMART_TAG_META: Record<SmartTag, { label: string; emoji: string; color: "vip" | "squad" | "rouge" }> = {
  top_spender: { label: "Top Spender", emoji: "🏆", color: "vip" },
  squad_leader: { label: "Squad Leader", emoji: "👑", color: "squad" },
  power_matcher: { label: "Power Matcher", emoji: "🔥", color: "rouge" },
};

export const POWER_MATCHER_MIN = 3;
export const SQUAD_LEADER_MIN = 4;

export interface CrmRow {
  user_id: UUID;
  full_name: string;
  username: string;
  phone: string | null;
  age: number;
  gender: Gender;
  music_genres: string[];
  /** Perfil profesional (eventos corporativos: leads con empresa y cargo). */
  company: string | null;
  job_title: string | null;
  interests: string[];
  mood: string | null;
  squad_size: number;
  matches: number;
  total_spent: number;
  joined_at: string;
  tags: SmartTag[];
}

export function crmRows(s: RougeState, eventId: UUID): CrmRow[] {
  const attendees = s.event_attendees.filter((a) => a.event_id === eventId);
  const spends = attendees.map((a) => a.total_spent).filter((n) => n > 0).sort((a, b) => b - a);
  // Top 10% de gasto (mínimo 1 persona) con gasto > 0
  const topThreshold = spends.length ? spends[Math.max(0, Math.ceil(spends.length * 0.1) - 1)] : Infinity;

  return attendees
    .map((a): CrmRow | null => {
      const p = getProfile(s, a.user_id);
      if (!p) return null;
      const sq = squadOf(s, eventId, a.user_id);
      const size = sq ? squadMembers(s, sq.squad.id).length : 0;
      const matches = statsFor(s, eventId)?.matches_by_user[a.user_id] ??
        s.connections.filter((c) => c.event_id === eventId && c.status === "accepted" && (c.sender_id === a.user_id || c.receiver_id === a.user_id)).length;
      const brought = s.squad_members.filter((m) => m.invited_by === a.user_id && m.status === "joined").length;
      const tags: SmartTag[] = [];
      if (a.total_spent > 0 && a.total_spent >= topThreshold) tags.push("top_spender");
      if ((sq?.squad.created_by === a.user_id && size >= SQUAD_LEADER_MIN) || brought >= SQUAD_LEADER_MIN) tags.push("squad_leader");
      if (matches >= POWER_MATCHER_MIN) tags.push("power_matcher");
      return {
        user_id: a.user_id,
        full_name: p.full_name,
        username: p.username,
        phone: p.phone_normalized,
        age: ageFrom(p.birth_date),
        gender: p.gender,
        music_genres: p.music_genres,
        company: p.company,
        job_title: p.job_title,
        interests: p.interests,
        mood: a.mood_tag,
        squad_size: size,
        matches,
        total_spent: a.total_spent,
        joined_at: a.joined_at,
        tags,
      } satisfies CrmRow;
    })
    .filter((r): r is CrmRow => !!r)
    .sort((a, b) => b.total_spent - a.total_spent);
}

/** En Supabase el staff no ve las conexiones (privadas): usa los conteos del servidor. */
const statsFor = (s: RougeState, eventId: UUID) => (s.admin_stats?.event_id === eventId ? s.admin_stats : null);

export function eventMetrics(s: RougeState, eventId: UUID, now = Date.now()) {
  const attendees = s.event_attendees.filter((a) => a.event_id === eventId);
  const conns = s.connections.filter((c) => c.event_id === eventId);
  const squads = s.squads.filter((sq) => sq.event_id === eventId);
  const sizes = squads.map((sq) => ({ squad: sq, size: squadMembers(s, sq.id).length }));
  // Los pedidos que esperan el pago de Mercado Pago todavía no son ventas.
  const orders = s.bar_orders.filter((o) => o.event_id === eventId && o.payment_status !== "awaiting_payment");
  const female = attendees.filter((a) => getProfile(s, a.user_id)?.gender === "female").length;
  const biggest = sizes.sort((a, b) => b.size - a.size)[0];

  return {
    attendees: attendees.length,
    femaleShare: attendees.length ? female / attendees.length : 0,
    ghostMode: attendees.filter((a) => a.ghost_mode).length,
    matches: statsFor(s, eventId)?.matches ?? conns.filter((c) => c.status === "accepted").length,
    pendingConnections: statsFor(s, eventId)?.pending_connections ?? conns.filter((c) => c.status === "pending").length,
    icebreakersSent: statsFor(s, eventId)?.icebreakers_sent ?? conns.filter((c) => c.type === "icebreaker").length,
    squads: squads.length,
    usersInSquads: attendees.filter((a) => squadOf(s, eventId, a.user_id)).length,
    biggestSquad: biggest ? { name: biggest.squad.name, size: biggest.size } : null,
    activePins: attendees.filter((a) => activePinOf(s, eventId, a.user_id, now)).length,
    rescueAlerts: s.squad_members.filter((m) => m.safety_status === "rescue_needed" && squads.some((sq) => sq.id === m.squad_id)).length,
    barRevenue: orders.reduce((acc, o) => acc + o.total_amount, 0),
    openOrders: orders.filter((o) => o.status !== "completed").length,
    perksIssued: s.user_perks_qrs.filter((p) => p.event_id === eventId).length,
    perksRedeemed: s.user_perks_qrs.filter((p) => p.event_id === eventId && p.status === "redeemed").length,
    topSongs: topSongs(s, eventId, 5),
  };
}

/** Datos para la Pantalla Gigante LED (`/admin/live-wall`). */
export function liveWallData(s: RougeState, eventId: UUID, now = Date.now()) {
  const event = getEvent(s, eventId)!;
  const m = eventMetrics(s, eventId, now);
  const lastHour = statsFor(s, eventId)?.matches_last_hour ?? s.connections.filter((c) => c.event_id === eventId && c.status === "accepted" && c.responded_at && now - +new Date(c.responded_at) < 3_600_000).length;
  const flash = s.event_blasts
    .filter((b) => b.event_id === eventId && b.is_flash_promo && b.expires_at && +new Date(b.expires_at) > now)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
  const lastRaffle = s.raffles
    .filter((r) => r.event_id === eventId && r.winner_user_id && r.drawn_at)
    .sort((a, b) => +new Date(b.drawn_at!) - +new Date(a.drawn_at!))[0];
  return {
    event,
    metrics: m,
    matchesLastHour: lastHour,
    lineup: lineupNow(event, now),
    flash,
    lastRaffle: lastRaffle ? { raffle: lastRaffle, winner: getProfile(s, lastRaffle.winner_user_id) } : null,
  };
}
