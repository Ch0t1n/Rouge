/**
 * Corre las suites E2E contra una app YA levantada (ver e2e/README.md).
 *   node e2e/run.cjs demo        → app en Modo Demo
 *   node e2e/run.cjs supabase    → app conectada a un Supabase de prueba (+ Mailpit)
 *   node e2e/run.cjs instagram   → app con Instagram apuntando al mock (lo levanta este script)
 *   node e2e/run.cjs api         → API v1 por HTTP (app con Supabase + SUPABASE_SERVICE_ROLE_KEY)
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");

const SUITES = {
  demo: ["demo-onboarding.cjs", "demo-lobby.cjs", "demo-squad-bar.cjs", "demo-admin.cjs", "demo-roles-qr-landing.cjs", "demo-anfitriones.cjs", "demo-marca-cobros.cjs", "demo-gestion-evento.cjs", "demo-rrpp-puerta.cjs", "demo-pro.cjs", "demo-pro-ficha-zonas.cjs"],
  supabase: ["supabase-flow.cjs"],
  instagram: ["supabase-instagram.cjs"],
  api: ["api.cjs"],
};

const which = process.argv[2];
if (!SUITES[which]) {
  console.error(`Uso: node e2e/run.cjs <${Object.keys(SUITES).join("|")}>`);
  process.exit(2);
}
if (which !== "demo" && (!process.env.SUPABASE_TEST_ANON_KEY || !process.env.SUPABASE_TEST_SERVICE_KEY)) {
  console.error("Faltan SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_KEY (ver e2e/README.md).");
  process.exit(2);
}

const mock = which === "instagram" ? spawn(process.execPath, [path.join(__dirname, "mocks", "instagram-api.cjs")], { stdio: "inherit" }) : null;
let failed = 0;
(async () => {
  if (mock) await new Promise((r) => setTimeout(r, 800));
  for (const file of SUITES[which]) {
    console.log(`\n━━ ${file}`);
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit", env: process.env });
    if (r.status !== 0) failed++;
  }
  mock?.kill();
  console.log(failed ? `\n✘ ${failed} suite(s) fallaron` : "\n✔ todas las suites pasaron");
  process.exit(failed ? 1 : 0);
})();
