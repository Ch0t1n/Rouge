/**
 * Tipos de usuario y permisos de ROUGE.
 *
 *   asistente  → la app (/app): lobby, squad, plano, barra, perks
 *   owner      → dueño/a del evento o del boliche: todo el panel
 *   manager    → producción: todo el panel
 *   bartender  → barra: comandas, canje de QR y pantalla LED
 *   waiter     → mozo/a: comandas (delivery a pines / Mesas VIP)
 *   security   → seguridad: resumen con alertas de rescate, puerta (escáner) y pantalla LED
 *   promoter   → RRPP: su link propio con QR y sus ingresos/comisión (no ve datos de asistentes)
 *
 * Contraparte SQL: has_staff_role() en schema.sql (las RPCs exigen el mismo rol).
 *
 * ── Superficies de plataforma ───────────────────────────────────────
 * Cada tipo de usuario opera en UNA superficie con su propia interfaz y sus propias rutas:
 *   client_app   /app, /lobby, /bar, /squad, /chat, /perks… → asistentes
 *   staff_ops    /ops/door, /ops/bar                        → personal de Puerta y Barra (alto contraste)
 *   owner_admin  /admin/*                                   → dueños/as y producción (y el RRPP en /admin/rrpp)
 *   super_admin  /superadmin                                → administradores globales de ROUGE
 * Los roles de la base (`StaffRole`: bartender, waiter, security, promoter…) se mapean a los roles de
 * plataforma (`PlatformStaffRole`: bar_pos, door_scanner, rrpp…) sin renombrar el enum de Postgres
 * (datos existentes y RLS siguen intactos).
 */
import type { RougeEvent, RougeState, StaffAssignment, StaffRole, UUID } from "@/lib/types";

export type Role = StaffRole | "attendee" | "guest";

export type Permission =
  | "admin.overview"
  | "admin.events"
  | "admin.crm"
  | "admin.blasts"
  | "admin.perks"
  | "admin.bar"
  | "admin.livewall"
  | "bar.operate"
  | "perks.redeem"
  /** Sumar/quitar equipo: solo dueño/a (evita que alguien se dé más permisos). */
  | "admin.team"
  /** Panel de RRPP: el RRPP ve lo suyo; dueño/a y producción, todos y la liquidación. */
  | "admin.rrpp"
  /** Escáner de la puerta (entradas y pases de la app). */
  | "door.scan";

const OPERATION: Permission[] = ["admin.overview", "admin.events", "admin.crm", "admin.blasts", "admin.perks", "admin.bar", "admin.livewall", "bar.operate", "perks.redeem", "admin.rrpp", "door.scan"];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  owner: [...OPERATION, "admin.team"],
  manager: OPERATION,
  bartender: ["admin.bar", "bar.operate", "perks.redeem", "admin.livewall"],
  waiter: ["admin.bar", "bar.operate"],
  security: ["admin.overview", "admin.livewall", "door.scan"],
  promoter: ["admin.rrpp"],
};

export const ROLE_META: Record<Role, { label: string; emoji: string; description: string }> = {
  owner: { label: "Dueño/a", emoji: "👑", description: "Todo el panel: eventos, CRM, blasts, sorteos y barra." },
  manager: { label: "Producción", emoji: "🎛️", description: "Opera la noche: accesos, avisos, sorteos y comandas." },
  bartender: { label: "Barra", emoji: "🍸", description: "Comandas, ventanilla rápida y canje de QRs." },
  waiter: { label: "Mozo/a", emoji: "🛵", description: "Lleva pedidos a pines y Mesas VIP." },
  security: { label: "Seguridad", emoji: "🛡️", description: "Escanea entradas en la puerta y ve las alertas de rescate y la pantalla LED." },
  promoter: { label: "RRPP", emoji: "📣", description: "Tiene su link y QR propios para invitar y ve cuánta gente entró por él (sin datos personales)." },
  attendee: { label: "Asistente", emoji: "✨", description: "Conectá, armá tu Squad y pedí sin filas." },
  guest: { label: "Visitante", emoji: "👋", description: "Todavía sin ingresar." },
};

export const STAFF_ROLES: StaffRole[] = ["owner", "manager", "bartender", "waiter", "security", "promoter"];

// ── Plataformas ──────────────────────────────────────────────────────

export type PlatformSurface = "client_app" | "staff_ops" | "owner_admin" | "super_admin";
/** Roles de staff vistos por la plataforma (los asigna el dueño/a desde el panel de equipo). */
export type PlatformStaffRole = "owner" | "manager" | "door_scanner" | "bar_pos" | "rrpp";

