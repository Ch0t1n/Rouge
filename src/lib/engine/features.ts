/**
 * Módulos por evento (Feature Flags) — reglas PURAS.
 *
 * Cada evento prende o apaga módulos completos de ROUGE (entradas, RRPP, lobby social, chat, Squads, plano, barra…).
 * La app entera se adapta: navegación (BottomNav / sidebar), rutas (se redirige a /app), acciones del motor (y sus RPCs
 * en SQL vía `event_feature`) y secciones del panel del dueño/a.
 *
 *   - `resolveFeatures` aplica las DEPENDENCIAS (ej. regalar un trago en el chat exige Barra y Chat): un flag cuya
 *     dependencia está apagada queda apagado, siempre, en el cliente y en el servidor.
 *   - Un evento sin configuración (`features = null`, eventos anteriores a v1.8) tiene TODO prendido.
 * Contraparte SQL: events.features (jsonb) + public.event_feature(evento, flag) (mismas dependencias).
 */
import type { RougeEvent, RougeState, UUID } from "@/lib/types";

export interface EventFeatureFlags {
  // Acceso y puerta
  enableTicketing: boolean;
  enableRrpp: boolean;
  enableFreeCutoffConversion: boolean;
  // Social y conexiones
  enableSocialLobby: boolean;
  enableDirectChat: boolean;
  enableLiveWall: boolean;
  enablePostPartyRecap: boolean;
  // Grupos y mapa
  enableSquads: boolean;
  enableSquadBillSplit: boolean;
  enableVenueMap: boolean;
  // Consumo, barra y beneficios
  enableSmartBar: boolean;
  enableChatDrinkGifting: boolean;
  enablePerks: boolean;
}

export type FeatureKey = keyof EventFeatureFlags;

export type FeatureCategory = "access" | "social" | "squads" | "bar";

export const FEATURE_CATEGORIES: { id: FeatureCategory; label: string; emoji: string }[] = [
  { id: "access", label: "Acceso y puerta", emoji: "🚪" },
  { id: "social", label: "Social y conexiones", emoji: "💘" },
  { id: "squads", label: "Grupos y mapa", emoji: "👯" },
  { id: "bar", label: "Consumo, barra y beneficios", emoji: "🍸" },
];

export interface FeatureMeta {
  key: FeatureKey;
  category: FeatureCategory;
  label: string;
  description: string;
  /** Todos estos tienen que estar prendidos para que este funcione. */
  requires: FeatureKey[];
}

export const FEATURES: FeatureMeta[] = [
  { key: "enableTicketing", category: "access", label: "Entradas y puerta", description: "Códigos de 1 uso, pases QR en vivo y escáner de puerta (/ops/door).", requires: [] },
  { key: "enableRrpp", category: "access", label: "RRPP", description: "Links de públicas, atribución de invitados y liquidación de comisiones.", requires: [] },
  { key: "enableFreeCutoffConversion", category: "access", label: "Listas free con horario", description: "Pasada la hora límite, la puerta cobra el diferencial.", requires: ["enableTicketing"] },
  { key: "enableSocialLobby", category: "social", label: "Lobby social", description: "Grilla por afinidad, mood, Conectar, Rompehielos y matches.", requires: [] },
  { key: "enableDirectChat", category: "social", label: "Chat 1 a 1", description: "Bandeja y chats entre matches.", requires: [] },
  { key: "enableLiveWall", category: "social", label: "Pantalla LED", description: "Pantalla gigante en vivo para proyectar en el lugar.", requires: [] },
  { key: "enablePostPartyRecap", category: "social", label: "Rouge Wrapped", description: "Resumen de la noche para Stories y 24 h de after para escribirse.", requires: [] },
  { key: "enableSquads", category: "squads", label: "Squads", description: "Grupos, chat grupal, Punto Base y botón de Rescate.", requires: [] },
  { key: "enableSquadBillSplit", category: "squads", label: "Cuentas y Vaquita VIP", description: "División de gastos de la mesa y Mesa VIP dividida.", requires: ["enableSquads"] },
  { key: "enableVenueMap", category: "squads", label: "Plano del lugar", description: "Plano con pines de 15 min y sectores.", requires: [] },
  { key: "enableSmartBar", category: "bar", label: "Barra Express", description: "Carta digital, pedidos desde el celular y comandas (/ops/bar).", requires: [] },
  { key: "enableChatDrinkGifting", category: "bar", label: "Regalar tragos en el chat", description: "Invitar un trago por QR desde el chat 1 a 1.", requires: ["enableSmartBar", "enableDirectChat"] },
  { key: "enablePerks", category: "bar", label: "Perks y QR Drops", description: "Drops de QR, sorteos y beneficios canjeables.", requires: [] },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);
export const featureMeta = (k: FeatureKey) => FEATURES.find((f) => f.key === k)!;

const all = (v: boolean) => Object.fromEntries(FEATURE_KEYS.map((k) => [k, v])) as unknown as EventFeatureFlags;

/** Todo prendido: lo que tienen los eventos anteriores a los módulos. */
export const ALL_FEATURES: EventFeatureFlags = all(true);

export type FeaturePresetId = "full" | "ticketing_door" | "bar_drops" | "social_bar" | "private";

