// Demo · Squad, rescate en vivo entre pestañas, plano, Punto Base, Barra Express, perks
const { chromium, devices } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO, unlockDemo } = require("./env.cjs");

const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"] });
  await unlockDemo(ctx); // personas y "Simular…" solo tras entrar por /demo
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const A = await ctx.newPage(); watch(A, "sofi");
  await A.goto(`${B}/app`, { waitUntil: "networkidle" });
  // Pestaña B → Cami
  const Bp = await ctx.newPage(); watch(Bp, "cami");
  await Bp.goto(`${B}/app`, { waitUntil: "networkidle" });
  await Bp.click('[aria-label="Cambiar de persona (Modo Demo)"]');
  await Bp.click("text=Camila Ríos");
  await Bp.waitForSelector("text=Hola, Camila");

  // 1) Pin-drop de Sofía con Squad + Mateo
  await A.goto(`${B}/map`, { waitUntil: "networkidle" });
  const map = await A.$('[aria-label="Plano interactivo del lugar"]');
  const box = await map.boundingBox();
  await A.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await A.waitForSelector("text=Estoy acá");
  await A.click("#share-matches");
  await A.click('label:has-text("Mateo") input');
  await A.fill('input[placeholder^="Al lado"]', "Cerca del parlante izquierdo");
  await A.screenshot({ path: `${SP}/p4-pin-sheet.png` });
  await A.click("text=Compartir por 15 min");
  await A.waitForSelector("text=/Expira en 1[45] min/");
  log("pin propio →", (await A.textContent("text=/Lo ve:/")).trim());
  await A.screenshot({ path: `${SP}/p4-map.png` });

  // 2) Cami ve el pin de Sofía (squad, cian)
  await Bp.goto(`${B}/map`, { waitUntil: "networkidle" });
  log("Cami ve pin de Sofía:", await Bp.locator('button[data-pin][aria-label^="Sofía"]').count() === 1);

  // 3) Rescate desde la pestaña de Sofía → alerta en vivo en la de Cami
  await A.goto(`${B}/squad`, { waitUntil: "networkidle" });
  await A.click("text=Vengan a mi pin");
  await A.waitForSelector("text=Tu Squad recibió la alerta");
  await A.screenshot({ path: `${SP}/p4-rescue-self.png` });
  await Bp.waitForSelector('text=/RESCATE: Sofía/', { timeout: 10000 });
  log("✔ Cami recibe toast de rescate en vivo");
  await Bp.screenshot({ path: `${SP}/p4-rescue-toast.png` });
  await Bp.goto(`${B}/squad`, { waitUntil: "networkidle" });
  log("alerta en /squad de Cami:", (await Bp.textContent("text=/necesita que vayan/")).trim());
  await Bp.screenshot({ path: `${SP}/p4-squad-alert.png` });
  await A.click(`button:has-text("Ya estoy bien")`);
  await A.waitForSelector(`button:has-text("Vengan a mi pin")`);
  log("✔ rescate resuelto");

  // 4) Chat del squad con foto
  await A.goto(`${B}/squad/chat`, { waitUntil: "networkidle" });
  await A.fill('[aria-label="Mensaje"]', "¿Dónde están? Estoy en la pista 💃");
  await A.click('[aria-label="Enviar"]');
  await A.setInputFiles('[data-testid="chat-photo-input"]', FIXTURE_PHOTO);
  await A.waitForSelector('img[alt="Foto"]', { timeout: 20000 });
  await Bp.goto(`${B}/squad/chat`, { waitUntil: "networkidle" });
  await Bp.waitForSelector("text=Estoy en la pista");
  await Bp.waitForSelector('img[alt="Foto"]', { timeout: 10000 });
  log("✔ Cami ve el texto y la foto en el chat del squad");
  await Bp.screenshot({ path: `${SP}/p4-squad-chat.png` });

  // 5) Punto Base + aviso
  await A.goto(`${B}/map?mode=base`, { waitUntil: "networkidle" });
  const box2 = await (await A.$('[aria-label="Plano interactivo del lugar"]')).boundingBox();
  await A.mouse.click(box2.x + box2.width * 0.85, box2.y + box2.height * 0.7);
  await A.fill('input[placeholder^="Columna dorada"]', "Mesa 7 del VIP");
  await A.click("text=Fijar Punto Base");
  await A.waitForSelector("text=/Punto Base: Mesa 7/");
  log("✔ punto base fijado");

  // 6) Barra Express: fast pickup + simular barra hasta "listo"
  await A.goto(`${B}/bar`, { waitUntil: "networkidle" });
  await A.click('[aria-label="Agregar Gin Tonic"]');
  await A.click('[aria-label="Agregar Gin Tonic"]');
  await A.click("text=/Ver pedido/");
  await A.click('role=radio[name*="Fast-Pickup"]');
  await A.screenshot({ path: `${SP}/p4-checkout.png` });
  await A.click("text=/^Pagar .* con Mercado Pago/");
  // Checkout de Mercado Pago simulado (Modo Demo): el pedido espera el pago hasta acreditarse
  await A.waitForSelector("text=Mercado Pago · demo");
  await A.click("text=Pagar con dinero en cuenta");
  await A.waitForSelector("text=/Retiro · código/");
  await A.keyboard.press("Escape");
  const sim = A.locator('section:has-text("Gin Tonic") >> text=Simular barra').first();
  await sim.click(); await sim.click();
  await A.waitForSelector("text=¡Tu pedido está listo!");
  log("✔ pedido listo → toast");
  await A.screenshot({ path: `${SP}/p4-bar.png` });
  // Compartido con el Squad (Vaquita): lo paga una y entra en las cuentas de la mesa
  await A.click('[aria-label="Agregar Champagne Brut"]');
  await A.click("text=/Ver pedido/");
  await A.click("text=Todo el Squad");
  log("compartido →", (await A.textContent('section[aria-label="Compartir con el Squad"] [role="status"]')).trim());
  await A.click("text=/^Pagar .* con Mercado Pago/");
  await A.click("text=Pagar con dinero en cuenta");
  await A.waitForSelector("text=/Retiro · código/");
  await A.keyboard.press("Escape");

  // 7) Billetera de QRs
  await A.goto(`${B}/perks`, { waitUntil: "networkidle" });
  const qrs = await A.locator("button:has(svg.lucide-qr-code)").count();
  log("QRs disponibles:", qrs);
  await A.locator("button:has(svg.lucide-qr-code)").first().click();
  await A.waitForSelector('svg[aria-label]');
  await A.screenshot({ path: `${SP}/p4-qr.png` });
  await A.click("text=Simular escaneo del bartender");
  await A.waitForSelector("text=Canjeado en barra");
  log("✔ QR canjeado; quedan:", await A.locator("button:has(svg.lucide-qr-code)").count());

  // 8) Invitar a mi squad desde un perfil + Mesa VIP
  await A.goto(`${B}/u/joaco.indie`, { waitUntil: "networkidle" });
  await A.click("text=Invitar a mi Squad");
  await A.waitForSelector("text=Invitación al Squad enviada");
  log("✔ invitación al squad desde el perfil");
  await A.goto(`${B}/squad`, { waitUntil: "networkidle" });
  await A.click("#vip-share");
  await A.waitForSelector("text=Mesa VIP visible");
  await A.screenshot({ path: `${SP}/p4-squad.png`, fullPage: true });

  console.log("errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 14).join(" | ")); process.exit(1); });
