/**
 * API v1 para clientes empresariales (ticketeras, productoras) — SOLO servidor.
 *
 * Autenticación: `Authorization: Bearer rk_live_…` (clave creada en Panel → Eventos y accesos → API).
 * La base guarda solo el SHA-256 de la clave; toda regla vive en SQL (api_authorize, api_issue_codes,
 * api_revoke_code) y este módulo traduce HTTP ⇄ RPC. Las funciones puras están arriba y tienen tests.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { ApiScope } from "@/lib/types";

export const API_VERSION = "1.0.0";
export const MAX_BATCH = 1000;
export const MAX_PAGE = 500;
const KEY_RE = /^rk_live_[0-9a-f]{10}_[0-9a-f]{48}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CODE_RE = /^[A-Za-z0-9-]{4,40}$/;

// ── Errores ──────────────────────────────────────────────────────────

export type ApiErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "insufficient_scope"
  | "forbidden"
  | "event_not_found"
  | "code_not_found"
  | "code_already_used"
  | "validation_error"
  | "not_configured"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  missing_api_key: 401,
  invalid_api_key: 401,
  insufficient_scope: 403,
  forbidden: 403,
  event_not_found: 404,
  code_not_found: 404,
  code_already_used: 409,
  validation_error: 422,
  not_configured: 503,
  internal_error: 500,
};

const MESSAGES: Record<ApiErrorCode, string> = {
  missing_api_key: "Falta el header Authorization: Bearer <clave>.",
  invalid_api_key: "La clave de API no es válida o fue revocada.",
  insufficient_scope: "La clave no tiene el permiso necesario para esta operación.",
  forbidden: "La clave no tiene acceso a este evento.",
  event_not_found: "No existe un evento con ese id o slug al que esta clave tenga acceso.",
  code_not_found: "No existe ese código en este evento.",
  code_already_used: "El código ya se usó para entrar: no se puede anular.",
  validation_error: "El pedido no es válido.",
  not_configured: "La API no está configurada en este servidor.",
  internal_error: "Error interno. Probá de nuevo.",
};

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? MESSAGES[code]);
  }
  get status() {
    return STATUS[this.code];
  }
}

export function errorResponse(e: unknown): NextResponse {
  const err = e instanceof ApiError ? e : new ApiError("internal_error");
  const body = { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (err.status === 401) headers["WWW-Authenticate"] = 'Bearer realm="rouge-api"';
  return NextResponse.json(body, { status: err.status, headers });
}

/** Excepciones de las RPCs (raise exception '<código>') → error HTTP. */
export function fromDbError(message: string | undefined): ApiError {
  switch (message) {
    case "forbidden":
      return new ApiError("forbidden");
    case "code_not_found":
      return new ApiError("code_not_found");
    case "code_already_used":
      return new ApiError("code_already_used");
    case "invalid_count":
      return new ApiError("validation_error", `Pedí entre 1 y ${MAX_BATCH} códigos por request.`);
    case "duplicate_external_ref":
      return new ApiError("validation_error", "Hay external_ref repetidos en el mismo pedido.");
    case "invalid_tickets":
      return new ApiError("validation_error", "Cada entrada necesita external_ref (1-120 caracteres) y label opcional (≤ 60).");
    default:
      return new ApiError("internal_error");
  }
}

// ── Funciones puras ──────────────────────────────────────────────────

export const hashApiKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Clave del header Authorization (o null si falta / no tiene el formato). */
export function parseBearer(header: string | null | undefined): string | null | "malformed" {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (!m) return "malformed";
  return KEY_RE.test(m[1]) ? m[1] : "malformed";
}

export interface IssueInput {
  count?: number;
  tickets?: { external_ref: string; label?: string }[];
  label?: string;
}