export const FEATURE_PRESETS: { id: FeaturePresetId; label: string; emoji: string; description: string; flags: EventFeatureFlags }[] = [
  { id: "full", label: "Fiesta Completa", emoji: "🎉", description: "Todo activo.", flags: ALL_FEATURES },
  {
    id: "ticketing_door",
    label: "Solo Ticketera + Puerta",
    emoji: "🎟️",
    description: "Entradas, RRPP, listas free y escáner. Sin lobby, chat ni barra.",
    flags: { ...all(false), enableTicketing: true, enableRrpp: true, enableFreeCutoffConversion: true },
  },
  {
    id: "bar_drops",
    label: "Solo Barra Express + QR Drops",
    emoji: "🍸",
    description: "Pedidos sin fila, comandas y beneficios por QR.",
    flags: { ...all(false), enableSmartBar: true, enablePerks: true },
  },
  {
    id: "social_bar",
    label: "Bar / Previa Social",
    emoji: "🥂",
    description: "Lobby, chat, Squads y barra. Sin entradas ni puerta.",
    flags: { ...all(true), enableTicketing: false, enableRrpp: false, enableFreeCutoffConversion: false, enableLiveWall: false },
  },
  {
    id: "private",
    label: "Evento Privado / Corporativo",
    emoji: "🏢",
    description: "Entradas nominales, Squads, plano y barra. Sin lobby de citas ni RRPP.",
    flags: { ...all(true), enableRrpp: false, enableFreeCutoffConversion: false, enableSocialLobby: false, enableDirectChat: false, enableChatDrinkGifting: false, enableLiveWall: false, enablePostPartyRecap: false },
  },
];

/**
 * Normaliza un conjunto de flags (parcial o de una versión vieja) y aplica las dependencias: lo que depende de un
 * módulo apagado queda apagado. Idempotente.
 */
export function resolveFeatures(input: Partial<EventFeatureFlags> | null | undefined): EventFeatureFlags {
  const out = { ...ALL_FEATURES, ...(input ?? {}) } as EventFeatureFlags;
  for (const k of FEATURE_KEYS) out[k] = out[k] === true;
  // Una pasada alcanza porque las dependencias no se encadenan; se repite por si en el futuro lo hacen.
  for (let i = 0; i < 3; i++) for (const f of FEATURES) if (f.requires.some((r) => !out[r])) out[f.key] = false;
  return out;
}

/** Prende/apaga un módulo. Al prender, también prende sus dependencias (UI: "esto necesita Barra y Chat"). */
export function toggleFeature(flags: EventFeatureFlags, key: FeatureKey, on: boolean): EventFeatureFlags {
  const next = { ...flags, [key]: on };
  if (on) for (const r of featureMeta(key).requires) next[r] = true;
  return resolveFeatures(next);
}

/** Flags efectivos de un evento (sin configurar → todo prendido). */
export const featuresOfEvent = (ev: Pick<RougeEvent, "features"> | null | undefined): EventFeatureFlags => resolveFeatures(ev?.features ?? null);

export function eventFeatures(s: RougeState, eventId: UUID | null | undefined): EventFeatureFlags {
  return featuresOfEvent(s.events.find((e) => e.id === eventId));
}

export const featureOn = (s: RougeState, eventId: UUID | null | undefined, key: FeatureKey) => eventFeatures(s, eventId)[key];

/** Preset que coincide exactamente con estos flags (o null = configuración personalizada). */
export function matchingPreset(flags: EventFeatureFlags): FeaturePresetId | null {
  const r = resolveFeatures(flags);
  return FEATURE_PRESETS.find((p) => FEATURE_KEYS.every((k) => resolveFeatures(p.flags)[k] === r[k]))?.id ?? null;
}

export const FEATURE_DISABLED = "Esta función no está activa en este evento.";

// ── Rutas ────────────────────────────────────────────────────────────

/** Qué módulo exige cada ruta (app del asistente, plataforma operativa y panel). */
export const ROUTE_FEATURES: [string, FeatureKey[]][] = [
  ["/lobby", ["enableSocialLobby"]],
  ["/inbox", ["enableDirectChat"]],
  ["/chat", ["enableDirectChat"]],
  ["/map", ["enableVenueMap"]],
  ["/squad/cuentas", ["enableSquads", "enableSquadBillSplit"]],
  ["/squad", ["enableSquads"]],
  ["/bar", ["enableSmartBar"]],
  ["/perks", ["enablePerks"]],
  ["/wrapped", ["enablePostPartyRecap"]],
  ["/ops/door", ["enableTicketing"]],
  ["/ops/bar", ["enableSmartBar"]],
  ["/admin/door", ["enableTicketing"]],
  ["/admin/print-codes", ["enableTicketing"]],
  ["/admin/bar-pos", ["enableSmartBar"]],
  ["/admin/print-ticket", ["enableSmartBar"]],
  ["/admin/menu", ["enableSmartBar"]],
  ["/admin/rrpp", ["enableRrpp"]],
  ["/admin/live-wall", ["enableLiveWall"]],
  ["/admin/perks", ["enablePerks"]],
];

export function featuresForPath(pathname: string): FeatureKey[] {
  const hit = ROUTE_FEATURES.find(([p]) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")));
  return hit?.[1] ?? [];
}

/** ¿La ruta está habilitada con estos módulos? (Las rutas sin módulo asociado siempre lo están.) */
export const isPathEnabled = (flags: EventFeatureFlags, pathname: string) => featuresForPath(pathname).every((k) => flags[k]);

/** Filtra una lista de items de navegación por los módulos del evento. */
export const enabledNav = <T extends { href: string }>(items: readonly T[], flags: EventFeatureFlags): T[] => items.filter((i) => isPathEnabled(flags, i.href));
