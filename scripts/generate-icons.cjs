/**
 * Rasteriza public/icons/icon.svg a los PNG que exigen iOS/Android para la PWA.
 * Requiere Playwright (Chromium). Uso: node scripts/generate-icons.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(process.cwd(), "public", "icons");
const svg = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");
// Maskable: el glifo debe entrar en la "safe zone" (círculo del 80%), fondo a sangre.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace("<g filter", '<g transform="translate(51 51) scale(0.8)"><g filter')
  .replace("</svg>", "</g></svg>")
  .replace(/<circle cx="372"[\s\S]*?\/>\s*<circle[\s\S]*?\/>/, (m) => m);

const targets = [
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, svg],
  ["apple-touch-icon.png", 180, svg.replace('rx="112"', 'rx="0"')],
  ["icon-maskable-512.png", 512, maskable],
  ["favicon-32.png", 32, svg],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, markup] of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: path.join(dir, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log("✔", name);
  }
  await browser.close();
})();
