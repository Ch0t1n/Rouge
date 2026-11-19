/**
 * Privacidad por contexto — reglas PURAS (espejo de profile_access / profile_cards / persona_cards en schema.sql).
 *
 *  - PublicProfileCard: lo que se puede ver de otra persona. Nunca teléfono, email, fecha de nacimiento (solo edad)
 *    ni historial de eventos. El @usuario y las fotos del Perfil principal solo si esa persona se mostró con él en un
 *    evento de noche que compartimos (nivel "full"); si solo compartimos otro contexto, solo el nombre ("name").
 *  - PrivateUserProfile: la propia cuenta (teléfono, fecha de nacimiento, ajustes): solo para su dueño/a.
 *  - Ajustes de la cuenta (`privacy_settings`): incógnito por defecto, pin solo para el Squad, datos profesionales
 *    ocultos hasta una reunión o contacto aceptado.
 */
import type { PrivacySettings, Profile, RougeState, UUID } from "@/lib/types";
import { ageFrom } from "@/lib/utils";
import { canSeeAttendee, getEvent, isBlockedBetween, isEventStaff } from "./selectors";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };

export const DEFAULT_PRIVACY: Omit<PrivacySettings, "user_id" | "updated_at"> = {
  incognito_default: false,
  pin_share_matches: true,
  pro_details_after_meeting: false,
};

export const PIN_SQUAD_ONLY = "Elegiste compartir tu ubicación solo con tu Squad: sacá a los matches o cambialo en Privacidad.";

export function privacyOf(s: RougeState, userId: UUID): PrivacySettings {
  return s.privacy_settings.find((p) => p.user_id === userId) ?? { user_id: userId, updated_at: new Date(0).toISOString(), ...DEFAULT_PRIVACY };
}

export type PrivacyPatch = Partial<Pick<PrivacySettings, "incognito_default" | "pin_share_matches" | "pro_details_after_meeting">>;

/** Guarda los ajustes de privacidad de la cuenta (⇔ upsert en privacy_settings con RLS propia). */
export function updatePrivacySettings(s: RougeState, userId: UUID, patch: PrivacyPatch, now = Date.now()): R<PrivacySettings> {
  if (!s.profiles.some((p) => p.id === userId)) return { ok: false, error: "Primero creá tu perfil." };
  const next: PrivacySettings = { ...privacyOf(s, userId), ...patch, user_id: userId, updated_at: new Date(now).toISOString() };
  return { ok: true, state: { ...s, privacy_settings: [...s.privacy_settings.filter((p) => p.user_id !== userId), next] }, data: next };
}

/** Nivel de acceso al perfil de otra persona (⇔ public.profile_access). */
export type ProfileAccess = "full" | "name" | null;

export function profileAccess(s: RougeState, viewer: UUID, target: UUID): ProfileAccess {
  if (viewer === target) return "full";
  if (s.user_blocks.some((b) => b.blocker_id === viewer && b.blocked_user_id === target)) return "name";
  if (isBlockedBetween(s, viewer, target)) return null;
  const nightlife = (eventId: UUID) => (getEvent(s, eventId)?.kind ?? "nightlife") === "nightlife";
  // Se mostró con su Perfil principal en un evento de noche donde lo puedo ver.
  if (s.event_attendees.some((a) => a.user_id === target && !a.persona_id && nightlife(a.event_id) && canSeeAttendee(s, a.event_id, viewer, target))) return "full";
  const pair = (a: UUID, b: UUID) => (a === viewer && b === target) || (a === target && b === viewer);
  const usedPersonaIn = (eventId: UUID) => s.event_attendees.some((a) => a.event_id === eventId && a.user_id === target && !!a.persona_id);
  if (s.connections.some((c) => c.status === "accepted" && pair(c.sender_id, c.receiver_id) && nightlife(c.event_id) && !usedPersonaIn(c.event_id))) return "full";
  // Cualquier otro contexto compartido: solo el nombre.
  if (s.event_attendees.some((a) => a.user_id === target && canSeeAttendee(s, a.event_id, viewer, target))) return "name";
  if (s.connections.some((c) => c.status === "accepted" && pair(c.sender_id, c.receiver_id))) return "name";
  if (s.meetings.some((m) => pair(m.requester_id, m.invitee_id))) return "name";
  const inEvent = (eventId: UUID) => s.event_attendees.some((a) => a.event_id === eventId && a.user_id === viewer) || isEventStaff(s, eventId, viewer);
  if (s.event_staff.some((r) => r.user_id === target && inEvent(r.event_id))) return "name";
  if (s.events.some((e) => e.created_by === target && inEvent(e.id))) return "name";
  if (s.event_bans.some((b) => b.user_id === target && isEventStaff(s, b.event_id, viewer))) return "name";
  const mySquads = new Set(s.squad_members.filter((m) => m.user_id === viewer).map((m) => m.squad_id));
  if (s.squad_members.some((m) => m.user_id === target && mySquads.has(m.squad_id))) return "name";
  return null;
}

/** Tarjeta pública según el nivel (⇔ public.profile_cards): sin fecha de nacimiento ni teléfono. */
export function publicCard(p: Profile, level: Exclude<ProfileAccess, null>): Profile {
  const age = p.age ?? (p.birth_date ? ageFrom(p.birth_date) : null);
  if (level === "full") return { ...p, birth_date: null, age, phone_normalized: null };
  return {
    ...p,
    username: "",
    birth_date: null,
    age: null,
    gender: "undisclosed",
    phone_normalized: null,
    bio: "",
    photos: [],
    loop_video_url: null,
    music_genres: [],
    spotify_embed_url: null,
    instagram_username: null,
    instagram_verified: false,
  };
}

/** Edad para mostrar: la que calculó el servidor o, para la propia cuenta / demo, desde la fecha. */
export const ageOf = (p: Pick<Profile, "birth_date"> & { age?: number | null }): number | null => p.age ?? (p.birth_date ? ageFrom(p.birth_date) : null);

/** Link al perfil de otra persona: por @usuario si se puede ver, si no por id (nunca se expone el @ en corporativo). */
export const profileHref = (p: Pick<Profile, "id" | "username">, eventId?: UUID | null) =>
  `/u/${encodeURIComponent(p.username || p.id)}${eventId ? `?e=${eventId}` : ""}`;
