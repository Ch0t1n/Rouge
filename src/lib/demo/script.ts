/**
 * Guion de la demo en vivo para anfitriones (dueños de boliches, productoras).
 * Lo usan /demo (hub) y /demo/presentador (teléfono + panel lado a lado). Solo Modo Demo.
 */
import { DEMO_IDS } from "@/lib/mock/seed";
import type { UUID } from "@/lib/types";

export type DemoRole = "asistente" | "amiga" | "duena" | "produccion" | "barra" | "mozo" | "seguridad" | "rrpp" | "puerta" | "hq";

export const DEMO_ROLES: Record<DemoRole, { id: UUID; name: string; label: string; emoji: string; home: string; side: "phone" | "panel" }> = {
  asistente: { id: DEMO_IDS.me, name: "Sofía", label: "Asistente", emoji: "✨", home: "/app", side: "phone" },
  amiga: { id: "00000000-0000-4000-8000-000000000002", name: "Camila", label: "Otra asistente", emoji: "👯", home: "/app", side: "phone" },
  duena: { id: DEMO_IDS.organizer, name: "Paula", label: "Dueña", emoji: "👑", home: "/admin", side: "panel" },
  produccion: { id: DEMO_IDS.manager, name: "Luciano", label: "Producción", emoji: "🎛️", home: "/admin", side: "panel" },
  barra: { id: DEMO_IDS.bartender, name: "Daniela", label: "Barra", emoji: "🍸", home: "/ops/bar", side: "panel" },
  mozo: { id: DEMO_IDS.waiter, name: "Tomás", label: "Mozo", emoji: "🛵", home: "/ops/bar", side: "panel" },
  seguridad: { id: DEMO_IDS.security, name: "Marta", label: "Seguridad", emoji: "🛡️", home: "/ops/door", side: "panel" },
  rrpp: { id: DEMO_IDS.promoter, name: "Victoria", label: "RRPP", emoji: "📣", home: "/admin/rrpp", side: "panel" },
  puerta: { id: DEMO_IDS.doorScanner, name: "Nicolás", label: "Puerta (invitado por link)", emoji: "🚪", home: "/ops/door", side: "panel" },
  hq: { id: DEMO_IDS.platformAdmin, name: "ROUGE HQ", label: "Consola global", emoji: "🛰️", home: "/superadmin", side: "panel" },
};

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
    panel: "/ops/door",
  },
  {
    title: "La plata",
    minutes: "1:30",
    say: "Pedís desde la pista, retirás con QR o te lo llevan al pin. Menos filas es más consumo.",
    do: ["Teléfono → Barra Express: pedí un trago para retirar.", "Panel (Barra) → Empezar a preparar → Listo: el aviso llega al teléfono."],
    phone: "/bar",
    panelRole: "barra",
    panel: "/ops/bar",
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
