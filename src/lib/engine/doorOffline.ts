/**
 * Puerta sin conexión (Plan B si se corta el Wi-Fi) — reglas PURAS.
 *
 * Con conexión, la terminal baja un PADRÓN del evento (RPC door_roster): hashes SHA-256 de los códigos válidos, los
 * ya quemados, los pases de la app (usuario → nombre, foto, edad), listas free y la clave de los QR dinámicos.
 * El padrón se guarda CIFRADO en el dispositivo (AES-GCM con clave no exportable, ver lib/offline/doorVault.ts).
 * Sin conexión, cada escaneo se valida contra el padrón, se marca quemado localmente y se encola; al volver la
 * conexión se reconcilia contra el servidor (door_scan). Si otra terminal lo había usado antes, queda como conflicto.
 */
import type { RougeState, UUID } from "@/lib/types";
import { sha256Hex } from "@/lib/crypto/sha256";
import { ageFrom } from "@/lib/utils";
import { parseDoorValue, PASS_PREFIX, type DoorResult, type DoorStatus } from "./door";
import { eventQrSecret, isDynamicQr, verifyDynamicQr } from "./qr";

export interface RosterCode {
  /** id de la entrada (para el ingreso manual desde la búsqueda) */
  id: UUID;
  hash: string;
  label: string | null;
  user_id: UUID | null;
  revoked: boolean;
  checked_in_at: string | null;
  holder: string | null;
  /** Para la búsqueda manual: nombre, DNI y email normalizados (solo en el dispositivo cifrado). */
  search: string;
  late: { price: number; free_until: string; list: string } | null;
}

export interface RosterPerson {
  user_id: UUID;
  name: string;
  username: string;
  photo: string | null;
  age: number;
  checked_in_at: string | null;
  banned: boolean;
}

export interface DoorRoster {
  event_id: UUID;
  built_at: string;
  qr_secret: string | null;
  general: string[]; // hashes del slug, código maestro y links de RRPP
  codes: RosterCode[];
  people: RosterPerson[];
}

export interface OfflineScan {
  value: string;
  at: string;
  terminal: string | null;
  local_status: DoorStatus;
}

export const codeHash = (eventId: UUID, code: string) => sha256Hex(`rouge-door:${eventId}:${code.trim().toUpperCase()}`);
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lo que devuelve door_roster (el demo lo arma del estado). */
export function buildRoster(s: RougeState, eventId: UUID, now = Date.now()): DoorRoster {
  const ev = s.events.find((e) => e.id === eventId);
  const lists = new Map((s.ticket_lists ?? []).map((l) => [l.id, l]));
  const banned = new Set(s.event_bans.filter((b) => b.event_id === eventId).map((b) => b.user_id));
  return {
    event_id: eventId,
    built_at: new Date(now).toISOString(),
    qr_secret: eventQrSecret(s, eventId),
    general: [ev?.slug, ev?.master_invite_code, ...s.promoter_links.filter((l) => l.event_id === eventId).map((l) => l.code)].filter((x): x is string => !!x).map((c) => codeHash(eventId, c)),
    codes: s.event_invite_codes
      .filter((c) => c.event_id === eventId)
      .map((c) => {
        const l = c.list_id ? lists.get(c.list_id) : undefined;
        const p = c.used_by_user_id ? s.profiles.find((x) => x.id === c.used_by_user_id) : undefined;
        return {
          id: c.id,
          hash: codeHash(eventId, c.code),
          label: c.label,
          user_id: c.used_by_user_id,
          revoked: !!c.revoked_at,
          checked_in_at: c.checked_in_at,
          holder: c.holder_name ?? p?.full_name ?? null,
          search: fold([c.holder_name, c.holder_dni, c.holder_email, p?.full_name, p?.username, c.code].filter(Boolean).join(" ")),
          late: l?.free_until && !c.late_paid_at && l.late_price > 0 ? { price: l.late_price, free_until: l.free_until, list: l.name } : null,
        };
      }),
    people: s.event_attendees
      .filter((a) => a.event_id === eventId)
      .map((a) => {
        const p = s.profiles.find((x) => x.id === a.user_id);
        const row: RosterPerson | null = p ? { user_id: a.user_id, name: p.full_name, username: p.username, photo: p.photos[0]?.url ?? null, age: ageFrom(p.birth_date), checked_in_at: a.checked_in_at, banned: banned.has(a.user_id) } : null;
        return row;
      })
      .filter((x): x is RosterPerson => x !== null),
  };
}

const blank = (status: DoorStatus, kind: DoorResult["kind"]): DoorResult => ({ status, kind, user_id: null, name: null, username: null, photo: null, age: null, label: null, checked_in_at: null });

export type DoorTarget = { kind: "pass"; user_id: UUID } | { kind: "code"; hash: string };

