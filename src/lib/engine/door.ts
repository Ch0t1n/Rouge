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
 *
 * Zonas (v1.10, tabla `event_zones`): el personal elige ANTES de escanear en qué zona controla.
 *   - `entrance` (Puerta principal, Puerta B…): valida la categoría y hace el ingreso completo de la puerta (doorCheckIn).
 *   - `area` (Sala VIP, Auditorio A, Almuerzo ejecutivo): valida que la categoría (`tier`) de la persona esté habilitada
 *     para esa zona. No marca acreditación. Mismas reglas de identidad: el pase tiene que ser el QR dinámico.
 *   Sin zonas cargadas hay una sola opción, la "Puerta principal" virtual (`zone_id` null): la noche no cambia.
 * Toda lectura por zona queda registrada en `zone_check_ins` (quién, dónde, cuándo, qué personal y si pasó).
 * La persona se muestra con la cara del evento (`personFor`): en corporativo nombre, cargo, empresa y categoría, nunca la
 * cara de la noche ni la edad. Contraparte SQL: zone_check_in.
 */
import { ATTENDEE_TIERS } from "@/lib/types";
import type { AttendeeTier, EventZone, LatePaymentMethod, RougeState, TicketList, UUID, ZoneCheckIn } from "@/lib/types";
import { uid } from "@/lib/utils";
import { eventQrSecret, isDynamicQr, verifyDynamicQr } from "./qr";
import { featureOn } from "./features";
import { ageOf } from "./privacy";
import { tierLabel, vertical } from "./verticals";

export type DoorStatus = "ok" | "already" | "invalid" | "revoked" | "banned" | "other_event" | "not_attendee" | "general_link" | "static_qr" | "expired_qr" | "late_free" | "module_off" | "zone_denied";

export interface DoorResult {
  status: DoorStatus;
  kind: "code" | "pass" | "vcard" | null;
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
  /** [v1.10] Zona donde se escaneó (null = Puerta principal virtual). */
  zone_id?: UUID | null;
  zone_name?: string | null;
  zone_kind?: EventZone["kind"];
  tier?: AttendeeTier | null;
  company?: string | null;
  job_title?: string | null;
  /** Categorías que habilita la zona (vacío = todas). Para explicar un rechazo. */
  allowed_tiers?: AttendeeTier[];
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
  module_off: "La puerta no está activa en este evento",
  zone_denied: "Acceso denegado para esta zona",
};

/** Pasó (verde) o no (ámbar/rojo). "Ya entró" en una puerta cuenta como no: puede ser una entrada compartida. */
export const isGranted = (s: DoorStatus) => s === "ok";

