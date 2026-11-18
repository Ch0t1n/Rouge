/**
 * Verticales de ROUGE: una sola app y un solo motor para fiestas/boliches (ROUGE) y para eventos corporativos,
 * pymes y networking (ROUGE Pro). Todo lo que cambia entre verticales vive ACÁ:
 *
 *  - moods ("Mood de la noche" ⇄ "¿A qué venís hoy?"), filtrados por `events.kind` (⇔ `mood_kind()` en SQL),
 *  - qué perfil se puede usar para entrar (Perfil principal de la noche ⇄ perfil profesional obligatorio),
 *  - funciones que se apagan en corporativo (trago de regalo, RRPP, pedir temas, sorteo por género, edad e Instagram),
 *  - vocabulario de la interfaz (Squad ⇄ Equipo, Match ⇄ Contacto, Line-up ⇄ Agenda…).
 *
 * Regla de privacidad (no negociable): en un evento se ve SOLO la cara con la que la persona entró (`faceOf`).
 * Un perfil de otra vertical nunca se muestra, y si el perfil profesional se borró se muestra una cara neutra
 * (nombre, sin fotos), jamás el Perfil principal de la noche.
 */
import { ATTENDEE_TIERS, BUSINESS_NEEDS, INDUSTRIES, MOOD_TAGS } from "@/lib/types";
import { isBlockedBetween } from "./selectors";
import type { AttendeeTier, BusinessNeed, EventKind, Industry, MoodTag, PersonaPrivacyLevel, Profile, ProfilePersona, RougeEvent, RougeState, UUID } from "@/lib/types";

// ── Configuración por vertical ───────────────────────────────────────

export interface VerticalFeatures {
  /** Géneros musicales, Spotify y afinidad musical en la grilla. */
  musicTaste: boolean;
  /** Pedir tema al DJ y votar. */
  songRequests: boolean;
  /** Adjuntar un trago de regalo al Rompehielos. */
  icebreakerGift: boolean;
  /** RRPP con link y comisión. */
  promoters: boolean;
  /** Sorteo filtrado por género. */
  genderRaffle: boolean;
  /** Edad en las tarjetas y el perfil. */
  showAge: boolean;
  /** @ de Instagram y loop de 5 s en la cara pública. */
  socialMedia: boolean;
  /** Se puede entrar con el Perfil principal (si no, hace falta un perfil de esta vertical). */
  mainProfile: boolean;
}

export interface VerticalCopy {
  /** Submarca visible: "ROUGE" o "ROUGE Pro". */
  brand: string;
  kindLabel: string;
  eventNoun: string;
  enterCta: string;
  moodTitle: string;
  moodQuestion: (firstName: string) => string;
  lobby: string;
  lobbyHint: string;
  match: string;
  matches: string;
  icebreaker: string;
  squad: string;
  lineup: string;
  lineupItem: string;
  lineupArtist: string;
  bar: string;
  ghost: string;
  affinityIcon: string;
  affinityLabel: string;
  profileKind: string;
}

export interface Vertical {
  kind: EventKind;
  features: VerticalFeatures;
  copy: VerticalCopy;
}

