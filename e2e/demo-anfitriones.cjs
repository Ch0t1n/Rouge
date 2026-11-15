// Demo · página para anfitriones (/demo) y modo presentador (teléfono + panel lado a lado, sincronizados).
const { chromium } = require("playwright");
const { BASE: B, OUT: SP } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); watch(p, "hub");

  // Hub
  await p.goto(`${B}/demo`, { waitUntil: "networkidle" });
  assert(await p.isVisible("text=Mostrá ROUGE en vivo"), "/demo: página para anfitriones");
  assert((await p.locator("#guion ~ ol > li, ol > li").count()) >= 7, "guion de 7 pasos");
  const robots = await p.getAttribute('meta[name="robots"]', "content");
  assert(/noindex/.test(robots ?? ""), "/demo no se indexa en buscadores");

  // Abrir una vista "como" un rol en pestaña nueva
  const [tab] = await Promise.all([ctx.waitForEvent("page"), p.click('a:has-text("Barra / comandas")')]);
  watch(tab, "tab");
  await tab.waitForURL("**/admin/bar-pos");
  await tab.waitForSelector("text=Barra / Comandas");
  assert(await tab.isVisible("aside >> text=Daniela Ortiz"), "abre comandas como Daniela (Barra) sin login");
  await tab.close();
  // La pestaña del hub conserva su persona (la nueva pestaña no la pisó)
  await p.goto(`${B}/app`, { waitUntil: "networkidle" });
  assert(await p.isVisible("text=Hola, Sofía"), "la pestaña original sigue siendo Sofía");

  // Modo presentador
  await p.goto(`${B}/demo/presentador`, { waitUntil: "networkidle" });
  const phone = p.frameLocator('iframe[title^="App de"]');
  const panel = p.frameLocator('iframe[title^="Panel de"]');
  await phone.locator("text=Hola, Sofía").waitFor({ timeout: 20000 });
  await panel.locator("text=Embudo de la noche").waitFor({ timeout: 20000 });
  assert(true, "presentador: teléfono como Sofía y panel como Paula, a la vez");

  // Paso 4 (Seguridad): rescate en el teléfono → alerta en el panel de Seguridad, en vivo
  for (let i = 0; i < 3; i++) await p.click('button[aria-label="Paso siguiente"]');
  await p.waitForSelector("text=4/7 · Seguridad");
  await phone.locator('button:has-text("Rescate")').first().waitFor({ timeout: 20000 });
  await panel.locator("text=Alertas de rescate").waitFor({ timeout: 20000 });
  await phone.locator('button:has-text("Rescate")').first().click();
  await panel.locator('[role="alert"] >> text=Sofía').waitFor({ timeout: 15000 });
  assert(true, "rescate en el teléfono → alerta en vivo en el panel de Seguridad");
  await p.screenshot({ path: `${SP}/presentador.png` });

  // Cambiar el rol del panel y la Pantalla LED
  await p.click('button:has-text("🍸 Barra")');
  await panel.locator("text=Barra / Comandas").waitFor({ timeout: 20000 });
  assert(true, "panel cambia a Barra");
  await p.click('button:has-text("LED")');
  await panel.locator("text=/Matches|MATCHES/").first().waitFor({ timeout: 20000 });
  assert(true, "panel muestra la Pantalla LED");

  // Reiniciar: el rescate desaparece
  await p.click('button:has-text("Reiniciar")');
  await p.waitForSelector("text=1/7 · El problema");
  await phone.locator("text=Hola, Sofía").waitFor({ timeout: 20000 });
  const state = await p.evaluate(() => JSON.parse(localStorage.getItem("rouge:state")));
  const sofi = state.squad_members.find((m) => m.user_id.endsWith("000000000001"));
  assert(sofi && sofi.safety_status === "ok", "reiniciar vuelve la fiesta al estado inicial");

  log("errores:", errors.length ? errors : "ninguno");
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n")[0]); process.exit(1); });
