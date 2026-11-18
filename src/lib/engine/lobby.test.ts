import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import * as A from "./actions";
import * as S from "./selectors";
import { lobbyGrid } from "./grid";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;
const ok = <T,>(r: A.Result<T>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("grilla del lobby", () => {
  it("ordena por afinidad y excluye bloqueados, ghost y a mí", () => {
    const s = createSeedState(NOW);
    const grid = lobbyGrid(s, EV, ME, undefined, NOW);
    const names = grid.map((g) => g.profile.username);
    expect(names).not.toContain("sofi.noche");
    expect(names).not.toContain("gonza.x"); // bloqueado por teléfono
    expect(names).not.toContain("vale.pop"); // ghost
    for (let i = 1; i < grid.length; i++) expect(grid[i - 1].affinity.rank).toBeGreaterThanOrEqual(grid[i].affinity.rank);
  });

  it("busca por nombre (sin tildes) o @username y cuenta la búsqueda como filtro", () => {
    const s = createSeedState(NOW);
    const all = lobbyGrid(s, EV, ME, undefined, NOW);
    const target = all[0].profile;
    const byName = lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: [], sameZone: false, query: target.full_name.split(" ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() }, NOW);
    expect(byName.map((g) => g.profile.id)).toContain(target.id);
    const byHandle = lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: [], sameZone: false, query: "@" + target.username }, NOW);
    expect(byHandle.map((g) => g.profile.id)).toEqual([target.id]);
    expect(lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: [], sameZone: false, query: "zzz-nadie" }, NOW)).toEqual([]);
    // la búsqueda nunca saltea las reglas de visibilidad (bloqueados siguen invisibles)
    expect(lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: [], sameZone: false, query: "gonza" }, NOW)).toEqual([]);
  });

  it("informa el estado de conexión de cada tarjeta", () => {
    const grid = lobbyGrid(createSeedState(NOW), EV, ME, undefined, NOW);
    const by = (u: string) => grid.find((g) => g.profile.username === u)!.connection;
    expect(by("mateo.techno")).toBe("matched");
    expect(by("lucas.dj")).toBe("received");
    expect(by("joaco.indie")).toBe("sent");
    expect(by("nico.urbano")).toBe("none");
  });

  it("filtra por género, mood y zona compartida", () => {
    const s = createSeedState(NOW);
    expect(lobbyGrid(s, EV, ME, { genres: ["RKT"], needs: [], moods: [], sameZone: false }, NOW).every((g) => g.profile.music_genres.includes("RKT"))).toBe(true);
    expect(lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: ["after_hunt"], sameZone: false }, NOW).map((g) => g.profile.username).sort()).toEqual(["bruno.after", "juli.rkt"]);
    const zone = lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: [], sameZone: true }, NOW);
    expect(zone.length).toBeGreaterThan(0);
    expect(zone.every((g) => g.sharedZones.length > 0)).toBe(true);
    expect(zone.map((g) => g.profile.username)).not.toContain("tomi.vip"); // solo estuvo en VIP
  });

  it("dejar un pin suma el sector a los visitados", () => {
    let s = createSeedState(NOW);
    s = ok(A.dropPin(s, EV, ME, { x: 85, y: 66, shareWithSquad: true, matchIds: [] }, NOW)).state;
    expect(S.getAttendee(s, EV, ME)!.visited_sectors).toContain("Sector VIP");
    expect(lobbyGrid(s, EV, ME, { genres: [], needs: [], moods: [], sameZone: true }, NOW).map((g) => g.profile.username)).toContain("tomi.vip");
  });
});

describe("Ghost Mode (Modo Solo Amigos)", () => {
  it("quien está en ghost no puede enviar conexiones ni rompehielos, pero sí aceptar", () => {
    let s = createSeedState(NOW);
    s = ok(A.updateAttendeeSettings(s, EV, ME, { ghost_mode: true }, NOW)).state;
    expect(A.sendConnection(s, EV, ME, id(11), NOW).ok).toBe(false);
    expect(A.icebreakerEligibility(s, EV, ME, id(11), NOW)).toMatch(/Solo Amigos/);
    const lucasReq = S.inboxOf(s, ME, EV).find((x) => x.profile.username === "lucas.dj")!;
    expect(A.respondConnection(s, lucasReq.connection.id, ME, true, NOW).ok).toBe(true);
    // y desaparece de la grilla de los demás
    expect(lobbyGrid(s, EV, id(5), undefined, NOW).map((g) => g.profile.id)).not.toContain(ME);
  });
});

describe("elegibilidad del Rompehielos", () => {
  it("explica el motivo antes de escribir", () => {
    const s = createSeedState(NOW);
    expect(A.icebreakerEligibility(s, EV, ME, id(11), NOW)).toBeNull();
    expect(A.icebreakerEligibility(s, EV, ME, id(5), NOW)).toMatch(/match/);
    expect(A.icebreakerEligibility(s, EV, ME, id(12), NOW)).toMatch(/conectó primero/);
    expect(A.icebreakerEligibility(s, EV, id(7), ME, NOW)).toMatch(/Ya usaste/);
  });
  it("no se pueden regalar botellas como trago rompehielos", () => {
    const s = createSeedState(NOW);
    expect(A.sendIcebreaker(s, EV, ME, id(11), { message: "hola", giftDrinkItemId: "champagne" }, NOW).ok).toBe(false);
  });
});

describe("ingreso al evento", () => {
  it("resuelve link maestro por slug, código maestro, código único y link de squad", () => {
    const s = createSeedState(NOW);
    expect(A.resolveAccessCode(s, "bresh-sabado")?.via).toBe("master_link");
    expect(A.resolveAccessCode(s, "bresh26")?.via).toBe("master_link");
    expect(A.resolveAccessCode(s, s.event_invite_codes[10].code.toLowerCase())?.via).toBe("single_use_code");
    expect(A.resolveAccessCode(s, "sq-pibas")?.squad?.name).toBe("Las Pibas del Sábado");
    expect(A.resolveAccessCode(s, "NOPE")).toBeNull();
  });
  it("el link de squad suma al squad al entrar", () => {
    let s = createSeedState(NOW);
    s = ok(A.upsertProfile(s, "nueva", { username: "nueva.amiga", full_name: "Nueva", birth_date: "2000-01-01" }, NOW)).state;
    const r = ok(A.joinEvent(s, "nueva", "SQ-PIBAS", "with_friends", NOW));
    expect(r.data.squadId).toBe(DEMO_IDS.squadMain);
    expect(S.squadOf(r.state, EV, "nueva")?.squad.id).toBe(DEMO_IDS.squadMain);
  });
});
