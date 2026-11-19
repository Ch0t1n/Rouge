/**
 * Escenario corporativo del Modo Demo: "Kickoff 2027 · Grupo Vértice" (empresa ficticia), en vivo ahora.
 *
 * Parte del estado de la fiesta (mismos ids, conexiones, Squads, pines y pedidos: los flujos y los tests valen
 * igual) y le cambia el contenido: evento corporativo con agenda, perfiles profesionales (empresa, cargo, áreas e
 * intereses, LinkedIn), moods de networking, plano de un centro de convenciones, catering y sin RRPP.
 * No importa valores de seed.ts (seed.ts lo importa a este archivo).
 */
import type { BarMenuItem, BarOrderItem, MoodTag, ProInterest, Profile, RougeState } from "@/lib/types";
import { DEMO_IDS } from "./ids";

/** Sectores del plano: misma geometría que el boliche, otro lugar. */
const SECTOR_NAMES: Record<string, string> = {
  "Cabina DJ": "Escenario",
  "Pista Principal": "Plenario",
  "Barra Central": "Coffee & Bar",
  "Patio Terraza": "Terraza",
  "Sector VIP": "Lounge Sponsors",
  Lounge: "Zona Networking",
  Entrada: "Acreditación",
};
const sector = (name: string | null) => (name ? (SECTOR_NAMES[name] ?? name) : name);

export const CORPORATE_MENU: BarMenuItem[] = [
  { id: "cafe", name: "Café de especialidad", category: "sin_alcohol", price: 3000, emoji: "☕", is_available: true },
  { id: "flat", name: "Flat white", category: "sin_alcohol", price: 3800, emoji: "🥛", is_available: true },
  { id: "limonada", name: "Limonada con menta", category: "sin_alcohol", price: 4000, emoji: "🍋", is_available: true },
  { id: "agua", name: "Agua sin gas", category: "sin_alcohol", price: 2500, emoji: "💧", is_available: true },
  { id: "vino", name: "Copa de Malbec", category: "trago", price: 6000, emoji: "🍷", is_available: true },
  { id: "gin", name: "Gin Tonic", category: "trago", price: 8000, emoji: "🍸", is_available: true },
  { id: "ipa", name: "Cerveza IPA", category: "cerveza", price: 5000, emoji: "🍺", is_available: true },
  { id: "tabla", name: "Tabla de quesos para 4", category: "combo", price: 18000, emoji: "🧀", is_available: true },
  { id: "empanadas", name: "Docena de empanadas", category: "combo", price: 22000, emoji: "🥟", is_available: true },
  { id: "espumante", name: "Espumante Brut", category: "botella", price: 45000, emoji: "🍾", is_available: true },
];

/** Ítem de la fiesta → ítem del catering (los pedidos del seed se reescriben con el menú nuevo). */
const ITEM_MAP: Record<string, string> = {
  fernet: "vino",
  gin: "gin",
  speed: "flat",
  aperol: "limonada",
  ipa: "ipa",
  agua: "agua",
  energy: "cafe",
  "combo-fernet": "tabla",
  "botella-vodka": "espumante",
  champagne: "espumante",
};

interface WorkPersona {
  username: string;
  bio: string;
  company: string;
  job_title: string;
  interests: ProInterest[];
  mood: MoodTag;
  linkedin?: string;
}

const VERTICE = "Grupo Vértice";

