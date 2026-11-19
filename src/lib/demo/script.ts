/**
 * Guion de la demo en vivo para anfitriones: dueños de boliches y productoras (escenario "nightlife") o
 * empresas y agencias de eventos corporativos (escenario "corporate").
 * Lo usan /demo (hub) y /demo/presentador (teléfono + panel lado a lado). Solo Modo Demo.
 */
import { DEMO_IDS, type DemoScenario } from "@/lib/mock/seed";
import type { UUID } from "@/lib/types";

export type DemoRole = "asistente" | "amiga" | "duena" | "produccion" | "barra" | "mozo" | "seguridad" | "rrpp";

export const DEMO_ROLES: Record<DemoRole, { id: UUID; name: string; label: string; emoji: string; home: string; side: "phone" | "panel" }> = {
  asistente: { id: DEMO_IDS.me, name: "Sofía", label: "Asistente", emoji: "✨", home: "/app", side: "phone" },
  amiga: { id: "00000000-0000-4000-8000-000000000002", name: "Camila", label: "Otra asistente", emoji: "👯", home: "/app", side: "phone" },
  duena: { id: DEMO_IDS.organizer, name: "Paula", label: "Dueña", emoji: "👑", home: "/admin", side: "panel" },
  produccion: { id: DEMO_IDS.manager, name: "Luciano", label: "Producción", emoji: "🎛️", home: "/admin", side: "panel" },
  barra: { id: DEMO_IDS.bartender, name: "Daniela", label: "Barra", emoji: "🍸", home: "/admin/bar-pos", side: "panel" },
  mozo: { id: DEMO_IDS.waiter, name: "Tomás", label: "Mozo", emoji: "🛵", home: "/admin/bar-pos", side: "panel" },
  seguridad: { id: DEMO_IDS.security, name: "Marta", label: "Seguridad", emoji: "🛡️", home: "/admin", side: "panel" },
  rrpp: { id: DEMO_IDS.promoter, name: "Victoria", label: "RRPP", emoji: "📣", home: "/admin/rrpp", side: "panel" },
};

type RoleInfo = (typeof DEMO_ROLES)[DemoRole];

/** Roles con los nombres de cada escenario (en el kickoff Paula organiza por la empresa y la barra es el catering). */
export function demoRoles(scenario: DemoScenario): Record<DemoRole, RoleInfo> {
  if (scenario !== "corporate") return DEMO_ROLES;
  return {
    ...DEMO_ROLES,
    amiga: { ...DEMO_ROLES.amiga, label: "Compañera de equipo", emoji: "👥" },
    duena: { ...DEMO_ROLES.duena, label: "Organizadora", emoji: "💼" },
    barra: { ...DEMO_ROLES.barra, label: "Catering", emoji: "☕" },
  };
}

/** Roles del equipo que se muestran en cada escenario (en un evento corporativo no hay RRPP). */
export const panelRolesFor = (scenario: DemoScenario): DemoRole[] =>
  scenario === "corporate" ? ["duena", "produccion", "barra", "mozo", "seguridad"] : ["duena", "produccion", "barra", "mozo", "seguridad", "rrpp"];

export const DEMO_SCENARIOS: { value: DemoScenario; label: string; emoji: string; pitch: string }[] = [
  { value: "nightlife", label: "Fiesta / boliche", emoji: "🪩", pitch: "Para dueños de boliches y productoras." },
  { value: "corporate", label: "Evento corporativo", emoji: "💼", pitch: "Para empresas, RR. HH. y agencias de eventos." },
];

export interface DemoStep {
  title: string;
  minutes: string;
  /** Qué decir (en voz alta, al anfitrión). */
  say: string;
  /** Qué tocar, en orden. */
  do: string[];
  phone: string;
  panelRole: DemoRole;
  panel: string;
}

export const DEMO_SCRIPT: DemoStep[] = [
  {
    title: "El problema",
    minutes: "0:30",
    say: "Filas en la barra, grupos que se pierden y gente que se va temprano. Y al final de la noche, cero datos de quién vino.",
    do: ["Mostrá el resumen del panel: así se ve una noche medida."],
    phone: "/app",
    panelRole: "duena",
    panel: "/admin",
  },
  {
    title: "La puerta",
    minutes: "0:45",
    say: "Cada entrada trae un link o un QR. Sin descargar nada: se abre en el navegador y queda como app.",
    do: ["Panel → QR del link maestro.", "Teléfono → el asistente elige su mood y entra al lobby."],
    phone: "/join/bresh-sabado",
    panelRole: "duena",
    panel: "/admin/events",
  },
  {
    title: "Conectar",
    minutes: "1:00",
    say: "La gente se conoce por la música que escucha. Conectar es mutuo y hay un solo Rompehielos por noche: nada de spam.",
    do: ["Teléfono → Lobby: tocá ♥ en alguien.", "Bandeja → aceptá el Rompehielos fijado arriba y abrí el chat."],
    phone: "/lobby",
    panelRole: "duena",
    panel: "/admin",
  },
  {
    title: "Seguridad",
    minutes: "1:00",
    say: "Nadie se queda solo. Un toque y el Squad y tu equipo de seguridad saben dónde está esa persona.",
    do: ["Teléfono → Squad → 🚨 Rescate.", "Panel (Seguridad) → la alerta aparece con su ubicación en el plano."],
    phone: "/squad",
    panelRole: "seguridad",
    panel: "/admin",
  },
  {
    title: "La plata",
    minutes: "1:30",
    say: "Pedís desde la pista, retirás con QR o te lo llevan al pin. Menos filas es más consumo.",
    do: ["Teléfono → Barra Express: pedí un trago para retirar.", "Panel (Barra) → Empezar a preparar → Listo: el aviso llega al teléfono."],
    phone: "/bar",
    panelRole: "barra",
    panel: "/admin/bar-pos",
  },
  {
    title: "Fidelizar",
    minutes: "1:00",
    say: "Le hablás a la gente correcta en el momento justo, y la pantalla del boliche se vuelve parte del show.",
    do: ["Panel → Text Blast: mandá la Flash Promo a Squads de 4+.", "El aviso aparece en el teléfono. Mostrá la Pantalla LED."],
    phone: "/app",
    panelRole: "duena",
    panel: "/admin/blasts",
  },
  {
    title: "Los datos y el cierre",
    minutes: "1:15",
    say: "Todo queda en tu CRM: quién vino, con quién y cuánto consumió. Te proponemos el primer evento gratis a cambio de datos y un testimonio.",
    do: ["Panel → CRM: Smart Tags y exportar CSV.", "Cerrá con la propuesta de piloto."],
    phone: "/app",
    panelRole: "duena",
    panel: "/admin/crm",
  },
];