export const VERTICALS: Record<EventKind, Vertical> = {
  nightlife: {
    kind: "nightlife",
    features: { musicTaste: true, songRequests: true, icebreakerGift: true, promoters: true, genderRaffle: true, showAge: true, socialMedia: true, mainProfile: true },
    copy: {
      brand: "ROUGE",
      kindLabel: "Noche",
      eventNoun: "fiesta",
      enterCta: "Entrar a la fiesta",
      moodTitle: "Mood de la noche",
      moodQuestion: (n) => `${n}, ¿cómo venís hoy?`,
      lobby: "Lobby",
      lobbyHint: "Ordenados por afinidad musical y mood",
      match: "Match",
      matches: "Matches",
      icebreaker: "Rompehielos",
      squad: "Squad",
      lineup: "Line-up",
      lineupItem: "set",
      lineupArtist: "Artista",
      bar: "Barra Express",
      ghost: "Modo Solo Amigos",
      affinityIcon: "🎵",
      affinityLabel: "afinidad musical",
      profileKind: "perfil de la noche",
    },
  },
  corporate: {
    kind: "corporate",
    features: { musicTaste: false, songRequests: false, icebreakerGift: false, promoters: false, genderRaffle: false, showAge: false, socialMedia: false, mainProfile: false },
    copy: {
      brand: "ROUGE Pro",
      kindLabel: "Corporativo",
      eventNoun: "evento",
      enterCta: "Entrar al evento",
      moodTitle: "¿A qué venís hoy?",
      moodQuestion: (n) => `${n}, ¿a qué venís hoy?`,
      lobby: "Networking",
      lobbyHint: "Ordenados por lo que buscás y lo que ofrecen",
      match: "Contacto",
      matches: "Contactos",
      icebreaker: "Presentación",
      squad: "Equipo",
      lineup: "Agenda",
      lineupItem: "charla",
      lineupArtist: "Charla u orador",
      bar: "Barra y catering",
      ghost: "Modo Solo Contactos",
      affinityIcon: "🤝",
      affinityLabel: "afinidad de negocio",
      profileKind: "perfil profesional",
    },
  },
};

export const vertical = (kind: EventKind | null | undefined): Vertical => VERTICALS[kind ?? "nightlife"] ?? VERTICALS.nightlife;
export const eventKindOf = (s: RougeState, eventId: UUID | null | undefined): EventKind => s.events.find((e) => e.id === eventId)?.kind ?? "nightlife";
export const verticalOf = (s: RougeState, eventId: UUID | null | undefined) => vertical(eventKindOf(s, eventId));
export const hasFeature = (s: RougeState, eventId: UUID | null | undefined, f: keyof VerticalFeatures) => verticalOf(s, eventId).features[f];

/** Mensaje de error cuando una función está apagada en la vertical (⇔ excepción `not_in_vertical` en SQL). */
export const NOT_IN_VERTICAL = "Esta función no está disponible en este tipo de evento.";

// ── Moods ────────────────────────────────────────────────────────────

export type MoodOption = (typeof MOOD_TAGS)[number];
export const moodsFor = (kind: EventKind): MoodOption[] => MOOD_TAGS.filter((m) => m.kind === kind);
/** Vertical de un mood (⇔ `public.mood_kind()`). */
export const moodKind = (mood: MoodTag): EventKind => MOOD_TAGS.find((m) => m.id === mood)?.kind ?? "nightlife";
export const moodOption = (mood: MoodTag | null | undefined) => MOOD_TAGS.find((m) => m.id === mood);
export const checkMoodForEvent = (event: Pick<RougeEvent, "kind">, mood: MoodTag): string | null =>
  moodKind(mood) === (event.kind ?? "nightlife") ? null : "Ese mood no corresponde a este evento: elegí uno de la lista.";

// ── Perfiles (caras) ─────────────────────────────────────────────────

export const PERSONA_LABEL_MAX = 30;
export const JOB_TITLE_MAX = 60;
export const COMPANY_MAX = 60;
export const NEEDS_MAX = 3;
export const MAX_PERSONAS = 5;
/** Bio profesional de la ficha ejecutiva (la de la noche sigue en 160). */
export const PRO_BIO_MAX = 240;
/** Detalle libre de "Qué busco" / "Qué ofrezco". */
export const NEED_NOTE_MAX = 120;
export const WEBSITE_MAX = 200;
export const CONTACT_EMAIL_MAX = 120;
export const DEFAULT_PERSONA_PRIVACY: PersonaPrivacyLevel = "strict";

/** Bio máxima según el tipo de perfil (⇔ check `personas_bio_len_chk`). */
export const personaBioMax = (kind: EventKind) => (kind === "corporate" ? PRO_BIO_MAX : 160);

