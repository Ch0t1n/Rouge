/**
 * Marca y personalización (logo + colores) — reglas PURAS.
 *
 * Los colores de una marca reemplazan dos tokens del sistema de diseño:
 *   primario → `rouge` (botones, matches, chat)  ·  acento → `vip` (barra, perks, Mesa VIP)
 * El cian del Squad y el rojo del rescate 🚨 (`sos`) NO se personalizan: son señales de seguridad.
 *
 * Para que nada quede ilegible, cada color pasa un control de contraste (WCAG) contra el fondo
 * Obsidian (#070709) y contra el texto que va encima (blanco sobre el primario, negro sobre el acento).
 * Contraparte SQL: el check de brands/events (`is_hex_color`) y las mismas reglas en upsert_brand.
 */
import type { Brand, RougeEvent, RougeState, UUID } from "@/lib/types";
import { uid } from "@/lib/utils";

export const ROUGE_PRIMARY = "#FF1E56";
export const ROUGE_ACCENT = "#FFB800";
const SQUAD = "#00F0FF";
const BACKGROUND = "#070709";
export const BRAND_NAME_MAX = 40;

export interface ThemeColors {
  primary: string;
  accent: string;
}

/** Tema resuelto de un evento: lo que ve el asistente. */
export interface EventTheme extends ThemeColors {
  logo_url: string | null;
  brand_name: string | null;
  /** true si algún color difiere de los de ROUGE. */
  custom: boolean;
}

/** Paletas sugeridas: todas pasan los controles de contraste (ver branding.test). */
export const PRIMARY_PRESETS: { name: string; hex: string }[] = [
  { name: "Rouge", hex: ROUGE_PRIMARY },
  { name: "Magenta", hex: "#D946EF" },
  { name: "Violeta", hex: "#8B5CF6" },
  { name: "Azul eléctrico", hex: "#2F6BFF" },
  { name: "Esmeralda", hex: "#059669" },
  { name: "Naranja", hex: "#F2541B" },
];

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Oro", hex: ROUGE_ACCENT },
  { name: "Lima", hex: "#C6FF3D" },
  { name: "Rosa", hex: "#FF8FD8" },
  { name: "Durazno", hex: "#FFA94D" },
  { name: "Lavanda", hex: "#C4B5FD" },
  { name: "Hielo", hex: "#E2E8F0" },
];

// ── Color ─────────────────────────────────────────────────────────────

