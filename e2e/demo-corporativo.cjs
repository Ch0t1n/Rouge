// Demo · escenario corporativo: kickoff con agenda, perfiles profesionales, afinidad por intereses, onboarding
// corporativo de una persona nueva, panel (resumen, CRM, LED) y vuelta al escenario de la fiesta.
const { chromium } = require("playwright");
const { BASE: B, OUT: SP, FIXTURE_PHOTO } = require("./env.cjs");
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) throw new Error("✘ " + m); log("✔ " + m); };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    p.on("console", (m) => m.type() === "error" && !/spotify|net::|Failed to load resource/i.test(m.text()) && errors.push(`[${tag}] ${m.text()}`));
  };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const hub = await ctx.newPage(); watch(hub, "hub");

  // Elegir el escenario corporativo
  await hub.goto(`${B}/demo`, { waitUntil: "networkidle" });
  await hub.click('[role="radio"]:has-text("Evento corporativo")');
  await hub.waitForSelector("text=Networking con criterio");
  assert(await hub.isVisible("text=Un kickoff de empresa funcionando"), "/demo: escenario corporativo con su guion");
  assert(!(await hub.isVisible('a:has-text("RRPP")')), "sin vista de RRPP en el corporativo");

  // Teléfono: inicio con agenda
  const phone = await ctx.newPage(); watch(phone, "phone");
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${B}/demo/abrir?rol=asistente&a=/app`);
  await phone.waitForSelector("text=Kickoff 2027 · Grupo Vértice");
  assert(await phone.isVisible("text=Networking guiado por áreas"), "banner de la agenda: actividad en curso");
  await phone.click('button:has-text("Ver agenda")');
  await phone.waitForSelector('[aria-current="true"] >> text=Zona Networking');
  assert(await phone.isVisible("text=Premios Vértice 2026"), "agenda completa con salas y la actividad de ahora marcada");
  await phone.keyboard.press("Escape");

  // Lobby: cargo y empresa, % de intereses, moods corporativos
  await phone.goto(`${B}/lobby`);
  await phone.waitForSelector("text=Gente para conocer hoy");
  assert(await phone.isVisible("text=/Data Scientist · Grupo V/"), "tarjeta con cargo y empresa");
  assert(await phone.locator("text=/\\d+% 🤝/").first().isVisible(), "badge de intereses en común");
  assert(!(await phone.isVisible("text=/🎵/")), "sin afinidad musical en el corporativo");
  await phone.click('button:has-text("Filtros")');
  await phone.click('button[aria-pressed]:has-text("Legal")');
  await phone.getByRole("button", { name: /^Ver \d+$/ }).click();
  assert(await phone.isVisible("text=Abogado corporativo · Grupo Vértice"), "filtro por área (Legal)");
  await phone.screenshot({ path: `${SP}/corporativo-lobby.png` });

  // Perfil de un contacto: LinkedIn y áreas en común
  await phone.goto(`${B}/u/mateo.sosa`);
  await phone.waitForSelector("text=linkedin.com/in/mateo-sosa-data");
  assert(await phone.isVisible("text=Chatear · ya son contactos"), "perfil: ya son contactos");
  assert(await phone.isVisible("text=/Áreas e intereses · 2 en común/"), "perfil: áreas en común");

  // Persona nueva: onboarding corporativo → entra al evento con un mood de networking
  await phone.goto(`${B}/app`);
  await phone.click('button[aria-label="Cambiar de persona (Modo Demo)"]');
  await phone.click('button:has-text("Persona nueva")');
  await phone.waitForURL("**/onboarding");
  await phone.fill('input[autocomplete="name"]', "Laura Pérez");
  await phone.getByLabel("@username").fill("laura.perez");
  await phone.getByLabel("Fecha de nacimiento").fill("1992-04-10");
  await phone.fill('input[type="tel"]', "11 4444 5555");
  await phone.click('button:has-text("Continuar")');
  await phone.locator('input[type="file"][accept*="image"]').first().setInputFiles(FIXTURE_PHOTO);
  await phone.waitForSelector('img[alt], [style*="background"]', { timeout: 15000 }).catch(() => {});
  await phone.waitForTimeout(1500);
  await phone.click('button:has-text("Continuar")');
  await phone.waitForSelector("text=A qué te dedicás");
  await phone.getByLabel("Empresa (opcional)").fill("Nimbo Cloud");
  await phone.getByLabel("Cargo (opcional)").fill("Customer Success");
  await phone.getByLabel("LinkedIn (opcional)").fill("https://www.linkedin.com/in/laura-perez-cs/");
  assert(await phone.isVisible("text=✓ linkedin.com/in/laura-perez-cs"), "onboarding: LinkedIn normalizado");
  for (const area of ["Ventas", "Tecnología", "Producto"]) await phone.getByRole("button", { name: area, exact: true }).click();
  await phone.click('button:has-text("Continuar")');
  await phone.click('button:has-text("Entrar a ROUGE")');
  await phone.goto(`${B}/join/kickoff-vertice`);
  await phone.click('[role="radio"]:has-text("Busco clientes o proveedores")');
  await phone.click('button:has-text("Entrar al evento")');
  await phone.goto(`${B}/lobby`);
  await phone.waitForSelector("text=Gente para conocer hoy");
  assert(await phone.isVisible("text=💼 Busco clientes o proveedores"), "la persona nueva entra con un mood corporativo");
  assert(await phone.isVisible("text=67% 🤝"), "su grilla se ordena por sus intereses");

  // Panel: resumen, CRM y LED con vocabulario corporativo
  const panel = await ctx.newPage(); watch(panel, "panel");
  await panel.goto(`${B}/demo/abrir?rol=duena&a=/admin`);
  await panel.waitForSelector("text=Embudo del evento");
  assert(await panel.isVisible("text=Contactos nuevos"), "resumen: contactos nuevos");
  await panel.goto(`${B}/admin/crm`);
  await panel.waitForSelector("text=Empresa y cargo");
  await panel.fill('input[placeholder^="Buscar por nombre, empresa"]', "nimbo");
  assert(await panel.isVisible("text=Laura Pérez") && await panel.isVisible("text=Lucas Ferreyra"), "CRM: búsqueda por empresa");
  await panel.goto(`${B}/admin/live-wall`);
  await panel.waitForSelector("text=Contactos nuevos hoy");
  assert(await panel.isVisible("text=📍 Zona Networking"), "LED: actividad de ahora con su sala");
  await panel.screenshot({ path: `${SP}/corporativo-led.png` });

  // Volver a la fiesta
  await hub.goto(`${B}/demo`, { waitUntil: "networkidle" });
  await hub.click('[role="radio"]:has-text("Fiesta / boliche")');
  await phone.goto(`${B}/demo/abrir?rol=asistente&a=/lobby`);
  await phone.waitForSelector("text=Afines a vos esta noche");
  assert(await phone.isVisible("text=ROUGE Night × Bresh"), "volver al escenario de la fiesta");

  assert(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
