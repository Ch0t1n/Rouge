import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import * as A from "./actions";
import { blockListOf, checkBirthDate, checkUsername, cleanUsername, formatPhone, maskPhone, parseSpotify, profileCompleteness } from "./profile";
import { isBlockedBetween } from "./selectors";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const ME = DEMO_IDS.me;

describe("parseSpotify", () => {
  const ID = "4cOdK2wGLETKBW3PvgPWqT";
  it.each([
    `https://open.spotify.com/track/${ID}?si=abc123`,
    `https://open.spotify.com/intl-es/track/${ID}`,
    `https://open.spotify.com/embed/track/${ID}?utm_source=generator`,
    `spotify:track:${ID}`,
  ])("normaliza %s", (raw) => {
    const r = parseSpotify(raw)!;
    expect(r.kind).toBe("track");
    expect(r.embedUrl).toBe(`https://open.spotify.com/embed/track/${ID}?utm_source=generator&theme=0`);
    expect(r.height).toBe(80);
  });
  it("playlists usan el embed alto", () => {
    expect(parseSpotify("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.height).toBe(152);
  });
  it.each(["https://evil.com/track/4cOdK2wGLETKBW3PvgPWqT", "https://open.spotify.com/user/pepe", "hola", ""])("rechaza %s", (raw) => {
    expect(parseSpotify(raw)).toBeNull();
  });
});

describe("validaciones de perfil", () => {
  it("limpia y valida @username", () => {
    const s = createSeedState(NOW);
    expect(cleanUsername("  @Sofí Noche ")).toBe("sofinoche");
    expect(checkUsername(s, "@sofi.noche", "otro")).toEqual({ ok: false, error: "Ese @username ya está en uso." });
    expect(checkUsername(s, "@sofi.noche", ME).ok).toBe(true);
    expect(checkUsername(s, ".pepe", "x").ok).toBe(false);
    expect(checkUsername(s, "ab", "x").ok).toBe(false);
  });
  it("exige mayoría de edad", () => {
    const now = new Date(NOW);
    expect(checkBirthDate("2010-05-01", now)).toMatch(/mayores de 18/);
    expect(checkBirthDate("2000-05-01", now)).toBeNull();
    expect(checkBirthDate("no-date", now)).toMatch(/inválida/);
  });
  it("upsertProfile crea un perfil nuevo normalizando teléfono y Spotify", () => {
    const s = createSeedState(NOW);
    const r = A.upsertProfile(
      s,
      "new-user",
      { username: "@Nueva.Persona", full_name: "  Nueva   Persona ", birth_date: "2001-02-03", phone: "11 3333-4444", spotify_embed_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x" },
      NOW,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.data.username).toBe("nueva.persona");
    expect(r.data.full_name).toBe("Nueva Persona");
    expect(r.data.phone_normalized).toBe("+5491133334444");
    expect(r.data.spotify_embed_url).toContain("/embed/track/");
  });
  it("rechaza menores, teléfonos duplicados y más de 4 fotos", () => {
    const s = createSeedState(NOW);
    expect(A.upsertProfile(s, "x", { username: "xx_x", full_name: "X", birth_date: "2012-01-01" }, NOW).ok).toBe(false);
    expect(A.upsertProfile(s, ME, { phone: "+54 9 11 5000-1002" }, NOW).ok).toBe(false); // teléfono de Cami
    const photos = Array.from({ length: 5 }, (_, i) => ({ url: `/p${i}.webp` }));
    expect(A.upsertProfile(s, ME, { photos }, NOW).ok).toBe(false);
  });
});

describe("privacidad", () => {
  it("enmascara teléfonos", () => {
    expect(maskPhone("+5491150009999")).toBe("+54 9 •• ••••-9999");
    expect(formatPhone("+5491122334455")).toBe("+54 9 11 2233-4455");
  });
  it("la lista negra no revela si el número tiene cuenta", () => {
    let s = createSeedState(NOW);
    const r = A.blockPhone(s, ME, "+1 415 555 0100", NOW); // número sin cuenta
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    const list = blockListOf(s, ME);
    expect(list.phones.map((p) => p.phone)).toContain("+14155550100");
    expect(Object.keys(list.phones[0]).sort()).toEqual(["created_at", "id", "masked", "phone"]);
  });
  it("cargar mi teléfono activa bloqueos preventivos que otros ya tenían sobre ese número", () => {
    let s = createSeedState(NOW);
    s = (A.blockPhone(s, DEMO_IDS.me, "+5491177778888", NOW) as { state: typeof s }).state;
    const r = A.upsertProfile(s, "nuevo", { username: "recien.llegado", full_name: "Recién", birth_date: "1999-01-01", phone: "11 7777-8888" }, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(isBlockedBetween(r.state, ME, "nuevo")).toBe(true);
  });
  it("desbloquear restaura la visibilidad", () => {
    let s = createSeedState(NOW);
    const block = blockListOf(s, ME).phones[0];
    s = (A.unblock(s, ME, block.id) as { state: typeof s }).state;
    expect(isBlockedBetween(s, ME, "00000000-0000-4000-8000-000000000013")).toBe(false);
  });
});

describe("completitud", () => {
  it("suma pesos", () => {
    const s = createSeedState(NOW);
    const me = s.profiles.find((p) => p.id === ME)!;
    expect(profileCompleteness(me).percent).toBe(90); // le falta el loop de video
  });
});
