// Demo · lobby por afinidad, conexiones, Rompehielos, Ghost Mode, chat 1:1, ingreso por códigos
const { chromium, devices } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO } = require("./env.cjs");

const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"] });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(m.text()));
  const card = (name) => p.locator(`[aria-label="Ver perfil de ${name}"]`).locator("..");

  // ── Lobby ──
  await p.goto(`${B}/lobby`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Afines a vos esta noche");
  const names = await p.$$eval('[aria-label^="Ver perfil de "]', (els) => els.map((e) => e.getAttribute("aria-label").replace("Ver perfil de ", "")));
  log("grilla:", names.length, "→", names.map((n) => n.split(" ")[0]).join(", "));
  log("sin bloqueado/ghost:", !names.some((n) => /Gonzalo|Valentina/.test(n)));
  await p.screenshot({ path: `${SP}/p3-lobby.png` });

  // Like recíproco (Lucas ya conectó) → Match
  await card("Lucas Ferreyra").locator('button[aria-label^="Aceptar a"]').click();
  await p.waitForSelector("text=¡Es un Match!");
  await p.screenshot({ path: `${SP}/p3-match.png` });
  await p.click("text=Seguir mirando");
  log("✔ match recíproco con Lucas");

  // Conectar normal con Nico
  await card("Nicolás Paredes").locator('button[aria-label^="Conectar con"]').click();
  await p.waitForSelector('[aria-label="Solicitud enviada"]');
  log("✔ conexión enviada a Nico");

  // Filtro zona
  await p.click("text=Coincidieron en tu zona");
  const zone = await p.$$eval('[aria-label^="Ver perfil de "]', (els) => els.length);
  log("filtro zona →", zone, "personas");
  await p.click("text=Coincidieron en tu zona");

  // ── Rompehielos a Bruno? (ya me mandó) → a Joaquín con trago ──
  await p.goto(`${B}/u/fran.cachengue`, { waitUntil: "networkidle" });
  log("fran (only liked) →", (await p.textContent("text=/conectó primero/")).trim());
  await p.goto(`${B}/u/joaco.indie`, { waitUntil: "networkidle" });
  await p.click('[aria-label="Enviar Rompehielos"]');
  await p.fill('[aria-label="Mensaje rompehielos"]', "¿Vos sos el del patio con la remera de M83? 🎸");
  await p.click("#gift-drink");
  await p.click('button[aria-pressed]:has-text("Gin Tonic")');
  await p.screenshot({ path: `${SP}/p3-icebreaker.png` });
  await p.click("text=Disparar Rompehielos");
  await p.waitForSelector("text=Rompehielos enviado");
  log("✔ rompehielos + trago enviado");
  await p.goto(`${B}/u/nico.urbano`, { waitUntil: "networkidle" });
  log("segunda bala →", (await p.textContent("text=/Ya usaste/")).trim());

  // ── Ghost mode ──
  await p.goto(`${B}/lobby`, { waitUntil: "networkidle" });
  await p.click('#ghost');
  await p.waitForSelector("text=Estás en Modo Solo Amigos");
  log("✔ ghost mode on");
  await p.screenshot({ path: `${SP}/p3-ghost.png` });
  await p.click("text=Volver a la grilla");

  // ── Bandeja: rompehielos de Bruno fijado → aceptar y responder ──
  await p.goto(`${B}/inbox`, { waitUntil: "networkidle" });
  const firstCard = await p.locator("article").first().textContent();
  log("primera en bandeja es rompehielos:", /Rompehielos · fijado/.test(firstCard), "| regalo:", /Te regaló/.test(firstCard));
  await p.screenshot({ path: `${SP}/p3-inbox.png` });
  await p.click("text=Aceptar y responder");
  await p.waitForURL("**/chat/**");
  const firstMsg = (await p.locator("p.rounded-3xl").first().textContent()).trim();
  log("primer mensaje del chat = rompehielos:", firstMsg.startsWith("¿Vos sos la que estaba"));
  await p.fill('[aria-label="Mensaje"]', "¡Jaja sí! Dale, te acepto el trago 🍸");
  await p.click('[aria-label="Enviar"]');
  await p.waitForSelector("text=te acepto el trago");
  await p.screenshot({ path: `${SP}/p3-chat.png` });
  log("✔ chat 1:1");

  // ── Otro lado: Joaquín ve el rompehielos con trago ──
  await p.goto(`${B}/app`, { waitUntil: "networkidle" });
  await p.click('[aria-label="Cambiar de persona (Modo Demo)"]');
  await p.click("text=Joaquín Vera");
  await p.goto(`${B}/inbox`, { waitUntil: "networkidle" });
  const jo = await p.locator("article").first().textContent();
  log("Joaquín recibe:", /remera de M83/.test(jo), "| trago:", /Gin Tonic/.test(jo));

  // ── Ingreso por link de Squad con persona nueva ──
  await p.click('[aria-label="Cambiar de persona (Modo Demo)"]').catch(async () => { await p.goto(`${B}/app`); await p.click('[aria-label="Cambiar de persona (Modo Demo)"]'); });
  await p.click("text=Persona nueva");
  await p.waitForURL("**/onboarding");
  await p.goto(`${B}/join/SQ-PIBAS`, { waitUntil: "networkidle" });
  log("join sin perfil →", (await p.textContent("text=Crear mi perfil y entrar")).trim());
  await p.click("text=Crear mi perfil y entrar");
  await p.waitForURL("**/onboarding?next=*");
  await p.fill('input[autocomplete="name"]', "Agus Nueva");
  await p.fill('input[placeholder="sofi.noche"]', "agus.nueva");
  await p.fill('input[type="date"]', "2000-03-03");
  await p.fill('input[type="tel"]', "11 6666-7777");
  await p.click("text=Continuar");
  await p.setInputFiles('[data-testid="photo-input"]', FIXTURE_PHOTO);
  await p.click('[role="dialog"] button:has-text("Usar foto")');
  await p.waitForSelector('img[alt="Foto 1"]', { timeout: 30000 });
  await p.click("text=Continuar");
  await p.click('button[aria-pressed]:has-text("Reggaetón")');
  await p.click("text=Continuar");
  await p.click("text=Entrar a Rouge Pass");
  await p.waitForURL("**/join/SQ-PIBAS");
  log("✔ vuelve a /join tras onboarding");
  await p.screenshot({ path: `${SP}/p3-join.png`, fullPage: true });
  await p.click('role=radio[name*="Voy con amigos"]');
  await p.click("text=Entrar a la fiesta");
  await p.waitForURL("**/lobby");
  await p.goto(B + "/squad", { waitUntil: "networkidle" });
  log("quedó en el squad:", (await p.textContent("h1")).trim());

  // Código inválido
  await p.goto(`${B}/join/XXXX`, { waitUntil: "networkidle" });
  log("inválido →", (await p.textContent("h1")).trim());

  console.log("errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message.split("\n")[0]); process.exit(1); });
