// Demo · landing, login por tipo de usuario, permisos por rol, equipo, QR, Instagram/Google simulados
// E2E demo: landing, login por tipo de usuario, permisos por rol en /admin, equipo, QR y hoja imprimible.
const { chromium } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO } = require("./env.cjs");

const fs = require("fs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage(); watch(p, "main");

  // Landing pública
  await p.goto(`${B}/`, { waitUntil: "networkidle" });
  assert(await p.isVisible("text=conectada."), "landing: hero");
  assert(await p.isVisible("text=Cada tipo de usuario entra a su pantalla."), "landing: sección de roles");
  assert((await p.locator('img[src^="/landing/"]').count()) >= 5, "landing: capturas reales de la app");
  await p.click("header >> text=Entrar");
  await p.waitForURL("**/login");

  // Login como asistente → /app
  await p.click("text=Sofía");
  await p.waitForURL("**/app");
  await p.waitForSelector("text=Hola, Sofía");
  assert(!(await p.isVisible("text=Panel del equipo")), "asistente: sin acceso al panel desde el inicio");
  // QR de invitación al evento
  await p.click('[aria-label="QR para invitar al evento"]');
  await p.waitForSelector('[role="dialog"] canvas');
  const dl = p.waitForEvent("download");
  await p.click("text=Descargar QR (PNG)");
  const file = await dl;
  const path = `${SP}/qr-evento.png`;
  await file.saveAs(path);
  const head = fs.readFileSync(path).subarray(0, 8).toString("hex");
  assert(head === "89504e470d0a1a0a", `QR descargado como PNG (${file.suggestedFilename()})`);
  assert((await p.getAttribute('[role="dialog"] a:has-text("WhatsApp")', "href")).startsWith("https://wa.me/?text="), "compartir por WhatsApp");
  await p.keyboard.press("Escape");
  // El asistente no entra al panel
  await p.goto(`${B}/admin/crm`, { waitUntil: "networkidle" });
  assert(await p.isVisible("text=Esta sección no es para tu rol"), "asistente en /admin/crm → sin acceso");

  // Squad: QR de invitación
  await p.goto(`${B}/squad`, { waitUntil: "networkidle" });
  await p.click('button:has-text("Invitar a mi Squad")');
  await p.click('[role="dialog"] button:has-text("QR")');
  await p.waitForSelector('[role="dialog"] >> text=/Sumate a/');
  assert(await p.isVisible('[role="dialog"] canvas'), "squad: QR del link de invitación");
  await p.keyboard.press("Escape");

  // Barra: login de equipo → comandas; no ve CRM ni blasts
  await p.goto(`${B}/login?as=staff`, { waitUntil: "networkidle" });
  await p.click("text=Daniela Ortiz");
  await p.waitForURL("**/admin/bar-pos");
  await p.waitForSelector("text=Barra / Comandas");
  const navB = await p.locator('aside nav a').allTextContents();
  assert(JSON.stringify(navB) === JSON.stringify(["Barra / POS", "Pantalla LED"]), `barra: menú filtrado ${JSON.stringify(navB)}`);
  await p.goto(`${B}/admin/blasts`, { waitUntil: "networkidle" });
  assert(await p.isVisible("text=Esta sección no es para tu rol"), "barra en /admin/blasts → sin acceso");
  await p.click("text=Ir a mi pantalla");
  await p.waitForURL("**/admin/bar-pos");
  // La barra canjea un QR de perk desde la ventanilla
  await p.fill('input[placeholder="Código de retiro o QR de perk"]', "ROUGE:FREE_DRINK:DEMO000001");
  await p.click("text=Entregar");
  await p.waitForSelector("text=/canjeado|ya fue canjeado|inválido/");
  log("  ventanilla →", (await p.locator('[role="status"], [role="alert"]').allTextContents()).join(" | ").slice(0, 120));

  // Seguridad → resumen con alertas de rescate
  await p.goto(`${B}/login?as=staff`, { waitUntil: "networkidle" });
  await p.click("text=Marta Gómez");
  await p.waitForURL("**/admin");
  await p.waitForSelector("text=Alertas de rescate");
  assert(!(await p.isVisible("text=Ventas por la app")), "seguridad: no ve ventas");
  const navS = await p.locator('aside nav a').allTextContents();
  assert(!navS.includes("CRM") && navS.includes("Resumen"), `seguridad: menú ${JSON.stringify(navS)}`);
  await p.screenshot({ path: `${SP}/roles-security.png` });

  // Dueña → equipo + QRs
  await p.goto(`${B}/login?as=staff&next=/admin/events`, { waitUntil: "networkidle" });
  await p.click("text=Paula Ferrari");
  await p.waitForURL("**/admin/events");
  await p.waitForSelector("text=Equipo del evento");
  await p.fill('input[placeholder="dani.barra"]', "@cami.beats");
  await p.selectOption('select[aria-label="Rol"]', "waiter");
  await p.click('button:has-text("Sumar")');
  await p.waitForSelector('select[aria-label="Rol de @cami.beats"]');
  assert((await p.inputValue('select[aria-label="Rol de @cami.beats"]')) === "waiter", "dueña suma a @cami.beats como mozo/a");
  await p.click('[aria-label="Ver QR del link maestro"]');
  await p.waitForSelector('[role="dialog"] canvas');
  assert(await p.isVisible('[role="dialog"] >> text=BRESH26'), "QR del link maestro con su código");
  await p.keyboard.press("Escape");
  await p.click('button:has-text("Generar lote")');
  await p.waitForSelector("text=/códigos generados/");
  await p.locator('button[aria-label^="QR de "]').first().click();
  await p.waitForSelector('[role="dialog"] >> text=/Entrada /');
  assert(await p.isVisible('[role="dialog"] canvas'), "QR de un código de 1 uso");
  await p.keyboard.press("Escape");
  await p.screenshot({ path: `${SP}/roles-team.png`, fullPage: true });
  await p.click("text=Imprimir QRs");
  await p.waitForURL("**/admin/print-codes**");
  const cards = await p.locator("main ul > li svg").count();
  assert(cards >= 12, `hoja imprimible con ${cards} QRs`);
  await p.screenshot({ path: `${SP}/print-codes.png` });

  // Cami ahora es mozo/a: entra a comandas
  await p.goto(`${B}/login?as=staff`, { waitUntil: "networkidle" });
  await p.click("text=Camila Ríos");
  await p.waitForURL("**/admin/bar-pos");
  assert(true, "@cami.beats (mozo/a) entra directo a comandas");

  // Producción no puede armar el equipo
  await p.goto(`${B}/login?as=staff&next=/admin/events`, { waitUntil: "networkidle" });
  await p.click("text=Luciano Paz");
  await p.waitForURL("**/admin/events");
  await p.waitForTimeout(400);
  assert(!(await p.isVisible("text=Equipo del evento")), "producción no ve el panel de equipo");

  // Demo: login con Instagram simulado → onboarding con fotos del feed → @ verificado en el perfil
  const ig = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage(); watch(ig, "ig-demo");
  await ig.goto(`${B}/login`, { waitUntil: "networkidle" });
  await ig.click("text=Continuar con Instagram");
  await ig.waitForURL("**/onboarding**");
  const sug = await ig.inputValue('input[placeholder="sofi.noche"]');
  assert(/^noche\.\d{3}$/.test(sug), `demo: @username sugerido desde Instagram (${sug})`);
  await ig.fill('input[autocomplete="name"]', "Demo Insta");
  await ig.fill('input[type="date"]', "1999-09-09");
  await ig.click('role=radio[name="Mujer"]');
  await ig.fill('input[type="tel"]', "11 4777-1234");
  await ig.click("text=Continuar");
  await ig.waitForSelector("text=Tu mejor versión");
  await ig.click("text=/Importar de Instagram/");
  await ig.click('[aria-label="Foto de Instagram demo-2"]');
  await ig.click("text=Agregar 1 foto");
  await ig.waitForSelector('img[alt="Foto 1"]', { timeout: 20000 });
  assert(true, "demo: foto importada del feed de Instagram");
  await ig.click("text=Continuar");
  await ig.click('button[aria-pressed]:has-text("House")');
  await ig.click("text=Continuar");
  await ig.click("text=Entrar a ROUGE");
  await ig.waitForURL("**/app");
  await ig.goto(`${B}/profile`, { waitUntil: "networkidle" });
  assert(await ig.isVisible(`text=@${sug}`) && await ig.isVisible("text=Cuenta conectada"), "demo: el perfil muestra el Instagram verificado");
  await ig.screenshot({ path: `${SP}/ig-demo-profile.png` });
  // Perfil de otra persona con Instagram conectado y una con el @ escrito a mano
  await ig.goto(`${B}/u/cami.beats`, { waitUntil: "networkidle" });
  assert(await ig.isVisible("text=@cami.beats"), "demo: el Instagram aparece en el perfil de los demás");
  // Editor: desconectar
  await ig.goto(`${B}/profile/edit`, { waitUntil: "networkidle" });
  await ig.click('button[aria-label="Desconectar Instagram"]');
  await ig.waitForSelector("text=Conectar Instagram");
  assert(true, "demo: desconectar Instagram desde el editor");
  // Google simulado
  await ig.goto(`${B}/login`, { waitUntil: "networkidle" });
  await ig.click("text=Continuar con Google");
  await ig.waitForURL("**/onboarding**");
  assert(true, "demo: Continuar con Google → onboarding");

  // Móvil: landing sin scroll horizontal
  const m = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true })).newPage(); watch(m, "mobile");
  await m.goto(`${B}/`, { waitUntil: "networkidle" });
  assert((await m.evaluate(() => document.documentElement.scrollWidth)) <= 375, "landing móvil sin scroll horizontal");

  log("errores:", errors.length ? errors : "ninguno");
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
