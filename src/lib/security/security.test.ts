import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/engine/roles";
import { openToken, sealToken, isImportableImageType } from "@/lib/instagram/oauth";
import { buildCsp, STATIC_SECURITY_HEADERS, supabaseOrigins } from "./headers";
import { isSafeCtaLink, safeInternalPath } from "./paths";
import { clientIp, RateLimiter } from "./rateLimit";

describe("redirecciones internas (anti open redirect)", () => {
  it("acepta rutas propias", () => {
    expect(safeInternalPath("/profile/edit?instagram=connected")).toBe("/profile/edit?instagram=connected");
    expect(safeInternalPath("/join/BRESH26")).toBe("/join/BRESH26");
  });
  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/\tevil", "", null, undefined])(
    "rechaza %s",
    (v) => {
      expect(safeInternalPath(v as string | null)).toBeNull();
      expect(safeNext(v as string | null)).toBeNull();
    },
  );
  it("safeNext además evita volver al login", () => {
    expect(safeNext("/login?next=/app")).toBeNull();
    expect(safeNext("/app")).toBe("/app");
  });
});

describe("links de Text Blasts", () => {
  it("solo rutas internas o https", () => {
    expect(isSafeCtaLink("/bar")).toBe(true);
    expect(isSafeCtaLink("https://entradas.example.com/x")).toBe(true);
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>", "http://example.com", "//evil.com", "/\\evil.com", " https://x.com", ""]) {
      expect(isSafeCtaLink(bad)).toBe(false);
    }
  });
});

describe("límite de pedidos", () => {
  it("corta al superar el límite y libera al pasar la ventana", () => {
    const rl = new RateLimiter();
    const rule = { limit: 2, windowMs: 1000 };
    expect(rl.take("ip", rule, 0)).toBe(true);
    expect(rl.take("ip", rule, 10)).toBe(true);
    expect(rl.take("ip", rule, 20)).toBe(false);
    expect(rl.take("otra-ip", rule, 20)).toBe(true);
    expect(rl.take("ip", rule, 1011)).toBe(true);
  });
  it("no crece sin límite de claves", () => {
    const rl = new RateLimiter(3);
    for (let i = 0; i < 10; i++) rl.take(`k${i}`, { limit: 1, windowMs: 1000 }, 0);
    expect(rl.take("k0", { limit: 1, windowMs: 1000 }, 1)).toBe(true); // k0 fue desalojada
  });
  it("toma la IP del primer x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("tokens de Instagram cifrados", () => {
  it("ida y vuelta con la clave; sin clave o con otra, no se leen", () => {
    const sealed = sealToken("IGQ-token", "clave-larga");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("IGQ-token");
    expect(openToken(sealed, "clave-larga")).toBe("IGQ-token");
    expect(openToken(sealed, "otra")).toBeNull();
    expect(openToken(sealed, undefined)).toBeNull();
    expect(sealToken("IGQ-token", "clave-larga")).not.toBe(sealed); // IV aleatorio
  });
  it("tokens viejos en claro siguen funcionando", () => {
    expect(sealToken("plano", undefined)).toBe("plano");
    expect(openToken("plano", "clave")).toBe("plano");
  });
  it("solo tipos de imagen conocidos (nunca SVG ni HTML)", () => {
    expect(isImportableImageType("image/jpeg")).toBe(true);
    expect(isImportableImageType("image/webp; charset=binary")).toBe(true);
    expect(isImportableImageType("image/svg+xml")).toBe(false);
    expect(isImportableImageType("text/html")).toBe(false);
  });
});

describe("Content-Security-Policy", () => {
  const csp = buildCsp({ nonce: "abc", supabaseUrl: "https://proj.supabase.co" });
  const dir = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
  it("scripts solo con nonce, sin unsafe-inline ni eval en producción", () => {
    expect(dir("script-src")).toContain("'nonce-abc'");
    expect(dir("script-src")).toContain("'strict-dynamic'");
    expect(dir("script-src")).not.toContain("unsafe-inline");
    expect(dir("script-src")).not.toContain("unsafe-eval");
  });
  it("bloquea embeber la app, objetos y <base>", () => {
    expect(dir("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir("object-src")).toBe("object-src 'none'");
    expect(dir("base-uri")).toBe("base-uri 'none'");
  });
  it("Supabase (https + wss) y Spotify como únicos externos de red/iframe", () => {
    expect(dir("connect-src")).toBe("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co");
    expect(dir("frame-src")).toBe("frame-src https://open.spotify.com");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
  });
  it("ignora URLs de Supabase inválidas", () => {
    expect(supabaseOrigins("javascript:alert(1)")).toBeNull();
    expect(supabaseOrigins("no es url")).toBeNull();
  });
  it("headers fijos imprescindibles", () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    for (const k of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) expect(keys).toContain(k);
  });
});
