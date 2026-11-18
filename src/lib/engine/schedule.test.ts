import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as SC from "./schedule";
import { NOT_IN_VERTICAL } from "./verticals";

const NOW = Date.now();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PRO = DEMO_IDS.proEvent;
const ME = DEMO_IDS.me;
const S = { keynote: id(21001), live: id(21002), lead: id(21003), export: id(21004), panel: id(21005), workshop: id(21006) };
const s0 = (): RougeState => ({ ...createSeedState(NOW), active_event_id: PRO });
const ok = <T,>(r: { ok: true; state: RougeState; data: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const get = (s: RougeState, sid: string) => SC.getSession(s, sid)!;
const today = (s: RougeState) => get(s, S.live).day;

describe("horarios de la agenda (hora local del evento, UTC-3)", () => {
  it("convierte día + HH:MM ⇄ instante y detecta superposiciones", () => {
    expect(SC.localToMs("2030-03-10", "14:30")).toBe(Date.parse("2030-03-10T17:30:00Z"));
    expect(SC.localParts(Date.parse("2030-03-11T02:15:00Z"))).toEqual({ day: "2030-03-10", time: "23:15" });
    const a = { day: "2030-03-10", start_time: "14:30", end_time: "15:15" };
    expect(SC.sessionsOverlap(a, { day: "2030-03-10", start_time: "15:00", end_time: "16:00" })).toBe(true);
    expect(SC.sessionsOverlap(a, { day: "2030-03-10", start_time: "15:15", end_time: "16:00" })).toBe(false); // termina justo cuando empieza
    expect(SC.sessionsOverlap(a, { day: "2030-03-11", start_time: "14:30", end_time: "15:15" })).toBe(false);
    expect(SC.durationLabel({ start_time: "14:30", end_time: "15:15" })).toBe("45 min");
    expect(SC.durationLabel({ start_time: "09:00", end_time: "10:30" })).toBe("1 h 30");
    expect(SC.isValidDay("2030-02-30")).toBe(false);
    expect(SC.isValidTime("24:00")).toBe(false);
  });

  it("la charla sembrada en vivo está ocurriendo ahora y la keynote ya pasó", () => {
    const s = s0();
    expect(SC.sessionPhase(get(s, S.live), NOW)).toBe("now");
    expect(SC.sessionPhase(get(s, S.keynote), NOW)).toBe("past");
    expect(SC.liveSessions(s, PRO).map((x) => x.id)).toEqual([S.live]);
  });
});

describe("gestión de la agenda (organización)", () => {
  const base = (s: RougeState): SC.SessionInput => ({ title: "Ciberseguridad para pymes", track: "Tecnología & IA", room_name: "Sala 1", day: today(s), start_time: "00:00", end_time: "00:45" });

  it("valida título, horario, días del evento, pin del plano y oradores", () => {
    const s = s0();
    expect(SC.upsertSession(s, PRO, { ...base(s), title: "IA" })).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_title });
    expect(SC.upsertSession(s, PRO, { ...base(s), end_time: "00:00" })).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_session_time });
    expect(SC.upsertSession(s, PRO, { ...base(s), day: "2001-01-01" })).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.outside_event });
    expect(SC.upsertSession(s, PRO, { ...base(s), spot_id: id(18011) })).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_session_spot }); // pin de la fiesta
    expect(SC.upsertSession(s, PRO, { ...base(s), speakers: [{ name: "" }] })).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_speaker });
    expect(SC.upsertSession(s, DEMO_IDS.event, { ...base(s) })).toMatchObject({ ok: false, error: NOT_IN_VERTICAL });
  });

  it("dos charlas a la vez en distintas salas sí; en la misma sala no", () => {
    const s = s0();
    const live = get(s, S.live);
    const parallel = SC.upsertSession(s, PRO, { ...base(s), room_name: "Sala 1", start_time: live.start_time, end_time: live.end_time });
    expect(parallel.ok).toBe(true);
    const clash = SC.upsertSession(s, PRO, { ...base(s), room_name: "auditorio principal", start_time: live.start_time, end_time: live.end_time });
    expect(clash).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.room_busy });
  });

  it("la sala se toma del pin del plano si no se escribe y la edición conserva el contador", () => {
    const s = s0();
    const r = ok(SC.upsertSession(s, PRO, { ...base(s), room_name: "", spot_id: id(18016), start_time: "00:00", end_time: "00:30", capacity: 10, speakers: [{ name: "Ana Paz", role: "CEO", company: "Nube" }] }));
    expect(r.data).toMatchObject({ room_name: "Aula Taller", spot_id: id(18016), enrolled_count: 0, is_live_now: false });
    expect(r.data.speakers[0]).toEqual({ user_id: null, name: "Ana Paz", role: "CEO", company: "Nube", avatar_url: null });
    const lead = get(s, S.lead);
    const edit = ok(SC.upsertSession(s, PRO, { ...lead, title: "Liderar equipos que crecen" }));
    expect(edit.data.enrolled_count).toBe(lead.enrolled_count);
    expect(SC.upsertSession(s, PRO, { ...lead, capacity: 5 })).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.capacity_below_enrolled });
  });

  it("borrar una charla se lleva agenda, preguntas y encuestas", () => {
    const r = ok(SC.deleteSession(s0(), S.live));
    expect(r.state.session_questions.some((q) => q.session_id === S.live)).toBe(false);
    expect(r.state.session_polls.some((p) => p.session_id === S.live)).toBe(false);
    expect(r.state.session_enrollments.some((e) => e.session_id === S.live)).toBe(false);
    expect(r.state.session_question_authors.length).toBe(0);
  });

  it("terminar el en vivo cierra la encuesta abierta", () => {
    const r = ok(SC.setSessionLive(s0(), S.live, false));
    expect(r.data.is_live_now).toBe(false);
    expect(SC.openPoll(r.state, S.live)).toBeUndefined();
  });
});

