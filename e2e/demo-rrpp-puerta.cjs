// Demo · RRPP (link propio, números sin datos personales, comisión) y puerta (escáner: pase de la app y entradas).
const { chromium } = require("playwright");
const { BASE: B, OUT: SP } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
const open = (role, path) => `${B}/demo/abrir?rol=${role}&a=${encodeURIComponent(path)}`;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = id(1000);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource|getUserMedia|Requested device not found|NotFoundError/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };

  // ── RRPP: ve su link y sus números, no el resto del panel ─────────
  const rp = await ctx.newPage(); watch(rp, "rrpp");
  await rp.goto(open("rrpp", "/admin/rrpp"), { waitUntil: "networkidle" });
  await rp.waitForSelector('[data-testid="rrpp-link"]');
  assert((await rp.textContent('[data-testid="rrpp-link"]')).includes("/join/RPVICKY7"), "el RRPP ve su link /join/RPVICKY7 con QR");
  const nums = await rp.textContent("main");
  assert(/Entraron por tu link\s*4/.test(nums) && /Pasaron por la puerta\s*3/.test(nums), "ve sus números: 4 por su link, 3 en la puerta");
  const nav = await rp.locator("aside nav a, aside a[href^='/admin']").allTextContents();
  assert(!nav.some((t) => /CRM|Resumen|Barra|Puerta/.test(t)), "el RRPP no ve CRM, resumen, barra ni puerta en el menú");
  await rp.goto(`${B}/admin/crm`, { waitUntil: "networkidle" });
  assert(await rp.locator("text=/no tiene acceso|Sin acceso|no tiene permiso/i").count(), "el RRPP no entra al CRM");
  await rp.goto(`${B}/admin/rrpp`, { waitUntil: "networkidle" });
  await rp.screenshot({ path: `${SP}/rrpp-panel.png`, fullPage: true });

  // ── Alguien entra por el link del RRPP ────────────────────────────
  const guest = await ctx.newPage(); watch(guest, "camila");
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto(open("amiga", "/join/RPVICKY7"), { waitUntil: "networkidle" });
  assert(await guest.locator("text=ROUGE Night × Bresh Sábado").count(), "el link del RRPP abre la invitación del evento");

  // ── Dueña: ranking, comisión y liquidación ───────────────────────
  const owner = await ctx.newPage(); watch(owner, "dueña");
  await owner.goto(open("duena", "/admin/rrpp"), { waitUntil: "networkidle" });
  const row = owner.locator('[data-testid="rrpp-row"]:has-text("Victoria")');
  await row.waitFor();
  await row.locator('input[aria-label="Comisión por ingreso"]').fill("2000");
  await row.locator('input[aria-label="Comisión por ingreso"]').press("Enter");
  await owner.waitForSelector("text=Comisión actualizada");
  assert((await row.textContent()).includes("6.000"), "comisión × ingresos en puerta = $ 6.000 a pagar");
  const [dl] = await Promise.all([owner.waitForEvent("download"), owner.click("text=CSV")]);
  assert(/rrpp-bresh-sabado\.csv$/.test(dl.suggestedFilename()), "exporta la liquidación en CSV");

  // ── Puerta: pase de la app (Joaquín todavía no entró) ─────────────
  const door = await ctx.newPage(); watch(door, "seguridad");
  await door.setViewportSize({ width: 390, height: 844 });
  await door.goto(open("seguridad", "/admin/door"), { waitUntil: "networkidle" });
  await door.waitForSelector("h1:has-text(\"Puerta\")");
  const before = Number((await door.textContent("main")).match(/(\d+) adentro/)[1]);
  await door.fill('input[placeholder="Código de la entrada"]', `ROUGE:PASS:${EV}:${id(8)}`);
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="ok"]');
  assert((await door.textContent('[data-testid="door-result"]')).includes("Joaquín"), "pase OK con nombre, foto y edad");
  assert(Number((await door.textContent("main")).match(/(\d+) adentro/)[1]) === before + 1, "suma uno adentro");
  await door.screenshot({ path: `${SP}/door-ok.png` });
  await door.fill('input[placeholder="Código de la entrada"]', `ROUGE:PASS:${EV}:${id(8)}`);
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="already"]');
  assert(true, "el mismo pase otra vez → 'Ya entró' con la hora");
  await door.fill('input[placeholder="Código de la entrada"]', "BRESH26");
  await door.click("text=Validar");
  await door.waitForSelector('[data-testid="door-result"][data-status="general_link"]');
  assert(true, "el link general no es una entrada");
  // RRPP vuelve a mirar: ahora Joaquín (de su link) cuenta en la puerta
  await rp.reload({ waitUntil: "networkidle" });
  assert(/Pasaron por la puerta\s*4/.test(await rp.textContent("main")), "el RRPP ve el ingreso nuevo en sus números");

  // ── Asistente: Mi entrada (pase con QR) ──────────────────────────
  await guest.goto(open("asistente", "/app"), { waitUntil: "networkidle" });
  await guest.click('[data-testid="my-pass"]');
  await guest.waitForSelector('[role="dialog"] svg');
  assert(await guest.locator('[role="dialog"] >> text=Mi entrada').count(), "el asistente muestra su pase con QR para la puerta");

  await browser.close();
  assert(errors.length === 0, `sin errores de consola${errors.length ? ": " + errors.join(" | ") : ""}`);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 6).join(" / ")); process.exit(1); });
