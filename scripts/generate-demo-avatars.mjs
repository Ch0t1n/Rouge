/**
 * Genera retratos vectoriales estilizados (neón sobre obsidiana) para el Modo Demo.
 * Livianos (~2 KB), sin red, sin licencias de stock. Uso: node scripts/generate-demo-avatars.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "demo", "avatars");
mkdirSync(OUT, { recursive: true });

// username, color A, color B, hair style (0-3)
const PEOPLE = [
  ["sofi.noche", "#FF1E56", "#7A1CFF", 1],
  ["cami.beats", "#00F0FF", "#1C3BFF", 2],
  ["juli.rkt", "#FF6A3D", "#FF1E56", 3],
  ["meli.house", "#B26BFF", "#00F0FF", 1],
  ["mateo.techno", "#00F0FF", "#00FFA3", 0],
  ["lucas.dj", "#FFB800", "#FF1E56", 0],
  ["bruno.after", "#7A1CFF", "#FF1E56", 0],
  ["joaco.indie", "#00FFA3", "#1C3BFF", 0],
  ["vale.pop", "#FF4FD8", "#FFB800", 2],
  ["tomi.vip", "#FFB800", "#FF6A3D", 0],
  ["nico.urbano", "#1C3BFF", "#FF1E56", 0],
  ["fran.cachengue", "#FF1E56", "#FFB800", 3],
  ["gonza.x", "#94A3B8", "#475569", 0],
];

const hair = (style, c) =>
  [
    `<path d="M210 300c0-70 40-118 90-118s90 48 90 118c-20-30-50-46-90-46s-70 16-90 46z" fill="${c}" opacity=".9"/>`,
    `<path d="M196 330c-6-96 40-152 104-152s112 56 104 152l10 170h-40l-14-150c-16-20-36-30-60-30s-44 10-60 30l-14 150h-40z" fill="${c}" opacity=".9"/>`,
    `<path d="M200 300c0-74 44-124 100-124s100 50 100 124c0 26-8 40-8 40-14-56-48-84-92-84s-78 28-92 84c0 0-8-14-8-40z" fill="${c}" opacity=".9"/><circle cx="300" cy="168" r="34" fill="${c}"/>`,
    `<path d="M198 320c-4-88 42-144 102-144s106 56 102 144c26 60 30 150 6 200h-46c18-60 10-130-10-176-14-16-32-24-52-24s-38 8-52 24c-20 46-28 116-10 176h-46c-24-50-20-140 6-200z" fill="${c}" opacity=".9"/>`,
  ][style];

for (const [username, a, b, style] of PEOPLE) {
  for (let n = 1; n <= 2; n++) {
    const rot = n === 1 ? 0 : 18;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<defs>
<radialGradient id="g" cx="${n === 1 ? 30 : 70}%" cy="20%" r="95%"><stop offset="0" stop-color="${a}" stop-opacity=".95"/><stop offset=".55" stop-color="${b}" stop-opacity=".55"/><stop offset="1" stop-color="#070709"/></radialGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1b22"/><stop offset="1" stop-color="#070709"/></linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}" stop-opacity="0"/><stop offset=".5" stop-color="${a}" stop-opacity=".55"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="600" height="800" fill="#070709"/>
<rect width="600" height="800" fill="url(#g)"/>
<g transform="rotate(${-24 + rot} 300 400)" stroke="url(#l)" stroke-width="3"><line x1="-200" y1="140" x2="800" y2="140"/><line x1="-200" y1="260" x2="800" y2="260" stroke-width="1.5"/><line x1="-200" y1="620" x2="800" y2="620" stroke-width="2"/></g>
<g>
<path d="M120 800c10-150 80-232 180-232s170 82 180 232z" fill="url(#s)"/>
<rect x="268" y="470" width="64" height="110" rx="30" fill="#15151b"/>
<ellipse cx="300" cy="350" rx="98" ry="124" fill="#17171e"/>
${hair(style, "#0d0d12")}
<ellipse cx="300" cy="350" rx="98" ry="124" fill="none" stroke="${a}" stroke-opacity=".55" stroke-width="3"/>
<path d="M120 800c10-150 80-232 180-232s170 82 180 232" fill="none" stroke="${b}" stroke-opacity=".5" stroke-width="3"/>
</g>
</svg>`;
    writeFileSync(join(OUT, `${username}-${n}.svg`), svg);
  }
}
console.log(`✔ ${PEOPLE.length * 2} avatares en ${OUT}`);
