// Supabase real + API de Instagram imitada · login con Instagram, importar fotos, conectar/desconectar, Google
// E2E Supabase real + API de Instagram imitada: login con Instagram, importar fotos del feed, @ verificado en el perfil,
// volver a entrar con Instagram, conectar Instagram a una cuenta de email, desconectar, y botón de Google.
const { chromium } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO, SUPABASE_URL, MAILPIT_URL, VERIFY_RE, ANON, SERVICE, IG_MOCK_URL } = require("./env.cjs");

const { createClient } = require("@supabase/supabase-js");
const RUN = Date.now().toString(36);
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
const errors = [];
const watch = (p, tag) => {
  p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/i.test(m.text()) && errors.push(`[${tag}] ${m.text().slice(0, 200)}`));
};
const identity = (body) => fetch(`${IG_MOCK_URL}/__identity`, { method: "POST", body: JSON.stringify(body) });

async function magicLink(page, email) {
  await page.fill('input[type="email"]', email);
  await page.click("text=Enviarme el link");
  await page.waitForSelector("text=Revisá tu mail");
  let id;
  for (let i = 0; i < 40 && !id; i++) {
    const r = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    id = r.messages?.[0]?.ID;
    if (!id) await new Promise((r) => setTimeout(r, 500));
  }
  const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json();
  await page.goto((msg.Text + " " + msg.HTML).match(VERIFY_RE)[0].replace(/&amp;/g, "&"));
}

