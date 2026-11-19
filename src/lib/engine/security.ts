/**
 * Seguridad operativa — reglas PURAS (mismo contrato que el resto del motor).
 *
 *   - Staff por organización: invitaciones de 1 uso (link/QR, caducan en 2 h), alcance (todos los eventos de la
 *     organización o eventos puntuales) y ventana horaria automática para Puerta y Barra.
 *   - Kill switch: baja inmediata de un integrante del staff en toda la organización.
 *   - Modo Kiosco: PIN personal (4–6 dígitos) por integrante para operar una terminal fija y auditar quién hizo qué.
 *   - Auditoría inmutable (append-only).
 *   - Reportes de usuarios (alerta en vivo al panel de seguridad) y borrado real de la cuenta.
 *
 * Contraparte SQL (schema.sql): staff_invites, staff_assignments, terminal_pins, kiosk_attempts, audit_log
 * (sin UPDATE/DELETE), user_reports; RPCs create_staff_invite, accept_staff_invite, revoke_staff_invite,
 * revoke_staff_access, set_terminal_pin, kiosk_unlock, report_user, review_report, delete_my_account; y
 * has_staff_role() considera las asignaciones con su ventana horaria.
 */
import type { AuditAction, AuditEntry, ReportReason, RougeState, StaffAssignment, StaffInvite, StaffRole, StaffScope, UserReport, UUID } from "@/lib/types";
import { sha256Hex, safeEqual } from "@/lib/crypto/sha256";
import { uid } from "@/lib/utils";
import { assignmentCovers, organizationOf, PLATFORM_ROLE, staffRoleOf, withinAccessWindow, type PlatformStaffRole } from "./roles";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (now: number) => new Date(now).toISOString();

export const STAFF_INVITE_TTL_MS = 2 * 3_600_000;
export const INVITABLE_ROLES: Exclude<StaffRole, "owner">[] = ["manager", "security", "bartender", "waiter", "promoter"];
/** Roles operativos: la ventana horaria automática viene activada por defecto. */
export const WINDOWED_ROLES: StaffRole[] = ["security", "bartender", "waiter"];

export const KIOSK_MAX_FAILS = 5;
export const KIOSK_LOCK_MS = 5 * 60_000;
/** Inactividad tras la que la terminal vuelve a pedir PIN. */
export const KIOSK_IDLE_MS = 90_000;

// ── Auditoría ────────────────────────────────────────────────────────

export function appendAudit(s: RougeState, e: { organization_id: UUID | null; event_id?: UUID | null; actor_id: UUID | null; operator_id?: UUID | null; action: AuditAction; target?: string | null; details?: AuditEntry["details"] }, now = Date.now()): RougeState {
  const entry: AuditEntry = { id: uid(), organization_id: e.organization_id, event_id: e.event_id ?? null, actor_id: e.actor_id, operator_id: e.operator_id ?? null, action: e.action, target: e.target ?? null, details: e.details ?? {}, created_at: iso(now) };
  return { ...s, audit_log: [...(s.audit_log ?? []), entry] };
}

/** Auditoría visible para un organizador (más reciente primero). */
export const auditFor = (s: RougeState, orgId: UUID) => (s.audit_log ?? []).filter((a) => a.organization_id === orgId).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

// ── Invitaciones de staff ────────────────────────────────────────────

/** Hash del token de invitación (el token solo existe en el link; se guarda su SHA-256). */
export const inviteTokenHash = (token: string) => sha256Hex(`rouge-staff-invite:${token}`);
export const staffInviteLink = (token: string) => `/equipo/${token}`;

export interface StaffInviteInput {
  role: Exclude<StaffRole, "owner">;
  scope: StaffScope;
  eventIds?: UUID[];
  accessWindow?: boolean;
}

/** Eventos de la organización (los que creó el dueño/a). */
export const organizationEvents = (s: RougeState, orgId: UUID) => s.events.filter((e) => e.created_by === orgId);

