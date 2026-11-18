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
 */
import type { RougeState, StaffRole, UUID } from "@/lib/types";

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

/** Rol de staff en el evento (quien lo creó es owner aunque no tenga fila en event_staff). */
export function staffRoleOf(s: RougeState, eventId: UUID, userId: UUID): StaffRole | null {
  if (!userId || !eventId) return null;
  const row = s.event_staff.find((x) => x.event_id === eventId && x.user_id === userId);
  if (row) return row.role;
  return s.events.find((e) => e.id === eventId)?.created_by === userId ? "owner" : null;
}

export function roleOf(s: RougeState, eventId: UUID, userId: UUID): Role {
  if (!userId) return "guest";
  return staffRoleOf(s, eventId, userId) ?? (s.profiles.some((p) => p.id === userId) ? "attendee" : "guest");
}

export const isStaffRole = (r: Role): r is StaffRole => (STAFF_ROLES as string[]).includes(r);

export function can(s: RougeState, eventId: UUID, userId: UUID, perm: Permission): boolean {
  const r = staffRoleOf(s, eventId, userId);
  return !!r && ROLE_PERMISSIONS[r].includes(perm);
}

/** Pantalla de inicio de cada tipo de usuario. */
export function roleHome(r: Role): string {
  switch (r) {
    case "owner":
    case "manager":
    case "security":
      return "/admin";
    case "bartender":
    case "waiter":
      return "/admin/bar-pos";
    case "promoter":
      return "/admin/rrpp";
    case "attendee":
      return "/app";
    default:
      return "/login";
  }
}

/** Qué sección del admin exige cada ruta. */
export const ADMIN_ROUTE_PERMISSION: [string, Permission][] = [
  ["/admin/events", "admin.events"],
  ["/admin/agenda", "admin.events"],
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
export function destinationFor(s: RougeState, eventId: UUID, userId: UUID, next: string | null | undefined): string {
  const role = roleOf(s, eventId, userId);
  const target = safeNext(next);
  if (target && target !== "/") {
    const perm = permissionForPath(target);
    if (!perm || can(s, eventId, userId, perm)) return target;
  }
  return roleHome(role);
}