export const PLATFORM_ROLE: Record<StaffRole, PlatformStaffRole> = {
  owner: "owner",
  manager: "manager",
  bartender: "bar_pos",
  waiter: "bar_pos",
  security: "door_scanner",
  promoter: "rrpp",
};

/** Superficies habilitadas por rol de plataforma. Puerta y Barra NO entran a la app del asistente ni al panel. */
export const PLATFORM_SURFACES: Record<PlatformStaffRole | "attendee", PlatformSurface[]> = {
  owner: ["owner_admin", "staff_ops", "client_app"],
  manager: ["owner_admin", "staff_ops", "client_app"],
  door_scanner: ["staff_ops"],
  bar_pos: ["staff_ops"],
  rrpp: ["owner_admin", "client_app"],
  attendee: ["client_app"],
};

/** Rutas de `/admin` que el personal operativo puede abrir igual (pantalla LED y ticket impreso de una comanda). */
const OPS_ADMIN_EXCEPTIONS = ["/admin/live-wall", "/admin/print-ticket"];

const CLIENT_PREFIXES = ["/app", "/lobby", "/bar", "/squad", "/chat", "/perks", "/map", "/inbox", "/u/", "/profile", "/settings"];

export function surfaceForPath(pathname: string): PlatformSurface | null {
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  if (under("/superadmin")) return "super_admin";
  if (under("/ops")) return "staff_ops";
  if (under("/admin")) return "owner_admin";
  if (CLIENT_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : under(p)))) return "client_app";
  return null; // público: landing, login, join, legales…
}

// ── Ventana horaria automática ───────────────────────────────────────

/** Puerta y barra: se habilitan 2 h antes del inicio y se apagan 1 h después del cierre. */
export const ACCESS_WINDOW = { beforeMs: 2 * 3_600_000, afterMs: 3_600_000 } as const;

export function accessWindowOf(ev: Pick<RougeEvent, "starts_at" | "ends_at">) {
  return { from: +new Date(ev.starts_at) - ACCESS_WINDOW.beforeMs, to: +new Date(ev.ends_at) + ACCESS_WINDOW.afterMs };
}

export const withinAccessWindow = (ev: Pick<RougeEvent, "starts_at" | "ends_at">, now = Date.now()) => {
  const w = accessWindowOf(ev);
  return now >= w.from && now <= w.to;
};

/** ¿La asignación de staff cubre este evento? (organización correcta + alcance + no revocada). */
export function assignmentCovers(a: StaffAssignment, ev: Pick<RougeEvent, "id" | "created_by">): boolean {
  return !a.revoked_at && !!ev.created_by && a.organization_id === ev.created_by && (a.scope === "all_org_events" || a.event_ids.includes(ev.id));
}

/** Organización (cuenta del dueño/a) a la que pertenece el evento. */
export const organizationOf = (s: RougeState, eventId: UUID): UUID | null => s.events.find((e) => e.id === eventId)?.created_by ?? null;

/**
 * Rol de staff en el evento. Orden: alta directa (`event_staff`), creador del evento (owner) y asignación de la
 * organización (`staff_assignments`, con alcance y ventana horaria). Una asignación con ventana fuera de horario
 * no da permisos (el server aplica la misma regla en has_staff_role).
 */
export function staffRoleOf(s: RougeState, eventId: UUID, userId: UUID, now = Date.now()): StaffRole | null {
  if (!userId || !eventId) return null;
  const row = s.event_staff.find((x) => x.event_id === eventId && x.user_id === userId);
  if (row) return row.role;
  const ev = s.events.find((e) => e.id === eventId);
  if (!ev) return null;
  if (ev.created_by === userId) return "owner";
  const a = (s.staff_assignments ?? []).find((x) => x.user_id === userId && assignmentCovers(x, ev));
  if (!a) return null;
  return !a.access_window || withinAccessWindow(ev, now) ? a.role : null;
}

export function roleOf(s: RougeState, eventId: UUID, userId: UUID, now = Date.now()): Role {
  if (!userId) return "guest";
  return staffRoleOf(s, eventId, userId, now) ?? (s.profiles.some((p) => p.id === userId) ? "attendee" : "guest");
}

export const isPlatformAdmin = (s: RougeState, userId: UUID) => !!userId && (s.platform_admin_ids ?? []).includes(userId);