/**
 * El dueño/a crea una invitación de 1 uso atada a SU organización. `token`: aleatorio (cliente en demo; en
 * Supabase lo genera el servidor y el cliente nunca elige el token).
 */
export function createStaffInvite(s: RougeState, ownerId: UUID, input: StaffInviteInput, token: string, now = Date.now()): R<{ invite: StaffInvite; token: string }> {
  if (!ownerId) return fail("Iniciá sesión.");
  if (!INVITABLE_ROLES.includes(input.role)) return fail("Elegí un rol válido.");
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return fail("Token de invitación inválido.");
  const mine = new Set(organizationEvents(s, ownerId).map((e) => e.id));
  if (!mine.size) return fail("Primero creá un evento: el staff se suma a los eventos de tu organización.");
  const eventIds = input.scope === "specific_events" ? [...new Set(input.eventIds ?? [])] : [];
  if (input.scope === "specific_events" && !eventIds.length) return fail("Elegí al menos un evento.");
  if (eventIds.some((id) => !mine.has(id))) return fail("Solo podés invitar a eventos de tu organización.");
  const invite: StaffInvite = {
    id: uid(),
    organization_id: ownerId,
    role: input.role,
    scope: input.scope,
    event_ids: eventIds,
    access_window: input.accessWindow ?? WINDOWED_ROLES.includes(input.role),
    token_hash: inviteTokenHash(token),
    expires_at: iso(now + STAFF_INVITE_TTL_MS),
    used_at: null,
    used_by: null,
    revoked_at: null,
    created_by: ownerId,
    created_at: iso(now),
  };
  const st = appendAudit({ ...s, staff_invites: [...(s.staff_invites ?? []), invite] }, { organization_id: ownerId, actor_id: ownerId, action: "staff.invited", target: invite.id, details: { role: invite.role, scope: invite.scope, events: eventIds.length } }, now);
  return { ok: true, state: st, data: { invite, token } };
}

export type InviteStatus = "valid" | "expired" | "used" | "revoked" | "missing";

export function inviteStatus(inv: StaffInvite | undefined, now = Date.now()): InviteStatus {
  if (!inv) return "missing";
  if (inv.revoked_at) return "revoked";
  if (inv.used_at) return "used";
  if (+new Date(inv.expires_at) <= now) return "expired";
  return "valid";
}

export const findInvite = (s: RougeState, token: string) => {
  const h = inviteTokenHash(token);
  return (s.staff_invites ?? []).find((i) => safeEqual(i.token_hash, h));
};

const INVITE_ERRORS: Record<Exclude<InviteStatus, "valid">, string> = {
  missing: "Esta invitación no existe.",
  expired: "Esta invitación venció (duran 2 horas). Pedile al dueño/a una nueva.",
  used: "Esta invitación ya se usó. Cada link sirve una sola vez.",
  revoked: "Esta invitación fue anulada.",
};
export const inviteError = (st: Exclude<InviteStatus, "valid">) => INVITE_ERRORS[st];

/** Quien abre el link acepta: queda como staff de la organización con el rol, alcance y ventana elegidos. */
export function acceptStaffInvite(s: RougeState, userId: UUID, token: string, now = Date.now()): R<StaffAssignment> {
  if (!s.profiles.some((p) => p.id === userId)) return fail("Completá tu perfil antes de sumarte al equipo.");
  const inv = findInvite(s, token);
  const st = inviteStatus(inv, now);
  if (st !== "valid") return fail(inviteError(st));
  if (inv!.organization_id === userId) return fail("Sos el dueño/a de esta organización.");
  const assignment: StaffAssignment = {
    id: uid(),
    organization_id: inv!.organization_id,
    user_id: userId,
    role: inv!.role,
    scope: inv!.scope,
    event_ids: inv!.event_ids,
    access_window: inv!.access_window,
    revoked_at: null,
    created_by: inv!.created_by,
    created_at: iso(now),
  };
  // Una sola asignación activa por persona y organización: la nueva reemplaza a la anterior.
  const prev = (s.staff_assignments ?? []).map((a) => (a.organization_id === assignment.organization_id && a.user_id === userId && !a.revoked_at ? { ...a, revoked_at: iso(now) } : a));
  const next: RougeState = {
    ...s,
    staff_invites: (s.staff_invites ?? []).map((i) => (i.id === inv!.id ? { ...i, used_at: iso(now), used_by: userId } : i)),
    staff_assignments: [...prev, assignment],
  };
  return { ok: true, state: appendAudit(next, { organization_id: assignment.organization_id, actor_id: userId, action: "staff.joined", target: userId, details: { role: assignment.role, scope: assignment.scope } }, now), data: assignment };
}

