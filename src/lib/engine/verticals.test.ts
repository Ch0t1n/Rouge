/**
 * Verticales (noche / corporativo) y perfiles adicionales: invariantes que también exige schema.sql
 * (join_event, tg_attendee_vertical, events_kind_locked, profile_personas, delete_persona).
 */
import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS, CORPORATE_MENU, BAR_MENU } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as A from "./actions";
import { ensurePromoterLink } from "./promoters";
import { lobbyGrid } from "./grid";
import { matchesOf } from "./selectors";
import { businessAffinity, checkMoodForEvent, faceOf, moodsFor, NOT_IN_VERTICAL, parseLinkedin, personaChoicesFor, verticalOf } from "./verticals";
import { syncDemoMenu } from "./eventAdmin";

const NOW = Date.now();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = DEMO_IDS.me;
const NIGHT = DEMO_IDS.event;
const PRO = DEMO_IDS.proEvent;
const seed = () => createSeedState(NOW);
const asOrganizer = (s: RougeState) => ({ ...s, current_user_id: DEMO_IDS.organizer });

describe("vertical del evento", () => {
  it("el demo tiene una fiesta y un evento corporativo en vivo", () => {
    const s = seed();
    expect(verticalOf(s, NIGHT).kind).toBe("nightlife");
    expect(verticalOf(s, PRO).copy.brand).toBe("ROUGE Pro");
  });

  it("cada vertical tiene sus moods y no se cruzan", () => {
    expect(moodsFor("corporate").every((m) => m.id.startsWith("pro_"))).toBe(true);
    expect(moodsFor("nightlife").some((m) => m.id.startsWith("pro_"))).toBe(false);
    expect(checkMoodForEvent({ kind: "nightlife" }, "pro_selling")).toBeTruthy();
    expect(checkMoodForEvent({ kind: "corporate" }, "after_hunt")).toBeTruthy();
    expect(checkMoodForEvent({ kind: "corporate" }, "pro_coffee")).toBeNull();
  });

  it("no se puede entrar con un mood de otra vertical ni cambiarlo después", () => {
    const s = seed();
    expect(A.joinEvent(s, ME, "PYME26", "after_hunt", NOW, DEMO_IDS.mePro)).toMatchObject({ ok: false });
    expect(A.joinEvent(s, ME, "BRESH26", "pro_selling", NOW)).toMatchObject({ ok: false });
    expect(A.updateAttendeeSettings(s, PRO, ME, { mood_tag: "just_dance" })).toMatchObject({ ok: false });
    expect(A.updateAttendeeSettings(s, PRO, ME, { mood_tag: "pro_coffee" }).ok).toBe(true);
  });

  it("el tipo de evento no cambia una vez que entró gente", () => {
    const s = asOrganizer(seed());
    const ev = s.events.find((e) => e.id === PRO)!;
    expect(A.upsertEvent(s, { ...ev, kind: "nightlife" })).toMatchObject({ ok: false });
    const fresh = A.upsertEvent(s, { name: "Feria de exportadores", kind: "corporate", starts_at: new Date(NOW + 864e5).toISOString(), ends_at: new Date(NOW + 9e7).toISOString() });
    expect(fresh.ok && fresh.data.kind).toBe("corporate");
    expect(fresh.ok && fresh.data.venue_layout_json.sectors.some((x) => x.kind === "stage")).toBe(true);
    if (fresh.ok) expect(A.upsertEvent(fresh.state, { ...fresh.data, kind: "nightlife" }).ok).toBe(true); // sin asistentes, sí
  });

  it("en corporativo se apagan trago de regalo, pedidos de temas, sorteo por género y RRPP", () => {
    const s = seed();
    expect(A.sendIcebreaker(s, PRO, id(24), id(25), { message: "Hola", giftDrinkItemId: "cafe" })).toEqual({ ok: false, error: NOT_IN_VERTICAL });
    expect(A.requestSong(s, PRO, ME, "Tema", "X")).toEqual({ ok: false, error: NOT_IN_VERTICAL });
    expect(A.createRaffle(s, PRO, "Premio", "female")).toEqual({ ok: false, error: NOT_IN_VERTICAL });
    expect(A.createRaffle(s, PRO, "Premio", "all").ok).toBe(true);
    const withPromoter = { ...s, event_staff: [...s.event_staff, { event_id: PRO, user_id: DEMO_IDS.promoter, role: "promoter" as const, created_at: "" }] };
    expect(ensurePromoterLink(withPromoter, PRO, DEMO_IDS.promoter, DEMO_IDS.organizer)).toEqual({ ok: false, error: NOT_IN_VERTICAL });
    // La noche sigue igual
    expect(A.requestSong(s, NIGHT, ME, "Tema nuevo", "X").ok).toBe(true);
  });
});