describe("Mi Agenda", () => {
  it("avisa superposiciones con el nombre y la hora de la otra charla", () => {
    const s = s0();
    const conflicts = SC.agendaConflicts(s, ME, get(s, S.export));
    expect(conflicts.map((x) => x.id)).toEqual([S.panel]);
    expect(SC.conflictMessage(conflicts[0])).toBe(`Se superpone con «${conflicts[0].title}» a las ${conflicts[0].start_time} hs`);
  });

  it("confirmar deja las dos; reemplazar saca la otra y ajusta los contadores", () => {
    const s = s0();
    const both = ok(SC.enrollSession(s, ME, S.export, [], NOW));
    expect(SC.myAgendaIds(both.state, ME, PRO)).toEqual(new Set([S.live, S.panel, S.export]));
    const swap = ok(SC.enrollSession(s, ME, S.export, [S.panel], NOW));
    expect(swap.data.replaced).toEqual([S.panel]);
    expect(SC.myAgendaIds(swap.state, ME, PRO)).toEqual(new Set([S.live, S.export]));
    expect(get(swap.state, S.panel).enrolled_count).toBe(get(s, S.panel).enrolled_count - 1);
    expect(get(swap.state, S.export).enrolled_count).toBe(get(s, S.export).enrolled_count + 1);
  });

  it("respeta el cupo, no agenda charlas terminadas, es idempotente y exige estar en el evento", () => {
    const s = s0();
    expect(SC.enrollSession(s, ME, S.workshop, [], NOW)).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.session_full });
    expect(SC.enrollSession(s, ME, S.keynote, [], NOW)).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.session_over });
    const again = ok(SC.enrollSession(s, ME, S.live, [], NOW));
    expect(get(again.state, S.live).enrolled_count).toBe(get(s, S.live).enrolled_count);
    expect(SC.enrollSession(s, DEMO_IDS.organizer, S.live, [], NOW)).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.agenda_not_attendee });
    const out = ok(SC.unenrollSession(s, ME, S.panel));
    expect(out.data.enrolled_count).toBe(get(s, S.panel).enrolled_count - 1);
  });

  it("filtros por día, sala, track y solo Mi Agenda", () => {
    const s = s0();
    expect(SC.filterSessions(s, PRO, ME, { mineOnly: true }).map((x) => x.id).sort()).toEqual([S.live, S.panel].sort());
    expect(SC.filterSessions(s, PRO, ME, { room: "Sala Directorio B" }).map((x) => x.id)).toEqual([S.lead, S.export]);
    expect(SC.filterSessions(s, PRO, ME, { track: "Liderazgo" }).every((x) => x.track === "Liderazgo")).toBe(true);
    const f = SC.scheduleFacets(SC.sessionsOf(s, PRO));
    expect(f.tracks).toEqual(["Liderazgo", "Negocios & Finanzas", "Tecnología & IA"]);
    expect(SC.trackTone(f.tracks, "Liderazgo")).toBe("cobalt");
  });
});

