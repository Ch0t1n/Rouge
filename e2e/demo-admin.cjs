// Demo · panel del organizador: eventos, códigos, CRM, blasts, sorteo, comandas, Pantalla LED
const { chromium, devices } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO } = require("./env.cjs");

const fs = require("fs");
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  // Teléfono de Sofía (misma "nube" demo = mismo contexto)
  const phone = await ctx.newPage(); watch(phone, "sofi");
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${B}/app`, { waitUntil: "networkidle" });
  const admin = await ctx.newPage(); watch(admin, "admin");
  // El panel exige rol: esta pestaña actúa como la dueña del evento (Paula)
  await admin.addInitScript(() => sessionStorage.setItem("rouge:persona", "00000000-0000-4000-8000-000000000999"));

  // Resumen
  await admin.goto(`${B}/admin`, { waitUntil: "networkidle" });
  await admin.waitForSelector("text=Embudo de la noche");
  await admin.screenshot({ path: `${SP}/p5-overview.png` });
  log("✔ resumen con ROI");

  // Eventos: crear + códigos + CSV
  await admin.goto(`${B}/admin/events`, { waitUntil: "networkidle" });
  await admin.click("text=Nuevo evento");
  await admin.fill('input[placeholder="ROUGE Night × Bresh"]', "Neon Sunday Rooftop");
  await admin.fill('input[placeholder="Club · Barrio"]', "Terraza Norte · Belgrano");
  await admin.click("text=Agregar set");
  await admin.locator('label:has-text("Artista") + div input, input').filter({ hasText: "" });
  const artist = admin.locator("li input").first();
  await artist.fill("Luna Vega");
  await admin.click("text=Crear evento");
  await admin.waitForSelector("text=/Evento creado: Neon Sunday/");
  log("✔ evento creado →", (await admin.textContent("text=/Link maestro: \\/join\\//")).trim());
  // Volver al evento principal
  await admin.click('button:has-text("ROUGE Night × Bresh Sábado")');
  const before = Number((await admin.textContent("text=/Todos · \\d+/")).match(/\d+/)[0]);
  await admin.fill('input[type="number"][max="1000"]', "10");
  await admin.click("text=Generar lote");
  await admin.waitForSelector(`text=Todos · ${before + 10}`);
  log(`✔ códigos de 1 uso: ${before} → ${before + 10}`);
  const [dl] = await Promise.all([admin.waitForEvent("download"), admin.click('button:has-text("CSV")')]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  log("CSV códigos →", dl.suggestedFilename(), "|", csv.split("\n")[0].replace("\uFEFF", ""), "|", csv.split("\n").length - 1, "filas");
  await admin.screenshot({ path: `${SP}/p5-events.png`, fullPage: true });

  // CRM
  await admin.goto(`${B}/admin/crm`, { waitUntil: "networkidle" });
  await admin.fill('input[placeholder^="Buscar"]', "techno");
  log("CRM búsqueda 'techno' →", await admin.locator("tbody tr").count(), "filas");
  await admin.fill('input[placeholder^="Buscar"]', "");
  await admin.click('button:has-text("Top Spender")');
  const top = await admin.locator("tbody tr").count();
  await admin.click('button:has-text("Todos")');
  const [dl2] = await Promise.all([admin.waitForEvent("download"), admin.click("text=/Exportar CSV/")]);
  const crm = fs.readFileSync(await dl2.path(), "utf8").replace("\uFEFF", "");
  log("CRM top spenders:", top, "| CSV cols:", crm.split("\n")[0]);
  await admin.screenshot({ path: `${SP}/p5-crm.png` });

  // Text Blast → banner en el teléfono
  await admin.goto(`${B}/admin/blasts`, { waitUntil: "networkidle" });
  await admin.click("text=⚡ FLASH PROMO · 20 min");
  await admin.click('button[aria-pressed]:has-text("Squads de N+")');
  log("alcance squads 4+ →", (await admin.textContent("text=/Alcance:/")).replace(/\s+/g, " ").trim());
  await admin.screenshot({ path: `${SP}/p5-blasts.png` });
  await admin.click("text=Enviar ahora");
  await admin.waitForSelector("text=/Enviado a \\d+ asistentes/");
  await phone.waitForSelector("text=FLASH PROMO · 20 min", { timeout: 10000 });
  log("✔ el teléfono de Sofía recibió el Flash Promo en vivo");
  await phone.screenshot({ path: `${SP}/p5-phone-blast.png` });

  // Sorteo en vivo
  await admin.goto(`${B}/admin/perks`, { waitUntil: "networkidle" });
  await admin.click('button:has-text("Todos los asistentes")');
  await admin.fill('input[value="Botella de Champagne en el VIP"]', "Fernet libre para tu Squad");
  await admin.click("text=Crear sorteo");
  await admin.locator('div:has(> div > p:text("Fernet libre para tu Squad")) >> text=Sortear ganador').click();
  await admin.waitForSelector("text=/🏆 Ganó/", { timeout: 15000 });
  log("✔ sorteo →", (await admin.textContent("text=/🏆 Ganó/")).trim());
  await admin.screenshot({ path: `${SP}/p5-raffle.png` });
  // Validar un QR de Sofía
  const qr = await admin.evaluate(() => JSON.parse(localStorage.getItem("rouge:state")).user_perks_qrs.find((p) => p.user_id.endsWith("000000000001") && p.status === "available").qr_code_string);
  await admin.fill('input[placeholder^="ROUGE:FREE_DRINK"]', qr);
  await admin.click('button:has-text("Canjear")');
  await admin.waitForSelector("text=/Canjeado:/");
  log("✔ QR validado en barra:", qr);

  // Comandas: pedido desde el teléfono → Kanban
  await phone.goto(`${B}/bar`, { waitUntil: "networkidle" });
  await phone.click('[aria-label="Agregar Aperol Spritz"]');
  await phone.click("text=/Ver pedido/");
  await phone.click('role=radio[name*="Fast-Pickup"]');
  await phone.click("text=/^Pagar .* con Mercado Pago/");
  await phone.click("text=Pagar con dinero en cuenta"); // checkout de Mercado Pago simulado
  await phone.waitForSelector("text=/Retiro · código/");
  const pickup = (await phone.textContent("text=/Retiro · código/")).match(/código (\w+)/)[1];
  await phone.keyboard.press("Escape");
  await admin.goto(`${B}/admin/bar-pos`, { waitUntil: "networkidle" });
  const ticket = admin.locator(`article:has-text("${pickup}")`);
  await ticket.locator("text=Empezar a preparar").click();
  await ticket.locator("text=/Listo · avisar/").click();
  await phone.waitForSelector("text=¡Tu pedido está listo!", { timeout: 10000 });
  log(`✔ pedido ${pickup}: el teléfono recibió "¡Tu pedido está listo!"`);
  await admin.screenshot({ path: `${SP}/p5-kanban.png`, fullPage: true });
  await admin.fill('input[placeholder="Código de retiro o QR de perk"]', pickup);
  await admin.click('button:has-text("Entregar")');
  await admin.waitForSelector(`text=Pedido ${pickup} entregado`);
  log("✔ entregado por código en la ventanilla rápida");

  // Pantalla LED
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await admin.goto(`${B}/admin/live-wall`, { waitUntil: "networkidle" });
  await admin.waitForSelector("text=Matches de la noche");
  await admin.waitForTimeout(1200);
  await admin.screenshot({ path: `${SP}/p5-livewall.png` });
  log("✔ pantalla LED");

  // Admin en celular
  const mob = await ctx.newPage(); watch(mob, "admin-mobile");
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${B}/admin/bar-pos`, { waitUntil: "networkidle" });
  await mob.screenshot({ path: `${SP}/p5-admin-mobile.png` });

  console.log("errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 8).join(" | ")); process.exit(1); });
