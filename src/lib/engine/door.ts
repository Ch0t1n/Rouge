/**
 * Puerta — reglas PURAS del escáner de ingreso.
 *
 * Se escanea (o se tipea):
 *   - la ENTRADA: el QR del código de 1 uso (`…/join/<código>` o el código solo) → se marca su ingreso físico;
 *   - el PASE de la app: `ROUGE:PASS:<evento>:<usuario>` (lo muestra el asistente en Inicio) → ingreso de esa persona.
 * El resultado muestra nombre, foto y edad para comparar con quien está en la puerta (+18). Un código anulado, un
 * expulsado o un pase de otro evento se rechazan; uno ya escaneado avisa a qué hora entró.
 *
 * v1.7:
 *   - El pase de la app es un QR DINÁMICO (TOTP, rota cada 20 s): ROUGE:T1:PASS:<usuario>:<paso>:<firma>. El pase fijo
 *     viejo (`ROUGE:PASS:…`) se rechaza como "QR estático" (captura de pantalla).
 *   - Escaneo idempotente: el primero que llega gana; los siguientes ven "Ya entró" con la hora y la terminal.
 *   - Listas free con horario límite: pasado `free_until`, la entrada queda "Fuera de horario Free" hasta cobrar el
 *     diferencial (`doorSettleLate`).
 * Contraparte SQL: door_scan (dueño/a, producción y seguridad) y door_settle_late.
 */
import type { LatePaymentMethod, RougeState, TicketList, UUID } from "@/lib/types";
import { ageFrom } from "@/lib/utils";
import { eventQrSecret, isDynamicQr, verifyDynamicQr } from "./qr";

export type DoorStatus = "ok" | "already" | "invalid" | "revoked" | "banned" | "other_event" | "not_attendee" | "general_link" | "static_qr" | "expired_qr" | "late_free";

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
  /** Terminal que registró el ingreso (en "already": la que lo consumió primero). */
  terminal?: string | null;
  /** Fuera de horario free: lista, precio del diferencial y código a cobrar. */
  late?: { code_id: UUID; list: string; price: number; free_until: string } | null;
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
  static_qr: "QR estático (captura): pedí el QR en vivo",
  expired_qr: "QR vencido o falso: pedí el QR en vivo",
  late_free: "Fuera de horario Free",
};

/** Lista de un código y si ya pasó su horario free (sin diferencial cobrado). */
export function lateFreeFor(state: RougeState, code: { list_id?: UUID | null; late_paid_at?: string | null }, now = Date.now()): TicketList | null {
  if (!code.list_id || code.late_paid_at) return null;
  const list = (state.ticket_lists ?? []).find((l) => l.id === code.list_id);
  return list?.free_until && now > +new Date(list.free_until) && list.late_price > 0 ? list : null;
}

