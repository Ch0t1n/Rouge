/**
 * Capturas reales de la app (Modo Demo) para la landing → public/landing/*.webp
 * Uso: con la app en Modo Demo corriendo (npm run dev) →  node scripts/capture-landing-shots.cjs [http://localhost:3000]
 */
const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("fs");
const os = require("os");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:3000";
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "rouge-shots-"));
const DEST = path.join(__dirname, "..", "public", "landing");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const phone = async (persona) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript((p) => { try { sessionStorage.setItem("rouge:persona", p); localStorage.setItem("rouge:seen-notifs", "{}"); } catch {} }, persona);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    return page;
  };
  const shot = async (page, path, name, wait) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    if (wait) await page.waitForSelector(wait, { timeout: 15000 });
    await page.waitForTimeout(900);
    // ocultar banners en vivo para capturas limpias
    await page.addStyleTag({ content: 'nextjs-portal, [data-live-notifications], [role="status"] { display: none !important; }' });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("✓", name);
  };
  const m = await phone(id(1));
  await shot(m, "/lobby", "lobby", "text=/afinidad|%/i");
  await shot(m, "/map", "map");
  await shot(m, "/squad", "squad");
  await shot(m, "/bar", "bar");
  await shot(m, "/app", "home");
  await shot(m, "/inbox", "inbox");
  const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await d.addInitScript((p) => { try { sessionStorage.setItem("rouge:persona", p); } catch {} }, id(999));
  const dp = await d.newPage();
  dp.on("pageerror", (e) => errors.push(e.message));
  await dp.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await dp.waitForTimeout(1200);
  await dp.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await dp.screenshot({ path: `${OUT}/admin.png` });
  console.log("✓ admin");
  await dp.goto(BASE + "/admin/bar-pos", { waitUntil: "networkidle" });
  await dp.waitForTimeout(1000);
  await dp.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await dp.screenshot({ path: `${OUT}/bar-pos.png` });
  console.log("✓ bar-pos");
  await browser.close();
  fs.mkdirSync(DEST, { recursive: true });
  for (const n of ["lobby", "map", "squad", "bar", "home", "inbox"]) await sharp(`${OUT}/${n}.png`).resize({ width: 720 }).webp({ quality: 80 }).toFile(`${DEST}/${n}.webp`);
  for (const n of ["admin", "bar-pos"]) await sharp(`${OUT}/${n}.png`).resize({ width: 1600 }).webp({ quality: 80 }).toFile(`${DEST}/${n}.webp`);
  console.log(errors.length ? errors : "✓ public/landing actualizado");
})();