/** Valida el body de POST /codes: `{ count, label? }` o `{ tickets: [{ external_ref, label? }], label? }`. */
export function validateIssueBody(body: unknown): IssueInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("validation_error", "El body tiene que ser un objeto JSON.");
  const b = body as Record<string, unknown>;
  const label = b.label;
  if (label !== undefined && (typeof label !== "string" || label.length > 60)) throw new ApiError("validation_error", "label tiene que ser texto de hasta 60 caracteres.");
  const hasCount = b.count !== undefined;
  const hasTickets = b.tickets !== undefined;
  if (hasCount === hasTickets) throw new ApiError("validation_error", "Mandá `count` (cantidad) o `tickets` (una por entrada), no los dos.");
  if (hasCount) {
    if (!Number.isInteger(b.count) || (b.count as number) < 1 || (b.count as number) > MAX_BATCH) throw new ApiError("validation_error", `count tiene que ser un entero entre 1 y ${MAX_BATCH}.`);
    return { count: b.count as number, label: label as string | undefined };
  }
  if (!Array.isArray(b.tickets) || b.tickets.length < 1 || b.tickets.length > MAX_BATCH) throw new ApiError("validation_error", `tickets tiene que ser una lista de 1 a ${MAX_BATCH} entradas.`);
  const seen = new Set<string>();
  const tickets = b.tickets.map((t, i) => {
    const ref = (t as Record<string, unknown>)?.external_ref;
    const tl = (t as Record<string, unknown>)?.label;
    if (typeof ref !== "string" || !ref.trim() || ref.length > 120) throw new ApiError("validation_error", `tickets[${i}].external_ref tiene que ser texto de 1 a 120 caracteres.`);
    if (tl !== undefined && (typeof tl !== "string" || tl.length > 60)) throw new ApiError("validation_error", `tickets[${i}].label tiene que ser texto de hasta 60 caracteres.`);
    if (seen.has(ref)) throw new ApiError("validation_error", `external_ref repetido: ${ref}`);
    seen.add(ref);
    return { external_ref: ref, ...(tl !== undefined ? { label: tl as string } : {}) };
  });
  return { tickets, label: label as string | undefined };
}

export interface CodeRow {
  id: string;
  code: string;
  external_ref: string | null;
  label: string | null;
  is_used: boolean;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created?: boolean;
}

export type CodeStatus = "unused" | "used" | "revoked";
export const codeStatus = (r: Pick<CodeRow, "is_used" | "revoked_at">): CodeStatus => (r.is_used ? "used" : r.revoked_at ? "revoked" : "unused");

/** Código tal como lo ve el cliente: link para el botón del mail y QR en PNG para la entrada. */
export function serializeCode(r: CodeRow, base: string) {
  return {
    id: r.id,
    code: r.code,
    status: codeStatus(r),
    external_ref: r.external_ref,
    label: r.label,
    join_url: `${base}/join/${r.code}`,
    qr_url: `${base}/api/v1/qr/${r.code}`,
    created_at: r.created_at,
    used_at: r.used_at,
    revoked_at: r.revoked_at,
    ...(r.created !== undefined ? { created: r.created } : {}),
  };
}

export const encodeCursor = (r: { created_at: string; id: string }) => Buffer.from(JSON.stringify([r.created_at, r.id])).toString("base64url");
export function decodeCursor(c: string | null): { created_at: string; id: string } | null {
  if (!c) return null;
  try {
    const [created_at, id] = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as [string, string];
    if (!UUID_RE.test(id) || Number.isNaN(Date.parse(created_at))) throw new Error();
    return { created_at, id };
  } catch {
    throw new ApiError("validation_error", "cursor inválido.");
  }
}

export const isUuid = (s: string) => UUID_RE.test(s);

// ── Servidor ─────────────────────────────────────────────────────────

let admin: SupabaseClient | null = null;
export function apiAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError("not_configured");
  if (!admin) admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export function publicBase(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  event_id: string | null;
  scopes: ApiScope[];
  last_used_at: string | null;
}

/** Clave activa del request o error 401. */
export async function authenticate(db: SupabaseClient, req: NextRequest): Promise<ApiKeyRow> {
  const raw = parseBearer(req.headers.get("authorization"));
  if (raw === null) throw new ApiError("missing_api_key");
  if (raw === "malformed") throw new ApiError("invalid_api_key");
  const { data } = await db.from("api_keys").select("id,name,prefix,event_id,scopes,last_used_at").eq("key_hash", hashApiKey(raw)).is("revoked_at", null).maybeSingle();
  if (!data) throw new ApiError("invalid_api_key");
  const key = data as ApiKeyRow;
  if (!key.last_used_at || Date.now() - Date.parse(key.last_used_at) > 60_000) {
    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  }
  return key;
}

export function requireScope(key: ApiKeyRow, scope: ApiScope) {
  if (!key.scopes.includes(scope)) throw new ApiError("insufficient_scope", `La clave necesita el permiso ${scope}.`);
}

export interface ApiEvent {
  id: string;
  slug: string;
  name: string;
  venue_name: string;
  starts_at: string;
  ends_at: string;
  lobby_opens_at: string;
  lobby_expires_at: string;
  max_capacity: number;
}

export async function keyEvents(db: SupabaseClient, key: ApiKeyRow): Promise<ApiEvent[]> {
  const { data, error } = await db.rpc("api_key_events", { p_key: key.id });
  if (error) throw fromDbError(error.message);
  return (data as ApiEvent[]) ?? [];
}