/** Normaliza lo escaneado: QR de URL (/join/<código>), pase de la app o código tipeado. */
export function parseDoorValue(raw: string): { kind: "pass"; eventId: string; userId: string } | { kind: "code"; code: string } | null {
  const v = raw.trim();
  if (!v || isDynamicQr(v)) return null;
  if (v.toUpperCase().startsWith(PASS_PREFIX)) {
    const [eventId, userId] = v.slice(PASS_PREFIX.length).split(":");
    return eventId && userId ? { kind: "pass", eventId, userId } : null;
  }
  const fromUrl = v.match(/\/join\/([^/?#\s]+)/i)?.[1];
  const code = decodeURIComponent(fromUrl ?? v).trim().toUpperCase();
  return /^[A-Z0-9-]{3,40}$/.test(code) ? { kind: "code", code } : null;
}

const empty = (status: DoorStatus, kind: DoorResult["kind"] = null): DoorResult => ({ status, kind, user_id: null, name: null, username: null, photo: null, age: null, label: null, checked_in_at: null });

/** Valida y registra un ingreso en la puerta. Espejo de la RPC door_scan (door_check_in la llama). */
export function doorCheckIn(state: RougeState, eventId: UUID, raw: string, now = Date.now(), opts: { terminal?: string | null } = {}): { ok: true; state: RougeState; data: DoorResult } {
  const terminal = opts.terminal?.trim().slice(0, 40) || null;
  const done = (data: DoorResult, next = state) => ({ ok: true as const, state: next, data: { ...data, terminal: data.terminal ?? (data.status === "ok" ? terminal : null) } });
  // Pase dinámico (TOTP) → se valida la firma y el paso, y se sigue como un pase con su usuario.
  let target: ReturnType<typeof parseDoorValue>;
  if (isDynamicQr(raw)) {
    const secret = eventQrSecret(state, eventId);
    const chk = secret ? verifyDynamicQr(raw, secret, now) : ({ ok: false, reason: "forged" } as const);
    if (!chk.ok) return done(empty(chk.reason === "format" ? "invalid" : "expired_qr", "pass"));
    if (chk.kind !== "PASS") return done(empty("invalid", "pass"));
    target = { kind: "pass", eventId, userId: chk.ref };
  } else if (raw.trim().toUpperCase().startsWith(PASS_PREFIX)) {
    // El pase fijo ya no sirve: cualquiera podía reenviar la captura.
    return done(empty("static_qr", "pass"));
  } else target = parseDoorValue(raw);
  if (!target) return done(empty("invalid"));
  const iso = new Date(now).toISOString();
  const person = (userId: UUID | null) => {
    const p = userId ? state.profiles.find((x) => x.id === userId) : undefined;
    return { user_id: p?.id ?? null, name: p?.full_name ?? null, username: p?.username ?? null, photo: p?.photos?.[0]?.url ?? null, age: p ? ageFrom(p.birth_date) : null };
  };
  const banned = (userId: UUID | null) => !!userId && state.event_bans.some((b) => b.event_id === eventId && b.user_id === userId);

  if (target.kind === "pass") {
    const parsed2 = target;
    if (parsed2.eventId !== eventId) return done(empty("other_event", "pass"));
    const who = person(parsed2.userId);
    if (banned(parsed2.userId)) return done({ ...empty("banned", "pass"), ...who });
    const att = state.event_attendees.find((a) => a.event_id === eventId && a.user_id === parsed2.userId);
    if (!att) return done({ ...empty("not_attendee", "pass"), ...who });
    if (att.checked_in_at) return done({ ...empty("already", "pass"), ...who, checked_in_at: att.checked_in_at, terminal: att.checked_in_terminal ?? null });
    // Si entró con una entrada de lista free y ya pasó el horario, primero se cobra el diferencial.
    const code = state.event_invite_codes.find((c) => c.event_id === eventId && c.used_by_user_id === parsed2.userId && !c.revoked_at);
    const late = code ? lateFreeFor(state, code, now) : null;
    if (code && late) return done({ ...empty("late_free", "pass"), ...who, label: code.label, late: { code_id: code.id, list: late.name, price: late.late_price, free_until: late.free_until! } });
    const next = {
      ...state,
      event_attendees: state.event_attendees.map((a) => (a.id === att.id ? { ...a, checked_in_at: iso, checked_in_terminal: terminal } : a)),
      event_invite_codes: code ? state.event_invite_codes.map((c) => (c.id === code.id && !c.checked_in_at ? { ...c, checked_in_at: iso, checked_in_terminal: terminal } : c)) : state.event_invite_codes,
    };
    return done({ ...empty("ok", "pass"), ...who, checked_in_at: iso }, next);
  }
  const parsed = target;

  const ev = state.events.find((e) => e.id === eventId);
  if (ev && (ev.slug.toUpperCase() === parsed.code || ev.master_invite_code.toUpperCase() === parsed.code) || state.promoter_links.some((l) => l.code.toUpperCase() === parsed.code)) return done(empty("general_link", "code"));
  const code = state.event_invite_codes.find((c) => c.code.toUpperCase() === parsed.code);
  if (!code) return done(empty("invalid", "code"));
  if (code.event_id !== eventId) return done(empty("other_event", "code"));
  const who = person(code.used_by_user_id);
  const base = { ...empty("ok", "code"), ...who, label: code.label };
  if (code.revoked_at) return done({ ...base, status: "revoked" });
  if (banned(code.used_by_user_id)) return done({ ...base, status: "banned" });
  if (code.checked_in_at) return done({ ...base, status: "already", checked_in_at: code.checked_in_at, terminal: code.checked_in_terminal ?? null });
  const late = lateFreeFor(state, code, now);
  if (late) return done({ ...base, status: "late_free", name: base.name ?? code.holder_name ?? null, late: { code_id: code.id, list: late.name, price: late.late_price, free_until: late.free_until! } });
  return done({ ...base, name: base.name ?? code.holder_name ?? null, checked_in_at: iso }, markCodeIn(state, eventId, code.id, iso, terminal));
}

function markCodeIn(state: RougeState, eventId: UUID, codeId: UUID, iso: string, terminal: string | null, extra: Partial<RougeState["event_invite_codes"][number]> = {}): RougeState {
  const code = state.event_invite_codes.find((c) => c.id === codeId)!;
  let next: RougeState = { ...state, event_invite_codes: state.event_invite_codes.map((c) => (c.id === codeId ? { ...c, ...extra, checked_in_at: iso, checked_in_terminal: terminal } : c)) };
  // Si el código ya está vinculado a alguien en la app, su asistencia también queda con ingreso confirmado.
  if (code.used_by_user_id) next = { ...next, event_attendees: next.event_attendees.map((a) => (a.event_id === eventId && a.user_id === code.used_by_user_id && !a.checked_in_at ? { ...a, checked_in_at: iso, checked_in_terminal: terminal } : a)) };
  return next;
}

export const LATE_METHODS: { id: LatePaymentMethod; label: string; emoji: string }[] = [
  { id: "cash", label: "Efectivo", emoji: "💵" },
  { id: "mercadopago", label: "Mercado Pago", emoji: "💙" },
  { id: "transfer", label: "Transferencia", emoji: "🏦" },
];

/**
 * Cobra el diferencial de una entrada de lista free fuera de horario y deja pasar en el mismo paso (atómico: si
 * otra terminal ya la hizo entrar, devuelve "Ya entró").
 */
export function doorSettleLate(state: RougeState, eventId: UUID, codeId: UUID, method: LatePaymentMethod, now = Date.now(), opts: { terminal?: string | null } = {}): { ok: true; state: RougeState; data: DoorResult } | { ok: false; error: string } {
  const code = state.event_invite_codes.find((c) => c.id === codeId && c.event_id === eventId);
  if (!code) return { ok: false, error: "Esa entrada no existe." };
  if (!LATE_METHODS.some((m) => m.id === method)) return { ok: false, error: "Elegí cómo pagó." };
  const p = code.used_by_user_id ? state.profiles.find((x) => x.id === code.used_by_user_id) : undefined;
  const who = { user_id: p?.id ?? null, name: p?.full_name ?? code.holder_name ?? null, username: p?.username ?? null, photo: p?.photos?.[0]?.url ?? null, age: p ? ageFrom(p.birth_date) : null };
  if (code.checked_in_at) return { ok: true, state, data: { ...empty("already", "code"), ...who, label: code.label, checked_in_at: code.checked_in_at, terminal: code.checked_in_terminal ?? null } };
  const late = lateFreeFor(state, code, now);
  if (!late) return { ok: false, error: "Esta entrada no tiene diferencial para cobrar." };
  const iso = new Date(now).toISOString();
  const terminal = opts.terminal?.trim().slice(0, 40) || null;
  const next = markCodeIn(state, eventId, code.id, iso, terminal, { late_paid_at: iso, late_payment_method: method });
  return { ok: true, state: next, data: { ...empty("ok", "code"), ...who, label: code.label, checked_in_at: iso, terminal } };
}

/** Contadores de la puerta (para la pantalla del escáner). */
export function doorCounts(state: RougeState, eventId: UUID) {
  const attendees = state.event_attendees.filter((a) => a.event_id === eventId);
  const codes = state.event_invite_codes.filter((c) => c.event_id === eventId);
  const people = new Set<string>([...attendees.filter((a) => a.checked_in_at).map((a) => a.user_id), ...codes.filter((c) => c.checked_in_at).map((c) => c.used_by_user_id ?? `code:${c.id}`)]);
  return { inside: people.size, capacity: state.events.find((e) => e.id === eventId)?.max_capacity ?? 0 };
}
