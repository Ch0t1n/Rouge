// Demo · ROUGE PRO Fase 1: ficha ejecutiva, panel rápido al entrar, pase corporativo con vCard (.vcf) y escáner multi-zona.
const fs = require("fs");
const { chromium } = require("playwright");
const { BASE: B, OUT: SP } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PRO = id(1100);
const open = (role, path) => `${B}/demo/abrir?rol=${role}&a=${encodeURIComponent(path)}`;
const read = async (dl) => fs.readFileSync(await dl.path(), "utf8");
/** El QR de acceso rotativo vigente de una persona (lo que muestra su celular en "Mi pase"). */
async function liveToken(page) {
  await page.goto(`${B}/app`, { waitUntil: "networkidle" });
  await page.click('[data-testid="my-pass"]');
  await page.waitForSelector('[data-testid="pass-qr"][data-pass-value^="ROUGE:PASS2:"]');
  return page.getAttribute('[data-testid="pass-qr"]', "data-pass-value");
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });

  // ── Sofía en el encuentro pyme: ficha ejecutiva, sin rastro de la noche ──
  const ph = await ctx.newPage(); watch(ph, "sofi");
  await ph.goto(`${B}/app`, { waitUntil: "networkidle" });
  await ph.goto(`${B}/join/PYME26`, { waitUntil: "networkidle" });
  await ph.click("text=Volver al lobby");
  await ph.waitForURL("**/lobby");
  await ph.goto(`${B}/profile`, { waitUntil: "networkidle" });
  await ph.waitForSelector('[data-testid="executive-card"]');
  const mine = await ph.textContent("main");
  assert(mine.includes("Estudio Benítez") && mine.includes("Qué busco") && mine.includes("Qué ofrezco"), "Así te ven: ficha ejecutiva con cargo, empresa, qué busco y qué ofrezco");
  assert(!/Música|Sonando en su cabeza|Completá tu perfil|@sofi/.test(mine), "sin música, Spotify, completitud de la noche ni @ de la cuenta");
  await ph.screenshot({ path: `${SP}/pro-ficha-propia.png`, fullPage: true });
  // Editar la ficha en el panel rápido
  await ph.click('[data-testid="edit-corporate-profile"]');
  await ph.fill('[role="dialog"] input[placeholder="Soluciones de automatización y cloud"]', "Tiendas online llave en mano");
  await ph.click('[data-testid="save-corporate-profile"]');
  await ph.waitForSelector("text=Ficha actualizada");
  assert((await ph.textContent('[data-testid="executive-card"]')).includes("Tiendas online llave en mano"), "el panel rápido edita la ficha (detalle de lo que ofrece)");

  // Perfil de Carla: contacto visible (nivel networking), sin Squad ni Rescate, guardar .vcf
  await ph.goto(`${B}/u/carla.textil`, { waitUntil: "networkidle" });
  await ph.waitForSelector('[data-testid="executive-card"]');
  const carla = await ph.textContent("main");
  assert(carla.includes("carla@textilnorte.com.ar") && carla.includes("textilnorte.com.ar"), "nivel networking: Sofía (asiste) ve el email y el sitio de Carla");
  assert(!/Invitar a mi|Squad|Rescate/.test(carla), "en corporativo no aparecen Squad ni Rescate en el perfil");
  const [vcf] = await Promise.all([ph.waitForEvent("download"), ph.click('[data-testid="save-vcard"]')]);
  assert(vcf.suggestedFilename() === "carla-medina.vcf", "descarga carla-medina.vcf");
  const card = await read(vcf);
  assert(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n") && card.includes("ORG:Textil Norte") && card.includes("EMAIL;TYPE=INTERNET,WORK:carla@textilnorte.com.ar"), "vCard 3.0 válida con empresa y email");
  assert(card.includes("NOTE:NETWORKING: Conocido en Encuentro Pyme Conecta"), "nota automática: Conocido en <evento>");
  await ph.screenshot({ path: `${SP}/pro-ficha-carla.png`, fullPage: true });

  // Perfil de Laura (strict, sin reunión): sin contacto, con el aviso de privacidad
  await ph.goto(`${B}/u/laura.rrhh`, { waitUntil: "networkidle" });
  assert(await ph.isVisible("text=Email y teléfono se comparten al aceptar una reunión"), "strict: avisa que el contacto se comparte tras una reunión");

  // Pase corporativo: QR de acceso ⇄ tarjeta vCard y "Guardar contacto (.vcf)"
  await ph.goto(`${B}/app`, { waitUntil: "networkidle" });
  await ph.click('[data-testid="my-pass"]');
  await ph.waitForSelector('[data-testid="corporate-pass"]');
  const pass = await ph.textContent('[data-testid="corporate-pass"]');
  assert(pass.includes("ASISTENTE") && pass.includes("QR de Acceso"), "pase con categoría (ASISTENTE) y QR de acceso");
  assert(pass.includes("Tus accesos") && pass.includes("Auditorio A"), "muestra a qué zonas puede pasar");
  assert(/Cambia en \d+s · capturas no sirven/.test(pass), "el QR de acceso es rotativo (cambia cada 30 s)");
  await ph.click('[data-testid="pass-mode-vcard"]');
  await ph.waitForSelector("text=se guarda en sus contactos");
  await ph.screenshot({ path: `${SP}/pro-pase-vcard.png` });
  await ph.click('[role="switch"]:has-text("Teléfono de contacto")');
  const [mineVcf] = await Promise.all([ph.waitForEvent("download"), ph.click('[data-testid="download-my-vcard"]')]);
  const myCard = await read(mineVcf);
  assert(myCard.includes("FN:Sofía Benítez") && myCard.includes("EMAIL;TYPE=INTERNET,WORK:sofia@estudiobenitez.com.ar") && !myCard.includes("TEL"), "mi tarjeta: con email y sin el teléfono que destildé");

  // ── Camila (sin ficha profesional) entra al encuentro: el panel rápido se abre solo ──
  const cami = await ctx.newPage(); watch(cami, "cami");
  await cami.addInitScript(() => { window.name = "rouge-persona:00000000-0000-4000-8000-000000000002"; });
  await cami.goto(`${B}/join/PYME26`, { waitUntil: "networkidle" });
  await cami.waitForSelector('[role="dialog"] >> text=Tu ficha para Encuentro Pyme Conecta');
  assert(true, "primera vez en un evento corporativo sin ficha: se abre el panel rápido");
  await cami.fill('[role="dialog"] input[placeholder="Directora comercial"]', "Productora audiovisual");
  await cami.fill('[role="dialog"] input[placeholder="Grupo Meridia"]', "Beats Studio");
  await cami.click('[role="dialog"] button:has-text("Clientes")');
  await cami.click('[data-testid="save-corporate-profile"]');
  await cami.waitForSelector("text=Ficha ejecutiva creada");
  await cami.click('button:has-text("Haciendo networking")');
  await cami.click('button:has-text("Entrar al evento")');
  await cami.waitForURL("**/lobby");
  assert(true, "con la ficha recién creada entra al networking");

  // ── Seguridad: zona de control obligatoria y validación por categoría ──
  const door = await ctx.newPage(); watch(door, "seguridad");
  await door.setViewportSize({ width: 390, height: 844 });
  await door.goto(open("seguridad", "/admin/door"), { waitUntil: "networkidle" });
  await door.locator("select:visible").first().selectOption(PRO);
  await door.waitForSelector('h1:has-text("Puerta y zonas")');
  assert((await door.locator('[data-testid="zone-option"]').count()) === 5, "selector de zona con las 5 zonas del evento");
  assert(await door.isVisible("text=Elegí en qué zona estás controlando"), "sin zona elegida no se puede escanear");
  assert(!(await door.isVisible('input[placeholder="Código de la entrada"]')), "el campo de código aparece recién con una zona");
  await door.click('[data-testid="zone-option"]:has-text("Sala VIP")');
  // Una captura del pase fijo no sirve: el evento usa QR rotativo.
  await door.fill('input[placeholder="Código de la entrada"]', `ROUGE:PASS:${PRO}:${id(10)}`);
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="expired_pass"]');
  assert((await door.textContent('[data-testid="door-result"]')).includes("Pase vencido"), "QR rotativo: el pase fijo (o una captura vieja) se rechaza");
  await door.fill('input[placeholder="Código de la entrada"]', await liveToken(ph));
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="zone_denied"]');
  const denied = await door.textContent('[data-testid="door-result"]');
  assert(denied.includes("Acceso denegado para esta zona") && denied.includes("Requiere VIP / SPEAKER / SPONSOR") && denied.includes("Sofía Benítez"), "rojo: denegado en Sala VIP, con el requisito y el nombre");
  await door.screenshot({ path: `${SP}/pro-zona-denegada.png` });
  const tomas = await ctx.newPage(); watch(tomas, "tomas");
  await tomas.addInitScript(() => { window.name = "rouge-persona:00000000-0000-4000-8000-000000000010"; });
  await door.fill('input[placeholder="Código de la entrada"]', await liveToken(tomas));
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="ok"]');
  const ok = await door.textContent('[data-testid="door-result"]');
  assert(ok.includes("Acceso permitido") && ok.includes("Aguirre Capital") && ok.includes("VIP") && !/años/.test(ok), "verde: permitido con nombre, empresa y categoría (sin edad)");
  await door.screenshot({ path: `${SP}/pro-zona-permitida.png` });
  const reads = await door.textContent('[data-testid="zone-log"]');
  assert(reads.includes("Sala VIP") && reads.includes("Pasó"), "las lecturas quedan en el registro");

  // ── Dueña: categoría en el CRM → Sofía pasa a SPEAKER y entra a la Sala VIP ──
  const crm = await ctx.newPage(); watch(crm, "duena");
  await crm.setViewportSize({ width: 1280, height: 900 });
  await crm.goto(open("duena", "/admin/crm"), { waitUntil: "networkidle" });
  await crm.locator("select:visible").first().selectOption(PRO);
  await crm.waitForSelector('select[aria-label="Categoría de Sofía Benítez"]');
  await crm.selectOption('select[aria-label="Categoría de Sofía Benítez"]', "speaker");
  await crm.waitForSelector("text=ahora es SPEAKER");
  await door.reload({ waitUntil: "networkidle" });
  await door.fill('input[placeholder="Código de la entrada"]', await liveToken(ph));
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="ok"]');
  assert((await door.textContent('[data-testid="door-result"]')).includes("SPEAKER"), "con categoría SPEAKER, Sofía pasa a la Sala VIP");

  // ── Corporativo: sin Rescate; los equipos los arma la organización ──
  await ph.goto(`${B}/squad`, { waitUntil: "networkidle" });
  const team = await ph.textContent("main");
  assert(team.includes("Mesa 12") && !/Rescate|Llegué a casa|Invitar a mi/.test(team), "equipo sin Rescate, sin 'Llegué a casa' y sin invitar (lo arma la organización)");
  await ph.goto(`${B}/map`, { waitUntil: "networkidle" });
  assert(!(await ph.isVisible('button:has-text("Rescate")')), "el plano corporativo no tiene Botón de Rescate");
  await crm.goto(open("duena", "/admin/events"), { waitUntil: "networkidle" });
  await crm.locator("select:visible").first().selectOption(PRO);
  await crm.waitForSelector('[data-testid="organizer-teams"]');
  await crm.fill('input[placeholder="Mesa 3 · Ronda de negocios"]', "Mesa 3 · Logística");
  await crm.click('[data-testid="create-team"]');
  await crm.waitForSelector('[data-testid="organizer-teams"] >> text=Mesa 3 · Logística');
  const add = crm.locator('[data-testid="organizer-teams"] li:has-text("Mesa 3 · Logística") select');
  await add.selectOption({ label: "Héctor Giménez" });
  await crm.waitForSelector("text=Héctor se sumó a Mesa 3 · Logística");
  assert(true, "la organización crea un equipo y suma gente desde el panel");
  await crm.screenshot({ path: `${SP}/pro-equipos-organizacion.png`, fullPage: true });
  const hector = await ctx.newPage(); watch(hector, "hector");
  await hector.addInitScript(() => { window.name = "rouge-persona:00000000-0000-4000-8000-000000000025"; });
  await hector.goto(`${B}/squad`, { waitUntil: "networkidle" });
  assert((await hector.textContent("main")).includes("Mesa 3 · Logística"), "la persona sumada ve su equipo en la app");

  await browser.close();
  assert(errors.length === 0, `sin errores de consola${errors.length ? ": " + errors.join(" | ") : ""}`);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 6).join(" / ")); process.exit(1); });