const PEOPLE: Record<number, WorkPersona> = {
  1: { username: "sofia.benitez", company: VERTICE, job_title: "Diseñadora UX Senior", interests: ["Diseño", "Producto", "Data e IA"], mood: "other_areas", linkedin: "sofia-benitez-ux", bio: "Diseño los productos digitales del grupo. Hoy quiero conocer a gente de Ventas y Operaciones para entender mejor a los clientes." },
  2: { username: "camila.rios", company: VERTICE, job_title: "Product Manager", interests: ["Producto", "Tecnología", "Diseño"], mood: "with_team", linkedin: "camila-rios-pm", bio: "PM de la app de clientes. Si tenés una idea para 2027, contámela." },
  3: { username: "julieta.paz", company: VERTICE, job_title: "Analista de Marketing", interests: ["Marketing", "Data e IA", "Ventas"], mood: "open_to_chat", bio: "Campañas, métricas y mucho café. Me sumé al equipo hace 3 meses." },
  4: { username: "melina.duarte", company: VERTICE, job_title: "Líder de Operaciones", interests: ["Operaciones", "Sustentabilidad", "Producto"], mood: "with_team", linkedin: "melina-duarte", bio: "Hago que las cosas pasen a tiempo. Busco aliados para el proyecto de logística verde." },
  5: { username: "mateo.sosa", company: VERTICE, job_title: "Data Scientist", interests: ["Data e IA", "Tecnología", "Producto"], mood: "networking", linkedin: "mateo-sosa-data", bio: "Modelos de recomendación y tableros. Estoy armando un equipo de IA aplicada: escribime." },
  6: { username: "lucas.ferreyra", company: "Nimbo Cloud", job_title: "Gerente Comercial", interests: ["Ventas", "Tecnología", "Emprendimiento"], mood: "business", linkedin: "lucas-ferreyra", bio: "Sponsor del Kickoff. Pasá por el Lounge Sponsors y te muestro la demo." },
  7: { username: "bruno.mendez", company: "Kuarzo", job_title: "Founder & CEO", interests: ["Emprendimiento", "Data e IA", "Ventas"], mood: "business", linkedin: "bruno-mendez-kuarzo", bio: "IA para retail. Startup invitada por el programa de innovación abierta." },
  8: { username: "joaquin.vera", company: VERTICE, job_title: "Desarrollador Frontend", interests: ["Tecnología", "Diseño", "Producto"], mood: "open_to_chat", bio: "React, accesibilidad y buenos componentes." },
  9: { username: "valentina.gomez", company: VERTICE, job_title: "Analista de RR. HH.", interests: ["RR. HH.", "Sustentabilidad"], mood: "with_team", bio: "Parte del equipo que organizó el Kickoff. Hoy vengo por los premios 🎟️" },
  10: { username: "tomas.aguirre", company: VERTICE, job_title: "Director de Finanzas", interests: ["Finanzas", "Operaciones", "Legal"], mood: "networking", linkedin: "tomas-aguirre-cfo", bio: "Números claros, decisiones rápidas. Mesa 4 en el Lounge: sumate." },
  11: { username: "nicolas.paredes", company: VERTICE, job_title: "Abogado corporativo", interests: ["Legal", "Finanzas"], mood: "networking", bio: "Contratos, compliance y cero sorpresas." },
  12: { username: "francisca.luna", company: VERTICE, job_title: "Talent Acquisition Lead", interests: ["RR. HH.", "Tecnología", "Emprendimiento"], mood: "hiring", linkedin: "francisca-luna-talent", bio: "Tenemos 12 búsquedas abiertas para 2027. Solo mensajes de gente con la que conecté 😌" },
  13: { username: "gonzalo.ibarra", company: "Consultor independiente", job_title: "Consultor comercial", interests: ["Ventas", "Marketing"], mood: "networking", bio: "—" },
};

const STAFF_BIOS: Record<string, string> = {
  [DEMO_IDS.organizer]: "Directora de Personas y Cultura de Grupo Vértice. Organiza el Kickoff.",
  [DEMO_IDS.manager]: "Producción del evento (agencia).",
  [DEMO_IDS.bartender]: "Coordinación del catering y la barra.",
  [DEMO_IDS.waiter]: "Servicio a las mesas.",
  [DEMO_IDS.security]: "Seguridad del predio.",
};

const MESSAGES: Record<number, string> = {
  1: "👋 Julieta se sumó al Squad",
  2: "🎁 ¡Equipo de 4 antes del panel! Tienen un café o trago de bienvenida en Mis Perks",
  3: "Estoy en la primera fila del plenario, les guardé lugar",
  4: "Voy para allá 🙏",
  5: "Estoy en la terraza tomando aire, en 10 vuelvo para el networking",
  6: "🚩 ¡Nos vemos en el Punto Base en 10 min!",
  7: "¡Hola Sofía! Vi que también te interesa la IA aplicada a producto 😄",
  8: "¡Sí! Me encantó el panel. ¿Vos en qué equipo estás?",
  9: "En Data. Estamos armando un modelo de recomendaciones y nos vendría bien alguien de UX",
  10: "Me interesa mucho. Después del networking lo charlamos",
  11: "Dale, te compartí mi pin: estoy en el Coffee & Bar ☕",
};

