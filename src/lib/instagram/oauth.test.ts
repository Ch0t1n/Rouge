import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importablePhotos, isAllowedMediaHost, parseSignedRequest, parseTokenResponse, safeInternalPath, signState, verifyState } from "./oauth";

const SECRET = "test-secret";
const base = { mode: "link" as const, userId: "u1", nonce: "n1", next: "/profile/edit", exp: Date.now() + 60_000 };

describe("state OAuth firmado (CSRF)", () => {
  it("acepta el state propio con la cookie correcta", () => {
    expect(verifyState(signState(base, SECRET), SECRET, "n1")).toMatchObject({ mode: "link", userId: "u1", next: "/profile/edit" });
  });
  it("rechaza firma alterada, otro secreto, otra cookie y vencido", () => {
    const st = signState(base, SECRET);
    const [p] = st.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, userId: "atacante" })).toString("base64url");
    expect(verifyState(`${forged}.${st.split(".")[1]}`, SECRET, "n1")).toBeNull();
    expect(verifyState(st, "otro", "n1")).toBeNull();
    expect(verifyState(st, SECRET, "otra-cookie")).toBeNull();
    expect(verifyState(st, SECRET, null)).toBeNull();
    expect(verifyState(signState({ ...base, exp: Date.now() - 1 }, SECRET), SECRET, "n1")).toBeNull();
    expect(verifyState(`${p}`, SECRET, "n1")).toBeNull();
  });
  it("link sin usuario no es válido", () => {
    expect(verifyState(signState({ ...base, userId: null }, SECRET), SECRET, "n1")).toBeNull();
    expect(verifyState(signState({ ...base, mode: "login", userId: null }, SECRET), SECRET, "n1")?.mode).toBe("login");
  });
});

describe("signed_request de Meta (borrado de datos)", () => {
  const make = (payload: object, secret = SECRET) => {
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
  };
  it("verifica la firma y devuelve el user_id", () => {
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: 1784 }), SECRET)).toEqual({ user_id: "1784", algorithm: "HMAC-SHA256" });
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: 1 }, "otro"), SECRET)).toBeNull();
    expect(parseSignedRequest("basura", SECRET)).toBeNull();
  });
});

describe("respuestas de la Graph API", () => {
  it("token en cualquiera de los dos formatos", () => {
    expect(parseTokenResponse({ access_token: "a", user_id: 9 })).toEqual({ access_token: "a", user_id: "9" });
    expect(parseTokenResponse({ data: [{ access_token: "b", user_id: "7" }] })).toEqual({ access_token: "b", user_id: "7" });
    expect(parseTokenResponse({ error: {} })).toBeNull();
  });
  it("solo fotos importables (imagen o primera imagen del carrusel)", () => {
    const out = importablePhotos([
      { id: "1", media_type: "IMAGE", media_url: "https://x.cdninstagram.com/1.jpg" },
      { id: "2", media_type: "VIDEO", media_url: "https://x.cdninstagram.com/2.mp4" },
      { id: "3", media_type: "CAROUSEL_ALBUM", children: { data: [{ media_type: "VIDEO", media_url: "v" }, { media_type: "IMAGE", media_url: "https://x.cdninstagram.com/3.jpg" }] } },
    ]);
    expect(out.map((o) => o.id)).toEqual(["1", "3"]);
  });
  it("descarga solo desde los CDNs de Meta", () => {
    const hosts = ["cdninstagram.com", "fbcdn.net"];
    expect(isAllowedMediaHost("https://scontent-gru2-1.cdninstagram.com/v/a.jpg", hosts)).toBe(true);
    expect(isAllowedMediaHost("https://evil.com/cdninstagram.com.jpg", hosts)).toBe(false);
    expect(isAllowedMediaHost("http://scontent.cdninstagram.com/a.jpg", hosts)).toBe(false);
    expect(isAllowedMediaHost("https://cdninstagram.com.evil.com/a.jpg", hosts)).toBe(false);
  });
  it("vuelta solo a rutas internas", () => {
    expect(safeInternalPath("/profile/edit")).toBe("/profile/edit");
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("https://evil.com")).toBeNull();
  });
});
