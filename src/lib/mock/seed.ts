/**
 * Motor de Mock Data del Modo Demo.
 *
 * Todas las fechas son RELATIVAS a `now`: cada vez que se siembra, la fiesta
 * está "en vivo" (empezó hace 2 h, el DJ invitado está en cabina), así se
 * puede probar el 100% de los flujos en cualquier momento.
 */
import type {
  Brand,
  BrandPaymentAccount,
  PromoterLink,
  PayoutAlias,
  SquadExpense,
  InstagramLink,
  BarMenuItem,
  EventStaff,
  StaffRole,
  BarOrder,
  Connection,
  EventAttendee,
  EventBlast,
  EventInviteCode,
  Gender,
  MapPin,
  Message,
  MoodTag,
  MusicGenre,
  PerkRule,
  Meeting,
  PrivacySettings,
  Profile,
  ProfilePersona,
  VenueSpot,
  Raffle,
  RougeEvent,
  RougeState,
  SongRequest,
  Squad,
  SquadMember,
  UserBlock,
  UserPerkQR,
  VenueLayout,
} from "@/lib/types";

export const STATE_VERSION = 10;

// IDs estables → los links de demo (/join/..., /u/...) no cambian entre re-siembras.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_IDS = {
  event: id(1000),
  organizer: id(999),
  manager: id(990),
  bartender: id(991),
  waiter: id(992),
  security: id(993),
  me: id(1),
  squadMain: id(2001),
  squadVip: id(2002),
  brand: id(3001),
  promoter: id(994),
  /** [v1.7] Evento corporativo del demo (ROUGE Pro): encuentro de pymes, en vivo al mismo tiempo que la fiesta. */
  proEvent: id(1100),
  proBrand: id(3002),
  proTeam: id(2101),
  /** Perfil profesional de Sofi (la persona del demo). */
  mePro: id(1901),
} as const;

export const VENUE_LAYOUT: VenueLayout = {
  aspect: 3 / 4,
  sectors: [
    { id: "booth", name: "Cabina DJ", kind: "booth", x: 36, y: 4, w: 28, h: 7 },
    { id: "wc", name: "Baños", kind: "restroom", x: 76, y: 4, w: 20, h: 7 },
    { id: "coat", name: "Guardarropa", kind: "lounge", x: 4, y: 4, w: 20, h: 7 },
    { id: "floor", name: "Pista Principal", kind: "dancefloor", x: 8, y: 15, w: 84, h: 33 },
    { id: "bar", name: "Barra Central", kind: "bar", x: 30, y: 52, w: 40, h: 9 },
    { id: "patio", name: "Patio Terraza", kind: "outdoor", x: 4, y: 52, w: 22, h: 31 },
    { id: "bar-terraza", name: "Barra Terraza", kind: "bar", x: 6, y: 55, w: 18, h: 7 },
    { id: "vip", name: "Sector VIP", kind: "vip", x: 74, y: 52, w: 22, h: 31 },
    { id: "lounge", name: "Lounge", kind: "lounge", x: 30, y: 65, w: 40, h: 18 },
    { id: "entry", name: "Entrada", kind: "entrance", x: 36, y: 87, w: 28, h: 9 },
  ],
};

/** Plano del encuentro corporativo: escenario, stands, salas de reunión y coffee. */
export const PRO_VENUE_LAYOUT: VenueLayout = {
  aspect: 3 / 4,
  sectors: [
    { id: "stage", name: "Auditorio", kind: "stage", x: 8, y: 4, w: 84, h: 20 },
    { id: "stands-a", name: "Stands A · Industria", kind: "stand", x: 6, y: 28, w: 40, h: 22 },
    { id: "stands-b", name: "Stands B · Servicios", kind: "stand", x: 54, y: 28, w: 40, h: 22 },
    { id: "coffee", name: "Coffee & Networking", kind: "lounge", x: 6, y: 54, w: 54, h: 20 },
    { id: "bar-pro", name: "Barra", kind: "bar", x: 14, y: 57, w: 26, h: 7 },
    { id: "rooms", name: "Salas de reunión", kind: "meeting", x: 64, y: 54, w: 30, h: 20 },
    { id: "wc-pro", name: "Baños", kind: "restroom", x: 64, y: 78, w: 30, h: 8 },
    { id: "entry-pro", name: "Acreditación", kind: "entrance", x: 6, y: 78, w: 54, h: 16 },
  ],
};

/** Menú base de eventos corporativos (coffee y catering). */
export const CORPORATE_MENU: BarMenuItem[] = [
  { id: "cafe", name: "Café", category: "sin_alcohol", price: 2500, emoji: "☕", is_available: true },
  { id: "cafe-leche", name: "Café con leche", category: "sin_alcohol", price: 3000, emoji: "🥛", is_available: true },
  { id: "agua-pro", name: "Agua mineral", category: "sin_alcohol", price: 2000, emoji: "💧", is_available: true },
  { id: "jugo", name: "Jugo de naranja", category: "sin_alcohol", price: 3200, emoji: "🍊", is_available: true },
  { id: "medialunas", name: "Medialunas x3", category: "combo", price: 4500, emoji: "🥐", is_available: true },
  { id: "box-catering", name: "Box de catering", category: "combo", price: 9500, emoji: "🥪", is_available: true },
  { id: "vino-copa", name: "Copa de vino", category: "trago", price: 6000, emoji: "🍷", is_available: true },
  { id: "cerveza-pro", name: "Cerveza", category: "cerveza", price: 5000, emoji: "🍺", is_available: true },
];

export const BAR_MENU: BarMenuItem[] = [
  { id: "fernet", name: "Fernet con Coca", category: "trago", price: 6500, emoji: "🥃", is_available: true },
  { id: "gin", name: "Gin Tonic", category: "trago", price: 8000, emoji: "🍸", is_available: true },
  { id: "speed", name: "Vodka Speed", category: "trago", price: 7500, emoji: "⚡", is_available: true },
  { id: "aperol", name: "Aperol Spritz", category: "trago", price: 8500, emoji: "🍊", is_available: true },
  { id: "ipa", name: "Cerveza IPA", category: "cerveza", price: 5000, emoji: "🍺", is_available: true },
  { id: "agua", name: "Agua sin gas", category: "sin_alcohol", price: 2500, emoji: "💧", is_available: true },
  { id: "energy", name: "Energizante", category: "sin_alcohol", price: 3500, emoji: "🔋", is_available: true },
  { id: "combo-fernet", name: "Combo 4 Fernets", category: "combo", price: 22000, emoji: "🎉", is_available: true },
  { id: "botella-vodka", name: "Botella Vodka + 4 Speed", category: "botella", price: 95000, emoji: "🍾", is_available: true },
  { id: "champagne", name: "Champagne Brut", category: "botella", price: 60000, emoji: "🥂", is_available: true },
];