export function toCorporate(base: RougeState): RougeState {
  const nightEvent = base.events[0];
  const start = +new Date(nightEvent.starts_at);
  const at = (minFromStart: number) => new Date(start + minFromStart * 60_000).toISOString();

  const agenda = [
    { artist: "Acreditación y café de bienvenida", room: "Acreditación", from: 0, to: 30 },
    { artist: "Apertura: Visión 2027 · Paula Ferrari", room: "Plenario", from: 30, to: 75, headliner: true },
    { artist: "Panel: IA aplicada a cada área", room: "Plenario", from: 75, to: 115 },
    { artist: "Networking guiado por áreas", room: "Zona Networking", from: 115, to: 160 },
    { artist: "Premios Vértice 2026", room: "Plenario", from: 160, to: 200, headliner: true },
    { artist: "After office con DJ", room: "Terraza", from: 200, to: 360 },
  ];

  const event = {
    ...nightEvent,
    slug: "kickoff-vertice",
    name: "Kickoff 2027 · Grupo Vértice",
    event_type: "corporate" as const,
    description: "Plenario, charlas por área, networking guiado y after office. Conocé a gente de otras áreas y de las empresas invitadas.",
    venue_name: "Centro de Convenciones · Puerto Madero",
    venue_layout_json: { ...nightEvent.venue_layout_json, sectors: nightEvent.venue_layout_json.sectors.map((s) => ({ ...s, name: sector(s.name)! })) },
    lineup_json: agenda.map((a, i) => ({ id: `talk-${i + 1}`, artist: a.artist, room: a.room, is_headliner: !!a.headliner, starts_at: at(a.from), ends_at: at(a.to) })),
    max_capacity: 600,
    master_invite_code: "VERTICE27",
  };

  const personaOf = (userId: string): WorkPersona | undefined => {
    const n = Number(userId.slice(-12));
    return n >= 1 && n <= 13 ? PEOPLE[n] : undefined;
  };
  const profiles: Profile[] = base.profiles.map((p) => {
    const w = personaOf(p.id);
    if (w)
      return {
        ...p,
        username: w.username,
        bio: w.bio,
        company: w.company,
        job_title: w.job_title,
        interests: w.interests,
        linkedin_username: w.linkedin ?? null,
        // El perfil es persistente, pero en el kickoff la gente no carga su música ni su Instagram.
        music_genres: [],
        spotify_embed_url: null,
        instagram_username: null,
        instagram_verified: false,
      };
    if (STAFF_BIOS[p.id]) return { ...p, bio: STAFF_BIOS[p.id], company: VERTICE, ...(p.id === DEMO_IDS.organizer ? { username: "paula.vertice", job_title: "Directora de Personas y Cultura" } : {}) };
    return p;
  });

  const lines = (items: BarOrderItem[]): BarOrderItem[] =>
    items.map((l) => {
      const it = CORPORATE_MENU.find((m) => m.id === (ITEM_MAP[l.item_id] ?? l.item_id)) ?? CORPORATE_MENU[0];
      return { item_id: it.id, name: `${it.emoji} ${it.name}`, qty: l.qty, unit_price: it.price };
    });

  const titles: Record<string, string> = {
    free_drink: "☕ Café o trago de bienvenida — Equipo de 4+",
    fast_pass: "⚡ Fast Pass — Fila rápida del Coffee & Bar",
    gifted_drink: "🍷 Copa de Malbec — regalo de Rompehielos",
  };

  return {
    ...base,
    profiles,
    // Nadie conectó Instagram en el kickoff (el login social sigue disponible).
    instagram_links: [],
    events: [event],
    brands: base.brands.map((b) => (b.id === DEMO_IDS.brand ? { ...b, name: VERTICE, logo_url: "/demo/brands/grupo-vertice.svg", primary_color: "#2F6BFF", accent_color: null } : b)),
    brand_payment_accounts: base.brand_payment_accounts.map((a) => ({ ...a, account_label: `${VERTICE} (demo)` })),
    // Sin RRPP: los invitados llegan por el mail de la empresa (códigos de 1 uso) o el link general.
    event_staff: base.event_staff.filter((m) => m.role !== "promoter"),
    promoter_links: [],
    event_invite_codes: base.event_invite_codes.map((c, i) => ({
      ...c,
      external_ref: c.external_ref ? `RRHH-${2027000 + i}` : null,
      label: c.label ? (c.label === "VIP" ? "Invitado externo" : "Empleado") : null,
    })),
    event_attendees: base.event_attendees.map((a) => ({
      ...a,
      mood_tag: personaOf(a.user_id)?.mood ?? a.mood_tag,
      visited_sectors: a.visited_sectors.map((v) => sector(v)!),
      referred_by: null,
    })),
    connections: base.connections.map((c) =>
      c.type === "icebreaker"
        ? { ...c, icebreaker_message: "Hola Sofía, soy founder de Kuarzo (IA para retail). Me encantó tu pregunta en el panel: ¿te invito una copa y te cuento?" }
        : c,
    ),
    squads: base.squads.map((s) =>
      s.id === DEMO_IDS.squadMain
        ? { ...s, name: "Equipo Producto & Diseño", invite_code: "SQ-PRODUCTO", base_pin_label: "Mesa alta junto al Coffee & Bar" }
        : s.id === DEMO_IDS.squadVip
          ? { ...s, name: "Mesa 4 · Finanzas y sponsors", invite_code: "SQ-MESA4", base_pin_label: "Mesa 4 — Lounge Sponsors" }
          : s,
    ),
    map_pins: base.map_pins.map((p) => ({
      ...p,
      sector_name: sector(p.sector_name),
      note: p.note === "Frente a la cabina 🪩" ? "Primera fila del plenario" : p.note === "Fumando en el patio" ? "Tomando aire en la terraza" : p.note === "Te espero acá 🍸" ? "Te espero en el Coffee & Bar ☕" : p.note,
    })),
    messages: base.messages.map((m) => {
      const n = Number(m.id.slice(-12)) - 9000;
      return MESSAGES[n] ? { ...m, content: MESSAGES[n] } : m;
    }),
    event_blasts: base.event_blasts.map((b) =>
      b.is_flash_promo
        ? { ...b, title: "⚡ 20 min · Stand de Nimbo Cloud", message: "Pasá por el Lounge Sponsors: demo en vivo y café de especialidad sin cargo.", cta_label: "Ver en el plano" }
        : { ...b, title: "🎟️ ¡Bienvenidos al Kickoff 2027!", message: "Armá tu equipo de 4 antes del panel y desbloqueá un café o trago de bienvenida para cada uno.", cta_label: "Armar Squad" },
    ),
    user_perks_qrs: base.user_perks_qrs.map((q) => ({ ...q, title: titles[q.perk_type] ?? q.title })),
    perk_rules: base.perk_rules.map((r) => ({ ...r, title: titles[r.perk_type] ?? r.title })),
    raffles: base.raffles.map((r) => ({ ...r, prize_title: "Notebook de regalo de Nimbo Cloud (sponsor)" })),
    // En el kickoff no se piden temas: el banner muestra la agenda.
    song_requests: [],
    bar_menu: CORPORATE_MENU,
    bar_orders: base.bar_orders.map((o) => {
      const items = lines(o.items_json);
      return { ...o, items_json: items, total_amount: items.reduce((a, i) => a + i.qty * i.unit_price, 0), sector_name: sector(o.sector_name) };
    }),
    squad_expenses: base.squad_expenses.map((e, i) => ({
      ...e,
      description: ["🚕 Remís desde la oficina", "🥐 Desayuno del equipo", "🍽️ Cena con el sponsor (reserva)"][i] ?? e.description,
    })),
    payout_aliases: base.payout_aliases.map((a) => {
      const w = personaOf(a.user_id);
      return w ? { ...a, alias: `${w.username}.mp` } : a;
    }),
  };
}
