/**
 * Consola global de ROUGE (/superadmin) — reglas PURAS. Solo administradores globales (`platform_admin_ids`).
 *
 *   1. Tablero global de eventos y boliches: estado en vivo, aforo (ingresados / vendidos), cobros en puerta, barra,
 *      staff activo y alertas (rescates, reportes abiertos).
 *   2. Control global de asistentes: búsqueda transversal con estado de puerta, visibilidad en el lobby, consumo y
 *      Squad; acciones (check-in manual, ocultar del lobby, expulsar, anular/reenviar su entrada).
 *   3. Matriz global de staff: todo el personal de cada organización, plataforma, ventana horaria y baja remota.
 * Contraparte SQL: superadmin_snapshot, superadmin_search y sa_* (todas exigen is_platform_admin()).
 */
import type { RougeState, UUID } from "@/lib/types";
import { doorCounts } from "./door";
import { appendAudit, openReports, staffMatrix, type StaffMatrixRow } from "./security";
import { isPlatformAdmin, staffRoleOf } from "./roles";
import { getProfile, lobbyPhase, squadOf } from "./selectors";
import { removeAttendee } from "./eventAdmin";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const NOT_ADMIN = "Solo administradores globales de ROUGE.";
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface GlobalEventRow {
  event_id: UUID;
  name: string;
  venue: string;
  organization: string;
  phase: ReturnType<typeof lobbyPhase>;
  inside: number;
  sold: number;
  capacity: number;
  door_revenue: number;
  bar_revenue: number;
  staff_active: number;
  rescue_alerts: number;
  open_reports: number;
}

export function globalEventBoard(s: RougeState, now = Date.now()): GlobalEventRow[] {
  return s.events
    .map((e) => {
      const codes = s.event_invite_codes.filter((c) => c.event_id === e.id && !c.revoked_at);
      const lists = new Map((s.ticket_lists ?? []).map((l) => [l.id, l]));
      const attendees = s.event_attendees.filter((a) => a.event_id === e.id);
      const staffIds = new Set([...s.event_staff.filter((r) => r.event_id === e.id).map((r) => r.user_id), ...(s.staff_assignments ?? []).map((a) => a.user_id)]);
      const squads = new Set(s.squads.filter((q) => q.event_id === e.id).map((q) => q.id));
      return {
        event_id: e.id,
        name: e.name,
        venue: e.venue_name,
        organization: getProfile(s, e.created_by)?.full_name ?? "—",
        phase: lobbyPhase(e, now),
        inside: doorCounts(s, e.id).inside,
        // Vendidos = entradas emitidas (ticketera o panel); si el evento no usa códigos, quienes entraron a la app.
        sold: Math.max(codes.length, attendees.length),
        capacity: e.max_capacity,
        door_revenue: codes.filter((c) => c.late_paid_at && c.list_id).reduce((a, c) => a + (lists.get(c.list_id!)?.late_price ?? 0), 0),
        bar_revenue: s.bar_orders.filter((o) => o.event_id === e.id && o.payment_status !== "awaiting_payment").reduce((a, o) => a + o.total_amount, 0),
        staff_active: [...staffIds].filter((u) => staffRoleOf(s, e.id, u, now)).length + (e.created_by ? 1 : 0),
        rescue_alerts: s.squad_members.filter((m) => squads.has(m.squad_id) && m.safety_status === "rescue_needed").length,
        open_reports: openReports(s, e.id).length,
      };
    })
    .sort((a, b) => Number(b.phase === "live") - Number(a.phase === "live") || b.inside - a.inside);
}

export interface GlobalAttendeeRow {
  user_id: UUID;
  full_name: string;
  username: string;
  event_id: UUID;
  event_name: string;
  checked_in_at: string | null;
  visible_in_lobby: boolean;
  bar_spent: number;
  squad: string | null;
  banned: boolean;
  code_id: UUID | null;
}