interface Persona {
  n: number;
  username: string;
  full_name: string;
  age: number;
  gender: Gender;
  phone: string;
  bio: string;
  genres: MusicGenre[];
  mood: MoodTag;
  spent: number;
  activeMinAgo: number;
  ghost?: boolean;
  onlyLiked?: boolean;
  spotify?: string;
  verified?: boolean;
}

/** Equipo del evento (además de la dueña, que es quien creó el evento). */
/** Personas del demo con Instagram conectado (verificado) y la que lo cargó a mano. */
const IG_LINKED = new Set([1, 2, 3, 5]);
const IG_MANUAL = 4;

const STAFF: { id: string; role: StaffRole; username: string; full_name: string; phone: string; bio: string }[] = [
  { id: id(990), role: "manager", username: "lucho.produccion", full_name: "Luciano Paz", phone: "+5491150000990", bio: "Producción de la noche." },
  { id: id(991), role: "bartender", username: "dani.barra", full_name: "Daniela Ortiz", phone: "+5491150000991", bio: "Jefa de barra." },
  { id: id(992), role: "waiter", username: "tomas.mozo", full_name: "Tomás Rey", phone: "+5491150000992", bio: "Delivery a Mesas VIP." },
  { id: id(993), role: "security", username: "marta.seguridad", full_name: "Marta Gómez", phone: "+5491150000993", bio: "Coordinación de seguridad." },
  { id: id(994), role: "promoter", username: "vicky.rrpp", full_name: "Victoria Sosa", phone: "+5491150000994", bio: "RRPP de la noche. Escribime para la lista." },
];

