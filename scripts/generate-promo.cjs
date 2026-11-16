/**
 * Piezas publicitarias para organizadores (1080×1350, formato vertical de Instagram / WhatsApp) con capturas REALES
 * de la app en Modo Demo → marketing/organizadores/*.png
 *
 * Uso: con la app en Modo Demo corriendo →
 *   node scripts/generate-promo.cjs [http://localhost:3100] [URL de la demo para el QR y el pie]
 */
const { chromium } = require("playwright");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:3100";
const DEMO_URL = process.argv[3] || "https://rouge-demo.vercel.app/demo";
const DEST = path.join(__dirname, "..", "marketing", "organizadores");
const open = (role, to) => `${BASE}/demo/abrir?rol=${role}&a=${encodeURIComponent(to)}`;
const HIDE = "nextjs-portal, [data-live-notifications], section[aria-live], [role='status'][aria-live] { display: none !important; }";
/** Saca de la captura el badge "Modo Demo" (en el material comercial se muestra la app tal cual la ve el público). */
const cleanUp = (p) => p.evaluate(() => document.querySelectorAll("span").forEach((el) => /^modo demo$/i.test(el.textContent?.trim() ?? "") && el.remove()));

async function capture(browser) {
  const shots = {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("rouge:seen-notifs", "{}");
    } catch {}
  });
  const page = await ctx.newPage();
  const snap = async (name, url, prep) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    if (prep) await prep(page);
    await page.addStyleTag({ content: HIDE });
    await cleanUp(page);
    await page.waitForTimeout(300);
    shots[name] = (await page.screenshot()).toString("base64");
    console.log("✓ captura", name);
  };
  await snap("home", open("asistente", "/app"));
  await snap("lobby", `${BASE}/lobby`);
  await snap("map", `${BASE}/map`);
  await snap("squad", `${BASE}/squad`);
  await snap("cuentas", `${BASE}/squad/cuentas`);
  await snap("bar", `${BASE}/bar`, async (p) => {
    await p.click('[aria-label="Agregar Champagne Brut"]');
    await p.click('[aria-label="Agregar Gin Tonic"]');
    await p.click("text=/Ver pedido/");
    await p.click("text=Todo el Squad");
    await p.waitForTimeout(500);
  });

  // Escritorio: panel del organizador y comandas
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const d = await desk.newPage();
  const deskSnap = async (name, url) => {
    await d.goto(url, { waitUntil: "networkidle" });
    await d.waitForTimeout(1200);
    await d.addStyleTag({ content: HIDE });
    shots[name] = (await d.screenshot()).toString("base64");
    console.log("✓ captura", name);
  };
  await deskSnap("admin", open("duena", "/admin"));
  await deskSnap("barpos", open("barra", "/admin/bar-pos"));

  // Marca: la dueña elige violeta + lima y la app del asistente cambia de colores (mismo navegador = misma fiesta)
  await d.goto(open("duena", "/admin/brand"), { waitUntil: "networkidle" });
  await d.click('button[aria-label="Violeta (#8B5CF6)"] >> nth=0');
  await d.click('button[aria-label="Lima (#C6FF3D)"] >> nth=0');
  await d.click('button:has-text("Guardar marca")');
  await d.waitForTimeout(600);
  const branded = await desk.newPage();
  await branded.setViewportSize({ width: 390, height: 844 });
  await branded.goto(open("asistente", "/app"), { waitUntil: "networkidle" });
  await branded.waitForTimeout(900);
  await branded.addStyleTag({ content: HIDE });
  await cleanUp(branded);
  shots.branded = (await branded.screenshot()).toString("base64");
  console.log("✓ captura branded");
  await ctx.close();
  await desk.close();
  return shots;
}

const phone = (b64, extra = "") => `<div class="phone ${extra}"><img src="data:image/png;base64,${b64}" alt=""></div>`;
const laptop = (b64) => `<div class="laptop"><div class="screen"><img src="data:image/png;base64,${b64}" alt=""></div><div class="base"></div></div>`;