/** Búsqueda transversal (todos los eventos) por nombre, @usuario o código de entrada. */
export function globalAttendeeSearch(s: RougeState, q: string, limit = 30): GlobalAttendeeRow[] {
  const needle = fold(q.trim()).replace(/^@/, "");
  if (needle.length < 2) return [];
  const rows: GlobalAttendeeRow[] = [];
  for (const a of s.event_attendees) {
    const p = getProfile(s, a.user_id);
    const ev = s.events.find((e) => e.id === a.event_id);
    if (!p || !ev) continue;
    const code = s.event_invite_codes.find((c) => c.event_id === a.event_id && c.used_by_user_id === a.user_id);
    if (!fold(`${p.full_name} ${p.username} ${code?.code ?? ""}`).includes(needle)) continue;
    rows.push({
      user_id: p.id,
      full_name: p.full_name,
      username: p.username,
      event_id: ev.id,
      event_name: ev.name,
      checked_in_at: a.checked_in_at,
      visible_in_lobby: !a.ghost_mode && (!ev.require_checkin_for_lobby || !!a.checked_in_at),
      bar_spent: a.total_spent,
      squad: squadOf(s, ev.id, p.id)?.squad.name ?? null,
      banned: s.event_bans.some((b) => b.event_id === ev.id && b.user_id === p.id),
      code_id: code?.id ?? null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

export interface GlobalStaffRow extends StaffMatrixRow {
  organization_id: UUID;
  organization: string;
}

export function globalStaffMatrix(s: RougeState, now = Date.now()): GlobalStaffRow[] {
  const orgs = [...new Set(s.events.map((e) => e.created_by).filter((x): x is UUID => !!x))];
  return orgs.flatMap((org) => staffMatrix(s, org, now).map((r) => ({ ...r, organization_id: org, organization: getProfile(s, org)?.full_name ?? "—" })));
}

// ── Acciones (todas auditadas) ───────────────────────────────────────

const orgOf = (s: RougeState, eventId: UUID) => s.events.find((e) => e.id === eventId)?.created_by ?? null;

export function saCheckIn(s: RougeState, adminId: UUID, eventId: UUID, userId: UUID, now = Date.now()): R<undefined> {
  if (!isPlatformAdmin(s, adminId)) return fail(NOT_ADMIN);
  const a = s.event_attendees.find((x) => x.event_id === eventId && x.user_id === userId);
  if (!a) return fail("No está en ese evento.");
  if (a.checked_in_at) return fail("Ya había ingresado.");
  const iso = new Date(now).toISOString();
  const next = { ...s, event_attendees: s.event_attendees.map((x) => (x.id === a.id ? { ...x, checked_in_at: iso, checked_in_terminal: "ROUGE HQ" } : x)) };
  return { ok: true, state: appendAudit(next, { organization_id: orgOf(s, eventId), event_id: eventId, actor_id: adminId, action: "door.check_in", target: userId, details: { by: "superadmin" } }, now), data: undefined };
}

/** Ocultar del lobby (Modo Solo Amigos forzado): sigue en el evento, el plano y la barra. */
export function saHideFromLobby(s: RougeState, adminId: UUID, eventId: UUID, userId: UUID, now = Date.now()): R<undefined> {
  if (!isPlatformAdmin(s, adminId)) return fail(NOT_ADMIN);
  if (!s.event_attendees.some((x) => x.event_id === eventId && x.user_id === userId)) return fail("No está en ese evento.");
  const next = { ...s, event_attendees: s.event_attendees.map((x) => (x.event_id === eventId && x.user_id === userId ? { ...x, ghost_mode: true } : x)) };
  return { ok: true, state: appendAudit(next, { organization_id: orgOf(s, eventId), event_id: eventId, actor_id: adminId, action: "attendee.removed", target: userId, details: { hidden_from_lobby: true } }, now), data: undefined };
}

export function saRemoveAttendee(s: RougeState, adminId: UUID, eventId: UUID, userId: UUID, ban: boolean, now = Date.now()): R<{ banned: boolean }> {
  if (!isPlatformAdmin(s, adminId)) return fail(NOT_ADMIN);
  const r = removeAttendee(s, eventId, userId, ban, adminId, "ROUGE HQ", now);
  return r.ok ? { ok: true, state: appendAudit(r.state, { organization_id: orgOf(s, eventId), event_id: eventId, actor_id: adminId, action: "attendee.removed", target: userId, details: { ban } }, now), data: r.data } : r;
}

/** Anula la entrada (ej. reenvío por fraude): queda inválida en la puerta. */
export function saRevokeCode(s: RougeState, adminId: UUID, codeId: UUID, now = Date.now()): R<undefined> {
  if (!isPlatformAdmin(s, adminId)) return fail(NOT_ADMIN);
  const c = s.event_invite_codes.find((x) => x.id === codeId);
  if (!c) return fail("Esa entrada no existe.");
  if (c.revoked_at) return fail("Ya estaba anulada.");
  const next = { ...s, event_invite_codes: s.event_invite_codes.map((x) => (x.id === codeId ? { ...x, revoked_at: new Date(now).toISOString() } : x)) };
  return { ok: true, state: appendAudit(next, { organization_id: orgOf(s, c.event_id), event_id: c.event_id, actor_id: adminId, action: "code.revoked", target: c.code, details: { by: "superadmin" } }, now), data: undefined };
}

/** Baja remota de un integrante del staff de cualquier organización (kill switch global). */
export function saRevokeStaff(s: RougeState, adminId: UUID, orgId: UUID, userId: UUID, now = Date.now()): R<{ removed: number }> {
  if (!isPlatformAdmin(s, adminId)) return fail(NOT_ADMIN);
  const orgEvents = new Set(s.events.filter((e) => e.created_by === orgId).map((e) => e.id));
  const assignments = (s.staff_assignments ?? []).filter((a) => a.organization_id === orgId && a.user_id === userId && !a.revoked_at);
  const rows = s.event_staff.filter((r) => r.user_id === userId && orgEvents.has(r.event_id));
  if (!assignments.length && !rows.length) return fail("Esa persona no es staff de esa organización.");
  const iso = new Date(now).toISOString();
  const next: RougeState = {
    ...s,
    staff_assignments: (s.staff_assignments ?? []).map((a) => (assignments.includes(a) ? { ...a, revoked_at: iso } : a)),
    event_staff: s.event_staff.filter((r) => !rows.includes(r)),
    terminal_pins: (s.terminal_pins ?? []).filter((p) => !(p.organization_id === orgId && p.user_id === userId)),
  };
  return { ok: true, state: appendAudit(next, { organization_id: orgId, actor_id: adminId, action: "staff.revoked", target: userId, details: { by: "superadmin", removed: assignments.length + rows.length } }, now), data: { removed: assignments.length + rows.length } };
}