export function revokeStaffInvite(s: RougeState, ownerId: UUID, inviteId: UUID, now = Date.now()): R<undefined> {
  const inv = (s.staff_invites ?? []).find((i) => i.id === inviteId);
  if (!inv || inv.organization_id !== ownerId) return fail("Esa invitación no es de tu organización.");
  if (inv.used_at || inv.revoked_at) return fail("Esa invitación ya no está activa.");
  return { ok: true, state: { ...s, staff_invites: (s.staff_invites ?? []).map((i) => (i.id === inviteId ? { ...i, revoked_at: iso(now) } : i)) }, data: undefined };
}

// ── Kill switch ──────────────────────────────────────────────────────

/**
 * Baja inmediata de un integrante del staff en TODA la organización: revoca sus asignaciones y lo saca del equipo
 * de cada evento de la organización. No se puede dar de baja al dueño/a. En Supabase, has_staff_role deja de
 * reconocerlo en el acto (todas las RPCs de staff fallan) aunque su sesión siga abierta.
 */
export function revokeStaffAccess(s: RougeState, ownerId: UUID, userId: UUID, now = Date.now()): R<{ removed: number }> {
  if (userId === ownerId) return fail("No podés darte de baja a vos mismo/a.");
  const orgEvents = new Set(organizationEvents(s, ownerId).map((e) => e.id));
  const activeAssignments = (s.staff_assignments ?? []).filter((a) => a.organization_id === ownerId && a.user_id === userId && !a.revoked_at);
  const staffRows = s.event_staff.filter((r) => r.user_id === userId && orgEvents.has(r.event_id));
  const removed = activeAssignments.length + staffRows.length;
  if (!removed) return fail("Esa persona no es parte de tu staff.");
  const next: RougeState = {
    ...s,
    staff_assignments: (s.staff_assignments ?? []).map((a) => (activeAssignments.includes(a) ? { ...a, revoked_at: iso(now) } : a)),
    event_staff: s.event_staff.filter((r) => !staffRows.includes(r)),
    terminal_pins: (s.terminal_pins ?? []).filter((p) => !(p.organization_id === ownerId && p.user_id === userId)),
  };
  return { ok: true, state: appendAudit(next, { organization_id: ownerId, actor_id: ownerId, action: "staff.revoked", target: userId, details: { removed } }, now), data: { removed } };
}

/** Matriz del staff de una organización: altas directas por evento y asignaciones (con estado de la ventana). */
export interface StaffMatrixRow {
  user_id: UUID;
  role: StaffRole;
  platform: PlatformStaffRole;
  source: "assignment" | "event";
  scope: StaffScope;
  event_ids: UUID[];
  access_window: boolean;
  active_now: boolean;
  revoked_at: string | null;
  has_pin: boolean;
}

