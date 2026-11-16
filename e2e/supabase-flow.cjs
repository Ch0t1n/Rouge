// Supabase real · magic link, onboarding, Storage, Realtime, squad, barra, blasts, CRM y roles
const { chromium, devices } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO, SUPABASE_URL, MAILPIT_URL, VERIFY_RE, ANON, SERVICE } = require("./env.cjs");

const { createClient } = require("@supabase/supabase-js");
const EV = "00000000-0000-4000-8000-000000001000";
const RUN = Date.now().toString(36);
const log = (...a) => console.log(...a);
const errors = [];
const watch = (p, tag) => {
  p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/spotify|Failed to load resource|net::ERR/i.test(m.text()) && errors.push(`[${tag}] ${m.text().slice(0, 200)}`));
};

async function magicLink(page, email) {
  const query = page.url().includes("next=") ? "?" + page.url().split("?")[1] : "";
  await page.goto(`${B}/login${query}`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.click("text=Enviarme el link");
  await page.waitForSelector("text=Revisá tu mail");
  let id;
  for (let i = 0; i < 40 && !id; i++) {
    const r = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    id = r.messages?.[0]?.ID;
    if (!id) await new Promise((r) => setTimeout(r, 500));
  }
  const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json();
  const link = (msg.Text + " " + msg.HTML).match(VERIFY_RE)[0].replace(/&amp;/g, "&");
  await page.goto(link);
}

async function onboard(page, name, user, phone, genres) {
  await page.waitForURL("**/onboarding**", { timeout: 20000 });
  await page.fill('input[autocomplete="name"]', name);
  await page.fill('input[placeholder="sofi.noche"]', user);
  await page.fill('input[type="date"]', "1999-05-05");
  await page.click('role=radio[name="Mujer"]');
  await page.fill('input[type="tel"]', phone);
  await page.click("text=Continuar");
  await page.waitForSelector("text=Tu mejor versión");
  await page.setInputFiles('[data-testid="photo-input"]', FIXTURE_PHOTO);
  await page.waitForSelector('img[alt="Foto 1"]', { timeout: 30000 });
  await page.click("text=Continuar");
  for (const g of genres) await page.click(`button[aria-pressed]:has-text("${g}")`);
  await page.click("text=Continuar");
  await page.click("text=Entrar a ROUGE");
}

(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const browser = await chromium.launch();
  const phone = (n) => `11 ${String(4000 + (parseInt(RUN.slice(-3), 36) % 5000)).padStart(4, "0")}-${String(2000 + n)}`;

  // ── Sofía: magic link real → onboarding (fotos a Storage) → /join ──
  const sctx = await browser.newContext({ ...devices["iPhone 14 Pro"] });
  const S = await sctx.newPage();
  watch(S, "sofi");
  await S.goto(`${B}/join/bresh-sabado`, { waitUntil: "networkidle" });
  log("join sin sesión →", (await S.textContent("text=Ingresar y entrar")).trim());
  await S.click("text=Ingresar y entrar");
  await S.waitForURL("**/login**");
  await magicLink(S, `sofi.${RUN}@rouge.test`);
  log("✔ magic link real (Mailpit) → sesión → onboarding (next=/join)");
  await onboard(S, "Sofía Real", `sofi.${RUN}`, phone(1), ["House", "Techno"]);
  await S.waitForURL("**/join/bresh-sabado", { timeout: 20000 });
  await S.click('role=radio[name*="Voy con amigos"]');
  await S.click("text=Entrar a la fiesta");
  await S.waitForURL("**/lobby", { timeout: 20000 });
  log("✔ entró al lobby (join_event)");
  const { data: prof } = await admin.from("profiles").select("photos").eq("username", `sofi.${RUN}`).single();
  log("foto en Storage →", prof.photos[0].url.replace(SUPABASE_URL, ""));
  const img = await fetch(prof.photos[0].url);
  log("  descarga pública:", img.status, img.headers.get("content-type"));

  // ── Squad ──
  await S.goto(`${B}/squad`, { waitUntil: "networkidle" });
  await S.fill('input[maxlength="32"]', "Pibas Reales");
  await S.click("text=Crear Squad");
  await S.waitForSelector("text=Integrantes", { timeout: 15000 });
  await S.waitForLoadState("networkidle");
  const { data: dbSquad } = await admin.from("squads").select("invite_code").eq("name", "Pibas Reales").order("created_at", { ascending: false }).limit(1).single();
  await S.click("text=Invitar a mi Squad");
  const squadCode = (await S.textContent("code")).trim();
  await S.keyboard.press("Escape");
  log("✔ squad creado (RPC) → UI:", squadCode, "| servidor:", dbSquad.invite_code, "| coinciden:", squadCode === dbSquad.invite_code);

  // ── Cami: login + onboarding + entra con el link del Squad ──
  const cctx = await browser.newContext({ ...devices["iPhone 14 Pro"] });
  const Cm = await cctx.newPage();
  watch(Cm, "cami");
  await Cm.goto(`${B}/join/${squadCode}`, { waitUntil: "networkidle" });
  await Cm.click("text=Ingresar y entrar");
  await Cm.waitForURL("**/login**");
  await magicLink(Cm, `cami.${RUN}@rouge.test`);
  await onboard(Cm, "Camila Real", `cami.${RUN}`, phone(2), ["House", "Pop"]);
  await Cm.waitForURL(`**/join/${squadCode}`, { timeout: 20000 });
  await Cm.click('role=radio[name*="Voy con amigos"]');
  await Cm.click("text=Entrar a la fiesta");
  await Cm.waitForURL("**/lobby", { timeout: 20000 });
  await Cm.goto(`${B}/squad`, { waitUntil: "networkidle" });
  log("Cami en el squad →", (await Cm.textContent("h1")).trim());

  // ── Rescate en vivo ──
  await Cm.goto(`${B}/squad/chat`, { waitUntil: "networkidle" });
  await Cm.waitForTimeout(2500); // Realtime registra la suscripción
  await S.goto(`${B}/squad`, { waitUntil: "networkidle" });
  await S.click("text=Vengan a mi pin");
  await S.waitForSelector("text=Tu Squad recibió la alerta", { timeout: 15000 });
  await Cm.waitForSelector("text=/RESCATE: Sofía/", { timeout: 20000 });
  log("✔ Cami recibió en vivo la alerta de rescate (Realtime + RLS)");
  await Cm.screenshot({ path: `${SP}/supa-rescue.png` });
  await S.click('button:has-text("Ya estoy bien")');

  // ── Chat del squad con foto ──
  await S.goto(`${B}/squad/chat`, { waitUntil: "networkidle" });
  await S.fill('[aria-label="Mensaje"]', "¡Estoy en la pista! 💃");
  await S.click('[aria-label="Enviar"]');
  await S.setInputFiles('[data-testid="chat-photo-input"]', FIXTURE_PHOTO);
  await Cm.waitForSelector("text=Estoy en la pista", { timeout: 20000 });
  await Cm.waitForSelector('img[alt="Foto"]', { timeout: 20000 });
  log("✔ chat del squad en vivo con foto");
  await Cm.screenshot({ path: `${SP}/supa-chat.png` });

  // ── Staff real ──
  const email = `staff.${RUN}@rouge.test`;
  const { data: su } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.from("profiles").insert({ id: su.user.id, username: `staff.${RUN}`, full_name: "Staff Real", birth_date: "1990-01-01" });
  await admin.from("event_staff").insert({ event_id: EV, user_id: su.user.id, role: "owner" });
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const D = await dctx.newPage();
  watch(D, "staff");
  await D.goto(`${B}/admin`, { waitUntil: "networkidle" });
  await D.waitForURL("**/login**");
  await magicLink(D, email);
  await D.waitForURL("**/admin", { timeout: 20000 });
  await D.waitForSelector("text=Embudo de la noche");
  log("✔ staff en /admin · aviso de permisos:", await D.locator("text=No sos staff").count());

  // ── Barra ──
  await Cm.goto(`${B}/bar`, { waitUntil: "networkidle" });
  await Cm.click('[aria-label="Agregar Aperol Spritz"]');
  await Cm.click("text=/Ver pedido/");
  await Cm.click('role=radio[name*="Fast-Pickup"]');
  await Cm.click("text=/^(Pagar|Pedir)/"); // evento sin Mercado Pago: se paga en la barra
  await Cm.waitForSelector("text=/Retiro · código/", { timeout: 15000 });
  const pickup = (await Cm.textContent("text=/Retiro · código/")).match(/código (\w+)/)[1];
  await Cm.keyboard.press("Escape");
  const { data: dbOrder } = await admin.from("bar_orders").select("pickup_code,total_amount").eq("pickup_code", pickup).maybeSingle();
  log(`pedido → código ${pickup} · en la base: ${dbOrder ? dbOrder.pickup_code + " $" + dbOrder.total_amount : "NO ENCONTRADO"}`);
  await Cm.waitForTimeout(2000);
  await D.goto(`${B}/admin/bar-pos`, { waitUntil: "networkidle" });
  const ticket = D.locator(`article:has-text("${pickup}")`);
  await ticket.locator("text=Empezar a preparar").click();
  await D.waitForTimeout(1000);
  await ticket.locator("text=/Listo · avisar/").click();
  await Cm.waitForSelector("text=¡Tu pedido está listo!", { timeout: 20000 });
  log("✔ Cami recibió en vivo '¡Tu pedido está listo!'");
  await D.fill('input[placeholder="Código de retiro o QR de perk"]', pickup);
  await D.click('button:has-text("Entregar")');
  await D.waitForSelector(`text=Pedido ${pickup} entregado`, { timeout: 15000 });
  log("✔ entregado por código (redeem_pickup_code)");
  await D.screenshot({ path: `${SP}/supa-kanban.png` });

  // ── Text Blast ──
  await D.goto(`${B}/admin/blasts`, { waitUntil: "networkidle" });
  await D.click("text=⚡ FLASH PROMO · 20 min");
  await D.click("text=Enviar ahora");
  await D.waitForSelector("text=/Enviado a \\d+ asistentes/", { timeout: 15000 });
  log("blast →", (await D.textContent("text=/Enviado a \\d+ asistentes/")).trim());
  await S.goto(`${B}/app`, { waitUntil: "networkidle" });
  await S.waitForSelector("text=FLASH PROMO · 20 min", { timeout: 20000 });
  log("✔ Flash Promo visible en el teléfono de Sofía");
  await S.screenshot({ path: `${SP}/supa-home.png` });
  await D.goto(`${B}/admin/crm`, { waitUntil: "networkidle" });
  log("CRM con WhatsApp de Sofía:", (await D.locator(`tr:has-text("sofi.${RUN}") a[href^="https://wa.me/"]`).count()) === 1);
  await D.screenshot({ path: `${SP}/supa-crm.png` });

  // ── Equipo: la dueña suma a una bartender por @username desde la UI; ella entra directo a comandas ──
  const bEmail = `barra.${RUN}@rouge.test`;
  const { data: bu } = await admin.auth.admin.createUser({ email: bEmail, email_confirm: true });
  await admin.from("profiles").insert({ id: bu.user.id, username: `barra.${RUN}`, full_name: "Barra Real", birth_date: "1992-01-01" });
  await D.goto(`${B}/admin/events`, { waitUntil: "networkidle" });
  await D.waitForSelector("text=Equipo del evento");
  await D.fill('input[placeholder="dani.barra"]', `@barra.${RUN}`);
  await D.selectOption('select[aria-label="Rol"]', "bartender");
  await D.click('button:has-text("Sumar")');
  await D.waitForSelector(`select[aria-label="Rol de @barra.${RUN}"]`, { timeout: 15000 });
  log("✔ dueña suma a @barra (RPC set_staff_role)");
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const Bt = await bctx.newPage();
  watch(Bt, "barra");
  await Bt.goto(`${B}/login?as=staff`, { waitUntil: "networkidle" });
  await magicLink(Bt, bEmail);
  await Bt.waitForURL("**/admin/bar-pos", { timeout: 20000 });
  await Bt.waitForSelector("text=Barra / Comandas");
  const navB = await Bt.locator("aside nav a").allTextContents();
  log("✔ bartender entra a comandas · menú:", JSON.stringify(navB));
  if (navB.includes("CRM")) throw new Error("la barra ve el CRM");
  await Bt.goto(`${B}/admin/crm`, { waitUntil: "networkidle" });
  await Bt.waitForSelector("text=Esta sección no es para tu rol");
  log("✔ bartender en /admin/crm → sin acceso");

  console.log("errores:", errors.length ? errors : "ninguno");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message.split("\n").slice(0, 6).join(" | "));
  console.log("errores:", errors);
  process.exit(1);
});
