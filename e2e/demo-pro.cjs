// Demo · ROUGE Pro v1.8: privacidad por contexto, reuniones con sala/pin y la página /empresas (con la API de leads).
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

  // ── /empresas: estimador y formulario ─────────────────────────────
  const web = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); watch(web, "empresas");
  await web.goto(`${B}/empresas`, { waitUntil: "networkidle" });
  assert(await web.isVisible("text=Agendar demo / Cotizar evento"), "/empresas: hero con CTA principal");
  assert((await web.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "/empresas: sin scroll horizontal en el celular");
  await web.locator("#attendees-range").fill("9");
  assert(await web.locator("article:has-text('Enterprise') >> text=Recomendado").count(), "estimador: +5.000 asistentes recomienda Enterprise");
  await web.click('a:has-text("Cotizar Enterprise")');
  await web.click('form button[type="submit"]');
  assert(await web.isVisible("text=Contanos tu nombre."), "el formulario valida antes de enviar");
  const r = await web.request.post(`${B}/api/leads`, { data: { name: "A", company: "", email: "x", event_type: "boda", attendees: 1 } });
  assert(r.status() === 422, "la API de leads rechaza datos inválidos (422)");
  await web.screenshot({ path: `${SP}/empresas-mobile.png`, fullPage: true });

  assert(errors.length === 0, `sin errores de consola${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