const PERSONAS: Persona[] = [
  { n: 1, username: "sofi.noche", full_name: "Sofía Benítez", age: 26, gender: "female", phone: "+5491150001001", bio: "Diseñadora de día, raver de noche. Si suena Peggy Gou, estoy en primera fila.", genres: ["House", "Techno", "Pop"], mood: "with_friends", spent: 14500, activeMinAgo: 1, spotify: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT", verified: true },
  { n: 2, username: "cami.beats", full_name: "Camila Ríos", age: 25, gender: "female", phone: "+5491150001002", bio: "Bailo hasta que prendan las luces 💡", genres: ["House", "Reggaetón", "Pop"], mood: "just_dance", spent: 9000, activeMinAgo: 3 },
  { n: 3, username: "juli.rkt", full_name: "Julieta Paz", age: 24, gender: "female", phone: "+5491150001003", bio: "RKT y cachengue o nada. Team after.", genres: ["RKT", "Cachengue", "Reggaetón"], mood: "after_hunt", spent: 6500, activeMinAgo: 6 },
  { n: 4, username: "meli.house", full_name: "Melina Duarte", age: 27, gender: "female", phone: "+5491150001004", bio: "Arquitecta. Me encontrás cerca de la cabina.", genres: ["House", "Electrónica", "Indie"], mood: "with_friends", spent: 21000, activeMinAgo: 2 },
  { n: 5, username: "mateo.techno", full_name: "Mateo Sosa", age: 28, gender: "male", phone: "+5491150001005", bio: "Techno melódico, vinilos y madrugadas largas.", genres: ["Techno", "House", "Electrónica"], mood: "open_to_meet", spent: 32000, activeMinAgo: 1, verified: true },
  { n: 6, username: "lucas.dj", full_name: "Lucas Ferreyra", age: 29, gender: "male", phone: "+5491150001006", bio: "Productor amateur. Te paso mi SoundCloud si bailás conmigo.", genres: ["House", "Techno"], mood: "at_bar", spent: 18000, activeMinAgo: 4 },
  { n: 7, username: "bruno.after", full_name: "Bruno Méndez", age: 27, gender: "male", phone: "+5491150001007", bio: "Conozco todos los afters de Palermo 🌅", genres: ["Techno", "Urbano", "RKT"], mood: "after_hunt", spent: 12500, activeMinAgo: 8 },
  { n: 8, username: "joaco.indie", full_name: "Joaquín Vera", age: 26, gender: "male", phone: "+5491150001008", bio: "Indie, synths y charlas en el patio.", genres: ["Indie", "Pop", "Electrónica"], mood: "open_to_meet", spent: 7000, activeMinAgo: 12 },
  { n: 9, username: "vale.pop", full_name: "Valentina Gómez", age: 23, gender: "female", phone: "+5491150001009", bio: "Pop girlie. Hoy en pareja, vengo por los sorteos 🎟️", genres: ["Pop", "Reggaetón", "Urbano"], mood: "just_dance", spent: 5000, activeMinAgo: 5, ghost: true },
  { n: 10, username: "tomi.vip", full_name: "Tomás Aguirre", age: 30, gender: "male", phone: "+5491150001010", bio: "Mesa VIP con amigos. Sumate si venís con buena onda 🍾", genres: ["Reggaetón", "Urbano", "House"], mood: "with_friends", spent: 115000, activeMinAgo: 2, verified: true },
  { n: 11, username: "nico.urbano", full_name: "Nicolás Paredes", age: 28, gender: "male", phone: "+5491150001011", bio: "Urbano, trap y fernet.", genres: ["Urbano", "Reggaetón", "RKT"], mood: "at_bar", spent: 26000, activeMinAgo: 9 },
  { n: 12, username: "fran.cachengue", full_name: "Francisca Luna", age: 25, gender: "female", phone: "+5491150001012", bio: "Cachengue hasta el amanecer. Solo Rompehielos de gente que conecté 😌", genres: ["Cachengue", "Reggaetón", "Pop"], mood: "open_to_meet", spent: 15500, activeMinAgo: 3, onlyLiked: true },
  // Perfil bloqueado preventivamente por teléfono por la persona demo (ex): invisible para ella.
  { n: 13, username: "gonza.x", full_name: "Gonzalo Ibarra", age: 27, gender: "male", phone: "+5491150009999", bio: "—", genres: ["House", "Techno"], mood: "open_to_meet", spent: 8000, activeMinAgo: 2 },
];

/** Sectores donde cada persona dejó pin esta noche (para "Coincidieron en tu zona"). */
const VISITED: Record<number, string[]> = {
  1: ["Pista Principal", "Barra Central"],
  2: ["Pista Principal"],
  3: ["Patio Terraza", "Barra Terraza"],
  4: ["Pista Principal", "Lounge"],
  5: ["Barra Central", "Pista Principal"],
  6: ["Barra Central"],
  7: ["Patio Terraza"],
  8: ["Lounge", "Patio Terraza"],
  10: ["Sector VIP"],
  11: ["Sector VIP", "Barra Central"],
  12: ["Pista Principal"],
};

/**
 * Encuentro pyme (ROUGE Pro): perfiles PROFESIONALES de las mismas cuentas del demo + emprendedores que solo usan
 * ROUGE para eventos de trabajo. La misma persona se muestra distinta en la fiesta y en el encuentro.
 */
interface ProSeed {
  n: number; // persona del demo (cuenta) o nueva (≥ 20)
  label: string;
  job: string;
  company: string;
  industry: ProfilePersona["industry"];
  looking: ProfilePersona["looking_for"];
  offering: ProfilePersona["offering"];
  mood: MoodTag;
  bio: string;
  linkedin?: string;
}
const PRO_SEEDS: ProSeed[] = [
  { n: 1, label: "Trabajo", job: "Diseñadora UX freelance", company: "Estudio Benítez", industry: "services", looking: ["clients", "partners"], offering: ["software", "marketing"], mood: "pro_selling", bio: "Diseño apps y webs para pymes. Si tu negocio necesita vender online, charlemos.", linkedin: "https://www.linkedin.com/in/sofia-benitez-ux" },
  { n: 4, label: "Mi estudio", job: "Arquitecta · Socia", company: "Duarte & Asoc.", industry: "construction", looking: ["clients", "suppliers"], offering: ["advisory"], mood: "pro_buying", bio: "Locales comerciales y oficinas. Busco proveedores de iluminación y mobiliario." },
  { n: 5, label: "Laburo", job: "CTO", company: "Logix Software", industry: "tech", looking: ["clients", "talent"], offering: ["software", "logistics"], mood: "pro_selling", bio: "Software de stock y logística para distribuidoras. 40 clientes en el país.", linkedin: "https://www.linkedin.com/in/mateo-sosa-logix" },
  { n: 10, label: "Inversiones", job: "Director", company: "Aguirre Capital", industry: "finance", looking: ["partners"], offering: ["investment", "mentoring"], mood: "pro_networking", bio: "Invierto en pymes industriales y de alimentos con tracción. Ticket USD 50–250 mil." },
  { n: 8, label: "Pyme", job: "Fundador", company: "Vera Alimentos", industry: "food", looking: ["investment", "export", "software"], offering: ["suppliers"], mood: "pro_funding", bio: "Snacks saludables. Estamos en 300 dietéticas y queremos exportar a Chile y Uruguay." },
  { n: 21, label: "Trabajo", job: "Dueña", company: "Textil Norte", industry: "fashion", looking: ["marketing", "software", "financing"], offering: ["suppliers"], mood: "pro_buying", bio: "Fabricamos uniformes para empresas. Queremos vender online." },
  { n: 22, label: "Trabajo", job: "Contador público", company: "Estudio Ledesma", industry: "services", looking: ["clients"], offering: ["advisory", "financing"], mood: "pro_selling", bio: "Impuestos, ARCA y crédito para pymes. Primera consulta sin cargo en el evento." },
  { n: 23, label: "Trabajo", job: "Gerenta comercial", company: "Fletes Sur", industry: "logistics", looking: ["clients", "partners"], offering: ["logistics", "export"], mood: "pro_partners", bio: "Distribución y última milla en AMBA y Cuyo. Buscamos alianzas con e-commerce." },
  { n: 24, label: "Trabajo", job: "Coordinadora de RR.HH.", company: "Metalúrgica Rossi", industry: "manufacturing", looking: ["talent", "advisory"], offering: ["suppliers"], mood: "pro_hiring", bio: "Buscamos técnicos y un responsable comercial. Pasá por el stand A3." },
  { n: 25, label: "Trabajo", job: "Mentor", company: "Red de Mentores Pyme", industry: "education", looking: ["partners"], offering: ["mentoring", "advisory"], mood: "pro_learning", bio: "30 años en comercio exterior. Mentoreo gratis a emprendedores que quieran exportar." },
];
/** Cuentas nuevas del encuentro (solo vienen a eventos de trabajo). */
const PRO_ONLY: { n: number; username: string; full_name: string; age: number; phone: string }[] = [
  { n: 21, username: "carla.textil", full_name: "Carla Medina", age: 41, phone: "+5491150002021" },
  { n: 22, username: "ezequiel.contador", full_name: "Ezequiel Ledesma", age: 38, phone: "+5491150002022" },
  { n: 23, username: "romina.fletes", full_name: "Romina Acosta", age: 35, phone: "+5491150002023" },
  { n: 24, username: "laura.rrhh", full_name: "Laura Rossi", age: 33, phone: "+5491150002024" },
  { n: 25, username: "hector.mentor", full_name: "Héctor Giménez", age: 62, phone: "+5491150002025" },
];

const LINEUP = [
  { id: "set-1", artist: "Sol Ortega", genre: "House" as MusicGenre, from: 0, to: 90 },
  { id: "set-2", artist: "DJ Invitado: Kaleb Rivas", genre: "Techno" as MusicGenre, from: 90, to: 180 },
  { id: "set-3", artist: "Main Set: NOX B2B Lumen", genre: "Techno" as MusicGenre, from: 180, to: 270, headliner: true },
  { id: "set-4", artist: "Closing: Marea", genre: "House" as MusicGenre, from: 270, to: 360 },
];

export function createSeedState(now = Date.now()): RougeState {
  const t = (minFromNow: number) => new Date(now + minFromNow * 60_000).toISOString();
  const START = -120; // la fiesta arrancó hace 2 h
  const END = START + 360; // dura 6 h
  const birth = (age: number, n: number) => {
    const d = new Date(now);
    return `${d.getFullYear() - age}-${String(((n * 5) % 12) + 1).padStart(2, "0")}-${String(((n * 7) % 27) + 1).padStart(2, "0")}`;
  };

  // ── Perfiles ─────────────────────────────────────────────────────
  const profiles: Profile[] = [
    {
      id: DEMO_IDS.organizer,
      username: "paula.owner",
      full_name: "Paula Ferrari",
      birth_date: birth(32, 0),
      gender: "undisclosed",
      phone_normalized: "+5491150000000",
      bio: "Dueña de la productora. Organiza ROUGE Night.",
      photos: [],
      loop_video_url: null,
      music_genres: [],
      spotify_embed_url: null,
      instagram_username: null,
      instagram_verified: false,
      is_verified: true,
      created_at: t(-60 * 24 * 30),
    },
    ...STAFF.map<Profile>((m) => ({
      id: m.id,
      username: m.username,
      full_name: m.full_name,
      birth_date: birth(30, 0),
      gender: "undisclosed",
      phone_normalized: m.phone,
      bio: m.bio,
      photos: [],
      loop_video_url: null,
      music_genres: [],
      spotify_embed_url: null,
      instagram_username: null,
      instagram_verified: false,
      is_verified: true,
      created_at: t(-60 * 24 * 20),
    })),
    ...PERSONAS.map<Profile>((p) => ({
      id: id(p.n),
      username: p.username,
      full_name: p.full_name,
      birth_date: birth(p.age, p.n),
      gender: p.gender,
      phone_normalized: p.phone,
      bio: p.bio,
      photos: [1, 2].map((k) => ({ url: `/demo/avatars/${p.username}-${k}.svg`, width: 600, height: 800, blur_color: "#121216" })),
      loop_video_url: null,
      music_genres: p.genres,
      spotify_embed_url: p.spotify ?? null,
      // Algunas personas conectaron Instagram (verificado) y una lo escribió a mano (sin verificar).
      instagram_username: IG_LINKED.has(p.n) || p.n === IG_MANUAL ? p.username.replace(/\.+$/, "") : null,
      instagram_verified: IG_LINKED.has(p.n),
      is_verified: !!p.verified,
      created_at: t(-60 * 24 * (40 - p.n)),
    })),
  ];

  const instagram_links: InstagramLink[] = PERSONAS.filter((p) => IG_LINKED.has(p.n)).map((p) => ({
    user_id: id(p.n),
    username: p.username,
    account_type: "CREATOR",
    connected_at: t(-60 * 24 * 7),
  }));

  // ── Evento ───────────────────────────────────────────────────────
  const event: RougeEvent = {
    id: DEMO_IDS.event,
    kind: "nightlife",
    networking_checkin_only: false,
    slug: "bresh-sabado",
    name: "ROUGE Night × Bresh Sábado",
    description: "La noche más grande del mes. Line-up de house y techno, Mesa VIP, Barra Express y sorteos en vivo.",
    venue_name: "Club Crobar · Palermo",
    venue_map_url: null,
    venue_layout_json: VENUE_LAYOUT,
    lineup_json: LINEUP.map((s) => ({
      id: s.id,
      artist: s.artist,
      genre: s.genre,
      is_headliner: !!s.headliner,
      starts_at: t(START + s.from),
      ends_at: t(START + s.to),
    })),
    cover_url: null,
    starts_at: t(START),
    ends_at: t(END),
    lobby_opens_at: t(START - 48 * 60),
    lobby_expires_at: t(END + 24 * 60),
    max_capacity: 1800,
    master_invite_code: "BRESH26",
    created_by: DEMO_IDS.organizer,
    created_at: t(-60 * 24 * 7),
    brand_id: DEMO_IDS.brand,
    logo_url: null,
    theme_primary: null,
    theme_accent: null,
  };

  // ── Marca (logo + colores) y cuenta de cobro de Mercado Pago (simulada) ──
  // Colores en null = los de ROUGE: la demo se ve igual y en /admin/brand se prueban paletas en vivo.
  const brands: Brand[] = [
    { id: DEMO_IDS.brand, owner_id: DEMO_IDS.organizer, name: "ROUGE Night", logo_url: "/demo/brands/rouge-night.svg", primary_color: null, accent_color: null, payments_enabled: true, created_at: t(-60 * 24 * 30) },
  ];
  const brand_payment_accounts: BrandPaymentAccount[] = [
    { brand_id: DEMO_IDS.brand, provider: "mercadopago", account_label: "ROUGE Night (demo)", live_mode: false, connected_at: t(-60 * 24 * 20) },
  ];

  const invite_codes: EventInviteCode[] = Array.from({ length: 24 }, (_, i) => {
    const used = i < 6;
    return {
      id: id(5000 + i),
      event_id: event.id,
      code: `RG${String(7300 + i * 37).padStart(4, "0")}${"KXQMPZ"[i % 6]}${"ABCDEF"[(i * 5) % 6]}`,
      is_used: used,
      used_by_user_id: used ? id(i + 2) : null,
      used_at: used ? t(START - 30 + i * 5) : null,
      // Los últimos 6 los emitió la ticketera por API (con su número de entrada).
      external_ref: i >= 18 ? `TKT-${48210 + i}` : null,
      label: i >= 18 ? (i % 2 ? "VIP" : "General") : null,
      source: i >= 18 ? "api" : "panel",
      api_key_id: null,
      revoked_at: null,
      // Los primeros 5 ya se escanearon en la puerta.
      checked_in_at: i < 5 ? t(START - 20 + i * 6) : null,
      created_at: t(-60 * 24 * 3),
    };
  });

  // ── RRPP: link propio de Vicky (entraron por él Mateo, Lucas, Bruno y Joaquín) ──
  const promoter_links: PromoterLink[] = [
    { id: id(17001), event_id: event.id, user_id: DEMO_IDS.promoter, code: "RPVICKY7", commission_per_entry: 1500, created_at: t(-60 * 24 * 4) },
  ];
  const REFERRED = new Set([5, 6, 7, 8]);

  // ── Asistentes ───────────────────────────────────────────────────
  const attendees: EventAttendee[] = PERSONAS.map((p, i) => ({
    id: id(3000 + p.n),
    event_id: event.id,
    user_id: id(p.n),
    mood_tag: p.mood,
    persona_id: null,
    ghost_mode: !!p.ghost,
    only_liked_can_icebreak: !!p.onlyLiked,
    icebreaker_used: p.n === 7, // Bruno ya usó su bala con Sofi
    total_spent: p.spent,
    joined_via: i < 6 ? "single_use_code" : i % 2 ? "master_link" : "squad_link",
    last_active_at: t(-p.activeMinAgo),
    visited_sectors: VISITED[p.n] ?? [],
    referred_by: REFERRED.has(p.n) ? DEMO_IDS.promoter : null,
    // La fiesta está en vivo: casi todos ya pasaron por la puerta (Joaquín y los dos últimos todavía no).
    checked_in_at: p.n === 8 || p.n >= 12 ? null : t(START - 10 + p.n * 4),
    joined_at: t(START - 40 + i * 6),
  }));

  // ── Bloqueos ─────────────────────────────────────────────────────
  const user_blocks: UserBlock[] = [
    // Lista negra preventiva de Sofi: el número de su ex (Gonzalo) → invisibilidad mutua
    { id: id(4001), blocker_id: DEMO_IDS.me, blocked_user_id: null, blocked_phone_normalized: "+5491150009999", created_at: t(-60 * 24 * 10) },
  ];

  // ── Conexiones ───────────────────────────────────────────────────
  const conn = (n: number, from: number, to: number, status: Connection["status"], minAgo: number, extra: Partial<Connection> = {}): Connection => ({
    id: id(6000 + n),
    event_id: event.id,
    sender_id: id(from),
    receiver_id: id(to),
    type: "regular",
    icebreaker_message: null,
    attached_drink_qr_id: null,
    status,
    created_at: t(-minAgo),
    responded_at: status === "pending" ? null : t(-minAgo + 2),
    ...extra,
  });

  const connections: Connection[] = [
    conn(1, 5, 1, "accepted", 55), // Mateo ↔ Sofi (match con chat)
    conn(2, 6, 1, "pending", 14), // Lucas → Sofi (solicitud normal)
    conn(3, 7, 1, "pending", 9, { type: "icebreaker", icebreaker_message: "¿Vos sos la que estaba en primera fila con Sol Ortega? Te debo un trago por esa energía 🔥" }), // Rompehielos
    conn(4, 1, 8, "pending", 20), // Sofi → Joaquín
    conn(5, 2, 10, "accepted", 70), // Cami ↔ Tomi
    conn(6, 3, 7, "accepted", 40), // Juli ↔ Bruno
    conn(7, 4, 6, "accepted", 33), // Meli ↔ Lucas
    conn(8, 12, 5, "pending", 18), // Fran → Mateo
    conn(9, 5, 4, "accepted", 25), // Mateo ↔ Meli
    conn(10, 11, 2, "accepted", 15), // Nico ↔ Cami
  ];

  // ── Squads ───────────────────────────────────────────────────────
  const squads: Squad[] = [
    {
      id: DEMO_IDS.squadMain,
      event_id: event.id,
      name: "Las Pibas del Sábado",
      invite_code: "SQ-PIBAS",
      has_vip_table_to_share: false,
      base_pin_x: 50,
      base_pin_y: 57,
      base_pin_label: "Columna dorada de la Barra Central",
      created_by: DEMO_IDS.me,
      created_at: t(START - 90),
    },
    {
      id: DEMO_IDS.squadVip,
      event_id: event.id,
      name: "Mesa 7 · Los del Fondo",
      invite_code: "SQ-MESA7",
      has_vip_table_to_share: true,
      base_pin_x: 85,
      base_pin_y: 66,
      base_pin_label: "Mesa 7 — Sector VIP",
      created_by: id(10),
      created_at: t(START - 60),
    },
  ];

  const member = (n: number, squad: string, user: number, invitedBy: number | null, minAgo: number, status: SquadMember["status"] = "joined"): SquadMember => ({
    id: id(7000 + n),
    squad_id: squad,
    user_id: id(user),
    invited_by: invitedBy ? id(invitedBy) : null,
    status,
    safety_status: "ok",
    joined_at: status === "joined" ? t(-minAgo) : null,
  });

  const squad_members: SquadMember[] = [
    member(1, DEMO_IDS.squadMain, 1, null, 210),
    member(2, DEMO_IDS.squadMain, 2, 1, 205),
    member(3, DEMO_IDS.squadMain, 3, 1, 200),
    member(4, DEMO_IDS.squadMain, 4, 1, 190),
    member(5, DEMO_IDS.squadMain, 12, 1, 0, "invited"), // invitación pendiente a Fran
    member(6, DEMO_IDS.squadVip, 10, null, 180),
    member(7, DEMO_IDS.squadVip, 11, 10, 175),
    member(8, DEMO_IDS.squadVip, 6, 10, 170),
  ];

  // ── Pines (15 min) ───────────────────────────────────────────────
  const pin = (n: number, user: number, x: number, y: number, sector: string, minAgo: number, squad: boolean, matches: number[] = [], note: string | null = null): MapPin => ({
    id: id(8000 + n),
    event_id: event.id,
    user_id: id(user),
    coord_x: x,
    coord_y: y,
    sector_name: sector,
    note,
    is_rescue_alert: false,
    share_with_squad: squad,
    shared_match_ids: matches.map(id),
    expires_at: t(15 - minAgo),
    created_at: t(-minAgo),
  });

  const map_pins: MapPin[] = [
    pin(1, 2, 38, 30, "Pista Principal", 3, true, [], "Frente a la cabina 🪩"),
    pin(2, 4, 62, 24, "Pista Principal", 6, true),
    pin(3, 3, 14, 70, "Patio Terraza", 9, true, [], "Fumando en el patio"),
    pin(4, 5, 46, 56, "Barra Central", 2, false, [1], "Te espero acá 🍸"), // Mateo comparte SOLO con Sofi
    pin(5, 10, 86, 64, "Sector VIP", 4, true),
    pin(6, 11, 80, 72, "Sector VIP", 5, true),
  ];

  // ── Mensajes ─────────────────────────────────────────────────────
  const msg = (n: number, sender: number, minAgo: number, content: string, ref: { squad?: string; connection?: string }, type: Message["message_type"] = "text"): Message => ({
    id: id(9000 + n),
    event_id: event.id,
    conversation_type: ref.squad ? "squad" : "direct",
    connection_id: ref.connection ?? null,
    squad_id: ref.squad ?? null,
    sender_id: id(sender),
    message_type: type,
    content,
    media_url: null,
    created_at: t(-minAgo),
  });

  const S = { squad: DEMO_IDS.squadMain };
  const M = { connection: id(6001) };
  const messages: Message[] = [
    msg(1, 1, 200, "👋 Juli se sumó al Squad", S, "system_alert"),
    msg(2, 1, 190, "🎁 ¡Squad de 4 antes de la 01:00! Tienen un trago de bienvenida en Mis Perks", S, "system_alert"),
    msg(3, 2, 60, "Chicas estoy adelante de todo, el set de Sol está INCREÍBLE", S),
    msg(4, 4, 52, "Voy para allá, guárdenme lugar 🙏", S),
    msg(5, 3, 30, "Yo estoy en el patio tomando aire, en 10 vuelvo", S),
    msg(6, 1, 12, "🚩 ¡Nos vemos en el Punto Base en 10 min!", S, "system_alert"),
    msg(7, 5, 54, "Hola! Te vi bailando cerca de la cabina 😄", M),
    msg(8, 1, 52, "Jaja sí, ¡qué temazo cerró Sol! ¿Vos de qué grupo sos?", M),
    msg(9, 5, 47, "Vine con unos amigos del laburo. ¿Te gusta Kaleb Rivas?", M),
    msg(10, 1, 20, "Mucho! Estoy con mis amigas, después nos cruzamos", M),
    msg(11, 5, 2, "Dale, te compartí mi pin, estoy en la barra central 🍸", M),
  ];

  // ── Perks / QR ───────────────────────────────────────────────────
  const perk_rules: PerkRule[] = [
    {
      id: id(10001),
      event_id: event.id,
      title: "🍹 Trago de Bienvenida — Squad de 4+",
      perk_type: "free_drink",
      trigger: { kind: "squad_size", min_members: 4, before: t(START + 120) },
      is_active: true,
      created_at: t(-60 * 24 * 2),
    },
  ];

  const perk = (n: number, user: number, title: string, type: UserPerkQR["perk_type"], source: UserPerkQR["source"], ref: string | null, minAgo: number, redeemed = false, squad: string | null = null): UserPerkQR => ({
    id: id(11000 + n),
    event_id: event.id,
    user_id: id(user),
    squad_id: squad,
    title,
    perk_type: type,
    qr_code_string: `ROUGE:${type.toUpperCase()}:DEMO${String(n).padStart(6, "0")}`,
    status: redeemed ? "redeemed" : "available",
    source,
    source_ref_id: ref,
    redeemed_at: redeemed ? t(-minAgo + 20) : null,
    created_at: t(-minAgo),
  });

  const user_perks_qrs: UserPerkQR[] = [
    ...[1, 2, 3, 4].map((u, i) => perk(i + 1, u, perk_rules[0].title, "free_drink", "perk_rule", perk_rules[0].id, 190, u === 2 || u === 4, DEMO_IDS.squadMain)),
    perk(5, 1, "⚡ Fast Pass — Fila rápida de barra", "fast_pass", "manual", null, 150),
    perk(6, 7, "🍸 Gin Tonic — regalo de Rompehielos", "gifted_drink", "icebreaker_gift", null, 9),
  ];

  const raffles: Raffle[] = [
    { id: id(12001), event_id: event.id, prize_title: "Botella de Champagne en el VIP", filter: "active_pin", winner_user_id: null, winner_perk_id: null, drawn_at: null, created_at: t(-30) },
  ];

  // ── Text Blasts ──────────────────────────────────────────────────
  const event_blasts: EventBlast[] = [
    { id: id(13001), event_id: event.id, title: "🎟️ ¡Bienvenidos a ROUGE Night!", message: "Armá tu Squad de 4 antes de la 01:00 y desbloqueá un trago de bienvenida para cada una.", target_segment: { kind: "all" }, cta_label: "Armar Squad", cta_link: "/squad", is_flash_promo: false, expires_at: null, created_at: t(START - 10) },
    { id: id(13002), event_id: event.id, title: "⚡ FLASH PROMO · 20 min", message: "2x1 en Barra Terraza AHORA. Mostrá la app en la barra.", target_segment: { kind: "all" }, cta_label: "Ver en el plano", cta_link: "/map", is_flash_promo: true, expires_at: t(14), created_at: t(-6) },
  ];

  // ── Temas pedidos al DJ ──────────────────────────────────────────
  const song_requests: SongRequest[] = [
    { id: id(14001), event_id: event.id, requested_by: id(2), title: "Mysterious Times", artist: "Sash!", voter_ids: [2, 4, 5, 6, 11].map(id), created_at: t(-50) },
    { id: id(14002), event_id: event.id, requested_by: id(5), title: "Losing It", artist: "Fisher", voter_ids: [5, 7, 8, 1].map(id), created_at: t(-44) },
    { id: id(14003), event_id: event.id, requested_by: id(3), title: "Tusa (Remix)", artist: "Karol G", voter_ids: [3, 12, 9].map(id), created_at: t(-35) },
    { id: id(14004), event_id: event.id, requested_by: id(8), title: "Midnight City", artist: "M83", voter_ids: [8].map(id), created_at: t(-12) },
  ];

  // ── Pedidos de barra ─────────────────────────────────────────────
  const line = (itemId: string, qty: number) => {
    const it = BAR_MENU.find((i) => i.id === itemId)!;
    return { item_id: it.id, name: `${it.emoji} ${it.name}`, qty, unit_price: it.price };
  };
  const order = (n: number, user: number, type: BarOrder["delivery_type"], items: ReturnType<typeof line>[], status: BarOrder["status"], minAgo: number, extra: Partial<BarOrder> = {}): BarOrder => ({
    id: id(15000 + n),
    event_id: event.id,
    user_id: id(user),
    squad_id: null,
    delivery_type: type,
    items_json: items,
    total_amount: items.reduce((a, i) => a + i.qty * i.unit_price, 0),
    split_user_ids: [],
    pickup_code: type === "fast_pickup" || type === "squad_split" ? `P${String(n).padStart(3, "0")}` : null,
    pin_coord_x: null,
    pin_coord_y: null,
    sector_name: null,
    status,
    // La marca cobra con Mercado Pago: los pedidos del seed ya están pagos (el trago Rompehielos se cobra en barra).
    payment_status: type === "icebreaker_gift" ? "pay_at_bar" : "paid",
    payment_ref: type === "icebreaker_gift" ? null : `demo-${15000 + n}`,
    paid_at: type === "icebreaker_gift" ? null : t(-minAgo),
    created_at: t(-minAgo),
    updated_at: t(-Math.max(0, minAgo - 3)),
    ...extra,
  });

  const bar_orders: BarOrder[] = [
    order(1, 10, "pin_delivery", [line("botella-vodka", 1)], "delivering", 8, { squad_id: DEMO_IDS.squadVip, split_user_ids: [10, 11, 6].map(id), pin_coord_x: 85, pin_coord_y: 66, sector_name: "Sector VIP" }),
    order(2, 5, "fast_pickup", [line("gin", 2)], "ready_qr", 6),
    order(3, 1, "squad_split", [line("combo-fernet", 1)], "preparing", 4, { squad_id: DEMO_IDS.squadMain, split_user_ids: [1, 2, 3, 4].map(id) }),
    order(4, 11, "fast_pickup", [line("fernet", 1), line("energy", 1)], "pending", 1),
    order(5, 6, "pin_delivery", [line("ipa", 2)], "pending", 2, { pin_coord_x: 40, pin_coord_y: 33, sector_name: "Pista Principal" }),
    order(6, 7, "icebreaker_gift", [line("gin", 1)], "ready_qr", 9),
    order(7, 4, "fast_pickup", [line("aperol", 1)], "completed", 40),
    order(8, 2, "fast_pickup", [line("speed", 1)], "completed", 55),
  ];

  // ── Cuentas de la mesa ───────────────────────────────────────────
  const expense = (n: number, squad: string, payer: number, description: string, amount: number, participants: number[], minAgo: number): SquadExpense => ({
    id: id(16000 + n),
    squad_id: squad,
    event_id: event.id,
    paid_by: id(payer),
    description,
    amount,
    participant_ids: participants.map(id),
    created_at: t(-minAgo),
  });
  const squad_expenses: SquadExpense[] = [
    expense(1, DEMO_IDS.squadMain, 2, "🚕 Uber de ida", 12000, [1, 2, 3, 4], 230),
    expense(2, DEMO_IDS.squadMain, 3, "🍻 Previa en lo de Juli", 18000, [1, 2, 3, 4], 260),
    expense(3, DEMO_IDS.squadVip, 10, "🛋️ Reserva Mesa 7", 120000, [10, 11, 6], 60 * 24),
  ];
  const payout_aliases: PayoutAlias[] = [
    { user_id: id(2), alias: "cami.beats.mp" },
    { user_id: id(3), alias: "juli.previa" },
    { user_id: id(10), alias: "tomi.mesa7" },
  ];

  // Vincular el trago rompehielos de Bruno a su conexión con Sofi
  connections[2].attached_drink_qr_id = user_perks_qrs[5].id;
  user_perks_qrs[5] = { ...user_perks_qrs[5], user_id: DEMO_IDS.me, source_ref_id: bar_orders[5].id };

  // ═══ [v1.7] ROUGE Pro: encuentro de pymes en vivo (misma cuenta, otra cara) ═══
  const PRO_START = -150; // arrancó hace 2 h 30
  const PRO_END = PRO_START + 330;
  const proEvent: RougeEvent = {
    id: DEMO_IDS.proEvent,
    kind: "corporate",
    networking_checkin_only: false,
    slug: "encuentro-pyme",
    name: "Encuentro Pyme Conecta",
    description: "Ronda de negocios, charlas y networking para pymes y emprendedores. Encontrá clientes, proveedores, socios e inversión.",
    venue_name: "Centro de Convenciones · Costanera",
    venue_map_url: null,
    venue_layout_json: PRO_VENUE_LAYOUT,
    lineup_json: [
      { id: "ag-1", artist: "Acreditación y café de bienvenida", from: 0, to: 40 },
      { id: "ag-2", artist: "Charla: Financiamiento para pymes en 2027", from: 40, to: 100, headliner: true },
      { id: "ag-3", artist: "Ronda de negocios (salas 1 a 6)", from: 100, to: 190 },
      { id: "ag-4", artist: "Panel: Vender online sin morir en el intento", from: 190, to: 250 },
      { id: "ag-5", artist: "Cierre y brindis", from: 250, to: 330 },
    ].map((a) => ({ id: a.id, artist: a.artist, is_headliner: !!a.headliner, starts_at: t(PRO_START + a.from), ends_at: t(PRO_START + a.to) })),
    cover_url: null,
    starts_at: t(PRO_START),
    ends_at: t(PRO_END),
    // Networking antes y después: el lobby abre una semana antes y cierra una semana después.
    lobby_opens_at: t(PRO_START - 7 * 24 * 60),
    lobby_expires_at: t(PRO_END + 7 * 24 * 60),
    max_capacity: 400,
    master_invite_code: "PYME26",
    created_by: DEMO_IDS.organizer,
    created_at: t(-60 * 24 * 14),
    brand_id: DEMO_IDS.proBrand,
    logo_url: null,
    theme_primary: null,
    theme_accent: null,
  };
  brands.push({ id: DEMO_IDS.proBrand, owner_id: DEMO_IDS.organizer, name: "Red Pyme Conecta", logo_url: null, primary_color: "#2563EB", accent_color: "#FBBF24", payments_enabled: false, created_at: t(-60 * 24 * 14) });

  profiles.push(
    ...PRO_ONLY.map<Profile>((p) => ({
      id: id(p.n),
      username: p.username,
      full_name: p.full_name,
      birth_date: birth(p.age, p.n),
      gender: "undisclosed",
      phone_normalized: p.phone,
      bio: "",
      photos: [],
      loop_video_url: null,
      music_genres: [],
      spotify_embed_url: null,
      instagram_username: null,
      instagram_verified: false,
      is_verified: false,
      created_at: t(-60 * 24 * 12),
    })),
  );
  const nameOf = (n: number) => profiles.find((p) => p.id === id(n))?.full_name ?? "";
  const profile_personas: ProfilePersona[] = PRO_SEEDS.map((p) => ({
    id: p.n === 1 ? DEMO_IDS.mePro : id(1900 + p.n),
    user_id: id(p.n),
    kind: "corporate",
    label: p.label,
    display_name: nameOf(p.n),
    bio: p.bio,
    // Foto profesional: las cuentas de la noche usan otra foto (la 2); las nuevas, iniciales.
    photos: p.n < 20 ? [{ url: `/demo/avatars/${profiles.find((x) => x.id === id(p.n))?.username}-2.svg`, width: 600, height: 800, blur_color: "#121216" }] : [],
    music_genres: [],
    spotify_embed_url: null,
    job_title: p.job,
    company: p.company,
    industry: p.industry,
    looking_for: p.looking,
    offering: p.offering,
    linkedin_url: p.linkedin ?? null,
    created_at: t(-60 * 24 * 10),
  }));
  const proAttendees: EventAttendee[] = PRO_SEEDS.map((p, i) => ({
    id: id(3100 + p.n),
    event_id: proEvent.id,
    user_id: id(p.n),
    mood_tag: p.mood,
    persona_id: p.n === 1 ? DEMO_IDS.mePro : id(1900 + p.n),
    ghost_mode: false,
    only_liked_can_icebreak: false,
    icebreaker_used: p.n === 23,
    total_spent: [2500, 9500, 0, 6000][i % 4],
    joined_via: i % 3 ? "master_link" : "single_use_code",
    last_active_at: t(-(i * 3 + 1)),
    visited_sectors: i % 2 ? ["Coffee & Networking"] : ["Auditorio", "Coffee & Networking"],
    referred_by: null,
    checked_in_at: t(PRO_START + 5 + i * 3),
    joined_at: t(PRO_START - 60 * 24 + i * 30),
  }));
  const proConn = (n: number, from: number, to: number, status: Connection["status"], minAgo: number, extra: Partial<Connection> = {}): Connection => ({
    ...conn(100 + n, from, to, status, minAgo, extra),
    event_id: proEvent.id,
  });
  const proConnections: Connection[] = [
    proConn(1, 21, 1, "accepted", 70), // Carla (Textil Norte) ↔ Sofi: busca diseño para vender online
    proConn(2, 22, 1, "pending", 25), // Ezequiel → Sofi
    proConn(3, 23, 1, "pending", 12, { type: "icebreaker", icebreaker_message: "Hola Sofía, hacemos la logística de varios e-commerce que necesitan diseño. ¿Café a las 17 en el coffee?" }),
    proConn(4, 5, 8, "accepted", 50), // Mateo (Logix) ↔ Joaquín (Vera Alimentos)
    proConn(5, 10, 8, "accepted", 35), // Tomás (inversor) ↔ Joaquín
    proConn(6, 1, 4, "pending", 8), // Sofi → Melina
  ];
  const proSquad: Squad = {
    id: DEMO_IDS.proTeam,
    event_id: proEvent.id,
    name: "Mesa 12 · Ronda de negocios",
    invite_code: "EQ-MESA12",
    has_vip_table_to_share: false,
    base_pin_x: 79,
    base_pin_y: 63,
    base_pin_label: "Sala 3 — Ronda de negocios",
    created_by: id(21),
    created_at: t(PRO_START + 60),
  };
  const proMembers: SquadMember[] = [
    { ...member(101, DEMO_IDS.proTeam, 21, null, 80), squad_id: DEMO_IDS.proTeam },
    { ...member(102, DEMO_IDS.proTeam, 1, 21, 75), squad_id: DEMO_IDS.proTeam },
    { ...member(103, DEMO_IDS.proTeam, 22, 21, 70), squad_id: DEMO_IDS.proTeam },
  ];
  const PC = { connection: id(6101) };
  const proMessages: Message[] = [
    { ...msg(101, 21, 68, "Hola Sofía! Te vi en la charla. Necesitamos una tienda online para los uniformes, ¿hacés eso?", PC), event_id: proEvent.id },
    { ...msg(102, 1, 64, "¡Hola Carla! Sí, justo hago tiendas para fábricas. ¿Te paso casos?", PC), event_id: proEvent.id },
    { ...msg(103, 21, 60, "Dale. Me sumé a la Mesa 12 de la ronda, vení que está Ezequiel también.", PC), event_id: proEvent.id },
    { ...msg(104, 21, 59, "👋 Sofía se sumó al equipo", { squad: DEMO_IDS.proTeam }, "system_alert"), event_id: proEvent.id },
  ];
  const proBlasts: EventBlast[] = [
    { id: id(13101), event_id: proEvent.id, title: "🤝 Ronda de negocios en las salas", message: "La ronda empieza ahora en las Salas de reunión. Mirá tus contactos recomendados en Networking.", target_segment: { kind: "all" }, cta_label: "Ver networking", cta_link: "/lobby", is_flash_promo: false, expires_at: null, created_at: t(PRO_START + 95) },
  ];
  const proPerks: UserPerkQR[] = [
    { ...perk(101, 1, "☕ Café de bienvenida", "free_drink", "manual", null, 140), event_id: proEvent.id },
  ];
  // ── [v1.8] Salas, mesas y puntos de encuentro + reuniones ─────────
  const spot = (n: number, eventId: string, name: string, kind: VenueSpot["kind"], capacity: number | null, x: number, y: number): VenueSpot => ({
    id: id(18000 + n), event_id: eventId, name, kind, capacity, coord_x: x, coord_y: y, is_active: true, created_at: t(-60 * 24 * 3),
  });
  const venue_spots: VenueSpot[] = [
    spot(1, proEvent.id, "Sala 1", "room", 1, 70, 60),
    spot(2, proEvent.id, "Sala 2", "room", 1, 86, 60),
    spot(3, proEvent.id, "Sala 3", "room", 1, 70, 70),
    spot(4, proEvent.id, "Sala 4", "room", 1, 86, 70),
    spot(5, proEvent.id, "Mesa coffee 1", "table", 1, 22, 69),
    spot(6, proEvent.id, "Mesa coffee 2", "table", 1, 34, 69),
    spot(7, proEvent.id, "Mesa coffee 3", "table", 1, 46, 69),
    spot(8, proEvent.id, "Stand Red Pyme", "point", null, 26, 38),
    spot(11, event.id, "Mesa VIP 4", "table", 1, 85, 76),
    spot(12, event.id, "Columna dorada · Barra Central", "point", null, 50, 57),
    spot(13, event.id, "Fogonero del patio", "point", null, 15, 76),
  ];
  // Horarios redondeados al cuarto de hora (como los ofrece la app), sin superposiciones en la agenda de Sofi:
  // Carla ahora (+15, 30 min), Ezequiel +60, Joaquín +90 (a definir) y el punto de encuentro de la fiesta +120.
  const quarter = (minFromNow: number) => new Date(Math.ceil((now + minFromNow * 60_000) / 900_000) * 900_000).toISOString();
  const meeting = (n: number, eventId: string, from: number, to: number, topic: string, startsAt: string, duration: 15 | 30, loc: Pick<Meeting, "location_kind" | "spot_id" | "pin_x" | "pin_y" | "pin_label">, status: Meeting["status"], connectionId: string | null = null): Meeting => ({
    id: id(19000 + n), event_id: eventId, requester_id: id(from), invitee_id: id(to), topic, starts_at: startsAt, duration_min: duration, ...loc,
    status, proposed_by: id(from), connection_id: connectionId, created_at: t(-40 + n), updated_at: t(-30 + n),
  });
  const atSpot = (n: number) => ({ location_kind: "spot" as const, spot_id: id(18000 + n), pin_x: null, pin_y: null, pin_label: null });
  const meetings: Meeting[] = [
    meeting(1, proEvent.id, 22, 1, "Consulta: monotributo y crédito para tu estudio", quarter(60), 15, atSpot(2), "pending"),
    meeting(2, proEvent.id, 21, 1, "Tienda online para Textil Norte: alcance y presupuesto", quarter(15), 30, atSpot(3), "accepted", id(6101)),
    meeting(3, proEvent.id, 1, 8, "Software de stock para Vera Alimentos", quarter(90), 15, { location_kind: "tbd", spot_id: null, pin_x: null, pin_y: null, pin_label: null }, "pending"),
    meeting(4, proEvent.id, 5, 8, "Integración de Logix con tu distribuidora", new Date(now - 70 * 60_000).toISOString(), 30, atSpot(6), "accepted", id(6104)),
    meeting(5, event.id, 5, 1, "Te espero en la barra para el set de Kaleb 🍸", quarter(120), 15, { location_kind: "pin", spot_id: null, pin_x: 46, pin_y: 56, pin_label: "Barra Central, lado cabina" }, "accepted", id(6001)),
  ];
  // Ajustes de privacidad: Melina muestra empresa y cargo solo después de una reunión; Valentina entra siempre incógnita.
  const privacy_settings: PrivacySettings[] = [
    { user_id: id(4), incognito_default: false, pin_share_matches: true, pro_details_after_meeting: true, updated_at: t(-60 * 24) },
    { user_id: id(9), incognito_default: true, pin_share_matches: false, pro_details_after_meeting: false, updated_at: t(-60 * 24) },
  ];

  const proStaff: EventStaff[] = (["manager", "bartender", "security"] as StaffRole[]).map((role) => ({
    event_id: proEvent.id,
    user_id: STAFF.find((m) => m.role === role)!.id,
    role,
    created_at: t(-60 * 24 * 5),
  }));

  return {
    version: STATE_VERSION,
    seeded_at: new Date(now).toISOString(),
    current_user_id: DEMO_IDS.me,
    active_event_id: event.id,
    profiles,
    profile_personas,
    privacy_settings,
    venue_spots,
    meetings,
    instagram_links,
    user_blocks,
    events: [event, proEvent],
    brands,
    brand_payment_accounts,
    event_staff: [...STAFF.map<EventStaff>((m) => ({ event_id: event.id, user_id: m.id, role: m.role, created_at: t(-60 * 24 * 5) })), ...proStaff],
    event_invite_codes: invite_codes,
    promoter_links,
    api_keys: [],
    event_attendees: [...attendees, ...proAttendees],
    event_bans: [],
    connections: [...connections, ...proConnections],
    squads: [...squads, proSquad],
    squad_members: [...squad_members, ...proMembers],
    map_pins,
    messages: [...messages, ...proMessages],
    event_blasts: [...event_blasts, ...proBlasts],
    user_perks_qrs: [...user_perks_qrs, ...proPerks],
    perk_rules,
    raffles,
    song_requests,
    bar_menu: BAR_MENU,
    // Demo: el menú del estado es el del evento activo (como en Supabase); los de los demás eventos esperan acá.
    bar_menu_event_id: event.id,
    demo_menus: { [proEvent.id]: CORPORATE_MENU },
    bar_orders,
    squad_expenses,
    squad_settlements: [],
    payout_aliases,
  };
}