export function staffMatrix(s: RougeState, orgId: UUID, now = Date.now()): StaffMatrixRow[] {
  const events = organizationEvents(s, orgId);
  const pin = (u: UUID) => (s.terminal_pins ?? []).some((p) => p.organization_id === orgId && p.user_id === u);
  const rows: StaffMatrixRow[] = [];
  for (const a of s.staff_assignments ?? []) {
    if (a.organization_id !== orgId) continue;
    const covered = events.filter((e) => assignmentCovers(a, e));
    rows.push({
      user_id: a.user_id,
      role: a.role,
      platform: PLATFORM_ROLE[a.role],
      source: "assignment",
      scope: a.scope,
      event_ids: a.scope === "all_org_events" ? events.map((e) => e.id) : a.event_ids,
      access_window: a.access_window,
      active_now: !a.revoked_at && covered.some((e) => !a.access_window || withinAccessWindow(e, now)),
      revoked_at: a.revoked_at,
      has_pin: pin(a.user_id),
    });
  }
  const byUser = new Map<UUID, StaffMatrixRow>();
  for (const r of s.event_staff) {
    const ev = events.find((e) => e.id === r.event_id);
    if (!ev || r.user_id === orgId) continue;
    const cur = byUser.get(r.user_id);
    if (cur) cur.event_ids.push(r.event_id);
    else byUser.set(r.user_id, { user_id: r.user_id, role: r.role, platform: PLATFORM_ROLE[r.role], source: "event", scope: "specific_events", event_ids: [r.event_id], access_window: false, active_now: true, revoked_at: null, has_pin: pin(r.user_id) });
  }
  return [...rows, ...byUser.values()];
}

// ── Modo Kiosco ─────────────────────────────────────────────────────

export const PIN_RE = /^\d{4,6}$/;
export const pinHash = (orgId: UUID, userId: UUID, pin: string) => sha256Hex(`rouge-kiosk:${orgId}:${userId}:${pin}`);

/** PINs triviales que se rechazan (todos iguales o consecutivos). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const asc = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const desc = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  return asc || desc;
}

/** Cada integrante define su PIN de terminal para una organización donde es staff. */
export function setTerminalPin(s: RougeState, userId: UUID, orgId: UUID, pin: string, now = Date.now()): R<undefined> {
  if (!PIN_RE.test(pin)) return fail("El PIN tiene que tener de 4 a 6 números.");
  if (isWeakPin(pin)) return fail("Elegí un PIN menos obvio (nada de 1234 ni 0000).");
  const member = orgId === userId || (s.staff_assignments ?? []).some((a) => a.organization_id === orgId && a.user_id === userId && !a.revoked_at) || s.event_staff.some((r) => r.user_id === userId && organizationOf(s, r.event_id) === orgId);
  if (!member) return fail("No sos parte del staff de esta organización.");
  const row = { organization_id: orgId, user_id: userId, pin_hash: pinHash(orgId, userId, pin), updated_at: iso(now) };
  const next = { ...s, terminal_pins: [...(s.terminal_pins ?? []).filter((p) => !(p.organization_id === orgId && p.user_id === userId)), row] };
  return { ok: true, state: appendAudit(next, { organization_id: orgId, actor_id: userId, action: "staff.pin_set", target: userId }, now), data: undefined };
}

/** Intentos fallidos recientes de una terminal (cuenta del dispositivo) en el evento. */
export function kioskLockedUntil(s: RougeState, eventId: UUID, deviceUserId: UUID, now = Date.now()): number | null {
  const fails = (s.audit_log ?? []).filter((a) => a.action === "kiosk.failed" && a.event_id === eventId && a.actor_id === deviceUserId && +new Date(a.created_at) > now - KIOSK_LOCK_MS);
  if (fails.length < KIOSK_MAX_FAILS) return null;
  return +new Date(fails[fails.length - KIOSK_MAX_FAILS].created_at) + KIOSK_LOCK_MS;
}

/**
 * Desbloquea la terminal con el PIN de un integrante: devuelve quién opera. Solo staff con rol ACTIVO ahora en ese
 * evento (ventana horaria incluida). 5 errores seguidos bloquean la terminal 5 minutos.
 */
