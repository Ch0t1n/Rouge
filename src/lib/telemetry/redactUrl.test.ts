import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "./redactUrl";

const O = "https://rouge.example";

describe("redactAnalyticsUrl", () => {
  it("oculta códigos de ingreso, usernames y conexiones", () => {
    expect(redactAnalyticsUrl(`${O}/join/AB12CD34EF`)).toBe(`${O}/join/[code]`);
    expect(redactAnalyticsUrl(`${O}/join/RPX9`)).toBe(`${O}/join/[code]`);
    expect(redactAnalyticsUrl(`${O}/u/martina.dj`)).toBe(`${O}/u/[username]`);
    expect(redactAnalyticsUrl(`${O}/chat/7f3c-uuid`)).toBe(`${O}/chat/[connectionId]`);
  });

  it("deja las rutas estáticas como están", () => {
    expect(redactAnalyticsUrl(`${O}/join`)).toBe(`${O}/join`);
    expect(redactAnalyticsUrl(`${O}/lobby`)).toBe(`${O}/lobby`);
    expect(redactAnalyticsUrl(`${O}/admin/crm`)).toBe(`${O}/admin/crm`);
    expect(redactAnalyticsUrl(`${O}/`)).toBe(`${O}/`);
  });

  it("descarta query y fragmento (ids, ?next=/join/…, token de Instagram)", () => {
    expect(redactAnalyticsUrl(`${O}/map?focus=user-1&rescue=1`)).toBe(`${O}/map`);
    expect(redactAnalyticsUrl(`${O}/onboarding?next=/join/AB12CD34EF`)).toBe(`${O}/onboarding`);
    expect(redactAnalyticsUrl(`${O}/login/instagram#token_hash=secreto`)).toBe(`${O}/login/instagram`);
    expect(redactAnalyticsUrl(`${O}/admin/print-ticket?order=o-1&copia=barra`)).toBe(`${O}/admin/print-ticket`);
  });

  it("una URL inválida no rompe ni filtra nada", () => {
    expect(redactAnalyticsUrl("no es una url")).toBe("/");
  });
});