describe("Q&A en vivo", () => {
  it("ordena destacada, abiertas por votos y respondidas; la oculta solo para la moderación", () => {
    const s = s0();
    const attendee = SC.questionsFor(s, S.live, ME, false);
    expect(attendee[0].is_featured).toBe(true);
    expect(attendee.map((q) => q.status)).toEqual(["open", "open", "open", "answered"]);
    expect(attendee.slice(1, 3).map((q) => q.upvotes)).toEqual([17, 9]);
    expect(SC.questionsFor(s, S.live, ME, true)).toHaveLength(5);
  });

  it("anónima no firma; con nombre firma con la cara profesional del evento", () => {
    const s = s0();
    const anon = ok(SC.askQuestion(s, ME, S.live, "¿Qué modelo usan?", true));
    expect(anon.data).toMatchObject({ is_anonymous: true, author_label: null });
    expect(SC.isMyQuestion(anon.state, ME, anon.data.id)).toBe(true);
    const named = ok(SC.askQuestion(s, ME, S.live, "¿Y en el agro?", false));
    expect(named.data.author_label).toBe(SC.authorLabel(s, PRO, ME));
    expect(named.data.author_label).toContain("·");
  });

  it("solo con la charla en vivo, con largo válido y hasta 5 abiertas por persona", () => {
    const s = s0();
    expect(SC.askQuestion(s, ME, S.panel, "¿Hay grabación?", false)).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.not_live });
    expect(SC.askQuestion(s, ME, S.live, "ok", false)).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_question });
    let st = s;
    for (let i = 0; i < 4; i++) st = ok(SC.askQuestion(st, ME, S.live, `Pregunta número ${i}`, true)).state; // + la sembrada = 5
    expect(SC.askQuestion(st, ME, S.live, "Una más", true)).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.too_many_questions });
  });

  it("votar ▲ suma y resta; nunca a la propia ni a una oculta", () => {
    const s = s0();
    const q2 = id(21102);
    const up = ok(SC.toggleQuestionVote(s, ME, q2));
    expect(up.data).toEqual({ voted: true, upvotes: 18 });
    expect(ok(SC.toggleQuestionVote(up.state, ME, q2)).data).toEqual({ voted: false, upvotes: 17 });
    expect(SC.toggleQuestionVote(s, ME, id(21103))).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.own_question });
    expect(SC.toggleQuestionVote(s, ME, id(21105))).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.question_not_found });
  });

  it("moderación: una sola destacada, respondida deja de estar destacada, ocultar y reabrir", () => {
    const s = s0();
    const f = ok(SC.moderateQuestion(s, id(21102), "feature"));
    expect(f.state.session_questions.filter((q) => q.session_id === S.live && q.is_featured).map((q) => q.id)).toEqual([id(21102)]);
    const a = ok(SC.moderateQuestion(f.state, id(21102), "answer"));
    expect(a.data).toMatchObject({ status: "answered", is_featured: false });
    expect(a.data.answered_at).not.toBeNull();
    expect(ok(SC.moderateQuestion(a.state, id(21102), "hide")).data.status).toBe("hidden");
    expect(ok(SC.moderateQuestion(a.state, id(21102), "reopen")).data).toMatchObject({ status: "open", answered_at: null });
  });
});

describe("encuestas en vivo", () => {
  it("un voto por persona, cambiable mientras está abierta; porcentajes que suman 100", () => {
    const s = s0();
    const poll = id(21201);
    const v1 = ok(SC.votePoll(s, ME, poll, "o3"));
    expect(v1.data.results.o3).toBe(53);
    const v2 = ok(SC.votePoll(v1.state, ME, poll, "o1"));
    expect(v2.data.results).toMatchObject({ o1: 19, o3: 52 });
    expect(SC.myPollVote(v2.state, ME, poll)).toBe("o1");
    expect(SC.votePoll(s, ME, poll, "o9")).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_option });
    expect(SC.votePoll(s, ME, id(21202), "o1")).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.poll_closed });
    const t = SC.pollTotals(v2.data);
    expect(t.total).toBe(118);
    expect(t.rows.reduce((a, r) => a + r.pct, 0)).toBe(100);
    expect(SC.pollTotals({ options: [{ id: "a", label: "A" }], results: {} }).rows[0].pct).toBe(0);
  });

  it("lanzar valida opciones y cierra la anterior; sin en vivo no se lanza", () => {
    const s = s0();
    expect(SC.launchPoll(s, S.live, "¿Sirvió?", ["Sí", "sí"])).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_poll });
    expect(SC.launchPoll(s, S.live, "¿Sirvió?", ["Sí"])).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.invalid_poll });
    const r = ok(SC.launchPoll(s, S.live, "¿Te sirvió la charla?", ["Mucho", " Algo ", "", "Poco"]));
    expect(r.data.options).toEqual([{ id: "o1", label: "Mucho" }, { id: "o2", label: "Algo" }, { id: "o3", label: "Poco" }]);
    expect(r.state.session_polls.filter((p) => p.session_id === S.live && p.status === "open").map((p) => p.id)).toEqual([r.data.id]);
    expect(SC.launchPoll(s, S.panel, "¿Sirvió?", ["Sí", "No"])).toMatchObject({ ok: false, error: SC.SCHEDULE_ERRORS.not_live });
  });
});