export const isStaffRole = (r: Role): r is StaffRole => (STAFF_ROLES as string[]).includes(r);

export function can(s: RougeState, eventId: UUID, userId: UUID, perm: Permission, now = Date.now()): boolean {
  const r = staffRoleOf(s, eventId, userId, now);
  return !!r && ROLE_PERMISSIONS[r].includes(perm);
}

/** Pantalla de inicio de cada tipo de usuario. */
export function roleHome(r: Role): string {
  switch (r) {
    case "owner":
    case "manager":
      return "/admin";
    case "security":
      return "/ops/door";
    case "bartender":
    case "waiter":
      return "/ops/bar";
    case "promoter":
      return "/admin/rrpp";
    case "attendee":
      return "/app";
    default:
      return "/login";
  }
}

/** Qué sección del admin (o de la plataforma operativa) exige cada ruta. */
export const ADMIN_ROUTE_PERMISSION: [string, Permission][] = [
  ["/ops/door", "door.scan"],
  ["/ops/bar", "bar.operate"],
  ["/admin/events", "admin.events"],
  ["/admin/brand", "admin.events"],
  ["/admin/menu", "admin.events"],
  ["/admin/crm", "admin.crm"],
  ["/admin/blasts", "admin.blasts"],
  ["/admin/perks", "admin.perks"],
  ["/admin/bar-pos", "admin.bar"],
  ["/admin/live-wall", "admin.livewall"],
  ["/admin/print-codes", "admin.events"],
  ["/admin/print-ticket", "admin.bar"],
  ["/admin/rrpp", "admin.rrpp"],
  ["/admin/door", "door.scan"],
  ["/admin", "admin.overview"],
];

export function permissionForPath(pathname: string): Permission | null {
  return ADMIN_ROUTE_PERMISSION.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? null;
}

export const NO_PERMISSION = "Tu rol no tiene permiso para esto.";

/** Rutas internas seguras para redirigir después del login (evita open redirects). */
export const safeNext = (n: string | null | undefined): string | null => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : null);

/**
 * A dónde va cada usuario al entrar: al `next` pedido si su rol puede verlo,
 * si no a su pantalla (barra → comandas, seguridad → alertas, asistente → la app).
 */
export function destinationFor(s: RougeState, eventId: UUID, userId: UUID, next: string | null | undefined, now = Date.now()): string {
  const role = roleOf(s, eventId, userId, now);
  const target = safeNext(next);
  if (target && target !== "/" && canAccessPath(s, eventId, userId, target, now).ok) return target;
  return roleHome(role);
}

export type AccessDecision = { ok: true; surface: PlatformSurface | null } | { ok: false; surface: PlatformSurface; reason: "surface" | "permission" | "superadmin"; redirect: string };

/**
 * Aislamiento de plataformas: ¿este usuario puede abrir esta ruta en el evento activo?
 * Misma regla en el cliente (AppShell / AdminChrome) y en el servidor (las RPCs exigen rol y ventana horaria;
 * /api/superadmin exige platform_admins).
 */
export function canAccessPath(s: RougeState, eventId: UUID, userId: UUID, pathname: string, now = Date.now()): AccessDecision {
  const surface = surfaceForPath(pathname);
  if (!surface) return { ok: true, surface };
  const role = roleOf(s, eventId, userId, now);
  const home = roleHome(role);
  if (surface === "super_admin") return isPlatformAdmin(s, userId) ? { ok: true, surface } : { ok: false, surface, reason: "superadmin", redirect: home };
  const platform = isStaffRole(role) ? PLATFORM_ROLE[role] : "attendee";
  const allowed = PLATFORM_SURFACES[platform];
  const opsException = surface === "owner_admin" && (platform === "bar_pos" || platform === "door_scanner") && OPS_ADMIN_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // v1.8: crear un evento propio desde /admin/events solo con autogestión habilitada por ROUGE HQ.
  const selfService = (s.organization_settings ?? []).some((o) => o.organization_id === userId && o.allow_owner_self_service);
  const createEvent = surface === "owner_admin" && (platform === "attendee" || platform === "rrpp") && pathname === "/admin/events" && selfService;
  if (!allowed.includes(surface) && !opsException && !createEvent) return { ok: false, surface, reason: "surface", redirect: home };
  const perm = permissionForPath(pathname);
  if (perm && surface !== "client_app" && !createEvent && !can(s, eventId, userId, perm, now)) return { ok: false, surface, reason: "permission", redirect: home };
  return { ok: true, surface };
}