/** Lista de un código y si ya pasó su horario free (sin diferencial cobrado). */
export function lateFreeFor(state: RougeState, code: { list_id?: UUID | null; late_paid_at?: string | null }, now = Date.now()): TicketList | null {
  if (!code.list_id || code.late_paid_at) return null;
  const list = (state.ticket_lists ?? []).find((l) => l.id === code.list_id);
  // Módulo apagado: la lista free no se convierte (entra free a cualquier hora).
  if (list && !featureOn(state, list.event_id, "enableFreeCutoffConversion")) return null;
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

type ScanTarget = NonNullable<ReturnType<typeof parseDoorValue>>;

/**
 * Identidad de lo escaneado, igual en la puerta y en las zonas: pase dinámico (TOTP: firma y paso válidos), pase fijo
 * viejo (rechazado como captura), tarjeta vCard (no es un pase) o código de entrada.
 */
function resolveScan(state: RougeState, eventId: UUID, raw: string, now: number): { target: ScanTarget } | { fail: DoorResult } {
  if (/^BEGIN:VCARD/i.test(raw.trim())) return { fail: { ...empty("invalid", "vcard"), label: "Es una tarjeta personal (vCard), no un pase" } };
  if (isDynamicQr(raw)) {
    const secret = eventQrSecret(state, eventId);
    const chk = secret ? verifyDynamicQr(raw, secret, now) : ({ ok: false, reason: "forged" } as const);
    if (!chk.ok) return { fail: empty(chk.reason === "format" ? "invalid" : "expired_qr", "pass") };
    if (chk.kind !== "PASS") return { fail: empty("invalid", "pass") };
    return { target: { kind: "pass", eventId, userId: chk.ref } };
  }
  // El pase fijo ya no sirve: cualquiera podía reenviar la captura.
  if (raw.trim().toUpperCase().startsWith(PASS_PREFIX)) return { fail: empty("static_qr", "pass") };
  const target = parseDoorValue(raw);
  return target ? { target } : { fail: empty("invalid") };
}

/** Quién es, con la cara del evento: en corporativo el perfil profesional (o neutra), nunca la de la noche. */
function personFor(s: RougeState, eventId: UUID, userId: UUID | null) {
  const p = userId ? s.profiles.find((x) => x.id === userId) : undefined;
  if (!p) return { user_id: null, name: null, username: null, photo: null, age: null, company: null, job_title: null };
  const kind = s.events.find((e) => e.id === eventId)?.kind ?? "nightlife";
  if (kind === "corporate") {
    const att = s.event_attendees.find((a) => a.event_id === eventId && a.user_id === p.id);
    const persona = att?.persona_id ? s.profile_personas.find((x) => x.id === att.persona_id) : undefined;
    return {
      user_id: p.id,
      name: persona?.display_name || p.full_name,
      username: null,
      photo: persona?.photos?.[0]?.url ?? null,
      age: vertical(kind).features.showAge ? ageOf(p) : null,
      company: persona?.company || null,
      job_title: persona?.job_title || null,
    };
  }
  // En la noche, igual que siempre: la cuenta (foto, @ y edad para el control +18).
  return { user_id: p.id, name: p.full_name, username: p.username, photo: p.photos?.[0]?.url ?? null, age: ageOf(p), company: null, job_title: null };
}

/** Valida y registra un ingreso en la puerta. Espejo de la RPC door_scan (door_check_in la llama). */
export function doorCheckIn(state: RougeState, eventId: UUID, raw: string, now = Date.now(), opts: { terminal?: string | null } = {}): { ok: true; state: RougeState; data: DoorResult } {
  const terminal = opts.terminal?.trim().slice(0, 40) || null;
  if (!featureOn(state, eventId, "enableTicketing")) return { ok: true, state, data: empty("module_off") };
  const done = (data: DoorResult, next = state) => ({ ok: true as const, state: next, data: { ...data, terminal: data.terminal ?? (data.status === "ok" ? terminal : null) } });
  // Pase dinámico (TOTP) → se valida la firma y el paso, y se sigue como un pase con su usuario.
  const scan = resolveScan(state, eventId, raw, now);
  if ("fail" in scan) return done(scan.fail);
  const target = scan.target;
  const iso = new Date(now).toISOString();
  // Cara del evento: en corporativo la profesional (sin edad ni la cara de la noche).
  const person = (userId: UUID | null) => personFor(state, eventId, userId);
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
  const who = { user_id: p?.id ?? null, name: p?.full_name ?? code.holder_name ?? null, username: p?.username ?? null, photo: p?.photos?.[0]?.url ?? null, age: p ? ageOf(p) : null };
  if (code.checked_in_at) return { ok: true, state, data: { ...empty("already", "code"), ...who, label: code.label, checked_in_at: code.checked_in_at, terminal: code.checked_in_terminal ?? null } };
  const late = lateFreeFor(state, code, now);
  if (!late) return { ok: false, error: "Esta entrada no tiene diferencial para cobrar." };
  const iso = new Date(now).toISOString();
  const terminal = opts.terminal?.trim().slice(0, 40) || null;
  const next = markCodeIn(state, eventId, code.id, iso, terminal, { late_paid_at: iso, late_payment_method: method });
  return { ok: true, state: next, data: { ...empty("ok", "code"), ...who, label: code.label, checked_in_at: iso, terminal } };
}

// ── Zonas (v1.10) ────────────────────────────────────────────────────

export const ZONE_NAME_MIN = 2;
export const ZONE_NAME_MAX = 40;
export const MAX_ZONES = 20;

/** "Puerta principal" virtual: se ofrece cuando el evento no tiene ninguna puerta (`entrance`) cargada. */
export type ScannerZone = Omit<EventZone, "id" | "event_id" | "created_at"> & { id: UUID | null };
export const MAIN_DOOR: ScannerZone = { id: null, name: "Puerta principal", kind: "entrance", allowed_tiers: [], sort_order: -1, is_active: true };

export const zonesOf = (s: RougeState, eventId: UUID, includeInactive = false) =>
  s.event_zones.filter((z) => z.event_id === eventId && (includeInactive || z.is_active)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

/** Opciones del selector "Zona de control activa" del escáner. */
export function scannerZones(s: RougeState, eventId: UUID): ScannerZone[] {
  const zones = zonesOf(s, eventId);
  return zones.some((z) => z.kind === "entrance") ? zones : [MAIN_DOOR, ...zones];
}

export const tierAllowed = (zone: Pick<EventZone, "allowed_tiers">, tier: AttendeeTier | null | undefined) =>
  zone.allowed_tiers.length === 0 || zone.allowed_tiers.includes(tier ?? "attendee");

/** "Requiere VIP / SPEAKER". */
export const requiredTiersLabel = (tiers: AttendeeTier[]) => (tiers.length ? `Requiere ${tiers.map(tierLabel).join(" / ")}` : "Abierta a todas las categorías");

/** Zonas a las que puede pasar una categoría (para el pase del asistente). */
export const zonesForTier = (s: RougeState, eventId: UUID, tier: AttendeeTier) => zonesOf(s, eventId).filter((z) => z.kind === "area" && tierAllowed(z, tier));

export interface ZoneInput {
  id?: UUID;
  name: string;
  kind: EventZone["kind"];
  allowed_tiers: AttendeeTier[];
  is_active?: boolean;
}

type ZoneResult<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };

/** Alta o edición de una zona (⇔ checks de `event_zones` en SQL). Dueño/a y producción. */
export function upsertZone(s: RougeState, eventId: UUID, input: ZoneInput, now = Date.now()): ZoneResult<EventZone> {
  if (!s.events.some((e) => e.id === eventId)) return { ok: false, error: "Evento inexistente." };
  const existing = input.id ? s.event_zones.find((z) => z.id === input.id) : undefined;
  if (input.id && existing && existing.event_id !== eventId) return { ok: false, error: "Esa zona no existe." };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < ZONE_NAME_MIN || name.length > ZONE_NAME_MAX) return { ok: false, error: `El nombre de la zona va de ${ZONE_NAME_MIN} a ${ZONE_NAME_MAX} caracteres.` };
  if (input.kind !== "entrance" && input.kind !== "area") return { ok: false, error: "Tipo de zona inválido." };
  const tiers = [...new Set(input.allowed_tiers)];
  if (tiers.some((t) => !ATTENDEE_TIERS.some((x) => x.id === t))) return { ok: false, error: "Categoría inválida." };
  const others = zonesOf(s, eventId, true).filter((z) => z.id !== existing?.id);
  if (others.some((z) => z.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "Ya hay una zona con ese nombre." };
  if (!existing && others.length >= MAX_ZONES) return { ok: false, error: `Hasta ${MAX_ZONES} zonas por evento.` };
  const zone: EventZone = {
    id: existing?.id ?? input.id ?? uid(),
    event_id: eventId,
    name,
    kind: input.kind,
    allowed_tiers: tiers,
    sort_order: existing?.sort_order ?? others.length,
    is_active: input.is_active ?? existing?.is_active ?? true,
    created_at: existing?.created_at ?? new Date(now).toISOString(),
  };
  const list = existing ? s.event_zones.map((z) => (z.id === zone.id ? zone : z)) : [...s.event_zones, zone];
  return { ok: true, state: { ...s, event_zones: list }, data: zone };
}

/** Baja de una zona: sus lecturas quedan en el registro (sin zona). */
export function deleteZone(s: RougeState, zoneId: UUID): ZoneResult<undefined> {
  if (!s.event_zones.some((z) => z.id === zoneId)) return { ok: false, error: "Esa zona no existe." };
  return {
    ok: true,
    state: { ...s, event_zones: s.event_zones.filter((z) => z.id !== zoneId), zone_check_ins: s.zone_check_ins.map((c) => (c.zone_id === zoneId ? { ...c, zone_id: null } : c)) },
    data: undefined,
  };
}

// ── Escaneo por zona ─────────────────────────────────────────────────

/**
 * Valida una lectura en una zona y la registra (⇔ RPC zone_check_in). `zoneId` null = Puerta principal virtual.
 * En una puerta (`entrance`) valida la categoría y hace el ingreso completo de la puerta (doorCheckIn: QR dinámico,
 * idempotencia con terminal, horario free); en un área solo valida identidad y categoría, sin marcar acreditación.
 */
export function zoneCheckIn(state: RougeState, eventId: UUID, zoneId: UUID | null, raw: string, now = Date.now(), opts: { terminal?: string | null } = {}): ZoneResult<DoorResult> {
  let zone: ScannerZone = MAIN_DOOR;
  if (zoneId) {
    const z = state.event_zones.find((x) => x.id === zoneId && x.event_id === eventId && x.is_active);
    if (!z) return { ok: false, error: "Esa zona no existe o está desactivada." };
    zone = z;
  }
  const iso = new Date(now).toISOString();
  const zoneInfo = { zone_id: zone.id, zone_name: zone.name, zone_kind: zone.kind, allowed_tiers: zone.allowed_tiers };
  let next = state;
  let codeId: UUID | null = null;

  const result = ((): DoorResult => {
    if (!featureOn(state, eventId, "enableTicketing")) return empty("module_off");
    const scan = resolveScan(state, eventId, raw, now);
    if ("fail" in scan) return scan.fail;
    const t = scan.target;
    const banned = (userId: UUID | null) => !!userId && state.event_bans.some((b) => b.event_id === eventId && b.user_id === userId);
    let userId: UUID | null;
    let tier: AttendeeTier;
    let label: string | null = null;
    let seenAt: string | null;
    if (t.kind === "pass") {
      if (t.eventId !== eventId) return empty("other_event", "pass");
      userId = t.userId;
      const who = personFor(state, eventId, userId);
      if (banned(userId)) return { ...empty("banned", "pass"), ...who };
      const att = state.event_attendees.find((a) => a.event_id === eventId && a.user_id === userId);
      if (!att) return { ...empty("not_attendee", "pass"), ...who };
      tier = att.tier ?? "attendee";
      seenAt = att.checked_in_at;
    } else {
      const ev = state.events.find((e) => e.id === eventId);
      if ((ev && (ev.slug.toUpperCase() === t.code || ev.master_invite_code.toUpperCase() === t.code)) || state.promoter_links.some((l) => l.code.toUpperCase() === t.code)) return empty("general_link", "code");
      const code = state.event_invite_codes.find((c) => c.code.toUpperCase() === t.code);
      if (!code) return empty("invalid", "code");
      if (code.event_id !== eventId) return empty("other_event", "code");
      codeId = code.id;
      userId = code.used_by_user_id;
      label = code.label;
      const who = { ...personFor(state, eventId, userId), label };
      if (code.revoked_at) return { ...empty("revoked", "code"), ...who };
      if (banned(userId)) return { ...empty("banned", "code"), ...who };
      const att = userId ? state.event_attendees.find((a) => a.event_id === eventId && a.user_id === userId) : undefined;
      tier = att?.tier ?? code.tier ?? "attendee";
      seenAt = code.checked_in_at;
    }
    const who = personFor(state, eventId, userId);
    const base: DoorResult = { ...empty("ok", t.kind), ...who, label, tier };
    if (!tierAllowed(zone, tier)) return { ...base, status: "zone_denied", checked_in_at: seenAt };
    if (zone.kind === "area") return { ...base, checked_in_at: seenAt };
    // Puerta: el ingreso completo (QR dinámico, "Ya entró" con terminal, horario free, acreditación).
    const door = doorCheckIn(state, eventId, raw, now, opts);
    next = door.state;
    return { ...door.data, tier, company: who.company, job_title: who.job_title };
  })();

  const data: DoorResult = { ...result, ...zoneInfo };
  const log: ZoneCheckIn = {
    id: uid(),
    event_id: eventId,
    zone_id: zone.id,
    user_id: data.user_id,
    code_id: codeId,
    staff_id: state.current_user_id || null,
    status: isGranted(data.status) ? "granted" : "denied",
    reason: data.status,
    tier: data.tier ?? null,
    created_at: iso,
  };
  return { ok: true, state: { ...next, zone_check_ins: [log, ...next.zone_check_ins] }, data };
}

/** Últimas lecturas del evento (más nuevas primero). */
export const recentZoneCheckIns = (s: RougeState, eventId: UUID, limit = 20) =>
  s.zone_check_ins.filter((c) => c.event_id === eventId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);

/** Contadores de la puerta (para la pantalla del escáner). */
export function doorCounts(state: RougeState, eventId: UUID) {
  const attendees = state.event_attendees.filter((a) => a.event_id === eventId);
  const codes = state.event_invite_codes.filter((c) => c.event_id === eventId);
  const people = new Set<string>([...attendees.filter((a) => a.checked_in_at).map((a) => a.user_id), ...codes.filter((c) => c.checked_in_at).map((c) => c.used_by_user_id ?? `code:${c.id}`)]);
  return { inside: people.size, capacity: state.events.find((e) => e.id === eventId)?.max_capacity ?? 0 };
}
