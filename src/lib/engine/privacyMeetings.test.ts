/**
 * Privacidad por contexto (profile_access / persona_cards / can_see_attendee) y reuniones 1 a 1
 * (request/respond/reschedule/cancel_meeting, spot_busy): invariantes que el SQL exige igual.
 */
import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import * as MT from "./meetings";
import { privacyOf, profileAccess, publicCard, updatePrivacySettings } from "./privacy";
import { canSeeAttendee, visibleAttendees } from "./selectors";
import { faceOf, sanitizePersonaFor } from "./verticals";

const NOW = Date.now();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = DEMO_IDS.me;
const NIGHT = DEMO_IDS.event;
const PRO = DEMO_IDS.proEvent;
const seed = () => createSeedState(NOW);
const asUser = (s: RougeState, u: string) => ({ ...s, current_user_id: u });
const slot = (s: RougeState, eventId: string, minutes = 30) => MT.meetingSlots(s.events.find((e) => e.id === eventId)!, NOW, minutes).find((x) => !x.now)!.value;

describe("privacidad del Perfil principal", () => {
  it("full solo si se mostró con su Perfil principal en un evento de noche compartido; si no, solo el nombre", () => {
    const s = seed();
    expect(profileAccess(s, ME, id(2))).toBe("full"); // Cami: fiesta, perfil principal
    expect(profileAccess(s, ME, id(21))).toBe("name"); // Carla: solo el encuentro pyme (perfil profesional)
    expect(profileAccess(s, ME, DEMO_IDS.bartender)).toBe("name"); // equipo del evento
    expect(profileAccess(s, id(21), id(2))).toBeNull(); // sin ningún contexto compartido
    // Lista negra por teléfono: nunca se revela si ese número tiene cuenta (ni para quien bloqueó).
    expect(profileAccess(s, ME, id(13))).toBeNull();
    expect(profileAccess(s, id(13), ME)).toBeNull();
    // Bloqueo por perfil: quien bloqueó ve solo el nombre en su lista; la otra persona, nada.
    const b = A.blockUser(s, ME, id(2));
    if (!b.ok) throw new Error(b.error);
    expect(profileAccess(b.state, ME, id(2))).toBe("name");
    expect(profileAccess(b.state, id(2), ME)).toBeNull();
  });

  it("la tarjeta pública nunca trae fecha de nacimiento ni teléfono, y con nivel 'name' tampoco @ ni fotos", () => {
    const sofi = seed().profiles.find((p) => p.id === ME)!;
    const full = publicCard(sofi, "full");
    expect(full.birth_date).toBeNull();
    expect(full.phone_normalized).toBeNull();
    expect(full.age).toBeGreaterThanOrEqual(18);
    const name = publicCard(sofi, "name");
    expect(name).toMatchObject({ username: "", photos: [], music_genres: [], instagram_username: null, age: null, bio: "" });
  });

  it("en modo incógnito no aparece en la grilla salvo para su Squad y sus matches", () => {
    const s = seed();
    // Valentina (9) está en Modo Solo Amigos: no la ve Sofi en la grilla.
    expect(visibleAttendees(s, NIGHT, ME).some((g) => g.profile.id === id(9))).toBe(false);
    expect(canSeeAttendee(s, NIGHT, ME, id(9))).toBe(false);
    // Mateo es match de Sofi: aunque se ponga incógnito, ella lo sigue viendo (asistencia), no en la grilla.
    const g = A.updateAttendeeSettings(s, NIGHT, id(5), { ghost_mode: true });
    expect(g.ok && canSeeAttendee(g.state, NIGHT, ME, id(5))).toBe(true);
  });

  it("networking solo para acreditados: sin pasar por la puerta no se ve ni se conecta", () => {
    let s = seed();
    s = { ...s, events: s.events.map((e) => (e.id === NIGHT ? { ...e, networking_checkin_only: true } : e)) };
    // Joaquín (8) no pasó por la puerta.
    expect(canSeeAttendee(s, NIGHT, ME, id(8))).toBe(false);
    expect(A.sendConnection(s, NIGHT, id(8), id(2))).toMatchObject({ ok: false, error: A.CHECKIN_REQUIRED });
    // Cami (2) sí: la ve Sofi (también acreditada).
    expect(canSeeAttendee(s, NIGHT, ME, id(2))).toBe(true);
  });

  it("incógnito por defecto y pin solo para el Squad", () => {
    let s = seed();
    const r = updatePrivacySettings(s, id(3), { incognito_default: true, pin_share_matches: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(privacyOf(s, id(3)).incognito_default).toBe(true);
    // Juli entra al encuentro pyme (con perfil profesional nuevo) y queda incógnita.
    const p = A.upsertPersona(s, id(3), { kind: "corporate", company: "Paz", looking_for: ["clients"], offering: ["marketing"] });
    if (!p.ok) throw new Error(p.error);
    const j = A.joinEvent(p.state, id(3), "PYME26", "pro_networking", NOW, p.data.id);
    expect(j.ok && j.state.event_attendees.find((a) => a.event_id === PRO && a.user_id === id(3))?.ghost_mode).toBe(true);
    // Pin con un match: rechazado (solo Squad).
    expect(A.dropPin(s, NIGHT, id(3), { x: 10, y: 70, shareWithSquad: true, matchIds: [id(7)] })).toMatchObject({ ok: false });
    expect(A.dropPin(s, NIGHT, id(3), { x: 10, y: 70, shareWithSquad: true, matchIds: [] }).ok).toBe(true);
  });

  it("datos profesionales: LinkedIn solo tras contacto o reunión aceptada; empresa oculta si así lo eligió", () => {
    const s = seed();
    const sofiPro = s.profile_personas.find((p) => p.id === DEMO_IDS.mePro)!;
    // Carla es contacto aceptado de Sofi en el encuentro: ve su LinkedIn.
    expect(sanitizePersonaFor(s, sofiPro, id(21)).linkedin_url).toBe(sofiPro.linkedin_url);
    // Laura (24) no tiene contacto con Sofi: sin LinkedIn y sin el nombre interno del perfil.
    const laura = sanitizePersonaFor(s, sofiPro, id(24));
    expect(laura.linkedin_url).toBeNull();
    expect(laura.label).toBe("");
    expect(laura.company).toBe("Estudio Benítez"); // Sofi no ocultó empresa/cargo
    // Melina eligió mostrar empresa y cargo solo después de una reunión: Sofi (pedido pendiente) no los ve.
    const meli = faceOf(s, id(4), PRO)!;
    expect(meli.persona?.company).toBe("");
    expect(meli.persona?.job_title).toBe("");
    expect(meli.persona?.looking_for.length).toBeGreaterThan(0); // lo que busca/ofrece sí (afinidad)
    // La dueña del evento (CRM) ve todo.
    expect(sanitizePersonaFor(s, s.profile_personas.find((p) => p.user_id === id(4))!, DEMO_IDS.organizer).company).toBe("Duarte & Asoc.");
  });
});

describe("reuniones 1 a 1", () => {
  it("corporativo: pedir, aceptar (abre chat y reserva la sala) y cupo de la sala", () => {
    let s = seed();
    const at = slot(s, PRO);
    const sala1 = id(18001);
    const r = MT.requestMeeting(s, PRO, id(24), id(25), { topic: "Programa de mentoría", startsAt: at, duration: 30, location: { kind: "spot", spotId: sala1 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    // Quien pidió no puede aceptar su propia propuesta.
    expect(MT.respondMeeting(s, r.data.id, id(24), true)).toMatchObject({ ok: false });
    const acc = MT.respondMeeting(s, r.data.id, id(25), true, undefined, NOW);
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    s = acc.state;
    const conn = s.connections.find((c) => c.id === acc.data.connection_id)!;
    expect(conn.status).toBe("accepted");
    expect(s.messages.some((m) => m.connection_id === conn.id && m.message_type === "system_alert" && m.content.includes("Sala 1"))).toBe(true);
    // Sala 1 (cupo 1) queda ocupada en ese horario para otra pareja.
    const other = MT.requestMeeting(s, PRO, id(22), id(23), { topic: "Logística", startsAt: at, duration: 15, location: { kind: "spot", spotId: sala1 } });
    expect(other).toEqual({ ok: false, error: MT.MEETING_ERRORS.spot_busy });
    // Y la agenda de Laura ya tiene ese horario.
    expect(MT.requestMeeting(s, PRO, id(24), id(23), { topic: "Otra", startsAt: at, duration: 15, location: { kind: "tbd" } })).toEqual({ ok: false, error: MT.MEETING_ERRORS.time_conflict });
  });

  it("noche: punto de encuentro solo con matches", () => {
    const s = seed();
    const at = slot(s, NIGHT, 15);
    expect(MT.requestMeeting(s, NIGHT, ME, id(11), { topic: "Barra", startsAt: at, duration: 15, location: { kind: "tbd" } })).toEqual({ ok: false, error: MT.MEETING_ERRORS.match_required });
    // Cami ↔ Nico son match: sí.
    expect(MT.requestMeeting(s, NIGHT, id(2), id(11), { topic: "Nos vemos en el patio", startsAt: at, duration: 15, location: { kind: "pin", x: 14, y: 70 } }).ok).toBe(true);
  });

  it("valida horario dentro del evento, duración, pin dentro del plano y duplicados", () => {
    const s = seed();
    const ev = s.events.find((e) => e.id === PRO)!;
    const base = { topic: "x", duration: 15 as const, location: { kind: "tbd" as const } };
    expect(MT.requestMeeting(s, PRO, id(24), id(25), { ...base, startsAt: new Date(+new Date(ev.ends_at) + 60_000).toISOString() })).toEqual({ ok: false, error: MT.MEETING_ERRORS.invalid_time });
    expect(MT.requestMeeting(s, PRO, id(24), id(25), { ...base, startsAt: new Date(NOW - 3_600_000).toISOString() })).toEqual({ ok: false, error: MT.MEETING_ERRORS.invalid_time });
    expect(MT.requestMeeting(s, PRO, id(24), id(25), { ...base, startsAt: slot(s, PRO), location: { kind: "pin", x: 120, y: 5 } })).toEqual({ ok: false, error: MT.MEETING_ERRORS.invalid_pin });
    // Ya hay un pedido pendiente entre Ezequiel y Sofi.
    expect(MT.requestMeeting(s, PRO, ME, id(22), { ...base, startsAt: slot(s, PRO) })).toEqual({ ok: false, error: MT.MEETING_ERRORS.meeting_pending });
    // "Ahora" está disponible porque el encuentro está en curso.
    expect(MT.meetingSlots(ev, NOW)[0].now).toBe(true);
  });

  it("reprogramar pasa el turno a la otra persona; cancelar y estados derivados", () => {
    let s = seed();
    const m = s.meetings.find((x) => x.id === id(19002))!; // Carla ↔ Sofi, aceptada
    // Un horario más tarde (Sofi tiene otra reunión confirmada en la fiesta en el primer cuarto de hora: no se superpone).
    const later = MT.meetingSlots(s.events.find((e) => e.id === PRO)!, NOW, 15).filter((x) => !x.now)[4].value;
    const re = MT.rescheduleMeeting(s, m.id, ME, { startsAt: later, duration: 15, location: { kind: "spot", spotId: id(18004) } });
    if (!re.ok) throw new Error(re.error);
    expect(re.ok && re.data.status).toBe("rescheduled");
    if (!re.ok) return;
    s = re.state;
    expect(MT.awaitsMe(re.data, id(21))).toBe(true);
    expect(MT.awaitsMe(re.data, ME)).toBe(false);
    expect(MT.cancelMeeting(s, m.id, id(21)).ok).toBe(true);
    // La de Mateo y Joaquín ya terminó: completada.
    expect(MT.displayStatus(s.meetings.find((x) => x.id === id(19004))!, NOW)).toBe("completed");
  });

  it("aceptar algo 'a definir' permite elegir el lugar; borrar una sala con reuniones no", () => {
    const s = seed();
    const tbd = s.meetings.find((x) => x.id === id(19003))!; // Sofi → Joaquín, a definir
    const r = MT.respondMeeting(s, tbd.id, id(8), true, { kind: "spot", spotId: id(18005) }, NOW);
    expect(r.ok && r.data.location_kind).toBe("spot");
    expect(MT.deleteVenueSpot(s, id(18003))).toMatchObject({ ok: false }); // Sala 3 tiene la reunión de Carla
    expect(MT.deleteVenueSpot(s, id(18001)).ok).toBe(true);
    expect(MT.upsertVenueSpot(s, PRO, { name: "Sala 1", kind: "room", capacity: 1, coord_x: null, coord_y: null })).toMatchObject({ ok: false });
    expect(MT.upsertVenueSpot(s, PRO, { name: "Sala 9", kind: "room", capacity: 0, coord_x: null, coord_y: null })).toMatchObject({ ok: false });
  });

  it("el demo es coherente: ninguna reunión confirmada se superpone en la agenda de nadie", () => {
    const s = seed();
    for (const m of s.meetings.filter((x) => x.status === "accepted")) {
      expect(MT.hasConflict(s, m.requester_id, m.starts_at, m.duration_min, m.id)).toBe(false);
      expect(MT.hasConflict(s, m.invitee_id, m.starts_at, m.duration_min, m.id)).toBe(false);
    }
    // Y el pedido pendiente de Ezequiel se puede aceptar.
    expect(MT.respondMeeting(s, id(19001), ME, true, undefined, NOW).ok).toBe(true);
  });

  it("bloqueo: no hay reuniones con alguien bloqueado ni se listan", () => {
    const s = seed();
    const b = A.blockUser(asUser(s, ME), ME, id(21));
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(MT.meetingsOf(b.state, ME, PRO).some((m) => m.requester_id === id(21) || m.invitee_id === id(21))).toBe(false);
    expect(MT.meetingEligibility(b.state, PRO, ME, id(21))).toBe("Este perfil no está disponible.");
  });
});