/** Valida un escaneo SIN conexión contra el padrón y lo marca quemado (devuelve el padrón actualizado). */
export function offlineDoorCheck(roster: DoorRoster, raw: string, now = Date.now(), terminal: string | null = null): { roster: DoorRoster; result: DoorResult; target: DoorTarget | null } {
  if (isDynamicQr(raw)) {
    const chk = roster.qr_secret ? verifyDynamicQr(raw, roster.qr_secret, now) : ({ ok: false, reason: "forged" } as const);
    if (!chk.ok || chk.kind !== "PASS") return { roster, target: null, result: blank(chk.ok ? "invalid" : chk.reason === "format" ? "invalid" : "expired_qr", "pass") };
    return checkTarget(roster, { kind: "pass", user_id: chk.ref }, now, terminal);
  }
  if (raw.trim().toUpperCase().startsWith(PASS_PREFIX)) return { roster, target: null, result: blank("static_qr", "pass") };
  const parsed = parseDoorValue(raw);
  if (!parsed || parsed.kind !== "code") return { roster, target: null, result: blank("invalid", null) };
  const h = codeHash(roster.event_id, parsed.code);
  if (roster.general.includes(h)) return { roster, target: null, result: blank("general_link", "code") };
  return checkTarget(roster, { kind: "code", hash: h }, now, terminal);
}

/** Misma validación para un ingreso manual (búsqueda por nombre/DNI/email) o uno escaneado. */
export function checkTarget(roster: DoorRoster, target: DoorTarget, now = Date.now(), terminal: string | null = null): { roster: DoorRoster; result: DoorResult; target: DoorTarget | null } {
  const iso = new Date(now).toISOString();
  const person = (u: UUID | null) => roster.people.find((p) => p.user_id === u);
  const asWho = (p?: RosterPerson) => (p ? { user_id: p.user_id, name: p.name, username: p.username, photo: p.photo, age: p.age } : {});
  if (target.kind === "pass") {
    const userId = target.user_id;
    const p = person(userId);
    if (!p) return { roster, target, result: blank("not_attendee", "pass") };
    if (p.banned) return { roster, target, result: { ...blank("banned", "pass"), ...asWho(p) } };
    if (p.checked_in_at) return { roster, target, result: { ...blank("already", "pass"), ...asWho(p), checked_in_at: p.checked_in_at } };
    const code = roster.codes.find((c) => c.user_id === userId && !c.revoked);
    if (code?.late && now > +new Date(code.late.free_until)) return { roster, target: { kind: "code", hash: code.hash }, result: { ...blank("late_free", "pass"), ...asWho(p), late: { code_id: code.id, list: code.late.list, price: code.late.price, free_until: code.late.free_until } } };
    return {
      roster: { ...roster, people: roster.people.map((x) => (x.user_id === userId ? { ...x, checked_in_at: iso } : x)), codes: code ? roster.codes.map((c) => (c.hash === code.hash && !c.checked_in_at ? { ...c, checked_in_at: iso } : c)) : roster.codes },
      target,
      result: { ...blank("ok", "pass"), ...asWho(p), checked_in_at: iso, terminal },
    };
  }
  const c = roster.codes.find((x) => x.hash === target.hash);
  if (!c) return { roster, target: null, result: blank("invalid", "code") };
  const p = person(c.user_id);
  const base = { ...blank("ok", "code"), ...asWho(p), name: p?.name ?? c.holder, label: c.label };
  if (c.revoked) return { roster, target, result: { ...base, status: "revoked" } };
  if (p?.banned) return { roster, target, result: { ...base, status: "banned" } };
  if (c.checked_in_at) return { roster, target, result: { ...base, status: "already", checked_in_at: c.checked_in_at } };
  if (c.late && now > +new Date(c.late.free_until)) return { roster, target, result: { ...base, status: "late_free", late: { code_id: c.id, list: c.late.list, price: c.late.price, free_until: c.late.free_until } } };
  return {
    roster: { ...roster, codes: roster.codes.map((x) => (x.hash === c.hash ? { ...x, checked_in_at: iso } : x)), people: c.user_id ? roster.people.map((x) => (x.user_id === c.user_id && !x.checked_in_at ? { ...x, checked_in_at: iso } : x)) : roster.people },
    target,
    result: { ...base, checked_in_at: iso, terminal },
  };
}

/** Marca pagado el diferencial en el padrón (cobro en puerta sin conexión) y deja pasar. */
export function offlineSettleLate(roster: DoorRoster, codeId: UUID, now = Date.now(), terminal: string | null = null) {
  const c = roster.codes.find((x) => x.id === codeId);
  if (!c) return null;
  return checkTarget({ ...roster, codes: roster.codes.map((x) => (x.id === codeId ? { ...x, late: null } : x)) }, { kind: "code", hash: c.hash }, now, terminal);
}