function page({ kicker, title, sub, bullets, visual, accent = "rouge", footer = true, qr = "" }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --rouge:#FF1E56; --squad:#00F0FF; --vip:#FFB800; --bg:#070709; --surface:#121216; --text:#F8FAFC; --muted:#94A3B8; }
  * { box-sizing:border-box; margin:0; }
  html,body { width:1080px; height:1350px; background:var(--bg); color:var(--text); font-family:'Plus Jakarta Sans',sans-serif; overflow:hidden; }
  .wrap { position:relative; width:100%; height:100%; padding:72px 72px 64px; display:flex; flex-direction:column; }
  .glow { position:absolute; border-radius:50%; filter:blur(120px); opacity:.55; z-index:0; }
  .g1 { width:620px; height:620px; background:var(--${accent}); top:-180px; right:-160px; opacity:.35; }
  .g2 { width:520px; height:520px; background:var(--squad); bottom:-220px; left:-200px; opacity:.18; }
  .top { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; }
  .logo { font-family:'Space Grotesk'; font-weight:700; font-size:44px; letter-spacing:-1.5px; color:var(--rouge); text-shadow:0 0 28px rgba(255,30,86,.6); }
  .kicker { font-family:'Space Grotesk'; font-size:20px; letter-spacing:5px; text-transform:uppercase; color:var(--${accent}); border:1.5px solid color-mix(in srgb, var(--${accent}) 55%, transparent); padding:10px 18px; border-radius:999px; }
  h1 { position:relative; z-index:1; margin-top:44px; font-family:'Space Grotesk'; font-weight:700; font-size:84px; line-height:.98; letter-spacing:-3px; max-width:920px; }
  h1 em { font-style:normal; color:var(--${accent}); }
  .sub { position:relative; z-index:1; margin-top:22px; font-size:29px; line-height:1.35; color:#CBD5E1; max-width:860px; }
  .body { position:relative; z-index:1; flex:1; display:flex; gap:40px; margin-top:36px; align-items:center; min-height:0; }
  ul { list-style:none; padding:0; display:flex; flex-direction:column; gap:22px; flex:1; min-width:0; }
  li { display:flex; gap:18px; align-items:flex-start; font-size:27px; line-height:1.3; font-weight:500; }
  li span.i { flex:none; width:58px; height:58px; border-radius:18px; display:grid; place-items:center; font-size:30px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); }
  li b { display:block; font-family:'Space Grotesk'; font-size:29px; font-weight:700; color:var(--text); }
  li small { display:block; font-size:22px; color:var(--muted); font-weight:400; margin-top:2px; }
  .visual { flex:none; position:relative; display:flex; align-items:center; justify-content:center; }
  .visual { height:100%; }
  .phone { height:100%; max-height:806px; aspect-ratio:418 / 872; border-radius:58px; border:14px solid #1A1A20; overflow:hidden; background:#000; box-shadow:0 0 0 2px rgba(255,255,255,.06), 0 40px 120px rgba(0,0,0,.7), 0 0 90px color-mix(in srgb, var(--${accent}) 35%, transparent); }
  .phone img { width:100%; display:block; }
  .duo { position:relative; height:100%; aspect-ratio:600 / 872; }
  .duo .phone { position:absolute; right:0; top:0; z-index:1; }
  .duo .phone.back { left:0; right:auto; top:7%; height:86%; transform:rotate(-7deg); z-index:0; opacity:.9; filter:saturate(.9); }
  .laptop { width:800px; margin:0 auto; }
  .laptop .screen { border:14px solid #1A1A20; border-bottom-width:18px; border-radius:22px 22px 0 0; overflow:hidden; box-shadow:0 30px 100px rgba(0,0,0,.6), 0 0 80px color-mix(in srgb, var(--${accent}) 25%, transparent); }
  .laptop img { width:100%; display:block; }
  .laptop .base { height:22px; margin:0 -40px; background:linear-gradient(#26262e,#16161b); border-radius:0 0 18px 18px; }
  .stack { flex-direction:column; align-items:stretch; }
  .stack .visual { height:auto; }
  .stack ul { flex-direction:row; flex-wrap:wrap; gap:18px 30px; flex:none; }
  .stack li { width:calc(50% - 15px); font-size:24px; }
  .foot { position:relative; z-index:1; margin-top:36px; display:flex; align-items:center; justify-content:space-between; gap:24px; }
  .cta { font-family:'Space Grotesk'; font-weight:700; font-size:28px; background:var(--rouge); color:#fff; padding:20px 32px; border-radius:999px; box-shadow:0 0 50px rgba(255,30,86,.55); }
  .url { font-size:24px; color:var(--muted); }
  .swatches { display:flex; gap:14px; margin-top:8px; }
  .swatches i { width:54px; height:54px; border-radius:50%; display:block; border:3px solid rgba(255,255,255,.15); }
  .qr { background:#fff; padding:22px; border-radius:28px; box-shadow:0 0 60px rgba(255,30,86,.35); }
  .qr img { width:340px; height:340px; display:block; }
</style></head><body><div class="wrap">
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="top"><span class="logo">ROUGE</span><span class="kicker">${kicker}</span></div>
  <h1>${title}</h1>
  ${sub ? `<p class="sub">${sub}</p>` : ""}
  <div class="body ${visual.stack ? "stack" : ""}">
    ${visual.left ? `<div class="visual">${visual.left}</div>` : ""}
    ${bullets ? `<ul>${bullets.map(([i, b, s]) => `<li><span class="i">${i}</span><span><b>${b}</b>${s ? `<small>${s}</small>` : ""}</span></li>`).join("")}</ul>` : ""}
    ${visual.right ? `<div class="visual">${visual.right}</div>` : ""}
    ${qr}
  </div>
  ${footer ? `<div class="foot"><span class="url">Mirá la demo en vivo · ${DEMO_URL.replace(/^https?:\/\//, "")}</span><span class="cta">Pedí tu demo</span></div>` : ""}
</div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const s = await capture(browser);
  const qr = await QRCode.toDataURL(DEMO_URL, { margin: 1, width: 680, color: { dark: "#070709", light: "#FFFFFF" } });
  const pieces = {
    "01-tu-fiesta-en-el-celular": page({
      kicker: "Para organizadores",
      title: "Tu fiesta, en el <em>celular</em> de cada invitado.",
      sub: "La app social y operativa para boliches, fiestas y productoras. Sin descargar nada: entran con el link de su entrada.",
      bullets: [
        ["💘", "Conectan por la música", "Grilla por afinidad y un Rompehielos por noche."],
        ["👯", "Nadie pierde a su grupo", "Squad, plano en vivo y botón de rescate."],
        ["🍸", "Piden sin hacer fila", "Y pagan con Mercado Pago desde la pista."],
        ["📊", "Los datos son tuyos", "Quién vino, con quién y cuánto consumió."],
      ],
      visual: { right: phone(s.home) },
    }),
    "02-barra-sin-filas": page({
      kicker: "Barra Express",
      accent: "vip",
      title: "Menos fila, <em>más consumo</em>.",
      sub: "Piden desde la pista, pagan con Mercado Pago y la barra prepara solo lo que ya está cobrado.",
      bullets: [
        ["💳", "La plata entra a tu cuenta", "Mercado Pago: billetera, dinero en cuenta o tarjeta."],
        ["🧾", "Comandas con ticket", "Kanban en vivo e impresión en térmica de 80 mm."],
        ["🛵", "Delivery a la mesa", "O retiro rápido con QR en la ventanilla."],
        ["🐮", "Compartido con el Squad", "La botella se divide sola entre la mesa."],
      ],
      visual: { right: phone(s.bar) },
    }),
    "03-nadie-queda-solo": page({
      kicker: "Seguridad",
      accent: "squad",
      title: "Nadie se pierde. <em>Nadie queda solo.</em>",
      sub: "La tranquilidad que hace que vuelvan a comprar entrada.",
      bullets: [
        ["🚨", "Rescate en 1 toque", "Le llega al Squad y a tu equipo de seguridad con la ubicación."],
        ["📍", "Pines de 15 minutos", "Cada uno elige con quién comparte dónde está."],
        ["🏠", "“Llegué a casa”", "El grupo sabe que todos volvieron bien."],
      ],
      visual: { left: `<div class="duo">${phone(s.map, "back")}${phone(s.squad)}</div>` },
    }),
    "04-tu-marca-tus-colores": page({
      kicker: "Marca blanca",
      title: "Tu marca. <em>Tus colores.</em>",
      sub: "La app se ve con tu logo y tu paleta en cada fiesta: en la invitación, en el celular y en la pantalla LED.",
      bullets: [
        ["🎨", "Lista en 2 minutos", "Subí el logo, elegí dos colores y mirá la vista previa."],
        ["✅", "Siempre legible", "Controles de contraste automáticos."],
        ["🗓️", "Por edición", "Cada fecha puede tener su propia identidad."],
      ],
      visual: { right: `${phone(s.branded)}` },
    }).replace("<ul>", `<ul><li><span class="i">🖌️</span><span><b>Paletas sugeridas</b><div class="swatches"><i style="background:#FF1E56"></i><i style="background:#8B5CF6"></i><i style="background:#2F6BFF"></i><i style="background:#C6FF3D"></i><i style="background:#FFB800"></i></div></span></li>`),
    "05-datos-para-llenar-la-proxima": page({
      kicker: "Panel del organizador",
      accent: "vip",
      title: "Datos que llenan la <em>próxima fecha</em>.",
      sub: null,
      bullets: [
        ["📈", "Ventas y filas evitadas", "Ticket promedio y consumo en vivo."],
        ["🏷️", "CRM con Smart Tags", "Top Spenders y WhatsApp."],
        ["📣", "Avisos segmentados", "Flash Promos a quien corresponde."],
        ["👥", "Equipo por rol", "Barra, mozos y seguridad."],
      ],
      visual: { stack: true, left: laptop(s.admin) },
    }),
    "06-cuentas-claras": page({
      kicker: "Cuentas de la mesa",
      accent: "squad",
      title: "Al final de la noche, <em>cuentas claras.</em>",
      sub: "La mesa sabe quién pagó qué y quién le transfiere a quién. Sin discusiones al otro día.",
      bullets: [
        ["🧾", "Quién pagó qué", "Lo de la barra se suma solo; la mesa o el taxi, a mano."],
        ["💸", "Transferencias mínimas", "Y el alias de cada uno, con un toque."],
        ["🔒", "Privado", "Solo lo ve el Squad."],
      ],
      visual: { right: phone(s.cuentas) },
    }),
    "07-probalo-en-vivo": page({
      kicker: "Demo en vivo",
      title: "Probalo en <em>7 minutos</em>.",
      sub: "Escaneá el QR: la app de los invitados y el panel del organizador, funcionando ahora mismo.",
      bullets: [
        ["📱", "Sin descargar nada", "Funciona en cualquier celular."],
        ["🔗", "Se suma a tu ticketera", "O usá nuestros links y códigos de 1 uso."],
        ["🚀", "Lista para tu próxima fiesta", "Te acompañamos en la primera fecha."],
      ],
      visual: {},
      qr: `<div class="visual"><div class="qr"><img src="${qr}" alt="QR de la demo"></div></div>`,
    }),
  };

  fs.mkdirSync(DEST, { recursive: true });
  const pg = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (const [name, html] of Object.entries(pieces)) {
    await pg.setContent(html, { waitUntil: "networkidle" });
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(DEST, `${name}.png`) });
    console.log("✓ pieza", name);
  }
  await browser.close();
})();