(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const browser = await chromium.launch();
  const igUser = `noche.${RUN}`.slice(0, 20);
  const igId = `1784${Date.now()}`;
  await identity({ id: igId, username: igUser });

  // ── Login con Instagram (cuenta nueva) ──
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage(); watch(p, "ig");
  await p.goto(`${B}/login`, { waitUntil: "networkidle" });
  assert(await p.isVisible("text=Continuar con Instagram") && await p.isVisible("text=Continuar con Google"), "login: botones de Instagram y Google");
  await p.click("text=Continuar con Instagram");
  await p.waitForURL("**/onboarding**", { timeout: 20000 });
  assert(true, "Instagram → callback → sesión de Supabase → onboarding");
  await p.waitForFunction(() => document.querySelector('input[placeholder="sofi.noche"]')?.value, null, { timeout: 15000 });
  const suggested = await p.inputValue('input[placeholder="sofi.noche"]');
  assert(suggested === igUser.replace(/[^a-z0-9._]/g, ""), `@username sugerido desde Instagram (${suggested})`);
  await p.fill('input[autocomplete="name"]', "Noche Instagram");
  await p.fill('input[type="date"]', "1998-04-04");
  await p.click('role=radio[name="Mujer"]');
  await p.fill('input[type="tel"]', `11 ${String(5000 + (parseInt(RUN.slice(-3), 36) % 4000))}-7001`);
  await p.click("text=Continuar");
  await p.waitForSelector("text=Tu mejor versión");
  await p.click(`text=Importar de Instagram · @${igUser}`);
  await p.waitForSelector('[role="dialog"] button[aria-label^="Foto de Instagram"]');
  const tiles = await p.locator('[role="dialog"] button[aria-label^="Foto de Instagram"]').count();
  assert(tiles === 4, `feed: ${tiles} fotos importables (el video queda afuera)`);
  await p.click('[aria-label="Foto de Instagram m1"]');
  await p.click('[aria-label="Foto de Instagram m3"]');
  await p.click("text=Agregar 2 fotos");
  await p.waitForSelector('img[alt="Foto 2"]', { timeout: 30000 });
  assert(true, "2 fotos de Instagram importadas, comprimidas y subidas");
  await p.screenshot({ path: `${SP}/ig-onboarding-photos.png` });
  await p.click("text=Continuar");
  await p.click('button[aria-pressed]:has-text("Techno")');
  await p.click("text=Continuar");
  await p.click("text=Entrar a ROUGE");
  await p.waitForURL("**/app", { timeout: 20000 });

  const { data: prof } = await admin.from("profiles").select("id, photos, instagram_username, instagram_verified").eq("instagram_username", igUser).single();
  assert(prof.instagram_verified === true, "perfil con @ de Instagram verificado (trigger)");
  assert(prof.photos.length === 2 && prof.photos.every((ph) => ph.url.includes("/storage/v1/object/public/profile-media/")), "las fotos viven en nuestro Storage, no en el CDN de Instagram");
  const { data: tokenRow } = await admin.from("instagram_accounts").select("access_token, token_expires_at").eq("user_id", prof.id).single();
  assert(tokenRow.access_token === `long-${igId}` && +new Date(tokenRow.token_expires_at) > Date.now() + 50 * 86400000, "token largo (60 días) guardado solo en el servidor");

  await p.goto(`${B}/profile`, { waitUntil: "networkidle" });
  await p.waitForSelector(`text=@${igUser}`);
  assert(await p.isVisible("text=Cuenta conectada"), "el perfil muestra el Instagram con verificado");
  await p.screenshot({ path: `${SP}/ig-profile.png` });

  // ── Volver a entrar con Instagram: misma cuenta, va directo a la app ──
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p2 = await ctx2.newPage(); watch(p2, "ig-relogin");
  await p2.goto(`${B}/login`, { waitUntil: "networkidle" });
  p2.on("console", (m) => m.type() !== "info" && console.log("  [p2]", m.type(), m.text().slice(0, 200)));
  p2.on("response", async (r) => { if (r.url().includes("/auth/v1/verify")) console.log("  [p2] verify", r.status()); });
  await p2.click("text=Continuar con Instagram");
  await p2.waitForURL("**/app", { timeout: 20000 }).catch(async (e) => { await p2.screenshot({ path: `${SP}/ig-relogin-fail.png` }); console.log("  [p2] url", p2.url(), (await p2.textContent("main").catch(() => "")).slice(0, 200)); throw e; });
  await p2.waitForSelector("text=Hola, Noche");
  assert(true, "segundo ingreso con Instagram → misma cuenta, directo a /app");

  // ── Cancelar en Instagram → vuelve al login con aviso ──
  await identity({ id: igId, username: igUser, deny: true });
  const p3 = await (await browser.newContext()).newPage(); watch(p3, "deny");
  await p3.goto(`${B}/login`, { waitUntil: "networkidle" });
  await p3.click("text=Continuar con Instagram");
  await p3.waitForSelector("text=Cancelaste el acceso a Instagram.");
  assert(!p3.url().includes("ig_error"), "cancelar en Instagram → aviso y URL limpia");

  // ── Cuenta de email que conecta Instagram desde el editor ──
  const igUser2 = `fiesta.${RUN}`.slice(0, 20);
  await identity({ id: `1785${Date.now()}`, username: igUser2 });
  const email = `ig.link.${RUN}@rouge.test`;
  const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p4 = await c4.newPage(); watch(p4, "link");
  await p4.goto(`${B}/login`, { waitUntil: "networkidle" });
  await magicLink(p4, email);
  await p4.waitForURL("**/onboarding**", { timeout: 20000 });
  const { data: u } = await admin.from("profiles").select("id").limit(1); // calienta conexión
  const session = await p4.evaluate(() => Object.keys(localStorage).find((k) => k.includes("auth-token")));
  const uid = JSON.parse(await p4.evaluate((k) => localStorage.getItem(k), session)).user.id;
  await admin.from("profiles").insert({ id: uid, username: `link.${RUN}`.slice(0, 20), full_name: "Link Mail", birth_date: "1995-02-02", instagram_username: "escrito.a.mano" });
  await p4.goto(`${B}/profile/edit`, { waitUntil: "networkidle" });
  await p4.waitForSelector("text=Conectar Instagram");
  assert((await p4.inputValue('input[placeholder="tu.usuario"]')) === "escrito.a.mano", "editor: @ manual (sin verificar)");
  await p4.click("text=Conectar Instagram");
  await p4.waitForURL("**/profile/edit", { timeout: 20000 });
  await p4.waitForSelector("text=Instagram conectado ✓");
  await p4.waitForSelector(`text=@${igUser2}`);
  assert(!p4.url().includes("instagram="), "conectar desde el editor → vuelve al editor con aviso");
  const { data: linked } = await admin.from("profiles").select("instagram_username, instagram_verified").eq("id", uid).single();
  assert(linked.instagram_username === igUser2 && linked.instagram_verified, "el @ manual se reemplaza por la cuenta conectada (verificada)");
  await p4.click('button[aria-label="Desconectar Instagram"]');
  await p4.waitForSelector("text=Instagram desconectado");
  const { data: gone } = await admin.from("instagram_accounts").select("user_id").eq("user_id", uid);
  const { data: after } = await admin.from("profiles").select("instagram_username").eq("id", uid).single();
  assert(gone.length === 0 && after.instagram_username === null, "desconectar borra el token y saca el @");

  // ── Instagram ya usado por otra cuenta ──
  await identity({ id: igId, username: igUser });
  await p4.click("text=Conectar Instagram");
  await p4.waitForSelector("text=Esa cuenta de Instagram ya está conectada a otro perfil de ROUGE.");
  assert(true, "una cuenta de Instagram no se puede conectar a dos perfiles");

  // ── Google: el botón abre el OAuth de Supabase con la vuelta correcta ──
  const p5 = await (await browser.newContext()).newPage(); watch(p5, "google");
  let authorize = null;
  await p5.route(`${SUPABASE_URL}/auth/v1/authorize**`, (route) => { authorize = route.request().url(); route.fulfill({ status: 200, body: "ok" }); });
  await p5.goto(`${B}/login?next=/join/bresh-sabado`, { waitUntil: "networkidle" });
  await p5.click("text=Continuar con Google");
  await p5.waitForTimeout(1500);
  const a = authorize ? new URL(authorize) : null;
  log("  authorize →", authorize && decodeURIComponent(authorize).slice(0, 160));
  assert(a?.searchParams.get("provider") === "google" && a.searchParams.get("redirect_to") === `${B}/login?as=attendee&next=%2Fjoin%2Fbresh-sabado`, "Google → /auth/v1/authorize?provider=google con vuelta a /login (y next)");

  log("errores:", errors.length ? errors : "ninguno");
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 5).join(" | ")); console.log("errores:", errors); process.exit(1); });