/** Item de la cola offline / ingreso manual a partir de lo validado. */
export function queueItem(roster: DoorRoster, target: DoorTarget, at: string, terminal: string | null, late_method: OfflineCheckIn["late_method"] = null): OfflineCheckIn {
  if (target.kind === "pass") return { kind: "pass", ref: target.user_id, at, terminal, late_method };
  const c = roster.codes.find((x) => x.hash === target.hash);
  return { kind: "code", ref: c?.id ?? target.hash, at, terminal, late_method };
}

/** Búsqueda manual (sin batería / sin QR): por nombre, DNI, email, @usuario o código. */
export function searchRoster(roster: DoorRoster, q: string, limit = 8): { kind: "code" | "person"; title: string; detail: string; checked_in_at: string | null; target: DoorTarget; user_id: UUID | null }[] {
  const needle = fold(q.trim()).replace(/^@/, "");
  if (needle.length < 2) return [];
  const people = roster.people
    .filter((p) => fold(`${p.name} ${p.username}`).includes(needle))
    .map((p) => ({ kind: "person" as const, title: p.name, detail: `@${p.username} · ${p.age} años${p.banned ? " · EXPULSADO" : ""}`, checked_in_at: p.checked_in_at, target: { kind: "pass", user_id: p.user_id } as DoorTarget, user_id: p.user_id }));
  const codes = roster.codes
    .filter((c) => c.search.includes(needle))
    .map((c) => ({ kind: "code" as const, title: c.holder ?? "Entrada", detail: `${c.label ?? "Entrada"}${c.revoked ? " · ANULADA" : ""}${c.late ? ` · ${c.late.list}` : ""}`, checked_in_at: c.checked_in_at, target: { kind: "code", hash: c.hash } as DoorTarget, user_id: c.user_id }));
  return [...codes, ...people].slice(0, limit);
}

// ── Reconciliación al volver la conexión ─────────────────────────────

/** Ingreso registrado sin conexión (ya validado contra el padrón). El QR dinámico no se reenvía: venció. */
export interface OfflineCheckIn {
  kind: "pass" | "code";
  /** pass: id del usuario · code: el código (texto) */
  ref: string;
  at: string;
  terminal: string | null;
  late_method?: "cash" | "mercadopago" | "transfer" | null;
}

export interface ReconcileResult {
  applied: number;
  conflicts: { kind: "pass" | "code"; ref: string; name: string | null; checked_in_at: string | null; terminal: string | null }[];
}

/**
 * Aplica la cola offline: si nadie lo había hecho entrar, queda con la hora y terminal del escaneo offline; si otra
 * terminal lo hizo antes (con conexión), es un conflicto (doble uso de la misma entrada) para revisar.
 * Espejo de la RPC door_reconcile.
 */
export function reconcileOffline(s: RougeState, eventId: UUID, items: OfflineCheckIn[]): { ok: true; state: RougeState; data: ReconcileResult } {
  let state = s;
  const out: ReconcileResult = { applied: 0, conflicts: [] };
  for (const it of [...items].sort((a, b) => +new Date(a.at) - +new Date(b.at))) {
    if (it.kind === "pass") {
      const att = state.event_attendees.find((a) => a.event_id === eventId && a.user_id === it.ref);
      if (!att) continue;
      if (att.checked_in_at && att.checked_in_terminal !== it.terminal) {
        out.conflicts.push({ kind: "pass", ref: it.ref, name: state.profiles.find((p) => p.id === it.ref)?.full_name ?? null, checked_in_at: att.checked_in_at, terminal: att.checked_in_terminal ?? null });
        continue;
      }
      if (att.checked_in_at) continue;
      state = { ...state, event_attendees: state.event_attendees.map((a) => (a.id === att.id ? { ...a, checked_in_at: it.at, checked_in_terminal: it.terminal } : a)) };
      out.applied++;
    } else {
      const c = state.event_invite_codes.find((x) => x.event_id === eventId && (x.id === it.ref || x.code.toUpperCase() === it.ref.toUpperCase()));
      if (!c || c.revoked_at) continue;
      if (c.checked_in_at && c.checked_in_terminal !== it.terminal) {
        out.conflicts.push({ kind: "code", ref: it.ref, name: c.holder_name ?? null, checked_in_at: c.checked_in_at, terminal: c.checked_in_terminal ?? null });
        continue;
      }
      if (c.checked_in_at) continue;
      state = {
        ...state,
        event_invite_codes: state.event_invite_codes.map((x) => (x.id === c.id ? { ...x, checked_in_at: it.at, checked_in_terminal: it.terminal, ...(it.late_method ? { late_paid_at: it.at, late_payment_method: it.late_method } : {}) } : x)),
        event_attendees: c.used_by_user_id ? state.event_attendees.map((a) => (a.event_id === eventId && a.user_id === c.used_by_user_id && !a.checked_in_at ? { ...a, checked_in_at: it.at, checked_in_terminal: it.terminal } : a)) : state.event_attendees,
      };
      out.applied++;
    }
  }
  return { ok: true, state, data: out };
}
