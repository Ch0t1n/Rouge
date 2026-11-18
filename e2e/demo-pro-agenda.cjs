// Demo · ROUGE PRO Fase 2: agenda multi-track, Mi Agenda con choques de horario, "Ubicar sala" en el plano indoor,
// Q&A con votos y moderación, y encuestas en vivo (asistente y organizadora en pestañas sincronizadas).
const { chromium } = require("playwright");
const { BASE: B, OUT: SP, unlockDemo } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PRO = id(1100);
const S = { live: id(21002), lead: id(21003), export: id(21004), panel: id(21005), workshop: id(21006) };
const open = (role, path) => `${B}/demo/abrir?rol=${role}&a=${encodeURIComponent(path)}`;
const sel = (t) => `[data-testid="${t}"]`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await unlockDemo(ctx);

  // ── Sofía entra al encuentro pyme y abre la agenda desde el inicio ──
  const ph = await ctx.newPage(); watch(ph, "sofi");
  await ph.goto(`${B}/app`, { waitUntil: "networkidle" });
  await ph.goto(`${B}/join/PYME26`, { waitUntil: "networkidle" });
  await ph.click("text=Volver al lobby");
  await ph.waitForURL("**/lobby");
  await ph.goto(`${B}/app`, { waitUntil: "networkidle" });
  await ph.waitForSelector(sel("agenda-home"));
  assert((await ph.textContent(sel("agenda-home"))).includes("IA aplicada a la pyme"), "inicio: la tarjeta de Agenda muestra la charla en vivo");

  await ph.goto(`${B}/agenda`, { waitUntil: "networkidle" });
  await ph.waitForSelector(sel(`session-${S.live}`));
  assert((await ph.textContent(sel("agenda-count"))).includes("2 en Mi Agenda · 6 charlas"), "agenda: 6 charlas, 2 en Mi Agenda");
  assert(await ph.isVisible(sel("live-now")), "banda 'En vivo' con la charla activa");
  assert((await ph.textContent("main")).includes("en paralelo"), "charlas simultáneas agrupadas por franja (multi-track)");
  await ph.screenshot({ path: `${SP}/pro-agenda.png`, fullPage: true });

  // Filtros: track, sala y "Ver solo Mi Agenda"
  await ph.click(sel("filter-track-Liderazgo"));
  assert((await ph.locator('[data-testid^="session-"]').count()) === 2, "filtro por track: 2 charlas de Liderazgo");
  await ph.click(sel("filter-track-Liderazgo"));
  await ph.selectOption(sel("filter-room"), "Sala Directorio B");
  assert((await ph.locator('[data-testid^="session-"]').count()) === 2, "filtro por sala: 2 charlas en la Sala Directorio B");
  await ph.selectOption(sel("filter-room"), "");
  await ph.click(sel("filter-mine"));
  const mine = await ph.locator('[data-testid^="session-"]').count();
  assert(mine === 2 && (await ph.isVisible(sel(`session-${S.panel}`))), "Ver solo Mi Agenda: las 2 agendadas");
  await ph.click(sel("filter-mine"));

  // Choque de horario: "Exportar sin intermediarios" se superpone con el panel agendado → Reemplazar
  assert((await ph.textContent(sel(`agenda-toggle-${S.workshop}`))).includes("Sin lugares"), "taller con cupo lleno: 'Sin lugares'");
  await ph.click(sel(`agenda-toggle-${S.export}`));
  await ph.waitForSelector(sel("agenda-conflict"));
  const warn = await ph.textContent(sel("agenda-conflict"));
  assert(/Se superpone con «Panel: Vender online sin morir en el intento» a las \d\d:\d\d hs/.test(warn), `aviso claro: "${warn.trim().slice(0, 90)}…"`);
  await ph.screenshot({ path: `${SP}/pro-agenda-conflicto.png` });
  await ph.click("text=Reemplazar la otra charla");
  await ph.waitForSelector("text=Agendada");
  assert((await ph.textContent(sel(`agenda-toggle-${S.export}`))).includes("Agendado ✓"), "Exportar quedó agendada");
  assert((await ph.textContent(sel(`agenda-toggle-${S.panel}`))).includes("Agendar"), "el panel salió de Mi Agenda (reemplazo)");
  // Confirmar ("Agendar igual"): vuelvo a agendar el panel y quedan las dos
  await ph.click(sel(`agenda-toggle-${S.panel}`));
  await ph.waitForSelector(sel("agenda-conflict"));
  await ph.click("text=Agendar igual");
  await ph.waitForFunction((t) => document.querySelector(`[data-testid="${t}"]`)?.textContent?.includes("Agendado"), `agenda-toggle-${S.panel}`);
  assert((await ph.textContent(sel("agenda-count"))).includes("3 en Mi Agenda"), "confirmar: quedan las dos charlas superpuestas");

  // Ubicar sala en el mapa → plano centrado en el pin de la sala
  await ph.click(sel(`locate-${S.lead}`));
  await ph.waitForURL("**/map?spot=*");
  await ph.waitForSelector(sel("focused-room"));
  assert((await ph.textContent(sel("focused-room"))).includes("Sala Directorio B"), "el plano resalta la Sala Directorio B");
  assert(await ph.isVisible('[aria-label="Sala Directorio B"]'), "pin de la sala visible en el plano indoor");
  const transform = await ph.evaluate(() => document.querySelector('[role="application"] > div')?.style.transform ?? "");
  assert(/scale\(2\.2\)/.test(transform), `plano acercado y centrado en la sala (${transform})`);
  await ph.screenshot({ path: `${SP}/pro-agenda-mapa.png` });

  // ── Sala en vivo: Q&A y encuesta ──
  await ph.goto(`${B}/agenda/${S.live}`, { waitUntil: "networkidle" });
  await ph.waitForSelector(sel("session-detail"));
  const qs = await ph.textContent(sel("questions"));
  assert(!qs.includes("Vendo cursos"), "la pregunta oculta por la moderación no la ve el público");
  assert(qs.indexOf("WhatsApp") < qs.indexOf("Cuánto cuesta") && qs.indexOf("Cuánto cuesta") < qs.indexOf("datos de los clientes"), "destacada primero y abiertas por votos ▲");
  assert(await ph.isDisabled(sel(`upvote-${id(21103)}`)), "no se puede votar la propia pregunta");
  await ph.click(sel(`upvote-${id(21102)}`));
  await ph.waitForFunction((t) => document.querySelector(`[data-testid="${t}"]`)?.textContent?.includes("18"), `upvote-${id(21102)}`);
  log("✔ voto ▲: 17 → 18");
  await ph.click(sel("ask-anonymous"));
  await ph.fill(sel("ask-input"), "¿Qué presupuesto mínimo recomiendan para arrancar?");
  await ph.click(sel("ask-send"));
  await ph.waitForSelector("text=Se publicó como anónima");
  assert((await ph.textContent(sel("questions"))).includes("presupuesto mínimo"), "pregunta anónima publicada");
  await ph.screenshot({ path: `${SP}/pro-qa.png`, fullPage: true });

  await ph.click(sel("tab-polls"));
  const poll = sel(`poll-${id(21201)}`);
  await ph.waitForSelector(poll);
  assert(!(await ph.textContent(poll)).includes("%"), "antes de votar no se ven los porcentajes");
  await ph.click(sel("poll-option-o3"));
  await ph.waitForFunction((p) => document.querySelector(p)?.textContent?.includes("%"), poll);
  const res = await ph.textContent(poll);
  assert(res.includes("118 votos") && res.includes("45%"), "votó en un toque: 118 votos y porcentajes (Todavía no 45%)");
  await ph.screenshot({ path: `${SP}/pro-encuesta.png`, fullPage: true });

  // ── Organizadora: carga una charla, la pone En Vivo, modera y lanza una encuesta ──
  const adm = await ctx.newPage(); watch(adm, "duena");
  await adm.setViewportSize({ width: 1280, height: 900 });
  await adm.goto(open("duena", "/admin/agenda"), { waitUntil: "networkidle" });
  await adm.locator("select:visible").first().selectOption(PRO);
  await adm.waitForSelector(sel("schedule-manager"));
  assert(await adm.isVisible('nav a[href="/admin/agenda"]'), "pestaña 'Agenda & Charlas' en el panel del evento corporativo");
  await adm.click(sel("session-new"));
  await adm.fill(sel("session-title"), "Ciberseguridad para pymes");
  await adm.fill(sel("session-track"), "Tecnología & IA");
  await adm.selectOption(sel("session-spot"), { label: "📍 Aula Taller" });
  const ws = await adm.inputValue(sel("session-start"));
  // Mismo horario que el taller en el Aula Taller → la sala está ocupada
  const taller = await adm.textContent(sel(`admin-session-${S.workshop}`));
  const [tStart, tEnd] = taller.match(/(\d\d:\d\d)–(\d\d:\d\d)/).slice(1);
  await adm.fill(sel("session-start"), tStart);
  await adm.fill(sel("session-end"), tEnd);
  await adm.click(sel("speaker-add"));
  await adm.fill(sel("speaker-name-0"), "Ing. Laura Méndez");
  await adm.click(sel("session-save"));
  await adm.waitForSelector("text=Esa sala ya tiene otra charla en ese horario.");
  log("✔ misma sala y horario: 'Esa sala ya tiene otra charla en ese horario.'");
  await adm.selectOption(sel("session-spot"), "");
  await adm.fill(sel("session-room"), "Sala 5");
  await adm.click(sel("session-save"));
  await adm.waitForSelector("text=Charla agregada a la agenda");
  assert((await adm.textContent(sel("schedule-manager"))).includes("Ciberseguridad para pymes"), `charla nueva en paralelo (sala distinta, ${tStart}; formulario arrancó en ${ws})`);

  await adm.click(sel(`live-toggle-${S.lead}`));
  await adm.waitForSelector("text=Charla en vivo");
  await adm.click(sel(`moderate-open-${S.live}`));
  await adm.waitForSelector(sel(`moderate-${id(21102)}`));
  assert((await adm.textContent(sel("schedule-manager"))).includes("Vendo cursos"), "moderación: ve la pregunta oculta");
  await adm.locator(sel(`moderate-${id(21102)}`)).getByText("Destacar").click();
  await adm.locator(sel(`moderate-${id(21103)}`)).getByText("Marcar como respondida").click();
  await adm.click(sel("tab-polls"));
  await adm.click(sel("poll-new"));
  await adm.fill(sel("poll-question"), "¿Te sirvió la charla?");
  await adm.fill(sel("poll-opt-0"), "Mucho");
  await adm.fill(sel("poll-opt-1"), "Algo");
  await adm.click(sel("poll-launch"));
  await adm.waitForSelector("text=Encuesta lanzada");
  await adm.screenshot({ path: `${SP}/pro-agenda-admin.png`, fullPage: true });

  // La pestaña de Sofía se sincroniza (evento storage): destacada nueva, respondida y encuesta nueva
  await ph.bringToFront();
  await ph.click(sel("tab-qa"));
  await ph.waitForFunction((t) => document.querySelector(`[data-testid="${t}"]`)?.textContent?.includes("Destacada"), `question-${id(21102)}`, { timeout: 8000 });
  assert((await ph.textContent(sel(`question-${id(21103)}`))).includes("Respondida"), "Sofía ve su pregunta respondida y la nueva destacada");
  await ph.click(sel("tab-polls"));
  await ph.waitForSelector("text=¿Te sirvió la charla?");
  log("✔ la encuesta nueva aparece en el teléfono");
  await ph.goto(`${B}/agenda`, { waitUntil: "networkidle" });
  assert((await ph.locator(sel("live-now")).count()) === 2, "ahora hay 2 charlas en vivo en paralelo");

  assert(errors.length === 0, `sin errores de consola (${errors.join(" | ")})`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
