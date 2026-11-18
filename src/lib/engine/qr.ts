/**
 * QR dinámicos anti-fraude (TOTP) — reglas PURAS.
 *
 * El pase de entrada, los QR de perks y los vouchers de barra ya no son estáticos: cada 20 s se genera un QR nuevo
 *   ROUGE:T1:<KIND>:<ref>:<paso>:<firma>
 * donde `paso` = floor(t / 20 s) y `firma` = primeros 10 hex de HMAC-SHA256(secreto de la credencial, "KIND:ref:paso").
 * El secreto de la credencial se deriva del secreto del evento (que nunca llega a los asistentes):
 *   secreto(KIND, ref) = HMAC-SHA256(secreto del evento, "KIND:ref")
 * El asistente solo recibe el secreto de SUS credenciales (RPC my_qr_secrets); la puerta y la barra, el del evento
 * (RPC event_qr_secret, para validar sin conexión). Se acepta ±1 paso (desfasaje de reloj de hasta ~20 s).
 * Una captura de pantalla deja de servir en ≤ 40 s, y aun "viva" solo se consume UNA vez (escaneo atómico).
 * Contraparte SQL: qr_credential_secret / verify_dynamic_qr (mismo HMAC con pgcrypto).
 */
import type { RougeState, UUID } from "@/lib/types";
import { hmacHex, safeEqual } from "@/lib/crypto/sha256";

export const QR_STEP_MS = 20_000;
/** Pasos de tolerancia hacia atrás y adelante (relojes de celulares desfasados). */
export const QR_DRIFT_STEPS = 1;
export const QR_PREFIX = "ROUGE:T1:";
const SIG_LEN = 10;

export type QrKind = "PASS" | "PERK" | "ORDER";

export const qrStep = (now = Date.now()) => Math.floor(now / QR_STEP_MS);
/** Segundos que le quedan al QR actual (para el anillo de cuenta regresiva). */
export const qrSecondsLeft = (now = Date.now()) => Math.ceil((QR_STEP_MS - (now % QR_STEP_MS)) / 1000);
/** Avance 0→1 del ciclo actual. */
export const qrProgress = (now = Date.now()) => (now % QR_STEP_MS) / QR_STEP_MS;

export const credentialSecret = (eventSecret: string, kind: QrKind, ref: string) => hmacHex(eventSecret, `${kind}:${ref}`);

const sign = (secret: string, kind: QrKind, ref: string, step: number) => hmacHex(secret, `${kind}:${ref}:${step}`).slice(0, SIG_LEN).toUpperCase();

/** QR vigente de una credencial (lo dibuja el teléfono del asistente). */
export function dynamicQrValue(secret: string, kind: QrKind, ref: string, now = Date.now()): string {
  const step = qrStep(now);
  return `${QR_PREFIX}${kind}:${ref}:${step}:${sign(secret, kind, ref, step)}`;
}

export type QrCheck = { ok: true; kind: QrKind; ref: string; step: number } | { ok: false; reason: "format" | "expired" | "forged" };

export function parseDynamicQr(value: string): { kind: QrKind; ref: string; step: number; sig: string } | null {
  const m = value.trim().match(/^ROUGE:T1:(PASS|PERK|ORDER):([A-Za-z0-9-]{4,64}):(\d{1,12}):([0-9A-Fa-f]{10})$/);
  return m ? { kind: m[1] as QrKind, ref: m[2], step: Number(m[3]), sig: m[4].toUpperCase() } : null;
}

export const isDynamicQr = (value: string) => value.trim().toUpperCase().startsWith(QR_PREFIX);

/** Verifica un QR dinámico contra el secreto del EVENTO (puerta/barra/servidor). */
export function verifyDynamicQr(value: string, eventSecret: string, now = Date.now()): QrCheck {
  const p = parseDynamicQr(value);
  if (!p) return { ok: false, reason: "format" };
  const expected = sign(credentialSecret(eventSecret, p.kind, p.ref), p.kind, p.ref, p.step);
  if (!safeEqual(expected, p.sig)) return { ok: false, reason: "forged" };
  if (Math.abs(qrStep(now) - p.step) > QR_DRIFT_STEPS) return { ok: false, reason: "expired" };
  return { ok: true, kind: p.kind, ref: p.ref, step: p.step };
}

/** QR estático heredado (pase o perk de versiones anteriores, o una captura del código fijo). */
export const isStaticAppQr = (value: string) => /^ROUGE:(PASS|FREE_DRINK|RAFFLE_PRIZE|FAST_PASS|GIFTED_DRINK|ORDER):/i.test(value.trim());

export const QR_REJECT_MESSAGES = {
  format: "No es un QR de ROUGE.",
  expired: "QR vencido: es una captura. Pedile que abra el QR en vivo.",
  forged: "QR falso o adulterado.",
  static: "QR estático: pedile que muestre el QR en vivo de la app.",
} as const;

// ── Secretos en el estado ─────────────────────────────────────────────

/** Secreto del evento disponible en este dispositivo (demo, o staff de puerta/barra en Supabase). */
export const eventQrSecret = (s: RougeState, eventId: UUID): string | null => s.events.find((e) => e.id === eventId)?.qr_secret ?? null;

/** Secreto de MI credencial: el que mandó el servidor, o derivado del del evento (demo). */
export function myCredentialSecret(s: RougeState, eventId: UUID, kind: QrKind, ref: string): string | null {
  const got = (s.qr_secrets ?? []).find((q) => q.event_id === eventId && q.kind === kind && q.ref === ref);
  if (got) return got.secret;
  const ev = eventQrSecret(s, eventId);
  return ev ? credentialSecret(ev, kind, ref) : null;
}
