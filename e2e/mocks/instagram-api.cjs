// API de Instagram imitada para E2E: OAuth (authorize/token), token largo, /me, /me/media, media por id e imágenes.
// La app debe correr con INSTAGRAM_OAUTH_URL/TOKEN_URL/GRAPH_URL apuntando acá e INSTAGRAM_APP_SECRET=mock-secret.
// Imitación mínima de la API de Instagram (OAuth + Graph) para el E2E. Identidad configurable por POST /__identity.
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = Number(new URL(process.env.E2E_IG_MOCK_URL || "http://localhost:3999").port || 3999);
let identity = { id: "17841400000001", username: "noche.mock" };
const calls = [];
const media = [1, 2, 3, 4].map((n) => ({ id: `m${n}`, media_type: "IMAGE", media_url: `http://localhost:${PORT}/img/${n}.jpg`, permalink: `https://instagram.com/p/m${n}` }));
media.push({ id: "v1", media_type: "VIDEO", media_url: `http://localhost:${PORT}/img/v.mp4` });
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
http
  .createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    calls.push(`${req.method} ${u.pathname}`);
    if (u.pathname === "/__identity" && req.method === "POST") {
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { identity = JSON.parse(b); json(res, 200, identity); });
      return;
    }
    if (u.pathname === "/__calls") return json(res, 200, calls);
    if (u.pathname === "/oauth/authorize") {
      if (u.searchParams.get("scope") !== "instagram_business_basic" || !u.searchParams.get("client_id")) return json(res, 400, { error: "bad request" });
      const back = new URL(u.searchParams.get("redirect_uri"));
      if (identity.deny) { back.searchParams.set("error", "access_denied"); back.searchParams.set("error_reason", "user_denied"); }
      else back.searchParams.set("code", `code-${identity.id}`);
      back.searchParams.set("state", u.searchParams.get("state"));
      res.writeHead(302, { Location: back.toString() + "#_" }); return res.end();
    }
    if (u.pathname === "/oauth/access_token" && req.method === "POST") {
      let b = ""; req.on("data", (c) => (b += c));
      req.on("end", () => {
        const p = new URLSearchParams(b);
        if (p.get("client_secret") !== "mock-secret" || !p.get("code")?.startsWith("code-")) return json(res, 400, { error_message: "invalid" });
        json(res, 200, { data: [{ access_token: `short-${identity.id}`, user_id: identity.id, permissions: "instagram_business_basic" }] });
      });
      return;
    }
    const token = u.searchParams.get("access_token") ?? "";
    if (u.pathname === "/access_token") return json(res, 200, { access_token: `long-${identity.id}`, token_type: "bearer", expires_in: 5184000 });
    if (u.pathname === "/me") return token.includes(identity.id) ? json(res, 200, { user_id: identity.id, username: identity.username, account_type: "CREATOR" }) : json(res, 400, { error: { code: 190 } });
    if (u.pathname === "/me/media") return json(res, 200, { data: media });
    const m = media.find((x) => `/${x.id}` === u.pathname);
    if (m) return json(res, 200, m);
    const img = u.pathname.match(/^\/img\/(\d)\.jpg$/);
    if (img) { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(fs.readFileSync(path.join(__dirname, "instagram", `${img[1]}.jpg`))); }
    json(res, 404, { error: "not found" });
  })
  .listen(PORT, () => console.log("ig mock :" + PORT));