/** Sitio web: acepta "empresa.com" o "https://empresa.com/x"; lo guarda con https y el dominio en minúsculas (⇔ check). */
export function parseWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v || /\s/.test(v)) return null;
  const m = v.match(/^(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(\/[^\s]*)?$/i);
  if (!m) return null;
  const url = `https://${m[1].toLowerCase()}${(m[2] ?? "").replace(/\/$/, "")}`;
  return url.length <= WEBSITE_MAX ? url : null;
}

/** Email de contacto: minúsculas y formato válido (⇔ check de `profile_personas.contact_email`). */
export function parseContactEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return v.length <= CONTACT_EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

export const tierLabel = (t: AttendeeTier | null | undefined) => ATTENDEE_TIERS.find((x) => x.id === (t ?? "attendee"))?.label ?? "ASISTENTE";

export const industryLabel = (id: Industry | null | undefined) => INDUSTRIES.find((i) => i.id === id)?.label ?? null;
export const needLabel = (id: BusinessNeed) => BUSINESS_NEEDS.find((n) => n.id === id)?.label ?? id;
export const needEmoji = (id: BusinessNeed) => BUSINESS_NEEDS.find((n) => n.id === id)?.emoji ?? "•";

/** LinkedIn: acepta "linkedin.com/in/usuario" con o sin https y lo guarda limpio (⇔ check de `profile_personas`). */
export function parseLinkedin(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(in|company)\/([A-Za-z0-9\-_%.]{2,100})\/?(?:[?#].*)?$/i);
  return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` : null;
}

export const personasOf = (s: RougeState, userId: UUID, kind?: EventKind) =>
  s.profile_personas.filter((p) => p.user_id === userId && (!kind || p.kind === kind));

/** Opción de perfil para entrar a un evento: `null` = Perfil principal (solo noche). */
export type PersonaChoice = ProfilePersona | null;

/** Perfiles con los que `userId` puede entrar a un evento de esta vertical. */
export function personaChoicesFor(s: RougeState, userId: UUID, kind: EventKind): PersonaChoice[] {
  const own = personasOf(s, userId, kind);
  return vertical(kind).features.mainProfile ? [null, ...own] : own;
}

/** Valida el perfil elegido para un evento (⇔ trigger `attendee_persona_chk` + `join_event`). */
export function checkPersonaForEvent(s: RougeState, userId: UUID, event: Pick<RougeEvent, "kind">, personaId: UUID | null): string | null {
  const kind = event.kind ?? "nightlife";
  if (!personaId) return vertical(kind).features.mainProfile ? null : "Para este evento necesitás un perfil profesional.";
  const p = s.profile_personas.find((x) => x.id === personaId);
  if (!p || p.user_id !== userId) return "Ese perfil no existe.";
  if (p.kind !== kind) return "Ese perfil es de otro tipo de evento.";
  return null;
}

/**
 * La cara de una persona en un evento: un `Profile` con los datos del perfil con el que entró.
 * Todo lo que se muestra de otra persona en el contexto de un evento pasa por acá.
 */
export interface Face extends Profile {
  /** Perfil adicional usado en el evento (null = Perfil principal o cara neutra). */
  persona: ProfilePersona | null;
  face_kind: EventKind;
}

export function projectFace(base: Profile, persona: ProfilePersona | null, kind: EventKind): Face {
  if (persona) {
    const pro = persona.kind === "corporate";
    return {
      ...base,
      full_name: persona.display_name || base.full_name,
      bio: persona.bio,
      photos: persona.photos,
      music_genres: pro ? [] : persona.music_genres,
      spotify_embed_url: pro ? null : persona.spotify_embed_url,
      // Instagram y el loop quedan solo en el Perfil principal.
      loop_video_url: null,
      instagram_username: null,
      instagram_verified: false,
      gender: pro ? "undisclosed" : base.gender,
      persona,
      face_kind: persona.kind,
    };
  }
  if (!vertical(kind).features.mainProfile) {
    // Evento corporativo sin perfil profesional (p. ej. lo borró): cara neutra, nunca la de la noche.
    return { ...base, bio: "", photos: [], music_genres: [], spotify_embed_url: null, loop_video_url: null, instagram_username: null, instagram_verified: false, gender: "undisclosed", persona: null, face_kind: kind };
  }
  return { ...base, persona: null, face_kind: kind };
}

/** Cara de `userId` en `eventId` (por defecto, el evento activo), vista por quien usa la app (`current_user_id`). */
export function faceOf(s: RougeState, userId: UUID | null | undefined, eventId: UUID | null | undefined = s.active_event_id): Face | undefined {
  if (!userId) return undefined;
  const base = s.profiles.find((p) => p.id === userId);
  if (!base) return undefined;
  const kind = eventKindOf(s, eventId);
  const att = eventId ? s.event_attendees.find((a) => a.event_id === eventId && a.user_id === userId) : undefined;
  const raw = att?.persona_id ? (s.profile_personas.find((p) => p.id === att.persona_id) ?? null) : null;
  const persona = raw ? sanitizePersonaFor(s, raw, s.current_user_id) : null;
  // Sin perfil profesional (equipo sin fila de asistente, perfil borrado): cara neutra en corporativo.
  return projectFace(base, persona, kind);
}

/** ¿Hubo una reunión aceptada o un contacto aceptado en un evento corporativo entre los dos? (⇔ public.pro_unlocked) */
export function proUnlocked(s: RougeState, viewer: UUID, owner: UUID): boolean {
  const pair = (a: UUID, b: UUID) => (a === viewer && b === owner) || (a === owner && b === viewer);
  return (
    s.meetings.some((m) => m.status === "accepted" && pair(m.requester_id, m.invitee_id)) ||
    s.connections.some((c) => c.status === "accepted" && pair(c.sender_id, c.receiver_id) && eventKindOf(s, c.event_id) === "corporate")
  );
}

/**
 * Perfil adicional tal como lo ve `viewer` (⇔ public.persona_cards): sin el nombre interno; LinkedIn solo tras una
 * reunión o contacto aceptado; empresa y cargo ocultos hasta entonces si su dueño/a lo eligió. Dueño/a y producción de
 * un evento donde se usa ese perfil ven los datos profesionales (CRM). Email y teléfono de contacto: según
 * `privacy_level` (`personaContactVisible`), también para la organización.
 */
export function sanitizePersonaFor(s: RougeState, p: ProfilePersona, viewer: UUID): ProfilePersona {
  if (p.user_id === viewer) return p;
  if (managesPersonaEvent(s, p, viewer)) {
    const contact = personaContactVisible(s, viewer, p);
    return { ...p, label: "", contact_email: contact ? p.contact_email : null, contact_phone: contact ? p.contact_phone : null };
  }
  const unlocked = proUnlocked(s, viewer, p.user_id);
  const hide = s.privacy_settings.find((x) => x.user_id === p.user_id)?.pro_details_after_meeting ?? false;
  const contact = personaContactVisible(s, viewer, p);
  return {
    ...p,
    label: "",
    linkedin_url: unlocked ? p.linkedin_url : null,
    job_title: unlocked || !hide ? p.job_title : "",
    company: unlocked || !hide ? p.company : "",
    contact_email: contact ? p.contact_email : null,
    contact_phone: contact ? p.contact_phone : null,
  };
}

/** ¿Gestiona (dueño/a o producción) un evento donde se usa este perfil? */
function managesPersonaEvent(s: RougeState, p: ProfilePersona, viewer: UUID) {
  return s.event_attendees.some(
    (a) =>
      a.persona_id === p.id &&
      (s.events.find((e) => e.id === a.event_id)?.created_by === viewer ||
        s.event_staff.some((r) => r.event_id === a.event_id && r.user_id === viewer && (r.role === "owner" || r.role === "manager"))),
  );
}

/**
 * ¿`viewer` puede ver el email y el teléfono de contacto de este perfil? (⇔ public.persona_contact_visible)
 *  - siempre tras una reunión aceptada o un contacto aceptado entre los dos (intercambio aprobado);
 *  - `network`: además quien asiste a un evento donde se usa este perfil (y puede ver a su dueño/a);
 *  - `public`: además el equipo y la organización de esos eventos.
 * Nunca con bloqueo de por medio.
 */
export function personaContactVisible(s: RougeState, viewer: UUID, p: ProfilePersona): boolean {
  if (p.user_id === viewer) return true;
  if (!p.contact_email && !p.contact_phone) return false;
  if (isBlockedBetween(s, viewer, p.user_id)) return false;
  if (proUnlocked(s, viewer, p.user_id)) return true;
  const level = p.privacy_level ?? DEFAULT_PERSONA_PRIVACY;
  if (level === "strict") return false;
  const uses = s.event_attendees.filter((a) => a.persona_id === p.id);
  const attends = uses.some((a) => s.event_attendees.some((v) => v.event_id === a.event_id && v.user_id === viewer));
  if (attends) return true;
  if (level !== "public") return false;
  return managesPersonaEvent(s, p, viewer) || uses.some((a) => s.event_staff.some((r) => r.event_id === a.event_id && r.user_id === viewer && r.role !== "promoter"));
}

/** Línea corta de la cara profesional: "Cargo · Empresa". */
export const proHeadline = (p: Pick<ProfilePersona, "job_title" | "company"> | null | undefined) =>
  p ? [p.job_title, p.company].filter(Boolean).join(" · ") : "";

// ── Afinidad de negocio (corporativo) ────────────────────────────────

/** Lo que cada uno puede OFRECER (nadie "ofrece clientes": un cliente es quien busca lo que vos ofrecés). */
export const OFFERABLE_NEEDS = BUSINESS_NEEDS.filter((n) => n.id !== "clients");

/** Lo que `a` gana de `b`: lo que busca y `b` ofrece, + "clientes" si `b` busca algo que `a` ofrece, + "socios" si ambos buscan socios. */
function gainsOf(a: ProfilePersona, b: ProfilePersona): BusinessNeed[] {
  const out = new Set<BusinessNeed>(a.looking_for.filter((n) => b.offering.includes(n)));
  if (a.looking_for.includes("clients") && b.looking_for.some((n) => a.offering.includes(n))) out.add("clients");
  if (a.looking_for.includes("partners") && b.looking_for.includes("partners")) out.add("partners");
  return [...out];
}

const sideScore = (gains: number) => (gains === 0 ? 0 : gains === 1 ? 0.7 : 1);

/**
 * 0-1 (⇔ `public.business_affinity` en SQL). Complementariedad (75 %): para cada lado que busca algo, cuánto obtiene
 * del otro (1 cosa = 0,7; 2 o más = 1), promediado entre los lados que buscan. Rubro en común: 25 %.
 */
export function businessAffinity(a: ProfilePersona | null | undefined, b: ProfilePersona | null | undefined): { score: number; matched: BusinessNeed[] } {
  if (!a || !b) return { score: 0, matched: [] };
  const ga = gainsOf(a, b);
  const gb = gainsOf(b, a);
  const sides = [a.looking_for.length ? sideScore(ga.length) : null, b.looking_for.length ? sideScore(gb.length) : null].filter((x): x is number => x !== null);
  const complement = sides.length ? sides.reduce((x, y) => x + y, 0) / sides.length : 0;
  const sameIndustry = a.industry && a.industry === b.industry ? 1 : 0;
  return { score: 0.75 * complement + 0.25 * sameIndustry, matched: [...new Set([...ga, ...gb])] };
}