describe("perfiles adicionales: una cuenta, varias caras", () => {
  it("en corporativo hace falta un perfil profesional propio; en la noche alcanza el principal", () => {
    const s = seed();
    const carla = id(21);
    // Juli (3) no tiene perfil profesional: no puede entrar al encuentro con su perfil principal.
    expect(A.joinEvent(s, id(3), "PYME26", "pro_networking", NOW, null)).toMatchObject({ ok: false, error: "Para este evento necesitás un perfil profesional." });
    expect(A.joinEvent(s, id(3), "PYME26", "pro_networking", NOW, id(1900 + 21))).toMatchObject({ ok: false }); // el de Carla no es suyo
    expect(personaChoicesFor(s, id(3), "corporate")).toEqual([]);
    expect(personaChoicesFor(s, ME, "nightlife")[0]).toBeNull(); // Perfil principal
    expect(personaChoicesFor(s, ME, "corporate").map((p) => p?.id)).toEqual([DEMO_IDS.mePro]);
    // Un perfil profesional no sirve para la noche.
    expect(A.joinEvent(s, ME, "BRESH26", "with_friends", NOW, DEMO_IDS.mePro)).toMatchObject({ ok: false, error: "Ese perfil es de otro tipo de evento." });
    expect(carla).toBeTruthy();
  });

  it("crear un perfil profesional y entrar con él", () => {
    let s = seed();
    const r = A.upsertPersona(s, id(3), { kind: "corporate", label: "Trabajo", job_title: "Community manager", company: "Agencia Paz", looking_for: ["clients"], offering: ["marketing"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const j = A.joinEvent(s, id(3), "PYME26", "pro_selling", NOW, r.data.id);
    expect(j.ok).toBe(true);
    if (!j.ok) return;
    const face = faceOf(j.state, id(3), PRO)!;
    expect(face.persona?.company).toBe("Agencia Paz");
    expect(face.music_genres).toEqual([]);
  });

  it("valida el perfil profesional (cargo o empresa, busca/ofrece, LinkedIn, máximos)", () => {
    const s = seed();
    expect(A.upsertPersona(s, ME, { kind: "corporate", looking_for: ["clients"] })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { kind: "corporate", company: "X" })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { kind: "corporate", company: "X", looking_for: ["clients", "partners", "talent", "investment"] })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { kind: "corporate", company: "X", offering: ["software"], linkedin_url: "facebook.com/x" })).toMatchObject({ ok: false });
    expect(A.upsertPersona(s, ME, { id: DEMO_IDS.mePro, kind: "nightlife" })).toMatchObject({ ok: false }); // no se cambia el tipo
    expect(parseLinkedin("linkedin.com/in/sofia-benitez/")).toBe("https://www.linkedin.com/in/sofia-benitez");
    expect(parseLinkedin("https://ar.linkedin.com/company/logix")).toBe("https://www.linkedin.com/company/logix");
    let st = s;
    for (let i = 0; i < 4; i++) {
      const r = A.upsertPersona(st, ME, { kind: "nightlife", label: `N${i}`, music_genres: ["House"] });
      expect(r.ok).toBe(true);
      if (r.ok) st = r.state;
    }
    expect(A.upsertPersona(st, ME, { kind: "nightlife", label: "Uno más", music_genres: ["House"] })).toMatchObject({ ok: false }); // 1 + 4 = 5 máximo
  });

  it("en un evento corporativo NUNCA se ve la cara de la noche", () => {
    const s = seed();
    const night = faceOf(s, ME, NIGHT)!;
    const pro = faceOf(s, ME, PRO)!;
    expect(night.music_genres.length).toBeGreaterThan(0);
    expect(night.instagram_username).toBeTruthy();
    expect(pro.persona?.id).toBe(DEMO_IDS.mePro);
    expect(pro.music_genres).toEqual([]);
    expect(pro.instagram_username).toBeNull();
    expect(pro.loop_video_url).toBeNull();
    expect(pro.bio).not.toBe(night.bio);
    expect(pro.photos.map((p) => p.url)).not.toEqual(night.photos.map((p) => p.url));
    // Alguien sin perfil profesional (p. ej. el equipo) se ve neutro, sin fotos ni bio de la noche.
    const staff = faceOf(s, DEMO_IDS.bartender, PRO)!;
    expect(staff.photos).toEqual([]);
    expect(staff.bio).toBe("");
  });

  it("borrar un perfil: no en un evento en curso; en uno cerrado queda una cara neutra", () => {
    const s = seed();
    expect(A.deletePersona(s, ME, DEMO_IDS.mePro)).toMatchObject({ ok: false });
    // Cerramos el lobby del encuentro: ya se puede borrar y la cara queda neutra (nunca la de la noche).
    const closed: RougeState = { ...s, events: s.events.map((e) => (e.id === PRO ? { ...e, lobby_expires_at: new Date(NOW - 1000).toISOString(), ends_at: new Date(NOW - 2000).toISOString() } : e)) };
    const r = A.deletePersona(closed, ME, DEMO_IDS.mePro);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const face = faceOf(r.state, ME, PRO)!;
    expect(face.persona).toBeNull();
    expect(face.photos).toEqual([]);
    expect(face.music_genres).toEqual([]);
  });

  it("cada contacto se muestra con la cara del evento donde se conocieron", () => {
    const s = seed();
    const ms = matchesOf(s, ME);
    const mateo = ms.find((m) => m.connection.event_id === NIGHT && m.profile.id === id(5))!;
    const carla = ms.find((m) => m.connection.event_id === PRO && m.profile.id === id(21))!;
    expect(mateo.profile.music_genres.length).toBeGreaterThan(0);
    expect(carla.profile.persona?.company).toBe("Textil Norte");
  });
});