/** "#abc", "abc", "#AABBCC" → "#AABBCC" (null si no es un color hex válido). */
export function normalizeHex(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) return `#${v.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = normalizeHex(hex) ?? "#000000";
  return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Luminancia relativa WCAG 2.x (0 = negro, 1 = blanco). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): { h: number; s: number } {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s };
}

/** Muy parecido al cian del Squad: en el plano no se distinguirían amigos de matches. */
function looksLikeSquad(hex: string): boolean {
  const a = hue(hex);
  const b = hue(SQUAD);
  const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  return a.s > 0.35 && dh < 22;
}

/** Variante más oscura para :hover (mismo criterio que rouge → rouge-hover). */
export function hoverShade(hex: string): string {
  return toHex(hexToRgb(hex).map((c) => c * 0.88));
}

/** "#FF1E56" → "255 30 86" (formato de las variables CSS de Tailwind: rgb(var(--c-rouge) / <alpha>)). */
export const rgbChannels = (hex: string) => hexToRgb(hex).join(" ");

/**
 * Valida un color de marca. Devuelve el motivo si no sirve (para mostrarlo ANTES de guardar).
 *  - primario: botones con texto blanco → contraste ≥ 3 con blanco y ≥ 3 con el fondo.
 *  - acento: botones con texto oscuro y textos dorados sobre el fondo → contraste ≥ 4,5 con el fondo.
 */
export function checkBrandColor(raw: string, kind: "primary" | "accent"): string | null {
  const hex = normalizeHex(raw);
  if (!hex) return "Usá un color en formato #RRGGBB.";
  if (looksLikeSquad(hex)) return "Es muy parecido al cian del Squad: en el plano no se distinguiría. Probá otro tono.";
  if (kind === "primary") {
    if (contrastRatio(hex, BACKGROUND) < 3) return "Es muy oscuro: casi no se ve sobre el fondo negro. Probá uno más vivo.";
    if (contrastRatio(hex, "#FFFFFF") < 3) return "Es muy claro para botones con texto blanco. Usalo como color de acento o probá uno más intenso.";
  } else if (contrastRatio(hex, BACKGROUND) < 4.5) {
    return "Es muy oscuro para el acento: los precios y perks no se leerían. Probá uno más claro.";
  }
  return null;
}

// ── Selectores ────────────────────────────────────────────────────────

export const getBrand = (s: RougeState, brandId: UUID | null | undefined): Brand | undefined => (brandId ? s.brands.find((b) => b.id === brandId) : undefined);

export const brandOfEvent = (s: RougeState, eventId: UUID | null | undefined): Brand | undefined => getBrand(s, s.events.find((e) => e.id === eventId)?.brand_id);

/** Marcas que administro (las mías). */
export const myBrands = (s: RougeState, userId: UUID = s.current_user_id) => s.brands.filter((b) => b.owner_id === userId);

/** Tema de un evento: colores propios → los de su marca → los de ROUGE. Logo: el del evento → el de la marca. */
export function resolveTheme(event: Pick<RougeEvent, "logo_url" | "theme_primary" | "theme_accent"> | null | undefined, brand?: Pick<Brand, "name" | "logo_url" | "primary_color" | "accent_color"> | null): EventTheme {
  const primary = normalizeHex(event?.theme_primary) ?? normalizeHex(brand?.primary_color) ?? ROUGE_PRIMARY;
  const accent = normalizeHex(event?.theme_accent) ?? normalizeHex(brand?.accent_color) ?? ROUGE_ACCENT;
  return {
    primary,
    accent,
    logo_url: event?.logo_url ?? brand?.logo_url ?? null,
    brand_name: brand?.name ?? null,
    custom: primary !== ROUGE_PRIMARY || accent !== ROUGE_ACCENT,
  };
}

export const eventTheme = (s: RougeState, eventId: UUID | null | undefined): EventTheme => resolveTheme(s.events.find((e) => e.id === eventId), brandOfEvent(s, eventId));

/** Variables CSS que aplican un tema (ver globals.css y tailwind.config.ts). */
export function themeVars(t: ThemeColors): Record<string, string> {
  return {
    "--c-rouge": rgbChannels(t.primary),
    "--c-rouge-hover": rgbChannels(hoverShade(t.primary)),
    "--c-vip": rgbChannels(t.accent),
    "--c-vip-hover": rgbChannels(hoverShade(t.accent)),
  };
}

// ── Acciones ──────────────────────────────────────────────────────────

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export interface BrandInput {
  id?: UUID;
  name: string;
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
}

/** Crea o edita una marca propia. Espejo de la RPC upsert_brand. */
export function upsertBrand(state: RougeState, userId: UUID, input: BrandInput, now = Date.now()): R<Brand> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > BRAND_NAME_MAX) return fail(`El nombre de la marca tiene que tener entre 2 y ${BRAND_NAME_MAX} caracteres.`);
  const existing = input.id ? getBrand(state, input.id) : undefined;
  if (input.id && existing && existing.owner_id !== userId) return fail("Solo quien creó la marca puede editarla.");
  const colors: Partial<Brand> = {};
  for (const [key, kind] of [["primary_color", "primary"], ["accent_color", "accent"]] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (raw === null || raw === "") colors[key] = null;
    else {
      const err = checkBrandColor(raw, kind);
      if (err) return fail(err);
      colors[key] = normalizeHex(raw);
    }
  }
  const brand: Brand = {
    ...(existing ?? { id: input.id ?? uid(), owner_id: userId, logo_url: null, primary_color: null, accent_color: null, payments_enabled: false, created_at: new Date(now).toISOString() }),
    name,
    ...(input.logo_url !== undefined ? { logo_url: input.logo_url || null } : {}),
    ...colors,
  } as Brand;
  return { ok: true, state: { ...state, brands: existing ? state.brands.map((b) => (b.id === brand.id ? brand : b)) : [...state.brands, brand] }, data: brand };
}

/**
 * Valida la personalización de un evento (la llama upsertEvent): la marca tiene que ser de quien creó
 * el evento y los colores propios pasan los mismos controles que los de la marca.
 */
export function checkEventBranding(state: RougeState, creatorId: UUID | null, input: Partial<Pick<RougeEvent, "brand_id" | "theme_primary" | "theme_accent">>): string | null {
  if (input.brand_id) {
    const b = getBrand(state, input.brand_id);
    if (!b || b.owner_id !== creatorId) return "Esa marca no es de quien creó el evento.";
  }
  if (input.theme_primary && checkBrandColor(input.theme_primary, "primary")) return `Color principal: ${checkBrandColor(input.theme_primary, "primary")}`;
  if (input.theme_accent && checkBrandColor(input.theme_accent, "accent")) return `Color de acento: ${checkBrandColor(input.theme_accent, "accent")}`;
  return null;
}