export function kioskUnlock(s: RougeState, eventId: UUID, deviceUserId: UUID, pin: string, now = Date.now()): R<{ operatorId: UUID; role: StaffRole }> {
  const orgId = organizationOf(s, eventId);
  if (!orgId) return fail("El evento no existe.");
  const deviceRole = staffRoleOf(s, eventId, deviceUserId, now);
  if (deviceRole !== "owner" && deviceRole !== "manager") return fail("La terminal tiene que estar abierta con la cuenta del dueño/a o de producción.");
  const locked = kioskLockedUntil(s, eventId, deviceUserId, now);
  if (locked) return fail(`Terminal bloqueada por intentos fallidos. Probá en ${Math.ceil((locked - now) / 60_000)} min.`);
  if (!PIN_RE.test(pin)) return fail("PIN incorrecto.");
  const match = (s.terminal_pins ?? []).find((p) => p.organization_id === orgId && p.pin_hash && safeEqual(p.pin_hash, pinHash(orgId, p.user_id, pin)));
  const role = match ? staffRoleOf(s, eventId, match.user_id, now) : null;
  if (!match || !role) return fail("PIN incorrecto.");
  return { ok: true, state: appendAudit(s, { organization_id: orgId, event_id: eventId, actor_id: deviceUserId, operator_id: match.user_id, action: "kiosk.unlocked", target: match.user_id }, now), data: { operatorId: match.user_id, role } };
}

/** Variante que SIEMPRE devuelve el estado (para registrar el intento fallido en la auditoría del demo). */
export function kioskAttempt(s: RougeState, eventId: UUID, deviceUserId: UUID, pin: string, now = Date.now()): { state: RougeState; result: R<{ operatorId: UUID; role: StaffRole }> } {
  const r = kioskUnlock(s, eventId, deviceUserId, pin, now);
  if (r.ok) return { state: r.state, result: r };
  // Solo cuenta como intento fallido un PIN mal puesto (no una terminal ya bloqueada o mal configurada).
  const counted = r.error === "PIN incorrecto." ? appendAudit(s, { organization_id: organizationOf(s, eventId), event_id: eventId, actor_id: deviceUserId, action: "kiosk.failed" }, now) : s;
  return { state: counted, result: r };
}

// ── Reportes ─────────────────────────────────────────────────────────

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "harassment", label: "Acoso o mensajes ofensivos" },
  { id: "violence", label: "Violencia o amenazas" },
  { id: "underage", label: "Parece menor de 18" },
  { id: "fake_profile", label: "Perfil falso o suplantación" },
  { id: "spam", label: "Spam o estafa" },
  { id: "other", label: "Otro motivo" },
];
export const REPORT_DETAILS_MAX = 280;

/**
 * Reporta a otra persona. Llega en vivo al panel de seguridad del evento. Opcional: bloquear en el mismo paso
 * (bloqueo bidireccional inmediato). Un reporte abierto por persona y evento (sin duplicados).
 */
export function reportUser(s: RougeState, reporterId: UUID, reportedId: UUID, eventId: UUID | null, reason: ReportReason, details: string, now = Date.now()): R<UserReport> {
  if (!reporterId || reporterId === reportedId) return fail("No podés reportarte a vos mismo/a.");
  if (!REPORT_REASONS.some((r) => r.id === reason)) return fail("Elegí un motivo.");
  const text = details.trim();
  if (text.length > REPORT_DETAILS_MAX) return fail(`Máximo ${REPORT_DETAILS_MAX} caracteres.`);
  if (!s.profiles.some((p) => p.id === reportedId)) return fail("Este perfil no está disponible");
  if ((s.user_reports ?? []).some((r) => r.reporter_id === reporterId && r.reported_user_id === reportedId && r.event_id === eventId && r.status === "open")) return fail("Ya reportaste a esta persona: el equipo de seguridad lo está viendo.");
  const report: UserReport = { id: uid(), event_id: eventId, reporter_id: reporterId, reported_user_id: reportedId, reason, details: text, status: "open", reviewed_by: null, created_at: iso(now) };
  const org = eventId ? organizationOf(s, eventId) : null;
  const next = { ...s, user_reports: [...(s.user_reports ?? []), report] };
  return { ok: true, state: appendAudit(next, { organization_id: org, event_id: eventId, actor_id: reporterId, action: "report.created", target: report.id, details: { reason } }, now), data: report };
}

/** Reportes abiertos del evento para el panel de seguridad (dueño/a, producción, seguridad). */
export const openReports = (s: RougeState, eventId: UUID) => (s.user_reports ?? []).filter((r) => r.event_id === eventId && r.status === "open").sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

