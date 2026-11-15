/**
 * Tipos de usuario y permisos de ROUGE.
 *
 *   asistente  → la app (/app): lobby, squad, plano, barra, perks
 *   owner      → dueño/a del evento o del boliche: todo el panel
 *   manager    → producción: todo el panel
 *   bartender  → barra: comandas, canje de QR y pantalla LED
 *   waiter     → mozo/a: comandas (delivery a pines / Mesas VIP)
 *   security   → seguridad: resumen con alertas de rescate y pantalla LED
 *
 * Contraparte SQL: has_staff_role() en schema.sql (las RPCs exigen el mismo rol).
 */
import type { RougeState, StaffRole, UUID } from "@/lib/types";
import { isSafeInternalPath } from "@/lib/security/paths";

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
  | "admin.team";

const OPERATION: Permission[] = ["admin.overview", "admin.events", "admin.crm", "admin.blasts", "admin.perks", "admin.bar", "admin.livewall", "bar.operate", "perks.redeem"];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  owner: [...OPERATION, "admin.team"],
  manager: OPERATION,
  bartender: ["admin.bar", "bar.operate", "perks.redeem", "admin.livewall"],
  waiter: ["admin.bar", "bar.operate"],
  security: ["admin.overview", "admin.livewall"],
};

export const ROLE_META: Record<Role, { label: string; emoji: string; description: string }> = {
  owner: { label: "Dueño/a", emoji: "👑", description: "Todo el panel: eventos, CRM, blasts, sorteos y barra." },
  manager: { label: "Producción", emoji: "🎛️", description: "Opera la noche: accesos, avisos, sorteos y comandas." },
  bartender: { label: "Barra", emoji: "🍸", description: "Comandas, ventanilla rápida y canje de QRs." },
  waiter: { label: "Mozo/a", emoji: "🛵", description: "Lleva pedidos a pines y Mesas VIP." },
  security: { label: "Seguridad", emoji: "🛡️", description: "Ve las alertas de rescate activas y la pantalla LED." },
  attendee: { label: "Asistente", emoji: "✨", description: "Conectá, armá tu Squad y pedí sin filas." },
  guest: { label: "Visitante", emoji: "👋", description: "Todavía sin ingresar." },
};

export const STAFF_ROLES: StaffRole[] = ["owner", "manager", "bartender", "waiter", "security"];

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
    case "attendee":
      return "/app";
    default:
      return "/login";
  }
}

/** Qué sección del admin exige cada ruta. */
export const ADMIN_ROUTE_PERMISSION: [string, Permission][] = [
  ["/admin/events", "admin.events"],
  ["/admin/crm", "admin.crm"],
  ["/admin/blasts", "admin.blasts"],
  ["/admin/perks", "admin.perks"],
  ["/admin/bar-pos", "admin.bar"],
  ["/admin/live-wall", "admin.livewall"],
  ["/admin/print-codes", "admin.events"],
  ["/admin", "admin.overview"],
];

export function permissionForPath(pathname: string): Permission | null {
  return ADMIN_ROUTE_PERMISSION.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? null;
}

export const NO_PERMISSION = "Tu rol no tiene permiso para esto.";

/** Rutas internas seguras para redirigir después del login (evita open redirects; ver security/paths.ts). */
export const safeNext = (n: string | null | undefined): string | null => (isSafeInternalPath(n) && !n.startsWith("/login") ? n : null);

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
