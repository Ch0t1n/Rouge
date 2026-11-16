// Demo · onboarding completo (perfil, fotos comprimidas, mood, privacidad)
const { chromium, devices } = require("playwright");
// Ver e2e/README.md. Configuración por variables de entorno (ver e2e/env.cjs).
const { BASE: B, OUT: SP, FIXTURE_PHOTO, unlockDemo } = require("./env.cjs");

const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();

  const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"] });
  await unlockDemo(ctx); // personas y "Simular…" solo tras entrar por /demo
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/spotify|ERR_|net::|Failed to load resource/i.test(m.text()) && errors.push(m.text()));

  await p.goto(`${B}/app`, { waitUntil: "networkidle" });
  await p.click('[aria-label="Cambiar de persona (Modo Demo)"]');
  await p.click("text=Persona nueva");
  await p.waitForURL("**/onboarding");
  log("✔ onboarding abierto");

  // Paso 1
  await p.fill('input[autocomplete="name"]', "Lucía Test");
  const user = p.locator('input[placeholder="sofi.noche"]');
  await user.fill("Sofi.Noche");
  log("username tomado →", await p.textContent("text=ya está en uso").catch(() => "NO ERROR"));
  await user.fill("lu.test");
  await p.fill('input[type="date"]', "2010-05-05");
  log("menor →", await p.textContent("text=/mayores de 18/").catch(() => "NO ERROR"));
  await p.fill('input[type="date"]', "1999-05-05");
  await p.click('role=radio[name="Mujer"]');
  await p.fill('input[type="tel"]', "11 4444-5555");
  log("teléfono normalizado →", await p.textContent("text=/Se guarda como/"));
  await p.screenshot({ path: `${SP}/ob-1.png` });
  await p.click("text=Continuar");

  // Paso 2: foto + video + bio
  await p.waitForSelector("text=Tu mejor versión");
  await p.setInputFiles('[data-testid="photo-input"]', FIXTURE_PHOTO);
  await p.click('[role="dialog"] button:has-text("Usar foto")');
  await p.waitForSelector('img[alt="Foto 1"]', { timeout: 30000 });
  log("toast compresión →", (await p.textContent("text=/→/").catch(() => "?")).trim());
  // Video de 3s generado en el navegador (con pista de audio para verificar que se elimina)
  await p.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 720; c.height = 960;
    const g = c.getContext("2d");
    const ac = new AudioContext(); const osc = ac.createOscillator(); const dest = ac.createMediaStreamDestination(); osc.connect(dest); osc.start();
    const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" }); const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const t0 = performance.now(); let raf;
    const draw = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = `hsl(${t * 120},90%,50%)`; g.fillRect(0, 0, 720, 960); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText(t.toFixed(1), 200, 500); raf = requestAnimationFrame(draw); };
    draw(); rec.start(); await new Promise((r) => setTimeout(r, 3000)); rec.stop(); await new Promise((r) => (rec.onstop = r)); cancelAnimationFrame(raf); osc.stop();
    const file = new File(chunks, "loop.webm", { type: "video/webm" });
    window.__inputSize = file.size;
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.querySelector('[data-testid="video-input"]'); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await p.waitForSelector("text=Loop listo", { timeout: 30000 });
  log("toast loop →", (await p.textContent("text=/sin audio/")).trim());
  const audioTracks = await p.evaluate(async () => {
    const v = document.querySelector("video"); await new Promise((r) => (v.readyState >= 1 ? r() : (v.onloadedmetadata = r)));
    return { muted: v.muted, loop: v.loop, audio: v.mozHasAudio ?? (v.webkitAudioDecodedByteCount ?? 0) };
  });
  log("video →", JSON.stringify(audioTracks));
  await p.fill("textarea", "Fan del house melódico y de las terrazas al amanecer.");
  await p.screenshot({ path: `${SP}/ob-2.png` });
  await p.click("text=Continuar");

  // Paso 3: música
  await p.waitForSelector("text=Lo que te hace bailar");
  await p.click('button[aria-pressed]:has-text("House")');
  await p.click('button[aria-pressed]:has-text("Techno")');
  await p.fill('input[inputmode="url"]', "https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=abc");
  await p.waitForSelector('iframe[title^="Spotify"]');
  log("spotify iframe →", await p.getAttribute('iframe[title^="Spotify"]', "src"));
  await p.screenshot({ path: `${SP}/ob-3.png` });
  await p.click("text=Continuar");

  // Paso 4: lista negra (teléfono de Cami en otro formato)
  await p.waitForSelector("text=Tu noche, tus reglas");
  await p.fill('input[type="tel"]', "+54 9 11 5000 1002");
  await p.click("text=Bloquear número");
  await p.waitForSelector("text=+54 9 •• ••••-1002");
  await p.screenshot({ path: `${SP}/ob-4.png` });
  await p.click("text=Entrar a Rouge Pass");
  await p.waitForURL(`${B}/app`);
  log("✔ onboarding completo → home");

  // Entrar al lobby con mood
  await p.click("text=Entrar al lobby");
  await p.click('role=radio[name*="Abierto a conocer gente"]');
  await p.click("text=Entrar a la fiesta");
  await p.waitForSelector("text=Entraste a");
  log("✔ check-in de mood");

  // Invisibilidad: Cami bloqueada por teléfono
  await p.goto(`${B}/u/cami.beats`, { waitUntil: "networkidle" });
  log("cami →", (await p.textContent("h2")).trim());
  // Mateo visible con afinidad
  await p.goto(`${B}/u/mateo.techno`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=/afinidad/");
  log("mateo afinidad →", (await p.textContent("text=/% afinidad/")).trim());
  await p.screenshot({ path: `${SP}/u-mateo.png` });
  await p.click('[aria-label="Más opciones"]');
  await p.click('button:has-text("Bloquear")');
  await p.locator('[role="dialog"] >> text=Bloquear').last().click();
  await p.waitForURL(`${B}/app`);
  await p.goto(`${B}/settings/privacy`, { waitUntil: "networkidle" });
  log("privacidad →", (await p.textContent("text=/Perfiles bloqueados/")).trim(), "|", (await p.textContent("text=/Números bloqueados/")).trim());
  await p.screenshot({ path: `${SP}/privacy.png`, fullPage: true });

  // Persistencia + IDB tras reload
  await p.goto(`${B}/profile`, { waitUntil: "networkidle" });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("text=Mi perfil");
  await p.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => i.src.startsWith("blob:") && i.naturalWidth > 0), null, { timeout: 10000 });
  const pct = (await p.textContent("text=/%$/").catch(() => "100%"));
  log("✔ perfil persistido; foto desde IndexedDB; completitud:", pct);
  await p.screenshot({ path: `${SP}/profile.png`, fullPage: true });

  console.log("errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
