/**
 * Tipo de evento: fiesta / boliche ("nightlife") o evento corporativo ("corporate").
 *
 * La mecánica es la misma (lobby, conexiones, Squad, plano, barra, perks, LED); cambian:
 *  - los moods del check-in (`moodsFor`),
 *  - la base de la afinidad (géneros musicales ↔ áreas e intereses, ver affinity.ts),
 *  - el vocabulario de la interfaz (`copyFor`): "Match" → "Contacto", "Line-up" → "Agenda"…
 *
 * Contraparte SQL: `events.event_type` (check) y los valores de `mood_tag_t`.
 */
import { MOOD_TAGS, EVENT_TYPES, type EventType, type MoodTag, type RougeEvent } from "@/lib/types";

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string; emoji: string }[] = [
  { value: "nightlife", label: "Fiesta / boliche", emoji: "🪩" },
  { value: "corporate", label: "Corporativo", emoji: "💼" },
];

/** Tipo de un evento (los eventos viejos, sin la columna, son fiestas). */
export const eventTypeOf = (e?: Pick<RougeEvent, "event_type"> | null): EventType =>
  e && (EVENT_TYPES as readonly string[]).includes(e.event_type) ? e.event_type : "nightlife";

export const isEventType = (v: unknown): v is EventType => typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);

export type MoodMeta = (typeof MOOD_TAGS)[number];

/** Moods que se ofrecen en un tipo de evento (el check-in y los filtros). */
export const moodsFor = (type: EventType): MoodMeta[] => MOOD_TAGS.filter((m) => m.for === type);

/** Datos de un mood (cualquier tipo: un asistente puede traer un mood de otra edición). */
export const moodMeta = (id: MoodTag | null | undefined): MoodMeta | undefined => MOOD_TAGS.find((m) => m.id === id);

export interface EventCopy {
  /** "esta noche" / "hoy" */
  today: string;
  moodTitle: string;
  moodQuestion: string;
  moodHint: string;
  lineup: string;
  /** Prefijo del banner con lo que pasa ahora. */
  nowLabel: string;
  lineupSoon: string;
  slotLabel: string;
  slotsEmpty: string;
  addSlot: string;
  headliner: string;
  match: string;
  matches: string;
  matchTitle: string;
  noMatches: string;
  affinityEmoji: string;
  affinityLabel: string;
  tagsTitle: string;
  gridTitle: string;
  gridHint: string;
  ghostHint: string;
}

const COPY: Record<EventType, EventCopy> = {
  nightlife: {
    today: "esta noche",
    moodTitle: "Mood de la noche",
    moodQuestion: "¿Cómo venís ahora?",
    moodHint: "Tu mood se ve en tu tarjeta y ajusta la afinidad.",
    lineup: "Line-up",
    nowLabel: "🔊 En cabina:",
    lineupSoon: "🔊 La cabina abre pronto",
    slotLabel: "Artista",
    slotsEmpty: "Sin sets todavía.",
    addSlot: "Agregar set",
    headliner: "Headliner",
    match: "Match",
    matches: "Matches",
    matchTitle: "¡Es un Match!",
    noMatches: "Todavía no tenés matches. Cuando alguien te conecte de vuelta, aparece acá para siempre.",
    affinityEmoji: "🎵",
    affinityLabel: "afinidad musical",
    tagsTitle: "Género musical",
    gridTitle: "Afines a vos esta noche",
    gridHint: "Ordenado por afinidad musical, mood y actividad reciente.",
    ghostHint: "Ideal si estás en pareja o venís a bailar con tu Squad.",
  },
  corporate: {
    today: "hoy",
    moodTitle: "Qué venís a buscar",
    moodQuestion: "¿Qué venís a buscar hoy?",
    moodHint: "Se ve en tu tarjeta y ordena a quién te conviene conocer.",
    lineup: "Agenda",
    nowLabel: "🎤 Ahora:",
    lineupSoon: "🎤 La agenda arranca pronto",
    slotLabel: "Charla o actividad",
    slotsEmpty: "Sin actividades todavía.",
    addSlot: "Agregar actividad",
    headliner: "Destacada",
    match: "Contacto",
    matches: "Contactos",
    matchTitle: "¡Nuevo contacto!",
    noMatches: "Todavía no tenés contactos. Cuando alguien te conecte de vuelta, aparece acá para siempre.",
    affinityEmoji: "🤝",
    affinityLabel: "intereses en común",
    tagsTitle: "Áreas e intereses",
    gridTitle: "Gente para conocer hoy",
    gridHint: "Ordenado por intereses en común, qué viene a buscar cada uno y actividad reciente.",
    ghostHint: "Ideal si hoy solo querés estar con tu equipo.",
  },
};

export const copyFor = (type: EventType): EventCopy => COPY[type];