describe("networking por afinidad de negocio", () => {
  it("cruza lo que uno busca con lo que el otro ofrece (simétrico)", () => {
    const s = seed();
    const sofi = s.profile_personas.find((p) => p.id === DEMO_IDS.mePro)!;
    const carla = s.profile_personas.find((p) => p.user_id === id(21))!;
    const ab = businessAffinity(sofi, carla);
    expect(ab.score).toBeGreaterThan(0);
    expect(ab.matched).toEqual(expect.arrayContaining(["software", "marketing"]));
    expect(businessAffinity(carla, sofi).score).toBeCloseTo(ab.score);
    expect(businessAffinity(null, carla).score).toBe(0);
  });

  it("\"clientes\" se cruza con quien busca lo que ofrecés y \"socios\" con quien también busca socios", () => {
    const base = { id: "x", user_id: "u", kind: "corporate" as const, label: "", display_name: "", bio: "", photos: [], music_genres: [], spotify_embed_url: null, job_title: "", company: "c", industry: null, linkedin_url: null, created_at: "", website_url: null, looking_for_note: "", offering_note: "", contact_email: null, contact_phone: null, privacy_level: "strict" as const };
    const vende = { ...base, looking_for: ["clients" as const], offering: ["software" as const] };
    const compra = { ...base, looking_for: ["software" as const], offering: ["suppliers" as const] };
    expect(businessAffinity(vende, compra)).toMatchObject({ score: 0.75 * 0.7, matched: expect.arrayContaining(["clients", "software"]) });
    const socioA = { ...base, looking_for: ["partners" as const], offering: [] };
    expect(businessAffinity(socioA, { ...socioA }).score).toBeCloseTo(0.75 * 0.7);
    expect(A.upsertPersona(seed(), ME, { kind: "corporate", company: "X", offering: ["clients"] })).toMatchObject({ ok: false });
  });

  it("la grilla corporativa muestra perfiles profesionales y prioriza la complementariedad", () => {
    const s = seed();
    const grid = lobbyGrid(s, PRO, ME, undefined, NOW);
    expect(grid.length).toBeGreaterThan(3);
    expect(grid.every((c) => c.profile.persona?.kind === "corporate")).toBe(true);
    expect(grid.every((c) => c.affinity.kind === "corporate")).toBe(true);
    // Carla (busca software y marketing, que Sofi ofrece) está entre las primeras.
    expect(grid.slice(0, 3).map((c) => c.profile.id)).toContain(id(21));
    // Filtro por lo que ofrecen
    const advisors = lobbyGrid(s, PRO, ME, { genres: [], needs: ["advisory"], moods: [], sameZone: false }, NOW);
    expect(advisors.length).toBeGreaterThan(0);
    expect(advisors.every((c) => c.profile.persona!.offering.includes("advisory"))).toBe(true);
  });
});

describe("menú del demo por evento", () => {
  it("al cambiar de evento activo trae el menú de ese evento y guarda el anterior", () => {
    const s = seed();
    expect(s.bar_menu).toEqual(BAR_MENU);
    const pro = syncDemoMenu({ ...s, active_event_id: PRO });
    expect(pro.bar_menu).toEqual(CORPORATE_MENU);
    const back = syncDemoMenu({ ...pro, active_event_id: NIGHT });
    expect(back.bar_menu).toEqual(BAR_MENU);
    // En Supabase (sin bar_menu_event_id) no toca nada.
    const remote = { ...s, bar_menu_event_id: undefined, active_event_id: PRO };
    expect(syncDemoMenu(remote)).toBe(remote);
  });
});

describe("marca del encuentro pyme del demo", () => {
  it("sus colores pasan los controles de legibilidad (mismo control que brand_color_error)", async () => {
    const { checkBrandColor } = await import("./branding");
    const b = seed().brands.find((x) => x.id === DEMO_IDS.proBrand)!;
    expect(checkBrandColor(b.primary_color!, "primary")).toBeNull();
    expect(checkBrandColor(b.accent_color!, "accent")).toBeNull();
  });
});
