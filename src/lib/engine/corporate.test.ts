/**
 * Eventos corporativos: tipo de evento, moods, perfil profesional, afinidad por intereses,
 * semilla corporativa del Modo Demo y espejo con supabase/schema.sql.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import { EVENT_TYPES, MOOD_TAGS, PRO_INTERESTS, type RougeState } from "@/lib/types";
import * as A from "./actions";
import { computeAffinity } from "./affinity";
import { checkBrandColor } from "./branding";
import { copyFor, eventTypeOf, moodsFor } from "./eventType";
import { lobbyGrid } from "./grid";
import { parseLinkedin } from "./profile";
import * as S from "./selectors";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;
const SQL = readFileSync(path.resolve(__dirname, "../../../supabase/schema.sql"), "utf8");
const corp = () => createSeedState(NOW, "corporate");
const ok = <T,>(r: A.Result<T>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const byUser = (s: RougeState, username: string) => s.profiles.find((p) => p.username === username)!;

describe("tipo de evento", () => {
  it("los eventos sin tipo son fiestas y cada tipo trae sus 6 moods", () => {
    expect(eventTypeOf(null)).toBe("nightlife");
    expect(eventTypeOf({ event_type: "corporate" })).toBe("corporate");
    expect(eventTypeOf({ event_type: "otro" as never })).toBe("nightlife");
    expect(moodsFor("nightlife")).toHaveLength(6);
    expect(moodsFor("corporate").map((m) => m.id)).toEqual(["networking", "with_team", "other_areas", "business", "hiring", "open_to_chat"]);
    expect(copyFor("corporate").match).toBe("Contacto");
    expect(copyFor("nightlife").lineup).toBe("Line-up");
  });

  it("upsertEvent guarda el tipo y rechaza uno inválido", () => {
    const s = { ...createSeedState(NOW), current_user_id: DEMO_IDS.organizer };
    const base = { name: "Kickoff", starts_at: new Date(NOW + 72e5).toISOString(), ends_at: new Date(NOW + 9e6).toISOString() };
    expect(ok(A.upsertEvent(s, { ...base, event_type: "corporate" }, NOW)).data.event_type).toBe("corporate");
    expect(ok(A.upsertEvent(s, base, NOW)).data.event_type).toBe("nightlife");
    expect(A.upsertEvent(s, { ...base, event_type: "boda" as never }, NOW).ok).toBe(false);
  });
});

describe("perfil profesional", () => {
  it("parseLinkedin acepta el link o el slug y descarta lo que no es un perfil", () => {
    expect(parseLinkedin("https://www.linkedin.com/in/Sofia-Benitez-UX/?locale=es_ES")).toBe("sofia-benitez-ux");
    expect(parseLinkedin("ar.linkedin.com/in/mateo-sosa")).toBe("mateo-sosa");
    expect(parseLinkedin("@mateo-sosa")).toBe("mateo-sosa");
    expect(parseLinkedin("linkedin.com/company/rouge")).toBeNull();
    expect(parseLinkedin("https://evil.com/in/x")).toBeNull();
    expect(parseLinkedin("ab")).toBeNull();
    expect(parseLinkedin("-mal-")).toBeNull();
  });

  it("upsertProfile valida y normaliza empresa, cargo, intereses y LinkedIn", () => {
    const s = createSeedState(NOW);
    const r = ok(A.upsertProfile(s, ME, { company: "  Grupo   Vértice ", job_title: "", interests: ["Diseño", "Producto"], linkedin_username: "linkedin.com/in/sofi-ux" }, NOW));
    expect(r.data).toMatchObject({ company: "Grupo Vértice", job_title: null, interests: ["Diseño", "Producto"], linkedin_username: "sofi-ux" });
    expect(A.upsertProfile(s, ME, { linkedin_username: "no es un link/x" }, NOW).ok).toBe(false);
    expect(A.upsertProfile(s, ME, { interests: [...PRO_INTERESTS].slice(0, 6) }, NOW).ok).toBe(false);
    expect(A.upsertProfile(s, ME, { interests: ["Astrología" as never] }, NOW).ok).toBe(false);
    expect(A.upsertProfile(s, ME, { company: "x".repeat(61) }, NOW).ok).toBe(false);
    expect(ok(A.upsertProfile(s, ME, { linkedin_username: "" }, NOW)).data.linkedin_username).toBeNull();
  });

  it("un perfil nuevo nace sin perfil profesional", () => {
    const r = ok(A.upsertProfile(createSeedState(NOW), "nuevo", { username: "nuevo.user", full_name: "Nuevo", birth_date: "2000-01-01" }, NOW));
    expect(r.data).toMatchObject({ company: null, job_title: null, interests: [], linkedin_username: null });
  });
});

describe("afinidad en un evento corporativo", () => {
  it("se calcula con las áreas e intereses, no con la música", () => {
    const s = corp();
    const me = byUser(s, "sofia.benitez");
    const mateo = byUser(s, "mateo.sosa");
    const aff = computeAffinity(me, S.getAttendee(s, EV, me.id), mateo, S.getAttendee(s, EV, mateo.id)!, NOW, "corporate");
    expect(aff.percent).toBe(67); // Diseño·Producto·Data e IA vs Data e IA·Tecnología·Producto
    expect(aff.shared.sort()).toEqual(["Data e IA", "Producto"]);
    expect(computeAffinity(me, undefined, mateo, S.getAttendee(s, EV, mateo.id)!, NOW, "nightlife").percent).toBe(0);
  });

  it("la grilla ordena por intereses y filtra por área", () => {
    const s = corp();
    const grid = lobbyGrid(s, EV, ME, undefined, NOW);
    expect(grid.length).toBeGreaterThan(5);
    expect(grid.some((g) => g.affinity.percent > 0)).toBe(true);
    for (let i = 1; i < grid.length; i++) expect(grid[i - 1].affinity.rank).toBeGreaterThanOrEqual(grid[i].affinity.rank);
    const legal = lobbyGrid(s, EV, ME, { tags: ["Legal"], moods: [], sameZone: false }, NOW);
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((g) => g.profile.interests.includes("Legal"))).toBe(true);
    expect(lobbyGrid(s, EV, ME, { tags: [], moods: ["hiring"], sameZone: false }, NOW).map((g) => g.profile.username)).toEqual(["francisca.luna"]);
  });
});

describe("semilla corporativa del Modo Demo", () => {
  it("es un evento corporativo en vivo, con agenda y salas", () => {
    const s = corp();
    const e = S.activeEvent(s)!;
    expect(e.event_type).toBe("corporate");
    expect(S.lobbyPhase(e, NOW)).toBe("live");
    expect(e.lineup_json.every((sl) => !!sl.room)).toBe(true);
    expect(S.lineupNow(e, NOW).current?.artist).toBe("Networking guiado por áreas");
    expect(A.resolveAccessCode(s, "kickoff-vertice")?.event.id).toBe(EV);
  });

  it("mantiene los mismos ids y relaciones que la fiesta", () => {
    const night = createSeedState(NOW);
    const s = corp();
    expect(s.version).toBe(night.version);
    expect(s.profiles.map((p) => p.id)).toEqual(night.profiles.map((p) => p.id));
    expect(s.connections.map((c) => [c.sender_id, c.receiver_id, c.status])).toEqual(night.connections.map((c) => [c.sender_id, c.receiver_id, c.status]));
    expect(new Set(s.profiles.map((p) => p.username)).size).toBe(s.profiles.length);
  });

  it("todo apunta a sectores, ítems y moods que existen", () => {
    const s = corp();
    const sectors = new Set(S.activeEvent(s)!.venue_layout_json.sectors.map((x) => x.name));
    const corporateMoods = new Set(moodsFor("corporate").map((m) => m.id));
    for (const a of s.event_attendees) {
      expect(corporateMoods.has(a.mood_tag!)).toBe(true);
      a.visited_sectors.forEach((v) => expect(sectors.has(v)).toBe(true));
      expect(a.referred_by).toBeNull();
    }
    s.map_pins.forEach((p) => expect(sectors.has(p.sector_name!)).toBe(true));
    const menu = new Map(s.bar_menu.map((m) => [m.id, m]));
    for (const o of s.bar_orders) {
      if (o.sector_name) expect(sectors.has(o.sector_name)).toBe(true);
      o.items_json.forEach((l) => expect(menu.get(l.item_id)?.price).toBe(l.unit_price));
      expect(o.total_amount).toBe(o.items_json.reduce((a, l) => a + l.qty * l.unit_price, 0));
    }
  });

  it("invitados con perfil profesional, sin RRPP y con una marca válida", () => {
    const s = corp();
    const guests = s.event_attendees.map((a) => S.getProfile(s, a.user_id)!);
    expect(guests.every((p) => p.company && p.job_title && p.interests.length > 0 && p.music_genres.length === 0)).toBe(true);
    expect(guests.every((p) => p.interests.every((i) => (PRO_INTERESTS as readonly string[]).includes(i)))).toBe(true);
    expect(guests.filter((p) => p.linkedin_username).every((p) => parseLinkedin(p.linkedin_username) === p.linkedin_username)).toBe(true);
    expect(s.event_staff.some((m) => m.role === "promoter")).toBe(false);
    expect(s.promoter_links).toHaveLength(0);
    expect(s.song_requests).toHaveLength(0);
    const brand = s.brands[0];
    expect(brand.name).toBe("Grupo Vértice");
    expect(checkBrandColor(brand.primary_color!, "primary")).toBeNull();
  });

  it("los flujos del motor funcionan igual: pedir un café, conectar y aceptar el Rompehielos", () => {
    let s = corp();
    s = ok(A.createBarOrder(s, EV, ME, [{ itemId: "cafe", qty: 2 }], "fast_pickup", NOW)).state;
    expect(s.bar_orders.at(-1)!.total_amount).toBe(6000);
    const joaquin = byUser(s, "joaquin.vera");
    expect(S.connectionStateFor(s, EV, ME, joaquin.id)).toBe("sent");
    const ice = s.connections.find((c) => c.type === "icebreaker" && c.receiver_id === ME)!;
    expect(ice.icebreaker_message).toMatch(/Kuarzo/);
    s = ok(A.respondConnection(s, ice.id, ME, true, NOW)).state;
    expect(S.connectionStateFor(s, EV, ME, ice.sender_id)).toBe("matched");
  });
});

describe("espejo con schema.sql", () => {
  it("mood_tag_t tiene todos los moods de MOOD_TAGS", () => {
    const values = new Set([
      ...(SQL.match(/create type mood_tag_t\s+as enum \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g),
      ...SQL.matchAll(/alter type mood_tag_t add value if not exists '([a-z_]+)'/g),
    ].map((m) => m[1]));
    for (const m of MOOD_TAGS) expect(values, `falta el mood ${m.id} en mood_tag_t`).toContain(m.id);
  });

  it("el check de interests y el de event_type coinciden con los catálogos", () => {
    const interests = SQL.match(/interests <@ array\[([^\]]*)\]/)?.[1].match(/'([^']+)'/g)?.map((x) => x.slice(1, -1));
    expect(interests).toEqual([...PRO_INTERESTS]);
    const types = SQL.match(/event_type in \(([^)]*)\)/)?.[1].match(/'([^']+)'/g)?.map((x) => x.slice(1, -1));
    expect(types).toEqual([...EVENT_TYPES]);
  });
});
