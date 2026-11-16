import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import * as A from "./actions";
import {
  ACCENT_PRESETS,
  PRIMARY_PRESETS,
  ROUGE_ACCENT,
  ROUGE_PRIMARY,
  checkBrandColor,
  contrastRatio,
  eventTheme,
  hoverShade,
  normalizeHex,
  resolveTheme,
  rgbChannels,
  themeVars,
  upsertBrand,
} from "./branding";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const ORG = DEMO_IDS.organizer;

describe("colores de marca", () => {
  it("normaliza hex de 3 y 6 dígitos", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("ff1e56")).toBe("#FF1E56");
    expect(normalizeHex("rojo")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  it("todas las paletas sugeridas pasan los controles de contraste", () => {
    for (const p of PRIMARY_PRESETS) expect(checkBrandColor(p.hex, "primary"), p.name).toBeNull();
    for (const p of ACCENT_PRESETS) expect(checkBrandColor(p.hex, "accent"), p.name).toBeNull();
  });

  it("los colores de ROUGE cumplen WCAG con su texto", () => {
    expect(contrastRatio(ROUGE_PRIMARY, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(ROUGE_ACCENT, "#070709")).toBeGreaterThanOrEqual(4.5);
  });

  it("rechaza colores ilegibles o que se confunden con el cian del Squad", () => {
    expect(checkBrandColor("#1A1A1A", "primary")).toMatch(/oscuro/);
    expect(checkBrandColor("#FFFF00", "primary")).toMatch(/claro/);
    expect(checkBrandColor("#333366", "accent")).toMatch(/oscuro/);
    expect(checkBrandColor("#00F0FF", "accent")).toMatch(/cian del Squad/);
    expect(checkBrandColor("#0E7490", "primary")).toMatch(/cian del Squad/);
    expect(checkBrandColor("nope", "primary")).toMatch(/#RRGGBB/);
  });

  it("misma regla que brand_color_error() en SQL (casos verificados contra Postgres)", () => {
    const sql: [string, "primary" | "accent", "ok" | "like_squad" | "too_light" | "too_dark"][] = [
      ["#FF1E56", "primary", "ok"],
      ["#2F6BFF", "primary", "ok"],
      ["#C6FF3D", "accent", "ok"],
      ["#00F0FF", "accent", "like_squad"],
      ["#0E7490", "primary", "like_squad"],
      ["#FFFF00", "primary", "too_light"],
      ["#1A1A1A", "primary", "too_dark"],
      ["#333366", "accent", "too_dark"],
    ];
    for (const [hex, kind, expected] of sql) expect(checkBrandColor(hex, kind) === null, `${hex} ${kind}`).toBe(expected === "ok");
  });

  it("genera las variables CSS del tema", () => {
    expect(rgbChannels("#FF1E56")).toBe("255 30 86");
    expect(hoverShade("#FF1E56")).toBe("#E01A4C");
    expect(themeVars({ primary: "#8B5CF6", accent: "#C6FF3D" })).toMatchObject({ "--c-rouge": "139 92 246", "--c-vip": "198 255 61" });
  });
});

describe("tema del evento", () => {
  it("evento → marca → ROUGE", () => {
    const brand = { name: "Noche Neón", logo_url: "/logo.png", primary_color: "#8B5CF6", accent_color: null };
    expect(resolveTheme(null, null)).toMatchObject({ primary: ROUGE_PRIMARY, accent: ROUGE_ACCENT, custom: false, logo_url: null });
    expect(resolveTheme({ logo_url: null, theme_primary: null, theme_accent: null }, brand)).toMatchObject({ primary: "#8B5CF6", accent: ROUGE_ACCENT, logo_url: "/logo.png", custom: true });
    expect(resolveTheme({ logo_url: "/edicion.png", theme_primary: "#2F6BFF", theme_accent: "#C6FF3D" }, brand)).toMatchObject({ primary: "#2F6BFF", accent: "#C6FF3D", logo_url: "/edicion.png" });
  });

  it("el seed trae la marca con logo y los colores de ROUGE", () => {
    const t = eventTheme(createSeedState(NOW), EV);
    expect(t.logo_url).toBe("/demo/brands/rouge-night.svg");
    expect(t.custom).toBe(false);
  });
});

describe("marcas", () => {
  it("la dueña crea y edita su marca; nadie más la toca", () => {
    const s = createSeedState(NOW);
    const r = upsertBrand(s, ORG, { id: DEMO_IDS.brand, name: "ROUGE Night", primary_color: "#8b5cf6" }, NOW);
    expect(r.ok && r.data.primary_color).toBe("#8B5CF6");
    expect(upsertBrand(s, DEMO_IDS.me, { id: DEMO_IDS.brand, name: "Hackeada" }, NOW).ok).toBe(false);
    expect(upsertBrand(s, ORG, { name: "X" }, NOW).ok).toBe(false); // nombre corto
    expect(upsertBrand(s, ORG, { name: "Oscura", primary_color: "#111111" }, NOW).ok).toBe(false);
    const nueva = upsertBrand(s, DEMO_IDS.me, { name: "Mi Fiesta" }, NOW);
    expect(nueva.ok && nueva.data.owner_id).toBe(DEMO_IDS.me);
    expect(nueva.ok && nueva.data.payments_enabled).toBe(false); // el cobro lo prende solo el servidor
  });

  it("un evento solo usa marcas de quien lo creó y valida sus colores propios", () => {
    let s = { ...createSeedState(NOW), current_user_id: ORG };
    const ajena = upsertBrand(s, DEMO_IDS.me, { name: "Ajena" }, NOW);
    if (!ajena.ok) throw new Error(ajena.error);
    s = { ...ajena.state, current_user_id: ORG };
    const ev = s.events[0];
    expect(A.upsertEvent(s, { ...ev, brand_id: ajena.data.id }, NOW).ok).toBe(false);
    expect(A.upsertEvent(s, { ...ev, theme_primary: "#FFFF00" }, NOW).ok).toBe(false);
    const r = A.upsertEvent(s, { ...ev, theme_primary: "#2f6bff" }, NOW);
    expect(r.ok && r.data.theme_primary).toBe("#2F6BFF");
    expect(r.ok && r.data.slug).toBe(ev.slug);
  });
});
