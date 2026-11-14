import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** UUID v4 (usa crypto nativo cuando está disponible). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para dictar en la puerta

/** Código corto legible (para entradas de 1 uso, squads y retiro QR). */
export function shortCode(length = 6, prefix = ""): string {
  let out = "";
  const bytes =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint8Array(length))
      : Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return prefix ? `${prefix}-${out}` : out;
}

/**
 * Normaliza un teléfono a E.164. Por defecto asume Argentina (+54) y
 * agrega el 9 de celulares, que es como WhatsApp los identifica.
 * Clave para el bloqueo preventivo: "11 2233-4455", "+54 9 11 2233 4455"
 * y "011 15 2233-4455" deben producir el mismo valor.
 */
export function normalizePhone(raw: string, defaultCountry = "54"): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else {
    digits = digits.replace(/^0/, ""); // prefijo troncal local
    digits = defaultCountry + digits;
  }

  if (digits.startsWith("54")) {
    let national = digits.slice(2).replace(/^0/, "");
    if (national.startsWith("9")) national = national.slice(1);
    // Quita el "15" de celulares viejos: 11 15 2233 4455 → 11 2233 4455
    const m = national.match(/^(\d{2,4})15(\d{6,8})$/);
    if (m && (m[1] + m[2]).length === 10) national = m[1] + m[2];
    if (national.length !== 10) return null;
    return `+549${national}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function whatsappLink(phoneE164: string, text?: string) {
  const n = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function ageFrom(birthDate: string, now = new Date()): number {
  const b = new Date(birthDate);
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export const minutes = (n: number) => n * 60_000;
export const hours = (n: number) => n * 3_600_000;

export function addMs(iso: string | Date, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

/** "Expira en 12 min" / "hace 3 min" */
export function relativeMinutes(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
