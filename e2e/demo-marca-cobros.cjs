// Demo · Marca (logo + colores con vista previa), cobros con Mercado Pago (simulado) y cuentas de la mesa.
const { chromium } = require("playwright");
const { BASE: B, OUT: SP, unlockDemo } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
const open = (role, path) => `${B}/demo/abrir?rol=${role}&a=${encodeURIComponent(path)}`;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await unlockDemo(ctx); // personas y "Simular…" solo tras entrar por /demo
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const cssVar = (p, name) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

  // ── Marca: la dueña elige paleta y guarda ─────────────────────────
  const owner = await ctx.newPage(); watch(owner, "dueña");
  await owner.goto(open("duena", "/admin/brand"), { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Identidad de la marca");
  assert(await owner.isVisible('[data-testid="brand-preview"] img[alt="ROUGE Night"]'), "vista previa con el logo de la marca");
  // Un color ilegible se explica antes de guardar
  const hex = owner.locator('input[aria-label="Color principal en hexadecimal"]').first();
  await hex.fill("#111111");
  await owner.waitForSelector("text=/muy oscuro/");
  assert(await owner.locator('button:has-text("Guardar marca")').isDisabled(), "color oscuro: explica el motivo y no deja guardar");
  await owner.click('button[aria-label="Violeta (#8B5CF6)"] >> nth=0');
  await owner.click('button:has-text("Guardar marca")');
  await owner.waitForSelector("text=Marca actualizada");
  await owner.screenshot({ path: `${SP}/brand-studio.png`, fullPage: true });
  assert(true, "marca guardada con el violeta");

  // ── La app del asistente toma los colores y el logo ───────────────
  const phone = await ctx.newPage(); watch(phone, "sofía");
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(open("asistente", "/app"), { waitUntil: "networkidle" });
  await phone.waitForSelector("text=Hola, Sofía");
  assert((await cssVar(phone, "--c-rouge")) === "139 92 246", "la app usa el color principal de la marca");
  assert(await phone.isVisible('header img[alt="ROUGE Night"]'), "el logo reemplaza al wordmark en el inicio");
  await phone.goto(`${B}/squad`, { waitUntil: "networkidle" });
  const sosBg = await phone.locator('button:has-text("Rescate")').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  assert(sosBg === "rgb(255, 30, 86)", "el botón de Rescate sigue rojo con cualquier marca");
  await phone.goto(`${B}/join/bresh-sabado`, { waitUntil: "networkidle" });
  assert(await phone.isVisible('img[alt="ROUGE Night"]'), "la invitación /join muestra el logo del evento");
  await phone.goto(`${B}/app`, { waitUntil: "networkidle" });
  await phone.screenshot({ path: `${SP}/brand-app.png` });

  // ── Esta edición con otro acento ──────────────────────────────────
  await owner.click('text=Personalizar esta edición');
  await owner.locator('button[aria-label="Lima (#C6FF3D)"]').last().click();
  await owner.click('button:has-text("Guardar en el evento")');
  await owner.waitForSelector("text=Evento personalizado");
  await phone.reload({ waitUntil: "networkidle" });
  assert((await cssVar(phone, "--c-vip")) === "198 255 61", "el acento propio de la edición le gana al de la marca");
  assert((await owner.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-rouge").trim())) === "255 30 86", "el panel del staff queda con los colores de ROUGE");

  // ── Cobros: sin Mercado Pago se paga en la barra; con, checkout ───
  await owner.click('button:has-text("Desconectar")').catch(() => {});
  owner.once("dialog", (d) => d.accept());
  if (await owner.isVisible('button:has-text("Desconectar")')) await owner.click('button:has-text("Desconectar")');
  await owner.waitForSelector("text=/Sin conectar/");
  await phone.goto(`${B}/bar`, { waitUntil: "networkidle" });
  await phone.click('[aria-label="Agregar Agua sin gas"]');
  await phone.click("text=/Ver pedido/");
  assert(await phone.isVisible("text=/^Pedir · pagás/"), "sin Mercado Pago conectado: se paga en la barra");
  await phone.keyboard.press("Escape");
  await owner.click("text=Conectar Mercado Pago (demo)");
  await owner.waitForSelector("text=ROUGE Night (demo)");
  await phone.reload({ waitUntil: "networkidle" });
  await phone.click('[aria-label="Agregar Agua sin gas"]'); // el carrito no sobrevive a recargar
  await phone.click("text=/Ver pedido/");
  await phone.click("text=/^Pagar .* con Mercado Pago/");
  await phone.waitForSelector("text=Mercado Pago · demo");
  await phone.click("text=Ahora no (queda esperando pago)");
  await phone.waitForSelector('[data-testid="order-awaiting"]');
  const pos = await ctx.newPage(); watch(pos, "barra");
  await pos.goto(open("barra", "/admin/bar-pos"), { waitUntil: "networkidle" });
  await pos.waitForSelector("text=/1 esperando pago/");
  assert(!(await pos.locator('article:has-text("Agua sin gas")').count()), "la barra no ve para preparar lo que no se pagó");
  await phone.click('[data-testid="order-awaiting"] >> text=Pagar con Mercado Pago');
  await phone.click("text=Pagar con dinero en cuenta");
  await phone.waitForSelector("text=Pago acreditado");
  await pos.waitForSelector('article:has-text("Agua sin gas") >> text=Pagado con Mercado Pago', { timeout: 10000 });
  assert(true, "pago acreditado → aparece en comandas como pagado");
  await phone.keyboard.press("Escape");

  // ── Cuentas de la mesa ────────────────────────────────────────────
  await phone.goto(`${B}/squad/cuentas`, { waitUntil: "networkidle" });
  await phone.waitForSelector('[data-testid="settle-summary"]');
  assert((await phone.textContent('[data-testid="settle-summary"]')).includes("9.000"), "Sofía: le tienen que devolver $ 9.000");
  assert((await phone.locator('[data-testid="settle-transfer"]').count()) === 3, "3 transferencias para quedar a mano");
  await phone.click("text=Agregar gasto");
  await phone.fill('input[placeholder="Ej: Reserva de la mesa"]', "Reserva de la mesa");
  await phone.fill('input[inputmode="decimal"]', "40000");
  await phone.click("button:has-text('Agregar $')");
  await phone.waitForSelector("text=Gasto agregado");
  assert((await phone.textContent('[data-testid="settle-summary"]')).includes("39.000"), "el gasto nuevo actualiza el saldo (+$ 30.000)");
  await phone.fill('input[placeholder="ej: sofi.noche.mp"]', "sofi.noche.mp");
  await phone.click("section[aria-labelledby=alias] >> text=Guardar");
  await phone.waitForSelector("text=Alias guardado");
  await phone.screenshot({ path: `${SP}/cuentas-sofi.png`, fullPage: true });

  // Camila: copia el alias y marca que pagó; Sofía confirma
  const cami = await ctx.newPage(); watch(cami, "camila");
  await cami.setViewportSize({ width: 390, height: 844 });
  await cami.goto(open("amiga", "/squad/cuentas"), { waitUntil: "networkidle" });
  const mine = cami.locator('[data-testid="settle-transfer"]:has(button:has-text("Ya le pagué"))').first();
  assert(await mine.locator("text=sofi.noche.mp").count(), "Camila ve el alias de Sofía para transferirle");
  await mine.locator("text=Ya le pagué").click();
  await cami.click("role=radio[name*='Mercado Pago']");
  await cami.locator("[role=dialog] button:has-text(\"Ya le pagué\")").last().click();
  await cami.waitForSelector("text=Listo, le avisamos");
  await phone.reload({ waitUntil: "networkidle" });
  await phone.waitForSelector("text=/dice que te pasó/");
  await phone.click("button:has-text('Recibido')");
  await phone.waitForSelector("text=Confirmada ✓");
  assert(true, "Sofía confirma la transferencia de Camila");

  await browser.close();
  assert(errors.length === 0, `sin errores de consola${errors.length ? ": " + errors.join(" | ") : ""}`);
})().catch(async (e) => { console.error("FAIL", e.message.split("\n").slice(0, 12).join(" / ")); process.exit(1); });
