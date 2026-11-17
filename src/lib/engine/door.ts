/**
 * Puerta — reglas PURAS del escáner de ingreso.
 *
 * Se escanea (o se tipea):
 *   - la ENTRADA: el QR del código de 1 uso (`…/join/<código>` o el código solo) → se marca su ingreso físico;
 *   - el PASE de la app: `ROUGE:PASS:<evento>:<usuario>` (lo muestra el asistente en Inicio) → ingreso de esa persona.
 * El resultado muestra nombre, foto y edad para comparar con quien está en la puerta (+18). Un código anulado, un
 * expulsado o un pase de otro evento se rechazan; uno ya escaneado avisa a qué hora entró.
 * Contraparte SQL: door_check_in (dueño/a, producción y seguridad).
 */
import type { RougeState, UUID } from "@/lib/types";
import { ageOf } from "./privacy";

export type DoorStatus = "ok" | "already" | "invalid" | "revoked" | "banned" | "other_event" | "not_attendee" | "general_link";

export interface DoorResult {
  status: DoorStatus;
  kind: "code" | "pass" | null;
  user_id: UUID | null;
  name: string | null;
  username: string | null;
  photo: string | null;
  age: number | null;
  label: string | null;
  checked_in_at: string | null;
}

export const PASS_PREFIX = "ROUGE:PASS:";
export const passValue = (eventId: UUID, userId: UUID) => `${PASS_PREFIX}${eventId}:${userId}`;

export const DOOR_MESSAGES: Record<DoorStatus, string> = {
  ok: "Adelante",
  already: "Ya entró",
  invalid: "No es una entrada válida",
  revoked: "Entrada anulada",
  banned: "No puede entrar a este evento",
  other_event: "Es de otro evento",
  not_attendee: "No está en este evento",
  general_link: "Es el link general, no una entrada",
};

/** Normaliza lo escaneado: QR de URL (/join/<código>), pase de la app o código tipeado. */
export function parseDoorValue(raw: string): { kind: "pass"; eventId: string; userId: string } | { kind: "code"; code: string } | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.toUpperCase().startsWith(PASS_PREFIX)) {
    const [eventId, userId] = v.slice(PASS_PREFIX.length).split(":");
    return eventId && userId ? { kind: "pass", eventId, userId } : null;
  }
  const fromUrl = v.match(/\/join\/([^/?#\s]+)/i)?.[1];
  const code = decodeURIComponent(fromUrl ?? v).trim().toUpperCase();
  return /^[A-Z0-9-]{3,40}$/.test(code) ? { kind: "code", code } : null;
}

const empty = (status: DoorStatus, kind: DoorResult["kind"] = null): DoorResult => ({ status, kind, user_id: null, name: null, username: null, photo: null, age: null, label: null, checked_in_at: null });

/** Valida y registra un ingreso en la puerta. Espejo de la RPC door_check_in. */
export function doorCheckIn(state: RougeState, eventId: UUID, raw: string, now = Date.now()): { ok: true; state: RougeState; data: DoorResult } {
  const parsed = parseDoorValue(raw);
  const done = (data: DoorResult, next = state) => ({ ok: true as const, state: next, data });
  if (!parsed) return done(empty("invalid"));
  const iso = new Date(now).toISOString();
  const person = (userId: UUID | null) => {
    const p = userId ? state.profiles.find((x) => x.id === userId) : undefined;
    return { user_id: p?.id ?? null, name: p?.full_name ?? null, username: p?.username ?? null, photo: p?.photos?.[0]?.url ?? null, age: p ? ageOf(p) : null };
  };
  const banned = (userId: UUID | null) => !!userId && state.event_bans.some((b) => b.event_id === eventId && b.user_id === userId);

  if (parsed.kind === "pass") {
    if (parsed.eventId !== eventId) return done(empty("other_event", "pass"));
    const who = person(parsed.userId);
    if (banned(parsed.userId)) return done({ ...empty("banned", "pass"), ...who });
    const att = state.event_attendees.find((a) => a.event_id === eventId && a.user_id === parsed.userId);
    if (!att) return done({ ...empty("not_attendee", "pass"), ...who });
    if (att.checked_in_at) return done({ ...empty("already", "pass"), ...who, checked_in_at: att.checked_in_at });
    const next = { ...state, event_attendees: state.event_attendees.map((a) => (a.id === att.id ? { ...a, checked_in_at: iso } : a)) };
    return done({ ...empty("ok", "pass"), ...who, checked_in_at: iso }, next);
  }

  const ev = state.events.find((e) => e.id === eventId);
  if (ev && (ev.slug.toUpperCase() === parsed.code || ev.master_invite_code.toUpperCase() === parsed.code) || state.promoter_links.some((l) => l.code.toUpperCase() === parsed.code)) return done(empty("general_link", "code"));
  const code = state.event_invite_codes.find((c) => c.code.toUpperCase() === parsed.code);
  if (!code) return done(empty("invalid", "code"));
  if (code.event_id !== eventId) return done(empty("other_event", "code"));
  const who = person(code.used_by_user_id);
  const base = { ...empty("ok", "code"), ...who, label: code.label };
  if (code.revoked_at) return done({ ...base, status: "revoked" });
  if (banned(code.used_by_user_id)) return done({ ...base, status: "banned" });
  if (code.checked_in_at) return done({ ...base, status: "already", checked_in_at: code.checked_in_at });
  let next: RougeState = { ...state, event_invite_codes: state.event_invite_codes.map((c) => (c.id === code.id ? { ...c, checked_in_at: iso } : c)) };
  // Si el código ya está vinculado a alguien en la app, su asistencia también queda con ingreso confirmado.
  if (code.used_by_user_id) next = { ...next, event_attendees: next.event_attendees.map((a) => (a.event_id === eventId && a.user_id === code.used_by_user_id && !a.checked_in_at ? { ...a, checked_in_at: iso } : a)) };
  return done({ ...base, checked_in_at: iso }, next);
}

/** Contadores de la puerta (para la pantalla del escáner). */
export function doorCounts(state: RougeState, eventId: UUID) {
  const attendees = state.event_attendees.filter((a) => a.event_id === eventId);
  const codes = state.event_invite_codes.filter((c) => c.event_id === eventId);
  const people = new Set<string>([...attendees.filter((a) => a.checked_in_at).map((a) => a.user_id), ...codes.filter((c) => c.checked_in_at).map((c) => c.used_by_user_id ?? `code:${c.id}`)]);
  return { inside: people.size, capacity: state.events.find((e) => e.id === eventId)?.max_capacity ?? 0 };
}
