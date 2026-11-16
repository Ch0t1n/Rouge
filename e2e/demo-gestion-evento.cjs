// Demo · Gestión del evento por el organizador: menú (agotado / precio), ticket imprimible de una comanda,
// expulsar con bloqueo de reingreso y nueva edición del evento.
const { chromium } = require("playwright");
const { BASE: B, OUT: SP } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
const open = (role, path) => `${B}/demo/abrir?rol=${role}&a=${encodeURIComponent(path)}`;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };

  // ── Menú: agotar el Gin Tonic y cambiar un precio ──────────────────
  const owner = await ctx.newPage(); watch(owner, "dueña");
  await owner.goto(open("duena", "/admin/menu"), { waitUntil: "networkidle" });
  await owner.waitForSelector("text=Menú de la barra");
  const gin = owner.locator('[data-testid="menu-item"]:has-text("Gin Tonic")');
  await gin.locator('[role="switch"]').click();
  await owner.waitForSelector("text=/1 agotados/");
  await owner.locator('[data-testid="menu-item"]:has-text("Cerveza IPA") >> [aria-label="Editar Cerveza IPA"]').click();
  await owner.fill('input[aria-label="Precio"]', "5500");
  await owner.click('button:has-text("Guardar")');
  await owner.waitForSelector("text=Ítem actualizado");
  await owner.screenshot({ path: `${SP}/menu-editor.png`, fullPage: true });
  const phone = await ctx.newPage(); watch(phone, "sofía");
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(open("asistente", "/bar"), { waitUntil: "networkidle" });
  const ginRow = phone.locator('li:has-text("Gin Tonic")').first();
  assert(await ginRow.locator("text=Agotado").count(), "el asistente ve el Gin Tonic agotado y no lo puede agregar");
  assert(await phone.locator('li:has-text("Cerveza IPA") >> text=/5\\.500/').count(), "el precio nuevo llega a la Barra Express");

  // ── Ticket imprimible desde una comanda ───────────────────────────
  const pos = await ctx.newPage(); watch(pos, "barra");
  await pos.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
  await pos.goto(open("barra", "/admin/bar-pos"), { waitUntil: "networkidle" });
  const [ticket] = await Promise.all([ctx.waitForEvent("page"), pos.locator('article a[aria-label^="Imprimir ticket"]').first().click()]);
  watch(ticket, "ticket");
  await ticket.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
  await ticket.reload({ waitUntil: "networkidle" });
  await ticket.waitForSelector('[data-testid="ticket"]');
  await ticket.waitForTimeout(600);
  const text = await ticket.textContent('[data-testid="ticket"]');
  assert(/COMANDA #/.test(text) && /TOTAL/.test(text) && /no válido como factura/.test(text), "ticket con número de comanda, total y aviso de comprobante");
  assert((await ticket.evaluate(() => window.__printed)) >= 1, "el ticket abre la impresión solo");
  await ticket.screenshot({ path: `${SP}/ticket.png`, fullPage: true });
  await ticket.close();

  // ── Expulsar con bloqueo y permitir que vuelva ────────────────────
  await owner.goto(`${B}/admin/crm`, { waitUntil: "networkidle" });
  let dialogs = 0;
  owner.on("dialog", (d) => { dialogs++; d.accept(); });
  await owner.click('button[aria-label="Expulsar a Lucas Fernández"]').catch(async () => {
    await owner.locator('button[aria-label^="Expulsar a"]').nth(3).click();
  });
  await owner.waitForSelector("text=/fue expulsado/");
  assert(dialogs === 2, "pide confirmación y si bloquear el reingreso");
  await owner.waitForSelector("text=Bloqueados en este evento");
  assert(true, "aparece en Bloqueados en este evento");
  await owner.click("text=Permitir que vuelva");
  await owner.waitForSelector("text=Bloqueados en este evento", { state: "detached" });
  assert(true, "se le puede volver a permitir la entrada");

  // ── Nueva edición ─────────────────────────────────────────────────
  await owner.goto(`${B}/admin/events`, { waitUntil: "networkidle" });
  await owner.click("text=Duplicar para esa fecha");
  await owner.waitForSelector("text=Nueva edición creada");
  const chips = await owner.locator("main .no-scrollbar button").count();
  assert(chips >= 2, "la nueva edición aparece en la lista de eventos");
  assert(await owner.locator('button:has-text("Eliminar")').isEnabled(), "una edición sin gente se puede eliminar");
  await browser.close();
  assert(errors.length === 0, `sin errores de consola${errors.length ? ": " + errors.join(" | ") : ""}`);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 6).join(" / ")); process.exit(1); });