/** URL que abre una vista "como" un rol en una pestaña nueva (ver /demo/abrir). */
export const openAs = (role: DemoRole, path?: string) => `/demo/abrir?rol=${role}&a=${encodeURIComponent(path ?? DEMO_ROLES[role].home)}`;

/** Guion para empresas: kickoff con agenda, networking por áreas, catering y after office. */
export const DEMO_SCRIPT_CORPORATE: DemoStep[] = [
  {
    title: "El problema",
    minutes: "0:30",
    say: "En un evento de empresa cada uno se queda con su equipo, la agenda se pierde en el grupo de WhatsApp y al final nadie sabe qué funcionó.",
    do: ["Mostrá el resumen del panel: así se ve un evento medido."],
    phone: "/app",
    panelRole: "duena",
    panel: "/admin",
  },
  {
    title: "Acreditación",
    minutes: "0:45",
    say: "Cada invitado recibe su link o QR con el mail de la invitación. Entra desde el navegador, sin descargar nada, y en la puerta se valida con el celular.",
    do: ["Teléfono → elige qué viene a buscar hoy y entra.", "Panel → Puerta: el escáner muestra foto y nombre, y cuenta quién ya llegó."],
    phone: "/join/kickoff-vertice",
    panelRole: "duena",
    panel: "/admin/door",
  },
  {
    title: "Networking con criterio",
    minutes: "1:15",
    say: "La grilla ordena a quién te conviene conocer por áreas e intereses en común y por lo que cada uno viene a buscar. Conectar es mutuo y hay un solo mensaje de presentación por evento: nada de spam.",
    do: ["Teléfono → Lobby: mirá empresa y cargo y tocá Conectar.", "Bandeja → aceptá el Rompehielos de un invitado externo y abrí el chat."],
    phone: "/lobby",
    panelRole: "duena",
    panel: "/admin",
  },
  {
    title: "La agenda y los avisos",
    minutes: "1:00",
    say: "La agenda vive en la app: qué charla es ahora, en qué sala y qué sigue. Y el organizador avisa en el momento justo, a todos o a un segmento.",
    do: ["Teléfono → banner de la agenda → Ver agenda.", "Panel → Text Blast: avisá que arrancan los premios en el plenario."],
    phone: "/app",
    panelRole: "duena",
    panel: "/admin/blasts",
  },
  {
    title: "Catering sin filas",
    minutes: "1:00",
    say: "Café, tragos y comida se piden desde el celular y se retiran con QR. El organizador ve qué se consume y cuándo.",
    do: ["Teléfono → Barra Express: pedí un café para retirar.", "Panel (Catering) → Empezar a preparar → Listo: el aviso llega al teléfono."],
    phone: "/bar",
    panelRole: "barra",
    panel: "/admin/bar-pos",
  },
  {
    title: "Cuidado en el after office",
    minutes: "0:45",
    say: "Cuando arranca el after, nadie se queda solo: un toque y su equipo y seguridad saben dónde está esa persona.",
    do: ["Teléfono → Squad → 🚨 Rescate.", "Panel (Seguridad) → la alerta aparece con su ubicación en el plano."],
    phone: "/squad",
    panelRole: "seguridad",
    panel: "/admin",
  },
  {
    title: "Los datos y el cierre",
    minutes: "1:15",
    say: "Al final tenés la foto completa: quién vino, de qué empresa y área, cuántos contactos nuevos se hicieron y qué se consumió. Te proponemos el primer evento sin costo a cambio de un caso de éxito.",
    do: ["Panel → CRM: empresa, cargo e intereses; exportá el CSV.", "Pantalla LED: sorteo del sponsor en vivo. Cerrá con la propuesta de piloto."],
    phone: "/app",
    panelRole: "duena",
    panel: "/admin/crm",
  },
];

export const demoScript = (scenario: DemoScenario): DemoStep[] => (scenario === "corporate" ? DEMO_SCRIPT_CORPORATE : DEMO_SCRIPT);