/** Evento por id o slug, verificando que la clave tenga acceso con ese permiso. */
export async function resolveEvent(db: SupabaseClient, key: ApiKeyRow, idOrSlug: string, scope: ApiScope): Promise<ApiEvent> {
  requireScope(key, scope);
  const events = await keyEvents(db, key);
  const ev = events.find((e) => e.id === idOrSlug || e.slug === idOrSlug.toLowerCase());
  if (!ev) throw new ApiError("event_not_found");
  const { data: ok, error } = await db.rpc("api_authorize", { p_key: key.id, p_event: ev.id, p_scope: scope });
  if (error) throw fromDbError(error.message);
  if (!ok) throw new ApiError("forbidden");
  return ev;
}

export async function codeCounts(db: SupabaseClient, eventId: string) {
  const base = () => db.from("event_invite_codes").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const [total, used, revoked] = await Promise.all([base(), base().eq("is_used", true), base().not("revoked_at", "is", null)]);
  const t = total.count ?? 0;
  const u = used.count ?? 0;
  const r = revoked.count ?? 0;
  return { total: t, unused: t - u - r, used: u, revoked: r };
}

export async function issueCodes(db: SupabaseClient, key: ApiKeyRow, eventId: string, input: IssueInput): Promise<CodeRow[]> {
  const { data, error } = await db.rpc("api_issue_codes", {
    p_key: key.id,
    p_event: eventId,
    p_count: input.count ?? null,
    p_tickets: input.tickets ?? null,
    p_label: input.label ?? null,
  });
  if (error) throw fromDbError(error.message);
  return (data as CodeRow[]) ?? [];
}

const CODE_COLUMNS = "id,code,external_ref,label,is_used,used_at,revoked_at,created_at";

export interface ListQuery {
  status?: CodeStatus;
  external_ref?: string;
  label?: string;
  used_since?: string;
  limit: number;
  cursor: { created_at: string; id: string } | null;
}

export function parseListQuery(sp: URLSearchParams): ListQuery {
  const status = sp.get("status") ?? undefined;
  if (status && !["unused", "used", "revoked"].includes(status)) throw new ApiError("validation_error", "status tiene que ser unused, used o revoked.");
  const limit = sp.get("limit") ? Number(sp.get("limit")) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) throw new ApiError("validation_error", `limit tiene que ser un entero entre 1 y ${MAX_PAGE}.`);
  const usedSince = sp.get("used_since") ?? undefined;
  if (usedSince && Number.isNaN(Date.parse(usedSince))) throw new ApiError("validation_error", "used_since tiene que ser una fecha ISO 8601.");
  return { status: status as CodeStatus | undefined, external_ref: sp.get("external_ref") ?? undefined, label: sp.get("label") ?? undefined, used_since: usedSince, limit, cursor: decodeCursor(sp.get("cursor")) };
}

export async function listCodes(db: SupabaseClient, eventId: string, q: ListQuery): Promise<{ rows: CodeRow[]; next: string | null }> {
  let query = db.from("event_invite_codes").select(CODE_COLUMNS).eq("event_id", eventId);
  if (q.status === "used") query = query.eq("is_used", true);
  if (q.status === "revoked") query = query.not("revoked_at", "is", null);
  if (q.status === "unused") query = query.eq("is_used", false).is("revoked_at", null);
  if (q.external_ref) query = query.eq("external_ref", q.external_ref);
  if (q.label) query = query.eq("label", q.label);
  if (q.used_since) query = query.gte("used_at", new Date(q.used_since).toISOString());
  if (q.cursor) query = query.or(`created_at.gt.${q.cursor.created_at},and(created_at.eq.${q.cursor.created_at},id.gt.${q.cursor.id})`);
  const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(q.limit + 1);
  if (error) throw new ApiError("internal_error");
  const rows = (data as CodeRow[]) ?? [];
  const page = rows.slice(0, q.limit);
  return { rows: page, next: rows.length > q.limit ? encodeCursor(page[page.length - 1]) : null };
}

export async function getCode(db: SupabaseClient, eventId: string, code: string): Promise<CodeRow> {
  if (!CODE_RE.test(code)) throw new ApiError("code_not_found");
  const { data } = await db.from("event_invite_codes").select(CODE_COLUMNS).eq("event_id", eventId).ilike("code", code).maybeSingle();
  if (!data) throw new ApiError("code_not_found");
  return data as CodeRow;
}

export async function revokeCode(db: SupabaseClient, key: ApiKeyRow, eventId: string, code: string): Promise<CodeRow> {
  if (!CODE_RE.test(code)) throw new ApiError("code_not_found");
  const { data, error } = await db.rpc("api_revoke_code", { p_key: key.id, p_event: eventId, p_code: code });
  if (error) throw fromDbError(error.message);
  return data as CodeRow;
}

/** Envoltorio común de cada handler: errores → JSON con código y status. */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (!(e instanceof ApiError)) console.error("[api/v1]", e);
      return errorResponse(e);
    }
  };
}
