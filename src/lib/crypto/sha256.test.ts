import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacHex, safeEqual, sha256Hex } from "./sha256";

describe("SHA-256 / HMAC puros (mismo resultado que node:crypto y pgcrypto)", () => {
  it.each(["", "abc", "1234", "x".repeat(55), "y".repeat(56), "z".repeat(64), "ñandú 🍸 ROUGE", "a".repeat(1000)])("sha256(%j)", (t) => {
    expect(sha256Hex(t)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
  });
  it("HMAC con clave corta y larga", () => {
    for (const key of ["k", "secreto-del-evento", "K".repeat(100)]) expect(hmacHex(key, "ROUGE:1234")).toBe(createHmac("sha256", key).update("ROUGE:1234").digest("hex"));
  });
  it("comparación en tiempo constante", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
