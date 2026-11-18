// Demo · ROUGE PRO: privacidad por contexto, reuniones con sala/pin y la página /pro (switch, modal, pestañas, simulador, leads).
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

  // ── Sofía entra al encuentro pyme con su perfil profesional ───────
  const ph = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage(); watch(ph, "sofi");
  await ph.goto(`${B}/app`, { waitUntil: "networkidle" });
  await ph.goto(`${B}/join/PYME26`, { waitUntil: "networkidle" });
  await ph.click("text=Volver al lobby");
  await ph.waitForURL("**/lobby");

  // Privacidad: Melina ocultó empresa y cargo hasta una reunión; Sofía no los ve.
  await ph.goto(`${B}/u/meli.house`, { waitUntil: "networkidle" });
  const meli = await ph.textContent("main");
  assert(!meli.includes("Duarte & Asoc."), "empresa oculta hasta aceptar una reunión (ajuste de privacidad)");
  assert(!/@meli/.test(meli), "en corporativo no se muestra el @ de la cuenta");

  // Reunión: pedir a Laura en la Sala 1
  await ph.goto(`${B}/u/laura.rrhh`, { waitUntil: "networkidle" });
  await ph.click('button:has-text("Solicitar reunión")');
  await ph.click('button:has-text("Consulta rápida")');
  // "Ahora" choca con la reunión confirmada con Carla: el modal lo avisa antes de enviar.
  assert(await ph.isVisible("text=Ya tenés una reunión confirmada en ese horario"), "el modal avisa un choque con mi agenda antes de enviar");
  await ph.click('[role="dialog"] [role="radiogroup"][aria-label="Horario"] [role="radio"] >> nth=6');
  await ph.click('[role="dialog"] button:has-text("Sala 1")');
  await ph.click('[role="dialog"] button:has-text("Solicitar reunión")');
  await ph.waitForSelector("text=Le pediste una reunión a Laura");
  assert(true, "pedido de reunión con motivo, horario y sala");

  // Aceptar el pedido de Ezequiel → chat con la reunión fijada
  await ph.goto(`${B}/meetings`, { waitUntil: "networkidle" });
  assert(await ph.isVisible("text=Consulta: monotributo"), "Mis reuniones muestra el pedido para responder");
  await ph.click('button:has-text("Aceptar")');
  await ph.waitForSelector("text=Reunión confirmada");
  await ph.click('[role="tab"]:has-text("Próximas")');
  assert(await ph.isVisible("text=Sala 2"), "la reunión aceptada queda en Próximas con su sala");
  await ph.click('a:has-text("Chat") >> nth=0');
  await ph.waitForURL("**/chat/**");
  assert(await ph.isVisible("text=/Reunión \\d{2}:\\d{2}/"), "el chat muestra la reunión fijada");
  await ph.screenshot({ path: `${SP}/pro-chat-reunion.png` });

  // Ajustes de privacidad
  await ph.goto(`${B}/settings/privacy`, { waitUntil: "networkidle" });
  await ph.click("#pin-squad-only");
  await ph.waitForSelector("text=Tu ubicación: solo tu Squad");
  assert(await ph.locator("#pin-squad-only[aria-checked=true]").count(), "pin solo para el Squad (ajuste guardado)");

  // ── ROUGE PRO (/pro): switch desde la landing, modal de demo, pestañas, simulador y API de leads ──
  const home = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); watch(home, "home");
  await home.goto(`${B}/`, { waitUntil: "networkidle" });
  await home.click('nav[aria-label="Modo de ROUGE"] >> text=PRO');
  await home.waitForURL("**/pro");
  assert(await home.isVisible("text=El sistema operativo para eventos corporativos"), "el switch Nightlife ⇄ PRO del header lleva a /pro");
  const web = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(web, "pro");
  await web.goto(`${B}/empresas`, { waitUntil: "networkidle" });
  assert(web.url().endsWith("/pro"), "/empresas redirige a /pro");
  assert((await web.title()).startsWith("ROUGE PRO | Plataforma Integral"), "/pro: metadata con el título ejecutivo");
  // Modal de demo desde el navbar: valida antes de enviar y cierra con Escape
  await web.click('header button:has-text("Solicitar Demo")');
  const dialog = web.locator('[role="dialog"]');
  await dialog.waitFor();
  await dialog.locator('button[type="submit"]').click();
  assert(await dialog.locator("text=Contanos tu nombre.").isVisible(), "el modal de demo valida antes de enviar");
  await web.keyboard.press("Escape");
  assert((await dialog.count()) === 0, "el modal se cierra con Escape");
  // Pestañas de casos de uso con teclado
  await web.click('[role="tab"]:has-text("Congresos y cumbres")');
  await web.keyboard.press("ArrowRight");
  assert(await web.locator('[role="tab"][aria-selected="true"]:has-text("Ferias y exposiciones")').count(), "casos de uso: pestañas navegables con flechas");
  // Simulador: cambiar de momento actualiza el embudo
  await web.click('[role="radio"]:has-text("09:00 · Apertura")');
  assert(await web.locator("#simulador >> text=142").count(), "el simulador del organizador se actualiza por momento");
  // Tablero de salas: una sala ocupada no se puede reservar
  await web.click('button[aria-label="Directorio A 15:00: ocupada"]');
  assert(await web.isVisible("text=el sistema no permite la doble reserva"), "tablero de salas: sin doble reserva");
  const r = await web.request.post(`${B}/api/leads`, { data: { name: "A", company: "", email: "x", event_type: "boda", attendees: 1 } });
  assert(r.status() === 422, "la API de leads rechaza datos inválidos (422)");
  // Celular: sin scroll horizontal
  const mob = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); watch(mob, "pro-mobile");
  await mob.goto(`${B}/pro`, { waitUntil: "networkidle" });
  assert((await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "/pro: sin scroll horizontal en el celular");
  await mob.screenshot({ path: `${SP}/pro-mobile.png`, fullPage: true });

  assert(errors.length === 0, `sin errores de consola${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