export function reviewReport(s: RougeState, actorId: UUID, reportId: UUID): R<UserReport> {
  const r = (s.user_reports ?? []).find((x) => x.id === reportId);
  if (!r || !r.event_id) return fail("El reporte no existe.");
  const role = staffRoleOf(s, r.event_id, actorId);
  if (!role || !["owner", "manager", "security"].includes(role)) return fail("Tu rol no tiene permiso para esto.");
  const done: UserReport = { ...r, status: "reviewed", reviewed_by: actorId };
  return { ok: true, state: { ...s, user_reports: (s.user_reports ?? []).map((x) => (x.id === reportId ? done : x)) }, data: done };
}

// ── Borrado de cuenta ────────────────────────────────────────────────

/**
 * Borrado REAL de la cuenta (derecho de supresión): perfil, fotos referenciadas, presencia en eventos, conexiones,
 * mensajes, pines, squads, bloqueos, reportes hechos y cuentas conectadas. Quedan solo registros contables
 * anonimizados (pedidos pagados sin usuario) y la auditoría. Quien creó eventos con asistentes no puede borrarse
 * sin transferirlos (los asistentes perderían sus chats).
 */
export function deleteAccount(s: RougeState, userId: UUID, confirmUsername: string, now = Date.now()): R<undefined> {
  const me = s.profiles.find((p) => p.id === userId);
  if (!me) return fail("No encontramos tu cuenta.");
  if (confirmUsername.trim().replace(/^@/, "").toLowerCase() !== me.username) return fail("Escribí tu @usuario para confirmar.");
  const ownsLive = s.events.some((e) => e.created_by === userId && s.event_attendees.some((a) => a.event_id === e.id));
  if (ownsLive) return fail("Tenés eventos con asistentes: escribinos para transferirlos antes de borrar tu cuenta.");
  const connIds = new Set(s.connections.filter((c) => c.sender_id === userId || c.receiver_id === userId).map((c) => c.id));
  const next: RougeState = {
    ...s,
    profiles: s.profiles.filter((p) => p.id !== userId),
    instagram_links: s.instagram_links.filter((l) => l.user_id !== userId),
    user_blocks: s.user_blocks.filter((b) => b.blocker_id !== userId && b.blocked_user_id !== userId),
    event_attendees: s.event_attendees.filter((a) => a.user_id !== userId),
    event_staff: s.event_staff.filter((r) => r.user_id !== userId),
    staff_assignments: (s.staff_assignments ?? []).filter((a) => a.user_id !== userId),
    terminal_pins: (s.terminal_pins ?? []).filter((p) => p.user_id !== userId),
    connections: s.connections.filter((c) => !connIds.has(c.id)),
    messages: s.messages.filter((m) => m.sender_id !== userId && !(m.connection_id && connIds.has(m.connection_id))),
    squad_members: s.squad_members.filter((m) => m.user_id !== userId),
    map_pins: s.map_pins.filter((p) => p.user_id !== userId),
    user_perks_qrs: s.user_perks_qrs.filter((p) => p.user_id !== userId),
    payout_aliases: s.payout_aliases.filter((a) => a.user_id !== userId),
    user_reports: (s.user_reports ?? []).filter((r) => r.reporter_id !== userId),
    bar_orders: s.bar_orders.map((o) => (o.user_id === userId ? { ...o, user_id: "", split_user_ids: o.split_user_ids.filter((u) => u !== userId) } : o)),
  };
  return { ok: true, state: appendAudit(next, { organization_id: null, actor_id: null, action: "account.deleted", target: null }, now), data: undefined };
}

// ── Privacidad del lobby ─────────────────────────────────────────────

/** Con `require_checkin_for_lobby`, solo es visible en la grilla quien ya pasó por la puerta. */
export const visibleByCheckIn = (s: RougeState, eventId: UUID, attendee: { checked_in_at: string | null }) => !s.events.find((e) => e.id === eventId)?.require_checkin_for_lobby || !!attendee.checked_in_at;
