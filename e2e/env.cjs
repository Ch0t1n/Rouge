/**
 * Configuración común de los E2E (navegador real con Playwright).
 *
 *   E2E_BASE_URL            app a probar (default http://localhost:3100)
 *   E2E_OUT                 carpeta de capturas (default e2e/.out, ignorada por git)
 *   SUPABASE_TEST_URL       Supabase de prueba (default http://localhost:8000) — solo suites supabase-*
 *   SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_KEY
 *   E2E_MAILPIT_URL         bandeja de prueba que recibe los magic links (default http://localhost:8025)
 *   E2E_IG_MOCK_URL         API de Instagram imitada (default http://localhost:3999) — e2e/mocks/instagram-api.cjs
 */
const fs = require("fs");
const path = require("path");

const OUT = process.env.E2E_OUT || path.join(__dirname, ".out");
fs.mkdirSync(OUT, { recursive: true });
const SUPABASE_URL = (process.env.SUPABASE_TEST_URL || "http://localhost:8000").replace(/\/$/, "");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  BASE: (process.env.E2E_BASE_URL || "http://localhost:3100").replace(/\/$/, ""),
  OUT,
  FIXTURE_PHOTO: path.join(__dirname, "fixtures", "photo.png"),
  SUPABASE_URL,
  ANON: process.env.SUPABASE_TEST_ANON_KEY,
  SERVICE: process.env.SUPABASE_TEST_SERVICE_KEY,
  MAILPIT_URL: (process.env.E2E_MAILPIT_URL || "http://localhost:8025").replace(/\/$/, ""),
  IG_MOCK_URL: (process.env.E2E_IG_MOCK_URL || "http://localhost:3999").replace(/\/$/, ""),
  /**
   * Habilita la demo visible (personas, cambio de persona, "Simular…") en un contexto, como si se hubiera
   * entrado por /demo. El sitio principal no la muestra (ver src/lib/demo/access.ts).
   */
  /**
   * Pase EN VIVO (QR dinámico TOTP, igual que engine/qr.ts) para escanear en la puerta del demo. El pase fijo
   * `ROUGE:PASS:` se rechaza como captura. Secretos del demo: DEMO_QR_SECRETS (src/lib/mock/seed.ts).
   */
  livePass: (eventSecret, userId, now = Date.now()) => {
    const crypto = require("crypto");
    const hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest("hex");
    const step = Math.floor(now / 20_000);
    const sig = hmac(hmac(eventSecret, `PASS:${userId}`), `PASS:${userId}:${step}`).slice(0, 10).toUpperCase();
    return `ROUGE:T1:PASS:${userId}:${step}:${sig}`;
  },
  DEMO_QR_SECRETS: { night: "demo-qr-secret-bresh-sabado-0000000000000000", pro: "demo-qr-secret-encuentro-pyme-00000000000000" },
  unlockDemo: (ctx) => ctx.addInitScript(() => { try { localStorage.setItem("rouge:demo-access", "1"); } catch {} }),
  /** Link del magic link dentro del mail. */
  VERIFY_RE: new RegExp(`${escape(SUPABASE_URL)}/auth/v1/verify[^\\s"<>]+`),
};
